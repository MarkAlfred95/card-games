// Online Tongits room engine. Framework-free: `dispatch` maps API-shaped
// requests onto room state living in the RoomStore, and reuses the pure game
// engine + bot from src/game/tongits. The server is authoritative and the
// only place that sees every hand — views are filtered per player (your own
// hand and everyone's melds/discards are visible; opponents' hands and live
// deadwood stay hidden until the reveal).
//
// Bot seats play whole turns server-side: after every human action (and on
// state polls, as a fallback) `drainBots` advances the game until it's a
// human's turn, the round ends, or a Draw call needs human votes.
//
// Concurrency note: room updates are read-modify-write on a JSON blob with
// last-write-wins, same trade-off as the other online games.

import {
	canCallDraw,
	createRound,
	discardCard,
	drawFromStock,
	handPoints,
	layMeld,
	resolveFight,
	sapaw,
	takeFromDiscard,
} from "../src/game/tongits.js";
import type { Meld, TongitsState } from "../src/game/tongits";
import {
	decideAct,
	decideDraw,
	decideFight,
} from "../src/game/tongitsBot.js";
import {
	SEATS,
	TOTAL_ROUNDS,
	BET_OPTIONS,
	ONLINE_START_BALANCE,
} from "../src/components/game/tongits/constants.js";
import { getStore } from "./store.js";

const ROOM_TTL = 4 * 60 * 60; // seconds; refreshed on every write
const MAX_BOT_STEPS = 100; // hard cap per drain — a round is ~40 actions

type Phase = "lobby" | "playing" | "revealed" | "gameover";

interface RoomPlayer {
	id: string;
	name: string;
	seat: number;
}

// A pending Draw call: bots vote instantly, humans with melds must respond.
// null = still waiting on that seat's choice.
interface FightVote {
	caller: number;
	votes: (boolean | null)[];
}

interface Room {
	code: string;
	hostId: string;
	players: RoomPlayer[];
	phase: Phase;
	round: number; // 1-based
	bet: number;
	balances: number[];
	game: TongitsState | null; // full engine state — never sent raw to clients
	fight: FightVote | null;
	// Host closed the room mid-session. Kept (not deleted) so pollers get a
	// clear "host closed" signal instead of an ambiguous 404; the TTL reaps it.
	closed?: boolean;
}

// --- Room lifecycle ---------------------------------------------------------

const roomKey = (code: string) => `tongits:${code.toUpperCase()}`;

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

// --- Round flow ---------------------------------------------------------------

function dealRound(room: Room): void {
	room.game = createRound((room.round - 1) % SEATS, room.bet);
	room.fight = null;
	room.phase = "playing";
}

// Adopt a new engine state; if the round just ended, settle the balances and
// flip to the reveal.
function applyEngine(room: Room, next: TongitsState): void {
	room.game = next;
	if (next.result) {
		room.balances = room.balances.map(
			(b, s) => b + next.result!.moneyDeltas[s],
		);
		room.fight = null;
		room.phase = "revealed";
	}
}

// Open a Draw call: bots vote instantly, humans with no exposed meld are
// forced to fold, humans with melds get a pending vote. Resolves on the spot
// when nobody is left to ask.
function openFight(room: Room, caller: number): void {
	const game = room.game!;
	const votes: (boolean | null)[] = Array.from({ length: SEATS }, (_, s) => {
		if (s === caller) return true;
		if (isBot(room, s)) return decideFight(game, s);
		return game.players[s].melds.length === 0 ? false : null;
	});
	room.fight = { caller, votes };
	maybeResolveFight(room);
}

function maybeResolveFight(room: Room): void {
	const f = room.fight;
	if (!f || !room.game || f.votes.some((v) => v === null)) return;
	applyEngine(
		room,
		resolveFight(
			room.game,
			f.votes.map((v) => Boolean(v)),
		),
	);
	room.fight = null;
}

