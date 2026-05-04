import { Connection, PublicKey } from '@solana/web3.js'
import { Program, AnchorProvider } from '@coral-xyz/anchor'
import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
const PROGRAM_ID = new PublicKey(process.env.PROGRAM_ID || '3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt')

let connection: Connection | null = null

function getConnection(): Connection {
  if (!connection) {
    connection = new Connection(RPC_URL, 'confirmed')
  }
  return connection
}

// ── Fetch Pool State from On-Chain Smart Contract ─────────────────────────────
export async function fetchPoolState(poolAddress: string) {
  try {
    const conn = getConnection()
    const pubkey = new PublicKey(poolAddress)
    
    const accountInfo = await conn.getAccountInfo(pubkey)
    if (!accountInfo) {
      logger.warn(`Pool account not found: ${poolAddress}`)
      return null
    }

    // Parse pool state from account data
    // This is a simplified version - actual parsing depends on your Anchor IDL
    const poolData = {
      address: poolAddress,
      balance: accountInfo.lamports,
      owner: accountInfo.owner.toString(),
      executable: accountInfo.executable,
      dataLength: accountInfo.data.length,
      lastSync: new Date()
    }

    logger.info(`✅ Fetched pool state: ${poolAddress}`)
    return poolData
  } catch (err) {
    logger.error(`❌ Failed to fetch pool state for ${poolAddress}:`, err)
    return null
  }
}

// ── Fetch All Pools from Smart Contract ──────────────────────────────────────
export async function indexAllPools(programId: PublicKey = PROGRAM_ID) {
  try {
    const conn = getConnection()
    
    // Get all accounts owned by this program
    const accounts = await conn.getProgramAccounts(programId, {
      filters: [
        { dataSize: 256 } // Approximate size for PoolState accounts
      ]
    })

    logger.info(`Found ${accounts.length} pool accounts in smart contract`)

    for (const account of accounts) {
      try {
        const poolData = {
          onchainAddress: account.pubkey.toString(),
          balance: account.account.lamports,
          owner: account.account.owner.toString(),
          dataSize: account.account.data.length,
          indexed: new Date()
        }

        // Store to database
        await prisma.pool.upsert({
          where: { onchainAddress: poolData.onchainAddress },
          create: poolData,
          update: {
            balance: poolData.balance,
            dataSize: poolData.dataSize,
            indexed: poolData.indexed
          }
        })

        logger.info(`📦 Indexed pool: ${poolData.onchainAddress.slice(0, 8)}...`)
      } catch (err) {
        logger.error(`Failed to index pool account:`, err)
      }
    }

    logger.info(`✅ Completed indexing ${accounts.length} pools`)
  } catch (err) {
    logger.error(`❌ Failed to index pools:`, err)
  }
}

// ── Watch for Recent Transactions ───────────────────────────────────────────
export async function watchRecentTransactions(programId: PublicKey = PROGRAM_ID) {
  try {
    const conn = getConnection()
    
    // Get latest signatures
    const signatures = await conn.getSignaturesForAddress(programId, {
      limit: 10
    })

    logger.info(`Found ${signatures.length} recent transactions`)

    for (const sig of signatures) {
      try {
        const tx = await conn.getTransaction(sig.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        })

        if (tx && tx.meta) {
          logger.info(`Transaction: ${sig.signature}`)
          logger.info(`  Status: ${tx.meta.err ? 'Failed' : 'Success'}`)
          logger.info(`  Fee: ${tx.meta.fee} lamports`)
          
          // Store important transactions
          if (!tx.meta.err) {
            await prisma.transaction.upsert({
              where: { signature: sig.signature },
              create: {
                signature: sig.signature,
                programId: programId.toString(),
                status: 'SUCCESS',
                fee: tx.meta.fee,
                timestamp: new Date(sig.blockTime ? sig.blockTime * 1000 : Date.now()),
                logs: tx.meta.logMessages?.join('\n') || ''
              },
              update: {
                status: 'SUCCESS',
                fee: tx.meta.fee,
                timestamp: new Date(sig.blockTime ? sig.blockTime * 1000 : Date.now())
              }
            })
          }
        }
      } catch (err) {
        logger.error(`Failed to process transaction:`, err)
      }
    }

    logger.info(`✅ Completed watching ${signatures.length} transactions`)
  } catch (err) {
    logger.error(`❌ Failed to watch transactions:`, err)
  }
}

// ── Get Real-Time Pool Metrics ──────────────────────────────────────────────
export async function getPoolMetrics() {
  try {
    const totalPools = await prisma.pool.count()
    const totalBalance = await prisma.pool.aggregate({
      _sum: { balance: true }
    })

    const metrics = {
      totalPools,
      totalBalance: totalBalance._sum?.balance || 0,
      totalBalanceSOL: (totalBalance._sum?.balance || 0) / 1_000_000_000,
      lastSync: new Date(),
      rpcUrl: RPC_URL,
      programId: PROGRAM_ID.toString()
    }

    logger.info(`📊 Pool Metrics: ${totalPools} pools, ${metrics.totalBalanceSOL.toFixed(2)} SOL`)
    return metrics
  } catch (err) {
    logger.error(`❌ Failed to get pool metrics:`, err)
    return null
  }
}

// ── Sync Admin Panel Data from On-Chain ─────────────────────────────────────
export async function syncAdminMetrics() {
  try {
    const metrics = await getPoolMetrics()
    if (!metrics) return null

    // Calculate TVL and other admin metrics
    const policies = await prisma.insurancePolicy.count({
      where: { status: 'ACTIVE' }
    })

    const claims = await prisma.claim.count({
      where: { status: 'APPROVED' }
    })

    const adminMetrics = {
      tvlUsd: metrics.totalBalanceSOL * 200, // Rough USDC equivalent (adjust exchange rate)
      tvlIdr: metrics.totalBalanceSOL * 200 * 15000, // Rough IDR conversion
      activePolicies: policies,
      totalClaims: claims,
      avgApy: 9.4, // From simulation
      backendConnected: true,
      lastSync: new Date()
    }

    logger.info(`✅ Admin metrics synced:`, adminMetrics)
    return adminMetrics
  } catch (err) {
    logger.error(`❌ Failed to sync admin metrics:`, err)
    return null
  }
}
