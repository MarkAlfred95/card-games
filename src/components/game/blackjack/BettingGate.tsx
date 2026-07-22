import { LuArrowRight } from "react-icons/lu";
import ChipTray from "../../ChipTray";
import { formatUSD } from "../../../wallet";
import { MIN_CHIP, maxBetFor } from "./constants";

interface BettingGateProps {
	balance: number;
	bet: number;
	setBet: (v: number) => void;
	onPlace: () => void;
	// Spending-division multiplier applied to the chip denominations.
	factor?: number;
}

// Place the opening wager before the cards turn face-up. Flat bet against the
// dealer; the payoff is even money, or 3:2 on a natural blackjack.
export default function BettingGate({
	balance,
	bet,
	setBet,
	onPlace,
	factor = 1,
}: BettingGateProps) {
	const minChip = MIN_CHIP * factor;
	const maxBet = maxBetFor(balance, factor);
	return (
		<div
			className="mx-auto w-full max-w-md rounded-(--hud-radius) p-5 shadow-2xl ring-1 ring-white/15"
			style={{
				backgroundColor:
					"color-mix(in srgb, var(--table-felt-2) 94%, black)",
			}}
		>
			<h2 className="font-display text-xl font-semibold tracking-tight [.theme-neo_&]:text-base [.theme-neo_&]:uppercase">
				Place your bet
			</h2>
			<p className="mt-1 text-sm opacity-70">
				Beat the dealer without busting and your bet is matched — land a
				two-card blackjack and it pays 3:2. Keep enough back to double or
				split. Max {formatUSD(maxBet)} this hand.
			</p>
			<div className="mt-4">
				<ChipTray
					balance={balance}
					value={bet}
					onChange={setBet}
					factor={factor}
					maxStake={maxBet}
					label="Your bet"
				/>
			</div>
			<button
				onClick={onPlace}
				disabled={bet < minChip}
				className="hud-btn mt-4 flex w-full items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:brightness-100"
				style={{
					background:
						"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
					color: "var(--hud-accent-ink)",
				}}
			>
				{bet < minChip ? (
					"Add at least one chip"
				) : (
					<>
						Bet {formatUSD(bet)}
						<LuArrowRight className="h-4 w-4" /> deal
					</>
				)}
			</button>
		</div>
	);
}
