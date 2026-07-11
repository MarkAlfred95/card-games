import { motion } from "framer-motion";
import { LuPlus, LuHand } from "react-icons/lu";
import Card from "../../Card";
import type { Card as CardModel } from "../../../game/types";
import type { CSSVars } from "../../../styleVars";
import RulesMenu from "./RulesMenu";

interface DrawPanelProps {
	cards: CardModel[];
	total: number;
	// The hand's natural (8 or 9), if any — a natural must stand.
	natural: 8 | 9 | null;
	isBanker: boolean;
	// True once the player has chosen (or drawn) and the reveal is coming.
	decided: boolean;
	onHirit: () => void;
	onStand: () => void;
	themeClass?: string;
}

// Bottom-sheet action panel for the draw phase — Lucky 9's counterpart of the
// Pusoy Trese arrange sheet. Shows your cards big and face-up with the running
// total, and offers the one decision of the game: hirit or stand.
export default function DrawPanel({
	cards,
	total,
	natural,
	isBanker,
	decided,
	onHirit,
	onStand,
	themeClass,
}: DrawPanelProps) {
	const status = natural
		? {
				text:
					natural === 9
						? "Lucky 9! The best hand in the game — naturals stand."
						: "Natural 8 — two cards, hard to beat. Naturals stand.",
				tone: "bg-amber-400/90 text-slate-900",
			}
		: cards.length === 3
			? {
					text: `Final total: ${total} — revealing…`,
					tone: "bg-white/15",
				}
			: {
					text: `Your total is ${total}. Hirit for a third card, or stand?`,
					tone: "bg-white/15",
				};

	// A natural must stand — only the hirit button locks; Stand still reveals.
	const canStand = !decided && cards.length === 2;
	const canHirit = canStand && !natural;

	return (
		<div
			className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-white/15 shadow-2xl backdrop-blur"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 92%, black)",
			}}
		>
			<div className="flex flex-col gap-2 border-b border-white/10 p-4">
				<div className="flex items-center justify-between">
					<span className="font-display text-lg font-semibold tracking-tight opacity-90">
						Your hand
						{isBanker && (
							<span className="ml-2 rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/40">
								Banking
							</span>
						)}
					</span>
					<div className="flex items-center gap-1.5">
						<span
							className="grid h-8 w-8 place-items-center rounded-full bg-white text-sm font-extrabold tabular-nums text-slate-800 shadow-md ring-1 ring-black/10"
							title="Hand total"
						>
							{total}
						</span>
						<RulesMenu themeClass={themeClass} />
					</div>
				</div>
				<div
					className={`rounded-lg px-4 py-2.5 text-sm font-medium backdrop-blur ${status.tone}`}
				>
					{status.text}
				</div>
			</div>

			{/* Your cards, big and face-up */}
			<div
				className="flex justify-center gap-2 p-4"
				style={{ "--card-w": "clamp(3.4rem, 16vw, 4.8rem)" } as CSSVars}
			>
				{cards.map((c, j) => (
					<motion.div
						key={c.id}
						initial={{ opacity: 0, y: -20, scale: 0.6 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{
							delay: j * 0.08,
							type: "spring",
							stiffness: 260,
							damping: 20,
						}}
					>
						<Card rank={c.rank} suit={c.suit} className="shadow-lg" />
					</motion.div>
				))}
			</div>

			<div className="flex w-full gap-2 border-t border-white/10 px-4 pt-3 pb-4 sm:gap-3">
				<button
					onClick={onStand}
					disabled={!canStand}
					className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
				>
					<LuHand className="h-4 w-4" />
					Stand
				</button>
				<button
					onClick={onHirit}
					disabled={!canHirit}
					className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
				>
					<LuPlus className="h-4 w-4" />
					Hirit — draw a card
				</button>
			</div>
		</div>
	);
}
