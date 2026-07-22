import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LuArrowRight } from "react-icons/lu";
import { FaTrophy } from "react-icons/fa6";
import { buildDeck, shuffle } from "../game/deck";
import {
	handTotal,
	isBlackjack,
	isBust,
	canSplit as canSplitCards,
	playDealer,
	settleHand,
} from "../game/blackjack";
import type { HandResult } from "../game/blackjack";
import type { Card as CardModel } from "../game/types";
import { THEMES, THEME_KEYS } from "../themes";
import type { ThemeKey } from "../themes";
import { BACKS, BACK_KEYS } from "../cardbacks";
import type { BackKey } from "../cardbacks";
import { playSfx } from "../sfx";
import { useAudioSettings } from "../audioPrefs";
import { useWallet, formatUSD, formatDelta, formatCompactUSD } from "../wallet";
import { DIVISIONS, divisionFor, divisionsUpTo } from "../divisions";
import type { Division } from "../divisions";
import {
	Header,
	GameShell,
	BlackjackTable,
	ActionPanel,
	InsurancePanel,
	BettingGate,
	TOTAL_HANDS,
	MIN_CHIP,
	COMEBACK_STAKE,
} from "../components/game/blackjack";

// One player hand at the table. After a split there can be two; each carries
// its own bet and, once the hand settles, its result.
interface PlayerHand {
	cards: CardModel[];
	bet: number;
	doubled: boolean;
	fromSplit: boolean;
	done: boolean;
	result?: HandResult;
}

interface RoundState {
	dealer: CardModel[];
	stock: CardModel[];
	playerHands: PlayerHand[];
	activeHand: number;
	insuranceBet: number;
}

type Phase = "setup" | "betting" | "insurance" | "player" | "revealed" | "gameover";

// Deal a fresh hand: two cards to the player, two to the dealer, the rest is
// the draw stock. The opening bet is carried on the single starting hand.
function dealFresh(bet: number): RoundState {
	const deck = shuffle(buildDeck());
	return {
		dealer: [deck[1], deck[3]],
		stock: deck.slice(4),
		playerHands: [
			{
				cards: [deck[0], deck[2]],
				bet,
				doubled: false,
				fromSplit: false,
				done: false,
			},
		],
		activeHand: 0,
		insuranceBet: 0,
	};
}

// Index of the next hand still in play from `from` onward, or -1 if none.
function nextActive(hands: PlayerHand[], from: number): number {
	for (let i = from; i < hands.length; i++) if (!hands[i].done) return i;
	return -1;
}

