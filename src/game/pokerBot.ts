import {
  classifyPreflopHand,
  estimateEquity,
  calcPotOdds,
} from './pokerEval'
import {
  BB_AMOUNT,
  totalPot,
  getCallAmount,
  getMinRaise,
} from './pokerEngine'
import type {
  BotPersonality,
  PlayerAction,
  PokerPlayer,
  HandState,
  SeatIndex,
  PreflopTier,
} from './pokerTypes'

interface BotProfile {
  minTier: PreflopTier
  vpip: number
  pfr: number
  bluffFreq: number
  aggFactor: number
  foldToRaise: number
  flipProb: number
}

const PROFILES: Record<BotPersonality, BotProfile> = {
  TAG: {
    minTier: 'strong',
    vpip: 0.22,
    pfr: 0.18,
    bluffFreq: 0.15,
    aggFactor: 1.0,
    foldToRaise: 0.55,
    flipProb: 0.05,
  },
  LAG: {
    minTier: 'playable',
    vpip: 0.40,
    pfr: 0.30,
    bluffFreq: 0.30,
    aggFactor: 1.4,
    foldToRaise: 0.30,
    flipProb: 0.15,
  },
  'Calling Station': {
    minTier: 'weak',
    vpip: 0.55,
    pfr: 0.05,
    bluffFreq: 0.10,
    aggFactor: 0.5,
    foldToRaise: 0.15,
    flipProb: 0.08,
  },
  Nit: {
    minTier: 'premium',
    vpip: 0.12,
    pfr: 0.09,
    bluffFreq: 0.05,
    aggFactor: 0.7,
    foldToRaise: 0.70,
    flipProb: 0.03,
  },
}

const TIER_ORDER: PreflopTier[] = ['weak', 'playable', 'strong', 'premium']

function tierAtLeast(tier: PreflopTier, min: PreflopTier): boolean {
  return TIER_ORDER.indexOf(tier) >= TIER_ORDER.indexOf(min)
}

function jitter(base: number, pct = 0.15): number {
  return base * (1 - pct + Math.random() * 2 * pct)
}

function roundToNearestFive(n: number): number {
  return Math.round(n / 5) * 5
}

function legalizeAction(
  action: PlayerAction,
  player: PokerPlayer,
  state: HandState,
): PlayerAction {
  const minRaise = getMinRaise(state, player.seatIndex)
  const maxRaise = player.stack + player.currentBet

  if (action.type === 'raise') {
    if (action.amount >= maxRaise) {
      return { ...action, type: 'allIn', amount: maxRaise }
    }
    if (action.amount < minRaise) {
      return { ...action, amount: minRaise }
    }
  }

  if (action.type === 'call') {
    const callAmt = getCallAmount(state, player.seatIndex)
    if (callAmt >= player.stack) {
      return { seatIndex: player.seatIndex, type: 'allIn', amount: player.stack + player.currentBet }
    }
  }

  return action
}

function makeFold(seatIndex: SeatIndex): PlayerAction {
  return { seatIndex, type: 'fold', amount: 0 }
}

function makeCheck(seatIndex: SeatIndex): PlayerAction {
  return { seatIndex, type: 'check', amount: 0 }
}

function makeCall(player: PokerPlayer, state: HandState): PlayerAction {
  const callAmt = getCallAmount(state, player.seatIndex)
  return { seatIndex: player.seatIndex, type: 'call', amount: player.currentBet + callAmt }
}

function makeRaise(player: PokerPlayer, state: HandState, sizingMultiplier: number): PlayerAction {
  const pot = totalPot(state.pots)
  const sizing = jitter(pot * sizingMultiplier)
  const raiseTotal = Math.max(
    getMinRaise(state, player.seatIndex),
    player.currentBet + roundToNearestFive(sizing),
  )
  return legalizeAction(
    { seatIndex: player.seatIndex, type: 'raise', amount: raiseTotal },
    player,
    state,
  )
}

function makeAllIn(player: PokerPlayer): PlayerAction {
  return { seatIndex: player.seatIndex, type: 'allIn', amount: player.stack + player.currentBet }
}

// ── Preflop decision ──────────────────────────────────────────────────────

