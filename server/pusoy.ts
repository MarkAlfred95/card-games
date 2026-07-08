// Online Pusoy Trese room engine. Framework-free: `dispatch` maps API-shaped
// requests onto room state living in the RoomStore, and reuses the pure game
// modules from src/game for dealing, bot play, and settlement. The server is
// the only place that sees every hand — views are filtered per player.
//
// Concurrency note: room updates are read-modify-write on a JSON blob with
// last-write-wins. At friends-playing-a-card-game scale the race window is
// negligible; move to a Redis WATCH/Lua flow if it ever matters.

import { buildDeck, shuffle, deal } from "../src/game/deck.js";
import { compareHands } from "../src/game/ranking.js";
import { scoreBanker } from "../src/game/scoring.js";
import { arrangeBot } from "../src/game/bot.js";
import type { Arrangement, Card, Rank, Suit } from "../src/game/types";
import {
	SEATS,
	GAMES_PER_BANKER,
	TOTAL_GAMES,
	MIN_CHIP,
	COMEBACK_STAKE,
} from "../src/components/game/pusoy-trese/constants.js";
import { getStore } from "./store.js";

const ROOM_TTL = 4 * 60 * 60; // seconds; refreshed on every write
const START_BALANCE = 1000;

type Phase = "lobby" | "playing" | "revealed" | "gameover";

interface RoomPlayer {
	id: string;
	name: string;
	seat: number;
}

interface RowIds {
	front: string[];
	middle: string[];
	back: string[];
}

// What the reveal needs, precomputed server-side so clients stay dumb.
interface RoundResultView {
	moneyDeltas: number[];
	foul: boolean[];
	naturals: (string | null)[];
	arrangements: Arrangement[];
	rowScores: { front: number; middle: number; back: number }[] | null;
}

interface Room {
	code: string;
	hostId: string;
	players: RoomPlayer[];
	phase: Phase;
	gameIndex: number;
	balances: number[];
	stakes: number[];
	bets: boolean[]; // stake locked in for this game (bots/banker: true)
	submitted: boolean[]; // arrangement in (bots: true, arranged at scoring)
	hands: string[][]; // card ids per seat
	arrangements: (RowIds | null)[];
	result: RoundResultView | null;
	// Host closed the room mid-session. Kept (not deleted) so pollers get a
	// clear "host closed" signal instead of an ambiguous 404; the TTL reaps it.
	closed?: boolean;
}

// --- Card helpers -----------------------------------------------------------

function cardFromId(id: string): Card {
	return { id, rank: id.slice(0, -1) as Rank, suit: id.slice(-1) as Suit };
}

const cardsFromIds = (ids: string[]): Card[] => ids.map(cardFromId);

// --- Money rules (mirror the solo game at factor 1) --------------------------

const bankerOf = (gameIndex: number) =>
	Math.floor(gameIndex / GAMES_PER_BANKER);

// Worst-case round swings ~24 points; cap the per-point stake at 1/25 balance.
const maxStakeFor = (balance: number) =>
	Math.max(MIN_CHIP, Math.floor(balance / 25 / MIN_CHIP) * MIN_CHIP);

function botStake(balance: number): number {
	if (balance < MIN_CHIP) return COMEBACK_STAKE;
	const target = balance * (0.005 + Math.random() * 0.01);
	const stake = Math.round(target / MIN_CHIP) * MIN_CHIP;
	return Math.min(Math.max(stake, MIN_CHIP), balance);
}

// --- Room lifecycle ---------------------------------------------------------

const roomKey = (code: string) => `pusoy:${code.toUpperCase()}`;

async function loadRoom(code: string): Promise<Room | null> {
	const raw = await getStore().get(roomKey(code));
	return raw ? (JSON.parse(raw) as Room) : null;
}

async function saveRoom(room: Room): Promise<void> {
	await getStore().set(roomKey(room.code), JSON.stringify(room), ROOM_TTL);
}

// Unambiguous letters only (no I/O/0/1 lookalikes).
function makeCode(): string {
	const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
	return Array.from(
		{ length: 4 },
		() => chars[Math.floor(Math.random() * chars.length)],
	).join("");
}

function seatOf(room: Room, playerId: string): number {
	const p = room.players.find((pl) => pl.id === playerId);
	if (!p) throw new ApiError(403, "You are not in this room");
	return p.seat;
}

const isBot = (room: Room, seat: number) =>
	!room.players.some((p) => p.seat === seat);

// Deal a fresh game: new hands, bot stakes, everyone un-submitted. Bots and
// the banker skip betting; a broke human is auto-staked the comeback stake.
function dealGame(room: Room): void {
	const banker = bankerOf(room.gameIndex);
	const hands = deal(shuffle(buildDeck()), SEATS, 13);
	room.hands = hands.map((h) => h.map((c) => c.id));
	room.arrangements = Array.from({ length: SEATS }, () => null);
	room.result = null;
	room.stakes = Array.from({ length: SEATS }, (_, s) => {
		if (s === banker) return 0;
		if (isBot(room, s)) return botStake(room.balances[s]);
		return room.balances[s] < MIN_CHIP ? COMEBACK_STAKE : 0;
	});
	room.bets = Array.from(
		{ length: SEATS },
		(_, s) =>
			s === banker || isBot(room, s) || room.balances[s] < MIN_CHIP,
	);
	room.submitted = Array.from({ length: SEATS }, (_, s) => isBot(room, s));
	room.phase = "playing";
}

