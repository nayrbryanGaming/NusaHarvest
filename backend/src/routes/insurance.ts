import { Router, Request, Response } from 'express'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { authenticate } from '../middleware/auth'
import { processClaim, evaluateAllActivePolicies } from '../services/insuranceEngine'
import { calculateRiskScore } from '../services/riskEngine'
import { getPayoutPerHectare } from '../services/weatherService'

export const insuranceRouter = Router()

function normalizeCommodity(rawCommodity: string): string {
  const candidate = rawCommodity.trim().toUpperCase()
  const commodityMap: Record<string, string> = {
    RICE: 'RICE',
    PADI: 'RICE',
    CORN: 'CORN',
    JAGUNG: 'CORN',
    COFFEE: 'COFFEE',
    KOPI: 'COFFEE',
    SOYBEAN: 'SOYBEAN',
    KEDELAI: 'SOYBEAN'
  }

  return commodityMap[candidate] || 'RICE'
}

function getDefaultThreshold(triggerType: 'RAINFALL_DEFICIT' | 'EXCESS_RAINFALL'): number {
  return triggerType === 'EXCESS_RAINFALL' ? 350 : 40
}

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

      const payoutPerHectare = getPayoutPerHectare(cropType)
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
 * POST /api/insurance/purchase-mvp
 * Wallet-first purchase flow for frontend app without JWT login.
 */
insuranceRouter.post(
  '/purchase-mvp',
  [
    body('walletAddress').isString().notEmpty(),
    body('commodity').isString().notEmpty(),
    body('hectares').isFloat({ min: 0.1, max: 1000 }),
    body('latitude').isFloat({ min: -90, max: 90 }),
    body('longitude').isFloat({ min: -180, max: 180 }),
    body('triggerType').optional().isIn(['RAINFALL_DEFICIT', 'EXCESS_RAINFALL']),
    body('triggerThreshold').optional().isFloat({ min: 1 }),
    body('coverageDays').optional().isInt({ min: 30, max: 365 }),
    body('txSignature').optional({ nullable: true }).isString()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const walletAddress = String(req.body.walletAddress).trim()
      const commodity = normalizeCommodity(String(req.body.commodity))
      const hectares = Number(req.body.hectares)
      const latitude = Number(req.body.latitude)
      const longitude = Number(req.body.longitude)
      const triggerType = (req.body.triggerType === 'EXCESS_RAINFALL'
        ? 'EXCESS_RAINFALL'
        : 'RAINFALL_DEFICIT') as 'RAINFALL_DEFICIT' | 'EXCESS_RAINFALL'
      const triggerThreshold = Number(req.body.triggerThreshold ?? getDefaultThreshold(triggerType))
      const coverageDays = Number(req.body.coverageDays ?? 120)
      const txSignature =
        typeof req.body.txSignature === 'string' && req.body.txSignature.trim().length > 0
          ? req.body.txSignature.trim()
          : null

      if (txSignature) {
        const existingTxPolicy = await prisma.insurancePolicy.findUnique({
          where: { solanaPolicyAcc: txSignature },
          select: { id: true }
        })

        if (existingTxPolicy) {
          return res.status(409).json({
            error: 'Transaksi ini sudah digunakan untuk polis lain',
            data: { policyId: existingTxPolicy.id }
          })
        }
      }

      const user = await prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: { walletAddress, role: 'FARMER' }
      })

      const shortWallet = walletAddress.slice(0, 6)
      const existingFarm = await prisma.farm.findFirst({
        where: {
          ownerId: user.id,
          cropType: commodity,
          latitude: { gte: latitude - 0.0005, lte: latitude + 0.0005 },
          longitude: { gte: longitude - 0.0005, lte: longitude + 0.0005 }
        },
        orderBy: { plantingDate: 'desc' }
      })

      const farm =
        existingFarm ||
        (await prisma.farm.create({
          data: {
            ownerId: user.id,
            name: `Lahan ${commodity} ${shortWallet}`,
            latitude,
            longitude,
            cropType: commodity,
            hectares,
            plantingDate: new Date(),
            regionCode: `${Math.round(latitude * 4) / 4}_${Math.round(longitude * 4) / 4}`
          }
        }))

      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const readings = await prisma.weatherData.findMany({
        where: {
          latitude: { gte: latitude - 0.15, lte: latitude + 0.15 },
          longitude: { gte: longitude - 0.15, lte: longitude + 0.15 },
          recordedAt: { gte: since }
        },
        select: { rainfallMm: true }
      })

      const rollingRainfall30d = readings.reduce((sum: number, reading: { rainfallMm: number }) => sum + reading.rainfallMm, 0)

      const risk = await calculateRiskScore(commodity, latitude, longitude, new Date(), rollingRainfall30d)
      const payoutPerHectare = 500
      const maxPayoutUsdc = parseFloat((payoutPerHectare * hectares).toFixed(2))
      const fullPremiumUsdc = parseFloat((risk.recommendedPremiumUsdc * hectares).toFixed(2))
      const farmerPaysUsdc = parseFloat((fullPremiumUsdc * 0.5).toFixed(2))

      const startDate = new Date()
      const coverageEndDate = new Date(startDate)
      coverageEndDate.setDate(startDate.getDate() + coverageDays)

      const pool = await prisma.pool.findFirst({
        where: { name: { contains: commodity }, isPaused: false }
      })

      const policy = await prisma.insurancePolicy.create({
        data: {
          farmerId: user.id,
          farmId: farm.id,
          commodity,
          triggerType,
          triggerThreshold,
          triggerThresholdMm: triggerThreshold,
          triggerThresholdDays: 30,
          startDate,
          endDate: coverageEndDate,
          coverageStartDate: startDate,
          coverageEndDate,
          coverageUsdc: maxPayoutUsdc,
          payoutPerHectare,
          maxPayoutUsdc,
          premiumUsdc: farmerPaysUsdc,
          premiumPaidUsdc: farmerPaysUsdc,
          poolId: pool?.id ?? null,
          solanaPolicyAcc: txSignature,
          status: 'ACTIVE'
        }
      })

      return res.status(201).json({
        success: true,
        data: {
          policyId: policy.id,
          farmId: farm.id,
          status: policy.status,
          commodity,
          triggerType,
          triggerThreshold,
          premiumPaidUsdc: farmerPaysUsdc,
          fullPremiumUsdc,
          poolSubsidyUsdc: parseFloat((fullPremiumUsdc - farmerPaysUsdc).toFixed(2)),
          maxPayoutUsdc,
          riskScore: risk.overallRiskScore,
          riskLevel: risk.riskLevel,
          txSignature,
          coverageStartDate: startDate,
          coverageEndDate
        }
      })
    } catch (err: any) {
      console.error('[BACKEND] MVP Policy Purchase Error:', err)
      return res.status(500).json({ error: err.message })
    }
  }
)

