import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import Card from '../components/Card'
import { useWallet } from '../wallet'
import { THEMES, THEME_KEYS } from '../themes'
import type { ThemeKey } from '../themes'
import { BACKS, BACK_KEYS } from '../cardbacks'
import type { BackKey } from '../cardbacks'
import { formatUSD } from '../wallet'
import type { CSSVars } from '../styleVars'
import {
  createInitialState,
  dealHand,
  applyAction,
  advanceStreet,
  resolveShowdown,
  prepareNextHand,
  totalPot,
  getCallAmount,
  getMinRaise,
  canCheck,
  BUY_IN,
  BB_AMOUNT,
  SB_AMOUNT,
} from '../game/pokerEngine'
import { decideBotAction } from '../game/pokerBot'
import type {
  HandState,
  PokerPlayer,
  SeatIndex,
  ShowdownResult,
} from '../game/pokerTypes'

// ── Layout constants ──────────────────────────────────────────────────────

type HumanActionType = 'fold' | 'check' | 'call' | 'raise' | 'allIn'

const HUMAN_SEAT: SeatIndex = 0
const TABLE_W = 860
const TABLE_H = 500
const OVAL_CX = 430
const OVAL_CY = 250
const OVAL_A = 265
const OVAL_B = 155

// Angles: 270° = bottom (human). Others clockwise.
const SEAT_ANGLES = [270, 338, 46, 134, 222]

function seatPos(idx: number) {
  const rad = (SEAT_ANGLES[idx] * Math.PI) / 180
  return {
    x: OVAL_CX + OVAL_A * Math.cos(rad),
    y: OVAL_CY - OVAL_B * Math.sin(rad),
  }
}

const SEAT_EMOJIS = ['😎', '🐍', '🍀', '🧊', '🎭']

// ── Shared Picker (same as PusoyTrese) ────────────────────────────────────

