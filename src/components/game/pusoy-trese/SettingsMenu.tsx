import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { LuSettings } from "react-icons/lu";

// Distance (px) between the trigger button and the dropdown, matching mt-2.
const GAP = 8;

// Dropdown that holds the cosmetic Pickers. Closes on outside-click / Escape.
// The panel is rendered into a portal on document.body and positioned with
// fixed coordinates anchored to the trigger, so it floats above the poker table
// (which otherwise traps it in a lower stacking context).
export default function SettingsMenu({
	children,
	themeClass,
}: {
	children: ReactNode;
	// Theme class carried onto the portal so the panel's CSS variables
	// (--table-felt-2 / --ui-text) resolve outside the themed page subtree.
	themeClass?: string;
}) {
	const [open, setOpen] = useState(false);
	const [pos, setPos] = useState({ top: 0, right: 0 });
	const buttonRef = useRef<HTMLButtonElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	// Position the panel below the button, right edges aligned.
	useLayoutEffect(() => {
		if (!open) return;
		function place() {
			const btn = buttonRef.current;
			if (!btn) return;
			const rect = btn.getBoundingClientRect();
			setPos({
				top: rect.bottom + GAP,
				right: window.innerWidth - rect.right,
			});
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

	return (
		<>
			<button
				ref={buttonRef}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="true"
				aria-expanded={open}
				title="Settings"
				className={`flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2 text-sm font-medium transition border cursor-pointer border-white/20 ${
					open
						? "bg-white/90 text-slate-900"
						: "bg-black/30 text-white/80 hover:bg-black/40"
				}`}
			>
				<LuSettings className="h-5 w-5" aria-hidden="true" />
				<span className="hidden sm:block">Settings</span>
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
							className={`fixed z-999 flex flex-col gap-4 rounded-xl border p-4 shadow-xl backdrop-blur ${themeClass ?? ""}`}
							style={{
								top: pos.top,
								right: pos.right,
								backgroundColor:
									"color-mix(in srgb, var(--table-felt-2) 92%, black)",
								borderColor:
									"color-mix(in srgb, var(--ui-text) 18%, transparent)",
								color: "var(--ui-text)",
							}}
						>
							{children}
						</motion.div>
					)}
				</AnimatePresence>,
				document.body,
			)}
		</>
	);
}
