import { Link } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { formatUSD } from "../../../wallet";
import { THEMES } from "../../../themes";
import type { ThemeKey } from "../../../themes";
import type { BackKey } from "../../../cardbacks";
import SettingsMenu from "./SettingsMenu";
import Picker from "./Picker";

interface HeaderProps {
	theme: ThemeKey;
	setTheme: (t: ThemeKey) => void;
	back: BackKey;
	setBack: (b: BackKey) => void;
	themeOptions: [ThemeKey, string][];
	backOptions: [BackKey, string][];
	balance: number;
}

export default function Header({
	theme,
	setTheme,
	back,
	setBack,
	themeOptions,
	backOptions,
	balance,
}: HeaderProps) {
	return (
		<header className="w-full flex flex-wrap items-center justify-center gap-x-8 gap-y-4 bg-black/35 px-4 sm:px-6 py-4 backdrop-blur">
			<div className="flex w-full max-w-375 items-center gap-3">
				<div className="flex items-center gap-3">
					<Link
						to="/"
						className="flex items-center gap-1.5 rounded-xl bg-black/30 px-3 py-2 text-sm font-medium transition hover:bg-black/40 border border-white/20"
						title="Back to games"
					>
						<LuArrowLeft className="h-5 w-5" />{" "}
						<span className="hidden sm:block">Games</span>
					</Link>
					<h1 className="text-xl font-semibold tracking-tight">
						Pusoy Trese
					</h1>
				</div>
				<div className="ml-auto flex items-center gap-3">
					<div className="rounded-md hidden sm:block bg-black/25 px-4 p-2 text-sm">
						<span className="opacity-60">Balance</span>{" "}
						<b
							className={`tabular-nums ${balance < 0 ? "text-red-300" : "text-emerald-300"}`}
						>
							{formatUSD(balance)}
						</b>
					</div>
					<SettingsMenu themeClass={THEMES[theme].className}>
						<Picker
							label="Theme"
							options={themeOptions}
							value={theme}
							onChange={setTheme}
						/>
						<Picker
							label="Card back"
							options={backOptions}
							value={back}
							onChange={setBack}
						/>
					</SettingsMenu>
				</div>
			</div>
		</header>
	);
}
