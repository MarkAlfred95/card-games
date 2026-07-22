// Match + economy rules shared by the Blackjack page and its components.
export const TOTAL_HANDS = 10;

// Same economy rules as the other games (scaled by the spending division): $5
// is the smallest chip, and a player who can't afford it is auto-staked the
// comeback amount instead of being unable to play.
export const MIN_CHIP = 5;
export const COMEBACK_STAKE = 100;

// Cap the opening bet at half the bankroll: doubling or splitting can commit up
// to another stake, so half keeps the total wager affordable in one hand.
export function maxBetFor(balance: number, factor: number): number {
  const minChip = MIN_CHIP * factor;
  return Math.max(minChip, Math.floor(balance / 2 / minChip) * minChip);
}
