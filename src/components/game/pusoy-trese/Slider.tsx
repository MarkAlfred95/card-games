interface SliderProps {
	label: string;
	// 0..1
	value: number;
	onChange: (value: number) => void;
}

// Volume slider for the settings menu, visually paired with Picker.
export default function Slider({ label, value, onChange }: SliderProps) {
	const pct = Math.round(value * 100);
	return (
		<div className="flex flex-col justify-center gap-1">
			<span className="flex items-baseline justify-between text-sm opacity-70">
				{label}
				<span className="text-xs tabular-nums opacity-80">{pct}%</span>
			</span>
			<div className="flex items-center rounded-lg bg-black/20 px-3 py-2">
				<input
					type="range"
					min={0}
					max={100}
					value={pct}
					onChange={(e) => onChange(Number(e.target.value) / 100)}
					className="w-full cursor-pointer accent-amber-400"
					aria-label={`${label} volume`}
				/>
			</div>
		</div>
	);
}
