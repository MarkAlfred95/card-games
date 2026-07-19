import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FaCrown } from "react-icons/fa6";
import type { Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";
import { formatUSD, formatDelta } from "../../../wallet";
import CardSmall from "../../CardSmall";

// A single card that flips over to reveal itself (same approach as the Pusoy
// Trese seat): it turns edge-on (scaleX → 0), swaps from its back to its face
// at the midpoint, then opens back out.
function FlipCard({
	card,
	back,
	delay,
}: {
	card: CardModel;
	back: BackKey;
	delay: number;
}) {
	const [up, setUp] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setUp(true), delay * 1000 + 200);
		return () => clearTimeout(t);
	}, [delay]);

	return (
		<motion.div
			style={{ width: "var(--card-w)" }}
			initial={{ scaleX: 1 }}
			animate={{ scaleX: [1, 0, 0, 1] }}
			transition={{
				delay,
				duration: 0.5,
				times: [0, 0.45, 0.55, 1],
				ease: "easeInOut",
			}}
		>
			{up ? (
				<CardSmall rank={card.rank} suit={card.suit} />
			) : (
				<CardSmall faceDown back={back} />
			)}
		</motion.div>
	);
}

// A small white chip showing the hand's total once revealed. Popped in via a
// CSS keyframe (not rAF) so it can't freeze in a throttled tab.
function ValueChip({
	value,
	natural,
	delay,
	side,
}: {
	value: number;
	natural: boolean;
	delay: number;
	side: "left" | "right";
}) {
	return (
		<span
			style={{
				animation: `popIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) ${delay}s both`,
			}}
			className={`absolute top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-white text-[11px] font-extrabold tabular-nums shadow-md ring-1 ${
				side === "left" ? "right-full mr-1" : "left-full ml-1"
			} ${
				natural
					? "text-amber-600 ring-amber-400"
					: "text-slate-700 ring-black/10"
			}`}
		>
			{value}
		</span>
	);
}

// One avatar/info plaque for a player around the table. During play it shows
// the seat's 2–3 card fan (face-up for the human, face-down for bots); on
// reveal the bots' cards flip over and every fan gets a total chip.
export default function Seat({
	name,
	balance,
	stake,
	isBanker,
	isYou,
	cards,
	back,
	faceUp = false,
	reveal = false,
	money = 0,
	value,
	// Name of the seat's natural (e.g. "Lucky 9"), shown as a gold badge.
	natural,
	chipSide = "right",
}: {
	name: string;
	balance: number;
	stake: number;
	isBanker: boolean;
	isYou: boolean;
	cards: CardModel[];
	back: BackKey;
	faceUp?: boolean;
	reveal?: boolean;
	money?: number;
	value?: number;
	natural?: string;
	chipSide?: "left" | "right";
}) {
	const n = cards.length;
	const showFaces = faceUp || reveal;

	return (
		<div className="flex flex-col items-center gap-1.5">
			<div
				className="relative flex justify-center"
				style={{ "--card-w": "clamp(2.3rem, 7vw, 3.2rem)" } as CSSVars}
			>
				{cards.map((c, j) => {
					const rotate = n === 1 ? 0 : ((j / (n - 1)) * 2 - 1) * 8;
					const marginLeft =
						j === 0 ? 0 : "calc(var(--card-w) * -0.35)";

					// Bots' cards flip over on reveal; the human's are already
					// face-up, so they just stay put.
					if (reveal && !faceUp) {
						return (
							<div
								key={c.id}
								style={{
									marginLeft,
									marginTop: j === 1 ? 0 : "3px",
									rotate: `${rotate}deg`,
									perspective: "800px",
								}}
							>
								<FlipCard
									card={c}
									back={back}
									delay={j * 0.12}
								/>
							</div>
						);
					}

					return (
						<motion.div
							key={c.id}
							initial={{ opacity: 0, y: -26, scale: 0.5, rotate: 0 }}
							animate={{ opacity: 1, y: 0, scale: 1, rotate }}
							transition={{
								delay: j * 0.06,
								type: "spring",
								stiffness: 260,
								damping: 20,
							}}
							style={{
								marginLeft,
								marginTop: j === 1 ? 0 : "3px",
							}}
						>
							{showFaces ? (
								<CardSmall
									rank={c.rank}
									suit={c.suit}
									style={{ width: "var(--card-w)" }}
								/>
							) : (
								<CardSmall faceDown back={back} />
							)}
						</motion.div>
					);
				})}
				{reveal && value !== undefined && (
					<ValueChip
						value={value}
						natural={Boolean(natural)}
						delay={faceUp ? 0.3 : 0.75}
						side={chipSide}
					/>
				)}
			</div>
			<div
				className={`min-w-24 rounded-(--hud-radius-sm) px-3 py-1.5 text-center backdrop-blur ${
					isYou ? "" : "bg-black/40 shadow-lg ring-1 ring-white/15"
				}`}
				style={
					isYou
						? {
								backgroundColor:
									"color-mix(in srgb, var(--seat-you) 25%, transparent)",
								boxShadow:
									"0 10px 15px -3px rgb(0 0 0 / 0.3), 0 0 0 1px color-mix(in srgb, var(--seat-you) 55%, transparent)",
							}
						: undefined
				}
			>
				<div className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
					{isBanker && (
						<FaCrown
							className="h-3.5 w-3.5"
							style={{ color: "var(--hud-accent)" }}
							title="Banker"
						/>
					)}
					<span>{isYou ? "You" : name}</span>
					{reveal && natural && (
						<span
							className="rounded px-1 text-[9px] font-bold uppercase tracking-wide"
							style={{
								background:
									"color-mix(in srgb, var(--hud-accent) 90%, transparent)",
								color: "var(--hud-accent-ink)",
							}}
						>
							{natural}
						</span>
					)}
				</div>
				<div className="tabular-nums text-xs opacity-90">
					{formatUSD(balance)}
				</div>
				{reveal ? (
					<div
						className={`text-[11px] font-bold tabular-nums ${money === 0 ? "opacity-60" : ""}`}
						style={
							money !== 0
								? {
										color: `color-mix(in srgb, ${
											money > 0
												? "var(--hud-positive)"
												: "var(--hud-negative)"
										} 65%, white)`,
									}
								: undefined
						}
					>
						{formatDelta(money)}
					</div>
				) : (
					<div className="hud-label text-[10px] opacity-60">
						{isBanker ? "banking" : `bet ${formatUSD(stake)}`}
					</div>
				)}
			</div>
		</div>
	);
}
