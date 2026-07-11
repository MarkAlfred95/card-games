import { motion, AnimatePresence } from "framer-motion";
import Card from "../../Card";
import type { Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";

const PILE_CARD_W = "clamp(3rem, 5.5vw, 4.4rem)";

// The face-down stock: labelled pile with the remaining count in a badge at
// its side. Pulses as a target while the human may draw from it.
export function StockPile({
	count,
	back,
	active = false,
	onClick,
}: {
	count: number;
	back: BackKey;
	active?: boolean;
	onClick?: () => void;
}) {
	const layers = Math.min(3, count);
	return (
		<div
			className="flex flex-col items-center gap-1.5"
			style={{ "--card-w": PILE_CARD_W } as CSSVars}
		>
			<span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
				Draw Pile
			</span>
			<button
				type="button"
				onClick={() => active && onClick?.()}
				disabled={!active}
				title={active ? "Draw a card" : "Draw pile"}
				className={`group outline-none ${active ? "cursor-pointer" : ""}`}
			>
				<div
					className={`relative rounded-[var(--radius-card)] transition ${
						active ? "group-hover:-translate-y-1" : ""
					}`}
					style={{
						width: "var(--card-w)",
						aspectRatio: "5/7",
						animation: active
							? "winnerPulse 1.6s ease-in-out infinite"
							: undefined,
					}}
				>
					{count === 0 ? (
						<div className="h-full w-full rounded-[var(--radius-card)] border-2 border-dashed border-white/25 bg-black/20" />
					) : (
						Array.from({ length: layers }, (_, i) => (
							<div
								key={i}
								className="absolute inset-0"
								style={{
									transform: `translate(${(layers - 1 - i) * 2}px, ${(layers - 1 - i) * -2}px)`,
								}}
							>
								<Card faceDown back={back} />
							</div>
						))
					)}
					{/* Remaining-count badge, reference-style at the pile's side */}
					<span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 rounded-lg bg-black/85 px-2 py-1 text-sm font-black tabular-nums ring-1 ring-white/20">
						{count}
					</span>
				</div>
			</button>
		</div>
	);
}

// The discard pile: the top card face up over a loose stack of the previous
// discards. Lights up as a target while the human may take it into a meld.
export function DiscardPile({
	cards,
	active = false,
	onClick,
}: {
	cards: CardModel[];
	active?: boolean;
	onClick?: () => void;
}) {
	const top = cards.length ? cards[cards.length - 1] : null;
	const under = cards.slice(-3, -1);
	return (
		<div
			className="flex flex-col items-center gap-1.5"
			style={{ "--card-w": PILE_CARD_W } as CSSVars}
		>
			<span className="text-[10px] font-bold uppercase tracking-widest opacity-70">
				Discard Pile
			</span>
			<button
				type="button"
				onClick={() => active && onClick?.()}
				disabled={!active}
				title={active ? "Take the discard into a meld" : "Discard pile"}
				className={`group outline-none ${active ? "cursor-pointer" : ""}`}
			>
				<div
					className={`relative rounded-[var(--radius-card)] transition ${
						active ? "group-hover:-translate-y-1" : ""
					}`}
					style={{
						width: "var(--card-w)",
						aspectRatio: "5/7",
						animation: active
							? "winnerPulse 1.6s ease-in-out infinite"
							: undefined,
					}}
				>
					{!top && (
						<div className="h-full w-full rounded-[var(--radius-card)] border-2 border-dashed border-white/25 bg-black/20" />
					)}
					{under.map((c, i) => (
						<div
							key={c.id}
							className="absolute inset-0"
							style={{
								transform: `rotate(${(i - 1) * 5}deg) translate(${(i - 1) * 3}px, 0)`,
								opacity: 0.85,
							}}
						>
							<Card rank={c.rank} suit={c.suit} />
						</div>
					))}
					<AnimatePresence>
						{top && (
							<motion.div
								key={top.id}
								className="absolute inset-0"
								initial={{
									opacity: 0,
									y: -18,
									rotate: -8,
									scale: 0.85,
								}}
								animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
								transition={{
									type: "spring",
									stiffness: 300,
									damping: 22,
								}}
							>
								<Card rank={top.rank} suit={top.suit} />
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</button>
		</div>
	);
}
