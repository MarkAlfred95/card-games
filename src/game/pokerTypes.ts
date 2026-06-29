import type { Card, HandEval } from './types'

export type SeatIndex = 0 | 1 | 2 | 3 | 4

export type BotPersonality = 'TAG' | 'LAG' | 'Calling Station' | 'Nit'

export type Street = 'preflop' | 'flop' | 'turn' | 'river'

export type GamePhase =
  | 'idle'
  | 'dealing'
  | 'betting'
  | 'animating'
  | 'showdown'
  | 'result'
  | 'busted'

export type ActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn'

export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'winner' | 'sitting-out'

export interface PokerPlayer {
  seatIndex: SeatIndex
  name: string
  stack: number
  holeCards: Card[]
  currentBet: number
  totalBetThisHand: number
  status: PlayerStatus
  personality: BotPersonality | 'Human'
  isDealer: boolean
  isSB: boolean
  isBB: boolean
}

export interface Pot {
  amount: number
  eligibleSeats: SeatIndex[]
}

export interface PlayerAction {
  seatIndex: SeatIndex
  type: ActionType
  amount: number
}

export interface HandState {
  phase: GamePhase
  street: Street
  players: PokerPlayer[]
  deck: Card[]
  communityCards: Card[]
  pots: Pot[]
  currentBet: number
  actingIndex: SeatIndex | null
  dealerIndex: SeatIndex
  lastRaiserIndex: SeatIndex | null
  handNumber: number
  sessionProfit: number
  newCommunityCardIndices: number[]
  lastAction: PlayerAction | null
  streetActionCount: number
  activePlayerCountAtStreetStart: number
}

export interface ShowdownResult {
  potIndex: number
  winners: SeatIndex[]
  winnerHandName: string
  winnerBestCards: Card[]
  winnerHandEval: HandEval
  amount: number
}

export interface BotDecisionContext {
  player: PokerPlayer
  hand: HandState
  potOdds: number
  handStrength: number
}

export type PreflopTier = 'premium' | 'strong' | 'playable' | 'weak'
