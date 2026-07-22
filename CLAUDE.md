# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server (HMR). Set `PORT` env to pin a port (`strictPort`); otherwise Vite picks one. A Vite plugin (in `vite.config.ts`) also mounts the `/api/*` multiplayer backend as dev middleware, so online modes work locally against an in-memory room store — no external services needed for local dev (see **Online multiplayer** below).
- `npm run build` — type-check the whole project (`tsc -b`) then build (`vite build`). Build fails on type errors.
- `npm run typecheck` — `tsc -b` only, no bundle.
- `npm run lint` — Oxlint (not ESLint). Config in `.oxlintrc.json`; enforces `react/rules-of-hooks` and `react/only-export-components`.
- `npm run preview` — serve the production build.

There is **no unit test runner**. `verify-poker.js` is an ad-hoc Playwright smoke script (requires a running dev server on the port hardcoded inside it and `playwright` installed globally) — it is not wired into npm scripts and its screenshot paths are stale. Prefer the `preview_*` tools for verifying UI changes.

## Architecture

A single-page React 19 + TypeScript + Vite app: a hub of Filipino/casino card games. Styling is **Tailwind CSS v4** (via `@tailwindcss/vite`, no `tailwind.config` — configured in CSS) plus CSS custom properties for theming. Animation via `framer-motion`, drag-and-drop via `@dnd-kit/core`, routing via `react-router-dom` v7.

### Game registry drives routing

`src/games.ts` is the single source of truth. Each `Game` entry has metadata, a `path`, a `status` (`available` | `coming-soon`), and an optional `component`. `src/App.tsx` maps `AVAILABLE_GAMES` (status === 'available') into `<Route>`s automatically; `src/pages/Home.tsx` renders a tile per game. **To add or enable a game, edit `games.ts`** — do not hand-wire single-player routes there.

Currently five games are `available`: **Pusoy Trese** (eager static import), **Lucky 9**, **Texas Hold'em (poker)**, **Blackjack**, and **Tongits** (all but Pusoy Trese `lazy()`-loaded). **Pusoy Dos** is `coming-soon` (no component). **Blackjack** is single-player only — unlike the three below, it has no online counterpart. The one intentional exception to "don't hand-wire routes": the online/multiplayer sub-routes (`/games/pusoy-trese/online`, `/games/lucky-nine/online`, `/games/tongits/online`) are hand-wired in `App.tsx` precisely because they must NOT be registry entries — that keeps them off the Home page's game-tile grid.

### Shared vs. per-game code

- `src/game/` — pure, framework-free game logic (no React). Shared domain types live in `types.ts` (`Card`, `Rank`, `Suit`, `HandEval`, etc.); shared deck ops in `deck.ts` (`buildDeck`, `shuffle`, `deal`). Card ids are `` `${rank}${suit}` `` (e.g. `10S`). `RANKS` is ordered low→high so array index doubles as strength.
- Four game engines coexist here, each self-contained:
  - **Pusoy Trese** (13-card Chinese poker): `ranking.ts` (`evaluate`, `compareHands`, `CATEGORY`), `scoring.ts` (`scoreRound`, `scoreBanker` — zero-sum banker settlement with royalties/sweep bonuses), `naturals.ts` (`detectNatural`, `Natural` type — special auto-win 13-card hands; consumed by `scoring.ts`), `bot.ts` (`arrangeBot`). `evaluate` handles both 5-card and 3-card (front) hands.
  - **Lucky 9** (Filipino baccarat): `lucky9.ts` (`handValue` — mod-10 totals with A=1 and 10/face=0, `natural` — two-card 8/9, `botWantsCard`, `settleRound` — even-money banker settlement where a winning Lucky 9 pays double).
  - **Texas Hold'em**: `pokerEngine.ts` (state machine: `createInitialState` → `dealHand` → `applyAction` → `advanceStreet` → `resolveShowdown` → `prepareNextHand`, with side-pot construction), `pokerEval.ts` (`best5from7`), `pokerBot.ts` (`decideBotAction` with personalities), `pokerTypes.ts`. `resolveShowdown` reuses `compareHands` from the Pusoy Trese `ranking.ts`.
  - **Blackjack** (single-player heads-up 21): `blackjack.ts` (`handTotal` — ace-aware best-≤21 with a `soft` flag, `isBlackjack`/`isBust`/`canSplit`, `dealerShouldHit` — stands on 17, `playDealer`, `settleHand` — per-hand result with 3:2 natural payout). No online/`server/` counterpart; the page (`Blackjack.tsx`) owns the split/insurance/double state machine.
  - **Tongits** (3-player Filipino rummy): `tongits.ts` (ace-LOW rank order `TONGITS_RANK_ORDER`, meld validation `meldTypeOf`/`extendMeld`, `bestArrangement` deadwood search, turn state machine `createRound` → `drawFromStock`/`takeFromDiscard` → `layMeld`/`sapaw` → `discardCard`, with Tongits/stockout/fight endings and zero-sum `bet`-unit settlement — illegal actions throw player-facing `Error`s), `tongitsBot.ts` (`decideDraw`/`decideAct`/`decideFight`, one action per call so the page can animate each step).
