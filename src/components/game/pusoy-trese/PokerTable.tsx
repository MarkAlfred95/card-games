import { FaCrown } from "react-icons/fa6";
import { LuArrowRight } from "react-icons/lu";
import { motion } from "framer-motion";
import type { Arrangement, Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import Seat from "./Seat";

interface PokerTableProps {
	names: string[];
	balances: number[];
	stakes: number[];
	banker: number;
	humanSeat: number;
	hands: CardModel[][];
	back: BackKey;
	gameIndex: number;
	totalGames: number;
	// Reveal mode (after a round is scored): flip each seat's real arrangement.
	reveal?: boolean;
	arrangements?: Arrangement[];
	moneyDeltas?: number[];
	foul?: boolean[];
	isLast?: boolean;
	onNext?: () => void;
}

export default function PokerTable({
	names,
	balances,
	stakes,
	banker,
	humanSeat,
	hands,
	back,
	gameIndex,
	totalGames,
	reveal = false,
	arrangements,
	moneyDeltas,
	foul,
	isLast = false,
	onNext,
}: PokerTableProps) {
	// Opponents in seat order; placed top / left / right around the rim.
	const opponents = names.map((_, s) => s).filter((s) => s !== humanSeat);
	const slots = [
		"top-[5%] left-1/2 -translate-x-1/2",
		"top-[32%] left-[5%]",
		"top-[32%] right-[5%]",
	];

	return (
		<div className="relative my-1 mx-auto w-full max-w-5xl flex-1 min-h-[56vh]">
			{/* Felt oval with a dark wooden rim */}
			<div
				className="absolute inset-0 rounded-[50%] border-[6px] border-black/40 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
				style={{
					background:
						"radial-gradient(ellipse at 50% 38%, var(--table-felt), var(--table-felt-2))",
				}}
			/>

			{/* Center pot / round info */}
			<div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
				<div className="text-3xl font-bold tabular-nums opacity-90">
					{gameIndex + 1}
					<span className="opacity-50"> / {totalGames}</span>
				</div>
				<div className="mt-1 flex items-center justify-center gap-1.5 text-xs opacity-70">
					<FaCrown className="h-3 w-3 text-amber-400" />
					Banker:{" "}
					<b>{banker === humanSeat ? "You" : names[banker]}</b>
				</div>
				{reveal && onNext && (
					<motion.button
						onClick={onNext}
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={{
							delay: 1.1,
							type: "spring",
							stiffness: 320,
							damping: 20,
						}}
						className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300"
					>
						{isLast ? "Final standings" : "Next game"}
						<LuArrowRight className="h-4 w-4" />
					</motion.button>
				)}
			</div>

			{/* Opponent seats around the rim */}
			{opponents.map((s, i) => (
				<div key={s} className={`absolute ${slots[i]}`}>
					<Seat
						name={names[s]}
						balance={balances[s]}
						stake={stakes[s]}
						isBanker={s === banker}
						isYou={false}
						hand={hands[s]}
						back={back}
						reveal={reveal}
						arrangement={arrangements?.[s]}
						money={moneyDeltas?.[s]}
						foul={foul?.[s]}
					/>
				</div>
			))}

			{/* Your seat at the bottom (lifted clear of the bottom panel) */}
			<div className="absolute bottom-[9%] left-1/2 -translate-x-1/2">
				<Seat
					name={names[humanSeat]}
					balance={balances[humanSeat]}
					stake={stakes[humanSeat]}
					isBanker={humanSeat === banker}
					isYou={true}
					back={back}
					reveal={reveal}
					arrangement={arrangements?.[humanSeat]}
					money={moneyDeltas?.[humanSeat]}
					foul={foul?.[humanSeat]}
				/>
			</div>
		</div>
	);
}
