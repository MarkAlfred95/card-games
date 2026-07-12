// Tongits (3-player Filipino rummy) game engine. Pure functions — no React.
// Like pokerEngine.ts, the state flows through reducer-style functions that
// take a state and return a fresh one (spread/map, never mutate). Illegal
// actions throw an Error whose message is shown to the player as-is.
//
// Rules implemented (common "official" Tongits):
// - 52-card deck, no jokers. Dealer gets 13 cards, the others 12; the rest
//   is the face-down stock. The dealer opens the round WITHOUT drawing.
// - A turn is: draw (stock, or the top discard if it immediately completes a
//   meld) → optionally lay melds / sapaw exposed melds → discard one card.
// - Melds: sets (3–4 of a rank) and runs (3+ consecutive, same suit, ace low).
// - Sapaw: adding card(s) to any exposed meld. Being sapawed blocks the meld's
//   owner from calling Draw until they lay or extend a meld themselves.
// - Ways a round ends:
//   · Tongits — a player empties their hand (by meld, sapaw, or final discard).
//   · Stockout ("burn") — the stock runs out; lowest hand count wins.
//   · Fight — a player calls Draw instead of drawing; others with exposed
//     melds may challenge or fold; lowest count among the fighters wins.
// - Counting: every card still in hand counts (A=1, pips face value, faces
//   10) — exposed melds don't. That's the incentive to lay melds down.
// - A player with no exposed meld at the end is "burned" and pays double.

import type { Card, Rank } from './types'
import { buildDeck, shuffle } from './deck.js'

export const TONGITS_SEATS = 3
export const HAND_SIZE = 12 // non-dealer hand; the dealer gets one extra

// Ace plays LOW in Tongits: A-2-3 is a run, Q-K-A is not.
export const TONGITS_RANK_ORDER: Record<Rank, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  '10': 10, J: 11, Q: 12, K: 13,
}

// Counting value of a card left in hand: A=1, pips face value, J/Q/K=10.
export function cardValue(card: Card): number {
  return Math.min(TONGITS_RANK_ORDER[card.rank], 10)
}

export function handPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0)
}

// --- Melds -----------------------------------------------------------------

export type MeldType = 'set' | 'run'

export interface Meld {
  id: number
  type: MeldType
  owner: number // seat that laid it (sapawed cards join the owner's meld)
  cards: Card[] // runs are kept sorted low → high
}

export function sortRun(cards: Card[]): Card[] {
  return [...cards].sort(
    (a, b) => TONGITS_RANK_ORDER[a.rank] - TONGITS_RANK_ORDER[b.rank],
  )
}

function isConsecutive(sorted: Card[]): boolean {
  for (let i = 1; i < sorted.length; i++) {
    if (
      TONGITS_RANK_ORDER[sorted[i].rank] !==
      TONGITS_RANK_ORDER[sorted[i - 1].rank] + 1
    )
      return false
  }
  return true
}

// The meld type these cards form, or null when they aren't a legal meld.
export function meldTypeOf(cards: Card[]): MeldType | null {
  if (cards.length < 3) return null
  if (cards.every((c) => c.rank === cards[0].rank))
    return cards.length <= 4 ? 'set' : null
  if (!cards.every((c) => c.suit === cards[0].suit)) return null
  return isConsecutive(sortRun(cards)) ? 'run' : null
}

// The meld's card list after a legal sapaw with `adds`, or null if illegal.
// Sets cap at 4 of a kind; runs may extend from either end (or both at once).
export function extendMeld(meld: Meld, adds: Card[]): Card[] | null {
  if (!adds.length) return null
  if (meld.type === 'set') {
    if (meld.cards.length + adds.length > 4) return null
    return adds.every((c) => c.rank === meld.cards[0].rank)
      ? [...meld.cards, ...adds]
      : null
  }
  if (!adds.every((c) => c.suit === meld.cards[0].suit)) return null
  const combined = sortRun([...meld.cards, ...adds])
  return isConsecutive(combined) ? combined : null
}