function Picker<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: [T, string][]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-60">{label}</span>
      <div className="flex gap-1 rounded-lg bg-black/20 p-1">
        {options.map(([k, text]) => (
          <button
            key={k}
            onClick={() => onChange(k)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              value === k ? 'bg-white/90 text-slate-900' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────

function PokerHeader({
  theme,
  setTheme,
  back,
  setBack,
  balance,
}: {
  theme: ThemeKey
  setTheme: (t: ThemeKey) => void
  back: BackKey
  setBack: (b: BackKey) => void
  balance: number
}) {
  const themeOptions = THEME_KEYS.map((k) => [k, THEMES[k].label] as [ThemeKey, string])
  const backOptions = BACK_KEYS.map((k) => [k, BACKS[k].label] as [BackKey, string])

  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 border-b border-white/10">
      <div className="mr-auto flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg bg-black/20 px-3 py-1.5 text-sm font-medium transition hover:bg-black/30"
        >
          ← Games
        </Link>
        <h1 className="text-lg font-semibold tracking-tight">Texas Hold'em</h1>
        <span className="text-xs opacity-40">NL ${BB_AMOUNT}</span>
      </div>
      <div className="rounded-lg bg-black/25 px-4 py-1.5 text-sm">
        <span className="opacity-60">Wallet</span>{' '}
        <b className={`tabular-nums ${balance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
          {formatUSD(balance)}
        </b>
      </div>
      <Picker label="Theme" options={themeOptions} value={theme} onChange={setTheme} />
      <Picker label="Card back" options={backOptions} value={back} onChange={setBack} />
    </header>
  )
}

// ── Table felt ────────────────────────────────────────────────────────────

function TableFelt() {
  return (
    <div
      className="absolute rounded-[50%]"
      style={{
        left: OVAL_CX - 254,
        top: OVAL_CY - 142,
        width: 508,
        height: 284,
        background:
          'radial-gradient(ellipse at 50% 38%, var(--table-felt) 0%, var(--table-felt-2) 100%)',
        boxShadow:
          '0 0 0 5px rgba(0,0,0,0.5), 0 0 0 9px rgba(255,255,255,0.15), 0 0 36px 6px rgba(255,255,255,0.06)',
      }}
    />
  )
}

// ── Table center stack (street + pot + community cards — never overlaps) ──

function TableCenter({
  street,
  phase,
  pots,
  communityCards,
  newIndices,
  back,
}: {
  street: HandState['street']
  phase: HandState['phase']
  pots: HandState['pots']
  communityCards: HandState['communityCards']
  newIndices: number[]
  back: BackKey
}) {
  const streetLabels: Record<string, string> = {
    preflop: 'Pre-Flop',
    flop: 'Flop',
    turn: 'Turn',
    river: 'River',
  }
  const total = totalPot(pots)
  const showStreet = phase !== 'idle' && phase !== 'busted'

  return (
    <div
      className="absolute flex flex-col items-center gap-1.5 pointer-events-none"
      style={{
        left: OVAL_CX,
        top: OVAL_CY,
        transform: 'translate(-50%, -50%)',
        zIndex: 4,
      }}
    >
      {/* Street badge */}
      {showStreet && (
        <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest border border-white/20 bg-black/30 whitespace-nowrap">
          {streetLabels[street]}
        </span>
      )}

      {/* Pot */}
      {total > 0 && (
        <div className="flex flex-col items-center leading-tight">
          <span className="text-[9px] uppercase tracking-widest opacity-40 font-semibold">pot</span>
          <motion.span
            key={total}
            initial={{ scale: 1.15, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-base font-black tabular-nums whitespace-nowrap"
            style={{ textShadow: '0 0 10px currentColor' }}
          >
            ${total.toLocaleString()}
          </motion.span>
        </div>
      )}

      {/* Community cards */}
      <div className="flex gap-1.5 items-center">
        {[0, 1, 2, 3, 4].map((i) => {
          const card = communityCards[i]
          const isNew = newIndices.includes(i)
          if (!card) {
            return (
              <div
                key={`slot-${i}`}
                className="rounded-[var(--radius-card)] border border-white/10"
                style={
                  {
                    '--card-w': '2.75rem',
                    width: 'var(--card-w)',
                    aspectRatio: '5/7',
                    background: 'rgba(0,0,0,0.18)',
                  } as CSSVars
                }
              />
            )
          }
          return (
            <motion.div
              key={card.id}
              initial={isNew ? { opacity: 0, rotateY: 90, y: 10 } : false}
              animate={{ opacity: 1, rotateY: 0, y: 0 }}
              transition={{ duration: 0.38, ease: 'easeOut' }}
              style={{ '--card-w': '2.75rem' } as CSSVars}
            >
              <Card rank={card.rank} suit={card.suit} back={back} />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ── Bet chip ──────────────────────────────────────────────────────────────

function BetChip({ amount, seatIndex }: { amount: number; seatIndex: SeatIndex }) {
  if (amount === 0) return null
  const pos = seatPos(seatIndex)
  const dx = OVAL_CX - pos.x
  const dy = OVAL_CY - pos.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  const chipX = pos.x + (dx / dist) * 52
  const chipY = pos.y + (dy / dist) * 44

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      className="absolute flex items-center justify-center rounded-full text-[9px] font-black text-white border-2"
      style={{
        left: chipX,
        top: chipY,
        transform: 'translate(-50%, -50%)',
        width: 34,
        height: 34,
        background: 'radial-gradient(circle at 35% 35%, #78350f, #1c0801)',
        borderColor: '#fbbf24',
        boxShadow: '0 0 8px #f59e0b80',
        zIndex: 5,
      }}
    >
      ${amount >= 1000 ? `${(amount / 1000).toFixed(1)}k` : amount}
    </motion.div>
  )
}

// ── Player seat ───────────────────────────────────────────────────────────

function PlayerSeat({
  player,
  actingIndex,
  phase,
  back,
  dealKey,
}: {
  player: PokerPlayer
  actingIndex: SeatIndex | null
  phase: HandState['phase']
  back: BackKey
  dealKey: number
}) {
  const pos = seatPos(player.seatIndex)
  const isHuman = player.seatIndex === HUMAN_SEAT
  const isActing = actingIndex === player.seatIndex
  const isFolded = player.status === 'folded'
  const isWinner = player.status === 'winner'
  const isAllIn = player.status === 'allIn'
  const cardW = isHuman ? '2.7rem' : '2.1rem'

  // Reveal bot cards at showdown (if not folded)
  const showBotCards = phase === 'result' && !isHuman && player.status !== 'folded'

  return (
    <div
      className="absolute flex flex-col items-center gap-1"
      style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)', zIndex: 6 }}
    >
      {/* Bot hole cards — above avatar */}
      {!isHuman && player.holeCards.length > 0 && (
        <div
          className="flex gap-0.5 mb-0.5"
          style={{ opacity: isFolded ? 0.25 : 1, transition: 'opacity 0.3s' }}
        >
          {player.holeCards.map((card, ci) => (
            <motion.div
              key={`${dealKey}-${card.id}`}
              initial={{ opacity: 0, y: -28, rotate: -8 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: player.seatIndex * 0.06 + ci * 0.05, duration: 0.3, ease: 'easeOut' }}
              style={{ '--card-w': cardW } as CSSVars}
            >
              <Card
                rank={showBotCards ? card.rank : undefined}
                suit={showBotCards ? card.suit : undefined}
                faceDown={!showBotCards}
                back={back}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Avatar ring */}
      <div className="relative">
        <motion.div
          animate={{
            boxShadow: isWinner
              ? [
                  '0 0 0 2px #facc15, 0 0 16px #facc1599',
                  '0 0 0 2px #facc15, 0 0 30px #facc15cc',
                  '0 0 0 2px #facc15, 0 0 16px #facc1599',
                ]
              : isActing
              ? '0 0 0 2px rgba(255,255,255,0.6), 0 0 14px rgba(255,255,255,0.25)'
              : '0 0 0 1px rgba(255,255,255,0.15)',
          }}
          transition={isWinner ? { duration: 1, repeat: Infinity } : { duration: 0.2 }}
          className="flex items-center justify-center rounded-full overflow-hidden border border-white/10"
          style={{
            width: isHuman ? 58 : 50,
            height: isHuman ? 58 : 50,
            background: 'radial-gradient(circle at 35% 35%, rgba(255,255,255,0.1), rgba(0,0,0,0.6))',
            opacity: isFolded ? 0.35 : 1,
            transition: 'opacity 0.3s',
          }}
        >
          <span style={{ fontSize: isHuman ? 28 : 22 }}>{SEAT_EMOJIS[player.seatIndex]}</span>
        </motion.div>

        {/* Position badges (D / SB / BB) */}
        <div className="absolute -top-1.5 -right-1.5 flex gap-0.5">
          {player.isDealer && <PosBadge label="D" color="#fbbf24" />}
          {player.isSB && <PosBadge label="SB" color="#34d399" />}
          {player.isBB && <PosBadge label="BB" color="#60a5fa" />}
        </div>

        {/* Status overlay (FOLD / ALL IN / WIN) */}
        <AnimatePresence>
          {(isFolded || isAllIn || isWinner) && (
            <motion.div
              key={player.status}
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="absolute inset-0 flex items-center justify-center rounded-full text-[9px] font-black tracking-wider"
              style={{
                background: isFolded
                  ? 'rgba(0,0,0,0.75)'
                  : isAllIn
                  ? 'rgba(220,38,38,0.85)'
                  : 'rgba(161,130,0,0.85)',
                color: isFolded ? '#71717a' : '#fff',
              }}
            >
              {isFolded ? 'FOLD' : isAllIn ? 'ALL IN' : 'WIN'}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Name + stack */}
      <div className="flex flex-col items-center" style={{ maxWidth: 72 }}>
        <span
          className="text-[11px] font-semibold leading-tight truncate w-full text-center"
          style={{ opacity: isFolded ? 0.4 : 1 }}
        >
          {player.name}
        </span>
        <span
          className="text-[11px] font-black leading-tight tabular-nums"
          style={{
            color: player.stack === 0 ? 'rgba(255,255,255,0.3)' : 'var(--ui-text)',
            opacity: isFolded ? 0.4 : 1,
          }}
        >
          ${player.stack.toLocaleString()}
        </span>
      </div>

      {/* Human hole cards — below avatar */}
      {isHuman && player.holeCards.length > 0 && (
        <div className="flex gap-1 mt-0.5">
          {player.holeCards.map((card, ci) => (
            <motion.div
              key={`${dealKey}-${card.id}`}
              initial={{ opacity: 0, y: 24, rotate: ci === 0 ? -6 : 6 }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              transition={{ delay: ci * 0.08, duration: 0.35, ease: 'easeOut' }}
              style={{ '--card-w': cardW } as CSSVars}
            >
              <Card rank={card.rank} suit={card.suit} back={back} />
            </motion.div>
          ))}
        </div>
      )}

      {/* Thinking indicator — shown only for active non-human seats */}
      <AnimatePresence>
        {isActing && !isHuman && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex gap-0.5 items-center"
          >
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className="block rounded-full bg-white/60"
                style={{ width: 4, height: 4 }}
                animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                transition={{ duration: 0.7, delay: i * 0.15, repeat: Infinity }}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PosBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="rounded-full text-[8px] font-black px-1 py-0 leading-4"
      style={{ background: color, color: '#000' }}
    >
      {label}
    </span>
  )
}

// ── Action panel ──────────────────────────────────────────────────────────

function ActionPanel({
  state,
  onAction,
}: {
  state: HandState
  onAction: (type: HumanActionType, amount?: number) => void
}) {
  const [raiseMode, setRaiseMode] = useState(false)
  const [raiseAmt, setRaiseAmt] = useState(0)
  const player = state.players[HUMAN_SEAT]
  const callAmt = getCallAmount(state, HUMAN_SEAT)
  const minRaise = getMinRaise(state, HUMAN_SEAT)
  const isCheck = canCheck(state, HUMAN_SEAT)
  const pot = totalPot(state.pots)
  const maxRaise = player.stack + player.currentBet

  const handleAction = (type: HumanActionType, amount?: number) => {
    setRaiseMode(false)
    onAction(type, amount)
  }

  const BTN = 'rounded-lg px-5 py-2.5 text-sm font-bold uppercase tracking-wider border transition-all duration-150 disabled:opacity-40'

  if (raiseMode) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-3 w-full max-w-md mx-auto px-4"
      >
        <div className="flex items-center gap-3 w-full">
          <span className="w-20 text-right font-bold tabular-nums text-sm">
            ${raiseAmt.toLocaleString()}
          </span>
          <input
            type="range"
            min={minRaise}
            max={maxRaise}
            step={BB_AMOUNT}
            value={raiseAmt}
            onChange={(e) => setRaiseAmt(Number(e.target.value))}
            className="flex-1 accent-purple-500 h-1.5"
          />
          <div className="flex gap-1 text-[10px]">
            {[
              { label: '½', amt: Math.max(minRaise, Math.floor(pot * 0.5 / 5) * 5) },
              { label: 'Pot', amt: Math.min(maxRaise, Math.max(minRaise, Math.floor(pot / 5) * 5)) },
            ].map(({ label, amt }) => (
              <button
                key={label}
                className="rounded px-1.5 py-0.5 bg-white/10 border border-white/20 hover:bg-white/20"
                onClick={() => setRaiseAmt(Math.min(maxRaise, Math.max(minRaise, amt)))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            className={`${BTN} bg-black/30 border-white/20 hover:bg-white/10`}
            onClick={() => setRaiseMode(false)}
          >
            Cancel
          </button>
          <button
            className={`${BTN} bg-purple-900/60 border-purple-500 hover:border-purple-300`}
            onClick={() => {
              if (raiseAmt >= maxRaise) handleAction('allIn')
              else handleAction('raise', raiseAmt)
            }}
          >
            Raise to ${raiseAmt.toLocaleString()}
          </button>
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex gap-2 justify-center flex-wrap px-4"
    >
      <button
        className={`${BTN} bg-black/40 border-white/20 hover:border-white/40`}
        onClick={() => handleAction('fold')}
      >
        Fold
      </button>
      <button
        className={`${BTN} bg-black/30 border-white/40 hover:border-white/70`}
        onClick={() => handleAction(isCheck ? 'check' : 'call')}
      >
        {isCheck ? 'Check' : `Call $${callAmt.toLocaleString()}`}
      </button>
      {!isCheck && player.stack > callAmt && (
        <button
          className={`${BTN} bg-purple-900/50 border-purple-500/70 hover:border-purple-300`}
          onClick={() => { setRaiseAmt(minRaise); setRaiseMode(true) }}
        >
          Raise
        </button>
      )}
      <button
        className={`${BTN} bg-red-900/50 border-red-500/70 hover:border-red-300`}
        onClick={() => handleAction('allIn')}
      >
        All In ${player.stack.toLocaleString()}
      </button>
    </motion.div>
  )
}

// ── Result overlay ────────────────────────────────────────────────────────

function ResultOverlay({
  results,
  players,
  onNext,
  onCashOut,
  humanStack,
}: {
  results: ShowdownResult[]
  players: PokerPlayer[]
  onNext: () => void
  onCashOut: () => void
  humanStack: number
}) {
  const humanWon = results.some((r) => r.winners.includes(HUMAN_SEAT))

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 flex items-center justify-center rounded-2xl"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)', zIndex: 20 }}
    >
      <motion.div
        initial={{ scale: 0.88, y: 16 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        className="flex flex-col items-center gap-4 rounded-2xl border p-7 mx-4"
        style={{
          background: 'rgba(0,0,0,0.88)',
          borderColor: humanWon ? 'rgba(250,204,21,0.6)' : 'rgba(255,255,255,0.12)',
          minWidth: 280,
          maxWidth: 360,
        }}
      >
        {humanWon && <span className="text-4xl">🏆</span>}

        <div className="text-center space-y-2">
          {results.map((r, i) => (
            <div key={i}>
              <p
                className="text-base font-black"
                style={{ color: r.winners.includes(HUMAN_SEAT) ? '#facc15' : 'var(--ui-text)' }}
              >
                {r.winners.map((s) => players[s].name).join(' & ')} wins ${r.amount.toLocaleString()}
              </p>
              <p className="text-xs opacity-50">{r.winnerHandName}</p>
            </div>
          ))}
        </div>

        {humanStack === 0 ? (
          <div className="text-center">
            <p className="text-red-400 text-sm font-semibold mb-3">No chips remaining</p>
            <button
              onClick={onCashOut}
              className="rounded-lg px-6 py-2 text-sm font-bold border border-white/20 bg-white/10 hover:bg-white/20"
            >
              Leave Table
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onCashOut}
              className="rounded-lg px-4 py-2 text-sm font-bold border border-white/20 bg-white/10 hover:bg-white/20"
            >
              Cash Out ${humanStack.toLocaleString()}
            </button>
            <button
              onClick={onNext}
              className="rounded-lg px-4 py-2 text-sm font-bold border border-white/40 bg-white/20 hover:bg-white/30"
            >
              Next Hand →
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Buy-in screen ─────────────────────────────────────────────────────────

function BuyInScreen({ onBuyIn, balance }: { onBuyIn: () => void; balance: number }) {
  const canBuyIn = balance >= BUY_IN
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center h-full gap-6 py-16"
    >
      <div className="text-center">
        <h2 className="text-3xl font-black mb-1">Texas Hold'em</h2>
        <p className="text-sm opacity-50">No-Limit · 5 Players · SB ${SB_AMOUNT} / BB ${BB_AMOUNT}</p>
      </div>
      <div className="rounded-2xl border border-white/15 p-6 flex flex-col items-center gap-4 w-72 bg-black/20">
        <div className="text-center">
          <p className="text-xs opacity-50 uppercase tracking-wider mb-1">Buy-in</p>
          <p className="text-4xl font-black">${BUY_IN.toLocaleString()}</p>
        </div>
        <div className="text-center">
          <p className="text-xs opacity-50 uppercase tracking-wider mb-1">Your wallet</p>
          <p className={`text-xl font-bold ${canBuyIn ? 'text-emerald-300' : 'text-red-400'}`}>
            {formatUSD(balance)}
          </p>
        </div>
        <button
          disabled={!canBuyIn}
          onClick={onBuyIn}
          className="w-full rounded-xl py-3 font-bold text-sm border border-white/30 bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {canBuyIn ? 'Sit Down' : 'Insufficient Funds'}
        </button>
      </div>
      <p className="text-xs opacity-30">Viper · Lucky Lou · The Nit · Bluffmaster</p>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────

export default function Poker() {
  const wallet = useWallet()
  const [theme, setTheme] = useState<ThemeKey>('midnight')
  const [back, setBack] = useState<BackKey>('lattice')
  const [handState, setHandState] = useState<HandState>(() => createInitialState(0))
  const [results, setResults] = useState<ShowdownResult[]>([])
  const [dealKey, setDealKey] = useState(0)
  const [scale, setScale] = useState(1)

  // Responsive scale
  useEffect(() => {
    const update = () => setScale(Math.min(1, (window.innerWidth - 24) / TABLE_W))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  // Clear new-card animation indices after animation fires
  useEffect(() => {
    if (!handState.newCommunityCardIndices.length) return
    const t = setTimeout(
      () => setHandState((p) => ({ ...p, newCommunityCardIndices: [] })),
      500,
    )
    return () => clearTimeout(t)
  }, [handState.newCommunityCardIndices])

  // Bot turns — fast, 300–550ms
  useEffect(() => {
    const { phase, actingIndex, players } = handState
    if (phase !== 'betting' || actingIndex === null || actingIndex === HUMAN_SEAT) return
    const player = players[actingIndex]
    if (!player || player.status !== 'active') return

    const delay = 700 + Math.random() * 600
    const t = setTimeout(() => {
      try {
        const action = decideBotAction(player, handState)
        setHandState((prev) => applyAction(prev, action))
      } catch {
        // Safety: if bot logic errors, make it check/fold so the game never deadlocks
        const fallback = canCheck(handState, player.seatIndex)
          ? { seatIndex: player.seatIndex, type: 'check' as const, amount: 0 }
          : { seatIndex: player.seatIndex, type: 'fold' as const, amount: 0 }
        setHandState((prev) => applyAction(prev, fallback))
      }
    }, delay)
    return () => clearTimeout(t)
  }, [handState.actingIndex, handState.phase, handState.handNumber])

  // Street advancement / showdown trigger
  useEffect(() => {
    const { phase, actingIndex, players, street } = handState
    if (phase !== 'betting' || actingIndex !== null) return

    const active = players.filter((p) => p.status === 'active')
    const live = players.filter((p) => p.status === 'active' || p.status === 'allIn')

    if (live.length <= 1 || active.length === 0) {
      const t = setTimeout(() => {
        const { state: s, results: r } = resolveShowdown(handState)
        setHandState(s)
        setResults(r)
      }, 900)
      return () => clearTimeout(t)
    }

    if (street === 'river') {
      // Pause on river so players can see the board before result
      const t = setTimeout(() => {
        const { state: s, results: r } = resolveShowdown(handState)
        setHandState(s)
        setResults(r)
      }, 1200)
      return () => clearTimeout(t)
    }

    // Pause between streets so community cards are visible
    const t = setTimeout(() => setHandState((p) => advanceStreet(p)), 900)
    return () => clearTimeout(t)
  }, [handState.actingIndex, handState.phase, handState.street])

  const handleBuyIn = useCallback(() => {
    wallet.adjust(-BUY_IN)
    setHandState(createInitialState(BUY_IN))
  }, [wallet])

  const handleDeal = useCallback(() => {
    setResults([])
    setDealKey((k) => k + 1)
    setHandState((p) => dealHand(p))
  }, [])

  const handleHumanAction = useCallback(
    (type: HumanActionType, raiseAmount?: number) => {
      setHandState((prev) => {
        const player = prev.players[HUMAN_SEAT]
        let amount = 0
        if (type === 'call') amount = player.currentBet + getCallAmount(prev, HUMAN_SEAT)
        else if (type === 'raise') amount = raiseAmount ?? getMinRaise(prev, HUMAN_SEAT)
        else if (type === 'allIn') amount = player.stack + player.currentBet
        return applyAction(prev, { seatIndex: HUMAN_SEAT, type, amount })
      })
    },
    [],
  )

  const handleNextHand = useCallback(() => {
    setResults([])
    setHandState((p) => prepareNextHand(p))
  }, [])

  const handleCashOut = useCallback(() => {
    const stack = handState.players[HUMAN_SEAT].stack
    if (stack > 0) wallet.adjust(stack)
    setHandState(createInitialState(0))
    setResults([])
  }, [handState.players, wallet])

  const { phase, actingIndex, players, communityCards, pots, street, newCommunityCardIndices } = handState
  const humanPlayer = players[HUMAN_SEAT]
  const hasBoughtIn = humanPlayer.stack > 0 || phase !== 'idle'
  const isHumanTurn = phase === 'betting' && actingIndex === HUMAN_SEAT
  const showResult = phase === 'result' && results.length > 0

  const shellStyle: CSSVars = { '--card-w': '4rem' }

  return (
    <div
      className={`${THEMES[theme].className} min-h-screen flex flex-col text-[color:var(--ui-text)]`}
      style={{
        ...shellStyle,
        background: 'radial-gradient(ellipse at 50% 30%, var(--table-felt-2), #050508 70%)',
      }}
    >
      <PokerHeader
        theme={theme}
        setTheme={setTheme}
        back={back}
        setBack={setBack}
        balance={wallet.balance}
      />

      <div className="flex-1 flex flex-col items-center justify-center py-4 px-3 overflow-hidden">
        {!hasBoughtIn ? (
          <div style={{ width: '100%', maxWidth: 380 }}>
            <BuyInScreen onBuyIn={handleBuyIn} balance={wallet.balance} />
          </div>
        ) : (
          <>
            {/* Scaled table */}
            <div
              style={{
                width: TABLE_W,
                height: TABLE_H,
                transform: `scale(${scale})`,
                transformOrigin: 'top center',
                position: 'relative',
                flexShrink: 0,
              }}
            >
              <TableFelt />
              <TableCenter
                street={street}
                phase={phase}
                pots={pots}
                communityCards={communityCards}
                newIndices={newCommunityCardIndices}
                back={back}
              />

              {/* Bet chips */}
              <AnimatePresence>
                {players.map((p) =>
                  p.currentBet > 0 ? (
                    <BetChip key={`chip-${p.seatIndex}`} amount={p.currentBet} seatIndex={p.seatIndex} />
                  ) : null,
                )}
              </AnimatePresence>

              {/* Seats */}
              {players.map((p) => (
                <PlayerSeat
                  key={`${dealKey}-${p.seatIndex}`}
                  player={p}
                  actingIndex={actingIndex}
                  phase={phase}
                  back={back}
                  dealKey={dealKey}
                />
              ))}

              {showResult && (
                <ResultOverlay
                  results={results}
                  players={players}
                  onNext={handleNextHand}
                  onCashOut={handleCashOut}
                  humanStack={humanPlayer.stack}
                />
              )}
            </div>

            {/* Action area */}
            <div
              className="flex flex-col items-center gap-3 mt-3 w-full"
              style={{ maxWidth: TABLE_W * scale }}
            >
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <motion.button
                    key="deal"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    onClick={handleDeal}
                    className="rounded-xl px-12 py-3 font-bold border border-white/30 bg-white/10 hover:bg-white/20 transition text-base"
                  >
                    Deal Hand {handState.handNumber > 0 ? `#${handState.handNumber + 1}` : ''}
                  </motion.button>
                )}

                {isHumanTurn && (
                  <motion.div key="action" className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <ActionPanel
                      state={handState}
                      onAction={(type, amount) => handleHumanAction(type, amount)}
                    />
                  </motion.div>
                )}

                {phase === 'betting' && actingIndex !== null && actingIndex !== HUMAN_SEAT && (
                  <motion.p
                    key="bot-thinking"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs opacity-40"
                  >
                    {players[actingIndex]?.name} is deciding…
                  </motion.p>
                )}
              </AnimatePresence>

              {phase !== 'idle' && phase !== 'result' && (
                <button
                  className="text-[11px] opacity-30 hover:opacity-60 transition underline"
                  onClick={handleCashOut}
                >
                  Leave table · cash out ${humanPlayer.stack.toLocaleString()}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
