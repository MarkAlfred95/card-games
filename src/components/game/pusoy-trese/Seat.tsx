import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FaCrown } from "react-icons/fa6";
import Card from "../../Card";
import type { Arrangement, Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";
import { formatUSD, formatDelta } from "../../../wallet";

// A single card that flips over to reveal itself: it turns edge-on (scaleX → 0),
// swaps from its back to its face at the midpoint, then opens back out.
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
				<Card rank={card.rank} suit={card.suit} />
			) : (
				<Card faceDown back={back} />
			)}
		</motion.div>
	);
}

// A fanned row of cards. In play it deals face-down cards in on mount; in reveal
// mode it lays the real cards in place and flips each one over to show its face.
function FanRow({
	cards,
	maxRotation,
	marginTop,
	baseDelay,
	back,
	reveal = false,
	className = "",
}: {
	cards: CardModel[];
	maxRotation: number;
	marginTop: (j: number) => string | number;
	baseDelay: number;
	back: BackKey;
	reveal?: boolean;
	className?: string;
}) {
	const n = cards.length;
	return (
		<div
			className={`flex ${className}`}
			style={{ "--card-w": "3rem" } as CSSVars}
		>
			{cards.map((c, j) => {
				const rotate =
					n === 1 ? 0 : ((j / (n - 1)) * 2 - 1) * maxRotation;
				const transformOrigin = j < 2 ? "bottom right" : "bottom left";
				const marginLeft =
					j === 0 ? 0 : "calc(var(--card-w) * -0.60)";

				if (reveal) {
					return (
						<div
							key={c.id}
							className="origin-bottom-left"
							style={{
								marginLeft,
								transformOrigin,
								marginTop: marginTop(j),
								rotate: `${rotate}deg`,
								perspective: "800px",
							}}
						>
							<FlipCard
								card={c}
								back={back}
								delay={baseDelay + j * 0.07}
							/>
						</div>
					);
				}

				return (
					<motion.div
						key={c.id}
						className="origin-bottom-left"
						initial={{ opacity: 0, y: -26, scale: 0.5, rotate: 0 }}
						animate={{ opacity: 1, y: 0, scale: 1, rotate }}
						transition={{
							delay: baseDelay + j * 0.045,
							type: "spring",
							stiffness: 260,
							damping: 20,
						}}
						style={{ marginLeft, transformOrigin, marginTop: marginTop(j) }}
					>
						<Card faceDown back={back} />
					</motion.div>
				);
			})}
		</div>
	);
}

// One avatar/info plaque for a player around the table. During play it shows a
// small face-down fan; on reveal it flips over to show the real arrangement and
// the round outcome.
export default function Seat({
	name,
	balance,
	stake,
	isBanker,
	isYou,
	hand,
	back,
	reveal = false,
	arrangement,
	money = 0,
	foul = false,
}: {
	name: string;
	balance: number;
	stake: number;
	isBanker: boolean;
	isYou: boolean;
	hand?: CardModel[];
	back: BackKey;
	reveal?: boolean;
	arrangement?: Arrangement;
	money?: number;
	foul?: boolean;
}) {
	// In reveal mode use the real arrangement rows; otherwise a decorative fan.
	const front = reveal && arrangement ? arrangement.front : hand?.slice(0, 3);
	const middle = reveal && arrangement ? arrangement.middle : hand?.slice(0, 5);
	const backRow = reveal && arrangement ? arrangement.back : hand?.slice(0, 5);
	const showCards = Boolean(front && middle && backRow);

	return (
		<div className="flex flex-col items-center gap-1.5">
			{showCards && (
				<div className="flex flex-col items-center">
					<FanRow
						cards={front!}
						maxRotation={10}
						baseDelay={0}
						back={back}
						reveal={reveal}
						marginTop={(j) => (j === 0 || j === 2 ? "-2px" : 0)}
					/>
					<FanRow
						cards={middle!}
						maxRotation={20}
						baseDelay={reveal ? 0.25 : 0.14}
						back={back}
						reveal={reveal}
						className="-mt-7"
						marginTop={(j) =>
							j === 0 || j === 2 || j === 4 ? "2px" : 0
						}
					/>
					<FanRow
						cards={backRow!}
						maxRotation={20}
						baseDelay={reveal ? 0.5 : 0.36}
						back={back}
						reveal={reveal}
						className="-mt-7"
						marginTop={(j) =>
							j === 0 || j === 2 || j === 4 ? "2px" : 0
						}
					/>
				</div>
			)}
			<div
				className={`min-w-24 rounded-xl px-3 py-1.5 text-center shadow-lg ring-1 backdrop-blur ${
					isYou
						? "bg-emerald-500/25 ring-emerald-400/50"
						: "bg-black/40 ring-white/15"
				}`}
			>
				<div className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
					{isBanker && (
						<FaCrown
							className="h-3.5 w-3.5 text-amber-400"
							title="Banker"
						/>
					)}
					<span>{isYou ? "You" : name}</span>
					{reveal && foul && (
						<span className="rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase tracking-wide">
							Foul
						</span>
					)}
				</div>
				<div className="tabular-nums text-xs opacity-90">
					{formatUSD(balance)}
				</div>
				{reveal ? (
					<div
						className={`text-[11px] font-bold tabular-nums ${
							money > 0
								? "text-emerald-300"
								: money < 0
									? "text-red-300"
									: "opacity-60"
						}`}
					>
						{formatDelta(money)}
					</div>
				) : (
					<div className="text-[10px] opacity-60">
						{isBanker ? "banking" : `stake ${formatUSD(stake)}`}
					</div>
				)}
			</div>
		</div>
	);
}
