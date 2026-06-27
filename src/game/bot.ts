// Bot opponent: pick the best legal arrangement of 13 cards.
//
// Strategy: among every legal partition into back(5)/middle(5)/front(3), choose
// the one that maximizes total royalties, then strongest back, then middle, then
// front. Bots never foul.
//
// There are only C(13,5)=1287 distinct 5-card subsets and C(13,3)=286 3-card
// subsets, so we evaluate each once (keyed by a 13-bit mask of card indices) and
// scan partitions with cheap bitmask ops.

import { RANKS } from './deck'
import { evaluate, compareHands } from './ranking'
import { DEFAULT_ROYALTIES } from './scoring'
import type { Arrangement, Card, HandEval, Rank, RoyaltyTable } from './types'

const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
) as Record<Rank, number>

interface Best {
  royalty: number
  backEval: HandEval
  middleEval: HandEval
  frontEval: HandEval
  backMask: number
  middleMask: number
  frontMask: number
}

// Yields index combinations as a single reused array — consume immediately.
function* indexCombos(
  n: number,
  k: number,
  start = 0,
  combo: number[] = [],
): Generator<number[]> {
  if (combo.length === k) {
    yield combo
    return
  }
  for (let i = start; i <= n - (k - combo.length); i++) {
    combo.push(i)
    yield* indexCombos(n, k, i + 1, combo)
    combo.pop()
  }
}

function maskOf(indices: number[]): number {
  let m = 0
  for (const i of indices) m |= 1 << i
  return m
}

function cardsOfMask(mask: number, cards: Card[]): Card[] {
  const out: Card[] = []
  for (let i = 0; i < cards.length; i++) if (mask & (1 << i)) out.push(cards[i])
  return out
}

// Evaluate every k-card subset once; returns Map<mask, evalResult>.
function evalSubsets(cards: Card[], k: number): Map<number, HandEval> {
  const map = new Map<number, HandEval>()
  for (const combo of indexCombos(cards.length, k)) {
    map.set(maskOf(combo), evaluate(combo.map((i) => cards[i])))
  }
  return map
}

export function arrangeBot(
  cards: Card[],
  royalties: RoyaltyTable = DEFAULT_ROYALTIES,
): Arrangement {
  const FULL = (1 << cards.length) - 1
  const fives = evalSubsets(cards, 5)
  const threes = evalSubsets(cards, 3)

  let best: Best | null = null

  for (const [frontMask, frontEval] of threes) {
    const remMask = FULL ^ frontMask
    const royFront = royalties.front[frontEval.category] ?? 0

    for (const [backMask, backEval] of fives) {
      if (backMask & frontMask) continue // back overlaps front
      const middleEval = fives.get(remMask ^ backMask)! // the other 5 of the remaining 10
      if (compareHands(backEval, middleEval) < 0) continue // back must be >= middle
      if (compareHands(middleEval, frontEval) < 0) continue // middle must be >= front

      const royalty =
        (royalties.back[backEval.category] ?? 0) +
        (royalties.middle[middleEval.category] ?? 0) +
        royFront

      if (isBetter(royalty, backEval, middleEval, frontEval, best)) {
        best = {
          royalty,
          backEval,
          middleEval,
          frontEval,
          backMask,
          middleMask: remMask ^ backMask,
          frontMask,
        }
      }
    }
  }

  if (!best) return fallbackArrange(cards)
  return {
    back: cardsOfMask(best.backMask, cards),
    middle: cardsOfMask(best.middleMask, cards),
    front: cardsOfMask(best.frontMask, cards),
  }
}

// Lexicographic preference: royalty, then back, then middle, then front.
function isBetter(
  royalty: number,
  backEval: HandEval,
  middleEval: HandEval,
  frontEval: HandEval,
  best: Best | null,
): boolean {
  if (!best) return true
  if (royalty !== best.royalty) return royalty > best.royalty
  let c = compareHands(backEval, best.backEval)
  if (c) return c > 0
  c = compareHands(middleEval, best.middleEval)
  if (c) return c > 0
  c = compareHands(frontEval, best.frontEval)
  return c > 0
}

// Safety net (a legal arrangement always exists, so this rarely runs).
function fallbackArrange(cards: Card[]): Arrangement {
  const sorted = [...cards].sort((a, b) => RANK_VALUE[b.rank] - RANK_VALUE[a.rank])
  return {
    back: sorted.slice(0, 5),
    middle: sorted.slice(5, 10),
    front: sorted.slice(10, 13),
  }
}
