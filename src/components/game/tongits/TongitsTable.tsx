import { FaCrown } from "react-icons/fa6";
import SeatPanel from "./SeatPanel";
import MeldGroup from "./MeldGroup";
import { StockPile, DiscardPile } from "./Piles";
import { handPoints, topDiscard } from "../../../game/tongits";
import type { TongitsState } from "../../../game/tongits";
import type { Suit } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { SortMode } from "./constants";

const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const RED_SUITS = new Set<Suit>(["H", "D"]);

// The table's upper board, laid out reference-style: draw + discard piles up
// top, a central bordered MELD AREA with per-player groups, the two bots on
// side rails (panel + vertical card stack), a sort rail bottom-left and a
// turn/status panel on the right. On small screens the rails collapse into a
// row above the meld area and the side panels hide (their info lives in the
// piles, avatars, and the action-bar hint instead).
export default function TongitsTable({
	state,
	names,
	balances,
	back,
	round,
	totalRounds,
	dealKey,
	reveal = false,
	// Ids of exposed melds the human's current selection can legally extend.
	sapawTargets,
	onMeldClick,
	canDrawStock = false,
	canTakeDiscard = false,
	onDrawStock,
	onTakeDiscard,
	sortMode,
	onSortChange,
}: {
	state: TongitsState;
	names: string[];
	balances: number[];
	back: BackKey;
	round: number;
	totalRounds: number;
	dealKey: number;
	reveal?: boolean;
	sapawTargets?: Set<number>;
	onMeldClick?: (meldId: number) => void;
	canDrawStock?: boolean;
	canTakeDiscard?: boolean;
	onDrawStock?: () => void;
	onTakeDiscard?: () => void;
	sortMode: SortMode;
	onSortChange: (mode: SortMode) => void;
}) {
	const res = state.result;

	const seatProps = (s: number) => ({
		name: names[s],
		balance: balances[s],
		hand: state.players[s].hand,
		deadwood: reveal
			? (res?.points[s] ?? 0)
			: handPoints(state.players[s].hand),
		isDealer: state.dealer === s,
		isTurn: !res && state.turn === s,
		isWinner: reveal && res?.winner === s,
		reveal,
		burned: reveal ? res?.burned[s] : false,
		fought:
			reveal && (res?.fought?.[s] ?? false) && res?.caller !== s,
		money: res?.moneyDeltas[s] ?? 0,
		back,
		dealKey,
	});

	return (
		<div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(11rem,auto)_minmax(0,1fr)_minmax(13rem,auto)] lg:items-start lg:gap-5">
			{/* Center column: piles + meld area (first on mobile too) */}
			<div className="flex min-w-0 flex-col items-center lg:col-start-2 lg:row-start-1">
				<div className="flex items-start justify-center gap-8 sm:gap-12">
					<StockPile
						count={state.stock.length}
						back={back}
						active={canDrawStock}
						onClick={onDrawStock}
					/>
					<DiscardPile
						cards={state.discard}
						active={canTakeDiscard}
						onClick={onTakeDiscard}
					/>
				</div>
				<MeldArea
					state={state}
					names={names}
					sapawTargets={sapawTargets}
					onMeldClick={onMeldClick}
				/>
			</div>

			{/* Bot rails: side by side on mobile, dissolved into the grid's
			    outer columns on lg (display: contents). */}
			<div className="flex items-start justify-between gap-3 lg:contents">
				<div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
					<SeatPanel {...seatProps(1)} side="left" />
					<SortRail
						sortMode={sortMode}
						onSortChange={onSortChange}
					/>
				</div>
				<div className="flex flex-col items-end gap-3 lg:col-start-3 lg:row-start-1">
					<SeatPanel {...seatProps(2)} side="right" />
					<StatusPanel
						state={state}
						names={names}
						round={round}
						totalRounds={totalRounds}
					/>
				</div>
			</div>
		</div>
	);
}

