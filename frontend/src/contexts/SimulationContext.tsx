'use client'

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

export type WeatherMode = 'normal' | 'drought' | 'flood'
export type ClaimStatus = 'none' | 'pending' | 'processing' | 'paid'

export interface FarmerEntity {
  id: string
  name: string
  region: string
  cooperative: string
  crop: string
  ha: number
  fundingStatus: 'funded' | 'pending' | 'partial'
  policyId: string | null
  wallet: string
}

export interface PoolPosition {
  poolId: string
  poolName: string
  invested: number    // USDC
  apy: number
  earned: number      // USDC accrued
  joinedAt: string
}

export interface ClaimEvent {
  id: string
  farmId: string
  farmName: string
  crop: string
  triggerReason: string
  amount: number      // USDC
  txSig: string
  timestamp: string
  status: ClaimStatus
}

export interface FundFlowStep {
  from: string
  to: string
  amount: number
  status: 'completed' | 'in-progress' | 'pending'
  timestamp: string
}

interface SimState {
  // Weather simulation
  weatherMode: WeatherMode
  rainfallMm: number
  tempC: number
  humidityPct: number
  windKmh: number
  lastWeatherUpdate: string

  // Insurance / triggers
  activeTriggers: string[]   // policy IDs currently triggered
  recentClaims: ClaimEvent[]
  claimProcessing: boolean

  // Wallet portfolio (shown when wallet connected)
  portfolioPositions: PoolPosition[]
  totalInvestedUsdc: number
  estimatedRoiPct: number
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH'

  // Fund flow data
  fundFlow: FundFlowStep[]

  // Farmers
  farmers: FarmerEntity[]

  // Controls
  setWeatherMode: (mode: WeatherMode) => void
  triggerClaimManual: (policyId: string) => void
  resetClaims: () => void
  refreshWeather: () => void
}

const FARMERS: FarmerEntity[] = [
  { id: 'FRM-0214', name: 'Pak Rizal Banda',    region: 'Maluku Tengah',       cooperative: 'KOP-0031', crop: 'Pala',          ha: 3.2, fundingStatus: 'funded',  policyId: 'POL-2119', wallet: 'A1bC...d2Ef' },
  { id: 'FRM-0201', name: 'Ibu Sari Wulandari', region: 'Lampung Barat',       cooperative: 'KOP-0042', crop: 'Kopi Robusta',  ha: 4.2, fundingStatus: 'funded',  policyId: 'POL-2208', wallet: 'B3cD...e4Fg' },
  { id: 'FRM-0187', name: 'Pak Sutrisno',       region: 'Klaten, Jawa Tengah', cooperative: 'KOP-0017', crop: 'Padi Ciherang', ha: 1.8, fundingStatus: 'funded',  policyId: 'POL-2191', wallet: 'C5dE...f6Gh' },
  { id: 'FRM-0172', name: 'Pak Hendra Jaya',    region: 'Jambi',               cooperative: 'KOP-0055', crop: 'Kelapa Sawit',  ha: 8.5, fundingStatus: 'funded',  policyId: 'POL-2177', wallet: 'D7eF...g8Hi' },
  { id: 'FRM-0163', name: 'Ibu Marlina',        region: 'Lombok Tengah',       cooperative: 'KOP-0029', crop: 'Jagung',        ha: 2.1, fundingStatus: 'partial', policyId: 'POL-2140', wallet: 'E9fG...h0Ij' },
  { id: 'FRM-0151', name: 'Pak Agus Setiawan',  region: 'Solo, Jawa Tengah',   cooperative: 'KOP-0017', crop: 'Padi IR-64',    ha: 1.2, fundingStatus: 'pending', policyId: null,       wallet: 'F1gH...i2Jk' },
]

const BASE_CLAIMS: ClaimEvent[] = [
  {
    id: 'CLM-0041', farmId: 'FRM-0163', farmName: 'Ladang Subur Raya', crop: 'Jagung',
    triggerReason: 'Curah hujan 12mm < threshold 35mm selama 30 hari',
    amount: 1050, txSig: '4xKq...m7Np', timestamp: '2026-04-25T09:14:32Z', status: 'paid',
  },
  {
    id: 'CLM-0038', farmId: 'FRM-0214', farmName: 'Kebun Pala Banda', crop: 'Pala',
    triggerReason: 'Curah hujan 268mm > threshold 250mm dalam 7 hari',
    amount: 3200, txSig: '7yRs...n8Oq', timestamp: '2026-04-22T14:07:11Z', status: 'paid',
  },
]

const WEATHER_PROFILES: Record<WeatherMode, { rain: number; temp: number; humidity: number; wind: number }> = {
  normal:  { rain: 82,  temp: 26.4, humidity: 68, wind: 12.1 },
  drought: { rain: 11,  temp: 33.8, humidity: 34, wind: 18.5 },
  flood:   { rain: 312, temp: 22.1, humidity: 94, wind: 31.2 },
}

