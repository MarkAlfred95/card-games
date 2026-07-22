// Blackjack — pure game logic, no React.
//
// Card values: A = 11 (demoted to 1 as needed to avoid busting), 2–9 = face
// value, 10/J/Q/K = 10. A hand's total is the best sum ≤ 21 when possible; a
// hand is "soft" while an ace is still counted as 11. Two cards totalling 21 is
// a natural blackjack (pays 3:2). The dealer draws until reaching 17 and stands
// on all 17s (including soft 17). Settlement is heads-up against the dealer.

import type { Card } from './types'

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 11
  const n = Number(card.rank)
  // J/Q/K parse to NaN, '10' parses to 10 — both are worth 10.
  return Number.isNaN(n) ? 10 : n
}

// Best total ≤ 21 if the aces allow it; `soft` means an ace is still an 11.
export function handTotal(cards: Card[]): { total: number; soft: boolean } {
  let total = 0
  let aces = 0
  for (const c of cards) {
    total += cardValue(c)
    if (c.rank === 'A') aces++
  }
  // Demote aces from 11 to 1 while the hand is over 21.
  while (total > 21 && aces > 0) {
    total -= 10
    aces--
  }
  return { total, soft: aces > 0 }
}

// A natural blackjack: exactly two cards worth 21.
export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21
}

export function isBust(cards: Card[]): boolean {
  return handTotal(cards).total > 21
}

// Splittable when the opening two cards share a rank.
export function canSplit(cards: Card[]): boolean {
  return cards.length === 2 && cards[0].rank === cards[1].rank
}

// Dealer hits below 17 and stands on all 17s (soft 17 included).
export function dealerShouldHit(cards: Card[]): boolean {
  return handTotal(cards).total < 17
}

// Play the dealer's hand out to a stand, drawing from the stock.
export function playDealer(
  dealer: Card[],
  stock: Card[],
): { dealer: Card[]; stock: Card[] } {
  let d = dealer
  let s = stock
  while (dealerShouldHit(d) && s.length > 0) {
    d = [...d, s[0]]
    s = s.slice(1)
  }
  return { dealer: d, stock: s }
}

export type HandOutcome = 'blackjack' | 'win' | 'push' | 'loss' | 'bust'

export interface HandResult {
  outcome: HandOutcome
  delta: number // net profit relative to the stake
}

// A natural blackjack pays 3:2.
export const BLACKJACK_PAYOUT = 1.5

// Settle one player hand against the dealer's final hand. `delta` is the net
// profit on the stake: win +bet, natural blackjack +1.5·bet, push 0,
// loss/bust −bet. A hand created by splitting can't score a natural (a two-card
// 21 after a split pays even money, not 3:2).
export function settleHand(
  player: Card[],
  dealer: Card[],
  bet: number,
  opts: { fromSplit?: boolean } = {},
): HandResult {
  const pt = handTotal(player).total
  const dt = handTotal(dealer).total
  const playerBlackjack = !opts.fromSplit && isBlackjack(player)
  const dealerBlackjack = isBlackjack(dealer)

  if (pt > 21) return { outcome: 'bust', delta: -bet }
  if (playerBlackjack) {
    return dealerBlackjack
      ? { outcome: 'push', delta: 0 }
      : { outcome: 'blackjack', delta: bet * BLACKJACK_PAYOUT }
  }
  if (dealerBlackjack) return { outcome: 'loss', delta: -bet }
  if (dt > 21) return { outcome: 'win', delta: bet } // dealer busts
  if (pt > dt) return { outcome: 'win', delta: bet }
  if (pt < dt) return { outcome: 'loss', delta: -bet }
  return { outcome: 'push', delta: 0 }
}
