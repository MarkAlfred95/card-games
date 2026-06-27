// Round scoring for Pusoy Trese: foul detection, per-position head-to-head
// comparison, sweep bonuses, and royalties. Scoring is zero-sum.

import { evaluate, compareHands, CATEGORY } from './ranking'
import type {
  Arrangement,
  EvaluatedArrangement,
  RoundResult,
  RoyaltyTable,
  ScoreOptions,
} from './types'

// House-rule royalty table (bonus units per position by hand category). Pass a
// custom table to scoreRound to change house rules. Anything not listed is 0.
export const DEFAULT_ROYALTIES: RoyaltyTable = {
  back: {
    [CATEGORY.QUADS]: 4,
    [CATEGORY.STRAIGHT_FLUSH]: 5,
  },
  middle: {
    [CATEGORY.TRIPS]: 2,
    [CATEGORY.FULL_HOUSE]: 2,
    [CATEGORY.QUADS]: 8,
    [CATEGORY.STRAIGHT_FLUSH]: 10,
  },
  front: {
    [CATEGORY.TRIPS]: 3,
  },
}

export const DEFAULT_OPTIONS: ScoreOptions = {
  sweepBonus: 3, // extra units for winning all 3 positions vs an opponent
  royalties: DEFAULT_ROYALTIES,
}

const POSITIONS = ['back', 'middle', 'front'] as const

// Evaluate an arrangement: hand strength per position, whether it fouls
// (back >= middle >= front is required), and royalty units earned. A fouled
// hand earns no royalties.
export function evaluateArrangement(
  arr: Arrangement,
  royalties: RoyaltyTable = DEFAULT_ROYALTIES,
): EvaluatedArrangement {
  const back = evaluate(arr.back)
  const middle = evaluate(arr.middle)
  const front = evaluate(arr.front)
  const foul =
    compareHands(back, middle) < 0 || compareHands(middle, front) < 0

  const royalty = foul
    ? { back: 0, middle: 0, front: 0 }
    : {
        back: royalties.back[back.category] ?? 0,
        middle: royalties.middle[middle.category] ?? 0,
        front: royalties.front[front.category] ?? 0,
      }

  return { back, middle, front, foul, royalty }
}

// Head-to-head score between two evaluated arrangements. Returns [aScore, bScore]
// with bScore === -aScore.
function scorePair(
  a: EvaluatedArrangement,
  b: EvaluatedArrangement,
  opts: ScoreOptions,
): [number, number] {
  if (a.foul && b.foul) return [0, 0]

  // One fouls: the clean hand scoops all 3 + sweep bonus and still collects its
  // own royalties from the fouler (who earns none).
  if (a.foul || b.foul) {
    const clean = a.foul ? b : a
    const roy = clean.royalty.back + clean.royalty.middle + clean.royalty.front
    const s = 3 + opts.sweepBonus + roy
    return a.foul ? [-s, s] : [s, -s]
  }

  let score = 0
  let wins = 0
  let losses = 0
  for (const pos of POSITIONS) {
    const cmp = Math.sign(compareHands(a[pos], b[pos]))
    score += cmp
    if (cmp > 0) wins++
    else if (cmp < 0) losses++
    score += a.royalty[pos] - b.royalty[pos]
  }
  if (wins === 3) score += opts.sweepBonus
  else if (losses === 3) score -= opts.sweepBonus

  return [score, -score]
}

// Score a full round. Returns totals (zero-sum), per-player evaluations, and
// per-player foul flags.
export function scoreRound(
  arrangements: Arrangement[],
  options: Partial<ScoreOptions> = {},
): RoundResult {
  const opts: ScoreOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    royalties: options.royalties ?? DEFAULT_ROYALTIES,
  }

  const evals = arrangements.map((a) => evaluateArrangement(a, opts.royalties))
  const totals = arrangements.map(() => 0)

  for (let i = 0; i < evals.length; i++) {
    for (let j = i + 1; j < evals.length; j++) {
      const [si, sj] = scorePair(evals[i], evals[j], opts)
      totals[i] += si
      totals[j] += sj
    }
  }

  return { totals, evals, foul: evals.map((e) => e.foul) }
}