function makePortfolio(): PoolPosition[] {
  return [
    { poolId: 'POOL-001', poolName: 'Padi Stability Pool',  invested: 500,  apy: 8.2,  earned: 11.23, joinedAt: '2026-03-15' },
    { poolId: 'POOL-002', poolName: 'Kopi Growth Pool',     invested: 1200, apy: 11.5, earned: 38.01, joinedAt: '2026-02-28' },
    { poolId: 'POOL-003', poolName: 'Multi-Crop Reserve',   invested: 300,  apy: 9.0,  earned: 7.44,  joinedAt: '2026-04-01' },
  ]
}

function makeFundFlow(): FundFlowStep[] {
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().replace('T',' ').slice(0,16)+' WIB'
  return [
    { from: 'Investor', to: 'Yield Pool',   amount: 2000, status: 'completed',   timestamp: fmt(new Date(now.getTime()-3*86400000)) },
    { from: 'Yield Pool', to: 'Koperasi',   amount: 1600, status: 'completed',   timestamp: fmt(new Date(now.getTime()-2*86400000)) },
    { from: 'Koperasi', to: 'Petani',       amount: 1200, status: 'in-progress', timestamp: fmt(new Date(now.getTime()-1*86400000)) },
    { from: 'Oracle', to: 'Payout Trigger', amount: 1050, status: 'completed',   timestamp: fmt(new Date(now.getTime()-2*3600000)) },
  ]
}

const SimCtx = createContext<SimState | null>(null)

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [weatherMode, setWeatherModeState] = useState<WeatherMode>('normal')
  const [claims, setClaims] = useState<ClaimEvent[]>(BASE_CLAIMS)
  const [claimProcessing, setClaimProcessing] = useState(false)
  const [lastWeatherUpdate, setLastWeatherUpdate] = useState(() => {
    const d = new Date()
    return d.toISOString().replace('T',' ').slice(0,16)+' WIB'
  })

  const profile = WEATHER_PROFILES[weatherMode]

  const setWeatherMode = useCallback((mode: WeatherMode) => {
    setWeatherModeState(mode)
    const d = new Date()
    setLastWeatherUpdate(d.toISOString().replace('T',' ').slice(0,16)+' WIB')
  }, [])

  const refreshWeather = useCallback(() => {
    const d = new Date()
    setLastWeatherUpdate(d.toISOString().replace('T',' ').slice(0,16)+' WIB')
  }, [])

  const triggerClaimManual = useCallback((policyId: string) => {
    setClaimProcessing(true)
    setTimeout(() => {
      const newClaim: ClaimEvent = {
        id: `CLM-${String(Math.floor(Math.random()*9000+1000))}`,
        farmId: 'FRM-SIM', farmName: 'Simulasi Farm',
        crop: 'Multi-komoditas',
        triggerReason: weatherMode === 'drought'
          ? `Curah hujan ${profile.rain}mm < threshold — dipicu admin simulasi`
          : `Curah hujan ${profile.rain}mm > threshold — dipicu admin simulasi`,
        amount: Math.round((Math.random() * 2000 + 500) * 100) / 100,
        txSig: Math.random().toString(36).slice(2,8).toUpperCase() + '...' + Math.random().toString(36).slice(2,6).toUpperCase(),
        timestamp: new Date().toISOString(),
        status: 'processing',
      }
      setClaims(prev => [newClaim, ...prev])
      setClaimProcessing(false)
      // Transition to paid after 3s
      setTimeout(() => {
        setClaims(prev => prev.map(c => c.id === newClaim.id ? { ...c, status: 'paid' } : c))
      }, 3000)
    }, 2000)
  }, [weatherMode, profile.rain])

  const resetClaims = useCallback(() => {
    setClaims(BASE_CLAIMS)
  }, [])

  // Derive active triggers from weather mode
  const activeTriggers: string[] = weatherMode === 'drought'
    ? ['POL-2140', 'POL-2191']
    : weatherMode === 'flood'
    ? ['POL-2119', 'POL-2208']
    : ['POL-2140', 'POL-2119']

  const positions = makePortfolio()
  const totalInvested = positions.reduce((s, p) => s + p.invested, 0)

  const value: SimState = {
    weatherMode,
    rainfallMm:   profile.rain,
    tempC:        profile.temp,
    humidityPct:  profile.humidity,
    windKmh:      profile.wind,
    lastWeatherUpdate,
    activeTriggers,
    recentClaims: claims,
    claimProcessing,
    portfolioPositions: positions,
    totalInvestedUsdc:  totalInvested,
    estimatedRoiPct:    9.4,
    riskLevel:    totalInvested > 1500 ? 'MEDIUM' : 'LOW',
    fundFlow:     makeFundFlow(),
    farmers:      FARMERS,
    setWeatherMode,
    triggerClaimManual,
    resetClaims,
    refreshWeather,
  }

  return <SimCtx.Provider value={value}>{children}</SimCtx.Provider>
}

export function useSim() {
  const ctx = useContext(SimCtx)
  if (!ctx) throw new Error('useSim must be used within SimulationProvider')
  return ctx
}
