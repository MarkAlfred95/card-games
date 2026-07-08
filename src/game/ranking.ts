// Poker hand evaluation + comparison for Pusoy Trese.
//
// evaluate(cards) handles 5-card hands (middle/back) and 3-card hands (front).
// Per standard rules the 3-card front cannot make straights or flushes, so only
// trips / pair / high card are possible there.

import { RANKS } from './deck.js'
import type { Card, Category, HandEval, Rank } from './types'

// '2'->2 ... '10'->10, 'J'->11, 'Q'->12, 'K'->13, 'A'->14
const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
) as Record<Rank, number>

export const CATEGORY = {
  HIGH_CARD: 0,
  PAIR: 1,
  TWO_PAIR: 2,
  TRIPS: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  QUADS: 7,
  STRAIGHT_FLUSH: 8,
} as const

export const CATEGORY_NAME: Record<Category, string> = {
  0: 'High Card',
  1: 'Pair',
  2: 'Two Pair',
  3: 'Three of a Kind',
  4: 'Straight',
  5: 'Flush',
  6: 'Full House',
  7: 'Four of a Kind',
  8: 'Straight Flush',
}

// Rank multiplicities, sorted by count desc then value desc.
function rankCounts(values: number[]): [number, number][] {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])
}

// Returns the high card of a straight, or 0 if not a straight.
// Handles the A-2-3-4-5 "wheel" (Ace plays low, straight is 5-high).
function straightHigh(values: number[]): number {
  const uniq = [...new Set(values)].sort((a, b) => b - a)
  if (uniq.length !== values.length) return 0
  if (uniq[0] - uniq[uniq.length - 1] === uniq.length - 1) return uniq[0]
  if (uniq[0] === 14 && uniq[1] === 5 && uniq[uniq.length - 1] === 2) return 5
  return 0
}

function evaluate5(cards: Card[]): HandEval {
  const values = cards.map((c) => RANK_VALUE[c.rank])
  const suits = cards.map((c) => c.suit)
  const isFlush = suits.every((s) => s === suits[0])
  const high = straightHigh(values)
  const isStraight = high > 0
  const counts = rankCounts(values)
  const byCount = counts.map((c) => c[0])
  const desc = [...values].sort((a, b) => b - a)

  let category: Category
  let ranks: number[]
  if (isStraight && isFlush) {
    category = CATEGORY.STRAIGHT_FLUSH
    ranks = [high]
  } else if (counts[0][1] === 4) {
    category = CATEGORY.QUADS
    ranks = byCount
  } else if (counts[0][1] === 3 && counts[1][1] === 2) {
    category = CATEGORY.FULL_HOUSE
    ranks = byCount
  } else if (isFlush) {
    category = CATEGORY.FLUSH
    ranks = desc
  } else if (isStraight) {
    category = CATEGORY.STRAIGHT
    ranks = [high]
  } else if (counts[0][1] === 3) {
    category = CATEGORY.TRIPS
    ranks = byCount
  } else if (counts[0][1] === 2 && counts[1][1] === 2) {
    category = CATEGORY.TWO_PAIR
    ranks = byCount
  } else if (counts[0][1] === 2) {
    category = CATEGORY.PAIR
    ranks = byCount
  } else {
    category = CATEGORY.HIGH_CARD
    ranks = desc
  }

  let name = CATEGORY_NAME[category]
  if (category === CATEGORY.STRAIGHT_FLUSH && high === 14) name = 'Royal Flush'

  return { category, name, ranks }
}

function evaluate3(cards: Card[]): HandEval {
  const values = cards.map((c) => RANK_VALUE[c.rank])
  const counts = rankCounts(values)
  const byCount = counts.map((c) => c[0])
  const desc = [...values].sort((a, b) => b - a)

  let category: Category
  let ranks: number[]
  if (counts[0][1] === 3) {
    category = CATEGORY.TRIPS
    ranks = byCount
  } else if (counts[0][1] === 2) {
    category = CATEGORY.PAIR
    ranks = byCount
  } else {
    category = CATEGORY.HIGH_CARD
    ranks = desc
  }

  return { category, name: CATEGORY_NAME[category], ranks }
}

export function evaluate(cards: Card[]): HandEval {
  if (cards.length === 3) return evaluate3(cards)
  if (cards.length === 5) return evaluate5(cards)
  throw new Error(`Cannot evaluate a ${cards.length}-card hand (need 3 or 5)`)
}

// Lexicographic compare of tiebreaker arrays; shorter arrays pad with 0.
function compareRanks(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av !== bv) return av - bv
  }
  return 0
}

// > 0 if h1 beats h2, < 0 if h2 beats h1, 0 if tied.
export function compareHands(h1: HandEval, h2: HandEval): number {
  if (h1.category !== h2.category) return h1.category - h2.category
  return compareRanks(h1.ranks, h2.ranks)
}
