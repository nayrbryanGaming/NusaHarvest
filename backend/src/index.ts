import express from 'express'
import cors from 'cors'

// ── Import indexer (with graceful fallback) ────────────────
let indexerReady = false
let syncAdminMetrics: any = null

try {
  const indexer = require('./services/solanaIndexer')
  syncAdminMetrics = indexer.syncAdminMetrics
  indexerReady = true
  console.log('✅ Indexer service loaded')
} catch (err) {
  console.warn('⚠️  Indexer service unavailable:', (err as Error).message)
  indexerReady = false
}

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

// ── Metrics endpoint (with indexer or fallback) ────────────
app.get('/api/pool/metrics', async (_req, res) => {
  try {
    if (indexerReady && syncAdminMetrics) {
      const metrics = await syncAdminMetrics()
      if (metrics) {
        return res.json({
          success: true,
          data: {
            finance: {
              totalTvlUsdc: metrics.tvlUsd || 0,
              avgApy: metrics.avgApy || 0
            },
            program: {
              balanceIdr: metrics.tvlIdr || 0
            },
            network: {
              usdcToIdr: 15000
            },
            insurance: {
              activePolicies: metrics.activePolicies || 0,
              totalClaims: metrics.totalClaims || 0
            },
            recent: {
              claims: [],
              investments: []
            }
          },
          source: 'indexer',
          message: 'On-chain metrics synced'
        })
      }
    }
  } catch (err) {
    console.error('Indexer error:', err)
  }

  // Fallback response
  res.json({
    success: true,
    data: {
      finance: {
        totalTvlUsdc: 0,
        avgApy: 0
      },
      program: {
        balanceIdr: 0
      },
      network: {
        usdcToIdr: 15000
      },
      insurance: {
        activePolicies: 0,
        totalClaims: 0
      },
      recent: {
        claims: [],
        investments: []
      }
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

  // ── Defer cron job initialization ──────────────────────
  setTimeout(() => {
    try {
      const { startCronJobs } = require('./cron/cronJobs')
      startCronJobs()
      console.log('✅ Cron jobs initialized')
    } catch (err) {
      console.warn('⚠️  Cron jobs unavailable:', (err as Error).message)
    }
  }, 1000)
})

process.on('SIGTERM', () => {
  console.log('Shutting down...')
  server.close(() => {
    process.exit(0)
  })
})

export default app
