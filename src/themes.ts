// Theme registry. Each theme is a CSS class (defined in index.css) that
// overrides the --card-* / --table-* CSS variables.

export interface ThemeMeta {
  label: string
  className: string
}

export const THEMES = {
  classic: { label: 'Classic', className: 'theme-classic' },
  midnight: { label: 'Midnight', className: 'theme-midnight' },
  crimson: { label: 'Crimson', className: 'theme-crimson' },
  ocean: { label: 'Ocean', className: 'theme-ocean' },
} satisfies Record<string, ThemeMeta>

export type ThemeKey = keyof typeof THEMES

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[]
