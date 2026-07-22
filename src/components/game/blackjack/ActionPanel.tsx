import { motion } from "framer-motion";
import { LuPlus, LuHand, LuCopyPlus } from "react-icons/lu";
import { TbArrowBigDownLines } from "react-icons/tb";
import Card from "../../Card";
import { formatUSD } from "../../../wallet";
import type { Card as CardModel } from "../../../game/types";
import type { CSSVars } from "../../../styleVars";
import RulesMenu from "./RulesMenu";

interface ActionPanelProps {
	cards: CardModel[];
	total: number;
	soft: boolean;
	bet: number;
	// Label shown when the player is on a split hand, e.g. "Hand 1 of 2".
	handLabel?: string;
	canHit: boolean;
	canStand: boolean;
	canDouble: boolean;
	canSplit: boolean;
	onHit: () => void;
	onStand: () => void;
	onDouble: () => void;
	onSplit: () => void;
	themeClass?: string;
}

// Bottom-sheet action panel for the play phase — Blackjack's counterpart of the
// Lucky 9 draw sheet. Shows the active hand big and face-up with its running
// total, and offers hit / stand / double / split as the rules allow.
export default function ActionPanel({
	cards,
	total,
	soft,
	bet,
	handLabel,
	canHit,
	canStand,
	canDouble,
	canSplit,
	onHit,
	onStand,
	onDouble,
	onSplit,
	themeClass,
}: ActionPanelProps) {
	const bust = total > 21;
	const status = bust
		? {
				text: `Bust at ${total} — hand over.`,
				tone: "",
				style: {
					background:
						"color-mix(in srgb, var(--hud-negative) 85%, transparent)",
					color: "white",
				},
			}
		: total === 21
			? {
					text: `Twenty-one! Standing on ${total}.`,
					tone: "",
					style: {
						background:
							"color-mix(in srgb, var(--hud-accent) 90%, transparent)",
						color: "var(--hud-accent-ink)",
					},
				}
			: {
					text: `${soft ? "Soft " : ""}${total} — hit, stand${
						canDouble ? ", double" : ""
					}${canSplit ? ", or split" : ""}?`,
					tone: "bg-white/15",
					style: undefined,
				};

	return (
		<div
			className="flex w-full max-w-xl flex-col overflow-hidden rounded-(--hud-radius) border border-white/15 shadow-2xl backdrop-blur"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 92%, black)",
			}}
		>
			<div className="flex flex-col gap-2 border-b border-white/10 p-4">
				<div className="flex items-center justify-between">
					<span className="font-display text-lg font-semibold tracking-tight opacity-90 [.theme-neo_&]:text-sm [.theme-neo_&]:uppercase">
						{handLabel ?? "Your hand"}
						<span className="hud-label ml-2 text-xs font-normal opacity-60">
							bet {formatUSD(bet)}
						</span>
					</span>
					<div className="flex items-center gap-1.5">
						<span
							className="grid h-8 min-w-8 place-items-center rounded-full bg-white px-1.5 text-sm font-extrabold tabular-nums text-slate-800 shadow-md ring-1 ring-black/10"
							title="Hand total"
						>
							{total}
						</span>
						<RulesMenu themeClass={themeClass} />
					</div>
				</div>
				<div
					className={`rounded-(--hud-radius-sm) px-4 py-2.5 text-sm font-medium backdrop-blur ${status.tone}`}
					style={status.style}
				>
					{status.text}
				</div>
			</div>

			{/* Active hand, big and face-up */}
			<div
				className="flex flex-wrap justify-center gap-2 p-4"
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

			<div className="grid grid-cols-2 gap-2 border-t border-white/10 px-4 pt-3 pb-4 sm:gap-3">
				<button
					onClick={onStand}
					disabled={!canStand}
					className="hud-btn flex items-center justify-center gap-1.5 rounded-(--hud-radius-sm) bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
				>
					<LuHand className="h-4 w-4" />
					Stand
				</button>
				<button
					onClick={onHit}
					disabled={!canHit}
					className="hud-btn flex items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
					style={{
						background:
							"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
						color: "var(--hud-accent-ink)",
					}}
				>
					<LuPlus className="h-4 w-4" />
					Hit
				</button>
				{(canDouble || canSplit) && (
					<>
						<button
							onClick={onDouble}
							disabled={!canDouble}
							className="hud-btn flex items-center justify-center gap-1.5 rounded-(--hud-radius-sm) bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
						>
							<TbArrowBigDownLines className="h-4 w-4" />
							Double
						</button>
						<button
							onClick={onSplit}
							disabled={!canSplit}
							className="hud-btn flex items-center justify-center gap-1.5 rounded-(--hud-radius-sm) bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
						>
							<LuCopyPlus className="h-4 w-4" />
							Split
						</button>
					</>
				)}
			</div>
		</div>
	);
}
