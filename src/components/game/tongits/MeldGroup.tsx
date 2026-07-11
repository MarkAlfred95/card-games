import { motion } from "framer-motion";
import Card from "../../Card";
import type { Meld } from "../../../game/tongits";
import type { CSSVars } from "../../../styleVars";

// One exposed meld: an overlapping row of face-up cards. When `clickable`
// (human act phase with cards selected) it lights up as a sapaw target.
export default function MeldGroup({
	meld,
	cardWidth = "2rem",
	clickable = false,
	onClick,
}: {
	meld: Meld;
	cardWidth?: string;
	clickable?: boolean;
	onClick?: (meldId: number) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => clickable && onClick?.(meld.id)}
			disabled={!clickable}
			title={
				clickable
					? "Sapaw — add your selected cards to this meld"
					: `${meld.type === "set" ? "Set" : "Run"}`
			}
			className={`flex rounded-lg p-1 transition ${
				clickable
					? "cursor-pointer bg-white/10 ring-2 ring-[var(--card-selected)]/70 hover:-translate-y-0.5 hover:bg-white/20"
					: "bg-black/15 ring-1 ring-white/10"
			}`}
			style={{ "--card-w": cardWidth } as CSSVars}
		>
			{meld.cards.map((c, j) => (
				<motion.div
					key={c.id}
					layout
					initial={{ opacity: 0, y: -12, scale: 0.7 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					transition={{ type: "spring", stiffness: 320, damping: 24 }}
					style={{
						marginLeft: j === 0 ? 0 : "calc(var(--card-w) * -0.55)",
					}}
				>
					<Card rank={c.rank} suit={c.suit} />
				</motion.div>
			))}
		</button>
	);
}
