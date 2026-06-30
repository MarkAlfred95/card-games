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
}

export default function BettingGate({
	banker,
	balance,
	stake,
	setStake,
	onPlace,
}: BettingGateProps) {
	return (
		<div
			className="mx-auto w-full max-w-md rounded-2xl p-5 shadow-2xl ring-1 ring-white/15"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 94%, black)",
			}}
		>
			<h2 className="text-lg font-semibold">Place your stake</h2>
			<p className="mt-1 text-sm opacity-70">
				<FaCrown className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-amber-400" />
				{banker} is the banker. Pick chips for your per-point stake —
				you win or lose that much for every point you beat or trail the
				banker by.
			</p>
			<div className="mt-4">
				<ChipTray balance={balance} value={stake} onChange={setStake} />
			</div>
			<button
				onClick={onPlace}
				disabled={stake < MIN_CHIP}
				className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-400 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
			>
				{stake < MIN_CHIP ? (
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