// Advance bot seats until a human must act, the round ends, or a Draw call
// waits on human votes. Runs after every action and on polls as a fallback.
function drainBots(room: Room): void {
	for (let i = 0; i < MAX_BOT_STEPS; i++) {
		const game = room.game;
		if (
			room.phase !== "playing" ||
			!game ||
			game.result ||
			room.fight ||
			!isBot(room, game.turn)
		)
			return;
		const seat = game.turn;
		try {
			if (game.phase === "draw") {
				const d = decideDraw(game, seat);
				if (d.type === "callDraw") {
					openFight(room, seat);
				} else if (d.type === "takeDiscard") {
					applyEngine(room, takeFromDiscard(game, d.cardIds));
				} else {
					applyEngine(room, drawFromStock(game));
				}
			} else {
				const a = decideAct(game, seat);
				if (a.type === "meld") {
					applyEngine(room, layMeld(game, a.cardIds));
				} else if (a.type === "sapaw") {
					applyEngine(room, sapaw(game, a.meldId, a.cardIds));
				} else {
					applyEngine(room, discardCard(game, a.cardId));
				}
			}
		} catch {
			// Safety net: keep the game moving with the simplest legal action.
			try {
				applyEngine(
					room,
					game.phase === "draw"
						? drawFromStock(game)
						: discardCard(game, game.players[seat].hand[0].id),
				);
			} catch {
				return; // give up this drain; the poll fallback retries
			}
		}
	}
}

// --- Per-player view -----------------------------------------------------------

interface SeatMeldView {
	id: number;
	type: Meld["type"];
	owner: number;
	cards: string[];
}

