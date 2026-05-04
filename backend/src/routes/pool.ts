import { Router, Request, Response } from 'express'
import { prisma } from '../utils/prisma'
import { syncAdminMetrics, getPoolMetrics } from '../services/solanaIndexer'

export const poolRouter = Router()

// ── Get Admin Metrics (Connected to Smart Contract) ─────────────────────────
poolRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    // Sync latest data from blockchain
    const metrics = await syncAdminMetrics()
    
    if (!metrics) {
      return res.status(500).json({ error: 'Failed to fetch metrics' })
    }

    return res.json({ success: true, data: metrics, source: 'on-chain' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

// ── Get On-Chain Pool Status ──────────────────────────────────────────────────
poolRouter.get('/onchain/status', async (_req: Request, res: Response) => {
  try {
    const poolMetrics = await getPoolMetrics()
    
    if (!poolMetrics) {
      return res.status(500).json({ error: 'Failed to fetch on-chain metrics' })
    }

    return res.json({ success: true, data: poolMetrics, source: 'blockchain' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

poolRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const pools = await prisma.yieldPool.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        investments: {
          select: {
            amountUsdc: true,
            shares: true,
            earnedYieldUsdc: true
          }
        },
        policies: {
          select: {
            id: true,
            status: true,
            maxPayoutUsdc: true
          }
        }
      }
    })

    return res.json({ success: true, data: pools })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

poolRouter.get('/:poolId', async (req: Request, res: Response) => {
  try {
    const pool = await prisma.yieldPool.findUnique({
      where: { id: req.params.poolId },
      include: {
        investments: true,
        policies: true
      }
    })

    if (!pool) {
      return res.status(404).json({ error: 'Pool not found' })
    }

    return res.json({ success: true, data: pool })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})