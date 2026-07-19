// Registry of card games in the hub. Add a game here: give it metadata, a
// `path`, and (when playable) a `component`. The home page renders a card per
// entry and the router wires routes for every game whose status is 'available'.
import { lazy, type ComponentType } from 'react'
import type { Rank, Suit } from './game/types'
import PusoyTrese from './pages/PusoyTrese'

export interface Game {
  id: string
  name: string
  tagline: string
  description: string
  players: string
  path: string
  status: 'available' | 'coming-soon'
  accent: string
  // Three sample cards shown fanned on the home tile.
  preview: { rank: Rank; suit: Suit }[]
  component?: ComponentType
}

export const GAMES: Game[] = [
  {
    id: 'pusoy-trese',
    name: 'Pusoy Trese',
    tagline: '13-card Chinese poker',
    description:
      'Arrange 13 cards into three poker hands — beat the table row by row.',
    players: '2–4 players',
    path: '/games/pusoy-trese',
    status: 'available',
    accent: '#F0521D',
    preview: [
      { rank: 'A', suit: 'S' },
      { rank: 'K', suit: 'H' },
      { rank: 'Q', suit: 'S' },
    ],
    component: PusoyTrese,
  },
  {
    id: 'lucky-nine',
    name: 'Lucky 9',
    tagline: 'Closest to nine',
    description:
      'Bet against the banker, hirit a third card, and land closest to nine. A two-card 9 pays double.',
    players: '4 players',
    path: '/games/lucky-nine',
    status: 'available',
    accent: '#19D3E8',
    preview: [
      { rank: '4', suit: 'C' },
      { rank: '5', suit: 'D' },
      { rank: '9', suit: 'S' },
    ],
    component: lazy(() => import('./pages/Lucky9')),
  },
  {
    id: 'poker',
    name: "Texas Hold'em",
    tagline: 'No-limit poker',
    description:
      "Face 4 bot opponents at a no-limit Hold'em table. Buy in for $500 and outplay, outbluff, or outluck the competition.",
    players: '5 players',
    path: '/games/poker',
    status: 'available',
    accent: '#B6F225',
    preview: [
      { rank: 'A', suit: 'S' },
      { rank: 'K', suit: 'H' },
      { rank: 'A', suit: 'H' },
    ],
    component: lazy(() => import('./pages/Poker')),
  },
  {
    id: 'pusoy-dos',
    name: 'Pusoy Dos',
    tagline: 'Big Two',
    description: 'Shed your hand first by playing higher combinations.',
    players: '4 players',
    path: '/games/pusoy-dos',
    status: 'coming-soon',
    accent: '#C9B48E',
    preview: [
      { rank: '2', suit: 'S' },
      { rank: '2', suit: 'H' },
      { rank: '2', suit: 'D' },
    ],
  },
  {
    id: 'tongits',
    name: 'Tongits',
    tagline: 'Rummy-style melds',
    description:
      'Form sets and runs, sapaw the table, and empty your hand for Tongits — or call Draw and win the count.',
    players: '3 players',
    path: '/games/tongits',
    status: 'available',
    accent: '#FF7A3D',
    preview: [
      { rank: '7', suit: 'H' },
      { rank: '8', suit: 'H' },
      { rank: '9', suit: 'H' },
    ],
    component: lazy(() => import('./pages/Tongits')),
  },
]

export const AVAILABLE_GAMES = GAMES.filter((g) => g.status === 'available')
