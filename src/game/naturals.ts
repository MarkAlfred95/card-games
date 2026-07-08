// Special 13-card hands ("naturals") for Pusoy Trese, KK Pusoy style. A natural
// is detected on the whole dealt hand and auto-wins the round regardless of how
// the rows are arranged (fouls and royalties don't apply) — the holder collects
// the natural's point value from each opponent it faces.

import { RANKS } from './deck.js'
import type { Card, Natural, Rank } from './types'

// '2'->2 ... 'A'->14
const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
) as Record<Rank, number>

const FACE_RANKS = new Set<Rank>(['J', 'Q', 'K'])
const RED_SUITS = new Set(['H', 'D'])

// Can the 13 ranks be split into two 5-card straights and one 3-card straight?
// Straights may use the Ace high or low. Suits are irrelevant.
function isThreeStraights(cards: Card[]): boolean {
  // Available count per rank value 2..14 (Ace = 14, also playable as 1).
  const counts = new Array<number>(15).fill(0)
  for (const c of cards) counts[RANK_VALUE[c.rank]]++

  // A window is a run of consecutive values; value 1 stands for a low Ace.
  const need = (lows: number[], sizes: number[]): boolean => {
    const needed = new Array<number>(15).fill(0)
    for (let w = 0; w < lows.length; w++)
      for (let v = lows[w]; v < lows[w] + sizes[w]; v++)
        needed[v === 1 ? 14 : v]++
    for (let v = 2; v <= 14; v++) if (needed[v] !== counts[v]) return false
    return true
  }

  // 5-card windows start at 1 (A2345) .. 10 (10JQKA); 3-card at 1 .. 12 (QKA).
  for (let a = 1; a <= 10; a++)
    for (let b = a; b <= 10; b++)
      for (let f = 1; f <= 12; f++)
        if (need([a, b, f], [5, 5, 3])) return true
  return false
}

// Can the 13 cards be split into two 5-card flushes and one 3-card flush?
// Each row must be single-suited, so the suit counts must decompose into
// {5,5,3}: one of [13], [10,3], [8,5], [5,5,3].
function isThreeFlushes(cards: Card[]): boolean {
  const bySuit = new Map<string, number>()
  for (const c of cards) bySuit.set(c.suit, (bySuit.get(c.suit) ?? 0) + 1)
  const sig = [...bySuit.values()].sort((a, b) => b - a).join(',')
  return sig === '13' || sig === '10,3' || sig === '8,5' || sig === '5,5,3'
}

// Detect the best natural in a 13-card hand, or null. Checked strongest first.
export function detectNatural(cards: Card[]): Natural | null {
  if (cards.length !== 13) return null

  const uniqueRanks = new Set(cards.map((c) => c.rank)).size
  if (uniqueRanks === 13) {
    const oneSuit = cards.every((c) => c.suit === cards[0].suit)
    if (oneSuit) return { key: 'pure-dragon', name: 'Pure Dragon', points: 99 }
    return { key: 'dragon', name: 'Dragon', points: 13 }
  }

  if (isThreeFlushes(cards))
    return { key: 'three-flushes', name: 'Three Flushes', points: 3 }
  if (isThreeStraights(cards))
    return { key: 'three-straights', name: 'Three Straights', points: 3 }

  // Six pairs + a kicker (four of a kind counts as two pairs).
  const rankCounts = new Map<Rank, number>()
  for (const c of cards) rankCounts.set(c.rank, (rankCounts.get(c.rank) ?? 0) + 1)
  let pairs = 0
  for (const n of rankCounts.values()) pairs += Math.floor(n / 2)
  if (pairs >= 6) return { key: 'six-pairs', name: 'Six Pairs', points: 3 }

  if (cards.every((c) => !FACE_RANKS.has(c.rank)))
    return { key: 'no-face-cards', name: 'No Face Cards', points: 3 }

  const reds = cards.filter((c) => RED_SUITS.has(c.suit)).length
  if (reds >= 12) return { key: 'all-red', name: '12+ Red Cards', points: 3 }
  if (reds <= 1) return { key: 'all-black', name: '12+ Black Cards', points: 3 }

  return null
}
