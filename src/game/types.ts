// Shared domain types for the card games.

export type Suit = 'S' | 'H' | 'D' | 'C'

export type Rank =
  | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  | 'J' | 'Q' | 'K' | 'A'

export interface Card {
  id: string
  rank: Rank
  suit: Suit
}

// Poker hand category, 0 (high card) .. 8 (straight flush). Higher beats lower.
export type Category = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface HandEval {
  category: Category
  name: string
  // Tiebreaker values, most-significant first.
  ranks: number[]
}

export interface Arrangement {
  front: Card[]
  middle: Card[]
  back: Card[]
}

// Royalty bonus units per position, keyed by hand category. Missing = 0.
export interface RoyaltyTable {
  back: Partial<Record<Category, number>>
  middle: Partial<Record<Category, number>>
  front: Partial<Record<Category, number>>
}

export interface RoyaltySet {
  back: number
  middle: number
  front: number
}

export interface EvaluatedArrangement {
  back: HandEval
  middle: HandEval
  front: HandEval
  foul: boolean
  royalty: RoyaltySet
}

export interface ScoreOptions {
  sweepBonus: number
  royalties: RoyaltyTable
}

export interface RoundResult {
  totals: number[]
  evals: EvaluatedArrangement[]
  foul: boolean[]
}

// One banker-vs-player head-to-head settlement within a round.
export interface BankerPair {
  seat: number // the non-banker seat
  points: number // points won by the banker against this player (banker's view)
  stake: number // this player's stake (money per point)
  money: number // money the banker won from this player (points * stake)
}

// Result of a banker round: the banker settles head-to-head with each other
// player, money = points * that player's stake. Money deltas are zero-sum.
export interface BankerRoundResult {
  bankerSeat: number
  stakes: number[] // per seat; the banker's own slot is unused (0)
  pointDeltas: number[] // per seat, banker's view summed into the banker slot
  moneyDeltas: number[] // per seat, zero-sum
  evals: EvaluatedArrangement[]
  foul: boolean[]
  pairs: BankerPair[]
}
