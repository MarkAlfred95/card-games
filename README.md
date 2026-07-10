# SAAS (Sugal as a Service)

A single-page React + TypeScript hub for Filipino and casino card games. Pick a game from the home page and play locally against bots, or start an online room and play with friends.

## Games

| Game | Status | Route | Notes |
|---|---|---|---|
| Pusoy Trese (13-card Chinese poker) | Available | `/games/pusoy-trese` | Local vs. bots. Also playable online at `/games/pusoy-trese/online` (room codes, live polling). |
| Texas Hold'em | Available | `/games/poker` | No-limit, 4 bot opponents, $500 buy-in. Lazy-loaded. |
| Pusoy Dos (Big Two) | Coming soon | `/games/pusoy-dos` | — |
| Tongits | Coming soon | `/games/tongits` | — |
| Lucky 9 | Coming soon | `/games/lucky-nine` | — |

The game catalog is defined in [`src/games.ts`](src/games.ts) — it's the single source of truth for routing and the home page tiles. To add or enable a game, edit that file rather than hand-wiring routes.

## Tech stack

- **React 19 + TypeScript + Vite** — SPA, no server-rendering.
- **Tailwind CSS v4** via `@tailwindcss/vite` (no `tailwind.config`; theme variables live in CSS).
- **framer-motion** for animation, **@dnd-kit/core** for drag-and-drop, **react-router-dom v7** for routing.
- **Oxlint** for linting (not ESLint).
- No unit test runner — see [Testing](#testing) below.

## Getting started

```bash
npm install
npm run dev        # start the Vite dev server with HMR
```

Set `PORT` to pin a fixed port (`strictPort`); otherwise Vite picks one automatically.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server (HMR). |
| `npm run build` | Type-check the whole project (`tsc -b`) then build with `vite build`. Fails the build on type errors. |
| `npm run typecheck` | `tsc -b` only, no bundle output. |
| `npm run lint` | Run Oxlint (config in `.oxlintrc.json`; enforces `react/rules-of-hooks` and `react/only-export-components`). |
| `npm run preview` | Serve the production build locally. |

## Testing

There is no unit test runner configured. `verify-poker.js` is an ad-hoc Playwright smoke script (requires a dev server running on the port hardcoded inside it, plus `playwright` installed globally); it isn't wired into npm scripts and its screenshot paths are stale. When verifying UI changes, drive the app directly (e.g. via a browser-preview tool) rather than relying on this script.

## Architecture

### Game registry drives routing

[`src/games.ts`](src/games.ts) holds every `Game` entry: metadata, a `path`, a `status` (`available` | `coming-soon`), and an optional `component`. [`src/App.tsx`](src/App.tsx) maps `AVAILABLE_GAMES` into `<Route>`s automatically; [`src/pages/Home.tsx`](src/pages/Home.tsx) renders a tile per game.

### Shared vs. per-game code

- **`src/game/`** — pure, framework-free game logic (no React).
  - `types.ts` — shared domain types (`Card`, `Rank`, `Suit`, `HandEval`, etc.). Card ids are `` `${rank}${suit}` `` (e.g. `10S`). `RANKS` is ordered low→high so array index doubles as strength.
  - `deck.ts` — shared deck ops (`buildDeck`, `shuffle`, `deal`).
  - **Pusoy Trese engine**: `ranking.ts` (`evaluate`, `compareHands`, `CATEGORY` — handles both 5-card and 3-card/front hands), `scoring.ts` (`scoreRound`, `scoreBanker` — zero-sum banker settlement with royalties/sweep bonuses), `bot.ts` (`arrangeBot`).
  - **Texas Hold'em engine**: `pokerEngine.ts` (state machine: `createInitialState` → `dealHand` → `applyAction` → `advanceStreet` → `resolveShowdown` → `prepareNextHand`, with side-pot construction), `pokerEval.ts` (`best5from7`), `pokerBot.ts` (`decideBotAction` with personalities), `pokerTypes.ts`. `resolveShowdown` reuses `compareHands` from Pusoy Trese's `ranking.ts`.
- **`src/components/`** — shared card UI (`Card`, `CardBack`, `DraggableCard`, `DropZone`, `ChipTray`, `HandTypes`). Game-specific components live under `src/components/game/<game>/` with a barrel `index.ts` (e.g. `pusoy-trese/` exports `Header`, `PokerTable`, `BettingGate`, and rule constants from `constants.ts`).
- **`src/pages/`** — one page per game (`PusoyTrese.tsx`, `Poker.tsx`, `Home.tsx`) plus `PusoyTreseOnline.tsx` for multiplayer. Pages own game state via `useState` and orchestrate the pure engine functions; the engines never touch React.

Both `pokerEngine.ts` and `scoring.ts` are pure state reducers — they take state/inputs and return **new** objects (spread/map, never mutate). Preserve this when touching game logic.

### Online multiplayer (Pusoy Trese)

`/games/pusoy-trese/online` adds room-based multiplayer on top of the same engine:

- **`server/pusoy.ts`** — the room/game dispatch logic (create/join room, submit arrangement, poll state), shared between local dev and production.
- **`server/store.ts`** — room storage abstraction. Uses Upstash Redis / Vercel KV (REST API) in production when the corresponding env vars are set; falls back to an in-process `Map` for `vite dev` (not safe for serverless production, where each invocation may be a fresh process).
- **`api/pusoy/[...route].ts`** — Vercel serverless catch-all that adapts Node's request/response to `server/pusoy.ts`'s `dispatch`.
- **`vercel.json`** — SPA rewrite so all non-`/api` routes fall through to `index.html`.

The client polls the API for room/game state rather than using websockets.

### Wallet

[`src/wallet.tsx`](src/wallet.tsx) is a React context (`WalletProvider` in `main.tsx`, `useWallet` hook) holding one fake-USD balance persisted to `localStorage` (`card-hub-wallet`, starts at 1000). It's the shared bankroll across all games. Use `formatUSD` / `formatDelta` for display.

### Theming

[`src/themes.ts`](src/themes.ts) and `src/cardbacks/` are registries of CSS classes/components. A theme is a class (defined in `index.css`) overriding `--card-*` / `--table-*` CSS variables. Pages hold `theme`/`back` in state and pass them through a `Header`. Inline styles that set CSS variables must use the `CSSVars` type from `src/styleVars.ts` (React's `CSSProperties` rejects custom properties).

## Conventions

- Indentation is inconsistent across the repo (some files use tabs, some 2-space). Match the file you're editing rather than reformatting.
- Prefer editing `games.ts` metadata and the pure `src/game/` modules over threading new props through page components when the change belongs in game logic.

## Deployment

The app is deployed as a static SPA with serverless API routes (see `vercel.json` and `api/`). For the online Pusoy Trese room store to persist across serverless invocations in production, configure Upstash Redis or Vercel KV env vars (`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` or `KV_REST_API_URL`/`KV_REST_API_TOKEN`).
