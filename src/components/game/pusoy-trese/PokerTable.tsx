import { FaCrown } from "react-icons/fa6";
import { LuArrowRight } from "react-icons/lu";
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
	// Per-seat special-hand name (e.g. "Dragon"), when one decided the round.
	naturals?: (string | undefined)[];
	rowScores?: { front: number; middle: number; back: number }[];
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
	naturals,
	rowScores,
	isLast = false,
	onNext,
}: PokerTableProps) {
	// Opponents in seat order; placed top / left / right. Fans are allowed to
	// overlap the table rim (reference style) so the center stays clear.
	const opponents = names.map((_, s) => s).filter((s) => s !== humanSeat);
	const slots = [
		"top-[2%] left-1/2 -translate-x-1/2",
		"top-[30%] left-0 sm:left-[5%]",
		"top-[30%] right-0 sm:right-[5%]",
	];

	return (
		<div className="relative my-1 mx-auto w-full max-w-5xl flex-1 min-h-[56vh]">
			{/* Felt oval with a dark wooden rim. On small screens it bleeds
			    past the viewport edges (reference style) so the table reads
			    big; the page clips the horizontal overflow. */}
			<div
				className="absolute -inset-x-14 inset-y-0 sm:inset-x-0 rounded-[50%] border-[6px] border-black/40 shadow-[inset_0_0_70px_rgba(0,0,0,0.5)] ring-1 ring-white/10"
				style={{
					background:
						"radial-gradient(ellipse at 50% 38%, var(--table-felt), var(--table-felt-2))",
				}}
			/>

			{/* Center pot / round info — kept above the card fans so the
			    Next-game control stays visible when hands overlap the middle. */}
			<div className="absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
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
					<button
						onClick={onNext}
						style={{
							animation:
								"popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 1.1s both",
						}}
						className="mt-3 flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg transition hover:bg-amber-300"
					>
						{isLast ? "Final standings" : "Next game"}
						<LuArrowRight className="h-4 w-4" />
					</button>
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
						natural={naturals?.[s]}
						rowScore={rowScores?.[s]}
						chipSide={i === 2 ? "left" : "right"}
					/>
				</div>
			))}

			{/* Your seat at the bottom. During play it's lifted clear of the
			    bottom sheet; on reveal there's no sheet, so hug the rim to keep
			    the center free. */}
			<div
				className={`absolute left-1/2 -translate-x-1/2 ${
					reveal ? "bottom-[1%]" : "bottom-[9%]"
				}`}
			>
				<Seat
					name={names[humanSeat]}
					balance={balances[humanSeat]}
					stake={stakes[humanSeat]}
					isBanker={humanSeat === banker}
					isYou={true}
					hand={hands[humanSeat]}
					back={back}
					reveal={reveal}
					arrangement={arrangements?.[humanSeat]}
					money={moneyDeltas?.[humanSeat]}
					foul={foul?.[humanSeat]}
					natural={naturals?.[humanSeat]}
					rowScore={rowScores?.[humanSeat]}
				/>
			</div>
		</div>
	);
}
