// Casino-chip bet builder. Click chips to stack up a stake (money per point);
// the stake can't exceed the available balance.
import { formatUSD } from '../wallet'

// Standard casino-style denominations and colors.
export const CHIPS = [
  { value: 5, face: '#b91c1c', edge: '#fca5a5' }, // red
  { value: 10, face: '#1d4ed8', edge: '#93c5fd' }, // blue
  { value: 50, face: '#15803d', edge: '#86efac' }, // green
  { value: 100, face: '#1f2937', edge: '#9ca3af' }, // black
  { value: 500, face: '#6d28d9', edge: '#c4b5fd' }, // purple
  { value: 1000, face: '#b45309', edge: '#fcd34d' }, // gold
] as const

interface ChipTrayProps {
  balance: number
  value: number
  onChange: (value: number) => void
  disabled?: boolean
  // Scales every chip denomination (spending division). Default 1 = base stakes.
  factor?: number
  // Optional ceiling on the stake (e.g. a per-point limit); defaults to balance.
  maxStake?: number
}

// Compact chip face, e.g. 5 -> "5", 1000 -> "1K", 100000 -> "100K", 5e6 -> "5M".
function chipFace(n: number): string {
  if (n >= 1_000_000) return `${Number((n / 1_000_000).toFixed(1))}M`
  if (n >= 1_000) return `${Number((n / 1_000).toFixed(1))}K`
  return String(n)
}

export default function ChipTray({
  balance,
  value,
  onChange,
  disabled,
  factor = 1,
  maxStake,
}: ChipTrayProps) {
  const limit = Math.min(balance, maxStake ?? balance)
  const add = (chip: number) => {
    if (disabled) return
    if (value + chip <= limit) onChange(value + chip)
  }

  return (
    <div className="rounded-xl bg-black/25 p-4">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide opacity-60">Your stake (per point)</p>
          <p className="text-2xl font-bold tabular-nums">{formatUSD(value)}</p>
        </div>
        <button
          onClick={() => onChange(0)}
          disabled={disabled || value === 0}
          className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        {CHIPS.map((chip) => {
          const chipValue = chip.value * factor
          const affordable = !disabled && value + chipValue <= limit
          return (
            <button
              key={chip.value}
              onClick={() => add(chipValue)}
              disabled={!affordable}
              title={affordable ? `Add ${formatUSD(chipValue)}` : 'Not enough balance'}
              className="grid h-14 w-14 place-items-center rounded-full text-xs font-bold text-white shadow-md transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: `radial-gradient(circle at 50% 35%, ${chip.face}, ${chip.face} 60%, #0008)`,
                border: `3px dashed ${chip.edge}`,
              }}
            >
              {chipFace(chipValue)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
