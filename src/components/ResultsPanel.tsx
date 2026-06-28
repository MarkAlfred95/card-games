import Card from './Card'
import type { CSSVars } from '../styleVars'
import type {
  Arrangement,
  BankerRoundResult,
  Card as CardModel,
  EvaluatedArrangement,
} from '../game/types'
import { formatUSD, formatDelta } from '../wallet'

interface ResultData extends BankerRoundResult {
  arrangements: Arrangement[]
}

interface ResultsPanelProps {
  result: ResultData
  names: string[]
  balances: number[] // per seat, after this round was applied
  bankerSeat: number
  humanSeat: number
  gameIndex: number
  totalGames: number
  onNext: () => void
}

// Full-screen reveal after a banker round is scored.
export default function ResultsPanel({
  result,
  names,
  balances,
  bankerSeat,
  humanSeat,
  gameIndex,
  totalGames,
  onNext,
}: ResultsPanelProps) {
  const { arrangements, evals, foul, moneyDeltas, stakes } = result
  const isLast = gameIndex + 1 >= totalGames

  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="mx-auto max-w-6xl rounded-2xl p-5 ring-1 ring-white/15"
        style={{ background: 'var(--table-felt-2)', '--card-w': '2.3rem' } as CSSVars}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">
              Game {gameIndex + 1} of {totalGames} — results
            </h2>
            <p className="text-sm opacity-70">👑 {names[bankerSeat]} banked this game.</p>
          </div>
          <button
            onClick={onNext}
            className="rounded-lg bg-white/90 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white"
          >
            {isLast ? 'Final standings →' : 'Next game →'}
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {names.map((name, p) => (
            <PlayerResult
              key={p}
              name={name}
              arrangement={arrangements[p]}
              ev={evals[p]}
              foul={foul[p]}
              money={moneyDeltas[p]}
              stake={stakes[p]}
              balance={balances[p]}
              isBanker={p === bankerSeat}
              isYou={p === humanSeat}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

interface PlayerResultProps {
  name: string
  arrangement: Arrangement
  ev: EvaluatedArrangement
  foul: boolean
  money: number
  stake: number
  balance: number
  isBanker: boolean
  isYou: boolean
}

function PlayerResult({
  name,
  arrangement,
  ev,
  foul,
  money,
  stake,
  balance,
  isBanker,
  isYou,
}: PlayerResultProps) {
  return (
    <div
      className={`rounded-xl p-3 ${
        isYou ? 'bg-emerald-500/15 ring-1 ring-emerald-400/50' : 'bg-black/20'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          {isBanker && <span title="Banker">👑</span>}
          {name}
          {foul && (
            <span className="rounded bg-red-500/80 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              Foul
            </span>
          )}
        </span>
        <span
          className={`text-sm font-bold tabular-nums ${
            money > 0 ? 'text-emerald-300' : money < 0 ? 'text-red-300' : 'opacity-70'
          }`}
        >
          {formatDelta(money)}
        </span>
      </div>

      <div className="space-y-1.5">
        <Row label="Back" cards={arrangement.back} handName={ev.back.name} />
        <Row label="Middle" cards={arrangement.middle} handName={ev.middle.name} />
        <Row label="Front" cards={arrangement.front} handName={ev.front.name} />
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-xs opacity-70">
        <span>{isBanker ? 'Banking' : `Stake ${formatUSD(stake)}/pt`}</span>
        <span>Balance {formatUSD(balance)}</span>
      </div>
    </div>
  )
}

interface RowProps {
  label: string
  cards: CardModel[]
  handName: string
}

function Row({ label, cards, handName }: RowProps) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="opacity-60">{label}</span>
        <span className="opacity-80">{handName}</span>
      </div>
      <div className="mt-0.5 flex gap-0.5">
        {cards.map((c) => (
          <Card key={c.id} rank={c.rank} suit={c.suit} />
        ))}
      </div>
    </div>
  )
}
