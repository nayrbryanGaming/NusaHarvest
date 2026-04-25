import { Router, Request, Response } from 'express'
import axios from 'axios'
import { Connection, PublicKey } from '@solana/web3.js'
import { PolicyStatus } from '@prisma/client'
import { body, param, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'
import { RESERVE_RATIO, POOL_BASE_APY } from '../services/weatherService'

export const poolRouter = Router()

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = process.env.SOLANA_PROGRAM_ID || 'D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq'
const ACTIVE_POLICY_STATUSES: PolicyStatus[] = [PolicyStatus.ACTIVE, PolicyStatus.TRIGGERED]

function sum(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, value) => acc + (value ?? 0), 0)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return 'Unknown error'
}

function isDatabaseUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()
  const code = (error as { code?: string } | null)?.code
  return (
    code === 'P1001' ||
    message.includes("can't reach database server") ||
    message.includes('connection refused') ||
    message.includes('timed out')
  )
}

function normalizePoolSymbol(rawSymbol?: unknown): string {
  if (typeof rawSymbol !== 'string') return 'NH-RICE'
  const sanitized = rawSymbol.trim().toUpperCase()
  return sanitized.length > 0 ? sanitized : 'NH-RICE'
}

async function getProgramBalanceSol(): Promise<number | null> {
  try {
    const connection = new Connection(RPC_URL, 'confirmed')
    const programPublicKey = new PublicKey(PROGRAM_ID)
    const lamports = await connection.getBalance(programPublicKey)
    return lamports / 1e9
  } catch {
    return null
  }
}

async function getMarketPrices(): Promise<{ solPriceUsd: number | null; solPriceIdr: number | null; usdcToIdr: number | null }> {
  try {
    const response = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: {
        ids: 'solana,usd-coin',
        vs_currencies: 'usd,idr'
      },
      timeout: 8000
    })

    return {
      solPriceUsd: typeof response.data?.solana?.usd === 'number' ? response.data.solana.usd : null,
      solPriceIdr: typeof response.data?.solana?.idr === 'number' ? response.data.solana.idr : null,
      usdcToIdr: typeof response.data?.['usd-coin']?.idr === 'number' ? response.data['usd-coin'].idr : null
    }
  } catch {
    return {
      solPriceUsd: null,
      solPriceIdr: null,
      usdcToIdr: null
    }
  }
}

poolRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const pools = await prisma.pool.findMany({
      orderBy: { name: 'asc' },
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

    const data = pools.map((pool) => {
      const totalInvestmentUsdc = sum(pool.investments.map((investment) => investment.amountUsdc))
      const totalYieldUsdc = sum(pool.investments.map((investment) => investment.earnedYieldUsdc ?? 0))
      const activePolicies = pool.policies.filter((policy) => ACTIVE_POLICY_STATUSES.includes(policy.status as PolicyStatus)).length
      const totalPolicyCoverageUsdc = sum(pool.policies.map((policy) => policy.maxPayoutUsdc ?? 0))

      return {
        ...pool,
        computed: {
          totalInvestmentUsdc,
          totalYieldUsdc,
          activePolicies,
          totalPolicyCoverageUsdc
        }
      }
    })

    return res.json({ success: true, data })
  } catch (error: unknown) {
    if (isDatabaseUnavailable(error)) {
      return res.json({
        success: true,
        degraded: true,
        warning: 'Database unavailable. Returning empty pool list fallback.',
        data: []
      })
    }

    return res.status(500).json({ error: getErrorMessage(error) })
  }
})

