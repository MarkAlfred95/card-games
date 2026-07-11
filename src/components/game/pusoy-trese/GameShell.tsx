import type { ReactNode } from "react";

// Shared page frame for every Pusoy Trese screen: the themed felt background
// with the top bar pinned to the viewport. The bar is translucent + blurred,
// so page content scrolls underneath it and shows through. Rendering the
// shell at the root of every screen keeps the Header mounted across phase
// changes instead of remounting per screen.
//
// Note: the frame uses overflow-x-clip (not overflow-hidden) — a hidden
// overflow would create a scroll container and break `position: sticky`.
export default function GameShell({
	themeClass,
	header,
	children,
}: {
	themeClass: string;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className={`${themeClass} min-h-dvh text-[color:var(--ui-text)]`}>
			<div
				className="relative flex min-h-dvh w-full flex-col overflow-x-clip"
				style={{
					background:
						"radial-gradient(ellipse at 50% 0%, var(--table-felt), var(--table-felt-2))",
				}}
			>
				<div className="sticky top-0 z-40">{header}</div>
				<div className="relative flex flex-1 flex-col">{children}</div>
			</div>
		</div>
	);
}
