// Centered concentric-rings emblem with a framing border.
// Keeps its aspect ratio (circles stay round).
export default function Rings({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg viewBox="0 0 50 70" preserveAspectRatio="xMidYMid meet" className="h-full w-full">
      <rect x="2.5" y="2.5" width="45" height="65" rx="3.5" fill="none" stroke={color} strokeWidth="1.4" />
      <g fill="none" stroke={color} strokeWidth="1.4">
        <circle cx="25" cy="35" r="6" />
        <circle cx="25" cy="35" r="11" />
        <circle cx="25" cy="35" r="16" />
      </g>
    </svg>
  )
}
