import { useId } from 'react'

// Evenly spaced polka dots. Stretches to fill its container.
export default function Dots({ color = 'currentColor' }: { color?: string }) {
  const id = useId()
  return (
    <svg viewBox="0 0 50 70" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <pattern id={id} width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="4" cy="4" r="1.6" fill={color} />
        </pattern>
      </defs>
      <rect width="50" height="70" fill={`url(#${id})`} />
    </svg>
  )
}
