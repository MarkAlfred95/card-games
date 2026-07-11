# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server (HMR). Set `PORT` env to pin a port (`strictPort`); otherwise Vite picks one.
- `npm run build` — type-check the whole project (`tsc -b`) then build (`vite build`). Build fails on type errors.
- `npm run typecheck` — `tsc -b` only, no bundle.
- `npm run lint` — Oxlint (not ESLint). Config in `.oxlintrc.json`; enforces `react/rules-of-hooks` and `react/only-export-components`.
- `npm run preview` — serve the production build.

There is **no unit test runner**. `verify-poker.js` is an ad-hoc Playwright smoke script (requires a running dev server on the port hardcoded inside it and `playwright` installed globally) — it is not wired into npm scripts and its screenshot paths are stale. Prefer the `preview_*` tools for verifying UI changes.

## Architecture

A single-page React 19 + TypeScript + Vite app: a hub of Filipino/casino card games. Styling is **Tailwind CSS v4** (via `@tailwindcss/vite`, no `tailwind.config` — configured in CSS) plus CSS custom properties for theming. Animation via `framer-motion`, drag-and-drop via `@dnd-kit/core`, routing via `react-router-dom` v7.

### Game registry drives routing

`src/games.ts` is the single source of truth. Each `Game` entry has metadata, a `path`, a `status` (`available` | `coming-soon`), and an optional `component`. `src/App.tsx` maps `AVAILABLE_GAMES` (status === 'available') into `<Route>`s automatically; `src/pages/Home.tsx` renders a tile per game. **To add or enable a game, edit `games.ts`** — do not hand-wire routes. Poker is `lazy()`-loaded; Pusoy Trese is eager.

### Shared vs. per-game code

- `src/game/` — pure, framework-free game logic (no React). Shared domain types live in `types.ts` (`Card`, `Rank`, `Suit`, `HandEval`, etc.); shared deck ops in `deck.ts` (`buildDeck`, `shuffle`, `deal`). Card ids are `` `${rank}${suit}` `` (e.g. `10S`). `RANKS` is ordered low→high so array index doubles as strength.
- Three game engines coexist here, each self-contained:
  - **Pusoy Trese** (13-card Chinese poker): `ranking.ts` (`evaluate`, `compareHands`, `CATEGORY`), `scoring.ts` (`scoreRound`, `scoreBanker` — zero-sum banker settlement with royalties/sweep bonuses), `bot.ts` (`arrangeBot`). `evaluate` handles both 5-card and 3-card (front) hands.
  - **Lucky 9** (Filipino baccarat): `lucky9.ts` (`handValue` — mod-10 totals with A=1 and 10/face=0, `natural` — two-card 8/9, `botWantsCard`, `settleRound` — even-money banker settlement where a winning Lucky 9 pays double).
  - **Texas Hold'em**: `pokerEngine.ts` (state machine: `createInitialState` → `dealHand` → `applyAction` → `advanceStreet` → `resolveShowdown` → `prepareNextHand`, with side-pot construction), `pokerEval.ts` (`best5from7`), `pokerBot.ts` (`decideBotAction` with personalities), `pokerTypes.ts`. `resolveShowdown` reuses `compareHands` from the Pusoy Trese `ranking.ts`.
- `src/components/` — shared card UI (`Card`, `CardBack`, `DraggableCard`, `DropZone`). Game-specific components are nested under `src/components/game/<game>/` with a barrel `index.ts` (e.g. `pusoy-trese/` exports `Header`, `PokerTable`, `BettingGate` and its rule constants from `constants.ts`).
- `src/pages/` — one page component per game (`PusoyTrese.tsx`, `Poker.tsx`, `Home.tsx`). Pages own all game state via `useState` and orchestrate the pure engine functions. The engines return new state; pages never let the engine touch React.

### The engines are immutable state reducers

Both `pokerEngine.ts` and `scoring.ts` are pure: they take state/inputs and return **new** objects (spread/map, never mutate). Pages drive them like reducers. When touching game logic, preserve this — keep React out of `src/game/` and keep functions returning fresh state.

### Wallet

`src/wallet.tsx` is a React context (`WalletProvider` in `main.tsx`, `useWallet` hook) holding one fake-USD balance persisted to `localStorage` (`card-hub-wallet`, starts at 1000). It's the shared bankroll across all games. Use `formatUSD` / `formatDelta` for display.

### Theming

`src/themes.ts` and `src/cardbacks/` are registries of CSS classes/components. A theme is a class (defined in `index.css`) that overrides `--card-*` / `--table-*` CSS variables. Pages hold `theme`/`back` in state and pass through a `Header`. Inline styles that set CSS variables must use the `CSSVars` type from `src/styleVars.ts` (React's `CSSProperties` rejects custom properties).

## Conventions

- Indentation is inconsistent across the repo (some files use tabs, some 2-space). Match the file you're editing rather than reformatting.
- Prefer editing `games.ts` metadata and the pure `src/game/` modules over threading new props through the page components when the change belongs in game logic.
