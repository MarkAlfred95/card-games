// Card model + deck operations for Pusoy Trese.
// Ranks run low -> high so array index doubles as strength.

import type { Card, Rank, Suit } from './types'

export const SUITS: Suit[] = ['S', 'H', 'D', 'C']
export const RANKS: Rank[] = [
  '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A',
]

export function buildDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ id: `${rank}${suit}`, rank, suit })
    }
  }
  return deck
}

// Fisher–Yates. Returns a new array; does not mutate the input.
export function shuffle<T>(deck: T[]): T[] {
  const a = [...deck]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Deal `cardsEach` cards to `players`, dealt round-robin like a real table.
export function deal(deck: Card[], players = 4, cardsEach = 13): Card[][] {
  const hands: Card[][] = Array.from({ length: players }, () => [])
  for (let c = 0; c < cardsEach; c++) {
    for (let p = 0; p < players; p++) {
      hands[p].push(deck[c * players + p])
    }
  }
  return hands
}
