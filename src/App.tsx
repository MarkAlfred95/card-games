import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
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
      {/* Unknown routes fall back to the home page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
