import { useDraggable } from '@dnd-kit/core'
import Card from './Card'
import type { Card as CardModel } from '../game/types'

interface DraggableCardProps {
  card: CardModel
  zone: string
}

// A Card that can be picked up. `zone` travels in the drag data so the drop
// handler knows where the card came from.
export default function DraggableCard({ card, zone }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { zone },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none', opacity: isDragging ? 0.35 : 1 }}
      className="cursor-grab outline-none active:cursor-grabbing"
    >
      <Card rank={card.rank} suit={card.suit} />
    </div>
  )
}
