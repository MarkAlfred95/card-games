import type { CSSProperties } from 'react'
import { BACKS } from '../cardbacks'
import type { BackKey } from '../cardbacks'

interface CardBackProps {
  design?: BackKey
  className?: string
  style?: CSSProperties
}

// A face-down card. Colors come from the active theme via
// --card-back-bg / --card-back-ink.
export default function CardBack({ design = 'lattice', className = '', style }: CardBackProps) {
  const Design = BACKS[design].Component
  return (
    <div
      className={`relative aspect-[5/7] overflow-hidden rounded-[var(--radius-card)] border-2 border-[var(--card-border)] bg-[var(--card-back-bg)] ${className}`}
      style={{ width: 'var(--card-w)', ...style }}
    >
      <div className="absolute inset-[7%]">
        <Design color="var(--card-back-ink)" />
      </div>
    </div>
  )
}
