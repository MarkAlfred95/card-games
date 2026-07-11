// Match + economy rules shared by the Lucky 9 page and its components.
export const SEATS = 4;
export const GAMES_PER_BANKER = 3;
export const TOTAL_GAMES = SEATS * GAMES_PER_BANKER; // 12

// Same economy rules as Pusoy Trese (scaled by the spending division): $5 is
// the smallest chip, and a player who can't afford it is auto-staked the
// comeback amount instead of betting $0 with no way to recover.
export const MIN_CHIP = 5;
export const COMEBACK_STAKE = 100;

// Bets are flat (not per-point) and the worst case loses double (banker's
// Lucky 9), so cap a bet at half the bankroll: one disaster can zero you out
// but never drag the balance negative.
export function maxBetFor(balance: number, factor: number): number {
	const minChip = MIN_CHIP * factor;
	return Math.max(minChip, Math.floor(balance / 2 / minChip) * minChip);
}

// Starting bankroll for every seat in an online room (server seeds it; the
// client uses it to show net earnings at game over).
export const ONLINE_START_BALANCE = 100_000;
