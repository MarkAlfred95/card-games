// Theme registry. Every theme is a color palette over the shared
// neo-futuristic skin: `theme-neo` is the base class carrying the fonts and
// HUD chrome (and the default Reactor palette); the other entries stack a
// palette-override class on top of it. Classes live in index.css.

export interface ThemeMeta {
  label: string
  className: string
}

export const THEMES = {
  neo: { label: 'Reactor', className: 'theme-neo' },
  ice: { label: 'Cold Circuit', className: 'theme-neo theme-ice' },
  acid: { label: 'Acid Protocol', className: 'theme-neo theme-acid' },
  redline: { label: 'Redline Mono', className: 'theme-neo theme-redline' },
} satisfies Record<string, ThemeMeta>

export type ThemeKey = keyof typeof THEMES

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]
