import express from 'express'
import cors from 'cors'

const app = express()
const PORT = process.env.PORT || 4000

// ── Minimal middleware ─────────────────────────────────────
app.use(cors({ origin: '*' }))
app.use(express.json({ limit: '10kb' }))

// ── Health check (no dependencies) ────────────────────────
app.get('/health', (_req, res) => {
  try {
    res.json({
      status: 'ok',
      service: 'nusa-harvest-backend',
      timestamp: new Date().toISOString(),
      network: process.env.SOLANA_NETWORK || 'devnet'
    })
  } catch (err) {
    res.status(200).json({
      status: 'ok',
      service: 'nusa-harvest-backend',
      timestamp: new Date().toISOString()
    })
  }
})

// ── Metrics endpoint (fallback data) ───────────────────────
app.get('/api/pool/metrics', (_req, res) => {
  res.json({
    success: true,
    data: {
      tvlUsd: 0,
      tvlIdr: 0,
      activePolicies: 0,
      totalClaims: 0,
      avgApy: 0,
      backendConnected: false,
      lastSync: new Date()
    },
    source: 'fallback',
    message: 'Database not connected - returning fallback metrics'
  })
})

// ── Error handler ──────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response) => {
  console.error('Error:', err.message)
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  })
})

// ── Start Server ───────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`✅ Backend running on port ${PORT}`)
})

process.on('SIGTERM', () => {
  console.log('Shutting down...')
  server.close(() => {
    process.exit(0)
  })
})

export default app
