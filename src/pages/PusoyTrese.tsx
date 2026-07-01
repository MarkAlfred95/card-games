import { useMemo, useState } from "react";
import {
	LuChevronDown,
	LuChevronUp,
	LuArrowRight,
	LuArmchair,
} from "react-icons/lu";
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
import { useWallet, formatUSD } from "../wallet";
import HandTypes from "../components/HandTypes";
import {
	Header,
	PokerTable,
	BettingGate,
	HandZone,
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
					className="w-full flex min-h-screen flex-col"
					style={bgStyle}
				>
					<div className="mx-auto w-full flex flex-col gap-6">
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
							<div className="mx-auto mt-6 w-full max-w-2xl rounded-2xl bg-black/35 p-6 ring-1 ring-white/10">
								<div className="flex gap-3 items-center">
									<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10">
										<LuArmchair className="h-8 w-8 text-amber-300" />
									</div>
									<div className="flex flex-col">
										<h2 className="text-xl font-semibold">
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

								<div className="mt-5 flex flex-col sm:grid sm:grid-cols-2 gap-4">
									{Array.from({ length: SEATS }, (_, s) => {
										const lo = s * GAMES_PER_BANKER + 1;
										const hi = lo + GAMES_PER_BANKER - 1;
										return (
											<button
												key={s}
												onClick={() => beginMatch(s)}
												className="group rounded-lg bg-white/5 p-4 text-left ring-2 ring-white/25 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
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
							</div>
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
					className="w-full flex min-h-screen flex-col gap-6"
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

					<div className="p-4">
						<div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-black/25 p-6 ring-1 ring-white/10">
						<h2 className="flex items-center gap-2 text-2xl font-bold">
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
							className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
						>
							Play again <LuArrowRight className="h-4 w-4" />
						</button>
					</div>
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
					className="w-full flex min-h-dvh flex-col"
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

					<div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
						{/* Table-level notices */}
					{phase !== "betting" && humanIsBanker && (
						<div className="flex items-center gap-2 rounded-lg bg-amber-400/20 px-4 py-2 text-sm font-medium ring-1 ring-amber-400/40">
							<FaCrown className="h-4 w-4 shrink-0 text-amber-400" />
							<span>
								You are the banker this game — you play every
								other player at their stake.
							</span>
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
						reveal={phase === "revealed"}
						arrangements={result?.arrangements}
						moneyDeltas={result?.moneyDeltas}
						foul={result?.foul}
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
												<LuChevronDown className="h-4 w-4" />{" "}
												Hide
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
												<LuChevronDown
													className="h-4 w-4 transition-transform"
													style={{
														transform: showHandTypes
															? "rotate(180deg)"
															: "rotate(0deg)",
													}}
												/>
												<span>Hand Types Guide</span>
											</button>
											{showHandTypes && (
												<HandTypes
													open={showHandTypes}
												/>
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
