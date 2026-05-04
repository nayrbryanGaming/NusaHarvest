import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'

/**
 * NUSA HARVEST — Yield Prediction & Pool Engine
 * Calculates dynamic APY for commodity pools based on volatility and lockups.
 */

export interface PoolStats {
  symbol: string
  apy: number
  totalTvlUsdc: number
  availableReserveUsdc: number
}

// ── Calculate dynamic APY for a pool ──────────────────────────────────────────
export function calculatePoolApy(
  baseApy: number,
  volatilityIndex: number, // 0 to 1 (high volatility = higher yield required)
  reserveRatio: number     // 0 to 1 (low reserve = higher yield to attract LP)
): number {
  // Formula: Base + VolatilitySurcharge + LiquidityPremium
  const volatilitySurcharge = volatilityIndex * 5.0 // Max +5%
  const liquidityPremium = (1 - reserveRatio) * 10.0 // Max +10%
  
  const finalApy = baseApy + volatilitySurcharge + liquidityPremium
  return parseFloat(finalApy.toFixed(2))
}

// ── Update all pool statistics ──────────────────────────────────────────────
export async function updateAllPoolStats(): Promise<void> {
  logger.info('📊 Refreshing dynamic pool metrics...')
  
  const pools = await prisma.yieldPool.findMany()
  
  for (const pool of pools) {
    try {
      // For MVP, volatility is a heuristic based on recent insurance claims
      const recentClaimsCount = await prisma.claim.count({
        where: {
          processedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          policy: { poolId: pool.id }
        }
      })
      
      const volatilityIndex = Math.min(1, recentClaimsCount / 10)
      const reserveRatio = pool.totalDepositedUsdc && pool.totalDepositedUsdc > 0 
        ? pool.availableReserveUsdc / pool.totalDepositedUsdc 
        : 1.0
        
      const baseApy = pool.currentApyBps / 100
      const newApy = calculatePoolApy(baseApy, volatilityIndex, reserveRatio)
      const newApyBps = Math.round(newApy * 100)
      
      await prisma.yieldPool.update({
        where: { id: pool.id },
        data: { currentApyBps: newApyBps }
      })
      
      logger.info(`✅ Pool ${pool.name} APY updated to ${newApy}%`)
    } catch (e) {
      logger.error(`❌ Failed to update pool ${pool.name}:`, e)
    }
  }
}

// ── Predict yield for a specific farmer farm ──────────────────────────────────
export function predictYieldLoss(riskScore: number): number {
  // Heuristic: for every 10 points of risk score above 30, expect 8% yield reduction
  if (riskScore <= 30) return 0
  const reduction = (riskScore - 30) * 0.008
  return parseFloat((reduction * 100).toFixed(2))
}
