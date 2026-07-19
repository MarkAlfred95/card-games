import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { LuArrowRight, LuCopy, LuGlobe, LuUsers, LuX } from "react-icons/lu";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import { buildDeck } from "../game/deck";
import { handValue, natural } from "../game/lucky9";
import type { Card as CardModel, Rank, Suit } from "../game/types";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { formatUSD, formatDelta } from "../wallet";
import {
	Header,
	GameShell,
	Lucky9Table,
	DrawPanel,
	BettingGate,
	ONLINE_START_BALANCE,
} from "../components/game/lucky-nine";
import { useAudioSettings } from "../audioPrefs";
import { speak, speakAfter, stopVoice } from "../voice";
import type { VoiceCue } from "../voice";
import { playSfx } from "../sfx";
import type { SfxKey } from "../sfx";

// --- Server view types (mirrors server/lucky9.ts viewFor) --------------------

interface SeatView {
	seat: number;
	name: string | null;
	isBot: boolean;
	balance: number;
	stake: number;
	bet: boolean;
	moved: boolean;
	cardCount: number;
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
	yourMoved: boolean;
	maxBet: number;
	minChip: number;
	result: {
		moneyDeltas: number[];
		values: number[];
		naturals: (string | null)[];
		hands: string[][];
	} | null;
}

interface Session {
	code: string;
	playerId: string;
}

// --- Small API client --------------------------------------------------------

