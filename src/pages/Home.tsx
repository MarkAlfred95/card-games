import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GAMES } from '../games'
import type { Game } from '../games'
import type { Suit } from '../game/types'
import type { CSSVars } from '../styleVars'
import { useWallet, formatUSD } from '../wallet'

// Neo-futuristic hub palette — void black base, bone cream type, reactor
// orange signal. Per-game accents live in games.ts.
const INK = '#0E0B09'
const PANEL = '#17130F'
const LINE = '#3A322A'
const CREAM = '#F2E7D3'
const ORANGE = '#F0521D'
const GRAY = '#8C8172'

// Flat, faceted suit marks (the standard glyphs are too curvy for this look).
function NeoSuit({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="currentColor">
      {suit === 'S' && (
        <path d="M50 4 L94 48 L94 72 L58 72 L70 94 L30 94 L42 72 L6 72 L6 48 Z" />
      )}
      {suit === 'H' && (
        <path d="M50 94 L6 50 L6 22 L26 6 L50 26 L74 6 L94 22 L94 50 Z" />
      )}
      {suit === 'D' && <path d="M50 4 L94 50 L50 96 L6 50 Z" />}
      {suit === 'C' && (
        <>
          <path d="M50 4 L69 23 L50 42 L31 23 Z" />
          <path d="M26 32 L45 51 L26 70 L7 51 Z" />
          <path d="M74 32 L93 51 L74 70 L55 51 Z" />
          <path d="M43 56 L57 56 L67 94 L33 94 Z" />
        </>
      )}
    </svg>
  )
}

function NeoPill({ accent }: { accent: string }) {
  return (
    <div
      className="flex flex-col items-center gap-0.5 rounded-full px-1.5 py-2.5 font-neo-tech text-[9px] leading-none font-semibold"
      style={{ background: accent, color: INK }}
      aria-hidden
    >
      <span>n</span>
      <span>e</span>
      <span>o</span>
    </div>
  )
}

export default function Home() {
  const { balance } = useWallet()
  const availableCount = GAMES.filter((g) => g.status === 'available').length

  return (
    <div
      className="neo-grain relative min-h-screen overflow-hidden font-neo-body"
      style={{ background: INK, color: CREAM }}
    >
      {/* Faint blueprint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `linear-gradient(to right, ${LINE}33 1px, transparent 1px), linear-gradient(to bottom, ${LINE}33 1px, transparent 1px)`,
          backgroundSize: '84px 84px',
        }}
      />
      {/* Oxide panel drifting behind the headline, like the reference cards */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 right-[8%] hidden h-80 w-80 border md:block"
        style={{ background: '#5E1F1055', borderColor: '#5E1F10' }}
      >
        <div className="neo-hatch absolute inset-6 opacity-30" style={{ color: ORANGE }} />
      </div>

      <div className="relative mx-auto max-w-6xl px-6 pb-16 pt-8">
        {/* HUD top bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between border-b pb-3 font-neo-tech text-[10px] uppercase tracking-[0.35em]"
          style={{ borderColor: LINE, color: GRAY }}
        >
          <span className="border-l-2 pl-2" style={{ borderColor: ORANGE }}>
            Card hub
          </span>
          <span className="hidden sm:block">Fil-casino protocol</span>
          <span className="border-r-2 pr-2" style={{ borderColor: ORANGE }}>
            v2.0
          </span>
        </motion.div>

        {/* Headline */}
        <motion.header
          className="relative py-12 sm:py-16"
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          <h1 className="font-neo-display text-[13vw] leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl">
            CARD
            <br />
            GAMES
            <span style={{ color: ORANGE }}>.</span>
          </h1>
          <div className="absolute right-0 top-14 sm:right-4 sm:top-20">
            <NeoPill accent={ORANGE} />
          </div>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-6">
            <p
              className="max-w-xs font-neo-tech text-[11px] uppercase leading-relaxed tracking-[0.25em]"
              style={{ color: GRAY }}
            >
              Filipino favorites
              <br />
              <span style={{ color: CREAM }}>&amp; casino classics</span>
            </p>

            <div aria-hidden className="neo-hatch h-3 w-16 opacity-60" style={{ color: ORANGE }} />

            {/* Wallet readout */}
            <div className="relative">
              <div className="neo-chamfer-sm absolute inset-0" style={{ background: LINE }} />
              <div
                className="neo-chamfer-sm relative m-px flex items-center gap-3 px-4 py-2.5"
                style={{ background: PANEL }}
              >
                <span
                  className="h-2 w-2 animate-pulse"
                  style={{ background: balance < 0 ? '#E5142E' : ORANGE }}
                />
                <span
                  className="font-neo-tech text-[10px] uppercase tracking-[0.3em]"
                  style={{ color: GRAY }}
                >
                  Wallet
                </span>
                <b
                  className="font-neo-display text-sm tabular-nums sm:text-base"
                  style={{ color: balance < 0 ? '#E5142E' : CREAM }}
                >
                  {formatUSD(balance)}
                </b>
              </div>
            </div>
          </div>
        </motion.header>

        {/* Game deck */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game, i) => (
            <GameTile key={game.id} game={game} index={i} total={GAMES.length} />
          ))}
        </div>

        <footer
          className="mt-14 flex items-center justify-center gap-4 font-neo-tech text-[10px] uppercase tracking-[0.35em]"
          style={{ color: GRAY }}
        >
          <span aria-hidden className="neo-hatch h-2.5 w-10 opacity-60" style={{ color: ORANGE }} />
          {String(availableCount).padStart(2, '0')} / {String(GAMES.length).padStart(2, '0')} tables
          online
          <span aria-hidden className="neo-hatch h-2.5 w-10 opacity-60" style={{ color: ORANGE }} />
        </footer>
      </div>
    </div>
  )
}

