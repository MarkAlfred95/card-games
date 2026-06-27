import { Link } from 'react-router-dom'
import { GAMES } from '../games'
import type { Game } from '../games'
import Card from '../components/Card'
import CardBack from '../components/CardBack'
import type { CSSVars } from '../styleVars'

export default function Home() {
  return (
    // theme-classic supplies the --card-* variables the preview cards need.
    <div
      className="theme-classic min-h-screen text-slate-100"
      style={{
        background: 'radial-gradient(ellipse at 50% -10%, #1e3a2f, #0b1120 60%)',
      }}
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Card Games</h1>
          <p className="mt-3 text-slate-400">Pick a game to play — more on the way.</p>
        </header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <GameTile key={game.id} game={game} />
          ))}
        </div>
      </div>
    </div>
  )
}

function GameTile({ game }: { game: Game }) {
  const available = game.status === 'available'

  const tile = (
    <div
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl ring-1 ring-white/10 transition ${
        available
          ? 'cursor-pointer hover:-translate-y-1 hover:shadow-2xl hover:ring-white/30'
          : 'cursor-not-allowed opacity-70'
      }`}
    >
      {/* Card fan banner */}
      <div
        className="relative flex h-36 items-center justify-center"
        style={{ background: `linear-gradient(160deg, ${game.accent}, #0b1120)` }}
      >
        <div className="flex" style={{ '--card-w': '3.4rem' } as CSSVars}>
          {game.preview.map((c, i) => (
            <div
              key={i}
              className="transition-transform group-hover:-translate-y-1"
              style={{
                marginLeft: i === 0 ? 0 : '-1rem',
                transform: `rotate(${(i - 1) * 9}deg) translateY(${Math.abs(i - 1) * 6}px)`,
                zIndex: i,
              }}
            >
              {available ? (
                <Card rank={c.rank} suit={c.suit} />
              ) : (
                <CardBack design="lattice" />
              )}
            </div>
          ))}
        </div>

        {!available && (
          <span className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide">
            Coming soon
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col bg-white/5 p-5 backdrop-blur">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">{game.name}</h2>
          <span className="text-xs text-slate-400">{game.players}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium" style={{ color: game.accent }}>
          {game.tagline}
        </p>
        <p className="mt-2 flex-1 text-sm text-slate-300">{game.description}</p>

        <div className="mt-4">
          {available ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-slate-900 transition group-hover:bg-amber-300">
              Play →
            </span>
          ) : (
            <span className="inline-flex items-center rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-slate-400">
              Not yet available
            </span>
          )}
        </div>
      </div>
    </div>
  )

  return available ? (
    <Link to={game.path} className="h-full">
      {tile}
    </Link>
  ) : (
    <div className="h-full" aria-disabled="true">
      {tile}
    </div>
  )
}
