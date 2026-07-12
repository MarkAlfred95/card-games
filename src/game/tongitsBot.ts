// Tongits bot. Pure decision functions over TongitsState — the page executes
// one decision per animation tick, so each function re-derives its plan from
// the current state (cheap: hands are ≤14 cards).
//
// Strategy, in priority order:
// 1. Take the top discard whenever melding it lowers the hand's best-case
//    deadwood (free meld + tempo).
// 2. Expose melds (kept-back melds still count against you at the count).
// 3. Sapaw with deadwood cards — never with cards a planned meld needs.
// 4. Discard the least useful card: dead cards first, highest points first,
//    discounted by how likely the card is to complete a future meld given
//    every card the bot has seen (discards + exposed melds + own hand).
// 5. Call Draw when its own count is low and the table looks beatable.

import type { Card } from './types'
import {
  TONGITS_RANK_ORDER,
  bestArrangement,
  canCallDraw,
  cardValue,
  extendMeld,
  handPoints,
  meldsWithCard,
  topDiscard,
} from './tongits.js'
import type { Meld, TongitsState } from './tongits'

export type BotDrawDecision =
  | { type: 'callDraw' }
  | { type: 'takeDiscard'; cardIds: string[] }
  | { type: 'stock' }

export type BotActDecision =
  | { type: 'meld'; cardIds: string[] }
  | { type: 'sapaw'; meldId: number; cardIds: string[] }
  | { type: 'discard'; cardId: string }

// Every card the bot can see: the discard pile, all exposed melds, and its
// own hand. Used to count remaining "outs" for partial melds.
function seenCards(state: TongitsState, seat: number): Card[] {
  return [
    ...state.discard,
    ...state.players.flatMap((p) => p.melds.flatMap((m) => m.cards)),
    ...state.players[seat].hand,
  ]
}

// How many unseen cards would complete a meld with `card` given the rest of
// the hand: pair → set outs, suited near-neighbors → run outs.
function meldOuts(card: Card, hand: Card[], seen: Card[]): number {
  const seenIds = new Set(seen.map((c) => c.id))
  let outs = 0

  // Set potential: for each same-rank partner in hand, the other two copies.
  const partners = hand.filter(
    (c) => c.id !== card.id && c.rank === card.rank,
  ).length
  if (partners >= 1) {
    const unseenCopies = 4 - 1 - partners // copies not in our hand
    outs += Math.max(0, unseenCopies) * partners
  }

  // Run potential: a suited neighbor within 2 ranks means one or two specific
  // cards would complete a run. Count each completing card still unseen.
  const o = TONGITS_RANK_ORDER[card.rank]
  const suited = new Set(
    hand
      .filter((c) => c.id !== card.id && c.suit === card.suit)
      .map((c) => TONGITS_RANK_ORDER[c.rank]),
  )
  const unseenOrder = (v: number) => {
    if (v < 1 || v > 13) return 0
    const rank = Object.keys(TONGITS_RANK_ORDER).find(
      (r) => TONGITS_RANK_ORDER[r as Card['rank']] === v,
    )
    return rank && !seenIds.has(`${rank}${card.suit}`) ? 1 : 0
  }
  if (suited.has(o + 1)) outs += unseenOrder(o + 2) + unseenOrder(o - 1)
  if (suited.has(o - 1)) outs += unseenOrder(o - 2) + unseenOrder(o + 1)
  if (suited.has(o + 2)) outs += unseenOrder(o + 1)
  if (suited.has(o - 2)) outs += unseenOrder(o - 1)

  return outs
}

// Draw-phase decision: call Draw, take the discard into a meld, or draw stock.
export function decideDraw(state: TongitsState, seat: number): BotDrawDecision {
  const hand = state.players[seat].hand

  if (canCallDraw(state, seat) && shouldCallDraw(state, seat)) {
    return { type: 'callDraw' }
  }

  const top = topDiscard(state)
  if (top) {
    const options = meldsWithCard(hand, top)
    if (options.length) {
      // Pick the pickup leaving the lowest best-case deadwood afterwards.
      const base = bestArrangement(hand).value
      let best: Card[] | null = null
      let bestValue = Infinity
      for (const opt of options) {
        const used = new Set(opt.map((c) => c.id))
        const value = bestArrangement(hand.filter((c) => !used.has(c.id))).value
        if (value < bestValue) {
          bestValue = value
          best = opt
        }
      }
      // Taking is right unless it cannibalizes a better meld already in hand.
      if (best && bestValue <= base) {
        return { type: 'takeDiscard', cardIds: best.map((c) => c.id) }
      }
    }
  }
  return { type: 'stock' }
}

// Call Draw when this hand's count is low in absolute terms AND clearly below
// a rough estimate of what the opponents are holding (~5 points per card).
function shouldCallDraw(state: TongitsState, seat: number): boolean {
  const mine = handPoints(state.players[seat].hand)
  if (mine <= 2) return true
  const oppEstimate = Math.min(
    ...state.players
      .map((p, s) => ({ p, s }))
      .filter(({ s }) => s !== seat)
      .map(({ p }) => p.hand.length * 5),
  )
  // Late in the round (thin stock) the bar drops — a burn count is coming
  // anyway, so lock in the fight while opponents still hold cards.
  const margin = state.stock.length <= 4 ? 4 : 10
  return mine <= 12 && mine + margin <= oppEstimate
}

// Act-phase decision: one step at a time (meld → sapaw → discard) so the page
// can animate each move separately.
export function decideAct(state: TongitsState, seat: number): BotActDecision {
  const hand = state.players[seat].hand
  const arranged = bestArrangement(hand)

  // 1. Expose the next meld. Laying everything down chases Tongits and
  //    protects against the burn penalty; hidden melds still count as points.
  if (arranged.melds.length) {
    return { type: 'meld', cardIds: arranged.melds[0].map((c) => c.id) }
  }

  // 2. Sapaw deadwood cards onto any exposed meld (own or opponents' — the
  //    latter also blocks their Draw call). Meld-bound cards stay in hand.
  const exposed: Meld[] = state.players.flatMap((p) => p.melds)
  for (const card of arranged.deadwood) {
    for (const meld of exposed) {
      if (extendMeld(meld, [card])) {
        return { type: 'sapaw', meldId: meld.id, cardIds: [card.id] }
      }
    }
  }

  // 3. Discard the least useful card.
  return { type: 'discard', cardId: chooseDiscard(state, seat).id }
}

// Least useful card: among deadwood, maximize points minus meld potential
// (weighted by unseen outs). Never discards a card a planned meld needs
// unless the whole hand is melded — then it breaks the cheapest meld.
export function chooseDiscard(state: TongitsState, seat: number): Card {
  const hand = state.players[seat].hand
  const arranged = bestArrangement(hand)
  const pool = arranged.deadwood.length ? arranged.deadwood : hand
  const seen = seenCards(state, seat)

  let best = pool[0]
  let bestScore = -Infinity
  for (const card of pool) {
    const score = cardValue(card) - 2.5 * meldOuts(card, hand, seen)
    if (score > bestScore) {
      bestScore = score
      best = card
    }
  }
  return best
}

// Challenge choice when someone calls Draw: fight only with a strong (low)
// count, folding keeps the loss at the base stake. Seats with no exposed
// meld can't fight at all — the engine forces their fold.
export function decideFight(state: TongitsState, seat: number): boolean {
  if (!state.players[seat].melds.length) return false
  return handPoints(state.players[seat].hand) <= 8
}