// All humans are in -> arrange the bots, settle, and snapshot the reveal.
function scoreGame(room: Room): void {
	const banker = bankerOf(room.gameIndex);
	const arrangements: Arrangement[] = Array.from(
		{ length: SEATS },
		(_, s) => {
			const rows = room.arrangements[s];
			if (rows)
				return {
					front: cardsFromIds(rows.front),
					middle: cardsFromIds(rows.middle),
					back: cardsFromIds(rows.back),
				};
			return arrangeBot(cardsFromIds(room.hands[s]));
		},
	);

	// Table-stakes settlement, same as solo: nobody can go negative.
	const res = scoreBanker(
		arrangements,
		banker,
		room.stakes,
		{},
		room.balances,
	);
	room.balances = room.balances.map((b, s) => b + res.moneyDeltas[s]);

	// Per-row point chips (same margins the solo page shows); hidden when a
	// natural decided the round.
	const anyNatural = res.evals.some((e) => e.natural);
	const rowScores = anyNatural
		? null
		: res.evals.map((_, seat) => {
				const opps =
					seat === banker
						? res.evals.map((_, i) => i).filter((i) => i !== banker)
						: [banker];
				const margin = (pos: "front" | "middle" | "back") =>
					opps.reduce(
						(m, o) =>
							m +
							Math.sign(
								compareHands(
									res.evals[seat][pos],
									res.evals[o][pos],
								),
							) +
							(res.evals[seat].royalty[pos] -
								res.evals[o].royalty[pos]),
						0,
					);
				return {
					front: margin("front"),
					middle: margin("middle"),
					back: margin("back"),
				};
			});

	room.result = {
		moneyDeltas: res.moneyDeltas,
		foul: res.foul,
		naturals: res.evals.map((e) => e.natural?.name ?? null),
		arrangements,
		rowScores,
	};
	room.phase = "revealed";
}

// --- Per-player view (hides everyone else's cards) ---------------------------

function viewFor(room: Room, playerId: string) {
	const seat = room.players.find((p) => p.id === playerId)?.seat ?? -1;
	const banker = bankerOf(room.gameIndex);
	const showHand =
		seat >= 0 && room.phase === "playing" && room.bets[seat];

	return {
		code: room.code,
		phase: room.phase,
		closed: room.closed ?? false,
		gameIndex: room.gameIndex,
		totalGames: TOTAL_GAMES,
		banker,
		youSeat: seat,
		isHost: room.hostId === playerId,
		seats: Array.from({ length: SEATS }, (_, s) => ({
			seat: s,
			name:
				room.players.find((p) => p.seat === s)?.name ??
				(room.phase === "lobby" ? null : `Bot ${s + 1}`),
			isBot: room.phase !== "lobby" && isBot(room, s),
			balance: room.balances[s] ?? START_BALANCE,
			stake: room.stakes[s] ?? 0,
			bet: room.bets[s] ?? false,
			submitted: room.submitted[s] ?? false,
		})),
		yourHand: showHand ? cardsFromIds(room.hands[seat]) : null,
		needsBet:
			seat >= 0 && room.phase === "playing" && !room.bets[seat],
		yourSubmitted: seat >= 0 ? (room.submitted[seat] ?? false) : false,
		maxStake: seat >= 0 ? maxStakeFor(room.balances[seat] ?? 0) : 0,
		minChip: MIN_CHIP,
		result: room.phase === "revealed" || room.phase === "gameover"
			? room.result
			: null,
	};
}

// --- API --------------------------------------------------------------------

