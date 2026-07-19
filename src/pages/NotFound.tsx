import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/Card";
import type { CSSVars } from "../styleVars";

export default function NotFound() {
	return (
		// theme-neo supplies the --card-* variables the cards need.
		<div className="theme-neo relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0e0b09] px-6 text-[#f2e7d3]">
			{/* Ambient background glows */}
			<div aria-hidden className="pointer-events-none absolute inset-0">
				<div className="absolute -top-40 left-1/2 h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
				<div className="absolute -bottom-48 -right-32 h-[28rem] w-[38rem] rounded-full bg-violet-600/10 blur-3xl" />
			</div>

			<motion.div
				initial={{ opacity: 0, y: 24 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.45, ease: "easeOut" }}
				className="relative text-center"
			>
				{/* 4 - 0 - 4 as a fanned hand: two fours around a face-down card */}
				<div
					className="mb-8 flex items-end justify-center"
					style={{ "--card-w": "5.5rem" } as CSSVars}
				>
					{[
						<Card
							key="As"
							rank="A"
							suit="S"
							className="shadow-xl shadow-black/50"
						/>,
						<Card
							key="9h"
							rank="9"
							suit="H"
							className="shadow-xl shadow-black/50"
						/>,
						// <CardBack key="0" design="lattice" />,
						<Card
							key="5d"
							rank="5"
							suit="D"
							className="shadow-xl shadow-black/50"
						/>,
					].map((card, i) => (
						<div
							key={i}
							style={{
								marginLeft: i === 0 ? 0 : "-1.4rem",
								transform: `rotate(${(i - 1) * 12}deg) translateY(${Math.abs(i - 1) * 10}px)`,
								// zIndex: i === 1 ? 3 : i,
							}}
						>
							{card}
						</div>
					))}
				</div>

				<h1 className="font-display bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-bold tracking-tight leading-normal text-transparent sm:text-5xl">
					Page not found
				</h1>
				<p className="mx-auto mt-2 max-w-md text-slate-400">
					This table doesn&apos;t exist — the dealer has no idea what
					you&apos;re looking for.
				</p>

				<Link
					to="/"
					className="mt-8 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-5 py-2.5 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
				>
					Back to the lobby <span aria-hidden>→</span>
				</Link>
			</motion.div>
		</div>
	);
}
