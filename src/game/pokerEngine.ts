import { buildDeck, shuffle } from './deck'
import { compareHands } from './ranking'
import { best5from7 } from './pokerEval'
import type {
  HandState,
  PokerPlayer,
  PlayerAction,
  Pot,
  SeatIndex,
  BotPersonality,
  ShowdownResult,
} from './pokerTypes'

export const SB_AMOUNT = 25
export const BB_AMOUNT = 50
export const BUY_IN = 500

const BOT_NAMES = ['Viper', 'Lucky Lou', 'The Nit', 'Bluffmaster']
const BOT_PERSONALITIES: BotPersonality[] = ['TAG', 'Calling Station', 'Nit', 'LAG']

// ── Initial state ─────────────────────────────────────────────────────────

export function createInitialState(humanStack: number): HandState {
  const players: PokerPlayer[] = [
    {
      seatIndex: 0,
      name: 'You',
      stack: humanStack,
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      status: humanStack > 0 ? 'active' : 'sitting-out',
      personality: 'Human',
      isDealer: false,
      isSB: false,
      isBB: false,
    },
    ...BOT_NAMES.map((name, i): PokerPlayer => ({
      seatIndex: (i + 1) as SeatIndex,
      name,
      stack: 300 + Math.floor(Math.random() * 400),
      holeCards: [],
      currentBet: 0,
      totalBetThisHand: 0,
      status: 'active',
      personality: BOT_PERSONALITIES[i],
      isDealer: false,
      isSB: false,
      isBB: false,
    })),
  ]

  return {
    phase: 'idle',
    street: 'preflop',
    players,
    deck: [],
    communityCards: [],
    pots: [],
    currentBet: 0,
    actingIndex: null,
    dealerIndex: 0,
    lastRaiserIndex: null,
    handNumber: 0,
    sessionProfit: 0,
    newCommunityCardIndices: [],
    lastAction: null,
    streetActionCount: 0,
    activePlayerCountAtStreetStart: 0,
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function nextSeat(current: SeatIndex, players: PokerPlayer[]): SeatIndex {
  let idx = (current + 1) % 5
  for (let i = 0; i < 5; i++) {
    const p = players[idx]
    if (p.status === 'active') return p.seatIndex
    idx = (idx + 1) % 5
  }
  return current
}

function activePlayers(players: PokerPlayer[]): PokerPlayer[] {
  return players.filter((p) => p.status === 'active')
}

function livePlayers(players: PokerPlayer[]): PokerPlayer[] {
  return players.filter((p) => p.status === 'active' || p.status === 'allIn')
}

export function totalPot(pots: Pot[]): number {
  return pots.reduce((s, p) => s + p.amount, 0)
}

// ── Side-pot construction ─────────────────────────────────────────────────

function buildPots(players: PokerPlayer[]): Pot[] {
  const contributors = players
    .filter((p) => p.status !== 'sitting-out' && p.totalBetThisHand > 0)

  if (contributors.length === 0) return []

  const levels = [...new Set(contributors.map((c) => c.totalBetThisHand))].sort(
    (a, b) => a - b,
  )

  const pots: Pot[] = []
  let prevLevel = 0

  for (const level of levels) {
    const layerSize = level - prevLevel
    const eligible = contributors.filter((c) => c.totalBetThisHand >= level)
    if (eligible.length > 0 && layerSize > 0) {
      pots.push({
        amount: layerSize * eligible.length,
        eligibleSeats: eligible.map((c) => c.seatIndex),
      })
    }
    prevLevel = level
  }

  return pots
}

// ── Deal hand ─────────────────────────────────────────────────────────────

export function dealHand(state: HandState): HandState {
  const deck = shuffle(buildDeck())
  let deckIdx = 0

  // Rotate dealer
  const dealerIndex = nextSeat(state.dealerIndex, state.players) as SeatIndex

  // Find SB (left of dealer) and BB (left of SB)
  const sbIndex = nextSeat(dealerIndex, state.players.map((p) => ({
    ...p, status: (p.stack > 0 ? 'active' : 'sitting-out') as PokerPlayer['status'],
  }))) as SeatIndex

  const tempPlayers = state.players.map((p) => ({
    ...p, status: (p.stack > 0 ? 'active' : 'sitting-out') as PokerPlayer['status'],
  }))
  const bbIndex = nextSeat(sbIndex, tempPlayers) as SeatIndex

  // Reset players
  let players: PokerPlayer[] = state.players.map((p) => ({
    ...p,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    status: p.stack > 0 ? 'active' : 'sitting-out',
    isDealer: p.seatIndex === dealerIndex,
    isSB: p.seatIndex === sbIndex,
    isBB: p.seatIndex === bbIndex,
  }))

  // Deal 2 hole cards each, round-robin
  for (let card = 0; card < 2; card++) {
    for (let seat = 0; seat < 5; seat++) {
      const rotated = (dealerIndex + 1 + seat) % 5 as SeatIndex
      const p = players[rotated]
      if (p.status === 'active') {
        players = players.map((pl) =>
          pl.seatIndex === rotated
            ? { ...pl, holeCards: [...pl.holeCards, deck[deckIdx++]] }
            : pl,
        )
      }
    }
  }

  // Post SB
  players = postBlind(players, sbIndex, SB_AMOUNT)
  // Post BB
  players = postBlind(players, bbIndex, BB_AMOUNT)

  const pots = buildPots(players)

  // UTG acts first preflop (left of BB)
  const utg = nextSeat(bbIndex, players) as SeatIndex

  return {
    ...state,
    phase: 'betting',
    street: 'preflop',
    players,
    deck: deck.slice(deckIdx),
    communityCards: [],
    pots,
    currentBet: BB_AMOUNT,
    actingIndex: utg,
    dealerIndex,
    lastRaiserIndex: bbIndex,
    handNumber: state.handNumber + 1,
    newCommunityCardIndices: [],
    lastAction: null,
    streetActionCount: 0,
    activePlayerCountAtStreetStart: activePlayers(players).length,
  }
}

function postBlind(
  players: PokerPlayer[],
  seatIndex: SeatIndex,
  amount: number,
): PokerPlayer[] {
  return players.map((p) => {
    if (p.seatIndex !== seatIndex) return p
    const paid = Math.min(amount, p.stack)
    return {
      ...p,
      stack: p.stack - paid,
      currentBet: paid,
      totalBetThisHand: paid,
      status: p.stack - paid === 0 ? 'allIn' : p.status,
    }
  })
}

// ── Apply player action ───────────────────────────────────────────────────

export function applyAction(state: HandState, action: PlayerAction): HandState {
  let players = state.players.map((p) => ({ ...p }))
  const actor = players[action.seatIndex]

  let lastRaiserIndex = state.lastRaiserIndex
  let currentBet = state.currentBet
  let streetActionCount = state.streetActionCount + 1

  switch (action.type) {
    case 'fold':
      players[action.seatIndex] = { ...actor, status: 'folded' }
      break

    case 'check':
      // No stack change
      break

    case 'call': {
      const callAmt = Math.min(
        state.currentBet - actor.currentBet,
        actor.stack,
      )
      players[action.seatIndex] = {
        ...actor,
        stack: actor.stack - callAmt,
        currentBet: actor.currentBet + callAmt,
        totalBetThisHand: actor.totalBetThisHand + callAmt,
        status: actor.stack - callAmt === 0 ? 'allIn' : actor.status,
      }
      break
    }

    case 'raise': {
      const raiseTotal = Math.min(action.amount, actor.stack + actor.currentBet)
      const paid = raiseTotal - actor.currentBet
      players[action.seatIndex] = {
        ...actor,
        stack: actor.stack - paid,
        currentBet: raiseTotal,
        totalBetThisHand: actor.totalBetThisHand + paid,
        status: actor.stack - paid === 0 ? 'allIn' : actor.status,
      }
      currentBet = raiseTotal
      lastRaiserIndex = action.seatIndex
      streetActionCount = 1 // reset: everyone needs to act again
      break
    }

    case 'allIn': {
      const allInAmt = actor.stack
      const newTotal = actor.currentBet + allInAmt
      players[action.seatIndex] = {
        ...actor,
        stack: 0,
        currentBet: newTotal,
        totalBetThisHand: actor.totalBetThisHand + allInAmt,
        status: 'allIn',
      }
      if (newTotal > currentBet) {
        currentBet = newTotal
        lastRaiserIndex = action.seatIndex
        streetActionCount = 1
      }
      break
    }
  }

  const pots = buildPots(players)
  const active = activePlayers(players)
  const live = livePlayers(players)

  // Determine next acting seat
  let actingIndex: SeatIndex | null = null

  if (active.length > 0) {
    const next = nextSeat(action.seatIndex, players)

    // Street is done when:
    // 1. Only 0 or 1 active player(s) remain, OR
    // 2. We've gone all the way around since the last raise
    //    (everyone active has matched or folded)
    const allActiveMatched = active.every(
      (p) => p.currentBet === currentBet || p.status === 'allIn',
    )

    if (active.length === 0 || (allActiveMatched && next === lastRaiserIndex)) {
      actingIndex = null
    } else if (allActiveMatched && active.length === 1) {
      actingIndex = null
    } else {
      actingIndex = next
    }
  }

  // If only one live player, street is over
  if (live.length <= 1) actingIndex = null

  return {
    ...state,
    players,
    pots,
    currentBet,
    actingIndex,
    lastRaiserIndex,
    streetActionCount,
    lastAction: action,
  }
}

// ── Advance street ────────────────────────────────────────────────────────

export function advanceStreet(state: HandState): HandState {
  const nextStreet: Record<string, HandState['street']> = {
    preflop: 'flop',
    flop: 'turn',
    turn: 'river',
  }

  const next = nextStreet[state.street]
  if (!next) return state

  // Reset per-street bets
  const players = state.players.map((p) => ({
    ...p,
    currentBet: 0,
  }))

  // Reveal community cards
  let deck = [...state.deck]
  let newIndices: number[] = []
  let communityCards = [...state.communityCards]

  if (next === 'flop') {
    deck = deck.slice(1) // burn
    newIndices = [0, 1, 2]
    communityCards = [...communityCards, ...deck.slice(0, 3)]
    deck = deck.slice(3)
  } else {
    deck = deck.slice(1) // burn
    newIndices = [communityCards.length]
    communityCards = [...communityCards, deck[0]]
    deck = deck.slice(1)
  }

  // First active player left of dealer acts first post-flop
  const firstActor = firstActiveLeftOfDealer(players, state.dealerIndex)

  return {
    ...state,
    street: next,
    phase: 'betting',
    players,
    deck,
    communityCards,
    currentBet: 0,
    actingIndex: firstActor,
    lastRaiserIndex: firstActor,
    newCommunityCardIndices: newIndices,
    lastAction: null,
    streetActionCount: 0,
    activePlayerCountAtStreetStart: activePlayers(players).length,
  }
}

function firstActiveLeftOfDealer(
  players: PokerPlayer[],
  dealerIndex: SeatIndex,
): SeatIndex {
  let idx = (dealerIndex + 1) % 5
  for (let i = 0; i < 5; i++) {
    if (players[idx].status === 'active') return players[idx].seatIndex
    idx = (idx + 1) % 5
  }
  return dealerIndex
}

// ── Resolve showdown ──────────────────────────────────────────────────────

export function resolveShowdown(state: HandState): {
  state: HandState
  results: ShowdownResult[]
} {
  const live = livePlayers(state.players)

  // If only one live player, they win everything
  if (live.length === 1) {
    const winner = live[0]
    const pot = totalPot(state.pots)
    const players = state.players.map((p) => ({
      ...p,
      stack: p.seatIndex === winner.seatIndex ? p.stack + pot : p.stack,
      status: p.seatIndex === winner.seatIndex
        ? ('winner' as const)
        : p.status === 'allIn'
        ? ('folded' as const)
        : p.status,
    }))

    const sessionProfit =
      state.sessionProfit + (players[0].stack - state.players[0].stack)

    return {
      state: { ...state, phase: 'result', players, sessionProfit },
      results: [
        {
          potIndex: 0,
          winners: [winner.seatIndex],
          winnerHandName: 'Last player standing',
          winnerBestCards: winner.holeCards,
          winnerHandEval: { category: 0, name: 'Last player standing', ranks: [] },
          amount: pot,
        },
      ],
    }
  }

  // Evaluate each live player's best hand
  const evals = live.map((p) => {
    const allCards = [...p.holeCards, ...state.communityCards]
    const best = best5from7(allCards)
    return { player: p, best }
  })

  // Award each pot
  const results: ShowdownResult[] = []
  let newPlayers = state.players.map((p) => ({ ...p }))

  for (let potIdx = 0; potIdx < state.pots.length; potIdx++) {
    const pot = state.pots[potIdx]
    const eligible = evals.filter((e) =>
      pot.eligibleSeats.includes(e.player.seatIndex),
    )

    if (eligible.length === 0) continue

    // Find best hand among eligible
    const sorted = eligible.sort((a, b) =>
      compareHands(b.best.eval, a.best.eval),
    )
    const topEval = sorted[0].best.eval
    const winners = sorted.filter(
      (e) => compareHands(e.best.eval, topEval) === 0,
    )

    const share = Math.floor(pot.amount / winners.length)
    const remainder = pot.amount - share * winners.length

    winners.forEach((w, i) => {
      const bonus = i === 0 ? remainder : 0
      newPlayers[w.player.seatIndex] = {
        ...newPlayers[w.player.seatIndex],
        stack: newPlayers[w.player.seatIndex].stack + share + bonus,
        status: 'winner',
      }
    })

    results.push({
      potIndex: potIdx,
      winners: winners.map((w) => w.player.seatIndex),
      winnerHandName: sorted[0].best.eval.name,
      winnerBestCards: sorted[0].best.bestCards,
      winnerHandEval: sorted[0].best.eval,
      amount: pot.amount,
    })
  }

  const sessionProfit =
    state.sessionProfit + (newPlayers[0].stack - state.players[0].stack)

  return {
    state: {
      ...state,
      phase: 'result',
      players: newPlayers,
      sessionProfit,
    },
    results,
  }
}

// ── Prepare next hand ─────────────────────────────────────────────────────

export function prepareNextHand(state: HandState): HandState {
  // Remove busted bots, give them a rebuy
  const players = state.players.map((p) => ({
    ...p,
    stack: p.personality !== 'Human' && p.stack < BB_AMOUNT
      ? 300 + Math.floor(Math.random() * 200)
      : p.stack,
    holeCards: [],
    currentBet: 0,
    totalBetThisHand: 0,
    status: (p.stack > 0 || p.personality !== 'Human'
      ? 'active'
      : 'sitting-out') as PokerPlayer['status'],
    isDealer: false,
    isSB: false,
    isBB: false,
  }))

  return {
    ...state,
    phase: 'idle',
    street: 'preflop',
    players,
    deck: [],
    communityCards: [],
    pots: [],
    currentBet: 0,
    actingIndex: null,
    lastRaiserIndex: null,
    newCommunityCardIndices: [],
    lastAction: null,
    streetActionCount: 0,
    activePlayerCountAtStreetStart: 0,
  }
}

// ── Utility exports ───────────────────────────────────────────────────────

export function getCallAmount(state: HandState, seatIndex: SeatIndex): number {
  const p = state.players[seatIndex]
  return Math.min(state.currentBet - p.currentBet, p.stack)
}

export function getMinRaise(state: HandState, seatIndex: SeatIndex): number {
  const p = state.players[seatIndex]
  const minTotal = state.currentBet + BB_AMOUNT
  return Math.min(minTotal, p.stack + p.currentBet)
}

export function canCheck(state: HandState, seatIndex: SeatIndex): boolean {
  return state.players[seatIndex].currentBet >= state.currentBet
}