// Every minimal hand-card subset that forms a meld together with `card` (used
// to validate taking the top discard). Each entry lists the HAND cards only.
export function meldsWithCard(hand: Card[], card: Card): Card[][] {
  const out: Card[][] = []

  // Sets: pick 2 or 3 hand cards of the same rank.
  const sameRank = hand.filter((c) => c.rank === card.rank)
  for (let i = 0; i < sameRank.length; i++) {
    for (let j = i + 1; j < sameRank.length; j++) {
      out.push([sameRank[i], sameRank[j]])
      for (let k = j + 1; k < sameRank.length; k++) {
        out.push([sameRank[i], sameRank[j], sameRank[k]])
      }
    }
  }

  // Runs: any consecutive same-suit window that contains `card`.
  const byOrder = new Map<number, Card>()
  for (const c of hand) {
    if (c.suit === card.suit) byOrder.set(TONGITS_RANK_ORDER[c.rank], c)
  }
  const o = TONGITS_RANK_ORDER[card.rank]
  for (let lo = o - 12; lo <= o; lo++) {
    if (lo < 1) continue
    for (let hi = Math.max(o, lo + 2); hi <= 13; hi++) {
      let ok = true
      const cards: Card[] = []
      for (let v = lo; v <= hi; v++) {
        if (v === o) continue
        const c = byOrder.get(v)
        if (!c) {
          ok = false
          break
        }
        cards.push(c)
      }
      if (!ok) break // a longer window from this `lo` can't be complete either
      if (hi - lo >= 2) out.push(cards)
    }
  }
  return out
}

// --- Best arrangement (rules analysis, shared by the bot and the UI) --------

export interface Arranged {
  melds: Card[][]
  deadwood: Card[]
  value: number // total points of the deadwood cards
}

// Candidate melds that include `first`, drawn from `cards`.
function candidateMeldsWith(cards: Card[], first: Card): Card[][] {
  const out: Card[][] = []
  const others = cards.filter(
    (c) => c.id !== first.id && c.rank === first.rank,
  )
  for (let i = 0; i < others.length; i++) {
    for (let j = i + 1; j < others.length; j++) {
      out.push([first, others[i], others[j]])
      for (let k = j + 1; k < others.length; k++) {
        out.push([first, others[i], others[j], others[k]])
      }
    }
  }
  const byOrder = new Map<number, Card>()
  for (const c of cards) {
    if (c.suit === first.suit) byOrder.set(TONGITS_RANK_ORDER[c.rank], c)
  }
  const o = TONGITS_RANK_ORDER[first.rank]
  for (let lo = Math.max(1, o - 12); lo <= o; lo++) {
    for (let hi = Math.max(o, lo + 2); hi <= 13; hi++) {
      const run: Card[] = []
      let ok = true
      for (let v = lo; v <= hi; v++) {
        const c = byOrder.get(v)
        if (!c) {
          ok = false
          break
        }
        run.push(c)
      }
      if (!ok) break
      if (hi - lo >= 2) out.push(run)
    }
  }
  return out
}

// Partition `cards` into melds + deadwood minimizing the deadwood points.
// Exhaustive search with memoization — hands are at most 14 cards, so the
// state space stays tiny.
export function bestArrangement(cards: Card[]): Arranged {
  const sorted = [...cards].sort(
    (a, b) =>
      a.suit.localeCompare(b.suit) ||
      TONGITS_RANK_ORDER[a.rank] - TONGITS_RANK_ORDER[b.rank],
  )
  const memo = new Map<string, Arranged>()

  function search(remaining: Card[]): Arranged {
    if (!remaining.length) return { melds: [], deadwood: [], value: 0 }
    const key = remaining.map((c) => c.id).join(',')
    const hit = memo.get(key)
    if (hit) return hit

    const [first, ...rest] = remaining
    const asDeadwood = search(rest)
    let best: Arranged = {
      melds: asDeadwood.melds,
      deadwood: [first, ...asDeadwood.deadwood],
      value: asDeadwood.value + cardValue(first),
    }
    for (const meld of candidateMeldsWith(remaining, first)) {
      const used = new Set(meld.map((c) => c.id))
      const sub = search(remaining.filter((c) => !used.has(c.id)))
      if (sub.value < best.value) {
        best = {
          melds: [meld, ...sub.melds],
          deadwood: sub.deadwood,
          value: sub.value,
        }
      }
    }
    memo.set(key, best)
    return best
  }

  return search(sorted)
}