function viewFor(room: Room, playerId: string) {
	const seat = room.players.find((p) => p.id === playerId)?.seat ?? -1;
	const game = room.game;
	const showAll = room.phase === "revealed" || room.phase === "gameover";

	return {
		code: room.code,
		phase: room.phase,
		closed: room.closed ?? false,
		round: room.round,
		totalRounds: TOTAL_ROUNDS,
		bet: room.bet,
		youSeat: seat,
		isHost: room.hostId === playerId,
		startBalance: ONLINE_START_BALANCE,
		seats: Array.from({ length: SEATS }, (_, s) => ({
			seat: s,
			name:
				room.players.find((p) => p.seat === s)?.name ??
				(room.phase === "lobby" ? null : `Bot ${s + 1}`),
			isBot: room.phase !== "lobby" && isBot(room, s),
			balance: room.balances[s] ?? ONLINE_START_BALANCE,
			cardCount: game?.players[s].hand.length ?? 0,
			melds: (game?.players[s].melds ?? []).map(
				(m): SeatMeldView => ({
					id: m.id,
					type: m.type,
					owner: m.owner,
					cards: m.cards.map((c) => c.id),
				}),
			),
			drawBlocked: game?.players[s].drawBlocked ?? false,
			// Live deadwood is private — own seat only until the reveal.
			deadwood:
				game && (s === seat || showAll)
					? handPoints(game.players[s].hand)
					: null,
		})),
		game: game
			? {
					dealer: game.dealer,
					turn: game.turn,
					turnPhase: game.phase,
					turnCount: game.turnCount,
					stockCount: game.stock.length,
					discard: game.discard.map((c) => c.id),
					yourHand:
						seat >= 0
							? game.players[seat].hand.map((c) => c.id)
							: [],
					canCallDraw: seat >= 0 && canCallDraw(game, seat),
					result: game.result
						? {
								...game.result,
								// Reveal every hand alongside the count.
								hands: game.players.map((p) =>
									p.hand.map((c) => c.id),
								),
							}
						: null,
				}
			: null,
		fight: room.fight
			? {
					caller: room.fight.caller,
					yourVote: seat >= 0 ? room.fight.votes[seat] : null,
					waitingOn: room.fight.votes
						.map((v, s) => (v === null ? s : -1))
						.filter((s) => s >= 0),
				}
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

// Guard for the in-round action endpoints: playing phase, no pending Draw
// vote, and it's this player's turn. Returns the seat.
function requireTurn(room: Room, playerId: unknown): number {
	if (room.phase !== "playing" || !room.game)
		throw new ApiError(409, "No round in progress");
	if (room.fight)
		throw new ApiError(409, "Waiting on Draw responses");
	const seat = seatOf(room, String(playerId ?? ""));
	if (room.game.turn !== seat) throw new ApiError(409, "Not your turn");
	return seat;
}

// Run an engine call, mapping rule violations to a 409 with the engine's
// player-facing message.
function engine(room: Room, fn: (game: TongitsState) => TongitsState): void {
	try {
		applyEngine(room, fn(room.game!));
	} catch (e) {
		throw new ApiError(409, e instanceof Error ? e.message : "Illegal move");
	}
}

// Body shape for all POSTs; fields are validated per-route.
interface Body {
	code?: string;
	name?: string;
	playerId?: string;
	bet?: number;
	cardIds?: string[];
	cardId?: string;
	meldId?: number;
	fight?: boolean;
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
			// Fallback drain: keeps a room moving even if the last action's
			// drain was interrupted.
			if (room.phase === "playing") {
				drainBots(room);
				await saveRoom(room);
			}
			return ok(viewFor(room, query.playerId ?? ""));
		}
		if (method !== "POST") throw new ApiError(405, "Method not allowed");
		const b = body ?? {};

		switch (path) {
			case "create": {
				const bet = Number(b.bet ?? BET_OPTIONS[2]);
				if (!BET_OPTIONS.includes(bet))
					throw new ApiError(400, "Pick a valid stake");
				const playerId = crypto.randomUUID();
				const room: Room = {
					code: makeCode(),
					hostId: playerId,
					players: [{ id: playerId, name: cleanName(b.name), seat: 0 }],
					phase: "lobby",
					round: 1,
					bet,
					balances: Array.from(
						{ length: SEATS },
						() => ONLINE_START_BALANCE,
					),
					game: null,
					fight: null,
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
				dealRound(room);
				drainBots(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "draw": {
				const room = await requireRoom(b.code);
				requireTurn(room, b.playerId);
				engine(room, (g) => drawFromStock(g));
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "take": {
				const room = await requireRoom(b.code);
				requireTurn(room, b.playerId);
				const ids = (b.cardIds ?? []).map(String);
				engine(room, (g) => takeFromDiscard(g, ids));
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "meld": {
				const room = await requireRoom(b.code);
				requireTurn(room, b.playerId);
				const ids = (b.cardIds ?? []).map(String);
				engine(room, (g) => layMeld(g, ids));
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "sapaw": {
				const room = await requireRoom(b.code);
				requireTurn(room, b.playerId);
				const ids = (b.cardIds ?? []).map(String);
				engine(room, (g) => sapaw(g, Number(b.meldId), ids));
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "discard": {
				const room = await requireRoom(b.code);
				requireTurn(room, b.playerId);
				engine(room, (g) => discardCard(g, String(b.cardId ?? "")));
				drainBots(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "callDraw": {
				const room = await requireRoom(b.code);
				const seat = requireTurn(room, b.playerId);
				if (!canCallDraw(room.game!, seat))
					throw new ApiError(409, "You can’t call Draw right now");
				openFight(room, seat);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// Respond to a pending Draw call: fight or fold.
			case "fight": {
				const room = await requireRoom(b.code);
				if (room.phase !== "playing" || !room.fight)
					throw new ApiError(409, "No Draw call to answer");
				const seat = seatOf(room, String(b.playerId ?? ""));
				if (room.fight.votes[seat] !== null)
					throw new ApiError(409, "You already responded");
				room.fight.votes[seat] = Boolean(b.fight);
				maybeResolveFight(room);
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			case "next": {
				const room = await requireRoom(b.code);
				seatOf(room, String(b.playerId ?? "")); // must be a member
				if (room.phase !== "revealed")
					throw new ApiError(409, "Round not finished");
				room.round += 1;
				if (room.round > TOTAL_ROUNDS) room.phase = "gameover";
				else {
					dealRound(room);
					drainBots(room);
				}
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// Host ends the room for everyone, in any phase. Idempotent.
			case "close": {
				const room = await requireRoom(b.code);
				if (room.hostId !== b.playerId)
					throw new ApiError(403, "Only the host can close the room");
				room.closed = true;
				await saveRoom(room);
				return ok(viewFor(room, b.playerId ?? ""));
			}

			// A non-host leaves. Their seat becomes a bot: any pending Draw
			// vote is answered with the bot heuristic, and if it was their
			// turn the bot drain finishes it so the round never stalls.
			case "leave": {
				const room = await requireRoom(b.code);
				const seat = seatOf(room, String(b.playerId ?? "")); // 403 if not a member
				if (room.hostId === b.playerId)
					throw new ApiError(
						400,
						"The host closes the room instead of leaving",
					);
				room.players = room.players.filter((p) => p.id !== b.playerId);
				if (room.phase === "playing" && room.game) {
					if (room.fight && room.fight.votes[seat] === null) {
						room.fight.votes[seat] = decideFight(room.game, seat);
						maybeResolveFight(room);
					}
					drainBots(room);
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
		console.error("tongits api error:", e);
		return { status: 500, body: { error: "Server error" } };
	}
}
