// Round scoring for Pusoy Trese: foul detection, per-position head-to-head
// comparison, sweep bonuses, and royalties. Scoring is zero-sum.

import { evaluate, compareHands, CATEGORY } from './ranking'
import { detectNatural } from './naturals'
import type {
  Arrangement,
  BankerPair,
  BankerRoundResult,
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
  const natural = detectNatural([...arr.back, ...arr.middle, ...arr.front])

  const royalty = foul
    ? { back: 0, middle: 0, front: 0 }
    : {
        back: royalties.back[back.category] ?? 0,
        middle: royalties.middle[middle.category] ?? 0,
        front: royalties.front[front.category] ?? 0,
      }

  return { back, middle, front, foul, royalty, natural }
}

// Head-to-head score between two evaluated arrangements. Returns [aScore, bScore]
// with bScore === -aScore.
function scorePair(
  a: EvaluatedArrangement,
  b: EvaluatedArrangement,
  opts: ScoreOptions,
): [number, number] {
  // Naturals trump everything (rows, fouls, royalties): the holder collects
  // the natural's points. Both natural: the higher one wins its points; equal
  // naturals push.
  if (a.natural || b.natural) {
    const ap = a.natural?.points ?? 0
    const bp = b.natural?.points ?? 0
    if (ap === bp) return [0, 0]
    const s = ap > bp ? ap : -bp
    return [s, -s]
  }

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

// Score a banker round: the banker plays head-to-head against every other
// player. Each non-banker stakes a money-per-point amount; money won from that
// player is (banker's point margin vs them) * their stake. The banker's totals
// are the sum across all opponents. Money deltas are zero-sum.
//
// If `balances` is given, settlement is table-stakes (as in KK Pusoy): a
// player can't lose more than their balance, and the banker's total payout is
// capped at the banker's balance (pro-rated across winning opponents), so no
// seat is ever driven negative.
export function scoreBanker(
  arrangements: Arrangement[],
  bankerSeat: number,
  stakes: number[],
  options: Partial<ScoreOptions> = {},
  balances?: number[],
): BankerRoundResult {
  const opts: ScoreOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
    royalties: options.royalties ?? DEFAULT_ROYALTIES,
  }

  const evals = arrangements.map((a) => evaluateArrangement(a, opts.royalties))
  const moneyDeltas = arrangements.map(() => 0)
  const pointDeltas = arrangements.map(() => 0)
  const pairs: BankerPair[] = []

  for (let i = 0; i < evals.length; i++) {
    if (i === bankerSeat) continue
    const [bankerPts, playerPts] = scorePair(evals[bankerSeat], evals[i], opts)
    const stake = stakes[i] ?? 0
    let money = bankerPts * stake
    // Table stakes: an opponent can't lose more than they have.
    if (balances && money > 0)
      money = Math.min(money, Math.max(0, balances[i] ?? 0))

    pointDeltas[bankerSeat] += bankerPts
    pointDeltas[i] += playerPts

    pairs.push({ seat: i, points: bankerPts, stake, money })
  }

  // Table stakes for the banker: total payouts can't exceed the banker's
  // balance. Scale each winning opponent's collection down proportionally.
  if (balances) {
    const owed = pairs.reduce((s, p) => s + (p.money < 0 ? -p.money : 0), 0)
    const bank = Math.max(0, balances[bankerSeat] ?? 0)
    if (owed > bank) {
      const ratio = bank / owed
      let remaining = bank
      for (const p of pairs)
        if (p.money < 0) {
          const pay = Math.min(Math.round(-p.money * ratio), remaining)
          p.money = -pay
          remaining -= pay
        }
    }
  }

  for (const p of pairs) {
    moneyDeltas[bankerSeat] += p.money
    moneyDeltas[p.seat] -= p.money
  }

  return {
    bankerSeat,
    stakes,
    pointDeltas,
    moneyDeltas,
    evals,
    foul: evals.map((e) => e.foul),
    pairs,
  }
}
