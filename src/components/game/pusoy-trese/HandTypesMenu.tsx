import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TbHelp } from "react-icons/tb";
import HandTypes from "../../HandTypes";

// Distance (px) below the trigger, and the min gap kept to the viewport edges.
const GAP = 8;
const MARGIN = 8;

// Hand-types reference popover. Like SettingsMenu, the panel is portaled onto
// document.body and positioned with fixed coordinates anchored to the trigger,
// so it floats above the poker table / arrange sheet instead of being trapped in
// their stacking context. The panel is tall, so its position is clamped to the
// viewport (it scrolls internally past that).
export default function HandTypesMenu({ themeClass }: { themeClass?: string }) {
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

	return (
		<>
			<button
				ref={buttonRef}
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="true"
				aria-expanded={open}
				title="Hand types"
				className={`flex items-center rounded-lg p-2 text-xs font-medium ring-1 ring-white/10 transition ${
					open ? "bg-black/40" : "bg-black/25 hover:bg-black/35"
				}`}
			>
				<TbHelp className="h-4 w-4" />
			</button>
			{open &&
				createPortal(
					<div
						ref={menuRef}
						className={`fixed z-999 shadow-xl ${themeClass ?? ""}`}
						style={{
							top: pos.top,
							left: pos.left,
							width: "min(25rem, calc(100vw - 16px))",
						}}
					>
						<HandTypes open />
					</div>,
					document.body,
				)}
		</>
	);
}
