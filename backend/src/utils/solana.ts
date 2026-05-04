import { Connection, Keypair, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from '@solana/web3.js'
import { logger } from './logger'

// Constants for Nusa Harvest Protocol on Devnet
let cachedConnection: Connection | null = null
let cachedOracleKeypair: Keypair | null = null

function getConnection(): Connection {
  if (cachedConnection) return cachedConnection
  const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com'
  cachedConnection = new Connection(rpcUrl, 'confirmed')
  return cachedConnection
}

function getOracleKeypair(): Keypair {
  if (cachedOracleKeypair) return cachedOracleKeypair

  const secretKey = process.env.PROTOCOL_ORACLE_PRIVATE_KEY
  if (!secretKey) {
    throw new Error('PROTOCOL_ORACLE_PRIVATE_KEY is required for on-chain payout operations')
  }

  try {
    cachedOracleKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)))
    return cachedOracleKeypair
  } catch {
    throw new Error('PROTOCOL_ORACLE_PRIVATE_KEY format is invalid. Expected JSON array of numbers.')
  }
}

/**
 * Executes a REAL On-Chain Insurance Payout
 * This is triggered by the Parametric Oracle when weather thresholds are breached.
 */
export async function executePayoutTransaction(
  farmerAddress: string,
  amountSol: number,
  policyId: string
): Promise<string> {
  logger.info(`🚨 ORACLE: Initiating Payout for Policy ${policyId} to ${farmerAddress}`)

  try {
    const connection = getConnection()
    const oracleKeypair = getOracleKeypair()
    const farmerPubkey = new PublicKey(farmerAddress)
    
    // Create a transaction to transfer SOL (or USDC in V2) from Protocol Vault
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: oracleKeypair.publicKey,
        toPubkey: farmerPubkey,
        lamports: amountSol * 1e9, // Convert SOL to Lamports
      })
    )

    // Sign and send the transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [oracleKeypair]
    )

    logger.info(`✅ PAYOUT SUCCESSFUL: ${signature}`)
    return signature
  } catch (err: any) {
    logger.error(`❌ PAYOUT FAILED for Policy ${policyId}:`, err.message)
    throw new Error(`On-chain payout failed: ${err.message}`)
  }
}

/**
 * Verify On-Chain Transaction Hash
 */
export async function verifyTransaction(signature: string): Promise<boolean> {
  const connection = getConnection()
  const result = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  })
  return result !== null
}
