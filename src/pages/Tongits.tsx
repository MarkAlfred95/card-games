import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LuArrowRight, LuFlag, LuSwords, LuX } from "react-icons/lu";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import {
	TONGITS_RANK_ORDER,
	bestArrangement,
	canCallDraw,
	createRound,
	discardCard,
	drawFromStock,
	extendMeld,
	handPoints,
	layMeld,
	meldTypeOf,
	meldsWithCard,
	resolveFight,
	resolveStockout,
	sapaw,
	takeFromDiscard,
	topDiscard,
} from "../game/tongits";
import type { TongitsState } from "../game/tongits";
import { decideAct, decideDraw, decideFight } from "../game/tongitsBot";
import type { Card as CardModel } from "../game/types";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { speak, speakAfter, stopVoice } from "../voice";
import { playSfx } from "../sfx";
import { useAudioSettings } from "../audioPrefs";
import { useWallet, formatUSD, formatDelta, formatCompactUSD } from "../wallet";
import { Header, GameShell } from "../components/game/pusoy-trese";
import {
	TongitsTable,
	HandFan,
	SEATS,
	TOTAL_ROUNDS,
	BET_OPTIONS,
} from "../components/game/tongits";
import type { SortMode } from "../components/game/tongits";

const HUMAN = 0;

type Phase = "setup" | "playing" | "gameover";

interface Toast {
	id: number;
	text: string;
	tone: "error" | "info" | "success";
}

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };

// Shared styling for the big action-bar buttons.
const ACTION_BTN =
	"flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-6 sm:text-sm";

// Random starting bankroll for a bot: $500–$2500 in $50 steps (same spread
// as the other games).
function botBalance(): number {
	return 500 + Math.round(Math.random() * 40) * 50;
}

const byRank = (a: CardModel, b: CardModel) =>
	TONGITS_RANK_ORDER[a.rank] - TONGITS_RANK_ORDER[b.rank] ||
	SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];

