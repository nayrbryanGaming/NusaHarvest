import { Router, Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { authenticate } from '../middleware/auth'
import { processClaim, evaluateAllActivePolicies } from '../services/insuranceEngine'
import { calculateRiskScore } from '../services/riskEngine'

export const insuranceRouter = Router()

/**
 * POST /api/insurance/quote
 * Returns premium quote for a given farm + crop + trigger type
 */
insuranceRouter.post(
  '/quote',
  [
    body('farmId').isUUID(),
    body('cropType').notEmpty(),
    body('coveredHectares').isFloat({ min: 0.1 }),
    body('triggerType').isIn(['RAINFALL_DEFICIT', 'EXCESS_RAINFALL'])
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const { farmId, cropType, coveredHectares, triggerType } = req.body
      const farm = await prisma.farm.findUniqueOrThrow({ where: { id: farmId } })

      // Get recent rainfall for this location (last 30 days from DB)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const readings = await prisma.weatherData.findMany({
        where: {
          latitude: { gte: farm.latitude - 0.15, lte: farm.latitude + 0.15 },
          longitude: { gte: farm.longitude - 0.15, lte: farm.longitude + 0.15 },
          recordedAt: { gte: since }
        },
        select: { rainfallMm: true }
      })
      const rollingRainfall30d = readings.reduce((sum: number, r: { rainfallMm: number }) => sum + r.rainfallMm, 0)

      const riskScore = await calculateRiskScore(
        cropType,
        farm.latitude,
        farm.longitude,
        new Date(),
        rollingRainfall30d
      )

      const payoutPerHectare = 500 // USDC — V2 will be configurable
      const premiumTotal = parseFloat((riskScore.recommendedPremiumUsdc * coveredHectares).toFixed(2))
      const farmerPaysUsdc = parseFloat((premiumTotal * 0.5).toFixed(2)) // 50% pool-subsidized

      return res.json({
        success: true,
        data: {
          farmId,
          cropType,
          coveredHectares,
          triggerType,
          riskScore: riskScore.overallRiskScore,
          riskLevel: riskScore.riskLevel,
          payoutPerHectare,
          maxPayoutUsdc: payoutPerHectare * coveredHectares,
          fullPremiumUsdc: premiumTotal,
          farmerPaysUsdc,
          poolSubsidyUsdc: parseFloat((premiumTotal - farmerPaysUsdc).toFixed(2))
        }
      })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }
)

/**
 * POST /api/insurance/purchase
 * Creates an active insurance policy
 */
insuranceRouter.post(
  '/purchase',
  authenticate,
  [
    body('farmId').isUUID(),
    body('cropId').optional().isUUID(),
    body('commodity').notEmpty(),
    body('triggerType').isIn(['RAINFALL_DEFICIT', 'EXCESS_RAINFALL']),
    body('triggerThresholdMm').isFloat({ min: 1 }),
    body('coverageStartDate').isISO8601(),
    body('coverageEndDate').isISO8601(),
    body('coveredHectares').isFloat({ min: 0.1 }),
    body('premiumUsdc').isFloat({ min: 0 })
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const user = (req as any).user
      const farmer = await prisma.farmer.findFirst({ where: { userId: user.id } })
      if (!farmer) return res.status(403).json({ error: 'Farmer profile not found' })

      const {
        farmId, cropId, commodity, triggerType,
        triggerThresholdMm, coverageStartDate, coverageEndDate,
        coveredHectares, premiumUsdc
      } = req.body

      const payoutPerHectare = 500
      const maxPayoutUsdc = payoutPerHectare * coveredHectares

      // Assign to active pool for this commodity (simplified: first available pool)
      const pool = await prisma.yieldPool.findFirst({
        where: { commodity, isPaused: false }
      })

      const policy = await prisma.insurancePolicy.create({
        data: {
          farmerId: farmer.id,
          farmId,
          cropId: cropId ?? null,
          commodity,
          triggerType,
          triggerThresholdMm,
          triggerThresholdDays: 30,
          coverageStartDate: new Date(coverageStartDate),
          coverageEndDate: new Date(coverageEndDate),
          coveredHectares,
          payoutPerHectare,
          maxPayoutUsdc,
          premiumUsdc,
          premiumPaidUsdc: premiumUsdc, // Mark as paid in MVP (integrate payment in V2)
          poolId: pool?.id ?? null,
          status: 'ACTIVE'
        }
      })

      return res.status(201).json({
        success: true,
        data: {
          policyId: policy.id,
          status: policy.status,
          coverageStart: policy.coverageStartDate,
          coverageEnd: policy.coverageEndDate,
          maxPayoutUsdc,
          message: 'Policy activated. Automatic monitoring has started.'
        }
      })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }
)

/**
 * GET /api/insurance/status/:policyId
 */
insuranceRouter.get('/status/:policyId', authenticate, async (req: Request, res: Response) => {
  try {
    const policy = await prisma.insurancePolicy.findUnique({
      where: { id: req.params.policyId },
      include: { claims: true, farm: { select: { name: true, latitude: true, longitude: true } } }
    })
    if (!policy) return res.status(404).json({ error: 'Policy not found' })
    return res.json({ success: true, data: policy })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

/**
 * POST /api/insurance/evaluate (admin/cron)
 * Manually trigger policy evaluation for all active policies
 */
insuranceRouter.post('/evaluate', authenticate, async (_req: Request, res: Response) => {
  try {
    await evaluateAllActivePolicies()
    return res.json({ success: true, message: 'Policy evaluation complete' })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})