export default function Blackjack() {
	const wallet = useWallet();
	const [theme, setTheme] = useState<ThemeKey>("neo");
	const [back, setBack] = useState<BackKey>("lattice");
	const audio = useAudioSettings();

	const [phase, setPhase] = useState<Phase>("setup");
	const [handIndex, setHandIndex] = useState(0);
	// Wallet balance when the match began, for the net-earnings summary.
	const [startBalance, setStartBalance] = useState(0);
	const [round, setRound] = useState<RoundState>(() => dealFresh(0));
	const [humanBet, setHumanBet] = useState(0);

	const [division, setDivision] = useState<Division>(() =>
		divisionFor(wallet.balance),
	);
	const factor = division.factor;

	// In the lobby, drop back to the natural division if the balance can no
	// longer afford the selected one.
	useEffect(() => {
		if (phase === "setup" && wallet.balance < division.min)
			setDivision(divisionFor(wallet.balance));
	}, [phase, wallet.balance, division.min]);

	// --- Settlement -----------------------------------------------------------

	// Settle every player hand against the dealer, move the money once, reveal.
	// `dealerDraws` is false when a natural blackjack (player or dealer) already
	// ended the hand — the dealer only turns over the hole card.
	function finishRound(r: RoundState, dealerDraws: boolean) {
		let dealer = r.dealer;
		let stock = r.stock;
		const anyLive = r.playerHands.some((h) => !isBust(h.cards));
		if (dealerDraws && anyLive) {
			const played = playDealer(dealer, stock);
			dealer = played.dealer;
			stock = played.stock;
		}
		const hands = r.playerHands.map((h) => ({
			...h,
			result: settleHand(h.cards, dealer, h.bet, {
				fromSplit: h.fromSplit,
			}),
		}));
		let net = hands.reduce((s, h) => s + (h.result?.delta ?? 0), 0);
		if (r.insuranceBet > 0)
			net += isBlackjack(dealer) ? 2 * r.insuranceBet : -r.insuranceBet;

		wallet.adjust(net);
		setRound({ ...r, dealer, stock, playerHands: hands });
		setPhase("revealed");

		playSfx("card_flip");
		const stinger = net > 0 ? "win_jingle" : net < 0 ? "lose_sting" : null;
		setTimeout(() => {
			if (stinger) playSfx(stinger);
			if (net !== 0) playSfx("chip_slide");
		}, 500);
	}

	// After the deal (and after any insurance decision): a natural on either
	// side ends the hand at once, otherwise the player acts.
	function resolveDeal(r: RoundState) {
		if (r.dealer[0].rank === "A") {
			setRound(r);
			setPhase("insurance");
			return;
		}
		if (isBlackjack(r.dealer) || isBlackjack(r.playerHands[0].cards)) {
			finishRound(r, false);
			return;
		}
		setRound(r);
		setPhase("player");
	}

	function resolveAfterInsurance(r: RoundState) {
		if (isBlackjack(r.dealer) || isBlackjack(r.playerHands[0].cards)) {
			finishRound(r, false);
		} else {
			setRound(r);
			setPhase("player");
		}
	}

	// --- Match flow -----------------------------------------------------------

	function beginMatch() {
		setStartBalance(wallet.balance);
		setHandIndex(0);
		enterRound();
	}

	// Deal a new hand. A player who can't afford the minimum chip is auto-staked
	// the comeback amount and skips the bet, so the match keeps moving.
	function enterRound() {
		const broke = wallet.balance < MIN_CHIP * factor;
		const r = dealFresh(broke ? COMEBACK_STAKE * factor : 0);
		setHumanBet(0);
		playSfx("card_shuffle");
		setTimeout(() => playSfx("card_deal"), 700);
		if (broke) resolveDeal(r);
		else {
			setRound(r);
			setPhase("betting");
		}
	}

	function placeBet() {
		playSfx("chip_stack");
		resolveDeal({
			...round,
			playerHands: round.playerHands.map((h, i) =>
				i === 0 ? { ...h, bet: humanBet } : h,
			),
		});
	}

	function takeInsurance() {
		playSfx("chip_stack");
		resolveAfterInsurance({
			...round,
			insuranceBet: Math.round(round.playerHands[0].bet / 2),
		});
	}

	function declineInsurance() {
		playSfx("button_click");
		resolveAfterInsurance(round);
	}

	// Move to the next unfinished hand, or settle when every hand is done.
	function advance(r: RoundState, from: number) {
		const ni = nextActive(r.playerHands, from);
		if (ni === -1) finishRound(r, true);
		else setRound({ ...r, activeHand: ni });
	}

	function onHit() {
		playSfx("card_flip");
		const i = round.activeHand;
		const cards = [...round.playerHands[i].cards, round.stock[0]];
		const done = isBust(cards) || handTotal(cards).total === 21;
		const hands = round.playerHands.map((h, k) =>
			k === i ? { ...h, cards, done: h.done || done } : h,
		);
		const r = { ...round, playerHands: hands, stock: round.stock.slice(1) };
		if (done) advance(r, i + 1);
		else setRound(r);
	}

	function onStand() {
		playSfx("button_click");
		const i = round.activeHand;
		const hands = round.playerHands.map((h, k) =>
			k === i ? { ...h, done: true } : h,
		);
		advance({ ...round, playerHands: hands }, i + 1);
	}

	function onDouble() {
		playSfx("chip_stack");
		setTimeout(() => playSfx("card_flip"), 120);
		const i = round.activeHand;
		const cards = [...round.playerHands[i].cards, round.stock[0]];
		const hands = round.playerHands.map((h, k) =>
			k === i
				? { ...h, cards, bet: h.bet * 2, doubled: true, done: true }
				: h,
		);
		advance(
			{ ...round, playerHands: hands, stock: round.stock.slice(1) },
			i + 1,
		);
	}

	function onSplit() {
		playSfx("card_deal");
		const i = round.activeHand;
		const h = round.playerHands[i];
		const isAces = h.cards[0].rank === "A";
		const hand1: PlayerHand = {
			cards: [h.cards[0], round.stock[0]],
			bet: h.bet,
			doubled: false,
			fromSplit: true,
			done: false,
		};
		const hand2: PlayerHand = {
			cards: [h.cards[1], round.stock[1]],
			bet: h.bet,
			doubled: false,
			fromSplit: true,
			done: false,
		};
		// Split aces get one card each and stand automatically; other splits
		// stand only on a 21.
		hand1.done = isAces || handTotal(hand1.cards).total === 21;
		hand2.done = isAces || handTotal(hand2.cards).total === 21;
		const hands = [
			...round.playerHands.slice(0, i),
			hand1,
			hand2,
			...round.playerHands.slice(i + 1),
		];
		const r = { ...round, playerHands: hands, stock: round.stock.slice(2) };
		// Play the left hand next; advance() skips it if it auto-stood (aces/21).
		advance(r, i);
	}

	function nextHand() {
		playSfx("button_click");
		const next = handIndex + 1;
		if (next >= TOTAL_HANDS) {
			setPhase("gameover");
			return;
		}
		setHandIndex(next);
		enterRound();
	}

	function playAgain() {
		playSfx("button_click");
		setPhase("setup");
		setHandIndex(0);
	}

	// Match-end fanfare.
	useEffect(() => {
		if (phase !== "gameover") return;
		playSfx(wallet.balance - startBalance >= 0 ? "match_win_fanfare" : "match_end");
	}, [phase, wallet.balance, startBalance]);

	const themeOptions = THEME_KEYS.map(
		(k) => [k, THEMES[k].label] as [ThemeKey, string],
	);
	const backOptions = BACK_KEYS.map(
		(k) => [k, BACKS[k].label] as [BackKey, string],
	);
	const header = (
		<Header
			title="Blackjack"
			theme={theme}
			setTheme={setTheme}
			back={back}
			setBack={setBack}
			themeOptions={themeOptions}
			backOptions={backOptions}
			balance={wallet.balance}
			division={
				phase === "setup" ? undefined : formatCompactUSD(division.unit)
			}
			{...audio}
		/>
	);
	const shellClass = THEMES[theme].className;

	// --- Setup screen ---------------------------------------------------------

	if (phase === "setup") {
		const affordable = divisionsUpTo(wallet.balance);
		const shownDivisions = DIVISIONS.slice(
			0,
			Math.min(affordable.length + 1, DIVISIONS.length),
		);
		const divisionRange = (d: Division) => {
			if (d.level === 0) return `Under ${formatCompactUSD(10000)}`;
			const next = DIVISIONS[d.level + 1];
			return next
				? `${formatCompactUSD(d.min)} – ${formatCompactUSD(next.min)}`
				: `${formatCompactUSD(d.min)}+`;
		};

		return (
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-2xl rounded-(--hud-radius) border border-white/10 bg-black/35 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<div className="flex gap-3 items-center">
							<div
								className="flex h-16 w-16 shrink-0 items-center justify-center rounded-(--hud-radius) bg-black/20 text-3xl font-black ring-1 ring-white/10"
								style={{ color: "var(--hud-accent)" }}
							>
								21
							</div>
							<div className="flex flex-col">
								<h2 className="font-display text-2xl font-semibold tracking-tight [.theme-neo_&]:text-lg [.theme-neo_&]:uppercase">
									Take on the dealer
								</h2>
								<p className="mt-1 text-sm opacity-70 leading-tight">
									Play {TOTAL_HANDS} hands of heads-up blackjack
									against the house. Your bankroll is the shared
									wallet — win it up or lose it down.
								</p>
							</div>
						</div>

						{/* How-to-play primer */}
						<div className="mt-5 rounded-(--hud-radius-sm) bg-white/5 p-4 ring-1 ring-white/10">
							<h3 className="hud-label text-sm font-semibold uppercase tracking-wide opacity-80">
								How to play
							</h3>
							<p className="mt-1 text-sm opacity-70 leading-snug">
								Get closer to 21 than the dealer without going
								over. Aces count 1 or 11, face cards count 10.{" "}
								<b>Hit</b> for another card or <b>stand</b> to
								hold; <b>double down</b> for one last card at
								twice the bet, or <b>split</b> a matching pair
								into two hands. A two-card 21 is a{" "}
								<b>blackjack</b> and pays 3:2. The dealer draws to
								17 and stands.
							</p>
						</div>

						{/* Spending division selector */}
						<div className="mt-6">
							<div className="flex items-baseline justify-between gap-2">
								<h3 className="hud-label text-sm font-semibold uppercase tracking-wide opacity-80">
									Spending division
								</h3>
								<span className="text-xs opacity-60">
									Stakes ×{factor} ·{" "}
									{formatCompactUSD(division.unit)}
								</span>
							</div>
							<p className="mt-1 text-xs opacity-60 leading-tight">
								Play at your level or drop to a lower one. Reach
								the next tier's balance to unlock it.
							</p>
							<div className="mt-3 flex flex-col sm:grid sm:grid-cols-2 gap-3">
								{shownDivisions.map((d) => {
									const locked = wallet.balance < d.min;
									const active = d.level === division.level;
									return (
										<button
											key={d.level}
											onClick={() =>
												!locked && setDivision(d)
											}
											disabled={locked}
											className={`rounded-(--hud-radius-sm) p-3 text-left transition ${
												active
													? ""
													: locked
														? "cursor-not-allowed bg-white/[0.03] opacity-50 ring-2 ring-white/10"
														: "bg-white/5 ring-2 ring-white/20 hover:-translate-y-0.5 hover:bg-white/10 hover:ring-white/40"
											}`}
											style={
												active
													? {
															background:
																"color-mix(in srgb, var(--hud-accent) 15%, transparent)",
															boxShadow:
																"0 0 0 2px color-mix(in srgb, var(--hud-accent) 60%, transparent)",
														}
													: undefined
											}
										>
											<div className="flex items-center justify-between gap-2">
												<span className="text-sm font-bold">
													{formatCompactUSD(d.unit)} ·{" "}
													{d.name}
												</span>
												{active ? (
													<span
														className="rounded-(--hud-radius-sm) px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
														style={{
															background:
																"var(--hud-accent)",
															color: "var(--hud-accent-ink)",
														}}
													>
														Selected
													</span>
												) : locked ? (
													<span className="rounded-(--hud-radius-sm) bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide opacity-80">
														Reach{" "}
														{formatCompactUSD(
															d.min,
														)}
													</span>
												) : null}
											</div>
											<p className="mt-1 text-xs opacity-70">
												{divisionRange(d)} · chips{" "}
												{formatCompactUSD(5 * d.factor)}–
												{formatCompactUSD(
													1000 * d.factor,
												)}
											</p>
										</button>
									);
								})}
							</div>
						</div>

						<button
							onClick={beginMatch}
							className="hud-btn mt-6 flex w-full items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-3 text-sm font-bold shadow-lg transition hover:brightness-110"
							style={{
								background:
									"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
								color: "var(--hud-accent-ink)",
							}}
						>
							Deal me in <LuArrowRight className="h-4 w-4" />
						</button>

						<p className="mt-5 text-sm opacity-70">
							Your balance:{" "}
							<b
								style={{
									color: `color-mix(in srgb, ${
										wallet.balance < 0
											? "var(--hud-negative)"
											: "var(--hud-positive)"
									} 65%, white)`,
								}}
							>
								{formatUSD(wallet.balance)}
							</b>
						</p>
						{wallet.balance < 5 && (
							<button
								onClick={() => wallet.reset()}
								className="mt-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20"
							>
								Reset wallet to {formatUSD(1000)}
							</button>
						)}
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Game-over screen -----------------------------------------------------

	if (phase === "gameover") {
		const net = wallet.balance - startBalance;
		const youWon = net > 0;
		const rows = [
			{ name: "You", value: net, isYou: true },
			{ name: "The house", value: -net, isYou: false },
		].sort((a, b) => b.value - a.value);

		return (
			<GameShell themeClass={shellClass} header={header}>
				<AmbientGlow />
				<div className="relative p-4">
					<motion.div
						initial={{ opacity: 0, y: 24 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.45, ease: "easeOut" }}
						className="mx-auto mt-6 w-full max-w-xl rounded-(--hud-radius) border border-white/10 bg-black/25 p-6 shadow-2xl shadow-black/30 backdrop-blur"
					>
						<h2 className="font-display flex items-center gap-2 text-3xl font-semibold tracking-tight [.theme-neo_&]:text-xl [.theme-neo_&]:uppercase">
							{youWon ? (
								<>
									<FaTrophy
										className="h-6 w-6"
										style={{ color: "var(--hud-accent)" }}
									/>
									You beat the house!
								</>
							) : net < 0 ? (
								"The house wins"
							) : (
								"You broke even"
							)}
						</h2>
						<p className="mt-1 text-sm opacity-70">
							All {TOTAL_HANDS} hands played. Final tally:
						</p>

						<div className="mt-4 space-y-2">
							{rows.map((r) => (
								<div
									key={r.name}
									className={`flex items-center justify-between rounded-(--hud-radius-sm) px-4 py-2.5 ${
										r.isYou ? "" : "bg-black/20"
									}`}
									style={
										r.isYou
											? {
													background:
														"color-mix(in srgb, var(--seat-you) 15%, transparent)",
													boxShadow:
														"0 0 0 1px color-mix(in srgb, var(--seat-you) 40%, transparent)",
												}
											: undefined
									}
								>
									<span className="font-semibold">
										{r.name}
									</span>
									<span
										className="font-bold tabular-nums"
										style={
											r.value !== 0
												? {
														color: `color-mix(in srgb, ${
															r.value > 0
																? "var(--hud-positive)"
																: "var(--hud-negative)"
														} 65%, white)`,
													}
												: undefined
										}
									>
										{formatDelta(r.value)}
									</span>
								</div>
							))}
						</div>
						<p className="mt-3 text-sm opacity-70">
							Balance: <b>{formatUSD(wallet.balance)}</b>
						</p>

						<button
							onClick={playAgain}
							className="hud-btn mt-6 flex w-full items-center justify-center gap-1.5 rounded-(--hud-radius-sm) px-5 py-2.5 text-sm font-bold shadow-lg transition hover:brightness-110"
							style={{
								background:
									"linear-gradient(to bottom, var(--hud-accent), var(--hud-accent-2))",
								color: "var(--hud-accent-ink)",
							}}
						>
							Play again <LuArrowRight className="h-4 w-4" />
						</button>
					</motion.div>
				</div>
			</GameShell>
		);
	}

	// --- Active game (betting / insurance / player / revealed) ----------------

	const active = round.playerHands[round.activeHand];
	const activeEval = handTotal(active.cards);
	const committed =
		round.playerHands.reduce((s, h) => s + h.bet, 0) + round.insuranceBet;
	const canDouble =
		!active.done &&
		active.cards.length === 2 &&
		committed + active.bet <= wallet.balance;
	const splitAllowed =
		!active.done &&
		round.playerHands.length === 1 &&
		canSplitCards(active.cards) &&
		committed + active.bet <= wallet.balance;
	const insCost = Math.round(round.playerHands[0].bet / 2);
	const canAffordInsurance = committed + insCost <= wallet.balance;
	const broke = wallet.balance < MIN_CHIP * factor;

	return (
		<GameShell themeClass={shellClass} header={header}>
			<div className="flex flex-1 flex-col gap-4 p-4 sm:p-6">
				{phase !== "betting" && broke && (
					<div
						className="rounded-(--hud-radius-sm) px-4 py-2 text-sm font-medium"
						style={{
							background:
								"color-mix(in srgb, var(--hud-negative) 18%, transparent)",
							boxShadow:
								"0 0 0 1px color-mix(in srgb, var(--hud-negative) 40%, transparent)",
						}}
					>
						💸 Out of money — you're auto-staked{" "}
						{formatUSD(COMEBACK_STAKE * factor)} this hand to win some
						back.
					</div>
				)}
				<BlackjackTable
					dealer={round.dealer}
					playerHands={round.playerHands}
					activeHand={round.activeHand}
					back={back}
					handIndex={handIndex}
					totalHands={TOTAL_HANDS}
					balance={wallet.balance}
					reveal={phase === "revealed"}
					playerFaceUp={phase !== "betting"}
					playing={phase === "player"}
					insuranceBet={round.insuranceBet}
					isLast={handIndex + 1 >= TOTAL_HANDS}
					onNext={nextHand}
				/>
			</div>
			{phase === "betting" ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<BettingGate
						balance={wallet.balance}
						bet={humanBet}
						setBet={(v) => {
							playSfx(v > humanBet ? "chip_place" : "button_click");
							setHumanBet(v);
						}}
						onPlace={placeBet}
						factor={factor}
					/>
				</div>
			) : phase === "insurance" ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<InsurancePanel
						cost={insCost}
						canAfford={canAffordInsurance}
						onTake={takeInsurance}
						onDecline={declineInsurance}
						themeClass={shellClass}
					/>
				</div>
			) : phase === "player" ? (
				<div className="fixed inset-x-0 bottom-0 z-30 flex justify-center px-2 pb-2 sm:px-4 sm:pb-4">
					<ActionPanel
						cards={active.cards}
						total={activeEval.total}
						soft={activeEval.soft}
						bet={active.bet}
						handLabel={
							round.playerHands.length > 1
								? `Hand ${round.activeHand + 1} of ${round.playerHands.length}`
								: undefined
						}
						canHit={!active.done && activeEval.total < 21}
						canStand={!active.done}
						canDouble={canDouble}
						canSplit={splitAllowed}
						onHit={onHit}
						onStand={onStand}
						onDouble={onDouble}
						onSplit={onSplit}
						themeClass={shellClass}
					/>
				</div>
			) : null}
		</GameShell>
	);
}

// Soft ambient glows matching the home page; neutral tints so they sit well on
// any felt theme. Under the neo theme a faint blueprint grid + grain replace
// the casino mood lighting.
function AmbientGlow() {
	return (
		<div
			aria-hidden
			className="pointer-events-none absolute inset-0 overflow-hidden"
		>
			<div className="absolute -top-40 left-1/2 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-white/[0.06] blur-3xl" />
			<div className="absolute -bottom-48 -right-32 h-[24rem] w-[34rem] rounded-full bg-amber-400/[0.06] blur-3xl [.theme-neo_&]:hidden" />
			<div
				className="neo-only absolute inset-0 opacity-40"
				style={{
					backgroundImage:
						"linear-gradient(to right, #3a322a33 1px, transparent 1px), linear-gradient(to bottom, #3a322a33 1px, transparent 1px)",
					backgroundSize: "84px 84px",
				}}
			/>
			<div className="neo-only neo-grain absolute inset-0" />
		</div>
	);
}
