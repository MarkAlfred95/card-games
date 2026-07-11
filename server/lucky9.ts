// Online Lucky 9 room engine. Framework-free: `dispatch` maps API-shaped
// requests onto room state living in the RoomStore, and reuses the pure game
// module from src/game/lucky9 for values, bot draws, and settlement. The
// server is the only place that sees every hand — views are filtered per
// player, and (unlike the solo game) a player must bet BEFORE seeing their
// cards: betting after a peek would be a pure exploit against a human banker.
//
// Concurrency note: room updates are read-modify-write on a JSON blob with
// last-write-wins. At friends-playing-a-card-game scale the race window is
// negligible; move to a Redis WATCH/Lua flow if it ever matters.

import { buildDeck, shuffle, deal } from "../src/game/deck.js";
import {
	natural,
	botWantsCard,
	settleRound,
	handValue,
	NATURAL_NAMES,
} from "../src/game/lucky9.js";
import type { Card, Rank, Suit } from "../src/game/types";
import {
	SEATS,
	GAMES_PER_BANKER,
	TOTAL_GAMES,
	MIN_CHIP,
	COMEBACK_STAKE,
	ONLINE_START_BALANCE,
	maxBetFor,
} from "../src/components/game/lucky-nine/constants.js";
import { getStore } from "./store.js";

const ROOM_TTL = 4 * 60 * 60; // seconds; refreshed on every write
const START_BALANCE = ONLINE_START_BALANCE;

type Phase = "lobby" | "playing" | "revealed" | "gameover";

interface RoomPlayer {
	id: string;
	name: string;
	seat: number;
}

// What the reveal needs, precomputed server-side so clients stay dumb.
interface RoundResultView {
	moneyDeltas: number[];
	values: number[];
	naturals: (string | null)[];
	hands: string[][]; // every seat's cards, revealed
}

