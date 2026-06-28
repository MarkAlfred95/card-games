import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { buildDeck, shuffle, deal, RANKS } from '../game/deck'
import { evaluate, compareHands } from '../game/ranking'
import { scoreBanker } from '../game/scoring'
import { arrangeBot } from '../game/bot'
import type { Arrangement, BankerRoundResult, Card as CardModel } from '../game/types'
import Card from '../components/Card'
import DraggableCard from '../components/DraggableCard'
import DropZone from '../components/DropZone'
import ResultsPanel from '../components/ResultsPanel'
import ChipTray from '../components/ChipTray'
import { THEMES, THEME_KEYS } from '../themes'
import type { ThemeKey } from '../themes'
import { BACKS, BACK_KEYS } from '../cardbacks'
import type { BackKey } from '../cardbacks'
import type { CSSVars } from '../styleVars'
import { useWallet, formatUSD } from '../wallet'

interface Zones {
  hand: CardModel[]
  back: CardModel[]
  middle: CardModel[]
  front: CardModel[]
}
type ZoneId = keyof Zones

interface RoundState {
  zones: Zones
  hands: CardModel[][] // 13 cards per seat (human seat's are also staged in zones)
}

type Phase = 'setup' | 'betting' | 'arranging' | 'scoring' | 'revealed' | 'gameover'
type ResultData = BankerRoundResult & { arrangements: Arrangement[] }

const SEATS = 4
const GAMES_PER_BANKER = 3
const TOTAL_GAMES = SEATS * GAMES_PER_BANKER // 12

// A player is "out of money" once they can't afford the smallest chip ($5).
// Instead of staking $0 (no way to recover), they're auto-staked this much per
// point so they still have a chance to win some back.
const MIN_CHIP = 5
const COMEBACK_STAKE = 50

const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i])) as Record<string, number>
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 }
const CAPACITY: Record<ZoneId, number> = { hand: 13, back: 5, middle: 5, front: 3 }

function sortHand(cards: CardModel[]): CardModel[] {
  return [...cards].sort(
    (a, b) =>
      SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
      RANK_ORDER[b.rank] - RANK_ORDER[a.rank],
  )
}

const bankerOf = (gameIndex: number) => Math.floor(gameIndex / GAMES_PER_BANKER)

// Random starting bankroll for a bot: $500–$2500 in $50 steps.
function botBalance(): number {
  return 500 + Math.round(Math.random() * 40) * 50
}

// A bot picks a per-point stake it can afford. If it's out of money, it gets the
// comeback stake so it can still win some back.
function botStake(balance: number): number {
  if (balance < MIN_CHIP) return COMEBACK_STAKE
  const denoms = [5, 10, 50, 100].filter((d) => d <= balance)
  return denoms[Math.floor(Math.random() * denoms.length)]
}

// Deal a fresh round. Returns the human seat's hand staged in zones plus every
// seat's 13 cards (used to arrange the bots at scoring time).
function dealRound(humanSeat: number): RoundState {
  const hands = deal(shuffle(buildDeck()), SEATS, 13)
  return {
    zones: { hand: sortHand(hands[humanSeat]), back: [], middle: [], front: [] },
    hands,
  }
}