// Display order for the hand per sort mode. "Auto" groups the best meld
// arrangement first (each meld contiguous), deadwood last, high points first.
function sortForDisplay(hand: CardModel[], mode: SortMode): CardModel[] {
	switch (mode) {
		case "rank-asc":
			return [...hand].sort(byRank);
		case "rank-desc":
			return [...hand].sort((a, b) => byRank(b, a));
		case "suit":
			return [...hand].sort(
				(a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || byRank(a, b),
			);
		case "auto": {
			const arranged = bestArrangement(hand);
			return [
				...arranged.melds.flat(),
				...[...arranged.deadwood].sort((a, b) => byRank(b, a)),
			];
		}
	}
}

export default function Tongits() {
	const wallet = useWallet();
	const [theme, setTheme] = useState<ThemeKey>("classic");
	const [back, setBack] = useState<BackKey>("lattice");
	const audio = useAudioSettings();
	useEffect(() => {
		speak("welcome");
		return () => stopVoice();
	}, []);

	const [phase, setPhase] = useState<Phase>("setup");
	const [bet, setBet] = useState<number>(BET_OPTIONS[2]);
	const [round, setRound] = useState(1);
	const [game, setGame] = useState<TongitsState | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [sortMode, setSortMode] = useState<SortMode>("auto");
	const [botBalances, setBotBalances] = useState<number[]>([0, 0, 0]);
	const [startBalances, setStartBalances] = useState<number[]>([0, 0, 0]);
	const [toasts, setToasts] = useState<Toast[]>([]);
	// Seat of the bot that called Draw and is waiting on the human's choice.
	const [fightPrompt, setFightPrompt] = useState<number | null>(null);
	const [dealKey, setDealKey] = useState(0);
	const appliedResult = useRef(false);
	const toastSeq = useRef(0);

	const names = useMemo(() => ["You", "Bot 1", "Bot 2"], []);
	const balances = useMemo(
		() => [wallet.balance, botBalances[1], botBalances[2]],
		[wallet.balance, botBalances],
	);

	function toast(text: string, tone: Toast["tone"] = "error") {
		const id = ++toastSeq.current;
		setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
		setTimeout(
			() => setToasts((prev) => prev.filter((t) => t.id !== id)),
			2800,
		);
	}

	// Run an engine action; rule violations surface as a toast + buzzer.
	function tryAction(fn: () => TongitsState): boolean {
		try {
			setGame(fn());
			return true;
		} catch (e) {
			toast((e as Error).message);
			playSfx("foul_buzzer");
			return false;
		}
	}

	// --- Derived state --------------------------------------------------------

	const hand = useMemo(
		() => game?.players[HUMAN].hand ?? [],
		[game],
	);
	const displayHand = useMemo(
		() => sortForDisplay(hand, sortMode),
		[hand, sortMode],
	);
	const selCards = useMemo(
		() => hand.filter((c) => selected.has(c.id)),
		[hand, selected],
	);
	const reveal = Boolean(game?.result);
	const isHumanTurn =
		phase === "playing" && !!game && !game.result && game.turn === HUMAN;
	const canDrawNow = isHumanTurn && game!.phase === "draw" && fightPrompt === null;
	const canActNow = isHumanTurn && game!.phase === "act" && fightPrompt === null;
	const meldValid = selCards.length >= 3 && meldTypeOf(selCards) !== null;

	// Exposed melds the current selection could legally extend (sapaw targets).
	const sapawTargets = useMemo(() => {
		if (!canActNow || !game || selCards.length === 0)
			return new Set<number>();
		return new Set(
			game.players
				.flatMap((p) => p.melds)
				.filter((m) => extendMeld(m, selCards) !== null)
				.map((m) => m.id),
		);
	}, [canActNow, game, selCards]);

	// Whether the top discard can be taken: the selection completes a meld with
	// it, or some hand subset does (auto-pick).
	const discardTakeIds = useMemo(() => {
		if (!canDrawNow || !game) return null;
		const top = topDiscard(game);
		if (!top) return null;
		if (selCards.length >= 2 && meldTypeOf([...selCards, top]))
			return selCards.map((c) => c.id);
		const options = meldsWithCard(hand, top);
		if (!options.length) return null;
		let best = options[0];
		let bestValue = Infinity;
		for (const opt of options) {
			const used = new Set(opt.map((c) => c.id));
			const value = bestArrangement(
				hand.filter((c) => !used.has(c.id)),
			).value;
			if (value < bestValue) {
				bestValue = value;
				best = opt;
			}
		}
		return best.map((c) => c.id);
	}, [canDrawNow, game, hand, selCards]);

	const drawCallable = !!game && canCallDraw(game, HUMAN) && fightPrompt === null;

	// --- Match flow -------------------------------------------------------------

	function startRound(r: number) {
		setGame(createRound((r - 1) % SEATS, bet));
		setSelected(new Set());
		setFightPrompt(null);
		appliedResult.current = false;
		setDealKey((k) => k + 1);
		playSfx("card_shuffle");
		setTimeout(() => playSfx("card_deal"), 600);
		speak(
			r === 1 ? "matchStart" : r === TOTAL_ROUNDS ? "finalGame" : "dealing",
		);
	}

	function beginMatch() {
		playSfx("button_click");
		const bb = [0, botBalance(), botBalance()];
		setBotBalances(bb);
		setStartBalances([wallet.balance, bb[1], bb[2]]);
		setRound(1);
		setPhase("playing");
		startRound(1);
	}

	function nextRound() {
		playSfx("button_click");
		if (round >= TOTAL_ROUNDS) {
			setPhase("gameover");
			return;
		}
		setRound(round + 1);
		startRound(round + 1);
	}

	function playAgain() {
		setPhase("setup");
		setGame(null);
		setRound(1);
		playSfx("button_click");
		speak("playAgain");
	}

	// --- Human actions ------------------------------------------------------------

	function toggleSelect(id: string) {
		if (!game || game.result) return;
		playSfx("card_pick");
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	function doDrawStock() {
		if (!game || !canDrawNow) return;
		if (tryAction(() => drawFromStock(game))) playSfx("card_flip");
	}

	function doTakeDiscard() {
		if (!game || !canDrawNow) return;
		if (!discardTakeIds) {
			toast("The top discard must complete a set or run with your cards");
			playSfx("foul_buzzer");
			return;
		}
		if (tryAction(() => takeFromDiscard(game, discardTakeIds))) {
			playSfx("card_swap");
			setSelected(new Set());
			toast("Discard taken — meld exposed", "success");
		}
	}

	function doMeld() {
		if (!game || !canActNow) return;
		if (
			tryAction(() =>
				layMeld(
					game,
					selCards.map((c) => c.id),
				),
			)
		) {
			playSfx("card_drop");
			setSelected(new Set());
		}
	}

	function doSapaw(meldId?: number) {
		if (!game || !canActNow) return;
		const target = meldId ?? [...sapawTargets][0];
		if (target === undefined) {
			toast("Selected cards don’t extend any exposed meld");
			playSfx("foul_buzzer");
			return;
		}
		if (
			tryAction(() =>
				sapaw(
					game,
					target,
					selCards.map((c) => c.id),
				),
			)
		) {
			playSfx("card_swap");
			setSelected(new Set());
		}
	}

	function doDiscard() {
		if (!game || !canActNow) return;
		if (selCards.length !== 1) {
			toast("Select exactly one card to discard");
			playSfx("foul_buzzer");
			return;
		}
		if (tryAction(() => discardCard(game, selCards[0].id))) {
			playSfx("card_deal");
			setSelected(new Set());
		}
	}

	// Build every seat's challenge choice and resolve the fight.
	function resolveFightWith(caller: number, humanFights: boolean) {
		if (!game) return;
		const fights = Array.from({ length: SEATS }, (_, s) =>
			s === caller
				? true
				: s === HUMAN
					? humanFights
					: decideFight(game, s),
		);
		setFightPrompt(null);
		tryAction(() => resolveFight(game, fights));
	}

	function doCallDraw() {
		if (!game || !drawCallable) return;
		playSfx("banker_crown");
		resolveFightWith(HUMAN, true);
	}

	// --- Bot turns ------------------------------------------------------------
	// One engine action per tick so each move animates separately, mirroring
	// the Poker page's bot loop.

	useEffect(() => {
		if (
			phase !== "playing" ||
			!game ||
			game.result ||
			game.turn === HUMAN ||
			fightPrompt !== null
		)
			return;
		const seat = game.turn;
		const t = setTimeout(
			() => {
				try {
					if (game.phase === "draw") {
						const d = decideDraw(game, seat);
						if (d.type === "callDraw") {
							playSfx("banker_crown");
							if (game.players[HUMAN].melds.length > 0) {
								setFightPrompt(seat);
							} else {
								toast(
									`${names[seat]} calls Draw — with no exposed meld, you fold`,
									"info",
								);
								resolveFightWith(seat, false);
							}
						} else if (d.type === "takeDiscard") {
							playSfx("card_swap");
							setGame(takeFromDiscard(game, d.cardIds));
						} else {
							playSfx("card_flip");
							setGame(drawFromStock(game));
						}
					} else {
						const a = decideAct(game, seat);
						if (a.type === "meld") {
							playSfx("card_drop");
							setGame(layMeld(game, a.cardIds));
						} else if (a.type === "sapaw") {
							playSfx("card_swap");
							setGame(sapaw(game, a.meldId, a.cardIds));
						} else {
							playSfx("card_deal");
							setGame(discardCard(game, a.cardId));
						}
					}
				} catch {
					// Safety net: if bot logic errors, keep the game moving with
					// the simplest legal action.
					try {
						setGame(
							game.phase === "draw"
								? drawFromStock(game)
								: discardCard(
										game,
										game.players[seat].hand[0].id,
									),
						);
					} catch {
						setGame(resolveStockout(game));
					}
				}
			},
			650 + Math.random() * 550,
		);
		return () => clearTimeout(t);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [game, phase, fightPrompt]);

	// --- Round settlement -------------------------------------------------------

	useEffect(() => {
		if (!game?.result || appliedResult.current) return;
		appliedResult.current = true;
		const res = game.result;
		wallet.adjust(res.moneyDeltas[HUMAN]);
		setBotBalances((prev) =>
			prev.map((b, s) => (s === HUMAN ? b : b + res.moneyDeltas[s])),
		);
		const delta = res.moneyDeltas[HUMAN];
		playSfx("card_flip");
		setTimeout(() => {
			playSfx(
				res.winner === HUMAN
					? res.kind === "tongits"
						? "natural_fanfare"
						: "win_jingle"
					: "lose_sting",
			);
			if (delta !== 0) playSfx("chip_slide");
		}, 450);
		speakAfter(
			delta > 0
				? delta >= bet * 4
					? "roundWinBig"
					: "roundWin"
				: delta < 0
					? -delta >= bet * 4
						? "roundLossBig"
						: "roundLoss"
					: "roundPush",
			delta < 0 && wallet.balance + delta < BET_OPTIONS[0] && "broke",
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [game]);

	// Final-standings announcement, mirroring Pusoy Trese.
	useEffect(() => {
		if (phase !== "gameover") return;
		const earnings = balances.map((b, s) => b - startBalances[s]);
		const mine = earnings[HUMAN];
		const above = earnings.filter((e) => e > mine).length;
		playSfx(above === 0 ? "match_win_fanfare" : "match_end");
		speak(
			above === 0 ? "matchWin" : above === SEATS - 1 ? "matchLoss" : "matchMid",
			mine > 0 && "matchProfit",
		);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [phase]);

	// --- Shell ------------------------------------------------------------------

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	const header = (
		<Header
			title="Tongits"
			theme={theme}
			setTheme={setTheme}
			back={back}
			setBack={setBack}
			themeOptions={themeOptions}
			backOptions={backOptions}
			balance={wallet.balance}
			division={phase === "setup" ? undefined : formatCompactUSD(bet)}
			{...audio}
		/>
	);
	const shellClass = THEMES[theme].className;

	// --- Setup screen -------------------------------------------------------------

	if (phase === "setup") {
		return (
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-2xl rounded-2xl border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<div className="flex items-center gap-3">
							<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10">
								<LuSwords className="h-8 w-8 text-amber-300" />
							</div>
							<div className="flex flex-col">
								<h2 className="font-display text-2xl font-semibold tracking-tight">
									Tongits
								</h2>
								<p className="mt-1 text-sm leading-tight opacity-70">
									Form sets and runs, sapaw the table, and be
									the first to empty your hand. {TOTAL_ROUNDS}{" "}
									rounds, dealer rotates every round.
								</p>
							</div>
						</div>

						{/* Stake selector */}
						<div className="mt-6">
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="text-sm font-semibold uppercase tracking-wide opacity-80">
									Stake per round
								</h3>
								<span className="text-xs opacity-60">
									Losers pay 1–3× the stake
								</span>
							</div>
							<p className="mt-1 text-xs leading-tight opacity-60">
								Base stake to the winner; doubled if you're
								burned (no exposed meld), against a Tongits, or
								after losing a Draw you chose to fight.
							</p>
							<div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
								{BET_OPTIONS.map((b) => {
									const locked = wallet.balance < b;
									const active = bet === b;
									return (
										<button
											key={b}
											onClick={() => {
												if (locked) return;
												playSfx("chip_place");
												setBet(b);
											}}
											disabled={locked}
											className={`rounded-xl px-2 py-2.5 text-sm font-bold tabular-nums ring-2 transition ${
												active
													? "bg-amber-400/15 ring-amber-400/60"
													: locked
														? "cursor-not-allowed bg-white/[0.03] opacity-40 ring-white/10"
														: "bg-white/5 ring-white/20 hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
											}`}
										>
											{formatUSD(b)}
										</button>
									);
								})}
							</div>
						</div>

						{/* How a round works */}
						<div className="mt-6 grid gap-2 text-sm opacity-80 sm:grid-cols-3">
							{[
								[
									"1 · Draw",
									"From the stock — or grab the discard if it completes a meld.",
								],
								[
									"2 · Meld & sapaw",
									"Lay sets (3–4 of a kind) and runs (3+ suited in a row); add onto any exposed meld.",
								],
								[
									"3 · Discard",
									"End your turn with one discard. Empty your hand for TONGITS!",
								],
							].map(([t, d]) => (
								<div
									key={t}
									className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10"
								>
									<div className="text-xs font-bold uppercase tracking-wide text-amber-300">
										{t}
									</div>
									<p className="mt-1 text-xs leading-snug opacity-80">
										{d}
									</p>
								</div>
							))}
						</div>

						<button
							onClick={beginMatch}
							disabled={wallet.balance < bet}
							className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
						>
							Start match <LuArrowRight className="h-4 w-4" />
						</button>

						<p className="mt-5 text-sm opacity-70">
							Your balance:{" "}
							<b
								className={
									wallet.balance < 0
										? "text-red-300"
										: "text-emerald-300"
								}
							>
								{formatUSD(wallet.balance)}
							</b>
						</p>
						{wallet.balance < BET_OPTIONS[0] && (
							<button
								onClick={() => {
									wallet.reset();
									speak("walletReset");
								}}
								className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
							>
								Reset wallet to {formatUSD(1000)}
							</button>
						)}
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Game-over screen -----------------------------------------------------

	if (phase === "gameover") {
		const ranking = balances
			.map((bal, seat) => ({
				seat,
				bal,
				earnings: bal - startBalances[seat],
			}))
			.sort((a, b) => b.earnings - a.earnings);
		const youWon = ranking[0].seat === HUMAN;

		return (
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="relative p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-black/25 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<h2 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight">
							{youWon ? (
								<>
									<FaTrophy className="h-6 w-6 text-amber-400" />
									You finished on top!
								</>
							) : (
								"Game over"
							)}
						</h2>
						<p className="mt-1 text-sm opacity-70">
							All {TOTAL_ROUNDS} rounds played. Final standings:
						</p>

						<div className="mt-4 space-y-2">
							{ranking.map((r, i) => (
								<div
									key={r.seat}
									className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
										r.seat === HUMAN
											? "bg-emerald-500/15 ring-1 ring-emerald-400/40"
											: "bg-black/20"
									}`}
								>
									<span className="font-semibold">
										{i + 1}. {names[r.seat]}
									</span>
									<span className="flex items-baseline gap-2">
										<span className="text-xs tabular-nums opacity-60">
											{formatUSD(r.bal)}
										</span>
										<span
											className={`font-bold tabular-nums ${
												r.earnings > 0
													? "text-emerald-300"
													: r.earnings < 0
														? "text-red-300"
														: ""
											}`}
										>
											{formatDelta(r.earnings)}
										</span>
									</span>
								</div>
							))}
						</div>

						<button
							onClick={playAgain}
							className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110"
						>
							Play again <LuArrowRight className="h-4 w-4" />
						</button>
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Active round -----------------------------------------------------------

	if (!game) return null;
	const res = game.result;
	const humanWon = reveal && res?.winner === HUMAN;

	// Reveal headline (action bar) / turn hint (action bar) — reference layout
	// keeps the instruction line inside the bottom bar.
	const headline = res
		? res.kind === "tongits"
			? `🎉 ${names[res.winner]} ${res.winner === HUMAN ? "win" : "wins"} by TONGITS!`
			: res.kind === "stockout"
				? `Stock empty — ${names[res.winner]} ${res.winner === HUMAN ? "win" : "wins"} the count with ${res.points[res.winner]} pts`
				: `${names[res.caller ?? res.winner]} called Draw — ${names[res.winner]} ${res.winner === HUMAN ? "win" : "wins"} with ${res.points[res.winner]} pts`
		: null;
	const hint = !isHumanTurn
		? `${names[game.turn]} is playing…`
		: game.phase === "draw"
			? drawCallable
				? "Your turn — draw a card, take a matching discard, or call Draw"
				: "Draw a card from the Draw Pile, then meld or add to melds, then discard 1 card"
			: game.turnCount === 0 && game.dealer === HUMAN
				? "You deal — lay melds if you can, then discard one card"
				: "Lay melds or sapaw the table, then discard one card";

	return (
		<GameShell themeClass={shellClass} header={header}>
			<div className="flex flex-1 flex-col p-2 sm:p-4">
				{/* The table frame: felt + wooden rim wrapping the board, your
				    hand, and the action bar (reference layout). */}
				<div
					className="mx-auto flex w-full max-w-7xl flex-1 flex-col rounded-[1.75rem] border-[6px] border-black/40 p-3 pt-4 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:rounded-[3rem] sm:border-8 sm:p-5"
					style={{
						background:
							"radial-gradient(ellipse at 50% 30%, var(--table-felt), var(--table-felt-2))",
					}}
				>
					<TongitsTable
						state={game}
						names={names}
						balances={balances}
						back={back}
						round={round}
						totalRounds={TOTAL_ROUNDS}
						dealKey={dealKey}
						reveal={reveal}
						sapawTargets={sapawTargets}
						onMeldClick={(id) => doSapaw(id)}
						canDrawStock={canDrawNow && game.stock.length > 0}
						canTakeDiscard={canDrawNow && discardTakeIds !== null}
						onDrawStock={doDrawStock}
						onTakeDiscard={doTakeDiscard}
						sortMode={sortMode}
						onSortChange={(m) => {
							playSfx("button_click");
							setSortMode(m);
						}}
					/>

					{/* You: avatar panel + big hand row */}
					<div className="mt-4 flex flex-col items-center gap-2 lg:flex-row lg:items-center lg:gap-4">
						<motion.div
							animate={{
								boxShadow: humanWon
									? [
											"0 0 0 2px #facc15, 0 0 16px #facc1599",
											"0 0 0 2px #facc15, 0 0 30px #facc15cc",
											"0 0 0 2px #facc15, 0 0 16px #facc1599",
										]
									: isHumanTurn
										? "0 0 0 2px rgba(255,255,255,0.65), 0 0 16px rgba(255,255,255,0.3)"
										: "0 0 0 1px rgba(255,255,255,0.2)",
							}}
							transition={
								humanWon
									? { duration: 1, repeat: Infinity }
									: { duration: 0.25 }
							}
							className="flex shrink-0 items-center gap-3 rounded-2xl px-4 py-2.5 backdrop-blur"
							style={{
								backgroundColor:
									"color-mix(in srgb, var(--seat-you) 22%, transparent)",
							}}
						>
							<div className="relative h-12 w-12 shrink-0">
								<div className="grid h-full w-full place-items-center rounded-full border border-white/15 bg-black/40 text-2xl">
									😎
								</div>
								{game.dealer === HUMAN && (
									<span
										className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400"
										title="Dealer"
									>
										<FaCrown className="h-3 w-3 text-slate-900" />
									</span>
								)}
							</div>
							<div className="text-left leading-tight">
								<div className="flex items-center gap-1.5 text-sm font-semibold">
									You
									{humanWon && (
										<FaTrophy className="h-3.5 w-3.5 text-amber-400" />
									)}
									{reveal &&
										res?.burned[HUMAN] &&
										!humanWon && (
											<span className="rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase tracking-wide">
												Burned
											</span>
										)}
								</div>
								<div className="text-xs tabular-nums opacity-85">
									{formatUSD(wallet.balance)}
								</div>
								<div className="text-[11px] tabular-nums opacity-90">
									{hand.length} cards · deadwood{" "}
									<b className="text-amber-300">
										{reveal
											? res?.points[HUMAN]
											: handPoints(hand)}
									</b>
									{reveal && (
										<b
											className={`ml-1.5 ${
												(res?.moneyDeltas[HUMAN] ??
													0) > 0
													? "text-emerald-300"
													: (res?.moneyDeltas[
																HUMAN
															] ?? 0) < 0
														? "text-red-300"
														: "opacity-60"
											}`}
										>
											{formatDelta(
												res?.moneyDeltas[HUMAN] ?? 0,
											)}
										</b>
									)}
								</div>
							</div>
						</motion.div>

						<div className="min-w-0 flex-1">
							{hand.length > 0 && (
								<HandFan
									cards={displayHand}
									selected={selected}
									onToggle={toggleSelect}
									onPlayMeld={() =>
										canActNow && meldValid && doMeld()
									}
									dealKey={dealKey}
								/>
							)}
						</div>

						{/* Mirrors the avatar panel so the hand stays centered */}
						<div className="hidden w-44 shrink-0 lg:block" />
					</div>

					{/* Action bar */}
					<div className="mt-3 border-t border-white/10 pt-3">
						{res ? (
							<div className="flex flex-col items-center gap-2 py-1">
								<div className="text-center text-sm font-bold text-amber-300">
									{headline}
								</div>
								<button
									onClick={nextRound}
									style={{
										animation:
											"popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both",
									}}
									className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300"
								>
									{round >= TOTAL_ROUNDS
										? "Final standings"
										: "Next round"}
									<LuArrowRight className="h-4 w-4" />
								</button>
							</div>
						) : (
							<div className="flex flex-col items-center gap-2.5">
								<p
									className={`text-center text-xs font-medium sm:text-sm ${
										isHumanTurn
											? "text-emerald-300"
											: "opacity-60"
									}`}
								>
									{hint}
								</p>
								<div className="flex flex-wrap items-center justify-center gap-2">
									{/* Compact sort controls (the left rail
									    covers lg and up) */}
									<div className="flex gap-1 rounded-lg bg-black/20 p-1 text-xs lg:hidden">
										{(
											[
												["auto", "Auto"],
												["rank-asc", "Rank ↑"],
												["rank-desc", "Rank ↓"],
												["suit", "Suits"],
											] as [SortMode, string][]
										).map(([k, label]) => (
											<button
												key={k}
												onClick={() => {
													playSfx("button_click");
													setSortMode(k);
												}}
												className={`rounded-md px-2.5 py-1.5 font-medium transition ${
													sortMode === k
														? "bg-white/90 text-slate-900"
														: "text-white/80 hover:bg-white/10"
												}`}
											>
												{label}
											</button>
										))}
									</div>

									{selected.size > 0 && (
										<button
											onClick={() => {
												playSfx("button_click");
												setSelected(new Set());
											}}
											className="flex items-center gap-1 rounded-lg bg-black/25 px-3 py-2.5 text-xs font-medium ring-1 ring-white/10 transition hover:bg-black/35"
										>
											<LuX className="h-3.5 w-3.5" />{" "}
											Clear ({selected.size})
										</button>
									)}

									<button
										onClick={doDrawStock}
										disabled={
											!canDrawNow ||
											game.stock.length === 0
										}
										className={`${ACTION_BTN} bg-violet-400/25 ring-1 ring-violet-400/60 hover:bg-violet-400/40`}
									>
										Draw
									</button>
									<button
										onClick={doMeld}
										disabled={!canActNow || !meldValid}
										className={`${ACTION_BTN} bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:hover:brightness-100`}
									>
										Meld
									</button>
									<button
										onClick={() => doSapaw()}
										disabled={
											!canActNow ||
											sapawTargets.size === 0
										}
										className={`${ACTION_BTN} bg-sky-400/20 ring-1 ring-sky-400/50 hover:bg-sky-400/30`}
									>
										Sapaw
									</button>
									<button
										onClick={doDiscard}
										disabled={
											!canActNow ||
											selCards.length !== 1
										}
										className={`${ACTION_BTN} bg-red-400/20 ring-1 ring-red-400/50 hover:bg-red-400/30`}
									>
										Discard
									</button>
									<button
										onClick={doCallDraw}
										disabled={!drawCallable}
										className={`${ACTION_BTN} bg-white/10 ring-1 ring-white/30 hover:bg-white/20`}
									>
										<LuFlag className="h-3.5 w-3.5" /> Call
										Draw
									</button>
								</div>
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Fight prompt: a bot called Draw */}
			<AnimatePresence>
				{fightPrompt !== null && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
					>
						<motion.div
							initial={{ scale: 0.88, y: 16 }}
							animate={{ scale: 1, y: 0 }}
							transition={{
								type: "spring",
								stiffness: 280,
								damping: 22,
							}}
							className="w-full max-w-sm rounded-2xl border border-white/15 bg-black/85 p-6 text-center shadow-2xl"
						>
							<LuSwords className="mx-auto h-8 w-8 text-purple-300" />
							<h3 className="font-display mt-2 text-2xl font-semibold tracking-tight">
								{names[fightPrompt]} calls a Draw!
							</h3>
							<p className="mt-2 text-sm opacity-70">
								Fight and the lowest count wins — but losing a
								fight costs double. Fold to risk only the base
								stake.
							</p>
							<p className="mt-2 text-sm">
								Your hand:{" "}
								<b className="tabular-nums">
									{handPoints(hand)} pts
								</b>
							</p>
							<div className="mt-4 flex gap-2">
								<button
									onClick={() => {
										playSfx("button_click");
										resolveFightWith(fightPrompt, false);
									}}
									className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20"
								>
									Fold
								</button>
								<button
									onClick={() => {
										playSfx("chip_stack");
										resolveFightWith(fightPrompt, true);
									}}
									className="flex-1 rounded-xl bg-gradient-to-b from-purple-300 to-purple-500 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:brightness-110"
								>
									Fight!
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Toasts */}
			<div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
				<AnimatePresence>
					{toasts.map((t) => (
						<motion.div
							key={t.id}
							initial={{ opacity: 0, y: 16, scale: 0.9 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 8, scale: 0.95 }}
							className={`rounded-xl px-4 py-2.5 text-sm font-semibold shadow-2xl ring-1 backdrop-blur ${
								t.tone === "error"
									? "bg-red-500/90 text-white ring-red-300/40"
									: t.tone === "success"
										? "bg-emerald-500/90 text-white ring-emerald-300/40"
										: "bg-black/80 text-white ring-white/20"
							}`}
						>
							{t.text}
						</motion.div>
					))}
				</AnimatePresence>
			</div>
		</GameShell>
	);
}

// Soft ambient glows matching the other game setup screens.
function AmbientGlow() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div className="absolute -top-40 left-1/2 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-3xl" />
			<div className="absolute -bottom-48 -right-32 h-[24rem] w-[34rem] rounded-full bg-amber-400/[0.06] blur-3xl" />
		</div>
	);
}
