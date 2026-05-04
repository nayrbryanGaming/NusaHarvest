import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import { weatherRouter } from './routes/weather'
import { farmRouter } from './routes/farm'
import { insuranceRouter } from './routes/insurance'
import { poolRouter } from './routes/pool'
import { authRouter } from './routes/auth'
import { startCronJobs } from './cron/cronJobs'
import { logger } from './utils/logger'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// ── Security Middleware ──────────────────────────────────
app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || '*' }))
app.use(express.json({ limit: '10kb' }))

// Rate limiting — 100 req/15min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
})
app.use('/api', limiter)

// ── Routes ───────────────────────────────────────────────
app.use('/api/auth', authRouter)
app.use('/api/weather', weatherRouter)
app.use('/api/farm', farmRouter)
app.use('/api/insurance', insuranceRouter)
app.use('/api/pool', poolRouter)

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nusa-harvest-backend',
    timestamp: new Date().toISOString(),
    network: process.env.SOLANA_NETWORK || 'devnet'
  })
})

// ── Error Handler ─────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err.message)
  res.status(500).json({ error: 'Internal server error' })
})

// ── Start Server ─────────────────────────────────────────
const server = app.listen(PORT, () => {
  logger.info(`🌾 Nusa Harvest Backend running on port ${PORT}`)
  logger.info(`🔗 Solana Network: ${process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'}`)
  
  // Start cron jobs with error handling (async to avoid blocking startup)
  try {
    setTimeout(() => {
      try {
        startCronJobs()
        logger.info('✅ Cron jobs started')
      } catch (err) {
        logger.error('⚠️ Cron jobs failed to start:', err)
      }
    }, 1000)  // Delay by 1 second to ensure server is fully initialized
  } catch (err) {
    logger.warn('⚠️ Cron jobs startup error (non-fatal):', err)
  }
})

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...')
  server.close(() => {
    logger.info('Server closed')
    process.exit(0)
  })
})

export default app