export default function PusoyTrese() {
  const wallet = useWallet()
  const [theme, setTheme] = useState<ThemeKey>('classic')
  const [back, setBack] = useState<BackKey>('lattice')

  const [phase, setPhase] = useState<Phase>('setup')
  const [humanSeat, setHumanSeat] = useState<number>(0)
  const [gameIndex, setGameIndex] = useState<number>(0)
  const [botBalances, setBotBalances] = useState<number[]>([0, 0, 0, 0])

  const [round, setRound] = useState<RoundState>(() => dealRound(0))
  const [stakes, setStakes] = useState<number[]>([0, 0, 0, 0])
  const [humanStake, setHumanStake] = useState<number>(0)
  const [activeCard, setActiveCard] = useState<CardModel | null>(null)
  const [result, setResult] = useState<ResultData | null>(null)

  const { zones, hands } = round
  const banker = bankerOf(gameIndex)
  const humanIsBanker = humanSeat === banker

  // Per-seat display names: the human is "You", others "Bot 1..3" in seat order.
  const names = useMemo(() => {
    let k = 1
    return Array.from({ length: SEATS }, (_, s) => (s === humanSeat ? 'You' : `Bot ${k++}`))
  }, [humanSeat])

  // Balances by seat (human reads from the shared wallet).
  const balances = useMemo(
    () => Array.from({ length: SEATS }, (_, s) => (s === humanSeat ? wallet.balance : botBalances[s])),
    [humanSeat, wallet.balance, botBalances],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  // Evaluate each row once full; derive foul state progressively.
  const status = useMemo(() => {
    const ev = {
      back: zones.back.length === 5 ? evaluate(zones.back) : null,
      middle: zones.middle.length === 5 ? evaluate(zones.middle) : null,
      front: zones.front.length === 3 ? evaluate(zones.front) : null,
    }
    const foulBM = !!ev.back && !!ev.middle && compareHands(ev.back, ev.middle) < 0
    const foulMF = !!ev.middle && !!ev.front && compareHands(ev.middle, ev.front) < 0
    return {
      ev,
      foulBM,
      foulMF,
      isFoul: foulBM || foulMF,
      complete: Boolean(ev.back && ev.middle && ev.front),
    }
  }, [zones])

  // --- Match flow -----------------------------------------------------------

  function beginMatch(seat: number) {
    const bb = Array.from({ length: SEATS }, (_, s) => (s === seat ? 0 : botBalance()))
    setBotBalances(bb)
    setHumanSeat(seat)
    setGameIndex(0)
    enterRound(0, seat, bb)
  }

  // Deal a game and decide whether the human must place a bet first.
  function enterRound(gi: number, seat: number, bb: number[]) {
    const bnk = bankerOf(gi)
    const r = dealRound(seat)
    const humanBroke = wallet.balance < MIN_CHIP
    const st = Array.from({ length: SEATS }, (_, s) => {
      if (s === bnk) return 0
      if (s === seat) return humanBroke ? COMEBACK_STAKE : 0 // filled at bet time unless broke
      return botStake(bb[s])
    })
    setRound(r)
    setStakes(st)
    setHumanStake(0)
    setResult(null)
    // Banker doesn't bet; a broke player is auto-staked and skips the chip tray.
    setPhase(seat === bnk || humanBroke ? 'arranging' : 'betting')
  }

  function placeBet() {
    setStakes((prev) => prev.map((s, i) => (i === humanSeat ? humanStake : s)))
    setPhase('arranging')
  }

  function handleScore() {
    setPhase('scoring')
    // Defer the heavy bot search so the "Scoring…" state paints first.
    setTimeout(() => {
      const arrangements: Arrangement[] = hands.map((hand, seat) =>
        seat === humanSeat
          ? { back: zones.back, middle: zones.middle, front: zones.front }
          : arrangeBot(hand),
      )
      const res = scoreBanker(arrangements, banker, stakes)
      wallet.adjust(res.moneyDeltas[humanSeat])
      setBotBalances((prev) =>
        prev.map((b, seat) => (seat === humanSeat ? b : b + res.moneyDeltas[seat])),
      )
      setResult({ ...res, arrangements })
      setPhase('revealed')
    }, 20)
  }

  function nextGame() {
    const next = gameIndex + 1
    if (next >= TOTAL_GAMES) {
      setPhase('gameover')
      return
    }
    setGameIndex(next)
    enterRound(next, humanSeat, botBalances)
  }

  function playAgain() {
    setPhase('setup')
    setGameIndex(0)
    setResult(null)
  }

  // --- Drag handlers --------------------------------------------------------

  function handleDragStart({ active }: DragStartEvent) {
    const fromZone = active.data.current?.zone as ZoneId | undefined
    const card = fromZone ? zones[fromZone].find((c) => c.id === active.id) : undefined
    setActiveCard(card ?? null)
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveCard(null)
    if (!over) return
    const from = active.data.current?.zone as ZoneId | undefined
    const to = over.id as ZoneId
    if (!from || from === to) return

    setRound((prev) => {
      const z = prev.zones
      if (z[to].length >= CAPACITY[to]) return prev // target full -> reject
      const card = z[from].find((c) => c.id === active.id)
      if (!card) return prev
      return {
        ...prev,
        zones: {
          ...z,
          [from]: z[from].filter((c) => c.id !== active.id),
          [to]: [...z[to], card],
        },
      }
    })
  }

  const themeOptions = THEME_KEYS.map((k) => [k, THEMES[k].label] as [ThemeKey, string])
  const backOptions = BACK_KEYS.map((k) => [k, BACKS[k].label] as [BackKey, string])

  const shellStyle = { '--card-w': '4.6rem' } as CSSVars
  const shellClass = `${THEMES[theme].className} min-h-screen text-[color:var(--ui-text)]`
  const bgStyle = {
    background: 'radial-gradient(ellipse at 50% 0%, var(--table-felt), var(--table-felt-2))',
  }

  // --- Setup screen ---------------------------------------------------------

  if (phase === 'setup') {
    return (
      <div className={shellClass} style={shellStyle}>
        <div className="flex min-h-screen flex-col gap-6 p-6" style={bgStyle}>
          <Header theme={theme} setTheme={setTheme} back={back} setBack={setBack}
            themeOptions={themeOptions} backOptions={backOptions} balance={wallet.balance} />

          <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-black/25 p-6 ring-1 ring-white/10">
            <h2 className="text-xl font-semibold">Choose your seat</h2>
            <p className="mt-1 text-sm opacity-70">
              The banker rotates every {GAMES_PER_BANKER} games over {TOTAL_GAMES} games total.
              Pick the seat you want — it decides when you deal as banker.
            </p>

            <div className="mt-5 grid grid-cols-2 gap-3">
              {Array.from({ length: SEATS }, (_, s) => {
                const lo = s * GAMES_PER_BANKER + 1
                const hi = lo + GAMES_PER_BANKER - 1
                return (
                  <button
                    key={s}
                    onClick={() => beginMatch(s)}
                    className="group rounded-xl bg-white/5 p-4 text-left ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/30"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-bold">Seat {s + 1}</span>
                      {s === 0 && (
                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-900">
                          Bank first
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm opacity-70">
                      👑 Banker for games {lo}–{hi}
                    </p>
                  </button>
                )
              })}
            </div>

            <p className="mt-5 text-sm opacity-70">
              Your balance:{' '}
              <b className={wallet.balance < 0 ? 'text-red-300' : 'text-emerald-300'}>
                {formatUSD(wallet.balance)}
              </b>
            </p>
            {wallet.balance < 5 && (
              <button
                onClick={wallet.reset}
                className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
              >
                Reset wallet to {formatUSD(1000)}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // --- Game-over screen -----------------------------------------------------

  if (phase === 'gameover') {
    const ranking = balances
      .map((bal, seat) => ({ seat, bal }))
      .sort((a, b) => b.bal - a.bal)
    const youWon = ranking[0].seat === humanSeat

    return (
      <div className={shellClass} style={shellStyle}>
        <div className="flex min-h-screen flex-col gap-6 p-6" style={bgStyle}>
          <Header theme={theme} setTheme={setTheme} back={back} setBack={setBack}
            themeOptions={themeOptions} backOptions={backOptions} balance={wallet.balance} />

          <div className="mx-auto mt-6 w-full max-w-xl rounded-2xl bg-black/25 p-6 ring-1 ring-white/10">
            <h2 className="text-2xl font-bold">
              {youWon ? '🏆 You finished on top!' : 'Game over'}
            </h2>
            <p className="mt-1 text-sm opacity-70">All {TOTAL_GAMES} games played. Final standings:</p>

            <div className="mt-4 space-y-2">
              {ranking.map((r, i) => (
                <div
                  key={r.seat}
                  className={`flex items-center justify-between rounded-lg px-4 py-2.5 ${
                    r.seat === humanSeat ? 'bg-emerald-500/15 ring-1 ring-emerald-400/40' : 'bg-black/20'
                  }`}
                >
                  <span className="font-semibold">
                    {i + 1}. {names[r.seat]}
                  </span>
                  <span className="font-bold tabular-nums">{formatUSD(r.bal)}</span>
                </div>
              ))}
            </div>

            <button
              onClick={playAgain}
              className="mt-6 w-full rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300"
            >
              Play again →
            </button>
          </div>
        </div>
      </div>
    )
  }

  // --- Active game (betting / arranging / scoring / revealed) ----------------

  const statusBar = status.complete
    ? status.isFoul
      ? {
          text: status.foulBM
            ? 'Foul — middle is stronger than back'
            : 'Foul — front is stronger than middle',
          tone: 'bg-red-500/85 text-white',
        }
      : { text: 'Legal arrangement ✓ — ready to score', tone: 'bg-emerald-500/85 text-white' }
    : {
        text: `Place all 13 cards — ${zones.hand.length} left in hand`,
        tone: 'bg-white/15',
      }

  return (
    <div className={shellClass} style={shellStyle}>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex min-h-screen flex-col gap-4 p-6" style={bgStyle}>
          <Header theme={theme} setTheme={setTheme} back={back} setBack={setBack}
            themeOptions={themeOptions} backOptions={backOptions} balance={wallet.balance} />

          {/* Match progress */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-black/15 px-4 py-2 text-sm">
            <span>
              <span className="opacity-60">Game</span>{' '}
              <b>{gameIndex + 1}</b> <span className="opacity-60">of {TOTAL_GAMES}</span>
            </span>
            <span>
              👑 <span className="opacity-60">Banker:</span>{' '}
              <b>{humanIsBanker ? 'You' : names[banker]}</b>
            </span>
          </div>

          {/* Seat scoreboard: balance, banker crown, stake this round */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {names.map((n, s) => (
              <div
                key={s}
                className={`rounded-lg px-3 py-2 text-sm ring-1 ${
                  s === humanSeat ? 'bg-emerald-500/10 ring-emerald-400/30' : 'bg-black/20 ring-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {s === banker && <span title="Banker">👑</span>}
                  <span className="font-semibold">{n}</span>
                </div>
                <div className="tabular-nums">{formatUSD(balances[s])}</div>
                <div className="text-xs opacity-60">
                  {s === banker ? 'banking' : `stake ${formatUSD(stakes[s])}`}
                </div>
              </div>
            ))}
          </div>

          {/* Opponents (face down while you play) */}
          <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ '--card-w': '2.6rem' } as CSSVars}>
            {hands.map((hand, s) =>
              s === humanSeat ? null : (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs opacity-70">
                    {s === banker && '👑 '}
                    {names[s]}
                  </span>
                  <div className="flex">
                    {hand.slice(0, 6).map((c, j) => (
                      <div key={c.id} style={{ marginLeft: j === 0 ? 0 : 'calc(var(--card-w) * -0.6)' }}>
                        <Card faceDown back={back} />
                      </div>
                    ))}
                  </div>
                </div>
              ),
            )}
          </div>

          {phase === 'betting' ? (
            <BettingGate
              banker={names[banker]}
              balance={wallet.balance}
              stake={humanStake}
              setStake={setHumanStake}
              onPlace={placeBet}
            />
          ) : (
            <>
              {humanIsBanker && (
                <div className="rounded-lg bg-amber-400/20 px-4 py-2 text-sm font-medium ring-1 ring-amber-400/40">
                  👑 You are the banker this game — you play every other player at their stake.
                </div>
              )}

              {!humanIsBanker && wallet.balance < MIN_CHIP && (
                <div className="rounded-lg bg-sky-400/20 px-4 py-2 text-sm font-medium ring-1 ring-sky-400/40">
                  💸 Out of money — you're auto-staked {formatUSD(COMEBACK_STAKE)}/pt this game to win some back.
                </div>
              )}

              {/* Status + score action */}
              <div className="flex flex-wrap items-center gap-3">
                <div className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${statusBar.tone}`}>
                  {statusBar.text}
                </div>
                <button
                  onClick={handleScore}
                  disabled={!status.complete || phase === 'scoring'}
                  className="rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {phase === 'scoring' ? 'Scoring…' : 'Score hand'}
                </button>
              </div>

              {/* Arrangement zones: front (weakest) → back (strongest) */}
              <div className="grid gap-3">
                <DropZone id="front" label="Front" cards={zones.front} capacity={3}
                  handName={status.ev.front?.name} status={status.foulMF ? 'foul' : null} />
                <DropZone id="middle" label="Middle" cards={zones.middle} capacity={5}
                  handName={status.ev.middle?.name} status={status.foulBM || status.foulMF ? 'foul' : null} />
                <DropZone id="back" label="Back" cards={zones.back} capacity={5}
                  handName={status.ev.back?.name} status={status.foulBM ? 'foul' : null} />
              </div>

              {/* Staging hand */}
              <HandZone cards={zones.hand} />
            </>
          )}
        </div>

        <DragOverlay>
          {activeCard ? (
            <Card rank={activeCard.rank} suit={activeCard.suit} className="rotate-3 shadow-xl" />
          ) : null}
        </DragOverlay>
      </DndContext>

      {phase === 'revealed' && result && (
        <ResultsPanel
          result={result}
          names={names}
          balances={balances}
          bankerSeat={banker}
          humanSeat={humanSeat}
          gameIndex={gameIndex}
          totalGames={TOTAL_GAMES}
          onNext={nextGame}
        />
      )}
    </div>
  )
}

interface BettingGateProps {
  banker: string
  balance: number
  stake: number
  setStake: (v: number) => void
  onPlace: () => void
}

function BettingGate({ banker, balance, stake, setStake, onPlace }: BettingGateProps) {
  return (
    <div className="mx-auto mt-2 w-full max-w-md rounded-2xl bg-black/25 p-5 ring-1 ring-white/10">
      <h2 className="text-lg font-semibold">Place your stake</h2>
      <p className="mt-1 text-sm opacity-70">
        👑 {banker} is the banker. Pick chips for your per-point stake — you win or lose that much
        for every point you beat or trail the banker by.
      </p>
      <div className="mt-4">
        <ChipTray balance={balance} value={stake} onChange={setStake} />
      </div>
      <button
        onClick={onPlace}
        disabled={stake < MIN_CHIP}
        className="mt-4 w-full rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {stake < MIN_CHIP ? 'Add at least one chip' : `Stake ${formatUSD(stake)}/pt → see cards`}
      </button>
    </div>
  )
}

function HandZone({ cards }: { cards: CardModel[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'hand' })
  return (
    <div
      ref={setNodeRef}
      className={`mt-auto rounded-xl border p-3 transition-colors ${
        isOver ? 'border-white/60 bg-white/10' : 'border-white/15 bg-black/15'
      }`}
    >
      <p className="mb-2 text-sm opacity-70">Your hand — drag cards into the rows above</p>
      <div className="flex min-h-[2rem] flex-wrap gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} zone="hand" />
        ))}
      </div>
    </div>
  )
}

interface HeaderProps {
  theme: ThemeKey
  setTheme: (t: ThemeKey) => void
  back: BackKey
  setBack: (b: BackKey) => void
  themeOptions: [ThemeKey, string][]
  backOptions: [BackKey, string][]
  balance: number
}

function Header({ theme, setTheme, back, setBack, themeOptions, backOptions, balance }: HeaderProps) {
  return (
    <header className="flex flex-wrap items-center gap-x-8 gap-y-4">
      <div className="mr-auto flex items-center gap-3">
        <Link
          to="/"
          className="rounded-lg bg-black/20 px-3 py-1.5 text-sm font-medium transition hover:bg-black/30"
          title="Back to games"
        >
          ← Games
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Pusoy Trese</h1>
      </div>
      <div className="rounded-lg bg-black/25 px-4 py-1.5 text-sm">
        <span className="opacity-60">Balance</span>{' '}
        <b className={`tabular-nums ${balance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
          {formatUSD(balance)}
        </b>
      </div>
      <Picker label="Theme" options={themeOptions} value={theme} onChange={setTheme} />
      <Picker label="Card back" options={backOptions} value={back} onChange={setBack} />
    </header>
  )
}

interface PickerProps<T extends string> {
  label: string
  options: [T, string][]
  value: T
  onChange: (value: T) => void
}

function Picker<T extends string>({ label, options, value, onChange }: PickerProps<T>) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm opacity-70">{label}</span>
      <div className="flex gap-1 rounded-lg bg-black/20 p-1">
        {options.map(([key, text]) => (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
              value === key ? 'bg-white/90 text-slate-900' : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
