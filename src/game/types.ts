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