poolRouter.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const weatherWindowStart = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [
      poolAggregate,
      investmentAggregate,
      claimAggregate,
      totalPolicies,
      activePolicies,
      totalClaims,
      weatherSamples24h,
      uniqueInvestors,
      activePolicyFarms,
      recentClaims,
      recentInvestments,
      programBalanceSol,
      marketPrices
    ] = await Promise.all([
      prisma.pool.aggregate({
        _sum: {
          availableReserveUsdc: true,
          totalTvlUsdc: true,
          totalClaimsPaidUsdc: true
        },
        _avg: {
          apy: true
        }
      }),
      prisma.investment.aggregate({
        _sum: {
          amountUsdc: true,
          earnedYieldUsdc: true
        }
      }),
      prisma.claim.aggregate({
        _sum: {
          payoutUsdc: true
        }
      }),
      prisma.insurancePolicy.count(),
      prisma.insurancePolicy.count({
        where: {
          status: {
            in: ACTIVE_POLICY_STATUSES
          }
        }
      }),
      prisma.claim.count(),
      prisma.weatherData.count({
        where: {
          recordedAt: {
            gte: weatherWindowStart
          }
        }
      }),
      prisma.investment.groupBy({
        by: ['userId']
      }),
      prisma.insurancePolicy.findMany({
        where: {
          status: {
            in: ACTIVE_POLICY_STATUSES
          }
        },
        select: {
          farm: {
            select: {
              hectares: true
            }
          }
        }
      }),
      prisma.claim.findMany({
        orderBy: {
          processedAt: 'desc'
        },
        take: 8,
        select: {
          id: true,
          payoutUsdc: true,
          status: true,
          processedAt: true,
          txSignature: true,
          policy: {
            select: {
              commodity: true,
              farm: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }),
      prisma.investment.findMany({
        orderBy: {
          stakedAt: 'desc'
        },
        take: 8,
        select: {
          id: true,
          amountUsdc: true,
          stakedAt: true,
          user: {
            select: {
              walletAddress: true
            }
          },
          pool: {
            select: {
              name: true,
              symbol: true
            }
          }
        }
      }),
      getProgramBalanceSol(),
      getMarketPrices()
    ])

    const totalTvlFromPools = poolAggregate._sum.totalTvlUsdc ?? 0
    const totalInvestedUsdc = investmentAggregate._sum.amountUsdc ?? 0
    const totalTvlUsdc = totalTvlFromPools > 0 ? totalTvlFromPools : totalInvestedUsdc
    const totalClaimsPaidFromPools = poolAggregate._sum.totalClaimsPaidUsdc ?? 0
    const totalClaimsPaidFromClaims = claimAggregate._sum.payoutUsdc ?? 0
    const totalClaimsPaidUsdc = Math.max(totalClaimsPaidFromPools, totalClaimsPaidFromClaims)
    const availableReserveUsdc = poolAggregate._sum.availableReserveUsdc ?? 0
    const avgApy = poolAggregate._avg.apy ?? null
    const totalEarnedYieldUsdc = investmentAggregate._sum.earnedYieldUsdc ?? 0
    const insuredHectares = activePolicyFarms.reduce((acc, item) => acc + (item.farm?.hectares ?? 0), 0)

    const programBalanceUsd =
      programBalanceSol === null
        ? null
        : marketPrices.solPriceUsd === null
          ? programBalanceSol === 0
            ? 0
            : null
          : programBalanceSol * marketPrices.solPriceUsd
    const programBalanceIdr =
      programBalanceSol === null
        ? null
        : marketPrices.solPriceIdr === null
          ? programBalanceSol === 0
            ? 0
            : null
          : programBalanceSol * marketPrices.solPriceIdr

    return res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        program: {
          id: PROGRAM_ID,
          rpcUrl: RPC_URL,
          balanceSol: programBalanceSol,
          balanceUsd: programBalanceUsd,
          balanceIdr: programBalanceIdr
        },
        finance: {
          totalTvlUsdc,
          availableReserveUsdc,
          totalInvestedUsdc,
          totalEarnedYieldUsdc,
          totalClaimsPaidUsdc,
          avgApy,
          reserveCoverageRatio: totalTvlUsdc > 0 ? availableReserveUsdc / totalTvlUsdc : null
        },
        insurance: {
          totalPolicies,
          activePolicies,
          totalClaims,
          insuredHectares
        },
        network: {
          activeInvestors: uniqueInvestors.length,
          weatherSamples24h,
          usdcToIdr: marketPrices.usdcToIdr,
          solPriceUsd: marketPrices.solPriceUsd,
          solPriceIdr: marketPrices.solPriceIdr
        },
        recent: {
          claims: recentClaims.map((claim) => ({
            id: claim.id,
            payoutUsdc: claim.payoutUsdc,
            status: claim.status,
            processedAt: claim.processedAt.toISOString(),
            txSignature: claim.txSignature,
            commodity: claim.policy.commodity,
            farmName: claim.policy.farm?.name ?? null
          })),
          investments: recentInvestments.map((investment) => ({
            id: investment.id,
            amountUsdc: investment.amountUsdc,
            stakedAt: investment.stakedAt.toISOString(),
            walletAddress: investment.user.walletAddress,
            poolName: investment.pool.name,
            poolSymbol: investment.pool.symbol
          }))
        }
      }
    })
  } catch (error: unknown) {
    if (isDatabaseUnavailable(error)) {
      const [programBalanceSol, marketPrices] = await Promise.all([getProgramBalanceSol(), getMarketPrices()])
      const programBalanceUsd =
        programBalanceSol === null
          ? null
          : marketPrices.solPriceUsd === null
            ? programBalanceSol === 0
              ? 0
              : null
            : programBalanceSol * marketPrices.solPriceUsd
      const programBalanceIdr =
        programBalanceSol === null
          ? null
          : marketPrices.solPriceIdr === null
            ? programBalanceSol === 0
              ? 0
              : null
            : programBalanceSol * marketPrices.solPriceIdr

      return res.json({
        success: true,
        degraded: true,
        warning: 'Database unavailable. Returning network-only fallback metrics.',
        data: {
          timestamp: new Date().toISOString(),
          program: {
            id: PROGRAM_ID,
            rpcUrl: RPC_URL,
            balanceSol: programBalanceSol,
            balanceUsd: programBalanceUsd,
            balanceIdr: programBalanceIdr
          },
          finance: {
            totalTvlUsdc: programBalanceUsd ?? 0,
            availableReserveUsdc: 0,
            totalInvestedUsdc: programBalanceUsd ?? 0,
            totalEarnedYieldUsdc: 0,
            totalClaimsPaidUsdc: 0,
            avgApy: null,
            reserveCoverageRatio: programBalanceUsd === null ? null : programBalanceUsd > 0 ? 1 : 0
          },
          insurance: {
            totalPolicies: 0,
            activePolicies: 0,
            totalClaims: 0,
            insuredHectares: 0
          },
          network: {
            activeInvestors: 0,
            weatherSamples24h: 0,
            usdcToIdr: marketPrices.usdcToIdr,
            solPriceUsd: marketPrices.solPriceUsd,
            solPriceIdr: marketPrices.solPriceIdr
          },
          recent: {
            claims: [],
            investments: []
          }
        }
      })
    }

    return res.status(500).json({ error: getErrorMessage(error) })
  }
})

