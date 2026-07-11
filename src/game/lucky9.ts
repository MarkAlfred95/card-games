// Lucky 9 (Filipino baccarat-style) — pure game logic, no React.
//
// Card values: A = 1, pip cards 2–9 = face value, 10/J/Q/K = 0. A hand's
// total is the last digit of the card sum (mod 10). Everyone starts with two
// cards and may draw ("hirit") at most one more. A two-card 9 is the natural
// "Lucky 9", a two-card 8 the lesser natural; on equal totals the hand with
// fewer cards wins, and a winning Lucky 9 settles at double the stake.

import type { Card } from './types'

export function cardValue(card: Card): number {
  if (card.rank === 'A') return 1
  const n = Number(card.rank)
  return Number.isNaN(n) || n === 10 ? 0 : n
}

export function handValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + cardValue(c), 0) % 10
}

// A natural is a two-card 8 or 9. Returns the natural's total, or null.
export function natural(cards: Card[]): 8 | 9 | null {
  if (cards.length !== 2) return null
  const v = handValue(cards)
  return v === 8 || v === 9 ? (v as 8 | 9) : null
}

export const NATURAL_NAMES: Record<8 | 9, string> = {
  9: 'Lucky 9',
  8: 'Natural 8',
}

// Higher total wins; on equal totals the hand with fewer cards wins (a
// two-card hand beats a drawn hand of the same value); otherwise a push.
export function compareLucky9(a: Card[], b: Card[]): number {
  return handValue(a) - handValue(b) || b.length - a.length
}

// Draw strategy shared by every bot (banker included): always hirit at 4 or
// less, always stand at 6 or more, coin-flip at 5. Naturals never draw.
export function botWantsCard(cards: Card[]): boolean {
  if (cards.length !== 2) return false
  const v = handValue(cards)
  if (v <= 4) return true
  if (v === 5) return Math.random() < 0.5
  return false
}

export type Lucky9Outcome = 'win' | 'loss' | 'push'

export interface Lucky9RoundResult {
  bankerSeat: number
  stakes: number[] // per seat; the banker's own slot is unused (0)
  values: number[] // final hand total per seat
  naturals: (8 | 9 | null)[]
  // Per non-banker seat, the outcome against the banker; the banker slot and
  // seats that didn't play are null.
  outcomes: (Lucky9Outcome | null)[]
  moneyDeltas: number[] // per seat, zero-sum; the banker absorbs the rest
}

// Settle every non-banker seat head-to-head against the banker: even money on
// the seat's stake, doubled when the winning side holds the natural Lucky 9.
export function settleRound(
  hands: Card[][],
  bankerSeat: number,
  stakes: number[],
): Lucky9RoundResult {
  const values = hands.map(handValue)
  const naturals = hands.map(natural)
  const outcomes: (Lucky9Outcome | null)[] = hands.map(() => null)
  const moneyDeltas = hands.map(() => 0)
  hands.forEach((hand, seat) => {
    if (seat === bankerSeat) return
    const cmp = compareLucky9(hand, hands[bankerSeat])
    outcomes[seat] = cmp > 0 ? 'win' : cmp < 0 ? 'loss' : 'push'
    if (cmp === 0) return
    const luckyNineWon =
      (cmp > 0 && naturals[seat] === 9) ||
      (cmp < 0 && naturals[bankerSeat] === 9)
    const money = stakes[seat] * (luckyNineWon ? 2 : 1)
    const delta = cmp > 0 ? money : -money
    moneyDeltas[seat] += delta
    moneyDeltas[bankerSeat] -= delta
  })
  return { bankerSeat, stakes, values, naturals, outcomes, moneyDeltas }
}