async function api<T>(path: string, body?: object): Promise<T> {
	const res = await fetch(
		`/api/lucky9/${path}`,
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

const SESSION_KEY = "lucky9-online-session";
const NAME_KEY = "card-hub-player-name";
const POLL_MS = 2500;

// --- Card helpers -------------------------------------------------------------

function cardFromId(id: string): CardModel {
	return { id, rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit };
}

// Face-down fans just need the right number of cards; the real ones stay
// secret on the server. Same trick as the Pusoy Trese online page.
const DUMMY_CARDS: CardModel[] = buildDeck().slice(0, 3);

// Reveal commentary from the server result: the standout Lucky 9 event, its
// sfx stinger, and the money verdict.
function revealCues(view: RoomView) {
	const r = view.result;
	if (!r) return null;
	const you = view.youSeat;
	const banker = view.banker;
	const event: VoiceCue | null =
		r.naturals[you] === "Lucky 9"
			? "luckyNine"
			: you !== banker && r.naturals[banker] === "Lucky 9"
				? "bankerLuckyNine"
				: you === banker &&
					  r.naturals.some(
							(n, s) => s !== banker && n === "Lucky 9",
					  )
					? "luckyNineOpponent"
					: r.naturals[you] === "Natural 8"
						? "naturalEight"
						: null;
	const delta = r.moneyDeltas[you];
	const big = 10 * view.minChip;
	const money: VoiceCue =
		delta > 0
			? delta >= big
				? "roundWinBig"
				: "roundWin"
			: delta < 0
				? -delta >= big
					? "roundLossBig"
					: "roundLoss"
				: "roundPush";
	const stinger: SfxKey | null =
		event && event !== "naturalEight"
			? "natural_fanfare"
			: delta > 0
				? "win_jingle"
				: delta < 0
					? "lose_sting"
					: null;
	return { event, money, stinger, delta };
}

export default function Lucky9Online() {
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

	const [bet, setBet] = useState(0);
	const betGame = useRef<number>(-1);
	const [confirmClose, setConfirmClose] = useState(false);

	const leaveRoom = useCallback(() => {
		localStorage.removeItem(SESSION_KEY);
		setSession(null);
		setView(null);
		setConfirmClose(false);
		betGame.current = -1;
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

	// Reset the chip tray once per game.
	useEffect(() => {
		if (!view || view.phase !== "playing") return;
		if (betGame.current === view.gameIndex) return;
		betGame.current = view.gameIndex;
		setBet(0);
	}, [view]);

	// Audio cues driven by server-state transitions — the room view is polled,
	// so events arrive as diffs between snapshots. The first snapshot of a room
	// stays silent (joining mid-match shouldn't replay announcements).
	const prevViewRef = useRef<RoomView | null>(null);
	useEffect(() => {
		const prev = prevViewRef.current;
		prevViewRef.current = view;
		if (!view || !prev || prev.code !== view.code) return;

		// New game dealt (or the match just started).
		if (
			view.phase === "playing" &&
			(prev.phase === "lobby" || view.gameIndex !== prev.gameIndex)
		) {
			playSfx("card_shuffle");
			setTimeout(() => playSfx("card_deal"), 700);
			const cues: (VoiceCue | false)[] = [];
			if (prev.phase === "lobby") cues.push("lucky9MatchStart");
			else if (view.gameIndex === view.totalGames - 1)
				cues.push("finalGame");
			else if (view.gameIndex === Math.floor(view.totalGames / 2))
				cues.push("halfway");
			if (view.banker !== prev.banker || prev.phase === "lobby") {
				if (view.gameIndex > 0) playSfx("banker_crown");
				cues.push(
					view.banker === view.youSeat
						? "youAreBanker"
						: view.gameIndex > 0 && "bankerRotates",
				);
			}
			if (!cues.length) cues.push("dealing");
			cues.push(view.needsBet ? "placeYourBet" : "hiritOrStand");
			speak(...cues);
		}

		// Your bet was accepted — your cards are visible, time to decide.
		if (
			view.phase === "playing" &&
			prev.phase === "playing" &&
			view.gameIndex === prev.gameIndex &&
			prev.needsBet &&
			!view.needsBet
		)
			speakAfter("hiritOrStand");

		// Everyone has played — the round is revealed.
		if (view.phase === "revealed" && prev.phase === "playing") {
			const rc = revealCues(view);
			if (rc) {
				playSfx("card_flip");
				setTimeout(() => {
					if (rc.stinger) playSfx(rc.stinger);
					if (rc.delta !== 0) playSfx("chip_slide");
				}, 450);
				speakAfter(rc.event, rc.money);
			}
		}

		// Match over — final standings by net earnings.
		if (view.phase === "gameover" && prev.phase !== "gameover") {
			const earnings = view.seats.map(
				(s) => s.balance - ONLINE_START_BALANCE,
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

	const act = useCallback(async (path: string, body: object) => {
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
	}, []);

	async function createOrJoin(mode: "create" | "join") {
		playSfx("button_click");
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

	// --- Rendering -------------------------------------------------------------

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	const shellClass = THEMES[theme].className;

	const youSeat = view?.youSeat ?? 0;
	const names =
		view?.seats.map((s, i) =>
			i === youSeat ? "You" : (s.name ?? `Player ${i + 1}`),
		) ?? [];
	const yourBalance = view?.seats[youSeat]?.balance ?? 0;

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
									Lucky 9 Online
								</h2>
								<p className="text-sm opacity-70">
									Play with friends — empty seats are filled
									by bots. Everyone starts at{" "}
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
										to="/games/lucky-nine"
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
										onClick={() => {
											playSfx("button_click");
											act("start", {
												code: session.code,
												playerId: session.playerId,
											});
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
									onClick={
										view.isHost ? closeRoom : leaveGame
									}
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
		// Rank by net earnings over the match, not final bankroll.
		const ranking = view.seats
			.map((s) => ({ ...s, earnings: s.balance - ONLINE_START_BALANCE }))
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
										{i + 1}. {names[s.seat]}
									</span>
									<span className="flex items-baseline gap-2">
										<span className="text-xs opacity-60 tabular-nums">
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

	// --- Active game (playing / revealed) ----------------------------------------

	const reveal = view.phase === "revealed";
	const humanIsBanker = youSeat === view.banker;
	const waitingOn = view.seats.filter(
		(s) => !s.isBot && (!s.bet || !s.moved),
	);
	// Table fans: your real cards once the server shows them, everyone else a
	// face-down fan of the right size; the reveal carries every seat's cards.
	const hands: CardModel[][] = view.seats.map((s) =>
		reveal && view.result
			? view.result.hands[s.seat].map(cardFromId)
			: s.seat === youSeat && view.yourHand
				? view.yourHand
				: DUMMY_CARDS.slice(0, s.cardCount),
	);
	const myCards = view.yourHand ?? [];
	const showDrawPanel =
		view.phase === "playing" &&
		!view.needsBet &&
		view.yourHand !== null &&
		!view.yourMoved;

	return (
		<GameShell themeClass={shellClass} header={header}>
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
							You are the banker this game — every player's bet
							rides against your hand.
						</span>
					</div>
				)}
				{view.phase === "playing" &&
					view.yourMoved &&
					waitingOn.length > 0 && (
						<div className="rounded-lg bg-sky-400/20 px-4 py-2 text-sm font-medium ring-1 ring-sky-400/40">
							⏳ Hand played — waiting for{" "}
							{waitingOn.map((s) => names[s.seat]).join(", ")}…
						</div>
					)}

				<Lucky9Table
					names={names}
					balances={view.seats.map((s) => s.balance)}
					stakes={view.seats.map((s) => s.stake)}
					banker={view.banker}
					humanSeat={youSeat}
					hands={hands}
					back={back}
					gameIndex={view.gameIndex}
					totalGames={view.totalGames}
					reveal={reveal}
					humanFaceUp={view.yourHand !== null || reveal}
					values={view.result?.values}
					naturals={view.result?.naturals.map((n) => n ?? undefined)}
					moneyDeltas={view.result?.moneyDeltas}
					isLast={view.gameIndex + 1 >= view.totalGames}
					onNext={() => {
						playSfx("button_click");
						act("next", {
							code: session.code,
							playerId: session.playerId,
						});
					}}
				/>
			</div>

			{view.needsBet ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<BettingGate
						banker={names[view.banker]}
						balance={yourBalance}
						bet={bet}
						setBet={(v) => {
							playSfx(v > bet ? "chip_place" : "button_click");
							setBet(v);
						}}
						onPlace={() => {
							playSfx("chip_stack");
							speak(
								yourBalance > 0 && bet >= yourBalance * 0.25
									? "bigBet"
									: "betPlaced",
							);
							act("bet", {
								code: session.code,
								playerId: session.playerId,
								bet,
							});
						}}
					/>
				</div>
			) : showDrawPanel ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<DrawPanel
						cards={myCards}
						total={handValue(myCards)}
						natural={natural(myCards)}
						isBanker={humanIsBanker}
						decided={busy}
						onHirit={() => {
							playSfx("card_flip");
							speak("hirit");
							act("move", {
								code: session.code,
								playerId: session.playerId,
								action: "hirit",
							});
						}}
						onStand={() => {
							playSfx("button_click");
							speak("standPat");
							act("move", {
								code: session.code,
								playerId: session.playerId,
								action: "stand",
							});
						}}
					/>
				</div>
			) : null}
		</GameShell>
	);
}