poolRouter.post(
  '/stake-mvp',
  [
    body('walletAddress').isString().notEmpty(),
    body('amountUsdc').isFloat({ min: 0.01, max: 1_000_000 }),
    body('txSignature').isString().notEmpty(),
    body('poolSymbol').optional().isString().notEmpty()
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const walletAddress = String(req.body.walletAddress).trim()
    const amountUsdc = Number(req.body.amountUsdc)
    const txSignature = String(req.body.txSignature).trim()
    const poolSymbol = normalizePoolSymbol(req.body.poolSymbol)

    try {
      const user = await prisma.user.upsert({
        where: { walletAddress },
        update: {},
        create: {
          walletAddress,
          role: 'INVESTOR'
        }
      })

      const reserveIncrement = parseFloat((amountUsdc * RESERVE_RATIO).toFixed(2))
      const pool = await prisma.pool.upsert({
        where: { symbol: poolSymbol },
        update: {
          totalTvlUsdc: { increment: amountUsdc },
          availableReserveUsdc: { increment: reserveIncrement }
        },
        create: {
          name: `${poolSymbol} Pool`,
          symbol: poolSymbol,
          totalTvlUsdc: amountUsdc,
          availableReserveUsdc: reserveIncrement,
          apy: POOL_BASE_APY,
          isPaused: false
        }
      })

      const investment = await prisma.investment.create({
        data: {
          userId: user.id,
          poolId: pool.id,
          amountUsdc,
          shares: amountUsdc,
          earnedYieldUsdc: 0
        }
      })

      return res.status(201).json({
        success: true,
        data: {
          investmentId: investment.id,
          walletAddress,
          poolId: pool.id,
          poolSymbol: pool.symbol,
          amountUsdc: investment.amountUsdc,
          shares: investment.shares,
          txSignature,
          stakedAt: investment.stakedAt.toISOString()
        }
      })
    } catch (error: unknown) {
      if (isDatabaseUnavailable(error)) {
        return res.status(202).json({
          success: true,
          degraded: true,
          warning: 'Stake on-chain berhasil, tetapi pencatatan database sedang tertunda.',
          data: {
            walletAddress,
            poolSymbol,
            amountUsdc,
            txSignature,
            stakedAt: new Date().toISOString()
          }
        })
      }

      return res.status(500).json({ error: getErrorMessage(error) })
    }
  }
)

poolRouter.get(
  '/investments/wallet/:walletAddress',
  [param('walletAddress').isString().notEmpty()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const walletAddress = String(req.params.walletAddress).trim()
      const user = await prisma.user.findUnique({
        where: { walletAddress },
        select: { id: true }
      })

      if (!user) {
        return res.json({ success: true, data: [] })
      }

      const investments = await prisma.investment.findMany({
        where: { userId: user.id },
        include: {
          pool: {
            select: {
              id: true,
              name: true,
              symbol: true
            }
          }
        },
        orderBy: { stakedAt: 'desc' },
        take: 20
      })

      return res.json({
        success: true,
        data: investments.map((item) => ({
          id: item.id,
          amountUsdc: item.amountUsdc,
          shares: item.shares,
          earnedYieldUsdc: item.earnedYieldUsdc,
          stakedAt: item.stakedAt.toISOString(),
          pool: item.pool
        }))
      })
    } catch (error: unknown) {
      if (isDatabaseUnavailable(error)) {
        return res.json({
          success: true,
          degraded: true,
          warning: 'Database unavailable. Returning empty investment list fallback.',
          data: []
        })
      }

      return res.status(500).json({ error: getErrorMessage(error) })
    }
  }
)

poolRouter.get('/:poolId', async (req: Request, res: Response) => {
  try {
    const pool = await prisma.pool.findUnique({
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
  } catch (error: unknown) {
    return res.status(500).json({ error: getErrorMessage(error) })
  }
})