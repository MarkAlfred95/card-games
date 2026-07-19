import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
	LuArrowRight,
	LuChevronUp,
	LuCopy,
	LuFlag,
	LuGlobe,
	LuSwords,
	LuUsers,
	LuX,
} from "react-icons/lu";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import { buildDeck } from "../game/deck";
import {
	TONGITS_RANK_ORDER,
	bestArrangement,
	extendMeld,
	handPoints,
	meldTypeOf,
	meldsWithCard,
	topDiscard,
} from "../game/tongits";
import type { Meld, TongitsResult, TongitsState } from "../game/tongits";
import type { Card as CardModel, Rank, Suit } from "../game/types";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { formatUSD, formatDelta } from "../wallet";
import { useAudioSettings } from "../audioPrefs";
import { speak, speakAfter, stopVoice } from "../voice";
import { playSfx } from "../sfx";
import { Header, GameShell } from "../components/game/pusoy-trese";
import {
	TongitsTable,
	HandFan,
	SEATS,
	BET_OPTIONS,
	ONLINE_START_BALANCE,
} from "../components/game/tongits";
import type { SortMode } from "../components/game/tongits";

// --- Server view types (mirrors server/tongits.ts viewFor) --------------------

interface SeatMeldView {
	id: number;
	type: Meld["type"];
	owner: number;
	cards: string[];
}

interface SeatView {
	seat: number;
	name: string | null;
	isBot: boolean;
	balance: number;
	cardCount: number;
	melds: SeatMeldView[];
	drawBlocked: boolean;
	deadwood: number | null;
}

interface GameView {
	dealer: number;
	turn: number;
	turnPhase: "draw" | "act";
	turnCount: number;
	stockCount: number;
	discard: string[];
	yourHand: string[];
	canCallDraw: boolean;
	result: (TongitsResult & { hands: string[][] }) | null;
}

interface RoomView {
	code: string;
	phase: "lobby" | "playing" | "revealed" | "gameover";
	closed: boolean;
	round: number;
	totalRounds: number;
	bet: number;
	youSeat: number;
	isHost: boolean;
	startBalance: number;
	seats: SeatView[];
	game: GameView | null;
	fight: {
		caller: number;
		yourVote: boolean | null;
		waitingOn: number[];
	} | null;
}

interface Session {
	code: string;
	playerId: string;
}

// --- Small API client --------------------------------------------------------

async function api<T>(path: string, body?: object): Promise<T> {
	const res = await fetch(
		`/api/tongits/${path}`,
		body
			? {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(body),
				}
			: undefined,
	);
	const data = await res.json();
	if (!res.ok) throw new Error(data.error ?? "Request failed");
	return data as T;
}

const SESSION_KEY = "tongits-online-session";
const NAME_KEY = "card-hub-player-name";
const POLL_MS = 2000;

// --- Card helpers -------------------------------------------------------------

function cardFromId(id: string): CardModel {
	return { id, rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit };
}

// Face-down fans/stacks just need the right number of cards; the real ones
// stay secret on the server. Same trick as the other online pages.
const DUMMY_CARDS: CardModel[] = buildDeck().slice(0, 16);

const ACTION_BTN =
	"flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 sm:px-6 sm:text-sm";

const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };

const byRank = (a: CardModel, b: CardModel) =>
	TONGITS_RANK_ORDER[a.rank] - TONGITS_RANK_ORDER[b.rank] ||
	SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];

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
		// Online keeps preset sorting only; "custom" (solo drag order) never
		// reaches here, but the union includes it.
		case "custom":
			return [...hand];
	}
}

// Rebuild an engine-shaped state from the filtered server view, ROTATED so
// the local player is always seat 0 (bottom of the table). Hidden hands are
// dummy face-down cards of the right count; melds and discards are real.
function stateFromView(view: RoomView): TongitsState | null {
	const g = view.game;
	if (!g) return null;
	const you = view.youSeat;
	const fromDisp = (d: number) => (d + you + SEATS) % SEATS;
	const toDisp = (s: number) => (s - you + SEATS) % SEATS;
	const res = g.result;

	const rotate = <T,>(arr: T[]): T[] =>
		Array.from({ length: SEATS }, (_, d) => arr[fromDisp(d)]);

	return {
		players: Array.from({ length: SEATS }, (_, d) => {
			const s = fromDisp(d);
			const sv = view.seats[s];
			const hand =
				d === 0
					? g.yourHand.map(cardFromId)
					: res
						? res.hands[s].map(cardFromId)
						: DUMMY_CARDS.slice(0, sv.cardCount);
			return {
				hand,
				melds: sv.melds.map((m) => ({
					id: m.id,
					type: m.type,
					owner: toDisp(m.owner),
					cards: m.cards.map(cardFromId),
				})),
				drawBlocked: sv.drawBlocked,
			};
		}),
		stock: DUMMY_CARDS.slice(0, Math.min(g.stockCount, DUMMY_CARDS.length)),
		discard: g.discard.map(cardFromId),
		dealer: toDisp(g.dealer),
		turn: toDisp(g.turn),
		phase: g.turnPhase,
		turnCount: g.turnCount,
		bet: view.bet,
		meldSeq: 0,
		result: res
			? {
					kind: res.kind,
					winner: toDisp(res.winner),
					caller: res.caller !== undefined ? toDisp(res.caller) : undefined,
					fought: res.fought ? rotate(res.fought) : undefined,
					points: rotate(res.points),
					burned: rotate(res.burned),
					moneyDeltas: rotate(res.moneyDeltas),
				}
			: null,
	};
}

