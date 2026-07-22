import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LuArrowRight } from "react-icons/lu";
import { RiVipDiamondFill } from "react-icons/ri";
import type { Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";
import { handTotal, type HandResult, type HandOutcome } from "../../../game/blackjack";
import { formatUSD, formatDelta } from "../../../wallet";
import CardSmall from "../../CardSmall";

// A single card that flips over to reveal itself (same approach as the Lucky 9
// seat): it turns edge-on (scaleX → 0), swaps back→face at the midpoint, then
// opens back out. Used for the dealer's hole card at showdown.
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

// A fanned hand of cards. Face-down cards use the chosen back. For the dealer,
// `showFirst` keeps the up-card visible while the rest stay down, and
// `revealHole` flips the second card (the hole) over at showdown.
function HandFan({
	cards,
	back,
	faceUp,
	showFirst = false,
	revealHole = false,
}: {
	cards: CardModel[];
	back: BackKey;
	// Whether the fan's cards show their faces at all.
	faceUp: boolean;
	// Dealer-only: keep the first card (the up-card) face up even when the rest
	// are still down.
	showFirst?: boolean;
	// Dealer-only: flip the second card (the hole) face up at showdown.
	revealHole?: boolean;
}) {
	const n = cards.length;
	return (
		<div
			className="relative flex justify-center"
			style={{ "--card-w": "clamp(2.3rem, 7vw, 3.2rem)" } as CSSVars}
		>
			{cards.map((c, j) => {
				const rotate = n === 1 ? 0 : ((j / (n - 1)) * 2 - 1) * 8;
				const marginLeft = j === 0 ? 0 : "calc(var(--card-w) * -0.35)";
				const style = {
					marginLeft,
					marginTop: j === 1 ? 0 : "3px",
					rotate: `${rotate}deg`,
				};

				// The dealer's hole card flips from back to face at showdown.
				if (revealHole && j === 1) {
					return (
						<div key={c.id} style={{ ...style, perspective: "800px" }}>
							<FlipCard card={c} back={back} delay={0.1} />
						</div>
					);
				}

				const isFaceUp = faceUp || (showFirst && j === 0);
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
						style={{ marginLeft, marginTop: j === 1 ? 0 : "3px" }}
					>
						{isFaceUp ? (
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
		</div>
	);
}

const OUTCOME_LABEL: Record<HandOutcome, string> = {
	blackjack: "Blackjack",
	win: "Win",
	push: "Push",
	loss: "Loss",
	bust: "Bust",
};

export interface PlayerHandView {
	cards: CardModel[];
	bet: number;
	fromSplit: boolean;
	result?: HandResult;
}

interface BlackjackTableProps {
	dealer: CardModel[];
	playerHands: PlayerHandView[];
	activeHand: number;
	back: BackKey;
	handIndex: number;
	totalHands: number;
	balance: number;
	// Reveal mode (after the hand settles): flip the dealer's hole card, show
	// totals and per-hand results.
	reveal?: boolean;
	// Whether the player's cards show faces (hidden while betting).
	playerFaceUp?: boolean;
	// Highlight the hand currently being played.
	playing?: boolean;
	insuranceBet?: number;
	isLast?: boolean;
	onNext?: () => void;
}

// Same oval felt as the other games, arranged heads-up: the dealer sits at the
// top and the player's hand (or two, after a split) at the bottom, while the
// betting / action panels float over the bottom edge.
export default function BlackjackTable({
	dealer,
	playerHands,
	activeHand,
	back,
	handIndex,
	totalHands,
	balance,
	reveal = false,
	playerFaceUp = true,
	playing = false,
	insuranceBet = 0,
	isLast = false,
	onNext,
}: BlackjackTableProps) {
	const dealerTotal = handTotal(dealer).total;
	const split = playerHands.length > 1;

	return (
		<div className="relative my-1 mx-auto w-full max-w-5xl flex-1 min-h-[56vh]">
			{/* Felt oval with a dark wooden rim. */}
			<div
				className="game-table absolute -inset-x-14 inset-y-0 sm:inset-x-0 rounded-[50%] border-[6px] border-black/40 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
				style={{
					background:
						"radial-gradient(ellipse at 50% 38%, var(--table-felt), var(--table-felt-2))",
				}}
			/>

			{/* Dealer at the top */}
			<div className="absolute left-1/2 top-[5%] -translate-x-1/2 flex flex-col items-center gap-1.5">
				<HandFan
					cards={dealer}
					back={back}
					faceUp={reveal}
					showFirst
					revealHole={reveal}
				/>
				<div className="min-w-24 rounded-(--hud-radius-sm) bg-black/40 px-3 py-1.5 text-center shadow-lg ring-1 ring-white/15 backdrop-blur">
					<div className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
						<RiVipDiamondFill
							className="h-3.5 w-3.5"
							style={{ color: "var(--hud-accent)" }}
						/>
						<span>Dealer</span>
					</div>
					<div className="hud-label text-[10px] opacity-60">
						{reveal ? `total ${dealerTotal}` : "stands on 17"}
					</div>
				</div>
			</div>

			{/* Center round info */}
			<div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
				<div className="text-3xl font-bold tabular-nums opacity-90 [.theme-neo_&]:font-display [.theme-neo_&]:text-2xl">
					{handIndex + 1}
					<span className="opacity-50"> / {totalHands}</span>
				</div>
				<div className="hud-label mt-1 text-xs opacity-70">Hand</div>
				{reveal && insuranceBet > 0 && (
					<div className="hud-label mt-1 text-[11px] opacity-70">
						insurance {formatUSD(insuranceBet)}
					</div>
				)}
				{reveal && onNext && (
					<button
						onClick={onNext}
						style={{
							animation:
								"popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both",
							background:
								"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
							color: "var(--hud-accent-ink)",
						}}
						className="hud-btn mt-3 flex items-center gap-1.5 rounded-(--hud-radius-sm) px-4 py-2 text-sm font-bold shadow-lg transition hover:brightness-110"
					>
						{isLast ? "Final standings" : "Next hand"}
						<LuArrowRight className="h-4 w-4" />
					</button>
				)}
			</div>

			{/* Player hand(s) at the bottom */}
			<div
				className={`absolute left-1/2 -translate-x-1/2 flex items-end justify-center gap-4 sm:gap-6 ${
					reveal ? "bottom-[2%]" : "bottom-[9%]"
				}`}
			>
				{playerHands.map((h, i) => {
					const total = handTotal(h.cards).total;
					const showFaces = playerFaceUp || reveal;
					const isActive = playing && i === activeHand;
					const delta = h.result?.delta ?? 0;
					return (
						<div
							key={i}
							className={`flex flex-col items-center gap-1.5 rounded-(--hud-radius-sm) p-1.5 transition ${
								isActive
									? "ring-2 ring-[color:var(--hud-accent)]"
									: ""
							}`}
						>
							<div className="relative">
								<HandFan
									cards={h.cards}
									back={back}
									faceUp={showFaces}
								/>
								{showFaces && (
									<span
										className={`absolute top-1/2 left-full ml-1 grid h-6 min-w-6 -translate-y-1/2 place-items-center rounded-full bg-white px-1 text-[11px] font-extrabold tabular-nums shadow-md ring-1 ${
											total > 21
												? "text-red-600 ring-red-400"
												: "text-slate-700 ring-black/10"
										}`}
									>
										{total}
									</span>
								)}
							</div>
							<div
								className="min-w-24 rounded-(--hud-radius-sm) px-3 py-1.5 text-center backdrop-blur"
								style={{
									backgroundColor:
										"color-mix(in srgb, var(--seat-you) 25%, transparent)",
									boxShadow:
										"0 10px 15px -3px rgb(0 0 0 / 0.3), 0 0 0 1px color-mix(in srgb, var(--seat-you) 55%, transparent)",
								}}
							>
								<div className="flex items-center justify-center gap-1 text-sm font-semibold leading-tight">
									<span>
										{split ? `Hand ${i + 1}` : "You"}
									</span>
									{reveal && h.result && (
										<span
											className="rounded px-1 text-[9px] font-bold uppercase tracking-wide"
											style={{
												background:
													"color-mix(in srgb, var(--hud-accent) 90%, transparent)",
												color: "var(--hud-accent-ink)",
											}}
										>
											{OUTCOME_LABEL[h.result.outcome]}
										</span>
									)}
								</div>
								{reveal ? (
									<div
										className={`text-[11px] font-bold tabular-nums ${delta === 0 ? "opacity-60" : ""}`}
										style={
											delta !== 0
												? {
														color: `color-mix(in srgb, ${
															delta > 0
																? "var(--hud-positive)"
																: "var(--hud-negative)"
														} 65%, white)`,
													}
												: undefined
										}
									>
										{formatDelta(delta)}
									</div>
								) : (
									<div className="hud-label text-[10px] opacity-60">
										bet {formatUSD(h.bet)}
									</div>
								)}
							</div>
						</div>
					);
				})}
			</div>

			{/* Your balance, tucked in a bottom corner */}
			<div className="absolute bottom-[2%] right-[3%] hidden text-right sm:block">
				<div className="hud-label text-[10px] opacity-50">Balance</div>
				<div className="text-xs font-bold tabular-nums opacity-80">
					{formatUSD(balance)}
				</div>
			</div>
		</div>
	);
}
