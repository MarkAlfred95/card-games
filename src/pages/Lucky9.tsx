import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LuArrowRight, LuArmchair, LuGlobe } from "react-icons/lu";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import { buildDeck, shuffle, deal } from "../game/deck";
import {
	handValue,
	natural,
	botWantsCard,
	settleRound,
	NATURAL_NAMES,
} from "../game/lucky9";
import type { Lucky9RoundResult } from "../game/lucky9";
import type { Card as CardModel } from "../game/types";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { speak, speakAfter, stopVoice } from "../voice";
import type { VoiceCue } from "../voice";
import { playSfx } from "../sfx";
import type { SfxKey } from "../sfx";
import { useAudioSettings } from "../audioPrefs";
import { useWallet, formatUSD, formatDelta, formatCompactUSD } from "../wallet";
import { DIVISIONS, divisionFor, divisionsUpTo } from "../divisions";
import type { Division } from "../divisions";
import {
	Header,
	GameShell,
	Lucky9Table,
	DrawPanel,
	BettingGate,
	SEATS,
	GAMES_PER_BANKER,
	TOTAL_GAMES,
	MIN_CHIP,
	COMEBACK_STAKE,
} from "../components/game/lucky-nine";

interface RoundState {
	hands: CardModel[][]; // 2–3 cards per seat
	stock: CardModel[]; // undealt cards, drawn from on hirit
}

type Phase = "setup" | "betting" | "draw" | "revealed" | "gameover";

const bankerOf = (gameIndex: number) =>
	Math.floor(gameIndex / GAMES_PER_BANKER);

// Random starting bankroll for a bot: biased toward the NEXT division's
// floor rather than the current one, so bots feel like they're already
// playing a tier up — a bot in Platinum (min $100K) rolls a bankroll near
// Diamond's $1M floor, not one hovering just above Platinum's own floor.
// $5,000–$25,000 in $500 steps, scaled by 10x the division's factor (each
// division's floor is 10x the last, so *10 lands on the next one's unit).
// Same spread as Pusoy Trese.
function botBalance(factor: number): number {
	const nextFactor = factor * 10;
	return (500 + Math.round(Math.random() * 40) * 50) * nextFactor;
}

// A bot's flat bet: a random ~2–8% slice of its bankroll, snapped to the
// division's smallest chip and capped at half the balance (a banker Lucky 9
// costs double, so half is the most a bot can risk without going negative).
// A broke bot falls back to the comeback stake so it can still win some back.
function botBet(balance: number, factor: number): number {
	const minChip = MIN_CHIP * factor;
	if (balance < minChip) return COMEBACK_STAKE * factor;
	const target = balance * (0.02 + Math.random() * 0.06);
	const bet = Math.round(target / minChip) * minChip;
	return Math.min(Math.max(bet, minChip), Math.max(minChip, balance / 2));
}

// Deal a fresh round: two cards to every seat, the rest becomes the draw stock.
function dealRound(): RoundState {
	const deck = shuffle(buildDeck());
	return { hands: deal(deck, SEATS, 2), stock: deck.slice(SEATS * 2) };
}

// Draw the top stock card into a seat's hand.
function drawCard(r: RoundState, seat: number): RoundState {
	return {
		hands: r.hands.map((h, s) => (s === seat ? [...h, r.stock[0]] : h)),
		stock: r.stock.slice(1),
	};
}

// Every non-banker bot makes its hirit decision. The banker draws last — after
// the human decides — so its choice isn't leaked during the draw phase.
function botDraws(r: RoundState, banker: number, humanSeat: number): RoundState {
	let cur = r;
	for (let s = 0; s < SEATS; s++) {
		if (s === humanSeat || s === banker) continue;
		if (botWantsCard(cur.hands[s])) cur = drawCard(cur, s);
	}
	return cur;
}

