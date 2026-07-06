import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LuChevronUp, LuArrowRight, LuArmchair, LuX } from "react-icons/lu";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import type {
	CollisionDetection,
	DragEndEvent,
	DragStartEvent,
} from "@dnd-kit/core";
import { buildDeck, shuffle, deal, RANKS } from "../game/deck";
import { evaluate, compareHands } from "../game/ranking";
import { scoreBanker } from "../game/scoring";
import { arrangeBot } from "../game/bot";
import type {
	Arrangement,
	BankerRoundResult,
	Card as CardModel,
} from "../game/types";
import Card from "../components/Card";
import DropZone from "../components/DropZone";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import type { CSSVars } from "../styleVars";
import { useWallet, formatUSD, formatCompactUSD } from "../wallet";
import { DIVISIONS, divisionFor, divisionsUpTo } from "../divisions";
import type { Division } from "../divisions";
import {
	Header,
	PokerTable,
	BettingGate,
	HandTypesMenu,
	SEATS,
	GAMES_PER_BANKER,
	TOTAL_GAMES,
	MIN_CHIP,
	COMEBACK_STAKE,
} from "../components/game/pusoy-trese";

interface Zones {
	hand: CardModel[];
	back: CardModel[];
	middle: CardModel[];
	front: CardModel[];
}
type ZoneId = keyof Zones;

interface RoundState {
	zones: Zones;
	hands: CardModel[][]; // 13 cards per seat (human seat's are also staged in zones)
}

type Phase =
	| "setup"
	| "betting"
	| "arranging"
	| "scoring"
	| "revealed"
	| "gameover";
type ResultData = BankerRoundResult & { arrangements: Arrangement[] };

const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i])) as Record<
	string,
	number
>;
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
const CAPACITY: Record<ZoneId, number> = {
	hand: 13,
	back: 5,
	middle: 5,
	front: 3,
};
const ZONE_IDS = new Set<string>(["hand", "back", "middle", "front"]);

// Prefer dropping onto a card (to swap) over the zone beneath it; fall back to
// the zone (to move into an empty slot), then to rect intersection.
const collisionDetection: CollisionDetection = (args) => {
	const pointer = pointerWithin(args);
	const onCard = pointer.find((c) => !ZONE_IDS.has(String(c.id)));
	if (onCard) return [onCard];
	if (pointer.length) return pointer;
	return rectIntersection(args);
};

function sortHand(cards: CardModel[]): CardModel[] {
	return [...cards].sort(
		(a, b) =>
			SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
			RANK_ORDER[b.rank] - RANK_ORDER[a.rank],
	);
}

const bankerOf = (gameIndex: number) =>
	Math.floor(gameIndex / GAMES_PER_BANKER);

// Random starting bankroll for a bot: $500–$2500 in $50 steps, scaled to the
// spending division's factor.
function botBalance(factor: number): number {
	return (500 + Math.round(Math.random() * 40) * 50) * factor;
}

// A bot's per-point stake scales with its bankroll (and therefore the division):
// a random ~0.5–1.5% slice of its balance, snapped to the division's smallest
// chip. A worst-case round swings ~24 points per opponent, so a stake near 1%
// keeps even a terrible round survivable instead of bankroll-ending. A broke
// bot falls back to the comeback stake so it can still win some back.
function botStake(balance: number, factor: number): number {
	const minChip = MIN_CHIP * factor;
	if (balance < minChip) return COMEBACK_STAKE * factor;
	const target = balance * (0.005 + Math.random() * 0.01); // 0.5–1.5% of bankroll
	const stake = Math.round(target / minChip) * minChip; // snap to chip step
	return Math.min(Math.max(stake, minChip), balance);
}

// Deal a fresh round. The human seat's 13 cards start randomly spread across the
// three rows (Back 5 / Middle 5 / Front 3, each sorted for readability) so the
// player rearranges by swapping rather than building from an empty board. Every
// seat's 13 cards are also returned (used to arrange the bots at scoring time).
function dealRound(humanSeat: number): RoundState {
	const hands = deal(shuffle(buildDeck()), SEATS, 13);
	const mine = shuffle(hands[humanSeat]);
	return {
		zones: {
			hand: [],
			back: sortHand(mine.slice(0, 5)),
			middle: sortHand(mine.slice(5, 10)),
			front: sortHand(mine.slice(10, 13)),
		},
		hands,
	};
}

