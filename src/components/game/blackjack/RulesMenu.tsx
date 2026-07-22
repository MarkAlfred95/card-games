import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { TbHelp } from "react-icons/tb";

// Distance (px) below the trigger, and the min gap kept to the viewport edges.
const GAP = 8;
const MARGIN = 8;

// Quick-reference popover for the Blackjack rules. Same portal + clamped fixed
// positioning as the Lucky 9 RulesMenu, so it floats above the table and the
// action sheet instead of being trapped in their stacking context.
export default function RulesMenu({ themeClass }: { themeClass?: string }) {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState({ top: 0, left: 0 });
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Anchor the panel to the button's bottom-right, clamped inside the viewport.
	useLayoutEffect(() => {
		if (!open) return;
		function place() {
			const btn = buttonRef.current;
			const panel = menuRef.current;
			if (!btn || !panel) return;
			const rect = btn.getBoundingClientRect();
			const w = panel.offsetWidth;
			const h = panel.offsetHeight;
			const left = Math.min(
				Math.max(MARGIN, rect.right - w),
				window.innerWidth - w - MARGIN,
			);
			const top =
				rect.bottom + GAP + h > window.innerHeight - MARGIN
					? Math.max(MARGIN, window.innerHeight - MARGIN - h)
					: rect.bottom + GAP;
			setPos({ top, left });
		}
		place();
		window.addEventListener("resize", place);
		window.addEventListener("scroll", place, true);
		return () => {
			window.removeEventListener("resize", place);
			window.removeEventListener("scroll", place, true);
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent) {
			const target = e.target as Node;
			if (
				buttonRef.current?.contains(target) ||
				menuRef.current?.contains(target)
			)
				return;
			setOpen(false);
		}
		function onKeyDown(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	const rules: [string, string][] = [
		["Card values", "A = 1 or 11 · 2–9 = face value · 10, J, Q, K = 10."],
		["Goal", "Beat the dealer's total without going over 21 (a bust)."],
		["Blackjack", "A two-card 21 is a natural — it pays 3:2."],
		["Hit / Stand", "Draw another card, or stop and hold your total."],
		["Double down", "Double your bet, take exactly one card, then stand."],
		["Split", "A matching pair splits into two hands, each with its own bet."],
		["Insurance", "Dealer showing an Ace? Bet half your stake; it pays 2:1 if the dealer has blackjack."],
		["Dealer", "The dealer draws to 17 and stands on all 17s."],
	];

	return (
		<>
			<button
				ref={buttonRef}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="true"
				aria-expanded={open}
				title="How to play"
				className={`flex items-center rounded-lg p-2 text-xs font-medium ring-1 ring-white/10 transition ${
					open ? "bg-black/40" : "bg-black/25 hover:bg-black/35"
				}`}
			>
				<TbHelp className="h-4 w-4" />
			</button>
			{createPortal(
				<AnimatePresence>
					{open && (
						<motion.div
							ref={menuRef}
							initial={{ opacity: 0, y: -8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: -8 }}
							transition={{ duration: 0.15, ease: "easeOut" }}
							className={`fixed z-999 rounded-xl border p-4 shadow-xl backdrop-blur ${themeClass ?? ""}`}
							style={{
								top: pos.top,
								left: pos.left,
								width: "min(22rem, calc(100vw - 16px))",
								backgroundColor:
									"color-mix(in srgb, var(--table-felt-2) 92%, black)",
								borderColor:
									"color-mix(in srgb, var(--ui-text) 18%, transparent)",
								color: "var(--ui-text)",
							}}
						>
							<h3 className="font-display text-lg font-semibold tracking-tight">
								How Blackjack works
							</h3>
							<dl className="mt-3 space-y-2.5">
								{rules.map(([term, text]) => (
									<div key={term}>
										<dt
											className="hud-label text-xs font-bold uppercase tracking-wide"
											style={{
												color: "color-mix(in srgb, var(--hud-accent) 75%, white)",
											}}
										>
											{term}
										</dt>
										<dd className="text-sm opacity-80">
											{text}
										</dd>
									</div>
								))}
							</dl>
						</motion.div>
					)}
				</AnimatePresence>,
				document.body,
			)}
		</>
	);
}