// --- Round state -----------------------------------------------------------

export type TurnPhase = 'draw' | 'act'

export interface TongitsPlayerState {
  hand: Card[]
  melds: Meld[]
  // Set when an opponent sapawed one of this seat's melds; cleared when the
  // seat lays or extends a meld. While set, the seat cannot call Draw.
  drawBlocked: boolean
}

export type EndKind = 'tongits' | 'stockout' | 'fight'

export interface TongitsResult {
  kind: EndKind
  winner: number
  // Fight only: who called it and who chose to fight (caller included).
  caller?: number
  fought?: boolean[]
  points: number[] // per-seat hand count at the end
  burned: boolean[] // seats that never exposed a meld (pay double)
  moneyDeltas: number[] // zero-sum, winner collects from every loser
}

export interface TongitsState {
  players: TongitsPlayerState[]
  stock: Card[]
  discard: Card[] // last element is the top of the pile
  dealer: number
  turn: number
  phase: TurnPhase
  turnCount: number // completed turns, for "everyone has played" checks
  bet: number // per-round stake unit used for settlement
  meldSeq: number
  result: TongitsResult | null
}

export function topDiscard(state: TongitsState): Card | null {
  return state.discard.length ? state.discard[state.discard.length - 1] : null
}

// Deal a fresh round: 12 cards each round-robin starting left of the dealer,
// one extra to the dealer, remainder to the stock. The dealer opens in the
// 'act' phase — their 13th card replaces the opening draw.
export function createRound(dealer: number, bet: number): TongitsState {
  const deck = shuffle(buildDeck())
  const hands: Card[][] = Array.from({ length: TONGITS_SEATS }, () => [])
  for (let c = 0; c < HAND_SIZE; c++) {
    for (let p = 0; p < TONGITS_SEATS; p++) {
      hands[(dealer + p) % TONGITS_SEATS].push(deck[c * TONGITS_SEATS + p])
    }
  }
  hands[dealer].push(deck[HAND_SIZE * TONGITS_SEATS])
  return {
    players: hands.map((hand) => ({ hand, melds: [], drawBlocked: false })),
    stock: deck.slice(HAND_SIZE * TONGITS_SEATS + 1),
    discard: [],
    dealer,
    turn: dealer,
    phase: 'act',
    turnCount: 0,
    bet,
    meldSeq: 1,
    result: null,
  }
}

// --- Internal helpers --------------------------------------------------------

function assertPlayable(state: TongitsState, phase: TurnPhase) {
  if (state.result) throw new Error('The round is over')
  if (state.phase !== phase) {
    throw new Error(
      phase === 'draw'
        ? 'You already drew — lay melds or discard to end your turn'
        : 'Draw a card first',
    )
  }
}

// Split `hand` into the cards matching `ids` (in id order) and the rest.
function takeFromHand(hand: Card[], ids: string[]): { taken: Card[]; rest: Card[] } {
  const wanted = new Set(ids)
  if (wanted.size !== ids.length) throw new Error('Duplicate cards selected')
  const taken = hand.filter((c) => wanted.has(c.id))
  if (taken.length !== wanted.size)
    throw new Error('Selected cards are not in your hand')
  return { taken, rest: hand.filter((c) => !wanted.has(c.id)) }
}

function withPlayer(
  state: TongitsState,
  seat: number,
  update: (p: TongitsPlayerState) => TongitsPlayerState,
): TongitsState {
  return {
    ...state,
    players: state.players.map((p, s) => (s === seat ? update(p) : p)),
  }
}