export default function PusoyTrese() {
	const wallet = useWallet();
	const [theme, setTheme] = useState<ThemeKey>("classic");
	const [back, setBack] = useState<BackKey>("lattice");

	const [phase, setPhase] = useState<Phase>("setup");
	const [humanSeat, setHumanSeat] = useState<number>(0);
	const [gameIndex, setGameIndex] = useState<number>(0);
	const [botBalances, setBotBalances] = useState<number[]>([0, 0, 0, 0]);

	const [round, setRound] = useState<RoundState>(() => dealRound(0));
	const [stakes, setStakes] = useState<number[]>([0, 0, 0, 0]);
	const [humanStake, setHumanStake] = useState<number>(0);
	const [activeCard, setActiveCard] = useState<CardModel | null>(null);
	const [result, setResult] = useState<ResultData | null>(null);
	const [arrangeOpen, setArrangeOpen] = useState(true);

	// Chosen spending division. Locked for the duration of a match; on the setup
	// screen the player can switch to any division they can afford.
	const [division, setDivision] = useState<Division>(() =>
		divisionFor(wallet.balance),
	);
	const factor = division.factor;

	// While in the lobby, drop the selection back to the natural division if the
	// balance can no longer afford the one that was picked. Guarded to `setup` so
	// a mid-match balance swing never changes the locked division.
	useEffect(() => {
		if (phase === "setup" && wallet.balance < division.min)
			setDivision(divisionFor(wallet.balance));
	}, [phase, wallet.balance, division.min]);

	const { zones, hands } = round;
	const banker = bankerOf(gameIndex);
	const humanIsBanker = humanSeat === banker;

	// Per-seat display names: the human is "You", others "Bot 1..3" in seat order.
	const names = useMemo(() => {
		let k = 1;
		return Array.from({ length: SEATS }, (_, s) =>
			s === humanSeat ? "You" : `Bot ${k++}`,
		);
	}, [humanSeat]);

	// Balances by seat (human reads from the shared wallet).
	const balances = useMemo(
		() =>
			Array.from({ length: SEATS }, (_, s) =>
				s === humanSeat ? wallet.balance : botBalances[s],
			),
		[humanSeat, wallet.balance, botBalances],
	);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	// Evaluate each row once full; derive foul state progressively.
	const status = useMemo(() => {
		const ev = {
			back: zones.back.length === 5 ? evaluate(zones.back) : null,
			middle: zones.middle.length === 5 ? evaluate(zones.middle) : null,
			front: zones.front.length === 3 ? evaluate(zones.front) : null,
		};
		const foulBM =
			!!ev.back && !!ev.middle && compareHands(ev.back, ev.middle) < 0;
		const foulMF =
			!!ev.middle && !!ev.front && compareHands(ev.middle, ev.front) < 0;
		return {
			ev,
			foulBM,
			foulMF,
			isFoul: foulBM || foulMF,
			complete: Boolean(ev.back && ev.middle && ev.front),
		};
	}, [zones]);

	// --- Match flow -----------------------------------------------------------

	function beginMatch(seat: number) {
		const bb = Array.from({ length: SEATS }, (_, s) =>
			s === seat ? 0 : botBalance(factor),
		);
		setBotBalances(bb);
		setHumanSeat(seat);
		setGameIndex(0);
		enterRound(0, seat, bb);
	}

	// Deal a game and decide whether the human must place a bet first.
	function enterRound(gi: number, seat: number, bb: number[]) {
		const bnk = bankerOf(gi);
		const r = dealRound(seat);
		const humanBroke = wallet.balance < MIN_CHIP * factor;
		const st = Array.from({ length: SEATS }, (_, s) => {
			if (s === bnk) return 0;
			if (s === seat) return humanBroke ? COMEBACK_STAKE * factor : 0; // filled at bet time unless broke
			return botStake(bb[s], factor);
		});
		setRound(r);
		setStakes(st);
		setHumanStake(0);
		setResult(null);
		// Banker doesn't bet; a broke player is auto-staked and skips the chip tray.
		setPhase(seat === bnk || humanBroke ? "arranging" : "betting");
	}

	function placeBet() {
		setStakes((prev) =>
			prev.map((s, i) => (i === humanSeat ? humanStake : s)),
		);
		setPhase("arranging");
	}

	function handleScore() {
		setPhase("scoring");
		// Defer the heavy bot search so the "Scoring…" state paints first.
		setTimeout(() => {
			const arrangements: Arrangement[] = hands.map((hand, seat) =>
				seat === humanSeat
					? {
							back: zones.back,
							middle: zones.middle,
							front: zones.front,
						}
					: arrangeBot(hand),
			);
			// Table-stakes settlement: nobody can lose more than they have.
			const res = scoreBanker(arrangements, banker, stakes, {}, balances);
			wallet.adjust(res.moneyDeltas[humanSeat]);
			setBotBalances((prev) =>
				prev.map((b, seat) =>
					seat === humanSeat ? b : b + res.moneyDeltas[seat],
				),
			);
			setResult({ ...res, arrangements });
			setPhase("revealed");
		}, 20);
	}

	function nextGame() {
		const next = gameIndex + 1;
		if (next >= TOTAL_GAMES) {
			setPhase("gameover");
			return;
		}
		setGameIndex(next);
		enterRound(next, humanSeat, botBalances);
	}

	function playAgain() {
		setPhase("setup");
		setGameIndex(0);
		setResult(null);
	}

	// --- Drag handlers --------------------------------------------------------

	function handleDragStart({ active }: DragStartEvent) {
		const fromZone = active.data.current?.zone as ZoneId | undefined;
		const card = fromZone
			? zones[fromZone].find((c) => c.id === active.id)
			: undefined;
		setActiveCard(card ?? null);
	}

	function handleDragEnd({ active, over }: DragEndEvent) {
		setActiveCard(null);
		if (!over) return;
		const from = active.data.current?.zone as ZoneId | undefined;
		if (!from) return;
		const activeId = String(active.id);
		const droppedOnCard = over.data.current?.type === "card";

		setRound((prev) => {
			const z = prev.zones;

			// Dropped onto another card -> swap the two cards in place.
			if (droppedOnCard) {
				const targetId = String(over.id);
				if (targetId === activeId) return prev;
				const toZone = over.data.current?.zone as ZoneId;
				const ai = z[from].findIndex((c) => c.id === activeId);
				const bi = z[toZone].findIndex((c) => c.id === targetId);
				if (ai < 0 || bi < 0) return prev;
				if (from === toZone) {
					const arr = [...z[from]];
					[arr[ai], arr[bi]] = [arr[bi], arr[ai]];
					return { ...prev, zones: { ...z, [from]: arr } };
				}
				const fromArr = [...z[from]];
				const toArr = [...z[toZone]];
				[fromArr[ai], toArr[bi]] = [toArr[bi], fromArr[ai]];
				return {
					...prev,
					zones: { ...z, [from]: fromArr, [toZone]: toArr },
				};
			}

			// Dropped onto a zone's empty space -> move into it (if not full).
			const to = over.id as ZoneId;
			if (from === to) return prev;
			if (z[to].length >= CAPACITY[to]) return prev;
			const card = z[from].find((c) => c.id === activeId);
			if (!card) return prev;
			return {
				...prev,
				zones: {
					...z,
					[from]: z[from].filter((c) => c.id !== activeId),
					[to]: [...z[to], card],
				},
			};
		});
	}

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);

	const shellStyle = {} as CSSVars;
	const shellClass = `${THEMES[theme].className} min-h-screen text-[color:var(--ui-text)]`;
	const bgStyle = {
		background:
			"radial-gradient(ellipse at 50% 0%, var(--table-felt), var(--table-felt-2))",
	};

	// --- Setup screen ---------------------------------------------------------

	if (phase === "setup") {
		// Show every affordable division plus the next locked one, to tease
		// progression. Locked entries are disabled.
		const affordable = divisionsUpTo(wallet.balance);
		const shownDivisions = DIVISIONS.slice(
			0,
			Math.min(affordable.length + 1, DIVISIONS.length),
		);
		const divisionRange = (d: Division) => {
			if (d.level === 0) return `Under ${formatCompactUSD(10000)}`;
			const next = DIVISIONS[d.level + 1];
			return next
				? `${formatCompactUSD(d.min)} – ${formatCompactUSD(next.min)}`
				: `${formatCompactUSD(d.min)}+`;
		};

		return (
			<div className={shellClass} style={shellStyle}>
				<div
					className="relative w-full flex min-h-screen flex-col overflow-hidden"
					style={bgStyle}
				>
					<AmbientGlow />
					<div className="relative mx-auto w-full flex flex-col gap-6">
						<Header
							theme={theme}
							setTheme={setTheme}
							back={back}
							setBack={setBack}
							themeOptions={themeOptions}
							backOptions={backOptions}
							balance={wallet.balance}
						/>
						<div className="p-4">
							<motion.div
								initial={{ opacity: 0, y: 24 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.45, ease: "easeOut" }}
								className="mx-auto mt-6 w-full max-w-2xl rounded-2xl border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur"
							>
								<div className="flex gap-3 items-center">
									<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10">
										<LuArmchair className="h-8 w-8 text-amber-300" />
									</div>
									<div className="flex flex-col">
										<h2 className="font-display text-2xl font-semibold tracking-tight">
											Choose your seat
										</h2>
										<p className="mt-1 text-sm opacity-70 leading-tight">
											The banker rotates every{" "}
											{GAMES_PER_BANKER} games over{" "}
											{TOTAL_GAMES} games total. Pick the
											seat you want — it decides when you
											deal as banker.
										</p>
									</div>
								</div>

								{/* Spending division selector */}
								<div className="mt-6">
									<div className="flex items-baseline justify-between gap-2">
										<h3 className="text-sm font-semibold uppercase tracking-wide opacity-80">
											Spending division
										</h3>
										<span className="text-xs opacity-60">
											Stakes ×{factor} ·{" "}
											{formatCompactUSD(division.unit)}
										</span>
									</div>
									<p className="mt-1 text-xs opacity-60 leading-tight">
										Play at your level or drop to a lower one.
										Reach the next tier's balance to unlock it.
									</p>
									<div className="mt-3 flex flex-col sm:grid sm:grid-cols-2 gap-3">
										{shownDivisions.map((d) => {
											const locked =
												wallet.balance < d.min;
											const active =
												d.level === division.level;
											return (
												<button
													key={d.level}
													onClick={() =>
														!locked &&
														setDivision(d)
													}
													disabled={locked}
													className={`rounded-xl p-3 text-left ring-2 transition ${
														active
															? "bg-amber-400/15 ring-amber-400/60"
															: locked
																? "cursor-not-allowed bg-white/[0.03] opacity-50 ring-white/10"
																: "bg-white/5 ring-white/20 hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
													}`}
												>
													<div className="flex items-center justify-between gap-2">
														<span className="text-sm font-bold">
															{formatCompactUSD(
																d.unit,
															)}{" "}
															· {d.name}
														</span>
														{active ? (
															<span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
																Selected
															</span>
														) : locked ? (
															<span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
																Reach{" "}
																{formatCompactUSD(
																	d.min,
																)}
															</span>
														) : null}
													</div>
													<p className="mt-1 text-xs opacity-70">
														{divisionRange(d)} ·
														chips{" "}
														{formatCompactUSD(
															5 * d.factor,
														)}
														–
														{formatCompactUSD(
															1000 * d.factor,
														)}
													</p>
												</button>
											);
										})}
									</div>
								</div>

								<div className="mt-6 flex flex-col sm:grid sm:grid-cols-2 gap-4">
									{Array.from({ length: SEATS }, (_, s) => {
										const lo = s * GAMES_PER_BANKER + 1;
										const hi = lo + GAMES_PER_BANKER - 1;
										return (
											<button
												key={s}
												onClick={() => beginMatch(s)}
												className="group rounded-xl bg-white/5 p-4 text-left ring-2 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
											>
												<div className="flex items-center justify-between">
													<span className="text-base font-bold">
														Seat {s + 1}
													</span>
													{s === 0 && (
														<span className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-900">
															Bank first
														</span>
													)}
												</div>
												<p className="mt-2 flex items-center gap-1.5 text-sm opacity-70">
													<FaCrown className="h-3.5 w-3.5 text-amber-400" />
													Banker for games {lo}–{hi}
												</p>
											</button>
										);
									})}
								</div>

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
								{wallet.balance < 5 && (
									<button
										onClick={wallet.reset}
										className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
									>
										Reset wallet to {formatUSD(1000)}
									</button>
								)}
							</motion.div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	// --- Game-over screen -----------------------------------------------------

	if (phase === "gameover") {
		const ranking = balances
			.map((bal, seat) => ({ seat, bal }))
			.sort((a, b) => b.bal - a.bal);
		const youWon = ranking[0].seat === humanSeat;

		return (
			<div className={shellClass} style={shellStyle}>
				<div
					className="relative w-full flex min-h-screen flex-col gap-6 overflow-hidden"
					style={bgStyle}
				>
					<AmbientGlow />
					<Header
						theme={theme}
						setTheme={setTheme}
						back={back}
						setBack={setBack}
						themeOptions={themeOptions}
						backOptions={backOptions}
						balance={wallet.balance}
						division={formatCompactUSD(division.unit)}
					/>

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
								All {TOTAL_GAMES} games played. Final standings:
							</p>

							<div className="mt-4 space-y-2">
								{ranking.map((r, i) => (
									<div
										key={r.seat}
										className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
											r.seat === humanSeat
												? "bg-emerald-500/15 ring-1 ring-emerald-400/40"
												: "bg-black/20"
										}`}
									>
										<span className="font-semibold">
											{i + 1}. {names[r.seat]}
										</span>
										<span className="font-bold tabular-nums">
											{formatUSD(r.bal)}
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
				</div>
			</div>
		);
	}

	// --- Active game (betting / arranging / scoring / revealed) ----------------

	const statusBar = status.complete
		? status.isFoul
			? {
					text: status.foulBM
						? "Foul — middle is stronger than back"
						: "Foul — front is stronger than middle",
					tone: "bg-red-500/85 text-white",
				}
			: {
					text: "Legal arrangement ✓ — ready to score",
					tone: "bg-emerald-500/85 text-white",
				}
		: {
				text: `Place all 13 cards — ${zones.hand.length} left in hand`,
				tone: "bg-white/15",
			};

	// Per-row point chips for the reveal. Each row's margin is the head-to-head
	// comparison (+ royalty difference) summed across that seat's opponents:
	// the banker faces everyone, everyone else faces only the banker.
	const rowScores =
		phase === "revealed" && result
			? result.evals.map((_, seat) => {
					const opps =
						seat === banker
							? result.evals
									.map((_, i) => i)
									.filter((i) => i !== banker)
							: [banker];
					const margin = (pos: "front" | "middle" | "back") =>
						opps.reduce(
							(m, o) =>
								m +
								Math.sign(
									compareHands(
										result.evals[seat][pos],
										result.evals[o][pos],
									),
								) +
								(result.evals[seat].royalty[pos] -
									result.evals[o].royalty[pos]),
							0,
						);
					return {
						front: margin("front"),
						middle: margin("middle"),
						back: margin("back"),
					};
				})
			: undefined;

	return (
		<div className={shellClass} style={shellStyle}>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div
					className="w-full flex min-h-dvh flex-col overflow-x-clip"
					style={bgStyle}
				>
					<Header
						theme={theme}
						setTheme={setTheme}
						back={back}
						setBack={setBack}
						themeOptions={themeOptions}
						backOptions={backOptions}
						balance={wallet.balance}
						division={formatCompactUSD(division.unit)}
					/>

					<div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
						{/* Table-level notices */}
						{phase !== "betting" && humanIsBanker && (
							<div className="flex items-center gap-2 rounded-lg bg-amber-400/20 px-4 py-2 text-sm font-medium ring-1 ring-amber-400/40">
								<FaCrown className="h-4 w-4 shrink-0 text-amber-400" />
								<span>
									You are the banker this game — you play
									every other player at their stake.
								</span>
							</div>
						)}
						{phase !== "betting" &&
							!humanIsBanker &&
							wallet.balance < MIN_CHIP * factor && (
								<div className="rounded-lg bg-sky-400/20 px-4 py-2 text-sm font-medium ring-1 ring-sky-400/40">
									💸 Out of money — you're auto-staked{" "}
									{formatUSD(COMEBACK_STAKE * factor)}/pt this
									game to win some back.
								</div>
							)}
						{/* Oval felt table: seats around the rim, pot/round info
					    in the center. Stays as the calm background while the
					    betting / arrange panels float over the bottom. */}
						<PokerTable
							names={names}
							balances={balances}
							stakes={stakes}
							banker={banker}
							humanSeat={humanSeat}
							hands={hands}
							back={back}
							gameIndex={gameIndex}
							totalGames={TOTAL_GAMES}
							reveal={phase === "revealed"}
							arrangements={result?.arrangements}
							moneyDeltas={result?.moneyDeltas}
							foul={result?.foul}
							rowScores={rowScores}
							isLast={gameIndex + 1 >= TOTAL_GAMES}
							onNext={nextGame}
						/>
					</div>
					{phase === "betting" ? (
						<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
							<BettingGate
								banker={names[banker]}
								balance={wallet.balance}
								stake={humanStake}
								setStake={setHumanStake}
								onPlace={placeBet}
								factor={factor}
							/>
						</div>
					) : phase === "revealed" ? null : (
						<>
							{/* Arrangement — floats in a bottom sheet over the
							    table so the seats/opponents stay visible behind. */}
							{arrangeOpen ? (
								<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
									<div
										className="flex max-h-[82dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur"
										style={{
											backgroundColor:
												"color-mix(in srgb, var(--table-felt-2) 92%, black)",
										}}
									>
										{/* Sheet header: grab handle + collapse */}
										<div className="flex flex-col gap-2 border-b border-white/10 p-4">
											<div className="flex items-center justify-between">
												<span className="font-display text-lg font-semibold tracking-tight opacity-90">
													Arrange your hand
												</span>
												<div className="flex items-center gap-1.5">
													{/* Hand types reference */}
													<HandTypesMenu
														themeClass={
															THEMES[theme]
																.className
														}
													/>

													<button
														onClick={() =>
															setArrangeOpen(
																false,
															)
														}
														className="flex items-center rounded-lg bg-black/25 p-2 text-xs font-medium ring-1 ring-white/10 transition hover:bg-black/35"
													>
														<LuX className="h-4 w-4" />
													</button>
												</div>
											</div>
											{/* Status */}
											<div
												className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${statusBar.tone}`}
											>
												{statusBar.text}
											</div>
										</div>

										<div className="flex flex-col gap-4 overflow-y-auto p-4">
											{/* Arrangement zones: front (weakest) → back (strongest) */}
											<div className="grid gap-3">
												<DropZone
													id="front"
													label="Front"
													cards={zones.front}
													capacity={3}
													handName={
														status.ev.front?.name
													}
													status={
														status.foulMF
															? "foul"
															: null
													}
												/>
												<DropZone
													id="middle"
													label="Middle"
													cards={zones.middle}
													capacity={5}
													handName={
														status.ev.middle?.name
													}
													status={
														status.foulBM ||
														status.foulMF
															? "foul"
															: null
													}
												/>
												<DropZone
													id="back"
													label="Back"
													cards={zones.back}
													capacity={5}
													handName={
														status.ev.back?.name
													}
													status={
														status.foulBM
															? "foul"
															: null
													}
												/>
											</div>

											{/* Staging hand */}
											{/* <HandZone cards={zones.hand} /> */}
										</div>
										{/* Score Action */}
										<div className="w-full flex gap-2 justify-end sm:gap-3 px-4 pt-3 pb-4 border-t border-white/10">
											<button
												onClick={handleScore}
												disabled={
													!status.complete ||
													phase === "scoring"
												}
												className="w-full rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100 sm:w-auto cursor-pointer"
											>
												{phase === "scoring"
													? "Scoring…"
													: "Score hand"}
											</button>
										</div>
									</div>
								</div>
							) : (
								<button
									onClick={() => setArrangeOpen(true)}
									className="fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-t-2xl border-t border-white/15 px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur"
									style={{
										backgroundColor:
											"color-mix(in srgb, var(--table-felt-2) 92%, black)",
									}}
								>
									<LuChevronUp className="h-4 w-4" />
									Arrange your hand
									<span className="opacity-60">
										· {zones.hand.length} in hand
									</span>
								</button>
							)}
						</>
					)}
				</div>

				<DragOverlay>
					{activeCard ? (
						<Card
							rank={activeCard.rank}
							suit={activeCard.suit}
							className="rotate-3 shadow-xl"
						/>
					) : null}
				</DragOverlay>
			</DndContext>
		</div>
	);
}

// Soft ambient glows matching the home page; neutral tints so they sit well on
// any felt theme.
function AmbientGlow() {
	return (
		<div aria-hidden className="pointer-events-none absolute inset-0">
			<div className="absolute -top-40 left-1/2 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-3xl" />
			<div className="absolute -bottom-48 -right-32 h-[24rem] w-[34rem] rounded-full bg-amber-400/[0.06] blur-3xl" />
		</div>
	);
}
