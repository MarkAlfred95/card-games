interface PickerProps<T extends string> {
	label: string;
	options: [T, string][];
	value: T;
	onChange: (value: T) => void;
}

// Generic segmented toggle. Used for both the Theme and Card back selectors.
export default function Picker<T extends string>({
	label,
	options,
	value,
	onChange,
}: PickerProps<T>) {
	return (
		<div className="flex flex-col justify-center gap-1">
			<span className="text-sm opacity-70">{label}</span>
			<div className="w-fit flex gap-1 rounded-lg bg-black/20 p-1">
				{options.map(([key, text]) => (
					<button
						key={key}
						onClick={() => onChange(key)}
						className={`rounded-md px-3 py-1.5 text-sm font-medium cursor-pointer transition ${
							value === key
								? "bg-white/90 text-slate-900"
								: "text-white/80 hover:bg-white/10"
						}`}
					>
						{text}
					</button>
				))}
			</div>
		</div>
	);
}
