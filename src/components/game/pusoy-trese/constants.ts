// Match + economy rules shared by the Pusoy Trese page and its components.
export const SEATS = 4;
export const GAMES_PER_BANKER = 3;
export const TOTAL_GAMES = SEATS * GAMES_PER_BANKER; // 12

// A player is "out of money" (possibly negative — losses aren't capped) once
// they can't afford the smallest chip ($5). Instead of staking $0 (no way to
// recover), they're auto-staked 10% of the division's base unit ($1000 base →
// $100/pt, scaled by the division factor) so they can still win some back.
export const MIN_CHIP = 5;
export const COMEBACK_STAKE = 100; // 10% of the $1K base division unit

// Starting bankroll for every seat in an online room (server seeds it; the
// client uses it to show net earnings at game over).
export const ONLINE_START_BALANCE = 100_000;
