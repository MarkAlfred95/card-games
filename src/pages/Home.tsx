import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GAMES } from '../games'
import type { Game } from '../games'
import type { Suit } from '../game/types'
import Card from '../components/Card'
import CardBack from '../components/CardBack'
import type { CSSVars } from '../styleVars'
import { useWallet, formatUSD } from '../wallet'

const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

const HEADER_SUITS: { symbol: string; color: string }[] = [
  { symbol: '♠', color: '#94a3b8' },
  { symbol: '♥', color: '#f87171' },
  { symbol: '♦', color: '#f87171' },
  { symbol: '♣', color: '#94a3b8' },
]

export default function Home() {
  const { balance } = useWallet()
  const availableCount = GAMES.filter((g) => g.status === 'available').length

  return (
    // theme-classic supplies the --card-* variables the preview cards need.
    <div className="theme-classic relative min-h-screen overflow-hidden bg-[#0b1120] text-slate-100">
      {/* Ambient background glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[34rem] w-[54rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="absolute -bottom-48 -right-32 h-[28rem] w-[38rem] rounded-full bg-violet-600/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[24rem] w-[32rem] rounded-full bg-cyan-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 py-14">
        <motion.header
          className="mb-12 text-center"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <div className="mb-4 flex items-center justify-center gap-3 text-xl">
            {HEADER_SUITS.map((s) => (
              <span key={s.symbol} style={{ color: s.color }}>
                {s.symbol}
              </span>
            ))}
          </div>
          <h1 className="font-display bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-6xl">
            Card Games
          </h1>
          <p className="mt-4 text-slate-400">
            Filipino favorites and casino classics — pick a table and play.
          </p>
          <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.06] px-5 py-2.5 shadow-lg shadow-black/20 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
            <span className="text-sm text-slate-400">Wallet</span>
            <b className={`text-lg tabular-nums ${balance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
              {formatUSD(balance)}
            </b>
          </div>
        </motion.header>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game, i) => (
            <GameTile key={game.id} game={game} index={i} />
          ))}
        </div>

        <footer className="mt-14 text-center text-xs tracking-wide text-slate-500">
          {availableCount} of {GAMES.length} games playable — more on the way
        </footer>
      </div>
    </div>
  )
}

function GameTile({ game, index }: { game: Game; index: number }) {
  const available = game.status === 'available'
  // Accents are tuned for banners, not text on dark — lift them for legibility.
  const accentText = `color-mix(in srgb, ${game.accent} 60%, white)`

  const tile = (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.45, ease: 'easeOut' }}
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] transition-[border-color,background-color,box-shadow,translate] duration-300 ${
        available
          ? 'cursor-pointer hover:-translate-y-1.5 hover:border-white/25 hover:bg-white/[0.07] hover:shadow-2xl hover:shadow-black/50'
          : 'cursor-not-allowed opacity-60 saturate-50'
      }`}
    >
      {/* Card fan banner */}
      <div
        className="relative flex h-40 items-center justify-center overflow-hidden"
        style={{ background: `linear-gradient(155deg, ${game.accent} -20%, #0b1120 90%)` }}
      >
        <span
          aria-hidden
          className="absolute -right-4 -top-7 select-none text-[7.5rem] leading-none text-white/[0.07] transition-transform duration-500 group-hover:rotate-12"
        >
          {SUIT_GLYPH[game.preview[0].suit]}
        </span>

        <div
          aria-hidden
          className="absolute h-24 w-40 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-70"
          style={{ background: game.accent }}
        />

        <div
          className="relative flex transition-transform duration-300 group-hover:scale-110"
          style={{ '--card-w': '3.6rem' } as CSSVars}
        >
          {game.preview.map((c, i) => (
            <div
              key={i}
              className="transition-transform duration-300 group-hover:-translate-y-1.5"
              style={{
                marginLeft: i === 0 ? 0 : '-1.05rem',
                transform: `rotate(${(i - 1) * 10}deg) translateY(${Math.abs(i - 1) * 7}px)`,
                zIndex: i,
              }}
            >
              {available ? (
                <Card rank={c.rank} suit={c.suit} className="shadow-lg shadow-black/40" />
              ) : (
                <CardBack design="lattice" />
              )}
            </div>
          ))}
        </div>

        {!available && (
          <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-slate-300 backdrop-blur">
            Coming soon
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold tracking-tight">{game.name}</h2>
          <span className="whitespace-nowrap rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-slate-400 ring-1 ring-white/10">
            {game.players}
          </span>
        </div>
        <p
          className="mt-1 text-xs font-semibold uppercase tracking-wider"
          style={{ color: accentText }}
        >
          {game.tagline}
        </p>
        <p className="mt-2.5 flex-1 text-sm leading-relaxed text-slate-400">{game.description}</p>

        <div className="mt-5">
          {available ? (
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-amber-300 to-amber-500 px-4 py-2 text-sm font-bold text-slate-900 shadow-lg shadow-amber-500/20 transition-all duration-300 group-hover:shadow-amber-400/40 group-hover:brightness-110">
              Play now
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-500">
              Not yet available
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )

  return available ? (
    <Link
      to={game.path}
      className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70"
    >
      {tile}
    </Link>
  ) : (
    <div className="h-full" aria-disabled="true">
      {tile}
    </div>
  )
}
