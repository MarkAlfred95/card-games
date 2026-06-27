import type { CSSProperties } from 'react'

// Inline style that also permits CSS custom properties (e.g. `--card-w`), which
// React's CSSProperties type rejects by default.
export type CSSVars = CSSProperties & Record<`--${string}`, string | number>
