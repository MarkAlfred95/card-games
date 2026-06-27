import type { HTMLAttributes } from 'react'
import type { Rank, Suit } from '../game/types'
import type { BackKey } from '../cardbacks'
import CardBack from './CardBack'

const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RED: Set<Suit> = new Set(['H', 'D'])

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  rank?: Rank
  suit?: Suit
  faceDown?: boolean
  back?: BackKey
  selected?: boolean
}

// A single playing card, drawn entirely in CSS so it themes via variables and
// scales with --card-w. Font sizes use cqw (container query width). Pass
// `faceDown` to show the back instead.
export default function Card({
  rank,
  suit,
  faceDown = false,
  back = 'lattice',
  selected = false,
  className = '',
  style,
  ...props
}: CardProps) {
  if (faceDown) {
    return <CardBack design={back} className={className} style={style} />
  }

  const symbol = suit ? SUIT_SYMBOL[suit] : ''
  const color = suit && RED.has(suit) ? 'var(--suit-red)' : 'var(--suit-black)'

  return (
    <div
      className={`@container relative aspect-[5/7] select-none rounded-[var(--radius-card)] border border-[var(--card-border)] bg-[var(--card-face)] shadow-sm transition-transform ${
        selected ? '-translate-y-2 ring-2 ring-[var(--card-selected)]' : ''
      } ${className}`}
      style={{ width: 'var(--card-w)', color, ...style }}
      {...props}
    >
      <div className="absolute left-[8%] top-[5%] flex flex-col items-center leading-none">
        <span className="text-[17cqw] font-semibold">{rank}</span>
        <span className="text-[15cqw]">{symbol}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[44cqw] leading-none">{symbol}</span>
      </div>

      <div className="absolute bottom-[5%] right-[8%] flex rotate-180 flex-col items-center leading-none">
        <span className="text-[17cqw] font-semibold">{rank}</span>
        <span className="text-[15cqw]">{symbol}</span>
      </div>
    </div>
  )
}
