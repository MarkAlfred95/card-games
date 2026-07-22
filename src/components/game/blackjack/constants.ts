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

// How a hand total reads on the felt. A soft hand (an ace still worth 11) shows
// both interpretations, e.g. A+2 → "3 / 13"; a 21 or a hard hand shows the one
// value. Takes the `{ total, soft }` from the engine's handTotal.
export function formatTotal(total: number, soft: boolean): string {
  return soft && total < 21 ? `${total - 10} / ${total}` : String(total);
}
