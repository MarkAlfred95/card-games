import { useDroppable } from "@dnd-kit/core";
import DraggableCard from "../../DraggableCard";
import type { Card as CardModel } from "../../../game/types";

// The staging / holding area at the bottom of the arrange sheet.
export default function HandZone({ cards }: { cards: CardModel[] }) {
	const { setNodeRef, isOver } = useDroppable({ id: "hand" });
	return (
		<div
			ref={setNodeRef}
			className={`mt-auto rounded-xl border p-3 transition-colors ${
				isOver
					? "border-white/60 bg-white/10"
					: "border-white/15 bg-black/15"
			}`}
		>
			<p className="mb-2 text-sm opacity-70">
				Holding area — drag a card here to set it aside, or swap cards
				by dropping one onto another
			</p>
			<div className="flex min-h-[2rem] flex-wrap gap-2">
				{cards.map((card) => (
					<DraggableCard key={card.id} card={card} zone="hand" />
				))}
			</div>
		</div>
	);
}
