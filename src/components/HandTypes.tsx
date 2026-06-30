import Card from "./Card";

interface HandTypesProps {
	open?: boolean;
}

function HandTypes({ open = true }: HandTypesProps) {
	return (
		<div
			className={`w-full max-w-full lg:w-100 max-h-[75.5dvh] flex flex-col overflow-hidden shrink-0 rounded-lg bg-black/25 text-sm ring-1 ring-white/10 ${
				!open ? "max-lg:hidden" : ""
			}`}
			style={{ "--card-w": "clamp(2.8rem, 1rem + 2.2vw, 5.25rem)" } as React.CSSProperties & Record<string, string>}
		>
				<h2 className="text-lg font-semibold p-4 border-b border-white/10">
					Hand Types
				</h2>

				<div className="flex flex-col p-4 gap-2 overflow-y-auto">
					{/* Straight Flush */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">
									Straight Flush
								</span>
								<span className="text-xs opacity-70 font-light italic">
									Straight and all cards are same suit
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								8
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="6" suit="H" />
							<Card rank="7" suit="H" />
							<Card rank="8" suit="H" />
							<Card rank="9" suit="H" />
							<Card rank="10" suit="H" />
						</div>
					</div>

					{/* Four of a Kind */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">
									Four of a Kind
								</span>
								<span className="text-xs opacity-70 font-light italic">
									Four cards with the same rank
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								7
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="9" suit="S" />
							<Card rank="9" suit="H" />
							<Card rank="9" suit="D" />
							<Card rank="9" suit="C" />
							<Card rank="K" suit="S" />
						</div>
					</div>

					{/* Full House */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">Full House</span>
								<span className="text-xs opacity-70 font-light italic">
									Three of a kind plus a pair
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								6
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="10" suit="S" />
							<Card rank="10" suit="H" />
							<Card rank="10" suit="D" />
							<Card rank="4" suit="C" />
							<Card rank="4" suit="H" />
						</div>
					</div>

					{/* Flush */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">Flush</span>
								<span className="text-xs opacity-70 font-light italic">
									Five cards with the same suit
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								5
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="A" suit="D" />
							<Card rank="J" suit="D" />
							<Card rank="8" suit="D" />
							<Card rank="5" suit="D" />
							<Card rank="2" suit="D" />
						</div>
					</div>

					{/* Straight */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">Straight</span>
								<span className="text-xs opacity-70 font-light italic">
									Five cards in consecutive order
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								4
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="5" suit="S" />
							<Card rank="6" suit="H" />
							<Card rank="7" suit="D" />
							<Card rank="8" suit="C" />
							<Card rank="9" suit="S" />
						</div>
					</div>

					{/* Three of a Kind */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">
									Three of a Kind
								</span>
								<span className="text-xs opacity-70 font-light italic">
									Three cards with the same rank
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								3
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="7" suit="S" />
							<Card rank="7" suit="H" />
							<Card rank="7" suit="C" />
							<Card rank="K" suit="D" />
							<Card rank="2" suit="H" />
						</div>
					</div>

					{/* Two Pair */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">Two Pair</span>
								<span className="text-xs opacity-70 font-light italic">
									Two different pairs
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								2
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="Q" suit="S" />
							<Card rank="Q" suit="H" />
							<Card rank="8" suit="D" />
							<Card rank="8" suit="C" />
							<Card rank="3" suit="S" />
						</div>
					</div>

					{/* One Pair */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">One Pair</span>
								<span className="text-xs opacity-70 font-light italic">
									Two cards with the same rank
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								1
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="J" suit="S" />
							<Card rank="J" suit="D" />
							<Card rank="9" suit="H" />
							<Card rank="5" suit="C" />
							<Card rank="2" suit="S" />
						</div>
					</div>

					{/* High Card */}
					<div className="w-full flex flex-col p-2 border border-white/10 rounded-lg gap-2">
						<div className="flex justify-between items-center">
							<div className="flex flex-col">
								<span className="font-medium">High Card</span>
								<span className="text-xs opacity-70 font-light italic">
									No combination, highest card wins
								</span>
							</div>
							<div className="w-8 h-8 rounded-full border p-2 grid place-items-center text-xs font-bold">
								0
							</div>
						</div>
						<div className="w-full mt-3 flex gap-1">
							<Card rank="A" suit="S" />
							<Card rank="10" suit="H" />
							<Card rank="7" suit="C" />
							<Card rank="4" suit="D" />
							<Card rank="2" suit="S" />
						</div>
					</div>
				</div>
		</div>
	);
}

export default HandTypes;
