// Spending divisions: order-of-magnitude bands of the shared wallet balance.
// A division scales every monetary value in a game by `factor` (×10 per band),
// so the base "$1K" division (factor 1) matches each game's default economy.
//
// A player may enter any division they can afford (balance >= its floor); the
// division chosen on the setup screen is locked in for the whole match.

const BASE_UNIT = 1000;

// Flavour names by level. `unit` and `min` are derived (1000, 10000, ...).
const DIVISION_NAMES = [
	"First Class", // $1K
	"Gold", // $10K
	"Platinum", // $100K
	"Diamond", // $1M
	"Champion", // $10M
	"Legendary", // $100M
	"Mythic", // $1B
];

export interface Division {
	level: number; // 0-based index; 0 = First Class
	name: string; // flavour name
	unit: number; // identifying money unit: 1000, 10000, 100000, ...
	min: number; // entry floor (inclusive); 0 for First Class
	factor: number; // multiply base game constants by this (unit / BASE_UNIT)
}

export const DIVISIONS: Division[] = DIVISION_NAMES.map((name, level) => {
	const unit = BASE_UNIT * 10 ** level;
	return { level, name, unit, min: level === 0 ? 0 : unit, factor: 10 ** level };
});

// The division a balance naturally falls into (the highest one it can afford).
export function divisionFor(balance: number): Division {
	let current = DIVISIONS[0];
	for (const d of DIVISIONS) if (balance >= d.min) current = d;
	return current;
}

// Every division a balance is allowed to enter, lowest first (for the picker).
export function divisionsUpTo(balance: number): Division[] {
	return DIVISIONS.filter((d) => balance >= d.min);
}
