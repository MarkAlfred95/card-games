import { evaluate, compareHands, CATEGORY } from './ranking'
import { RANKS } from './deck'
import type { Card, HandEval, Rank } from './types'
import type { PreflopTier } from './pokerTypes'

export { CATEGORY }

export const RANK_VALUE: Record<Rank, number> = Object.fromEntries(
  RANKS.map((r, i) => [r, i + 2]),
) as Record<Rank, number>

// ── Best 5 from 5–7 cards ─────────────────────────────────────────────────

export interface BestHand {
  eval: HandEval
  bestCards: Card[]
}

// Generate all C(n, k) index combinations
function combos(n: number, k: number): number[][] {
  const result: number[][] = []
  const pick = (start: number, chosen: number[]) => {
    if (chosen.length === k) { result.push(chosen); return }
    for (let i = start; i < n; i++) pick(i + 1, [...chosen, i])
  }
  pick(0, [])
  return result
}

export function best5from7(cards: Card[]): BestHand {
  if (cards.length < 5) {
    // Pad to 5 with duplicates as a last resort (shouldn't happen in normal play)
    const padded = [...cards, ...Array(5 - cards.length).fill(cards[0])]
    return { eval: evaluate(padded), bestCards: padded }
  }
  if (cards.length === 5) {
    return { eval: evaluate(cards), bestCards: cards }
  }

  // Generate all C(n, 5) combinations — works for 6 or 7 cards
  let bestEval: HandEval | null = null
  let bestCards: Card[] = []

  for (const indices of combos(cards.length, 5)) {
    const combo = indices.map((i) => cards[i])
    const ev = evaluate(combo)
    if (!bestEval || compareHands(ev, bestEval) > 0) {
      bestEval = ev
      bestCards = combo
    }
  }

  return { eval: bestEval!, bestCards }
}

// ── Preflop hand tier classification ─────────────────────────────────────

export function classifyPreflopHand(c1: Card, c2: Card): PreflopTier {
  const v1 = RANK_VALUE[c1.rank]
  const v2 = RANK_VALUE[c2.rank]
  const hi = Math.max(v1, v2)
  const lo = Math.min(v1, v2)
  const suited = c1.suit === c2.suit
  const paired = v1 === v2

  // Premium: JJ+, AK
  if (paired && hi >= 11) return 'premium'
  if (hi === 14 && lo === 13) return 'premium'

  // Strong: 88-TT, AQ, AJs, KQs
  if (paired && hi >= 8) return 'strong'
  if (hi === 14 && lo === 12) return 'strong'
  if (hi === 14 && lo === 11 && suited) return 'strong'
  if (hi === 13 && lo === 12 && suited) return 'strong'

  // Playable: 55-77, ATs, AJo, KQo, KJs, QJs, JTs, T9s
  if (paired && hi >= 5) return 'playable'
  if (hi === 14 && lo === 10 && suited) return 'playable'
  if (hi === 14 && lo === 11) return 'playable'
  if (hi === 13 && lo === 12) return 'playable'
  if (hi === 13 && lo === 11 && suited) return 'playable'
  if (hi === 12 && lo === 11 && suited) return 'playable'
  if (hi === 11 && lo === 10 && suited) return 'playable'
  if (hi === 10 && lo === 9 && suited) return 'playable'

  return 'weak'
}

// ── Equity estimation ─────────────────────────────────────────────────────

function flushDrawOuts(hole: Card[], community: Card[]): number {
  const all = [...hole, ...community]
  const suitCounts: Record<string, number> = {}
  for (const c of all) suitCounts[c.suit] = (suitCounts[c.suit] ?? 0) + 1
  const maxSuit = Math.max(...Object.values(suitCounts))
  return maxSuit === 4 ? 9 : 0
}

function straightDrawOuts(hole: Card[], community: Card[]): number {
  const values = [...new Set([...hole, ...community].map((c) => RANK_VALUE[c.rank]))]
  const sorted = [...values].sort((a, b) => a - b)
  let maxConsec = 1
  let cur = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - sorted[i - 1] === 1) {
      cur++
      maxConsec = Math.max(maxConsec, cur)
    } else {
      cur = 1
    }
  }
  if (maxConsec >= 4) return 8
  if (maxConsec === 3) return 4
  return 0
}

function madeHandStrength(ev: HandEval): number {
  const base = ev.category / 8
  const rankBonus = (ev.ranks[0] ?? 0) / (14 * 8)
  return Math.min(1, base + rankBonus)
}

export function estimateEquity(
  holeCards: Card[],
  communityCards: Card[],
  activePlayers: number,
): number {
  let equity: number

  if (communityCards.length === 0) {
    const tier = classifyPreflopHand(holeCards[0], holeCards[1])
    const tierMap: Record<PreflopTier, number> = {
      premium: 0.72,
      strong: 0.58,
      playable: 0.44,
      weak: 0.32,
    }
    equity = tierMap[tier]
  } else {
    const all = [...holeCards, ...communityCards]
    const best = best5from7(all)
    const made = madeHandStrength(best.eval)

    const fOuts = flushDrawOuts(holeCards, communityCards)
    const sOuts = straightDrawOuts(holeCards, communityCards)
    const totalOuts = Math.max(fOuts, sOuts)
    const cardsToCome = 5 - communityCards.length
    const drawEq = cardsToCome >= 2
      ? (totalOuts * 4) / 100
      : (totalOuts * 2) / 100

    equity = Math.min(1, made + drawEq)
  }

  const discount = Math.max(0, (activePlayers - 1) * 0.12)
  return Math.max(0.05, equity - discount)
}

export function calcPotOdds(callAmount: number, potSize: number): number {
  if (callAmount <= 0) return 0
  return callAmount / (potSize + callAmount)
}
