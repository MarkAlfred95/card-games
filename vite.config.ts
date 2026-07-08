import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Serves the online-game API in dev, mirroring the Vercel functions in api/.
// The handlers are loaded through ssrLoadModule so edits to server/ hot-reload.
function gameApi(): Plugin {
  return {
    name: 'game-api',
    configureServer(server) {
      server.middlewares.use('/api/pusoy', (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', async () => {
          try {
            const mod = (await server.ssrLoadModule('/server/pusoy.ts')) as {
              dispatch: (
                method: string,
                path: string,
                query: Record<string, string>,
                body: unknown,
              ) => Promise<{ status: number; body: unknown }>
            }
            const url = new URL(req.url ?? '/', 'http://localhost')
            const raw = Buffer.concat(chunks).toString('utf8')
            const out = await mod.dispatch(
              req.method ?? 'GET',
              url.pathname.replace(/^\//, ''),
              Object.fromEntries(url.searchParams),
              raw ? JSON.parse(raw) : null,
            )
            res.statusCode = out.status
            res.setHeader('content-type', 'application/json')
            res.end(JSON.stringify(out.body))
          } catch (e) {
            console.error(e)
            res.statusCode = 500
            res.end(JSON.stringify({ error: 'Server error' }))
          }
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), gameApi()],
  server: process.env.PORT
    ? { port: Number(process.env.PORT), strictPort: true }
    : undefined,
})
