import { motion } from "framer-motion";
import type { Card as CardModel } from "../../../game/types";
import type { CSSVars } from "../../../styleVars";
import CardSmall from "../../CardSmall";

// The human hand: a big, nearly-flat overlapping row (reference layout).
// Click to select (multi-select), double-click to play the current selection
// as a meld. Selected cards lift + ring via the shared Card component; layout
// animation keeps re-sorting smooth.
export default function HandFan({
	cards,
	selected,
	onToggle,
	onPlayMeld,
	dealKey,
}: {
	cards: CardModel[];
	selected: Set<string>;
	onToggle: (id: string) => void;
	// Fired on double-click; the page plays the current selection as a meld.
	onPlayMeld?: () => void;
	dealKey: number;
}) {
	return (
		<div
			className="flex justify-center px-2 pb-1 pt-3"
			style={{ "--card-w": "clamp(2.4rem, 6.5vw, 4.5rem)" } as CSSVars}
		>
			{cards.map((c, j) => (
				<motion.div
					key={`${dealKey}-${c.id}`}
					layout
					initial={{ opacity: 0, y: -40, scale: 0.6 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{
						delay: 0.02 * j,
						type: "spring",
						stiffness: 260,
						damping: 22,
					}}
					style={{
						marginLeft:
							j === 0 ? 0 : "calc(var(--card-w) * -0.35)",
						zIndex: j,
					}}
					className="transition-transform hover:-translate-y-2"
				>
					<CardSmall
						rank={c.rank}
						suit={c.suit}
						selected={selected.has(c.id)}
						onClick={() => onToggle(c.id)}
						onDoubleClick={() => onPlayMeld?.()}
						className="cursor-pointer shadow-md"
					/>
				</motion.div>
			))}
		</div>
	);
}
