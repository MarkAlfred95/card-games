import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { LuSettings } from "react-icons/lu";

// Dropdown that holds the cosmetic Pickers. Closes on outside-click / Escape.
export default function SettingsMenu({ children }: { children: ReactNode }) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function onPointerDown(e: PointerEvent) {
			if (ref.current && !ref.current.contains(e.target as Node))
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
		<div ref={ref} className="relative">
			<button
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
			{open && (
				<div
					className="absolute right-0 top-full z-999 mt-2 flex flex-col gap-4 rounded-xl border p-4 shadow-xl backdrop-blur"
					style={{
						backgroundColor:
							"color-mix(in srgb, var(--table-felt-2) 92%, black)",
						borderColor:
							"color-mix(in srgb, var(--ui-text) 18%, transparent)",
						color: "var(--ui-text)",
					}}
				>
					{children}
				</div>
			)}
		</div>
	);
}
