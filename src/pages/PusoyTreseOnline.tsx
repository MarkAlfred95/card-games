import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LuArrowRight, LuCopy, LuGlobe, LuUsers, LuX } from "react-icons/lu";
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
import { buildDeck, RANKS } from "../game/deck";
import { evaluate, compareHands } from "../game/ranking";
import { detectNatural } from "../game/naturals";
import type { Arrangement, Card as CardModel } from "../game/types";
import Card from "../components/Card";
import DropZone from "../components/DropZone";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { formatUSD } from "../wallet";
import {
	Header,
	PokerTable,
	BettingGate,
	HandTypesMenu,
	SEATS,
} from "../components/game/pusoy-trese";

// --- Server view types (mirrors server/pusoy.ts viewFor) ---------------------

interface SeatView {
	seat: number;
	name: string | null;
	isBot: boolean;
	balance: number;
	stake: number;
	bet: boolean;
	submitted: boolean;
}

interface RoomView {
	code: string;
	phase: "lobby" | "playing" | "revealed" | "gameover";
	closed: boolean;
	gameIndex: number;
	totalGames: number;
	banker: number;
	youSeat: number;
	isHost: boolean;
	seats: SeatView[];
	yourHand: CardModel[] | null;
	needsBet: boolean;
	yourSubmitted: boolean;
	maxStake: number;
	minChip: number;
	result: {
		moneyDeltas: number[];
		foul: boolean[];
		naturals: (string | null)[];
		arrangements: Arrangement[];
		rowScores: { front: number; middle: number; back: number }[] | null;
	} | null;
}

interface Session {
	code: string;
	playerId: string;
}

// --- Small API client --------------------------------------------------------

async function api<T>(path: string, body?: object): Promise<T> {
	const res = await fetch(
		`/api/pusoy/${path}`,
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

const SESSION_KEY = "pusoy-online-session";
const NAME_KEY = "card-hub-player-name";
const POLL_MS = 2500;

// --- Arrangement helpers (same behavior as the solo page) --------------------

interface Zones {
	back: CardModel[];
	middle: CardModel[];
	front: CardModel[];
}
type ZoneId = keyof Zones;

const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i])) as Record<
	string,
	number
>;
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 };
const CAPACITY: Record<ZoneId, number> = { back: 5, middle: 5, front: 3 };
const ZONE_IDS = new Set<string>(["back", "middle", "front"]);

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

function splitToZones(hand: CardModel[]): Zones {
	return {
		back: sortHand(hand.slice(0, 5)),
		middle: sortHand(hand.slice(5, 10)),
		front: sortHand(hand.slice(10, 13)),
	};
}

// Opponents' fans just need 13 face-down cards; the real cards stay secret.
const DUMMY_HANDS: CardModel[][] = (() => {
	const deck = buildDeck();
	return Array.from({ length: SEATS }, () => deck.slice(0, 13));
})();