function decidePreflopAction(
  player: PokerPlayer,
  state: HandState,
  profile: BotProfile,
): PlayerAction {
  const { seatIndex } = player
  const tier = classifyPreflopHand(player.holeCards[0], player.holeCards[1])
  const callAmount = getCallAmount(state, seatIndex)
  const isRaisedPot = state.currentBet > BB_AMOUNT
  const stackPressure = callAmount > player.stack * 0.4 ? 0.2 : 0

  // Check option (BB with no raise)
  if (callAmount === 0) {
    if (tierAtLeast(tier, 'strong') && Math.random() < profile.pfr) {
      return makeRaise(player, state, 0.7)
    }
    return makeCheck(seatIndex)
  }

  // Below minimum tier — consider folding
  if (!tierAtLeast(tier, profile.minTier)) {
    const foldProb = isRaisedPot
      ? Math.min(0.95, profile.foldToRaise + stackPressure)
      : 1 - profile.vpip
    if (Math.random() < foldProb) return makeFold(seatIndex)
    return makeCall(player, state)
  }

  // Premium hands — re-raise aggressively
  if (tier === 'premium') {
    if (Math.random() < 0.80) return makeRaise(player, state, profile.aggFactor)
    return makeCall(player, state)
  }

  // Strong hands in raised pot — sometimes re-raise
  if (tier === 'strong' && isRaisedPot) {
    if (Math.random() < profile.pfr * 0.6) return makeRaise(player, state, profile.aggFactor * 0.8)
    if (Math.random() < profile.foldToRaise) return makeFold(seatIndex)
    return makeCall(player, state)
  }

  // Strong or playable in unraised pot
  if (Math.random() < profile.pfr) return makeRaise(player, state, 0.5)
  return makeCall(player, state)
}

// ── Postflop decision ─────────────────────────────────────────────────────

function decidePostflopAction(
  player: PokerPlayer,
  state: HandState,
  profile: BotProfile,
  equity: number,
  potOdds: number,
): PlayerAction {
  const { seatIndex } = player
  const callAmount = getCallAmount(state, seatIndex)
  const canCheck = callAmount === 0
  const pot = totalPot(state.pots)

  // Very strong hand
  if (equity > 0.70) {
    // Slowplay occasionally
    if (Math.random() < 0.15) return canCheck ? makeCheck(seatIndex) : makeCall(player, state)
    // All-in with very strong hand if big pot
    if (equity > 0.85 && pot > player.stack * 0.5) return makeAllIn(player)
    return makeRaise(player, state, profile.aggFactor)
  }

  // Medium hand — continue if profitable
  if (equity >= 0.40) {
    if (canCheck) {
      // Bet for value sometimes
      if (Math.random() < profile.aggFactor * 0.5) return makeRaise(player, state, 0.5)
      return makeCheck(seatIndex)
    }
    if (equity > potOdds + 0.05) return makeCall(player, state)
    if (Math.random() < profile.foldToRaise * 0.5) return makeFold(seatIndex)
    return makeCall(player, state)
  }

  // Draw / marginal hand
  if (equity >= 0.25) {
    if (canCheck) return makeCheck(seatIndex)
    if (equity > potOdds) return makeCall(player, state)
    // Semi-bluff
    if (Math.random() < profile.bluffFreq) return makeRaise(player, state, 0.5)
    return makeFold(seatIndex)
  }

  // Weak hand — check or fold, station calls anyway
  if (canCheck) return makeCheck(seatIndex)
  if (player.personality === 'Calling Station' && Math.random() < 0.40) {
    return makeCall(player, state)
  }
  return makeFold(seatIndex)
}

// ── Main bot decision entry point ─────────────────────────────────────────

export function decideBotAction(
  player: PokerPlayer,
  state: HandState,
): PlayerAction {
  const profile = PROFILES[player.personality as BotPersonality]

  if (player.holeCards.length < 2) return makeCheck(player.seatIndex)

  const activePlayers = state.players.filter(
    (p) => p.status === 'active' || p.status === 'allIn',
  ).length

  const equity = estimateEquity(player.holeCards, state.communityCards, activePlayers)
  const callAmount = getCallAmount(state, player.seatIndex)
  const potOdds = calcPotOdds(callAmount, totalPot(state.pots))

  let action: PlayerAction

  if (state.street === 'preflop') {
    action = decidePreflopAction(player, state, profile)
  } else {
    action = decidePostflopAction(player, state, profile, equity, potOdds)
  }

  // Personality flip: small chance to take an adjacent action
  if (Math.random() < profile.flipProb) {
    const flip = Math.random()
    if (action.type === 'raise' && flip < 0.5) {
      action = makeCall(player, state)
    } else if (action.type === 'fold' && flip < 0.4) {
      const callAmt = getCallAmount(state, player.seatIndex)
      if (callAmt === 0) action = makeCheck(player.seatIndex)
      else action = makeCall(player, state)
    }
  }

  return legalizeAction(action, player, state)
}
