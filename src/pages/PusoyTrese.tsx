import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
	DndContext,
	DragOverlay,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useDroppable,
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
import DraggableCard from "../components/DraggableCard";
import DropZone from "../components/DropZone";
import ResultsPanel from "../components/ResultsPanel";
import ChipTray from "../components/ChipTray";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import type { CSSVars } from "../styleVars";
import { useWallet, formatUSD } from "../wallet";
import HandTypes from "../components/HandTypes";

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

const SEATS = 4;
const GAMES_PER_BANKER = 3;
const TOTAL_GAMES = SEATS * GAMES_PER_BANKER; // 12

// A player is "out of money" once they can't afford the smallest chip ($5).
// Instead of staking $0 (no way to recover), they're auto-staked this much per
// point so they still have a chance to win some back.
const MIN_CHIP = 5;
const COMEBACK_STAKE = 50;

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

// Random starting bankroll for a bot: $500–$2500 in $50 steps.
function botBalance(): number {
	return 500 + Math.round(Math.random() * 40) * 50;
}

// A bot picks a per-point stake it can afford. If it's out of money, it gets the
// comeback stake so it can still win some back.
function botStake(balance: number): number {
	if (balance < MIN_CHIP) return COMEBACK_STAKE;
	const denoms = [5, 10, 50, 100].filter((d) => d <= balance);
	return denoms[Math.floor(Math.random() * denoms.length)];
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
	const [showHandTypes, setShowHandTypes] = useState(false);
	const [arrangeOpen, setArrangeOpen] = useState(true);

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
			s === seat ? 0 : botBalance(),
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
		const humanBroke = wallet.balance < MIN_CHIP;
		const st = Array.from({ length: SEATS }, (_, s) => {
			if (s === bnk) return 0;
			if (s === seat) return humanBroke ? COMEBACK_STAKE : 0; // filled at bet time unless broke
			return botStake(bb[s]);
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
			const res = scoreBanker(arrangements, banker, stakes);
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
		return (
			<div className={shellClass} style={shellStyle}>
				<div
					className="flex min-h-screen flex-col gap-6 p-6"
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
					/>

					<div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-black/25 p-6 ring-1 ring-white/10">
						<h2 className="text-xl font-semibold">
							Choose your seat
						</h2>
						<p className="mt-1 text-sm opacity-70">
							The banker rotates every {GAMES_PER_BANKER} games
							over {TOTAL_GAMES} games total. Pick the seat you
							want — it decides when you deal as banker.
						</p>

						<div className="mt-5 grid grid-cols-2 gap-3">
							{Array.from({ length: SEATS }, (_, s) => {
								const lo = s * GAMES_PER_BANKER + 1;
								const hi = lo + GAMES_PER_BANKER - 1;
								return (
									<button
										key={s}
										onClick={() => beginMatch(s)}
										className="group rounded-xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/30"
									>
										<div className="flex items-center justify-between">
											<span className="text-base font-bold">
												Seat {s + 1}
											</span>
											{s === 0 && (
												<span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
													Bank first
												</span>
											)}
										</div>
										<p className="mt-1 text-sm opacity-70">
											👑 Banker for games {lo}–{hi}
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
					className="flex min-h-screen flex-col gap-6 p-6"
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
					/>

					<div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-black/25 p-6 ring-1 ring-white/10">
						<h2 className="text-2xl font-bold">
							{youWon ? "🏆 You finished on top!" : "Game over"}
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
							className="mt-6 w-full rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
						>
							Play again →
						</button>
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

	return (
		<div className={shellClass} style={shellStyle}>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div
					className="flex min-h-screen flex-col gap-4 p-4 sm:p-6"
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
					/>

					{/* Table-level notices */}
					{phase !== "betting" && humanIsBanker && (
						<div className="rounded-lg bg-amber-400/20 px-4 py-2 text-sm font-medium ring-1 ring-amber-400/40">
							👑 You are the banker this game — you play every
							other player at their stake.
						</div>
					)}
					{phase !== "betting" &&
						!humanIsBanker &&
						wallet.balance < MIN_CHIP && (
							<div className="rounded-lg bg-sky-400/20 px-4 py-2 text-sm font-medium ring-1 ring-sky-400/40">
								💸 Out of money — you're auto-staked{" "}
								{formatUSD(COMEBACK_STAKE)}/pt this game to win
								some back.
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
					/>

					{phase === "betting" ? (
						<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
							<BettingGate
								banker={names[banker]}
								balance={wallet.balance}
								stake={humanStake}
								setStake={setHumanStake}
								onPlace={placeBet}
							/>
						</div>
					) : (
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
										<div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
											<span className="text-sm font-semibold opacity-80">
												Arrange your hand
											</span>
											<button
												onClick={() =>
													setArrangeOpen(false)
												}
												className="flex items-center gap-1.5 rounded-lg bg-black/25 px-3 py-1.5 text-xs font-medium ring-1 ring-white/10 transition hover:bg-black/35"
											>
												<span>▼</span> Hide
											</button>
										</div>

										<div className="flex flex-col gap-4 overflow-y-auto p-4">
											{/* Status + score action */}
											<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
												<div
													className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${statusBar.tone}`}
												>
													{statusBar.text}
												</div>
												<button
													onClick={handleScore}
													disabled={
														!status.complete ||
														phase === "scoring"
													}
													className="w-full rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
												>
													{phase === "scoring"
														? "Scoring…"
														: "Score hand"}
												</button>
											</div>

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
											<HandZone cards={zones.hand} />

											{/* Hand types reference */}
											<button
												onClick={() =>
													setShowHandTypes((v) => !v)
												}
												aria-expanded={showHandTypes}
												className="flex w-full items-center justify-center gap-2 rounded-lg bg-black/25 px-4 py-2.5 text-sm font-medium ring-1 ring-white/10 transition hover:bg-black/35"
											>
												<span
													className="inline-block text-xs transition-transform"
													style={{
														transform: showHandTypes
															? "rotate(180deg)"
															: "rotate(0deg)",
													}}
												>
													▼
												</span>
												<span>Hand Types Guide</span>
											</button>
											{showHandTypes && (
												<HandTypes open={showHandTypes} />
											)}
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
									<span>▲</span>
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

			{phase === "revealed" && result && (
				<ResultsPanel
					result={result}
					names={names}
					balances={balances}
					bankerSeat={banker}
					humanSeat={humanSeat}
					gameIndex={gameIndex}
					totalGames={TOTAL_GAMES}
					onNext={nextGame}
				/>
			)}
		</div>
	);
}

interface BettingGateProps {
	banker: string;
	balance: number;
	stake: number;
	setStake: (v: number) => void;
	onPlace: () => void;
}

interface PokerTableProps {
	names: string[];
	balances: number[];
	stakes: number[];
	banker: number;
	humanSeat: number;
	hands: CardModel[][];
	back: BackKey;
	gameIndex: number;
	totalGames: number;
}

// One avatar/info plaque for a player around the table. Opponents also show a
// small fanned stack of face-down cards above the plaque.
function Seat({
	name,
	balance,
	stake,
	isBanker,
	isYou,
	hand,
	back,
}: {
	name: string;
	balance: number;
	stake: number;
	isBanker: boolean;
	isYou: boolean;
	hand?: CardModel[];
	back: BackKey;
}) {
	return (
		<div className="flex flex-col items-center gap-1.5">
			{hand && (
				<div className="flex" style={{ "--card-w": "1.5rem" } as CSSVars}>
					{hand.slice(0, 5).map((c, j) => (
						<div
							key={c.id}
							style={{
								marginLeft:
									j === 0
										? 0
										: "calc(var(--card-w) * -0.55)",
							}}
						>
							<Card faceDown back={back} />
						</div>
					))}
				</div>
			)}
			<div
				className={`min-w-24 rounded-xl px-3 py-1.5 text-center shadow-lg ring-1 backdrop-blur ${
					isYou
						? "bg-emerald-500/25 ring-emerald-400/50"
						: "bg-black/40 ring-white/15"
				}`}
			>
				<div className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
					{isBanker && <span title="Banker">👑</span>}
					<span>{isYou ? "You" : name}</span>
				</div>
				<div className="tabular-nums text-xs opacity-90">
					{formatUSD(balance)}
				</div>
				<div className="text-[10px] opacity-60">
					{isBanker ? "banking" : `stake ${formatUSD(stake)}`}
				</div>
			</div>
		</div>
	);
}

function PokerTable({
	names,
	balances,
	stakes,
	banker,
	humanSeat,
	hands,
	back,
	gameIndex,
	totalGames,
}: PokerTableProps) {
	// Opponents in seat order; placed top / left / right around the rim.
	const opponents = names
		.map((_, s) => s)
		.filter((s) => s !== humanSeat);
	const slots = [
		"top-[2%] left-1/2 -translate-x-1/2",
		"top-[32%] left-[2%]",
		"top-[32%] right-[2%]",
	];

	return (
		<div className="relative mx-auto my-1 w-full max-w-2xl flex-1 min-h-[56vh]">
			{/* Felt oval with a dark wooden rim */}
			<div
				className="absolute inset-0 rounded-[46%] border-[6px] border-black/40 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
				style={{
					background:
						"radial-gradient(ellipse at 50% 38%, var(--table-felt), var(--table-felt-2))",
				}}
			/>

			{/* Center pot / round info */}
			<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
				<div className="text-3xl font-bold tabular-nums opacity-90">
					{gameIndex + 1}
					<span className="opacity-50"> / {totalGames}</span>
				</div>
				<div className="mt-1 text-xs opacity-70">
					👑 Banker:{" "}
					<b>{banker === humanSeat ? "You" : names[banker]}</b>
				</div>
			</div>

			{/* Opponent seats around the rim */}
			{opponents.map((s, i) => (
				<div key={s} className={`absolute ${slots[i]}`}>
					<Seat
						name={names[s]}
						balance={balances[s]}
						stake={stakes[s]}
						isBanker={s === banker}
						isYou={false}
						hand={hands[s]}
						back={back}
					/>
				</div>
			))}

			{/* Your seat at the bottom (lifted clear of the bottom panel) */}
			<div className="absolute bottom-[9%] left-1/2 -translate-x-1/2">
				<Seat
					name={names[humanSeat]}
					balance={balances[humanSeat]}
					stake={stakes[humanSeat]}
					isBanker={humanSeat === banker}
					isYou={true}
					back={back}
				/>
			</div>
		</div>
	);
}

function BettingGate({
	banker,
	balance,
	stake,
	setStake,
	onPlace,
}: BettingGateProps) {
	return (
		<div
			className="mx-auto w-full max-w-md rounded-2xl p-5 shadow-2xl ring-1 ring-white/15"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 94%, black)",
			}}
		>
			<h2 className="text-lg font-semibold">Place your stake</h2>
			<p className="mt-1 text-sm opacity-70">
				👑 {banker} is the banker. Pick chips for your per-point stake —
				you win or lose that much for every point you beat or trail the
				banker by.
			</p>
			<div className="mt-4">
				<ChipTray balance={balance} value={stake} onChange={setStake} />
			</div>
			<button
				onClick={onPlace}
				disabled={stake < MIN_CHIP}
				className="mt-4 w-full rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{stake < MIN_CHIP
					? "Add at least one chip"
					: `Stake ${formatUSD(stake)}/pt → see cards`}
			</button>
		</div>
	);
}

function HandZone({ cards }: { cards: CardModel[] }) {
	const { setNodeRef, isOver } = useDroppable({ id: "hand" });
	return (
		<div
			ref={setNodeRef}
			className={`mt-auto rounded-xl border p-3 transition-colors ${
				isOver
					? "border-white/60 bg-white/10"
					: "border-white/15 bg-black/15"
			}`}
		>
			<p className="mb-2 text-sm opacity-70">
				Holding area — drag a card here to set it aside, or swap cards
				by dropping one onto another
			</p>
			<div className="flex min-h-[2rem] flex-wrap gap-2">
				{cards.map((card) => (
					<DraggableCard key={card.id} card={card} zone="hand" />
				))}
			</div>
		</div>
	);
}

interface HeaderProps {
	theme: ThemeKey;
	setTheme: (t: ThemeKey) => void;
	back: BackKey;
	setBack: (b: BackKey) => void;
	themeOptions: [ThemeKey, string][];
	backOptions: [BackKey, string][];
	balance: number;
}

function Header({
	theme,
	setTheme,
	back,
	setBack,
	themeOptions,
	backOptions,
	balance,
}: HeaderProps) {
	return (
		<header className="flex flex-wrap items-center gap-x-8 gap-y-4">
			<div className="flex items-center gap-3">
				<Link
					to="/"
					className="rounded-lg bg-black/20 px-3 py-1.5 text-sm font-medium transition hover:bg-black/30"
					title="Back to games"
				>
					← Games
				</Link>
				<h1 className="text-xl font-semibold tracking-tight">
					Pusoy Trese
				</h1>
			</div>
			<div className="mr-auto rounded-lg bg-black/25 px-4 py-1.5 text-sm">
				<span className="opacity-60">Balance</span>{" "}
				<b
					className={`tabular-nums ${balance < 0 ? "text-red-300" : "text-emerald-300"}`}
				>
					{formatUSD(balance)}
				</b>
			</div>
			<SettingsMenu>
				<Picker
					label="Theme"
					options={themeOptions}
					value={theme}
					onChange={setTheme}
				/>
				<Picker
					label="Card back"
					options={backOptions}
					value={back}
					onChange={setBack}
				/>
			</SettingsMenu>
		</header>
	);
}

function SettingsMenu({ children }: { children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent) {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		}
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div ref={ref} className="relative">
			<button
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="true"
				aria-expanded={open}
				title="Settings"
				className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
					open
						? "bg-white/90 text-slate-900"
						: "bg-black/20 text-white/80 hover:bg-black/30"
				}`}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-4 w-4"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
				Settings
			</button>
			{open && (
				<div
					className="absolute right-0 top-full z-20 mt-2 flex flex-col gap-4 rounded-xl border p-4 shadow-xl backdrop-blur"
					style={{
						backgroundColor:
							"color-mix(in srgb, var(--table-felt-2) 92%, black)",
						borderColor:
							"color-mix(in srgb, var(--ui-text) 18%, transparent)",
						color: "var(--ui-text)",
					}}
				>
					{children}
				</div>
			)}
		</div>
	);
}

interface PickerProps<T extends string> {
	label: string;
	options: [T, string][];
	value: T;
	onChange: (value: T) => void;
}

function Picker<T extends string>({
	label,
	options,
	value,
	onChange,
}: PickerProps<T>) {
	return (
		<div className="flex items-center gap-2">
			<span className="text-sm opacity-70">{label}</span>
			<div className="flex gap-1 rounded-lg bg-black/20 p-1">
				{options.map(([key, text]) => (
					<button
						key={key}
						onClick={() => onChange(key)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
							value === key
								? "bg-white/90 text-slate-900"
								: "text-white/80 hover:bg-white/10"
						}`}
					>
						{text}
					</button>
				))}
			</div>
		</div>
	);
}
