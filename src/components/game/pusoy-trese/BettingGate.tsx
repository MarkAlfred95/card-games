import { FaCrown } from "react-icons/fa6";
import { LuArrowRight } from "react-icons/lu";
import ChipTray from "../../ChipTray";
import { formatUSD } from "../../../wallet";
import { MIN_CHIP } from "./constants";

interface BettingGateProps {
	banker: string;
	balance: number;
	stake: number;
	setStake: (v: number) => void;
	onPlace: () => void;
	// Spending-division multiplier applied to the chip denominations.
	factor?: number;
}

export default function BettingGate({
	banker,
	balance,
	stake,
	setStake,
	onPlace,
	factor = 1,
}: BettingGateProps) {
	const minChip = MIN_CHIP * factor;
	// Worst-case round swings ~24 points, so cap the per-point stake at 1/25 of
	// the balance — losing the maximum costs about one bankroll, not several.
	const maxStake = Math.max(
		minChip,
		Math.floor(balance / 25 / minChip) * minChip,
	);
	return (
		<div
			className="mx-auto w-full max-w-md rounded-(--hud-radius) p-5 shadow-2xl ring-1 ring-white/15"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 94%, black)",
			}}
		>
			<h2 className="font-display text-xl font-semibold tracking-tight [.theme-neo_&]:text-base [.theme-neo_&]:uppercase">
				Place your stake
			</h2>
			<p className="mt-1 text-sm opacity-70">
				<FaCrown
					className="mr-1 inline h-3.5 w-3.5 -translate-y-px"
					style={{ color: "var(--hud-accent)" }}
				/>
				{banker} is the banker. Pick chips for your per-point stake —
				you win or lose that much for every point you beat or trail the
				banker by. Max {formatUSD(maxStake)}/pt this round.
			</p>
			<div className="mt-4">
				<ChipTray
					balance={balance}
					value={stake}
					onChange={setStake}
					factor={factor}
					maxStake={maxStake}
				/>
			</div>
			<button
				onClick={onPlace}
				disabled={stake < minChip}
				className="hud-btn mt-4 flex w-full items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
				style={{
					background:
						"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
					color: "var(--hud-accent-ink)",
				}}
			>
				{stake < minChip ? (
					"Add at least one chip"
				) : (
					<>
						Stake {formatUSD(stake)}/pt
						<LuArrowRight className="h-4 w-4" /> see cards
					</>
				)}
			</button>
		</div>
	);
}