function GameTile({ game, index, total }: { game: Game; index: number; total: number }) {
  const available = game.status === 'available'
  const lead = game.preview[0]

  const tile = (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.07, duration: 0.45, ease: 'easeOut' }}
      className={`group relative h-full ${available ? 'cursor-pointer' : 'cursor-not-allowed'}`}
      style={{ '--tile-accent': game.accent } as CSSVars}
    >
      {/* Chamfered border layer; lights up in the game accent on hover */}
      <div
        className={`neo-chamfer absolute inset-0 transition-colors duration-300 ${
          available ? 'group-hover:bg-(--tile-accent)' : ''
        }`}
        style={{ background: LINE }}
      />
      <div className="neo-chamfer neo-grain absolute inset-px" style={{ background: PANEL }} />

      <div className={`relative flex h-full flex-col p-5 ${available ? '' : 'opacity-60'}`}>
        {/* Corner index, like "01 / 52" on the reference cards */}
        <div className="flex items-start justify-between">
          <div>
            <div className="font-neo-display text-3xl leading-none">{lead.rank}</div>
            <NeoSuit suit={lead.suit} className="mt-1.5 h-4 w-4 text-(--tile-accent)" />
          </div>
          <div className="text-right">
            <div aria-hidden className="mb-1.5 ml-auto h-px w-12" style={{ background: GRAY }} />
            <span className="font-neo-tech text-[11px] tracking-[0.2em]" style={{ color: GRAY }}>
              {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Big faceted suit mark over an offset accent panel */}
        <div className="relative my-4 flex h-36 items-center justify-center">
          <div
            aria-hidden
            className="absolute right-2 top-2 h-28 w-32 border bg-(--tile-accent) opacity-[0.13] transition-opacity duration-300 group-hover:opacity-25"
            style={{ borderColor: game.accent }}
          />
          <NeoSuit
            suit={lead.suit}
            className={`h-28 w-28 transition-transform duration-300 ${
              available ? 'group-hover:scale-105' : ''
            }`}
          />
          <div className="absolute -right-1 top-1/2 -translate-y-1/2">
            <NeoPill accent={available ? game.accent : GRAY} />
          </div>
          {!available && (
            <div
              aria-hidden
              className="neo-hatch absolute inset-0 opacity-15"
              style={{ color: GRAY }}
            />
          )}
        </div>

        {/* Nameplate */}
        <div aria-hidden className="mb-2 h-0.5 w-8 bg-(--tile-accent)" />
        <h2 className="font-neo-display text-lg uppercase leading-snug tracking-wide">
          {game.name}
        </h2>
        <p className="mt-1 font-neo-tech text-[11px] uppercase tracking-[0.25em] text-(--tile-accent)">
          {game.tagline}
        </p>
        <p className="mt-2.5 flex-1 text-sm leading-relaxed" style={{ color: GRAY }}>
          {game.description}
        </p>

        <div
          className="mt-5 flex items-center justify-between border-t pt-3"
          style={{ borderColor: LINE }}
        >
          <span
            className="font-neo-tech text-[10px] uppercase tracking-[0.25em]"
            style={{ color: GRAY }}
          >
            {game.players}
          </span>
          {available ? (
            <span className="flex items-center gap-1.5 font-neo-tech text-xs font-semibold uppercase tracking-[0.25em] text-(--tile-accent)">
              Enter
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                ▸
              </span>
            </span>
          ) : (
            <span
              className="font-neo-tech text-xs font-semibold uppercase tracking-[0.25em]"
              style={{ color: GRAY }}
            >
              Offline //
            </span>
          )}
        </div>
      </div>
    </motion.div>
  )

  return available ? (
    <Link
      to={game.path}
      className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F0521D]"
    >
      {tile}
    </Link>
  ) : (
    <div className="h-full" aria-disabled="true">
      {tile}
    </div>
  )
}
