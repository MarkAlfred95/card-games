import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import NotFound from './pages/NotFound'
import PusoyTreseOnline from './pages/PusoyTreseOnline'
import { AVAILABLE_GAMES } from './games'

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
      {/* Online (multiplayer) mode of Pusoy Trese — a sub-route of the game,
          not a games.ts entry, so it doesn't get its own home tile. */}
      <Route path="/games/pusoy-trese/online" element={<PusoyTreseOnline />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
