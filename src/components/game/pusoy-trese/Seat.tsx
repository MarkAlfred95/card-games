import { FaCrown } from "react-icons/fa6";
import Card from "../../Card";
import type { Card as CardModel } from "../../../game/types";
import type { BackKey } from "../../../cardbacks";
import type { CSSVars } from "../../../styleVars";
import { formatUSD } from "../../../wallet";

// One avatar/info plaque for a player around the table. Opponents also show a
// small fanned stack of face-down cards above the plaque.
export default function Seat({
	name,
	balance,
	stake,
	isBanker,
	isYou,
	hand,
	back,
}: {
	name: string;
	balance: number;
	stake: number;
	isBanker: boolean;
	isYou: boolean;
	hand?: CardModel[];
	back: BackKey;
}) {
	return (
		<div className="flex flex-col items-center gap-1.5">
			{hand && (
				<div
					className="flex"
					style={{ "--card-w": "1.5rem" } as CSSVars}
				>
					{hand.slice(0, 5).map((c, j) => (
						<div
							key={c.id}
							style={{
								marginLeft:
									j === 0 ? 0 : "calc(var(--card-w) * -0.55)",
							}}
						>
							<Card faceDown back={back} />
						</div>
					))}
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
				</div>
				<div className="tabular-nums text-xs opacity-90">
					{formatUSD(balance)}
				</div>
				<div className="text-[10px] opacity-60">
					{isBanker ? "banking" : `stake ${formatUSD(stake)}`}
				</div>
			</div>
		</div>
	);
}
