import { Link } from "react-router-dom";
import { LuArrowLeft } from "react-icons/lu";
import { formatUSD } from "../../../wallet";
import { THEMES } from "../../../themes";
import type { ThemeKey } from "../../../themes";
import type { BackKey } from "../../../cardbacks";
import type { MusicKey } from "../../../music";
import type { VoiceKey } from "../../../voice";
import type { AudioLevels } from "../../../audioPrefs";
import SettingsMenu from "./SettingsMenu";
import Picker from "./Picker";
import Slider from "./Slider";

export type { AudioLevels };

interface HeaderProps {
	theme: ThemeKey;
	setTheme: (t: ThemeKey) => void;
	back: BackKey;
	setBack: (b: BackKey) => void;
	themeOptions: [ThemeKey, string][];
	backOptions: [BackKey, string][];
	balance: number;
	// Active spending division label, e.g. "$10K" — shown as a badge when set.
	division?: string;
	// Background music selector — shown only when the page wires it up.
	music?: MusicKey;
	setMusic?: (m: MusicKey) => void;
	musicOptions?: [MusicKey, string][];
	// Dealer voice toggle — shown only when the page wires it up.
	voice?: VoiceKey;
	setVoice?: (v: VoiceKey) => void;
	// Volume sliders — shown only when the page wires them up.
	volumes?: AudioLevels;
	onVolume?: (channel: keyof AudioLevels, value: number) => void;
}

export default function Header({
	theme,
	setTheme,
	back,
	setBack,
	themeOptions,
	backOptions,
	balance,
	division,
	music,
	setMusic,
	musicOptions,
	voice,
	setVoice,
	volumes,
	onVolume,
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
					<h1 className="font-display text-2xl font-semibold tracking-tight">
						Pusoy Trese
					</h1>
					{division && (
						<span
							className="rounded-full bg-amber-400/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/40"
							title="Spending division"
						>
							{division}
						</span>
					)}
				</div>
				<div className="ml-auto flex items-center gap-3">
					<div className="hidden sm:flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm backdrop-blur">
						<span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
						<span className="opacity-60">Balance</span>
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
						{music !== undefined && setMusic && musicOptions && (
							<Picker
								label="Background music"
								options={musicOptions}
								value={music}
								onChange={setMusic}
							/>
						)}
						{volumes && onVolume && (
							<Slider
								label="Music volume"
								value={volumes.music}
								onChange={(v) => onVolume("music", v)}
							/>
						)}
						{voice !== undefined && setVoice && (
							<Picker
								label="Dealer voice"
								options={[
									["on", "On"],
									["off", "Off"],
								]}
								value={voice}
								onChange={setVoice}
							/>
						)}
						{volumes && onVolume && (
							<>
								<Slider
									label="Voice volume"
									value={volumes.voice}
									onChange={(v) => onVolume("voice", v)}
								/>
								<Slider
									label="Effects volume"
									value={volumes.sfx}
									onChange={(v) => onVolume("sfx", v)}
								/>
							</>
						)}
					</SettingsMenu>
				</div>
			</div>
		</header>
	);
}
