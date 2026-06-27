// Card-back registry. Add a back: create a <Design color /> SVG component in
// this folder and register it here — the picker and <CardBack> pick it up.
import type { ComponentType } from 'react'
import Lattice from './Lattice'
import Dots from './Dots'
import Rings from './Rings'

export interface BackEntry {
  label: string
  Component: ComponentType<{ color?: string }>
}

export const BACKS = {
  lattice: { label: 'Lattice', Component: Lattice },
  dots: { label: 'Dots', Component: Dots },
  rings: { label: 'Rings', Component: Rings },
} satisfies Record<string, BackEntry>

export type BackKey = keyof typeof BACKS

export const BACK_KEYS = Object.keys(BACKS) as BackKey[]