// The central bordered meld area with one labelled group per player.
function MeldArea({
	state,
	names,
	sapawTargets,
	onMeldClick,
}: {
	state: TongitsState;
	names: string[];
	sapawTargets?: Set<number>;
	onMeldClick?: (meldId: number) => void;
}) {
	const group = (seat: number, label: string) => {
		const melds = state.players[seat].melds;
		return (
			<div className="flex min-h-24 flex-col items-center gap-2 rounded-xl bg-black/15 p-2.5 ring-1 ring-white/10 sm:p-3">
				<div className="flex flex-1 flex-wrap items-start justify-center gap-2">
					{melds.length ? (
						melds.map((m) => (
							<MeldGroup
								key={m.id}
								meld={m}
								cardWidth="clamp(1.9rem, 2.6vw, 2.8rem)"
								clickable={sapawTargets?.has(m.id) ?? false}
								onClick={onMeldClick}
							/>
						))
					) : (
						<span className="self-center text-xs italic opacity-40">
							No melds yet
						</span>
					)}
				</div>
				<span className="rounded-full bg-black/40 px-3 py-0.5 text-[10px] font-semibold opacity-80">
					{label}
				</span>
			</div>
		);
	};

	return (
		<div className="relative mt-5 w-full rounded-2xl border border-white/15 bg-black/10 p-3 pt-5 sm:p-4 sm:pt-6">
			<span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/70 px-4 py-1 text-[10px] font-bold uppercase tracking-widest ring-1 ring-white/15">
				Meld Area
			</span>
			<div className="grid gap-3 sm:grid-cols-2">
				{group(1, `${names[1]} Melds`)}
				{group(2, `${names[2]} Melds`)}
			</div>
			<div className="mt-3">{group(0, "Your Melds")}</div>
		</div>
	);
}

// Right-hand turn/status panel (lg and up).
function StatusPanel({
	state,
	names,
	round,
	totalRounds,
}: {
	state: TongitsState;
	names: string[];
	round: number;
	totalRounds: number;
}) {
	const res = state.result;
	const top = topDiscard(state);
	const heading = res
		? "Round Over"
		: state.turn === 0
			? "Your Turn"
			: `${names[state.turn]}'s Turn`;
	const rows: [string, React.ReactNode][] = [
		[
			"Dealer",
			<span key="d" className="flex items-center gap-1">
				<FaCrown className="h-3 w-3 text-amber-400" />
				{names[state.dealer]}
			</span>,
		],
		["Round", `${round} / ${totalRounds}`],
		["Turn", String(state.turnCount + 1)],
		["Draw Pile", String(state.stock.length)],
		[
			"Discard",
			top ? (
				<span
					key="t"
					className={
						RED_SUITS.has(top.suit)
							? "text-red-300"
							: "text-white"
					}
				>
					{top.rank}
					{SUIT_SYMBOL[top.suit]}
				</span>
			) : (
				"—"
			),
		],
		[
			"Status",
			res ? (
				<span key="s" className="text-amber-300">
					{names[res.winner]}{" "}
					{res.winner === 0 ? "win" : "wins"}
				</span>
			) : (
				<span key="s" className="text-emerald-300">
					In Progress
				</span>
			),
		],
	];

	return (
		<div className="hidden w-full min-w-52 rounded-2xl bg-black/40 p-4 ring-1 ring-white/15 backdrop-blur lg:block">
			<div
				className={`border-b border-white/10 pb-2 text-sm font-bold uppercase tracking-wide ${
					res
						? "text-amber-300"
						: state.turn === 0
							? "text-emerald-300"
							: "opacity-80"
				}`}
			>
				{heading}
			</div>
			<div className="mt-2 space-y-1.5">
				{rows.map(([label, value]) => (
					<div
						key={label}
						className="flex items-center justify-between gap-3 text-xs"
					>
						<span className="font-semibold uppercase tracking-wide opacity-55">
							{label}
						</span>
						<span className="font-bold tabular-nums">{value}</span>
					</div>
				))}
			</div>
		</div>
	);
}

// Stacked sort controls on the left rail (lg and up — the action bar carries
// a compact version on small screens).
function SortRail({
	sortMode,
	onSortChange,
}: {
	sortMode: SortMode;
	onSortChange: (mode: SortMode) => void;
}) {
	const rankActive = sortMode === "rank-asc" || sortMode === "rank-desc";
	const btn = (active: boolean) =>
		`w-full rounded-xl px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide ring-1 transition ${
			active
				? "bg-amber-400/15 ring-amber-400/60"
				: "bg-black/30 ring-white/15 hover:bg-black/45"
		}`;

	return (
		<div className="hidden w-full flex-col gap-2 lg:flex">
			<button
				className={btn(rankActive)}
				onClick={() =>
					onSortChange(
						sortMode === "rank-asc" ? "rank-desc" : "rank-asc",
					)
				}
			>
				⇅ Sort by Rank {rankActive ? (sortMode === "rank-asc" ? "↑" : "↓") : ""}
			</button>
			<button
				className={btn(sortMode === "suit")}
				onClick={() => onSortChange("suit")}
			>
				♣ Sort by Suit
			</button>
			<button
				className={btn(sortMode === "auto")}
				onClick={() => onSortChange("auto")}
			>
				✨ Auto Arrange
			</button>
		</div>
	);
}
