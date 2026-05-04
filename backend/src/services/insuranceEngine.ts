import { prisma } from '../utils/prisma'
import { checkInsuranceTrigger } from './weatherService'
import { logger } from '../utils/logger'
import { Prisma } from '@prisma/client'

// ── Calculate payout amount for a triggered policy ───────────────────────────
export function calculatePayout(
  coveredHectares: number,
  payoutPerHectare: number,
  maxPayoutUsdc: number
): number {
  const rawPayout = coveredHectares * payoutPerHectare
  return Math.min(rawPayout, maxPayoutUsdc)
}

// ── Evaluate all active policies for trigger conditions ──────────────────────
// Called daily by cron job
export async function evaluateAllActivePolicies(): Promise<void> {
  const now = new Date()

  const activePolicies = await prisma.insurancePolicy.findMany({
    where: {
      status: 'ACTIVE',
      coverageStartDate: { lte: now },
      coverageEndDate: { gte: now }
    },
    include: { farm: true }
  })

  logger.info(`Evaluating ${activePolicies.length} active policies...`)

  for (const policy of activePolicies) {
    try {
      if (policy.triggerType === 'RAINFALL_DEFICIT' || policy.triggerType === 'EXCESS_RAINFALL') {
        // Derive region code from farm coordinates
        const regionCode = `${Math.round(policy.farm.latitude * 4) / 4}_${Math.round(policy.farm.longitude * 4) / 4}`

        const { triggered, actualValue } = await checkInsuranceTrigger(
          regionCode,
          policy.triggerType as 'RAINFALL_DEFICIT' | 'EXCESS_RAINFALL',
          policy.triggerThresholdMm,
          policy.triggerThresholdDays
        )

        if (triggered) {
          await processClaim(policy.id, actualValue)
        }
      }
    } catch (err) {
      logger.error(`Error evaluating policy ${policy.id}:`, err)
    }
  }
}

// ── Process a triggered claim ─────────────────────────────────────────────────
export async function processClaim(
  policyId: string,
  triggerValue: number
): Promise<{ claimId: string; payoutUsdc: number }> {
  return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const policy = await tx.insurancePolicy.findUniqueOrThrow({ where: { id: policyId } })

    if (policy.status !== 'ACTIVE') {
      throw new Error(`Policy ${policyId} is not active (status: ${policy.status})`)
    }

    const payoutUsdc = calculatePayout(
      policy.coveredHectares,
      policy.payoutPerHectare,
      policy.maxPayoutUsdc
    )

    // Check pool reserve
    if (policy.poolId) {
      const pool = await tx.yieldPool.findUnique({ where: { id: policy.poolId } })
      if (pool && pool.availableReserveUsdc < payoutUsdc) {
        logger.warn(`Pool ${policy.poolId} has insufficient reserve for policy ${policyId}. Partial payout.`)
      }
    }

    // Record claim
    const claim = await tx.claim.create({
      data: {
        policyId,
        triggerValue,
        payoutUsdc,
        status: 'PROCESSING'
      }
    })

    // Update policy status
    await tx.insurancePolicy.update({
      where: { id: policyId },
      data: { status: 'TRIGGERED' }
    })

    // Deduct from pool reserve
    if (policy.poolId) {
      await tx.yieldPool.update({
        where: { id: policy.poolId },
        data: {
          availableReserveUsdc: { decrement: payoutUsdc },
          totalClaimsPaidUsdc: { increment: payoutUsdc }
        }
      })
    }

    logger.info(
      `✅ Claim created: policyId=${policyId} payout=${payoutUsdc} USDC claimId=${claim.id}`
    )

    return { claimId: claim.id, payoutUsdc }
  })
}

// ── Mark claim as paid (called after blockchain tx confirms) ─────────────────
export async function markClaimPaid(claimId: string, txSignature: string): Promise<void> {
  await prisma.claim.update({
    where: { id: claimId },
    data: {
      status: 'PAID',
      txSignature,
      processedAt: new Date()
    }
  })
}
