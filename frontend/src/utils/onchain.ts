/**
 * On-chain data fetchers for NusaHarvest programs.
 * Uses raw RPC deserialization since IDLs aren't generated until `anchor build` is run.
 * Once built, replace with @coral-xyz/anchor Program class for type safety.
 */

import { Connection, PublicKey } from '@solana/web3.js'
import { RPC_URL, PROGRAM_ID_STR } from './constants'

export const POOL_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_POOL_PROGRAM_ID || PROGRAM_ID_STR
)

export const INSURANCE_PROGRAM_ID_STR =
  process.env.NEXT_PUBLIC_INSURANCE_PROGRAM_ID || ''

export const POOL_STATE_SEED = Buffer.from('pool_state')

// ── Pool State ────────────────────────────────────────────────────────────────

export interface PoolStateData {
  admin: string
  treasury: string
  totalTvlUsdc: number
  totalReserveUsdc: number
  totalLoansActiveUsdc: number
  activePoliciesCount: number
  protocolFeeBps: number
  initializedAt: number
}

export async function fetchPoolState(): Promise<PoolStateData | null> {
  try {
    const connection = new Connection(RPC_URL, { commitment: 'confirmed' })
    const [pda] = PublicKey.findProgramAddressSync([POOL_STATE_SEED], POOL_PROGRAM_ID)

    const info = await Promise.race([
      connection.getAccountInfo(pda, 'confirmed'),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])

    if (!info || !info.data || info.data.length < 121) return null

    // Skip 8-byte Anchor discriminator
    const data = info.data.slice(8)
    let offset = 0

    const admin = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32
    const treasury = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32
    const totalTvlUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const totalReserveUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const totalLoansActiveUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const activePoliciesCount = Number(data.readBigUInt64LE(offset)); offset += 8
    const protocolFeeBps = Number(data.readBigUInt64LE(offset)); offset += 8
    const initializedAt = Number(data.readBigInt64LE(offset)); offset += 8

    return {
      admin,
      treasury,
      totalTvlUsdc,
      totalReserveUsdc,
      totalLoansActiveUsdc,
      activePoliciesCount,
      protocolFeeBps,
      initializedAt,
    }
  } catch {
    return null
  }
}

export function getPoolStatePda(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync([POOL_STATE_SEED], POOL_PROGRAM_ID)
  return pda
}

// ── Policy Account ────────────────────────────────────────────────────────────

export type PolicyStatus = 'Active' | 'Triggered' | 'Expired' | 'Cancelled' | 'Unknown'

export interface PolicyData {
  farmer: string
  policyId: string
  commodity: string
  region: string
  coverageUsdc: number
  rainThresholdMm: number
  coverageStart: number
  coverageEnd: number
  premiumPaidUsdc: number
  subsidyUsdc: number
  adminFeeUsdc: number
  status: PolicyStatus
  claimAmountUsdc: number
  claimedAt: number
  createdAt: number
}

export function getPolicyPda(farmerPubkey: string, policyId: string): PublicKey {
  if (!INSURANCE_PROGRAM_ID_STR) return PublicKey.default
  const insuranceProgramId = new PublicKey(INSURANCE_PROGRAM_ID_STR)
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), new PublicKey(farmerPubkey).toBuffer(), Buffer.from(policyId)],
    insuranceProgramId
  )
  return pda
}

export async function fetchPolicyAccount(farmerPubkey: string, policyId: string): Promise<PolicyData | null> {
  if (!INSURANCE_PROGRAM_ID_STR) return null

  try {
    const connection = new Connection(RPC_URL, { commitment: 'confirmed' })
    const pda = getPolicyPda(farmerPubkey, policyId)

    const info = await Promise.race([
      connection.getAccountInfo(pda, 'confirmed'),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])

    if (!info || !info.data || info.data.length < 50) return null

    // Deserialize Anchor account (skip 8-byte discriminator)
    const data = info.data.slice(8)
    let offset = 0

    const farmer = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32

    // String: 4-byte LE length + bytes
    const readStr = (): string => {
      const len = data.readUInt32LE(offset); offset += 4
      const str = data.slice(offset, offset + len).toString('utf8'); offset += len
      return str
    }

    const policyId_ = readStr()
    const commodity = readStr()
    const region = readStr()

    const coverageUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const rainThresholdMm = Number(data.readBigUInt64LE(offset)); offset += 8
    const coverageStart = Number(data.readBigInt64LE(offset)); offset += 8
    const coverageEnd = Number(data.readBigInt64LE(offset)); offset += 8
    const premiumPaidUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const subsidyUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const adminFeeUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8

    // Enum: 1 byte variant tag
    const statusByte = data[offset]; offset += 1
    const statusMap: PolicyStatus[] = ['Active', 'Triggered', 'Expired', 'Cancelled']
    const status: PolicyStatus = statusMap[statusByte] ?? 'Unknown'

    const claimAmountUsdc = Number(data.readBigUInt64LE(offset)) / 1e6; offset += 8
    const claimedAt = Number(data.readBigInt64LE(offset)); offset += 8
    const createdAt = Number(data.readBigInt64LE(offset)); offset += 8

    return {
      farmer,
      policyId: policyId_,
      commodity,
      region,
      coverageUsdc,
      rainThresholdMm,
      coverageStart,
      coverageEnd,
      premiumPaidUsdc,
      subsidyUsdc,
      adminFeeUsdc,
      status,
      claimAmountUsdc,
      claimedAt,
      createdAt,
    }
  } catch {
    return null
  }
}

// ── Weather Data ──────────────────────────────────────────────────────────────

export interface WeatherData {
  regionId: string
  rainfallMm30d: number
  updatedAt: number
  dataSource: string
  admin: string
}

export async function fetchWeatherData(regionId: string): Promise<WeatherData | null> {
  if (!INSURANCE_PROGRAM_ID_STR) return null

  try {
    const connection = new Connection(RPC_URL, { commitment: 'confirmed' })
    const insuranceProgramId = new PublicKey(INSURANCE_PROGRAM_ID_STR)
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from('weather'), Buffer.from(regionId)],
      insuranceProgramId
    )

    const info = await Promise.race([
      connection.getAccountInfo(pda, 'confirmed'),
      new Promise<null>((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
    ])

    if (!info || !info.data || info.data.length < 50) return null

    const data = info.data.slice(8)
    let offset = 0

    const readStr = (): string => {
      const len = data.readUInt32LE(offset); offset += 4
      const str = data.slice(offset, offset + len).toString('utf8'); offset += len
      return str
    }

    const regionId_ = readStr()
    const rainfallMm30d = Number(data.readBigUInt64LE(offset)); offset += 8
    const updatedAt = Number(data.readBigInt64LE(offset)); offset += 8
    const dataSource = readStr()
    const admin = new PublicKey(data.slice(offset, offset + 32)).toBase58(); offset += 32

    return { regionId: regionId_, rainfallMm30d, updatedAt, dataSource, admin }
  } catch {
    return null
  }
}
