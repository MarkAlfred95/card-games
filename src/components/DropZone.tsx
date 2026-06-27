import { useDroppable } from '@dnd-kit/core'
import DraggableCard from './DraggableCard'
import type { Card } from '../game/types'

interface DropZoneProps {
  id: string
  label: string
  cards: Card[]
  capacity: number
  handName?: string
  status?: 'foul' | null
}

// One arrangement row (back / middle / front). Renders its cards followed by
// dashed empty slots up to `capacity`, highlights while a card hovers over it,
// and shows the evaluated hand name + a foul warning via `status`.
export default function DropZone({
  id,
  label,
  cards,
  capacity,
  handName,
  status,
}: DropZoneProps) {
  const { setNodeRef, isOver } = useDroppable({ id })
  const full = cards.length >= capacity
  const empties = Math.max(0, capacity - cards.length)
  const canDrop = isOver && !full

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        canDrop ? 'border-white/60 bg-white/10' : 'border-white/15 bg-black/10'
      } ${status === 'foul' ? 'ring-2 ring-red-400/80' : ''}`}
    >
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold">
          {label}{' '}
          <span className="font-normal opacity-60">
            ({cards.length}/{capacity})
          </span>
        </span>
        {handName && (
          <span
            className={`text-xs font-medium ${
              status === 'foul' ? 'text-red-300' : 'opacity-80'
            }`}
          >
            {handName}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {cards.map((card) => (
          <DraggableCard key={card.id} card={card} zone={id} />
        ))}
        {Array.from({ length: empties }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="aspect-[5/7] rounded-[var(--radius-card)] border-2 border-dashed border-white/25 bg-[var(--zone-empty)]"
            style={{ width: 'var(--card-w)' }}
          />
        ))}
      </div>
    </div>
  )
}
