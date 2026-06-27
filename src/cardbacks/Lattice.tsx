import { useId } from 'react'

// Diagonal cross-hatch lattice. Stretches to fill its container.
export default function Lattice({ color = 'currentColor' }: { color?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 50 70" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <pattern id={id} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="7" stroke={color} strokeWidth="1.4" />
          <line x1="0" y1="0" x2="7" y2="0" stroke={color} strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect width="50" height="70" fill={`url(#${id})`} />
    </svg>
  )
}
