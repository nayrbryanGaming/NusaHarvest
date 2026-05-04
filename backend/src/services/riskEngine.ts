import { prisma } from '../utils/prisma'
import { calculateRainfallRisk } from './weatherService'
import { logger } from '../utils/logger'

export interface RiskScore {
  droughtRiskScore: number
  excessRainRiskScore: number
  overallRiskScore: number
  recommendedPremiumUsdc: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
}

// Crop sensitivity multipliers for drought risk
const CROP_DROUGHT_SENSITIVITY: Record<string, number> = {
  RICE: 1.3,
  CORN: 1.1,
  COFFEE_ROBUSTA: 0.9,
  COFFEE_ARABICA: 1.2,
  PALM_OIL: 0.7,
  RUBBER: 0.8,
  COCOA: 1.1,
  SOYBEAN: 1.2
}

// ENSO adjustment (simplified — in production this comes from NOAA API)
function getEnsoMultiplier(): number {
  // Placeholder: In production, fetch real ENSO index from NOAA
  // Positive = El Niño (drought risk for Indonesia), Negative = La Niña (flood risk)
  return 1.0
}

// ── Calculate risk score for a crop at a given location ──────────────────────
export async function calculateRiskScore(
  cropType: string,
  lat: number,
  lon: number,
  plantingDate: Date,
  rollingRainfall30d: number
): Promise<RiskScore> {
  const droughtThresholdMm = 40 // baseline drought threshold (mm/30d)
  const { droughtRisk, excessRainRisk } = calculateRainfallRisk(
    rollingRainfall30d,
    droughtThresholdMm
  )

  const cropMultiplier = CROP_DROUGHT_SENSITIVITY[cropType] ?? 1.0
  const ensoMultiplier = getEnsoMultiplier()

  // Adjusted risk scores
  const adjustedDrought = Math.min(100, droughtRisk * cropMultiplier * ensoMultiplier)
  const adjustedExcessRain = Math.min(100, excessRainRisk * 1.0)

  // Overall: weighted average (drought weighted 60% since more common in Indonesia)
  const overallRiskScore = parseFloat(
    (adjustedDrought * 0.6 + adjustedExcessRain * 0.4).toFixed(1)
  )

  // Premium calculation
  // Base formula: (trigger_probability × avg_payout) / loss_ratio_target + expense_loading
  const triggerProbability = overallRiskScore / 100
  const avgPayoutPerHectare = 500 // USDC baseline
  const lossRatioTarget = 0.65
  const expenseLoading = 0.12

  const expectedLoss = triggerProbability * avgPayoutPerHectare
  const grossPremium = expectedLoss / lossRatioTarget
  const finalPremium = parseFloat((grossPremium * (1 + expenseLoading)).toFixed(2))

  // Risk level classification
  let riskLevel: RiskScore['riskLevel'] = 'LOW'
  if (overallRiskScore >= 70) riskLevel = 'CRITICAL'
  else if (overallRiskScore >= 50) riskLevel = 'HIGH'
  else if (overallRiskScore >= 25) riskLevel = 'MEDIUM'

  logger.info(
    `Risk calculated: crop=${cropType} lat=${lat} lon=${lon} score=${overallRiskScore} premium=${finalPremium}`
  )

  return {
    droughtRiskScore: parseFloat(adjustedDrought.toFixed(1)),
    excessRainRiskScore: parseFloat(adjustedExcessRain.toFixed(1)),
    overallRiskScore,
    recommendedPremiumUsdc: finalPremium,
    riskLevel
  }
}

// ── Save prediction to database ──────────────────────────────────────────────
export async function saveYieldPrediction(
  cropId: string,
  riskScore: RiskScore
) {
  return prisma.yieldPrediction.create({
    data: {
      cropId,
      droughtRiskScore: riskScore.droughtRiskScore,
      excessRainRiskScore: riskScore.excessRainRiskScore,
      overallRiskScore: riskScore.overallRiskScore,
      recommendedPremiumUsdc: riskScore.recommendedPremiumUsdc,
      forecastPeriodDays: 30,
      modelVersion: '1.0'
    }
  })
}
