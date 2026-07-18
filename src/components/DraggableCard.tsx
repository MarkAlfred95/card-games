import { useDraggable, useDroppable } from '@dnd-kit/core'
import type { Card as CardModel } from '../game/types'
import CardSmall from './CardSmall'

interface DraggableCardProps {
  card: CardModel
  zone: string
}

// A Card that can be picked up AND dropped onto. `zone` travels in both the drag
// and drop data so the handler knows the source zone (to move) and, when a card
// is dropped on top of another card, the target card's zone (to swap them).
export default function DraggableCard({ card, zone }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: card.id,
    data: { zone },
  })
  const { setNodeRef: setDropRef } = useDroppable({
    id: card.id,
    data: { type: 'card', zone },
  })

  const setNodeRef = (node: HTMLElement | null) => {
    setDragRef(node)
    setDropRef(node)
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none', opacity: isDragging ? 0.35 : 1 }}
      className="cursor-grab outline-none active:cursor-grabbing"
    >
      <CardSmall rank={card.rank} suit={card.suit} />
    </div>
  )
}
