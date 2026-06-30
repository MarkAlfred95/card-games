// Match + economy rules shared by the Pusoy Trese page and its components.
export const SEATS = 4;
export const GAMES_PER_BANKER = 3;
export const TOTAL_GAMES = SEATS * GAMES_PER_BANKER; // 12

// A player is "out of money" once they can't afford the smallest chip ($5).
// Instead of staking $0 (no way to recover), they're auto-staked this much per
// point so they still have a chance to win some back.
export const MIN_CHIP = 5;
export const COMEBACK_STAKE = 50;
