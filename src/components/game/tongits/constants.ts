// Match + economy rules shared by the Tongits page and its components.
export const SEATS = 3;
// Dealer rotates every round; two full rotations per match.
export const TOTAL_ROUNDS = 6;

// Per-round stake options. Settlement is in bet units: losers pay 1 unit,
// +1 if burned (no exposed meld), +1 against a Tongits, +1 for losing a
// fight they joined — so a worst-case round costs 3 units.
export const BET_OPTIONS = [5, 10, 25, 50, 100, 250];

// Hand-fan display orders, shared by the page and the table's sort rail.
export type SortMode = "auto" | "rank-asc" | "rank-desc" | "suit";
