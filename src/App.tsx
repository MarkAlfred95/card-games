import { Routes, Route } from 'react-router-dom'
import { lazy } from 'react'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import PusoyTreseOnline from './pages/PusoyTreseOnline'
import { AVAILABLE_GAMES } from './games'

const Lucky9Online = lazy(() => import('./pages/Lucky9Online'))
const TongitsOnline = lazy(() => import('./pages/TongitsOnline'))

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      {AVAILABLE_GAMES.map((game) => {
        const Game = game.component
        return Game ? (
          <Route key={game.id} path={game.path} element={<Game />} />
        ) : null
      })}
      {/* Online (multiplayer) modes — sub-routes of their games, not games.ts
          entries, so they don't get their own home tiles. */}
      <Route path="/games/pusoy-trese/online" element={<PusoyTreseOnline />} />
      <Route path="/games/lucky-nine/online" element={<Lucky9Online />} />
      <Route path="/games/tongits/online" element={<TongitsOnline />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
