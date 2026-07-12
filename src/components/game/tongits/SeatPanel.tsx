import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FaCrown, FaTrophy } from "react-icons/fa6";
import type { Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";
import { formatUSD, formatDelta } from "../../../wallet";
import CardSmall from "../../CardSmall";

// A single card that flips over to reveal itself at the end of a round: it
// turns edge-on (scaleX → 0), swaps back → face at the midpoint, then opens
// back out. Same treatment as the Pusoy Trese reveal.
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

// An AI opponent at the table's edge: an info panel (avatar, name, balance,
// card count, live deadwood, turn glow, winner/reveal badges) beside a
// vertical stack of their cards — face down in play, flipping over on reveal.
export default function SeatPanel({
	name,
	balance,
	hand,
	deadwood,
	isDealer,
	isTurn,
	isWinner = false,
	reveal = false,
	burned = false,
	fought = false,
	money = 0,
	back,
	dealKey,
	side = "left",
	avatar = "🤖",
}: {
	name: string;
	balance: number;
	hand: CardModel[];
	// null = hidden (online opponents keep their count secret until reveal).
	deadwood: number | null;
	isDealer: boolean;
	isTurn: boolean;
	isWinner?: boolean;
	reveal?: boolean;
	burned?: boolean;
	fought?: boolean;
	money?: number;
	back: BackKey;
	dealKey: number;
	side?: "left" | "right";
	avatar?: string;
}) {
	return (
		<div
			className={`flex items-start gap-2 ${
				side === "right" ? "flex-row-reverse" : ""
			}`}
		>
			{/* Info panel */}
			<motion.div
				animate={{
					boxShadow: isWinner
						? [
								"0 0 0 2px #facc15, 0 0 16px #facc1599",
								"0 0 0 2px #facc15, 0 0 30px #facc15cc",
								"0 0 0 2px #facc15, 0 0 16px #facc1599",
							]
						: isTurn
							? "0 0 0 2px rgba(255,255,255,0.65), 0 0 16px rgba(255,255,255,0.3)"
							: "0 0 0 1px rgba(255,255,255,0.15)",
				}}
				transition={
					isWinner
						? { duration: 1, repeat: Infinity }
						: { duration: 0.25 }
				}
				className="w-32 rounded-2xl bg-black/40 p-3 text-center backdrop-blur sm:w-36"
			>
				<div className="relative mx-auto h-12 w-12 sm:h-14 sm:w-14">
					<div className="grid h-full w-full place-items-center rounded-full border border-white/15 bg-black/40 text-2xl sm:text-3xl">
						{avatar}
					</div>
					{isDealer && (
						<span
							className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400"
							title="Dealer"
						>
							<FaCrown className="h-3 w-3 text-slate-900" />
						</span>
					)}
				</div>
				<div className="mt-1.5 flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
					<span>{name}</span>
					{isWinner && (
						<FaTrophy className="h-3.5 w-3.5 text-amber-400" />
					)}
				</div>
				<div className="text-xs tabular-nums opacity-80">
					{formatUSD(balance)}
				</div>
				<div className="mt-0.5 text-[11px] tabular-nums opacity-70">
					🂠 {hand.length} card{hand.length === 1 ? "" : "s"}
				</div>

				<div className="mt-2 border-t border-white/10 pt-1.5">
					<div className="text-[9px] font-bold uppercase tracking-widest opacity-60">
						Deadwood
					</div>
					<div className="text-xl font-black tabular-nums text-amber-300">
						{deadwood ?? "—"}
					</div>
				</div>

				{reveal && (
					<div className="mt-1 flex flex-wrap items-center justify-center gap-1">
						<span
							className={`text-xs font-bold tabular-nums ${
								money > 0
									? "text-emerald-300"
									: money < 0
										? "text-red-300"
										: "opacity-60"
							}`}
						>
							{formatDelta(money)}
						</span>
						{burned && !isWinner && (
							<span className="rounded bg-red-500/80 px-1 text-[9px] font-bold uppercase tracking-wide">
								Burned
							</span>
						)}
						{fought && !isWinner && (
							<span className="rounded bg-sky-400/80 px-1 text-[9px] font-bold uppercase tracking-wide text-slate-900">
								Fought
							</span>
						)}
					</div>
				)}

				{/* Thinking dots while the bot decides */}
				{isTurn && !reveal && (
					<div className="mt-1 flex items-center justify-center gap-0.5">
						{[0, 1, 2].map((i) => (
							<motion.span
								key={i}
								className="block h-1 w-1 rounded-full bg-white/60"
								animate={{
									opacity: [0.3, 1, 0.3],
									y: [0, -3, 0],
								}}
								transition={{
									duration: 0.7,
									delay: i * 0.15,
									repeat: Infinity,
								}}
							/>
						))}
					</div>
				)}
			</motion.div>

			{/* Vertical card stack (reference-style) */}
			<div
				className="flex flex-col items-center pt-1"
				style={{ "--card-w": "clamp(1.9rem, 3vw, 2.5rem)" } as CSSVars}
			>
				{hand.map((c, j) => {
					const rotate = (j % 2 ? 1 : -1) * 3;
					const marginTop =
						j === 0 ? 0 : "calc(var(--card-w) * -0.95)";
					if (reveal) {
						return (
							<div
								key={c.id}
								style={{ marginTop, rotate: `${rotate}deg` }}
							>
								<FlipCard
									card={c}
									back={back}
									delay={j * 0.06}
								/>
							</div>
						);
					}
					return (
						<motion.div
							key={`${dealKey}-${c.id}`}
							initial={{ opacity: 0, y: -22, scale: 0.6 }}
							animate={{ opacity: 1, y: 0, scale: 1, rotate }}
							transition={{
								delay: j * 0.045,
								type: "spring",
								stiffness: 260,
								damping: 20,
							}}
							style={{ marginTop }}
						>
							<CardSmall faceDown back={back} />
						</motion.div>
					);
				})}
			</div>
		</div>
	);
}