class ApiError extends Error {
	status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

interface Res {
	status: number;
	body: unknown;
}

const ok = (body: unknown): Res => ({ status: 200, body });

function cleanName(name: unknown): string {
	const n = String(name ?? "").trim().slice(0, 16);
	if (!n) throw new ApiError(400, "Enter a name");
	return n;
}

async function requireRoom(code: unknown): Promise<Room> {
	const room = await loadRoom(String(code ?? ""));
	if (!room) throw new ApiError(404, "Room not found (it may have expired)");
	return room;
}

// Body shape for all POSTs; fields are validated per-route.
interface Body {
	code?: string;
	name?: string;
	playerId?: string;
	stake?: number;
	front?: string[];
	middle?: string[];
	back?: string[];
}

export async function dispatch(
	method: string,
	path: string,
	query: Record<string, string>,
	body: Body | null,
): Promise<Res> {
	try {
		if (method === "GET" && path === "state") {
			const room = await requireRoom(query.code);
			return ok(viewFor(room, query.playerId ?? ""));
		}
		if (method !== "POST") throw new ApiError(405, "Method not allowed");
		const b = body ?? {};

		switch (path) {
			case "create": {
				const playerId = crypto.randomUUID();
				const room: Room = {
					code: makeCode(),
					hostId: playerId,
					players: [{ id: playerId, name: cleanName(b.name), seat: 0 }],
					phase: "lobby",
					gameIndex: 0,
					balances: Array.from({ length: SEATS }, () => START_BALANCE),
					stakes: [],
					bets: [],
					submitted: [],
					hands: [],
					arrangements: [],
					result: null,
				};
				await saveRoom(room);
				return ok({ code: room.code, playerId });
			}

			case "join": {
				const room = await requireRoom(b.code);
				if (room.phase !== "lobby")
					throw new ApiError(409, "That match has already started");
				if (room.players.length >= SEATS)
					throw new ApiError(409, "Room is full");
				const playerId = crypto.randomUUID();
				room.players.push({
					id: playerId,
					name: cleanName(b.name),
					seat: room.players.length,
				});
				await saveRoom(room);
				return ok({ code: room.code, playerId });
			}

			case "start": {
				const room = await requireRoom(b.code);
				if (room.hostId !== b.playerId)
					throw new ApiError(403, "Only the host can start");
				if (room.phase !== "lobby")
					throw new ApiError(409, "Already started");
				dealGame(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "bet": {
				const room = await requireRoom(b.code);
				if (room.phase !== "playing")
					throw new ApiError(409, "Not accepting bets right now");
				const seat = seatOf(room, b.playerId ?? "");
				if (room.bets[seat]) throw new ApiError(409, "Bet already placed");
				const stake = Number(b.stake);
				const max = Math.min(
					maxStakeFor(room.balances[seat]),
					room.balances[seat],
				);
				if (
					!Number.isInteger(stake) ||
					stake < MIN_CHIP ||
					stake > max ||
					stake % MIN_CHIP !== 0
				)
					throw new ApiError(400, `Stake must be $${MIN_CHIP}–$${max}`);
				room.stakes[seat] = stake;
				room.bets[seat] = true;
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "submit": {
				const room = await requireRoom(b.code);
				if (room.phase !== "playing")
					throw new ApiError(409, "Not accepting hands right now");
				const seat = seatOf(room, b.playerId ?? "");
				if (!room.bets[seat])
					throw new ApiError(409, "Place your stake first");
				if (room.submitted[seat])
					throw new ApiError(409, "Hand already submitted");
				const rows: RowIds = {
					front: (b.front ?? []).map(String),
					middle: (b.middle ?? []).map(String),
					back: (b.back ?? []).map(String),
				};
				if (
					rows.front.length !== 3 ||
					rows.middle.length !== 5 ||
					rows.back.length !== 5
				)
					throw new ApiError(400, "Rows must be 3 / 5 / 5 cards");
				const submittedIds = [...rows.front, ...rows.middle, ...rows.back]
					.sort()
					.join(",");
				const dealtIds = [...room.hands[seat]].sort().join(",");
				if (submittedIds !== dealtIds)
					throw new ApiError(400, "Those aren't the cards you were dealt");
				room.arrangements[seat] = rows;
				room.submitted[seat] = true;
				if (room.submitted.every(Boolean) && room.bets.every(Boolean))
					scoreGame(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "next": {
				const room = await requireRoom(b.code);
				seatOf(room, b.playerId ?? ""); // must be a member
				if (room.phase !== "revealed")
					throw new ApiError(409, "Round not finished");
				room.gameIndex += 1;
				if (room.gameIndex >= TOTAL_GAMES) room.phase = "gameover";
				else dealGame(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// Host ends the room for everyone, in any phase. Idempotent: closing
			// an already-closed room just returns the closed view.
			case "close": {
				const room = await requireRoom(b.code);
				if (room.hostId !== b.playerId)
					throw new ApiError(403, "Only the host can close the room");
				room.closed = true;
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// A non-host leaves. Their seat becomes a bot: if a round is in
			// progress we satisfy the seat's outstanding bet/submission (its
			// cards will be arranged by arrangeBot at scoring) so the round can
			// still complete instead of stalling on the departed player.
			case "leave": {
				const room = await requireRoom(b.code);
				const seat = seatOf(room, b.playerId ?? ""); // 403 if not a member
				if (room.hostId === b.playerId)
					throw new ApiError(
						400,
						"The host closes the room instead of leaving",
					);
				room.players = room.players.filter((p) => p.id !== b.playerId);
				if (room.phase === "playing") {
					if (!room.bets[seat]) {
						room.stakes[seat] = botStake(room.balances[seat]);
						room.bets[seat] = true;
					}
					room.submitted[seat] = true;
					if (room.submitted.every(Boolean) && room.bets.every(Boolean))
						scoreGame(room);
				}
				await saveRoom(room);
				return ok({ left: true });
			}

			default:
				throw new ApiError(404, "Unknown endpoint");
		}
	} catch (e) {
		if (e instanceof ApiError)
			return { status: e.status, body: { error: e.message } };
		console.error("pusoy api error:", e);
		return { status: 500, body: { error: "Server error" } };
	}
}