// The one event line worth calling out at reveal, if any: your Lucky 9, a
// Lucky 9 against you, then the lesser natural 8.
function revealEventCue(
	res: Lucky9RoundResult,
	humanSeat: number,
): VoiceCue | null {
	const banker = res.bankerSeat;
	if (res.naturals[humanSeat] === 9) return "luckyNine";
	if (humanSeat !== banker && res.naturals[banker] === 9)
		return "bankerLuckyNine";
	if (
		humanSeat === banker &&
		res.naturals.some((nat, s) => s !== banker && nat === 9)
	)
		return "luckyNineOpponent";
	if (res.naturals[humanSeat] === 8) return "naturalEight";
	return null;
}

export default function Lucky9() {
	const wallet = useWallet();
	const [theme, setTheme] = useState<ThemeKey>("neo");
	const [back, setBack] = useState<BackKey>("lattice");
	// Settings, module sync, persistence, and bg music in one hook; the result
	// spreads straight onto the Header.
	const audio = useAudioSettings();
	// Greet once on entry; stop any pending lines when leaving the page.
	useEffect(() => {
		speak("lucky9Welcome");
		return () => stopVoice();
	}, []);

	const [phase, setPhase] = useState<Phase>("setup");
	const [humanSeat, setHumanSeat] = useState<number>(0);
	const [gameIndex, setGameIndex] = useState<number>(0);
	const [botBalances, setBotBalances] = useState<number[]>([0, 0, 0, 0]);
	// Each seat's bankroll when the match began, for net-earnings standings.
	const [startBalances, setStartBalances] = useState<number[]>([0, 0, 0, 0]);

	const [round, setRound] = useState<RoundState>(() => dealRound());
	const [stakes, setStakes] = useState<number[]>([0, 0, 0, 0]);
	const [humanBet, setHumanBet] = useState<number>(0);
	// True once the human has stood or drawn this round (buttons lock while
	// the reveal is queued).
	const [decided, setDecided] = useState(false);
	const [result, setResult] = useState<Lucky9RoundResult | null>(null);

	// Chosen spending division. Locked for the duration of a match; on the
	// setup screen the player can switch to any division they can afford.
	const [division, setDivision] = useState<Division>(() =>
		divisionFor(wallet.balance),
	);
	const factor = division.factor;

	// While in the lobby, drop the selection back to the natural division if
	// the balance can no longer afford the one that was picked.
	useEffect(() => {
		if (phase === "setup" && wallet.balance < division.min)
			setDivision(divisionFor(wallet.balance));
	}, [phase, wallet.balance, division.min]);

	const { hands } = round;
	const banker = bankerOf(gameIndex);
	const humanIsBanker = humanSeat === banker;
	const myCards = hands[humanSeat];
	const myTotal = handValue(myCards);
	const myNatural = natural(myCards);

	// Per-seat display names: the human is "You", others "Bot 1..3".
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

	// Announce when a higher spending division unlocks (seen on the setup
	// screen). The first visit is recorded silently.
	const knownDivisions = useRef<number | null>(null);
	useEffect(() => {
		if (phase !== "setup") return;
		const n = divisionsUpTo(wallet.balance).length;
		if (knownDivisions.current !== null && n > knownDivisions.current)
			speakAfter("divisionUp");
		knownDivisions.current = n;
	}, [phase, wallet.balance]);

	// --- Match flow -----------------------------------------------------------

	function beginMatch(seat: number) {
		const bb = Array.from({ length: SEATS }, (_, s) =>
			s === seat ? 0 : botBalance(factor),
		);
		setBotBalances(bb);
		setStartBalances(bb.map((b, s) => (s === seat ? wallet.balance : b)));
		setHumanSeat(seat);
		setGameIndex(0);
		enterRound(0, seat, bb);
	}

	// Deal a game and decide whether the human must place a bet first.
	function enterRound(gi: number, seat: number, bb: number[]) {
		const bnk = bankerOf(gi);
		const r = dealRound();
		const humanBroke = wallet.balance < MIN_CHIP * factor;
		const st = Array.from({ length: SEATS }, (_, s) => {
			if (s === bnk) return 0;
			if (s === seat) return humanBroke ? COMEBACK_STAKE * factor : 0; // filled at bet time unless broke
			return botBet(bb[s], factor);
		});
		setStakes(st);
		setHumanBet(0);
		setDecided(false);
		setResult(null);
		// The banker doesn't bet; a broke player is auto-staked and skips the
		// chip tray. Both go straight to the draw (bots make their hirit calls).
		const straightToDraw = seat === bnk || humanBroke;
		setRound(straightToDraw ? botDraws(r, bnk, seat) : r);
		setPhase(straightToDraw ? "draw" : "betting");

		playSfx("card_shuffle");
		setTimeout(() => playSfx("card_deal"), 700);

		// Round-entry announcement: one milestone/banker line (or a plain
		// dealing line), then the phase prompt.
		const stintStart = gi % GAMES_PER_BANKER === 0;
		if (stintStart && gi > 0) playSfx("banker_crown");
		const cues: (VoiceCue | false)[] = [];
		if (gi === 0) cues.push("lucky9MatchStart");
		else if (gi === TOTAL_GAMES - 1) cues.push("finalGame");
		else if (gi === TOTAL_GAMES / 2) cues.push("halfway");
		if (seat === bnk && stintStart) cues.push("youAreBanker");
		else if (seat !== bnk && stintStart && gi > 0)
			cues.push("bankerRotates");
		else if (seat === bnk && gi % GAMES_PER_BANKER === GAMES_PER_BANKER - 1)
			cues.push("bankerWarning");
		if (!cues.length) cues.push("dealing");
		if (straightToDraw) {
			if (humanBroke && seat !== bnk) cues.push("comebackStake");
			cues.push("hiritOrStand");
		} else {
			cues.push("placeYourBet");
		}
		speak(...cues);
	}

	function placeBet() {
		setStakes((prev) =>
			prev.map((s, i) => (i === humanSeat ? humanBet : s)),
		);
		// Bets are down — the other players make their hirit calls now.
		setRound((prev) => botDraws(prev, banker, humanSeat));
		setPhase("draw");
		playSfx("chip_stack");
		speak(
			wallet.balance > 0 && humanBet >= wallet.balance * 0.25
				? "bigBet"
				: "betPlaced",
			"hiritOrStand",
		);
	}

	function onHirit() {
		playSfx("card_flip");
		speak("hirit");
		setDecided(true);
		const r = drawCard(round, humanSeat);
		setRound(r);
		// Let the drawn card land before the table flips over.
		setTimeout(() => finishRound(r), 1100);
	}

	function onStand() {
		playSfx("button_click");
		speak("standPat");
		setDecided(true);
		finishRound(round);
	}

	// Settle the round: the banker (acting last) makes its draw, hands flip,
	// money moves.
	function finishRound(r: RoundState) {
		let final = r;
		if (banker !== humanSeat && botWantsCard(final.hands[banker]))
			final = drawCard(final, banker);
		const res = settleRound(final.hands, banker, stakes);
		wallet.adjust(res.moneyDeltas[humanSeat]);
		setBotBalances((prev) =>
			prev.map((b, seat) =>
				seat === humanSeat ? b : b + res.moneyDeltas[seat],
			),
		);
		setRound(final);
		setResult(res);
		setPhase("revealed");

		// Cards flip immediately; the outcome stinger and chips lag a beat.
		const delta = res.moneyDeltas[humanSeat];
		const big = 10 * MIN_CHIP * factor;
		const event = revealEventCue(res, humanSeat);
		playSfx("card_flip");
		const stinger: SfxKey | null =
			event && event !== "naturalEight"
				? "natural_fanfare"
				: delta > 0
					? "win_jingle"
					: delta < 0
						? "lose_sting"
						: null;
		setTimeout(() => {
			if (stinger) playSfx(stinger);
			if (delta !== 0) playSfx("chip_slide");
		}, 450);

		// Reveal commentary queued behind the hirit/stand line: the standout
		// event (if any), the money verdict, and a broke warning.
		speakAfter(
			event,
			delta > 0
				? delta >= big
					? "roundWinBig"
					: "roundWin"
				: delta < 0
					? -delta >= big
						? "roundLossBig"
						: "roundLoss"
					: "roundPush",
			delta < 0 && wallet.balance + delta < MIN_CHIP * factor && "broke",
		);
	}

	function nextGame() {
		playSfx("button_click");
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
		playSfx("button_click");
		speak("playAgain");
	}

	// Final-standings announcement, layered with a profit line when the match
	// ended up money. Same net-earnings ranking as the game-over screen.
	useEffect(() => {
		if (phase !== "gameover") return;
		const earnings = balances.map((b, s) => b - startBalances[s]);
		const mine = earnings[humanSeat];
		const above = earnings.filter((e) => e > mine).length;
		playSfx(above === 0 ? "match_win_fanfare" : "match_end");
		speak(
			above === 0
				? "matchWin"
				: above === SEATS - 1
					? "matchLoss"
					: "matchMid",
			mine > 0 && "matchProfit",
		);
	}, [phase, balances, startBalances, humanSeat]);

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	// One Header element shared by every screen: GameShell keeps it mounted
	// (and pinned to the top) across phase changes.
	const header = (
		<Header
			title="Lucky 9"
			theme={theme}
			setTheme={setTheme}
			back={back}
			setBack={setBack}
			themeOptions={themeOptions}
			backOptions={backOptions}
			balance={wallet.balance}
			division={
				phase === "setup" ? undefined : formatCompactUSD(division.unit)
			}
			{...audio}
		/>
	);
	const shellClass = THEMES[theme].className;

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
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-2xl rounded-(--hud-radius) border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						{/* Online multiplayer entry */}
						<Link
							to="/games/lucky-nine/online"
							className="mb-5 flex items-center justify-between rounded-xl bg-sky-400/15 px-4 py-3 ring-1 ring-sky-400/40 transition hover:bg-sky-400/25"
						>
							<span className="flex items-center gap-2 text-sm font-semibold">
								<LuGlobe className="h-4 w-4 text-sky-300" />
								Play online with friends
							</span>
							<LuArrowRight className="h-4 w-4 opacity-70" />
						</Link>
						<div className="flex gap-3 items-center">
							<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-(--hud-radius) bg-black/20 ring-1 ring-white/10">
								<LuArmchair
									className="h-8 w-8"
									style={{ color: "var(--hud-accent)" }}
								/>
							</div>
							<div className="flex flex-col">
								<h2 className="font-display text-2xl font-semibold tracking-tight [.theme-neo_&]:text-lg [.theme-neo_&]:uppercase">
									Choose your seat
								</h2>
								<p className="mt-1 text-sm opacity-70 leading-tight">
									The banker rotates every {GAMES_PER_BANKER}{" "}
									games over {TOTAL_GAMES} games total. Pick
									the seat you want — it decides when you
									deal as banker.
								</p>
							</div>
						</div>

						{/* How-to-play primer */}
						<div className="mt-5 rounded-(--hud-radius-sm) bg-white/5 p-4 ring-1 ring-white/10">
							<h3 className="hud-label text-sm font-semibold uppercase tracking-wide opacity-80">
								How to play
							</h3>
							<p className="mt-1 text-sm opacity-70 leading-snug">
								Closest to nine beats the banker. Aces count 1,
								pip cards their face value, and 10s and face
								cards count 0 — only the last digit of your
								total matters. After betting you may{" "}
								<b>hirit</b> (draw) one extra card. A two-card
								9 is the <b>Lucky 9</b>: it beats every drawn
								hand and pays double.
							</p>
						</div>

						{/* Spending division selector */}
						<div className="mt-6">
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="hud-label text-sm font-semibold uppercase tracking-wide opacity-80">
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
									const locked = wallet.balance < d.min;
									const active = d.level === division.level;
									return (
										<button
											key={d.level}
											onClick={() =>
												!locked && setDivision(d)
											}
											disabled={locked}
											className={`rounded-(--hud-radius-sm) p-3 text-left transition ${
												active
													? ""
													: locked
														? "cursor-not-allowed bg-white/[0.03] opacity-50 ring-2 ring-white/10"
														: "bg-white/5 ring-2 ring-white/20 hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
											}`}
											style={
												active
													? {
															background:
																"color-mix(in srgb, var(--hud-accent) 15%, transparent)",
															boxShadow:
																"0 0 0 2px color-mix(in srgb, var(--hud-accent) 60%, transparent)",
														}
													: undefined
											}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-bold">
													{formatCompactUSD(d.unit)}{" "}
													· {d.name}
												</span>
												{active ? (
													<span
														className="rounded-(--hud-radius-sm) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
														style={{
															background:
																"var(--hud-accent)",
															color: "var(--hud-accent-ink)",
														}}
													>
														Selected
													</span>
												) : locked ? (
													<span className="rounded-(--hud-radius-sm) bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
														Reach{" "}
														{formatCompactUSD(
															d.min,
														)}
													</span>
												) : null}
											</div>
											<p className="mt-1 text-xs opacity-70">
												{divisionRange(d)} · chips{" "}
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
										className="group rounded-(--hud-radius-sm) bg-white/5 p-4 text-left ring-2 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
									>
										<div className="flex items-center justify-between">
											<span className="text-base font-bold">
												Seat {s + 1}
											</span>
											{s === 0 && (
												<span
													className="rounded-(--hud-radius-sm) px-3 py-1 text-[11px] font-bold uppercase tracking-wide"
													style={{
														background:
															"var(--hud-accent)",
														color: "var(--hud-accent-ink)",
													}}
												>
													Bank first
												</span>
											)}
										</div>
										<p className="mt-2 flex items-center gap-1.5 text-sm opacity-70">
											<FaCrown
												className="h-3.5 w-3.5"
												style={{
													color: "var(--hud-accent)",
												}}
											/>
											Banker for games {lo}–{hi}
										</p>
									</button>
								);
							})}
						</div>

						<p className="mt-5 text-sm opacity-70">
							Your balance:{" "}
							<b
								style={{
									color: `color-mix(in srgb, ${
										wallet.balance < 0
											? "var(--hud-negative)"
											: "var(--hud-positive)"
									} 65%, white)`,
								}}
							>
								{formatUSD(wallet.balance)}
							</b>
						</p>
						{wallet.balance < 5 && (
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
		// Rank by net earnings over the match, not final bankroll.
		const ranking = balances
			.map((bal, seat) => ({
				seat,
				bal,
				earnings: bal - startBalances[seat],
			}))
			.sort((a, b) => b.earnings - a.earnings);
		const youWon = ranking[0].seat === humanSeat;

		return (
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="relative p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-xl rounded-(--hud-radius) border border-white/10 bg-black/25 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<h2 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight [.theme-neo_&]:text-xl [.theme-neo_&]:uppercase">
							{youWon ? (
								<>
									<FaTrophy
										className="h-6 w-6"
										style={{ color: "var(--hud-accent)" }}
									/>
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
									className={`flex items-center justify-between rounded-(--hud-radius-sm) px-4 py-2.5 ${
										r.seat === humanSeat ? "" : "bg-black/20"
									}`}
									style={
										r.seat === humanSeat
											? {
													background:
														"color-mix(in srgb, var(--seat-you) 15%, transparent)",
													boxShadow:
														"0 0 0 1px color-mix(in srgb, var(--seat-you) 40%, transparent)",
												}
											: undefined
									}
								>
									<span className="font-semibold">
										{i + 1}. {names[r.seat]}
									</span>
									<span className="flex items-baseline gap-2">
										<span className="text-xs opacity-60 tabular-nums">
											{formatUSD(r.bal)}
										</span>
										<span
											className="font-bold tabular-nums"
											style={
												r.earnings !== 0
													? {
															color: `color-mix(in srgb, ${
																r.earnings > 0
																	? "var(--hud-positive)"
																	: "var(--hud-negative)"
															} 65%, white)`,
														}
													: undefined
											}
										>
											{formatDelta(r.earnings)}
										</span>
									</span>
								</div>
							))}
						</div>

						<button
							onClick={playAgain}
							className="hud-btn mt-6 flex w-full items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110"
							style={{
								background:
									"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
								color: "var(--hud-accent-ink)",
							}}
						>
							Play again <LuArrowRight className="h-4 w-4" />
						</button>
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Active game (betting / draw / revealed) --------------------------------

	return (
		<GameShell themeClass={shellClass} header={header}>
			<div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
				{/* Table-level notices */}
				{phase !== "betting" && humanIsBanker && (
					<div
						className="flex items-center gap-2 rounded-(--hud-radius-sm) px-4 py-2 text-sm font-medium"
						style={{
							background:
								"color-mix(in srgb, var(--hud-accent) 20%, transparent)",
							boxShadow:
								"0 0 0 1px color-mix(in srgb, var(--hud-accent) 40%, transparent)",
						}}
					>
						<FaCrown
							className="h-4 w-4 shrink-0"
							style={{ color: "var(--hud-accent)" }}
						/>
						<span>
							You are the banker this game — every player's bet
							rides against your hand.
						</span>
					</div>
				)}
				{phase !== "betting" &&
					!humanIsBanker &&
					wallet.balance < MIN_CHIP * factor && (
						<div
							className="rounded-(--hud-radius-sm) px-4 py-2 text-sm font-medium"
							style={{
								background:
									"color-mix(in srgb, var(--hud-negative) 18%, transparent)",
								boxShadow:
									"0 0 0 1px color-mix(in srgb, var(--hud-negative) 40%, transparent)",
							}}
						>
							💸 Out of money — you're auto-staked{" "}
							{formatUSD(COMEBACK_STAKE * factor)} this game to
							win some back.
						</div>
					)}
				{/* Oval felt table: seats around the rim, round info in the
				    center. Stays as the calm background while the betting /
				    draw panels float over the bottom. */}
				<Lucky9Table
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
					// Cards stay hidden until the bet is down — knowing your
					// total before betting would trivialize the bet.
					humanFaceUp={phase !== "betting"}
					values={result?.values}
					naturals={result?.naturals.map((n) =>
						n ? NATURAL_NAMES[n] : undefined,
					)}
					moneyDeltas={result?.moneyDeltas}
					isLast={gameIndex + 1 >= TOTAL_GAMES}
					onNext={nextGame}
				/>
			</div>
			{phase === "betting" ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<BettingGate
						banker={names[banker]}
						balance={wallet.balance}
						bet={humanBet}
						setBet={(v) => {
							playSfx(
								v > humanBet ? "chip_place" : "button_click",
							);
							setHumanBet(v);
						}}
						onPlace={placeBet}
						factor={factor}
					/>
				</div>
			) : phase === "draw" ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<DrawPanel
						cards={myCards}
						total={myTotal}
						natural={myNatural}
						isBanker={humanIsBanker}
						decided={decided}
						onHirit={onHirit}
						onStand={onStand}
						themeClass={shellClass}
					/>
				</div>
			) : null}
		</GameShell>
	);
}

// Soft ambient glows matching the home page; neutral tints so they sit well on
// any felt theme. Under the neo theme a faint blueprint grid + grain replace
// the casino mood lighting.
function AmbientGlow() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div className="absolute -top-40 left-1/2 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-3xl" />
			<div className="absolute -bottom-48 -right-32 h-[24rem] w-[34rem] rounded-full bg-amber-400/[0.06] blur-3xl [.theme-neo_&]:hidden" />
			<div
				className="neo-only absolute inset-0 opacity-40"
				style={{
					backgroundImage:
						"linear-gradient(to right, #3a322a33 1px, transparent 1px), linear-gradient(to bottom, #3a322a33 1px, transparent 1px)",
					backgroundSize: "84px 84px",
				}}
			/>
			<div className="neo-only neo-grain absolute inset-0" />
		</div>
	);
}