- `src/components/` — shared card UI (`Card`, `CardBack`, `DraggableCard`, `DropZone`). Game-specific components are nested under `src/components/game/<game>/` with a barrel `index.ts` (e.g. `pusoy-trese/` exports `Header`, `PokerTable`, `BettingGate` and its rule constants from `constants.ts`). The `Header`/`GameShell` chrome is built in `pusoy-trese/` and re-exported by `lucky-nine/index.ts`, so those two games share one shell.
- `src/pages/` — the page components: `Home.tsx`, `NotFound.tsx`, and per game `PusoyTrese.tsx`, `Poker.tsx`, `Lucky9.tsx`, `Tongits.tsx`, plus the online counterparts `PusoyTreseOnline.tsx`, `Lucky9Online.tsx`, `TongitsOnline.tsx`. Several games therefore have both a single-player page and an online page. Single-player pages own all game state via `useState` and orchestrate the pure engine functions. The engines return new state; pages never let the engine touch React.

### The engines are immutable state reducers

`pokerEngine.ts`, `scoring.ts`, `tongits.ts`, and `lucky9.ts` are all pure: they take state/inputs and return **new** objects (spread/map, never mutate). Pages drive them like reducers. When touching game logic, preserve this — keep React out of `src/game/` and keep functions returning fresh state. This purity is load-bearing beyond the UI: the multiplayer backend runs the same engines outside React (see below), so any React dependency in `src/game/` would break the server.

### Online multiplayer (`server/` + `api/`)

Pusoy Trese, Lucky 9, and Tongits each have an online mode backed by a small authoritative server. Key facts:

- **Transport is plain REST + client polling — no WebSockets/WebRTC.** Clients `fetch()` `/api/<game>/<path>` and poll state on an interval (`POLL_MS`, ~2–2.5s); actions also refresh from their own POST response. Each `*Online.tsx` page has its own inline `api<T>()` helper and polling `useEffect` (the pattern is copied per page — there is no shared net hook).
- **Server logic lives in `server/{pusoy,lucky9,tongits}.ts`**, each a framework-free module exporting `dispatch(method, path, query, body)`. These **reuse the pure `src/game/` engines + bots** (and the UI `constants.ts` modules) — the server is where bots actually run for online games.
- **Authoritative single server, not peer-symmetric.** One central room holds every hand; `viewFor(room, playerId)` returns a per-player filtered view (you only ever receive your own cards). Empty seats are filled by bots. Room lifecycle: 4-char room codes; phases `lobby → playing → revealed → gameover`; session (`{ code, playerId }`) kept in `localStorage`.
- **`server/store.ts`** is the room storage abstraction: Upstash Redis / Vercel KV in production (env vars `UPSTASH_REDIS_REST_URL`/`KV_REST_API_URL` + `..._TOKEN`), falling back to an in-process `MemoryStore` when those are absent (fine for `vite dev`, not for serverless prod). Rooms keyed `<game>:<CODE>`, ~4h TTL, read-modify-write last-write-wins.
- **Two adapters over the same `dispatch`:** production = Vercel serverless catch-alls `api/<game>/[...route].ts`; dev = the Vite middleware plugin in `vite.config.ts` (uses `ssrLoadModule`, so `server/` edits hot-reload). `vercel.json` rewrites all non-`/api/` routes to `index.html` (SPA).
- **Rule of thumb: change game rules in the pure `src/game/` engine, not in `server/`.** Both the single-player page and the `server/` module consume the same engine, so a fix there propagates to both modes. Don't fork rule logic into `server/`.

### Wallet

`src/wallet.tsx` is a React context (`WalletProvider` in `main.tsx`, `useWallet` hook) holding one fake-USD balance persisted to `localStorage` (`card-hub-wallet`, starts at 1000). It's the shared bankroll across all games. Use `formatUSD` / `formatDelta` for display.

### Theming

`src/themes.ts` and `src/cardbacks/` are registries of CSS classes/components. A theme is a class (defined in `index.css`) that overrides `--card-*` / `--table-*` CSS variables. Pages hold `theme`/`back` in state and pass through a `Header`. Inline styles that set CSS variables must use the `CSSVars` type from `src/styleVars.ts` (React's `CSSProperties` rejects custom properties).

## Conventions

- Indentation is inconsistent across the repo (some files use tabs, some 2-space). Match the file you're editing rather than reformatting.
- Prefer editing `games.ts` metadata and the pure `src/game/` modules over threading new props through the page components when the change belongs in game logic.