// Per-loser payment in bet units: 1 base, +1 if burned, +1 against a Tongits,
// +1 for losing a fight they chose to join.
function settle(
  kind: EndKind,
  winner: number,
  burned: boolean[],
  fought: boolean[] | undefined,
  bet: number,
): number[] {
  const deltas = Array<number>(TONGITS_SEATS).fill(0)
  for (let s = 0; s < TONGITS_SEATS; s++) {
    if (s === winner) continue
    let units = 1
    if (burned[s]) units += 1
    if (kind === 'tongits') units += 1
    if (kind === 'fight' && fought?.[s]) units += 1
    deltas[s] = -units * bet
    deltas[winner] += units * bet
  }
  return deltas
}

function finish(
  state: TongitsState,
  kind: EndKind,
  winner: number,
  extra?: { caller: number; fought: boolean[] },
): TongitsState {
  const points = state.players.map((p) => handPoints(p.hand))
  const burned = state.players.map((p) => p.melds.length === 0)
  return {
    ...state,
    result: {
      kind,
      winner,
      caller: extra?.caller,
      fought: extra?.fought,
      points,
      burned,
      moneyDeltas: settle(kind, winner, burned, extra?.fought, state.bet),
    },
  }
}

// Winner among `candidates`: lowest hand count, ties going to whichever seat
// comes first in `order`.
function lowestCount(
  state: TongitsState,
  candidates: number[],
  order: number[],
): number {
  const ranked = order.filter((s) => candidates.includes(s))
  let winner = ranked[0]
  for (const s of ranked) {
    if (handPoints(state.players[s].hand) < handPoints(state.players[winner].hand))
      winner = s
  }
  return winner
}

// Clockwise seat order starting at `from`.
function orderFrom(from: number): number[] {
  return Array.from(
    { length: TONGITS_SEATS },
    (_, i) => (from + i) % TONGITS_SEATS,
  )
}

// --- Actions -----------------------------------------------------------------

export function drawFromStock(state: TongitsState): TongitsState {
  assertPlayable(state, 'draw')
  if (!state.stock.length) throw new Error('The stock is empty')
  const card = state.stock[0]
  const next = withPlayer(state, state.turn, (p) => ({
    ...p,
    hand: [...p.hand, card],
  }))
  return { ...next, stock: state.stock.slice(1), phase: 'act' }
}

// Take the top discard — only legal when it immediately completes a meld with
// the given hand cards. The meld is exposed on the spot.
export function takeFromDiscard(
  state: TongitsState,
  handCardIds: string[],
): TongitsState {
  assertPlayable(state, 'draw')
  const top = topDiscard(state)
  if (!top) throw new Error('The discard pile is empty')
  const { taken, rest } = takeFromHand(state.players[state.turn].hand, handCardIds)
  const cards = [...taken, top]
  const type = meldTypeOf(cards)
  if (!type)
    throw new Error('The top discard must complete a set or run with your cards')
  const meld: Meld = {
    id: state.meldSeq,
    type,
    owner: state.turn,
    cards: type === 'run' ? sortRun(cards) : cards,
  }
  let next = withPlayer(state, state.turn, (p) => ({
    ...p,
    hand: rest,
    melds: [...p.melds, meld],
    drawBlocked: false,
  }))
  next = {
    ...next,
    discard: state.discard.slice(0, -1),
    phase: 'act',
    meldSeq: state.meldSeq + 1,
  }
  // Emptying the hand this way is an immediate Tongits.
  if (!rest.length) return finish(next, 'tongits', state.turn)
  return next
}

// Lay a new meld from hand. Emptying the hand is an immediate Tongits.
export function layMeld(state: TongitsState, cardIds: string[]): TongitsState {
  assertPlayable(state, 'act')
  const { taken, rest } = takeFromHand(state.players[state.turn].hand, cardIds)
  const type = meldTypeOf(taken)
  if (!type)
    throw new Error(
      'Not a valid meld — you need 3–4 of a kind, or 3+ consecutive cards of one suit',
    )
  const meld: Meld = {
    id: state.meldSeq,
    type,
    owner: state.turn,
    cards: type === 'run' ? sortRun(taken) : taken,
  }
  let next = withPlayer(state, state.turn, (p) => ({
    ...p,
    hand: rest,
    melds: [...p.melds, meld],
    drawBlocked: false,
  }))
  next = { ...next, meldSeq: state.meldSeq + 1 }
  if (!rest.length) return finish(next, 'tongits', state.turn)
  return next
}

