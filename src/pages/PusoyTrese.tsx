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
import { scoreRound } from '../game/scoring'
import { arrangeBot } from '../game/bot'
import type { Arrangement, Card as CardModel, RoundResult } from '../game/types'
import Card from '../components/Card'
import DraggableCard from '../components/DraggableCard'
import DropZone from '../components/DropZone'
import ResultsPanel from '../components/ResultsPanel'
import { THEMES, THEME_KEYS } from '../themes'
import type { ThemeKey } from '../themes'
import { BACKS, BACK_KEYS } from '../cardbacks'
import type { BackKey } from '../cardbacks'
import type { CSSVars } from '../styleVars'

interface Zones {
  hand: CardModel[]
  back: CardModel[]
  middle: CardModel[]
  front: CardModel[]
}
type ZoneId = keyof Zones

interface RoundState {
  zones: Zones
  bots: CardModel[][]
}

type Phase = 'arranging' | 'scoring' | 'revealed'
type ResultData = RoundResult & { arrangements: Arrangement[] }

const RANK_ORDER = Object.fromEntries(RANKS.map((r, i) => [r, i])) as Record<string, number>
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3 }
const CAPACITY: Record<ZoneId, number> = { hand: 13, back: 5, middle: 5, front: 3 }
const NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3']
const fmt = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function sortHand(cards: CardModel[]): CardModel[] {
  return [...cards].sort(
    (a, b) =>
      SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] ||
      RANK_ORDER[b.rank] - RANK_ORDER[a.rank],
  )
}

// Deal a fresh round to 4 players. Player 0 is you; the rest are bot hands kept
// face down until the round is scored.
function dealRound(): RoundState {
  const hands = deal(shuffle(buildDeck()), 4, 13)
  return {
    zones: { hand: sortHand(hands[0]), back: [], middle: [], front: [] },
    bots: [hands[1], hands[2], hands[3]],
  }
}

export default function PusoyTrese() {
  const [theme, setTheme] = useState<ThemeKey>('classic')
  const [back, setBack] = useState<BackKey>('lattice')
  const [round, setRound] = useState<RoundState>(dealRound)
  const [activeCard, setActiveCard] = useState<CardModel | null>(null)
  const [phase, setPhase] = useState<Phase>('arranging')
  const [result, setResult] = useState<ResultData | null>(null)
  const [scores, setScores] = useState<number[]>([0, 0, 0, 0])

  const { zones, bots } = round

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

  function handleScore() {
    setPhase('scoring')
    // Defer the heavy bot search so the "Scoring…" state paints first.
    setTimeout(() => {
      const human: Arrangement = {
        back: zones.back,
        middle: zones.middle,
        front: zones.front,
      }
      const arrangements = [human, ...bots.map((b) => arrangeBot(b))]
      const res = scoreRound(arrangements)
      setResult({ ...res, arrangements })
      setScores((prev) => prev.map((s, i) => s + res.totals[i]))
      setPhase('revealed')
    }, 20)
  }

  function nextHand() {
    setRound(dealRound())
    setResult(null)
    setPhase('arranging')
  }

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

  const themeOptions = THEME_KEYS.map((k) => [k, THEMES[k].label] as [ThemeKey, string])
  const backOptions = BACK_KEYS.map((k) => [k, BACKS[k].label] as [BackKey, string])

  return (
    <div
      className={`${THEMES[theme].className} min-h-screen text-[color:var(--ui-text)]`}
      style={{ '--card-w': '4.6rem' } as CSSVars}
    >
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div
          className="flex min-h-screen flex-col gap-4 p-6"
          style={{
            background:
              'radial-gradient(ellipse at 50% 0%, var(--table-felt), var(--table-felt-2))',
          }}
        >
          {/* Controls */}
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
            <Picker label="Theme" options={themeOptions} value={theme} onChange={setTheme} />
            <Picker label="Card back" options={backOptions} value={back} onChange={setBack} />
            <button
              onClick={nextHand}
              className="rounded-lg bg-white/15 px-4 py-2 text-sm font-medium backdrop-blur transition hover:bg-white/25"
            >
              Redeal
            </button>
          </header>

          {/* Scoreboard */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-lg bg-black/15 px-4 py-2 text-sm">
            {NAMES.map((n, i) => (
              <span key={n}>
                <span className="opacity-60">{n}:</span>{' '}
                <b className={scores[i] > 0 ? 'text-emerald-300' : scores[i] < 0 ? 'text-red-300' : ''}>
                  {fmt(scores[i])}
                </b>
              </span>
            ))}
          </div>

          {/* Opponents (face down while you arrange) */}
          <div className="flex flex-wrap gap-x-8 gap-y-3" style={{ '--card-w': '2.6rem' } as CSSVars}>
            {bots.map((hand, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs opacity-70">{NAMES[i + 1]}</span>
                <div className="flex">
                  {hand.slice(0, 6).map((c, j) => (
                    <div
                      key={c.id}
                      style={{ marginLeft: j === 0 ? 0 : 'calc(var(--card-w) * -0.6)' }}
                    >
                      <Card faceDown back={back} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Status + score action */}
          <div className="flex flex-wrap items-center gap-3">
            <div
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${statusBar.tone}`}
            >
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
            <DropZone
              id="front"
              label="Front"
              cards={zones.front}
              capacity={3}
              handName={status.ev.front?.name}
              status={status.foulMF ? 'foul' : null}
            />
            <DropZone
              id="middle"
              label="Middle"
              cards={zones.middle}
              capacity={5}
              handName={status.ev.middle?.name}
              status={status.foulBM || status.foulMF ? 'foul' : null}
            />
            <DropZone
              id="back"
              label="Back"
              cards={zones.back}
              capacity={5}
              handName={status.ev.back?.name}
              status={status.foulBM ? 'foul' : null}
            />
          </div>

          {/* Staging hand */}
          <HandZone cards={zones.hand} />
        </div>

        <DragOverlay>
          {activeCard ? (
            <Card rank={activeCard.rank} suit={activeCard.suit} className="rotate-3 shadow-xl" />
          ) : null}
        </DragOverlay>
      </DndContext>

      {phase === 'revealed' && result && (
        <ResultsPanel result={result} scores={scores} names={NAMES} onNext={nextHand} />
      )}
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
      <p className="mb-2 text-sm opacity-70">
        Your hand — drag cards into the rows above
      </p>
      <div className="flex min-h-[2rem] flex-wrap gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} zone="hand" />
        ))}
      </div>
    </div>
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
              value === key
                ? 'bg-white/90 text-slate-900'
                : 'text-white/80 hover:bg-white/10'
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}