export default function PusoyTreseOnline() {
	const [theme, setTheme] = useState<ThemeKey>("classic");
	const [back, setBack] = useState<BackKey>("lattice");

	const [name, setName] = useState(
		() => localStorage.getItem(NAME_KEY) ?? "",
	);
	const [joinCode, setJoinCode] = useState("");
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

	const [stake, setStake] = useState(0);
	const [zones, setZones] = useState<Zones | null>(null);
	const zonesGame = useRef<number>(-1);
	const [activeCard, setActiveCard] = useState<CardModel | null>(null);
	const [confirmClose, setConfirmClose] = useState(false);

	const leaveRoom = useCallback(() => {
		localStorage.removeItem(SESSION_KEY);
		setSession(null);
		setView(null);
		setZones(null);
		setConfirmClose(false);
		zonesGame.current = -1;
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
				// Host closed the room: everyone else is returned to the lobby.
				if (v.closed) {
					if (!v.isHost) setError("The host closed the room.");
					leaveRoom();
					return;
				}
				setView(v);
			} catch (e) {
				// Room expired or gone: drop back to the lobby home.
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

	// Host closes the room for everyone, then drops back to the lobby home.
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

	// A guest leaves. Tell the server so the seat becomes a bot (keeping any
	// in-progress round unblocked), then drop back to the lobby home.
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

	// Stage the 13 dealt cards into rows once per game.
	useEffect(() => {
		if (!view?.yourHand || view.yourSubmitted) return;
		if (zonesGame.current === view.gameIndex) return;
		zonesGame.current = view.gameIndex;
		setZones(splitToZones(view.yourHand));
		setStake(0);
	}, [view]);

	const act = useCallback(
		async (path: string, body: object) => {
			setBusy(true);
			setError(null);
			try {
				const v = await api<RoomView>(path, body);
				setView(v);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Request failed");
			} finally {
				setBusy(false);
			}
		},
		[],
	);

	async function createOrJoin(mode: "create" | "join") {
		setBusy(true);
		setError(null);
		try {
			localStorage.setItem(NAME_KEY, name.trim());
			const res = await api<{ code: string; playerId: string }>(
				mode,
				mode === "create"
					? { name }
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

	// --- Arrangement status + drag handlers (as in the solo page) -------------

	const status = useMemo(() => {
		if (!zones) return null;
		const ev = {
			back: zones.back.length === 5 ? evaluate(zones.back) : null,
			middle: zones.middle.length === 5 ? evaluate(zones.middle) : null,
			front: zones.front.length === 3 ? evaluate(zones.front) : null,
		};
		const foulBM =
			!!ev.back && !!ev.middle && compareHands(ev.back, ev.middle) < 0;
		const foulMF =
			!!ev.middle && !!ev.front && compareHands(ev.middle, ev.front) < 0;
		const natural = detectNatural([
			...zones.back,
			...zones.middle,
			...zones.front,
		]);
		return {
			ev,
			foulBM,
			foulMF,
			complete: Boolean(ev.back && ev.middle && ev.front),
			natural,
		};
	}, [zones]);

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
	);

	function handleDragStart({ active }: DragStartEvent) {
		const fromZone = active.data.current?.zone as ZoneId | undefined;
		const card =
			fromZone && zones
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

		setZones((prev) => {
			if (!prev) return prev;
			if (droppedOnCard) {
				const targetId = String(over.id);
				if (targetId === activeId) return prev;
				const toZone = over.data.current?.zone as ZoneId;
				const ai = prev[from].findIndex((c) => c.id === activeId);
				const bi = prev[toZone].findIndex((c) => c.id === targetId);
				if (ai < 0 || bi < 0) return prev;
				if (from === toZone) {
					const arr = [...prev[from]];
					[arr[ai], arr[bi]] = [arr[bi], arr[ai]];
					return { ...prev, [from]: arr };
				}
				const fromArr = [...prev[from]];
				const toArr = [...prev[toZone]];
				[fromArr[ai], toArr[bi]] = [toArr[bi], fromArr[ai]];
				return { ...prev, [from]: fromArr, [toZone]: toArr };
			}
			const to = over.id as ZoneId;
			if (from === to) return prev;
			if (prev[to].length >= CAPACITY[to]) return prev;
			const card = prev[from].find((c) => c.id === activeId);
			if (!card) return prev;
			return {
				...prev,
				[from]: prev[from].filter((c) => c.id !== activeId),
				[to]: [...prev[to], card],
			};
		});
	}

	// --- Rendering -------------------------------------------------------------

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	const shellClass = `${THEMES[theme].className} min-h-screen text-[color:var(--ui-text)]`;
	const bgStyle = {
		background:
			"radial-gradient(ellipse at 50% 0%, var(--table-felt), var(--table-felt-2))",
	};

	const youSeat = view?.youSeat ?? 0;
	const names =
		view?.seats.map((s, i) =>
			i === youSeat ? "You" : (s.name ?? `Player ${i + 1}`),
		) ?? [];
	const yourBalance = view?.seats[youSeat]?.balance ?? 0;

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
			<div className={shellClass}>
				<div
					className="relative flex min-h-screen w-full flex-col overflow-hidden"
					style={bgStyle}
				>
					<Header
						theme={theme}
						setTheme={setTheme}
						back={back}
						setBack={setBack}
						themeOptions={themeOptions}
						backOptions={backOptions}
						balance={inLobby ? yourBalance : 0}
					/>
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
										Pusoy Trese Online
									</h2>
									<p className="text-sm opacity-70">
										Play with friends — empty seats are
										filled by bots. Everyone starts at{" "}
										{formatUSD(1000)}.
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
											to="/games/pusoy-trese"
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
											onClick={() =>
												act("start", {
													code: session.code,
													playerId: session.playerId,
												})
											}
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
				</div>
			</div>
		);
	}

	// --- Game over ---------------------------------------------------------------

	if (view.phase === "gameover") {
		const ranking = view.seats
			.map((s) => ({ ...s }))
			.sort((a, b) => b.balance - a.balance);
		const youWon = ranking[0]?.seat === youSeat;
		return (
			<div className={shellClass}>
				<div
					className="relative flex min-h-screen w-full flex-col gap-6 overflow-hidden"
					style={bgStyle}
				>
					<Header
						theme={theme}
						setTheme={setTheme}
						back={back}
						setBack={setBack}
						themeOptions={themeOptions}
						backOptions={backOptions}
						balance={yourBalance}
					/>
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
											{i + 1}. {names[s.seat]}
										</span>
										<span className="font-bold tabular-nums">
											{formatUSD(s.balance)}
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
				</div>
			</div>
		);
	}

	// --- Active game (playing / revealed) ----------------------------------------

	const reveal = view.phase === "revealed";
	const humanIsBanker = youSeat === view.banker;
	const waitingOn = view.seats.filter(
		(s) => !s.isBot && (!s.bet || !s.submitted),
	);
	const showArrange =
		view.phase === "playing" &&
		!view.needsBet &&
		!view.yourSubmitted &&
		zones !== null;

	const statusBar =
		status?.natural != null
			? {
					text: `Special hand — ${status.natural.name} (${status.natural.points} pts)! Auto-wins no matter the arrangement.`,
					tone: "bg-amber-400/90 text-slate-900",
				}
			: status?.complete
				? status.foulBM || status.foulMF
					? {
							text: status.foulBM
								? "Foul — middle is stronger than back"
								: "Foul — front is stronger than middle",
							tone: "bg-red-500/85 text-white",
						}
					: {
							text: "Legal arrangement ✓ — ready to submit",
							tone: "bg-emerald-500/85 text-white",
						}
				: { text: "Arrange your 13 cards", tone: "bg-white/15" };

	return (
		<div className={shellClass}>
			<DndContext
				sensors={sensors}
				collisionDetection={collisionDetection}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<div
					className="flex min-h-dvh w-full flex-col overflow-x-clip"
					style={bgStyle}
				>
					<Header
						theme={theme}
						setTheme={setTheme}
						back={back}
						setBack={setBack}
						themeOptions={themeOptions}
						backOptions={backOptions}
						balance={yourBalance}
						division={`Room ${view.code}`}
					/>

					<div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
						{error && errorBar}

						{/* Host can end the room mid-match; others can bail out. */}
						<div className="flex justify-end">
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

						{view.phase === "playing" && humanIsBanker && (
							<div className="flex items-center gap-2 rounded-lg bg-amber-400/20 px-4 py-2 text-sm font-medium ring-1 ring-amber-400/40">
								<FaCrown className="h-4 w-4 shrink-0 text-amber-400" />
								<span>
									You are the banker this game — you play every
									other player at their stake.
								</span>
							</div>
						)}
						{view.phase === "playing" &&
							view.yourSubmitted &&
							waitingOn.length > 0 && (
								<div className="rounded-lg bg-sky-400/20 px-4 py-2 text-sm font-medium ring-1 ring-sky-400/40">
									⏳ Hand submitted — waiting for{" "}
									{waitingOn
										.map((s) => names[s.seat])
										.join(", ")}
									…
								</div>
							)}

						<PokerTable
							names={names}
							balances={view.seats.map((s) => s.balance)}
							stakes={view.seats.map((s) => s.stake)}
							banker={view.banker}
							humanSeat={youSeat}
							hands={DUMMY_HANDS}
							back={back}
							gameIndex={view.gameIndex}
							totalGames={view.totalGames}
							reveal={reveal}
							arrangements={view.result?.arrangements}
							moneyDeltas={view.result?.moneyDeltas}
							foul={view.result?.foul}
							naturals={view.result?.naturals.map(
								(n) => n ?? undefined,
							)}
							rowScores={view.result?.rowScores ?? undefined}
							isLast={view.gameIndex + 1 >= view.totalGames}
							onNext={() =>
								act("next", {
									code: session.code,
									playerId: session.playerId,
								})
							}
						/>
					</div>

					{view.needsBet ? (
						<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
							<BettingGate
								banker={names[view.banker]}
								balance={yourBalance}
								stake={stake}
								setStake={setStake}
								onPlace={() =>
									act("bet", {
										code: session.code,
										playerId: session.playerId,
										stake,
									})
								}
							/>
						</div>
					) : showArrange && zones && status ? (
						<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
							<div
								className="flex max-h-[82dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur"
								style={{
									backgroundColor:
										"color-mix(in srgb, var(--table-felt-2) 92%, black)",
								}}
							>
								<div className="flex flex-col gap-2 border-b border-white/10 p-4">
									<div className="flex items-center justify-between">
										<span className="font-display text-lg font-semibold tracking-tight opacity-90">
											Arrange your hand
										</span>
										<HandTypesMenu
											themeClass={THEMES[theme].className}
										/>
									</div>
									<div
										className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${statusBar.tone}`}
									>
										{statusBar.text}
									</div>
								</div>

								<div className="flex flex-col gap-4 overflow-y-auto p-4">
									<div className="grid gap-3">
										<DropZone
											id="front"
											label="Front"
											cards={zones.front}
											capacity={3}
											handName={status.ev.front?.name}
											status={
												status.foulMF ? "foul" : null
											}
										/>
										<DropZone
											id="middle"
											label="Middle"
											cards={zones.middle}
											capacity={5}
											handName={status.ev.middle?.name}
											status={
												status.foulBM || status.foulMF
													? "foul"
													: null
											}
										/>
										<DropZone
											id="back"
											label="Back"
											cards={zones.back}
											capacity={5}
											handName={status.ev.back?.name}
											status={
												status.foulBM ? "foul" : null
											}
										/>
									</div>
								</div>

								<div className="flex w-full justify-end gap-2 border-t border-white/10 px-4 pt-3 pb-4 sm:gap-3">
									<button
										onClick={() =>
											act("submit", {
												code: session.code,
												playerId: session.playerId,
												front: zones.front.map(
													(c) => c.id,
												),
												middle: zones.middle.map(
													(c) => c.id,
												),
												back: zones.back.map(
													(c) => c.id,
												),
											})
										}
										disabled={busy || !status.complete}
										className="w-full cursor-pointer rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
									>
										{busy ? "Submitting…" : "Submit hand"}
									</button>
								</div>
							</div>
						</div>
					) : null}
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