/**
 * GET /api/insurance/latest/wallet/:walletAddress
 * Lightweight status endpoint to reflect real latest policy on frontend.
 */
insuranceRouter.get(
  '/latest/wallet/:walletAddress',
  [param('walletAddress').isString().notEmpty()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const walletAddress = String(req.params.walletAddress).trim()
      const user = await prisma.user.findUnique({ where: { walletAddress } })

      if (!user) {
        return res.json({ success: true, data: null })
      }

      const policy = await prisma.insurancePolicy.findFirst({
        where: { farmerId: user.id },
        orderBy: { coverageStartDate: 'desc' },
        include: {
          farm: {
            select: {
              id: true,
              name: true,
              cropType: true,
              hectares: true
            }
          }
        }
      })

      if (!policy) {
        return res.json({ success: true, data: null })
      }

      return res.json({
        success: true,
        data: {
          policyId: policy.id,
          status: policy.status,
          commodity: policy.commodity,
          premiumPaidUsdc: policy.premiumPaidUsdc,
          maxPayoutUsdc: policy.maxPayoutUsdc,
          txSignature: policy.solanaPolicyAcc,
          coverageStartDate: policy.coverageStartDate,
          coverageEndDate: policy.coverageEndDate,
          farm: policy.farm
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
    body('farmId').notEmpty(),
    body('commodity').notEmpty(),
    body('triggerType').isIn(['RAINFALL_DEFICIT', 'EXCESS_RAINFALL']),
    body('triggerThreshold').isFloat({ min: 1 }),
    body('coverageStartDate').isISO8601(),
    body('coverageEndDate').isISO8601(),
    body('premiumUsdc').isFloat({ min: 0 })
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const user = (req as any).user
      const {
        farmId, commodity, triggerType, triggerThreshold,
        coverageStartDate, coverageEndDate, premiumUsdc
      } = req.body

      // Verify farm belongs to this user
      const farm = await prisma.farm.findUnique({ where: { id: farmId } })
      if (!farm || farm.ownerId !== user.id) {
        return res.status(403).json({ error: 'Farm not found or access denied' })
      }

      const payoutPerHectare = 500
      const maxPayoutUsdc = payoutPerHectare * farm.hectares
      const coverageUsdc = maxPayoutUsdc

      // Assign to active pool for this commodity (simplified)
      const pool = await prisma.pool.findFirst({
        where: { name: { contains: commodity }, isPaused: false }
      })

      const policy = await prisma.insurancePolicy.create({
        data: {
          farmerId: user.id,
          farmId,
          commodity,
          triggerType,
          triggerThreshold,
          triggerThresholdDays: 30,
          coverageStartDate: new Date(coverageStartDate),
          coverageEndDate: new Date(coverageEndDate),
          coverageUsdc,
          payoutPerHectare,
          maxPayoutUsdc,
          premiumUsdc,
          premiumPaidUsdc: premiumUsdc,
          poolId: pool?.id ?? null,
          status: 'ACTIVE'
        },
        include: { farm: true }
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
      console.error('[BACKEND] Policy Purchase Error:', err)
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