export default function TongitsOnline() {
	const [theme, setTheme] = useState<ThemeKey>("neo");
	const [back, setBack] = useState<BackKey>("lattice");
	const audio = useAudioSettings();
	useEffect(() => {
		speak("welcome");
		return () => stopVoice();
	}, []);

	const [name, setName] = useState(
		() => localStorage.getItem(NAME_KEY) ?? "",
	);
	const [joinCode, setJoinCode] = useState("");
	const [createBet, setCreateBet] = useState<number>(BET_OPTIONS[2]);
	const [session, setSession] = useState<Session | null>(() => {
		try {
			return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
		} catch {
			return null;
		}
	});
	const [view, setView] = useState<RoomView | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [confirmClose, setConfirmClose] = useState(false);

	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [sortMode, setSortMode] = useState<SortMode>("auto");
	const [dealKey, setDealKey] = useState(0);

	// Below lg the hand + actions float as a collapsible bottom sheet (Pusoy
	// Trese-style) so the board never needs scrolling to reach the piles.
	const [handOpen, setHandOpen] = useState(true);
	const [isDesktop, setIsDesktop] = useState(
		() => window.matchMedia("(min-width: 1024px)").matches,
	);
	useEffect(() => {
		const mq = window.matchMedia("(min-width: 1024px)");
		const update = () => setIsDesktop(mq.matches);
		// Some embedded browsers resize without firing the media-query change
		// event, so listen to plain resizes as well.
		mq.addEventListener("change", update);
		window.addEventListener("resize", update);
		return () => {
			mq.removeEventListener("change", update);
			window.removeEventListener("resize", update);
		};
	}, []);

	const leaveRoom = useCallback(() => {
		localStorage.removeItem(SESSION_KEY);
		setSession(null);
		setView(null);
		setConfirmClose(false);
		setSelected(new Set());
	}, []);

	// Poll room state while in a room. Actions also refresh via their response.
	useEffect(() => {
		if (!session) return;
		let live = true;
		const tick = async () => {
			try {
				const v = await api<RoomView>(
					`state?code=${session.code}&playerId=${session.playerId}`,
				);
				if (!live) return;
				if (v.closed) {
					if (!v.isHost) setError("The host closed the room.");
					leaveRoom();
					return;
				}
				setView(v);
			} catch (e) {
				if (live && e instanceof Error && /not found/i.test(e.message)) {
					setError("That room has expired.");
					leaveRoom();
				}
			}
		};
		tick();
		const id = setInterval(tick, POLL_MS);
		return () => {
			live = false;
			clearInterval(id);
		};
	}, [session, leaveRoom]);

	const closeRoom = useCallback(async () => {
		if (session) {
			try {
				await api("close", {
					code: session.code,
					playerId: session.playerId,
				});
			} catch {
				// Best effort — leave locally regardless.
			}
		}
		leaveRoom();
	}, [session, leaveRoom]);

	const leaveGame = useCallback(async () => {
		if (session) {
			try {
				await api("leave", {
					code: session.code,
					playerId: session.playerId,
				});
			} catch {
				// Best effort — leave locally regardless.
			}
		}
		leaveRoom();
	}, [session, leaveRoom]);

	// Audio + local-state cues driven by server-state transitions (the room is
	// polled, so events arrive as diffs between snapshots). The first snapshot
	// stays silent so joining mid-match doesn't replay announcements.
	const prevViewRef = useRef<RoomView | null>(null);
	useEffect(() => {
		const prev = prevViewRef.current;
		prevViewRef.current = view;
		if (!view) return;
		if (!prev || prev.code !== view.code) {
			setDealKey((k) => k + 1);
			return;
		}

		// New round dealt (or the match just started).
		if (
			view.phase === "playing" &&
			(prev.phase === "lobby" ||
				prev.phase === "revealed" ||
				view.round !== prev.round)
		) {
			setDealKey((k) => k + 1);
			setSelected(new Set());
			playSfx("card_shuffle");
			setTimeout(() => playSfx("card_deal"), 600);
			speak(
				prev.phase === "lobby"
					? "matchStart"
					: view.round === view.totalRounds
						? "finalGame"
						: "dealing",
			);
		}

		// It became your turn.
		if (
			view.phase === "playing" &&
			prev.phase === "playing" &&
			view.game &&
			prev.game &&
			view.game.turn === view.youSeat &&
			prev.game.turn !== view.youSeat
		)
			playSfx("chip_place");

		// A Draw call landed on the table.
		if (view.fight && !prev.fight) playSfx("banker_crown");

		// The round was revealed.
		if (view.phase === "revealed" && prev.phase === "playing") {
			const res = view.game?.result;
			if (res) {
				const delta = res.moneyDeltas[view.youSeat];
				playSfx("card_flip");
				setTimeout(() => {
					playSfx(
						res.winner === view.youSeat
							? res.kind === "tongits"
								? "natural_fanfare"
								: "win_jingle"
							: "lose_sting",
					);
					if (delta !== 0) playSfx("chip_slide");
				}, 450);
				speakAfter(
					delta > 0
						? delta >= view.bet * 4
							? "roundWinBig"
							: "roundWin"
						: delta < 0
							? -delta >= view.bet * 4
								? "roundLossBig"
								: "roundLoss"
							: "roundPush",
				);
			}
		}

		// Match over — final standings by net earnings.
		if (view.phase === "gameover" && prev.phase !== "gameover") {
			const earnings = view.seats.map(
				(s) => s.balance - view.startBalance,
			);
			const mine = earnings[view.youSeat];
			const above = earnings.filter((e) => e > mine).length;
			playSfx(above === 0 ? "match_win_fanfare" : "match_end");
			speak(
				above === 0
					? "matchWin"
					: above === view.seats.length - 1
						? "matchLoss"
						: "matchMid",
				mine > 0 && "matchProfit",
			);
		}
	}, [view]);

	const act = useCallback(
		async (path: string, body: object = {}) => {
			if (!session) return false;
			setBusy(true);
			setError(null);
			try {
				const v = await api<RoomView>(path, {
					code: session.code,
					playerId: session.playerId,
					...body,
				});
				setView(v);
				return true;
			} catch (e) {
				setError(e instanceof Error ? e.message : "Request failed");
				playSfx("foul_buzzer");
				return false;
			} finally {
				setBusy(false);
			}
		},
		[session],
	);

	async function createOrJoin(mode: "create" | "join") {
		playSfx("button_click");
		setBusy(true);
		setError(null);
		try {
			localStorage.setItem(NAME_KEY, name.trim());
			const res = await api<{ code: string; playerId: string }>(
				mode,
				mode === "create"
					? { name, bet: createBet }
					: { name, code: joinCode.trim().toUpperCase() },
			);
			const s = { code: res.code, playerId: res.playerId };
			localStorage.setItem(SESSION_KEY, JSON.stringify(s));
			setSession(s);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Request failed");
		} finally {
			setBusy(false);
		}
	}

	// --- Derived game state (rotated: you = seat 0) ------------------------------

	const state = useMemo(() => (view ? stateFromView(view) : null), [view]);
	const youSeat = view?.youSeat ?? 0;
	const fromDisp = useCallback(
		(d: number) => (d + youSeat + SEATS) % SEATS,
		[youSeat],
	);

	const names = useMemo(
		() =>
			Array.from({ length: SEATS }, (_, d) => {
				if (!view) return "";
				if (d === 0) return "You";
				const sv = view.seats[fromDisp(d)];
				return sv?.name ?? `Player ${fromDisp(d) + 1}`;
			}),
		[view, fromDisp],
	);
	const balances = useMemo(
		() =>
			Array.from(
				{ length: SEATS },
				(_, d) => view?.seats[fromDisp(d)]?.balance ?? 0,
			),
		[view, fromDisp],
	);
	const deadwoods = useMemo(
		() =>
			Array.from(
				{ length: SEATS },
				(_, d) => view?.seats[fromDisp(d)]?.deadwood ?? null,
			),
		[view, fromDisp],
	);
	const avatars = useMemo(
		() =>
			Array.from({ length: SEATS }, (_, d) => {
				if (d === 0) return "😎";
				return view?.seats[fromDisp(d)]?.isBot ? "🤖" : "😀";
			}),
		[view, fromDisp],
	);

	const hand = useMemo(
		() => state?.players[0].hand ?? [],
		[state],
	);
	const displayHand = useMemo(
		() => sortForDisplay(hand, sortMode),
		[hand, sortMode],
	);
	const selCards = useMemo(
		() => hand.filter((c) => selected.has(c.id)),
		[hand, selected],
	);
	const reveal = Boolean(state?.result);
	const fightOpen = Boolean(view?.fight);
	const isYourTurn =
		!!view &&
		!!state &&
		view.phase === "playing" &&
		!state.result &&
		state.turn === 0;
	const canDrawNow = isYourTurn && state!.phase === "draw" && !fightOpen;
	const canActNow = isYourTurn && state!.phase === "act" && !fightOpen;
	const meldValid = selCards.length >= 3 && meldTypeOf(selCards) !== null;
	const drawCallable =
		Boolean(view?.game?.canCallDraw) && !fightOpen && !reveal;

	const sapawTargets = useMemo(() => {
		if (!canActNow || !state || selCards.length === 0)
			return new Set<number>();
		return new Set(
			state.players
				.flatMap((p) => p.melds)
				.filter((m) => extendMeld(m, selCards) !== null)
				.map((m) => m.id),
		);
	}, [canActNow, state, selCards]);

	const discardTakeIds = useMemo(() => {
		if (!canDrawNow || !state) return null;
		const top = topDiscard(state);
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
	}, [canDrawNow, state, hand, selCards]);

	// --- Human actions -------------------------------------------------------------

	function toggleSelect(id: string) {
		if (!state || state.result) return;
		playSfx("card_pick");
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	async function doDrawStock() {
		if (!canDrawNow || busy) return;
		if (await act("draw")) playSfx("card_flip");
	}

	async function doTakeDiscard() {
		if (!canDrawNow || busy) return;
		if (!discardTakeIds) {
			setError("The top discard must complete a set or run with your cards");
			playSfx("foul_buzzer");
			return;
		}
		if (await act("take", { cardIds: discardTakeIds })) {
			playSfx("card_swap");
			setSelected(new Set());
		}
	}

	async function doMeld() {
		if (!canActNow || busy) return;
		if (await act("meld", { cardIds: selCards.map((c) => c.id) })) {
			playSfx("card_drop");
			setSelected(new Set());
		}
	}

	async function doSapaw(meldId?: number) {
		if (!canActNow || busy) return;
		const target = meldId ?? [...sapawTargets][0];
		if (target === undefined) {
			setError("Selected cards don’t extend any exposed meld");
			playSfx("foul_buzzer");
			return;
		}
		if (
			await act("sapaw", {
				meldId: target,
				cardIds: selCards.map((c) => c.id),
			})
		) {
			playSfx("card_swap");
			setSelected(new Set());
		}
	}

	async function doDiscard() {
		if (!canActNow || busy) return;
		if (selCards.length !== 1) {
			setError("Select exactly one card to discard");
			playSfx("foul_buzzer");
			return;
		}
		if (await act("discard", { cardId: selCards[0].id })) {
			playSfx("card_deal");
			setSelected(new Set());
		}
	}

	async function doCallDraw() {
		if (!drawCallable || busy) return;
		playSfx("banker_crown");
		await act("callDraw");
	}

	// --- Rendering -------------------------------------------------------------

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	const shellClass = THEMES[theme].className;
	const yourBalance = view?.seats[youSeat]?.balance ?? 0;

	const header = (
		<Header
			title="Tongits"
			theme={theme}
			setTheme={setTheme}
			back={back}
			setBack={setBack}
			themeOptions={themeOptions}
			backOptions={backOptions}
			balance={yourBalance}
			division={
				view && view.phase !== "lobby" ? `Room ${view.code}` : undefined
			}
			{...audio}
		/>
	);

	const errorBar = error && (
		<div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 rounded-lg bg-red-500/85 px-4 py-2 text-sm font-medium text-white">
			<span>{error}</span>
			<button onClick={() => setError(null)}>
				<LuX className="h-4 w-4" />
			</button>
		</div>
	);

	// --- Home / lobby screens --------------------------------------------------

	if (!session || !view || view.phase === "lobby") {
		const inLobby = session && view?.phase === "lobby";
		return (
			<GameShell themeClass={shellClass} header={header}>
				<div className="p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<div className="flex items-center gap-3">
							<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-black/20 ring-1 ring-white/10">
								<LuGlobe className="h-7 w-7 text-amber-300" />
							</div>
							<div>
								<h2 className="font-display text-2xl font-semibold tracking-tight">
									Tongits Online
								</h2>
								<p className="text-sm opacity-70">
									Play with friends — empty seats are filled by
									bots. Everyone starts at{" "}
									{formatUSD(ONLINE_START_BALANCE)}.
								</p>
							</div>
						</div>

						{error && <div className="mt-4">{errorBar}</div>}

						{!inLobby ? (
							<>
								<label className="mt-6 block text-sm font-semibold uppercase tracking-wide opacity-80">
									Your name
								</label>
								<input
									value={name}
									onChange={(e) => setName(e.target.value)}
									maxLength={16}
									placeholder="e.g. Mark"
									className="mt-2 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm ring-1 ring-white/20 outline-none placeholder:opacity-50 focus:ring-amber-300/60"
								/>

								<label className="mt-4 block text-sm font-semibold uppercase tracking-wide opacity-80">
									Stake per round
								</label>
								<div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
									{BET_OPTIONS.map((b) => (
										<button
											key={b}
											onClick={() => {
												playSfx("chip_place");
												setCreateBet(b);
											}}
											className={`rounded-xl px-2 py-2 text-sm font-bold tabular-nums ring-2 transition ${
												createBet === b
													? "bg-amber-400/15 ring-amber-400/60"
													: "bg-white/5 ring-white/20 hover:bg-white/10"
											}`}
										>
											{formatUSD(b)}
										</button>
									))}
								</div>

								<button
									onClick={() => createOrJoin("create")}
									disabled={busy || !name.trim()}
									className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
								>
									Create a room{" "}
									<LuArrowRight className="h-4 w-4" />
								</button>
								<div className="mt-5 flex items-center gap-3 text-xs uppercase tracking-widest opacity-50">
									<div className="h-px flex-1 bg-white/20" />
									or join
									<div className="h-px flex-1 bg-white/20" />
								</div>
								<div className="mt-4 flex gap-2">
									<input
										value={joinCode}
										onChange={(e) =>
											setJoinCode(
												e.target.value.toUpperCase(),
											)
										}
										maxLength={4}
										placeholder="CODE"
										className="w-28 rounded-xl bg-white/10 px-4 py-2.5 text-center font-mono text-sm tracking-[0.3em] ring-1 ring-white/20 outline-none placeholder:tracking-normal placeholder:opacity-50 focus:ring-amber-300/60"
									/>
									<button
										onClick={() => createOrJoin("join")}
										disabled={
											busy ||
											!name.trim() ||
											joinCode.trim().length !== 4
										}
										className="flex-1 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
									>
										Join room
									</button>
								</div>
								<p className="mt-6 text-xs opacity-60">
									Prefer solo?{" "}
									<Link
										to="/games/tongits"
										className="underline hover:opacity-100"
									>
										Play against bots
									</Link>
								</p>
							</>
						) : (
							<>
								<div className="mt-6 flex items-center justify-between rounded-xl bg-black/25 px-4 py-3 ring-1 ring-white/10">
									<div>
										<p className="text-xs uppercase tracking-wide opacity-60">
											Room code
										</p>
										<p className="font-mono text-3xl font-bold tracking-[0.3em]">
											{view.code}
										</p>
									</div>
									<div className="text-right">
										<p className="text-xs uppercase tracking-wide opacity-60">
											Stake
										</p>
										<p className="text-xl font-bold tabular-nums">
											{formatUSD(view.bet)}
										</p>
									</div>
									<button
										onClick={() =>
											navigator.clipboard?.writeText(
												view.code,
											)
										}
										title="Copy code"
										className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium ring-1 ring-white/15 transition hover:bg-white/20"
									>
										<LuCopy className="h-4 w-4" /> Copy
									</button>
								</div>
								<div className="mt-4 space-y-2">
									{view.seats.map((s) => (
										<div
											key={s.seat}
											className="flex items-center justify-between rounded-lg bg-black/20 px-4 py-2.5 text-sm"
										>
											<span className="flex items-center gap-2 font-semibold">
												<LuUsers className="h-4 w-4 opacity-60" />
												Seat {s.seat + 1} —{" "}
												{s.name ??
													"Bot (if empty at start)"}
												{s.seat === youSeat && (
													<span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-900">
														You
													</span>
												)}
											</span>
											<span className="opacity-60">
												{s.name ? "Ready" : "—"}
											</span>
										</div>
									))}
								</div>
								{view.isHost ? (
									<button
										onClick={() => {
											playSfx("button_click");
											act("start");
										}}
										disabled={busy}
										className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:opacity-40"
									>
										Start match{" "}
										<LuArrowRight className="h-4 w-4" />
									</button>
								) : (
									<p className="mt-5 animate-pulse text-center text-sm opacity-70">
										Waiting for the host to start…
									</p>
								)}
								<button
									onClick={view.isHost ? closeRoom : leaveGame}
									className="mt-3 w-full rounded-lg bg-white/5 px-3 py-2 text-xs font-medium opacity-70 ring-1 ring-white/10 transition hover:bg-white/10"
								>
									{view.isHost ? "Close room" : "Leave room"}
								</button>
							</>
						)}
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Game over ---------------------------------------------------------------

	if (view.phase === "gameover") {
		const ranking = view.seats
			.map((s) => ({ ...s, earnings: s.balance - view.startBalance }))
			.sort((a, b) => b.earnings - a.earnings);
		const youWon = ranking[0]?.seat === youSeat;
		return (
			<GameShell themeClass={shellClass} header={header}>
				<div className="relative p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						className="mx-auto mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-black/25 p-6 shadow-2xl backdrop-blur"
					>
						<h2 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight">
							{youWon ? (
								<>
									<FaTrophy className="h-6 w-6 text-amber-400" />
									You finished on top!
								</>
							) : (
								"Match over"
							)}
						</h2>
						<div className="mt-4 space-y-2">
							{ranking.map((s, i) => (
								<div
									key={s.seat}
									className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
										s.seat === youSeat
											? "bg-emerald-500/15 ring-1 ring-emerald-400/40"
											: "bg-black/20"
									}`}
								>
									<span className="font-semibold">
										{i + 1}.{" "}
										{s.seat === youSeat
											? "You"
											: (s.name ?? `Bot ${s.seat + 1}`)}
									</span>
									<span className="flex items-baseline gap-2">
										<span className="text-xs tabular-nums opacity-60">
											{formatUSD(s.balance)}
										</span>
										<span
											className={`font-bold tabular-nums ${
												s.earnings > 0
													? "text-emerald-300"
													: s.earnings < 0
														? "text-red-300"
														: ""
											}`}
										>
											{formatDelta(s.earnings)}
										</span>
									</span>
								</div>
							))}
						</div>
						<button
							onClick={leaveRoom}
							className="mt-6 flex w-full items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:brightness-110"
						>
							Back to lobby <LuArrowRight className="h-4 w-4" />
						</button>
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Active round (playing / revealed) ----------------------------------------

	if (!state) return null;
	const res = state.result;
	const humanWon = reveal && res?.winner === 0;
	const fight = view.fight;
	const fightCallerName =
		fight &&
		(fight.caller === youSeat
			? "You"
			: (view.seats[fight.caller]?.name ?? `Bot ${fight.caller + 1}`));

	const headline = res
		? res.kind === "tongits"
			? `🎉 ${names[res.winner]} ${res.winner === 0 ? "win" : "wins"} by TONGITS!`
			: res.kind === "stockout"
				? `Stock empty — ${names[res.winner]} ${res.winner === 0 ? "win" : "wins"} the count with ${res.points[res.winner]} pts`
				: `${names[res.caller ?? res.winner]} called Draw — ${names[res.winner]} ${res.winner === 0 ? "win" : "wins"} with ${res.points[res.winner]} pts`
		: null;
	const hint = fight
		? fight.yourVote === null
			? `${fightCallerName} called a Draw — fight or fold?`
			: `Draw called by ${fightCallerName} — waiting for ${fight.waitingOn
					.map((s) =>
						s === youSeat
							? "you"
							: (view.seats[s]?.name ?? `Bot ${s + 1}`),
					)
					.join(", ")}…`
		: !isYourTurn
			? `${names[state.turn]} is playing…`
			: state.phase === "draw"
				? drawCallable
					? "Your turn — draw a card, take a matching discard, or call Draw"
					: "Draw a card from the Draw Pile, then meld or add to melds, then discard 1 card"
				: "Lay melds or sapaw the table, then discard one card";

	// Pieces shared by the desktop inline layout and the mobile bottom sheet.
	const handFan = hand.length > 0 && (
		<HandFan
			cards={displayHand}
			selected={selected}
			onToggle={toggleSelect}
			onPlayMeld={() => canActNow && meldValid && doMeld()}
			dealKey={dealKey}
		/>
	);

	const sortButtons = (
		<div className="flex gap-1 rounded-lg bg-black/20 p-1 text-xs">
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
	);

	const actionButtons = (
		<div className="flex flex-wrap items-center justify-center gap-2">
			{selected.size > 0 && (
				<button
					onClick={() => {
						playSfx("button_click");
						setSelected(new Set());
					}}
					className="flex items-center gap-1 rounded-lg bg-black/25 px-3 py-2.5 text-xs font-medium ring-1 ring-white/10 transition hover:bg-black/35"
				>
					<LuX className="h-3.5 w-3.5" /> Clear ({selected.size})
				</button>
			)}
			<button
				onClick={doDrawStock}
				disabled={!canDrawNow || state.stock.length === 0 || busy}
				className={`${ACTION_BTN} bg-violet-400/25 ring-1 ring-violet-400/60 hover:bg-violet-400/40`}
			>
				Draw
			</button>
			<button
				onClick={doMeld}
				disabled={!canActNow || !meldValid || busy}
				className={`${ACTION_BTN} bg-gradient-to-b from-amber-300 to-amber-500 text-slate-900 shadow-lg shadow-amber-500/20 hover:brightness-110 disabled:hover:brightness-100`}
			>
				Meld
			</button>
			<button
				onClick={() => doSapaw()}
				disabled={!canActNow || sapawTargets.size === 0 || busy}
				className={`${ACTION_BTN} bg-sky-400/20 ring-1 ring-sky-400/50 hover:bg-sky-400/30`}
			>
				Sapaw
			</button>
			<button
				onClick={doDiscard}
				disabled={!canActNow || selCards.length !== 1 || busy}
				className={`${ACTION_BTN} bg-red-400/20 ring-1 ring-red-400/50 hover:bg-red-400/30`}
			>
				Discard
			</button>
			<button
				onClick={doCallDraw}
				disabled={!drawCallable || busy}
				className={`${ACTION_BTN} bg-white/10 ring-1 ring-white/30 hover:bg-white/20`}
			>
				<LuFlag className="h-3.5 w-3.5" /> Call Draw
			</button>
		</div>
	);

	const revealFooter = res && (
		<div className="flex flex-col items-center gap-2 py-1">
			<div className="text-center text-sm font-bold text-amber-300">
				{headline}
			</div>
			<button
				onClick={() => {
					playSfx("button_click");
					act("next");
				}}
				disabled={busy}
				style={{
					animation:
						"popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both",
				}}
				className="flex items-center gap-1.5 rounded-xl bg-amber-400 px-6 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300 disabled:opacity-40"
			>
				{view.round >= view.totalRounds ? "Final standings" : "Next round"}
				<LuArrowRight className="h-4 w-4" />
			</button>
		</div>
	);

	return (
		<GameShell themeClass={shellClass} header={header}>
			<div
				className={`flex flex-1 flex-col p-2 sm:p-4 ${
					isDesktop ? "" : "pb-16"
				}`}
			>
				{error && <div className="mb-2">{errorBar}</div>}

				{/* Host can end the room mid-match; others can bail out. */}
				<div className="mx-auto mb-2 flex w-full max-w-7xl justify-end">
					{view.isHost ? (
						confirmClose ? (
							<div className="flex items-center gap-2 rounded-lg bg-red-500/15 px-3 py-1.5 text-sm font-medium ring-1 ring-red-400/40">
								<span>Close the room for everyone?</span>
								<button
									onClick={closeRoom}
									className="rounded-md bg-red-500 px-2.5 py-1 text-xs font-bold text-white transition hover:bg-red-400"
								>
									Close
								</button>
								<button
									onClick={() => setConfirmClose(false)}
									className="rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium transition hover:bg-white/20"
								>
									Cancel
								</button>
							</div>
						) : (
							<button
								onClick={() => setConfirmClose(true)}
								className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium opacity-70 ring-1 ring-white/10 transition hover:bg-white/10 hover:opacity-100"
							>
								<LuX className="h-3.5 w-3.5" /> Close room
							</button>
						)
					) : (
						<button
							onClick={leaveGame}
							className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium opacity-70 ring-1 ring-white/10 transition hover:bg-white/10 hover:opacity-100"
						>
							<LuX className="h-3.5 w-3.5" /> Leave
						</button>
					)}
				</div>

				{/* The table frame: felt + wooden rim wrapping the board, your
				    hand, and the action bar — same as the solo layout. */}
				<div
					className="mx-auto flex w-full max-w-7xl flex-1 flex-col rounded-[1.75rem] border-[6px] border-black/40 p-3 pt-4 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10 sm:rounded-[3rem] sm:border-8 sm:p-5"
					style={{
						background:
							"radial-gradient(ellipse at 50% 30%, var(--table-felt), var(--table-felt-2))",
					}}
				>
					<TongitsTable
						state={state}
						names={names}
						balances={balances}
						back={back}
						round={view.round}
						totalRounds={view.totalRounds}
						dealKey={dealKey}
						reveal={reveal}
						sapawTargets={sapawTargets}
						onMeldClick={(id) => doSapaw(id)}
						canDrawStock={canDrawNow && state.stock.length > 0 && !busy}
						canTakeDiscard={
							canDrawNow && discardTakeIds !== null && !busy
						}
						onDrawStock={doDrawStock}
						onTakeDiscard={doTakeDiscard}
						sortMode={sortMode}
						onSortChange={(m) => {
							playSfx("button_click");
							setSortMode(m);
						}}
						deadwoods={reveal ? undefined : deadwoods}
						avatars={avatars}
					/>

					{/* Desktop keeps the hand + actions inline under the
					    board; small screens get the bottom sheet instead. */}
					{isDesktop && (
					<>
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
									: isYourTurn
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
								{state.dealer === 0 && (
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
									{reveal && res?.burned[0] && !humanWon && (
										<span className="rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase tracking-wide">
											Burned
										</span>
									)}
								</div>
								<div className="text-xs tabular-nums opacity-85">
									{formatUSD(yourBalance)}
								</div>
								<div className="text-[11px] tabular-nums opacity-90">
									{hand.length} cards · deadwood{" "}
									<b className="text-amber-300">
										{reveal
											? res?.points[0]
											: handPoints(hand)}
									</b>
									{reveal && (
										<b
											className={`ml-1.5 ${
												(res?.moneyDeltas[0] ?? 0) > 0
													? "text-emerald-300"
													: (res?.moneyDeltas[0] ??
																0) < 0
														? "text-red-300"
														: "opacity-60"
											}`}
										>
											{formatDelta(
												res?.moneyDeltas[0] ?? 0,
											)}
										</b>
									)}
								</div>
							</div>
						</motion.div>

						<div className="min-w-0 flex-1">{handFan}</div>

						{/* Mirrors the avatar panel so the hand stays centered */}
						<div className="hidden w-44 shrink-0 lg:block" />
					</div>

					{/* Action bar */}
					<div className="mt-3 border-t border-white/10 pt-3">
						{res ? (
							revealFooter
						) : (
							<div className="flex flex-col items-center gap-2.5">
								<p
									className={`text-center text-xs font-medium sm:text-sm ${
										isYourTurn && !fightOpen
											? "text-emerald-300"
											: "opacity-60"
									}`}
								>
									{hint}
								</p>
								{actionButtons}
							</div>
						)}
					</div>
					</>
					)}
				</div>
			</div>

			{/* Mobile: your hand + actions float as a collapsible bottom sheet
			    over the board (Pusoy Trese-style), so the piles, melds, and
			    seats stay visible behind it with no scrolling. */}
			{!isDesktop &&
				(handOpen ? (
					<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2">
						<div
							className="flex max-h-[80dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur"
							style={{
								backgroundColor:
									"color-mix(in srgb, var(--table-felt-2) 92%, black)",
							}}
						>
							{/* Sheet header: your info + collapse */}
							<div className="flex flex-col gap-2 border-b border-white/10 p-3">
								<div className="flex items-center justify-between gap-2">
									<span className="flex min-w-0 items-center gap-2.5">
										<span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/15 bg-black/40 text-lg">
											😎
											{state.dealer === 0 && (
												<span
													className="absolute -right-1 -top-1 grid h-4 w-4 place-items-center rounded-full bg-amber-400"
													title="Dealer"
												>
													<FaCrown className="h-2.5 w-2.5 text-slate-900" />
												</span>
											)}
										</span>
										<span className="min-w-0 leading-tight">
											<span className="flex items-center gap-1.5 text-sm font-semibold">
												Your hand
												{humanWon && (
													<FaTrophy className="h-3.5 w-3.5 text-amber-400" />
												)}
												{reveal &&
													res?.burned[0] &&
													!humanWon && (
														<span className="rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase tracking-wide">
															Burned
														</span>
													)}
											</span>
											<span className="block text-[11px] tabular-nums opacity-75">
												{formatUSD(yourBalance)} ·{" "}
												{hand.length} cards · deadwood{" "}
												<b className="text-amber-300">
													{reveal
														? res?.points[0]
														: handPoints(hand)}
												</b>
												{reveal && (
													<b
														className={`ml-1.5 ${
															(res
																?.moneyDeltas[0] ??
																0) > 0
																? "text-emerald-300"
																: (res
																			?.moneyDeltas[0] ??
																			0) <
																	  0
																	? "text-red-300"
																	: "opacity-60"
														}`}
													>
														{formatDelta(
															res
																?.moneyDeltas[0] ??
																0,
														)}
													</b>
												)}
											</span>
										</span>
									</span>
									<button
										onClick={() => {
											playSfx("button_click");
											setHandOpen(false);
										}}
										className="flex items-center rounded-lg bg-black/25 p-2 text-xs font-medium ring-1 ring-white/10 transition hover:bg-black/35"
									>
										<LuX className="h-4 w-4" />
									</button>
								</div>
								{/* Status strip */}
								<div
									className={`rounded-lg px-3 py-2 text-xs font-medium ${
										res
											? "bg-amber-400/90 text-slate-900"
											: isYourTurn && !fightOpen
												? "bg-emerald-500/85 text-white"
												: "bg-white/15"
									}`}
								>
									{res ? headline : hint}
								</div>
							</div>

							{/* Hand */}
							<div className="overflow-x-auto overflow-y-auto px-1">
								{handFan}
							</div>

							{/* Actions */}
							<div className="border-t border-white/10 p-3">
								{res ? (
									revealFooter
								) : (
									<div className="flex flex-col items-center gap-2">
										{sortButtons}
										{actionButtons}
									</div>
								)}
							</div>
						</div>
					</div>
				) : (
					<button
						onClick={() => {
							playSfx("button_click");
							setHandOpen(true);
						}}
						className={`fixed inset-x-0 bottom-0 z-30 mx-auto flex w-full max-w-3xl items-center justify-center gap-2 rounded-t-2xl border-t px-4 py-3 text-sm font-semibold shadow-2xl backdrop-blur ${
							isYourTurn && !res && !fightOpen
								? "border-emerald-400/60 text-emerald-300"
								: "border-white/15"
						}`}
						style={{
							backgroundColor:
								"color-mix(in srgb, var(--table-felt-2) 92%, black)",
						}}
					>
						<LuChevronUp className="h-4 w-4" />
						Your hand
						<span className="opacity-60">
							· {hand.length} cards
						</span>
						{!res && isYourTurn && !fightOpen && (
							<span
								className="rounded-full bg-emerald-400/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900"
								style={{
									animation:
										"winnerPulse 1.6s ease-in-out infinite",
								}}
							>
								Your turn
							</span>
						)}
					</button>
				))}

			{/* Fight prompt: someone called Draw and your vote is pending */}
			<AnimatePresence>
				{fight && fight.yourVote === null && (
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
								{fightCallerName} calls a Draw!
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
										act("fight", { fight: false });
									}}
									disabled={busy}
									className="flex-1 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:opacity-40"
								>
									Fold
								</button>
								<button
									onClick={() => {
										playSfx("chip_stack");
										act("fight", { fight: true });
									}}
									disabled={busy}
									className="flex-1 rounded-xl bg-gradient-to-b from-purple-300 to-purple-500 px-4 py-2.5 text-sm font-bold text-slate-900 shadow-lg transition hover:brightness-110 disabled:opacity-40"
								>
									Fight!
								</button>
							</div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</GameShell>
	);
}
