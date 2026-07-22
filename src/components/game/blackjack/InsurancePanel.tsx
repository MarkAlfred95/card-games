import { LuShieldCheck, LuX } from "react-icons/lu";
import { formatUSD } from "../../../wallet";
import RulesMenu from "./RulesMenu";

interface InsurancePanelProps {
	// Cost of insurance (half the main bet).
	cost: number;
	// False when the wallet can't cover the insurance side bet.
	canAfford: boolean;
	onTake: () => void;
	onDecline: () => void;
	themeClass?: string;
}

// Bottom-sheet offered when the dealer's up-card is an Ace: an optional side
// bet that the dealer has a natural blackjack, paying 2:1 if it lands.
export default function InsurancePanel({
	cost,
	canAfford,
	onTake,
	onDecline,
	themeClass,
}: InsurancePanelProps) {
	return (
		<div
			className="flex w-full max-w-xl flex-col overflow-hidden rounded-(--hud-radius) border border-white/15 shadow-2xl backdrop-blur"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 92%, black)",
			}}
		>
			<div className="flex items-center justify-between border-b border-white/10 p-4">
				<span className="font-display text-lg font-semibold tracking-tight opacity-90 [.theme-neo_&]:text-sm [.theme-neo_&]:uppercase">
					Dealer shows an Ace
				</span>
				<RulesMenu themeClass={themeClass} />
			</div>
			<p className="px-4 pt-3 text-sm opacity-80">
				Take insurance for {formatUSD(cost)}? It pays 2:1 if the dealer
				turns over a blackjack, and is lost otherwise.
			</p>
			<div className="flex w-full gap-2 px-4 pt-3 pb-4 sm:gap-3">
				<button
					onClick={onDecline}
					className="hud-btn flex flex-1 items-center justify-center gap-1.5 rounded-(--hud-radius-sm) bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/20 transition hover:bg-white/20"
				>
					<LuX className="h-4 w-4" />
					No thanks
				</button>
				<button
					onClick={onTake}
					disabled={!canAfford}
					title={canAfford ? undefined : "Not enough balance"}
					className="hud-btn flex flex-1 items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
					style={{
						background:
							"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
						color: "var(--hud-accent-ink)",
					}}
				>
					<LuShieldCheck className="h-4 w-4" />
					Insure {formatUSD(cost)}
				</button>
			</div>
		</div>
	);
}