// Sapaw: extend any exposed meld (yours or an opponent's) with hand cards.
// Sapawing an opponent blocks them from calling Draw until they meld again;
// laying or extending anything clears your own block.
export function sapaw(
  state: TongitsState,
  meldId: number,
  cardIds: string[],
): TongitsState {
  assertPlayable(state, 'act')
  const ownerSeat = state.players.findIndex((p) =>
    p.melds.some((m) => m.id === meldId),
  )
  if (ownerSeat < 0) throw new Error('That meld no longer exists')
  const meld = state.players[ownerSeat].melds.find((m) => m.id === meldId)!
  const { taken, rest } = takeFromHand(state.players[state.turn].hand, cardIds)
  const extended = extendMeld(meld, taken)
  if (!extended) throw new Error('Those cards can’t extend that meld')

  let next = withPlayer(state, ownerSeat, (p) => ({
    ...p,
    melds: p.melds.map((m) => (m.id === meldId ? { ...m, cards: extended } : m)),
    drawBlocked: ownerSeat !== state.turn ? true : p.drawBlocked,
  }))
  next = withPlayer(next, state.turn, (p) => ({
    ...p,
    hand: rest,
    drawBlocked: false,
  }))
  if (!rest.length) return finish(next, 'tongits', state.turn)
  return next
}

// Discard to end the turn. Discarding the last card is a Tongits; otherwise
// play passes clockwise, and if the stock is empty the round ends in a
// stockout count.
export function discardCard(state: TongitsState, cardId: string): TongitsState {
  assertPlayable(state, 'act')
  const { taken, rest } = takeFromHand(state.players[state.turn].hand, [cardId])
  let next = withPlayer(state, state.turn, (p) => ({ ...p, hand: rest }))
  next = { ...next, discard: [...state.discard, taken[0]] }
  if (!rest.length) return finish(next, 'tongits', state.turn)

  const nextTurn = (state.turn + 1) % TONGITS_SEATS
  next = {
    ...next,
    turn: nextTurn,
    phase: 'draw',
    turnCount: state.turnCount + 1,
  }
  if (!next.stock.length) return resolveStockout(next)
  return next
}

// Stock exhausted: lowest count wins. Burned seats (no exposed meld) can't
// win unless everyone is burned. Ties go to whoever is next in turn order.
export function resolveStockout(state: TongitsState): TongitsState {
  const unburned = state.players
    .map((_, s) => s)
    .filter((s) => state.players[s].melds.length > 0)
  const candidates = unburned.length
    ? unburned
    : state.players.map((_, s) => s)
  return finish(state, 'stockout', lowestCount(state, candidates, orderFrom(state.turn)))
}

// Whether `seat` may call Draw right now: their turn, before drawing, at least
// one exposed meld, not blocked by a sapaw, and everyone has had a turn.
export function canCallDraw(state: TongitsState, seat: number): boolean {
  return (
    !state.result &&
    state.turn === seat &&
    state.phase === 'draw' &&
    state.turnCount >= TONGITS_SEATS &&
    state.players[seat].melds.length > 0 &&
    !state.players[seat].drawBlocked
  )
}

// Resolve a called Draw. `fights[s]` is each other seat's challenge choice —
// seats with no exposed meld are forced to fold (and count as burned). Lowest
// count among the caller and challengers wins; ties favor the caller, then
// clockwise order from the caller.
export function resolveFight(
  state: TongitsState,
  fights: boolean[],
): TongitsState {
  const caller = state.turn
  if (!canCallDraw(state, caller)) throw new Error('You can’t call Draw right now')
  const fought = state.players.map(
    (p, s) => s === caller || (Boolean(fights[s]) && p.melds.length > 0),
  )
  const participants = fought
    .map((f, s) => (f ? s : -1))
    .filter((s) => s >= 0)
  const winner = lowestCount(state, participants, orderFrom(caller))
  return finish(state, 'fight', winner, { caller, fought })
}