interface Room {
	code: string;
	hostId: string;
	players: RoomPlayer[];
	phase: Phase;
	gameIndex: number;
	balances: number[];
	stakes: number[];
	bets: boolean[]; // bet locked in for this game (bots/banker: true)
	moved: boolean[]; // hirit-or-stand decided (bots: true at deal)
	hands: string[][]; // card ids per seat (2–3 cards)
	stock: string[]; // undealt card ids, drawn from on hirit
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

function botBet(balance: number): number {
	if (balance < MIN_CHIP) return COMEBACK_STAKE;
	const target = balance * (0.02 + Math.random() * 0.06);
	const bet = Math.round(target / MIN_CHIP) * MIN_CHIP;
	return Math.min(Math.max(bet, MIN_CHIP), Math.max(MIN_CHIP, balance / 2));
}

// --- Room lifecycle ---------------------------------------------------------

const roomKey = (code: string) => `lucky9:${code.toUpperCase()}`;

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

const seatCards = (room: Room, seat: number) =>
	cardsFromIds(room.hands[seat]);

// Deal a fresh game: two cards per seat, bot bets, everyone un-moved. Bots
// and the banker skip betting; a broke human is auto-staked the comeback
// stake. Non-banker bots make their hirit call immediately (their third card
// is public knowledge, as in the solo game); a bot banker draws last, at
// scoring time, so its decision isn't leaked while humans are still choosing.
function dealGame(room: Room): void {
	const banker = bankerOf(room.gameIndex);
	const deck = shuffle(buildDeck());
	const hands = deal(deck, SEATS, 2);
	room.hands = hands.map((h) => h.map((c) => c.id));
	room.stock = deck.slice(SEATS * 2).map((c) => c.id);
	room.result = null;
	room.stakes = Array.from({ length: SEATS }, (_, s) => {
		if (s === banker) return 0;
		if (isBot(room, s)) return botBet(room.balances[s]);
		return room.balances[s] < MIN_CHIP ? COMEBACK_STAKE : 0;
	});
	room.bets = Array.from(
		{ length: SEATS },
		(_, s) =>
			s === banker || isBot(room, s) || room.balances[s] < MIN_CHIP,
	);
	room.moved = Array.from({ length: SEATS }, (_, s) => isBot(room, s));
	for (let s = 0; s < SEATS; s++) {
		if (s !== banker && isBot(room, s) && botWantsCard(seatCards(room, s)))
			drawFromStock(room, s);
	}
	room.phase = "playing";
}

function drawFromStock(room: Room, seat: number): void {
	const card = room.stock.shift();
	if (!card) throw new ApiError(500, "The deck ran out"); // 4 seats can't exhaust 52
	room.hands[seat] = [...room.hands[seat], card];
}

// All humans have bet and moved -> the banker (if a bot) draws, then settle.
function maybeScore(room: Room): void {
	if (!room.bets.every(Boolean) || !room.moved.every(Boolean)) return;
	const banker = bankerOf(room.gameIndex);
	if (isBot(room, banker) && botWantsCard(seatCards(room, banker)))
		drawFromStock(room, banker);
	const hands = room.hands.map(cardsFromIds);
	const res = settleRound(hands, banker, room.stakes);
	room.balances = room.balances.map((b, s) => b + res.moneyDeltas[s]);
	room.result = {
		moneyDeltas: res.moneyDeltas,
		values: hands.map(handValue),
		naturals: res.naturals.map((n) => (n ? NATURAL_NAMES[n] : null)),
		hands: room.hands,
	};
	room.phase = "revealed";
}

// --- Per-player view (hides everyone else's cards) ---------------------------

function viewFor(room: Room, playerId: string) {
	const seat = room.players.find((p) => p.id === playerId)?.seat ?? -1;
	const banker = bankerOf(room.gameIndex);
	// Your cards stay hidden until your bet is down (the banker never bets, so
	// they see theirs immediately).
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
			moved: room.moved[s] ?? false,
			// Fan size only — 3 cards says a seat took a hirit, same as solo.
			cardCount: room.hands[s]?.length ?? 0,
		})),
		yourHand: showHand ? cardsFromIds(room.hands[seat]) : null,
		needsBet: seat >= 0 && room.phase === "playing" && !room.bets[seat],
		yourMoved: seat >= 0 ? (room.moved[seat] ?? false) : false,
		maxBet: seat >= 0 ? maxBetFor(room.balances[seat] ?? 0, 1) : 0,
		minChip: MIN_CHIP,
		result:
			room.phase === "revealed" || room.phase === "gameover"
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
	bet?: number;
	action?: string;
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
					moved: [],
					hands: [],
					stock: [],
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
				const bet = Number(b.bet);
				const max = Math.min(
					maxBetFor(room.balances[seat], 1),
					room.balances[seat],
				);
				if (
					!Number.isInteger(bet) ||
					bet < MIN_CHIP ||
					bet > max ||
					bet % MIN_CHIP !== 0
				)
					throw new ApiError(400, `Bet must be $${MIN_CHIP}–$${max}`);
				room.stakes[seat] = bet;
				room.bets[seat] = true;
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// The one decision of the game: hirit (draw a third card) or stand.
			case "move": {
				const room = await requireRoom(b.code);
				if (room.phase !== "playing")
					throw new ApiError(409, "Not accepting moves right now");
				const seat = seatOf(room, b.playerId ?? "");
				if (!room.bets[seat])
					throw new ApiError(409, "Place your bet first");
				if (room.moved[seat])
					throw new ApiError(409, "You already played");
				if (b.action === "hirit") {
					const cards = seatCards(room, seat);
					if (natural(cards))
						throw new ApiError(409, "Naturals stand — no hirit");
					drawFromStock(room, seat);
				} else if (b.action !== "stand") {
					throw new ApiError(400, "Action must be hirit or stand");
				}
				room.moved[seat] = true;
				maybeScore(room);
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
			// progress we satisfy the seat's outstanding bet/move (with the bot
			// draw strategy) so the round completes instead of stalling on the
			// departed player.
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
						room.stakes[seat] = botBet(room.balances[seat]);
						room.bets[seat] = true;
					}
					if (!room.moved[seat]) {
						if (botWantsCard(seatCards(room, seat)))
							drawFromStock(room, seat);
						room.moved[seat] = true;
					}
					maybeScore(room);
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
		console.error("lucky9 api error:", e);
		return { status: 500, body: { error: "Server error" } };
	}
}
