'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Shield,
  TrendingUp,
  Zap,
  Database,
  BarChart3,
  Globe,
  ArrowRight,
  RefreshCw,
  CloudRain,
  AlertCircle
} from 'lucide-react'
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram } from '@solana/web3.js'
import { useWallet } from '../../providers/WalletProvider'
import Sidebar from '../../components/Sidebar'
import { useSim } from '../../contexts/SimulationContext'
import Link from 'next/link'
import { PROGRAM_ID_STR, RPC_URL, USDC_MINT_STR } from '../../utils/constants'
import { INSURANCE_PROGRAM_ID_STR } from '../../utils/onchain'
import { getApiUrl } from '../../utils/api'
import toast from 'react-hot-toast'

const ADMIN_WALLETS = [
  'ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m', // Treasury + protocol admin
  '35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr', // Deploy authority
]

// Simulated baseline admin stats
const SIM_ADMIN = {
  tvl: 18_450, tvlIdr: 291_510_000,
  insuredHa: 21.0, avgApy: 9.4,
  activePolicies: 5, totalClaims: 2,
  activeInvestors: 8,
}

type DashboardStats = {
  tvl: number
  tvlIdr: number
  insuredHa: number
  avgApy: number
  activePolicies: number
  totalClaims: number
  activeInvestors: number
  reserveCoverageRatio: number | null
  claimToPolicyRatio: number | null
  loading: boolean
  backendConnected: boolean
  lastSync: string
}

type LedgerEntry = {
  id: string
  type: string
  amount: string
  user: string
  status: 'Recorded' | 'Live'
  timestamp: number
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`
}

function shortenAddress(value: string | null | undefined): string {
  if (!value) return '.......'
  if (value.length < 12) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function toProgressWidthClass(value: number): string {
  if (value >= 95) return 'w-[95%]'
  if (value >= 90) return 'w-[90%]'
  if (value >= 80) return 'w-[80%]'
  if (value >= 70) return 'w-[70%]'
  if (value >= 60) return 'w-[60%]'
  if (value >= 50) return 'w-[50%]'
  if (value >= 40) return 'w-[40%]'
  if (value >= 30) return 'w-[30%]'
  if (value >= 20) return 'w-[20%]'
  if (value >= 10) return 'w-[10%]'
  return 'w-[5%]'
}

// ── On-chain instruction helpers ─────────────────────────────────────────────

async function computeAnchorDiscriminator(instructionName: string): Promise<Buffer> {
  const preimage = new TextEncoder().encode(`global:${instructionName}`)
  const hash = await crypto.subtle.digest('SHA-256', preimage)
  return Buffer.from(hash).slice(0, 8)
}

function borshStr(s: string): Buffer {
  const b = Buffer.from(s, 'utf8')
  const lenBuf = Buffer.allocUnsafe(4)
  lenBuf.writeUInt32LE(b.length, 0)
  return Buffer.concat([lenBuf, b])
}

function borshU64(n: number): Buffer {
  const buf = Buffer.allocUnsafe(8)
  buf.writeBigUInt64LE(BigInt(Math.max(0, Math.floor(n))), 0)
  return buf
}

export default function AdminDashboard() {
  const { publicKey, connected, signAndSendTransaction } = useWallet()
  const isAdmin = connected && publicKey ? ADMIN_WALLETS.includes(publicKey) : false
  const sim = useSim()
  const [stats, setStats] = useState<DashboardStats>({
    tvl: 0,
    tvlIdr: 0,
    insuredHa: 0,
    avgApy: 0,
    activePolicies: 0,
    totalClaims: 0,
    activeInvestors: 0,
    reserveCoverageRatio: null,
    claimToPolicyRatio: null,
    loading: true,
    backendConnected: false,
    lastSync: ''
  })
  const [recentLedger, setRecentLedger] = useState<LedgerEntry[]>([])
  const [settlementSeries, setSettlementSeries] = useState<number[]>([])

  // ── Weather update form state ──
  const [weatherRegion, setWeatherRegion] = useState('Klaten_JawaTengah')
  const [weatherMm, setWeatherMm] = useState('25')
  const [weatherPending, setWeatherPending] = useState(false)
  const [weatherTxSig, setWeatherTxSig] = useState<string | null>(null)
  const [weatherError, setWeatherError] = useState<string | null>(null)

  // ── Trigger claim form state ──
  const [claimFarmer, setClaimFarmer] = useState('')
  const [claimPolicyId, setClaimPolicyId] = useState('')
  const [claimRegion, setClaimRegion] = useState('Klaten_JawaTengah')
  const [claimPending, setClaimPending] = useState(false)
  const [claimTxSig, setClaimTxSig] = useState<string | null>(null)
  const [claimError, setClaimError] = useState<string | null>(null)

  const fetchLiveStats = useCallback(async () => {
    setStats(prev => ({ ...prev, loading: true }))

    const applyFallback = async () => {
      const [rpcData, cgData] = await Promise.all([
        fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [PROGRAM_ID_STR]
          })
        }).then((res) => (res.ok ? res.json() : null)),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd,idr')
          .then((res) => (res.ok ? res.json() : null))
      ])

      const lamports = toNumber(rpcData?.result?.value)
      const solBalance = lamports / 1e9
      const solPriceUsd = toNumber(cgData?.solana?.usd)
      const solPriceIdr = toNumber(cgData?.solana?.idr)

      const tvlUsd = solBalance * solPriceUsd
      const tvlIdr = solBalance * solPriceIdr

      // Prefer sim baseline over $0 when backend unreachable
      const displayTvl = tvlUsd > 1 ? tvlUsd : SIM_ADMIN.tvl
      const displayTvlIdr = tvlIdr > 1 ? tvlIdr : SIM_ADMIN.tvlIdr
      setStats({
        tvl:             displayTvl,
        tvlIdr:          displayTvlIdr,
        insuredHa:       SIM_ADMIN.insuredHa,
        avgApy:          SIM_ADMIN.avgApy,
        activePolicies:  SIM_ADMIN.activePolicies,
        totalClaims:     SIM_ADMIN.totalClaims,
        activeInvestors: SIM_ADMIN.activeInvestors,
        reserveCoverageRatio: 68,
        claimToPolicyRatio: (SIM_ADMIN.totalClaims / SIM_ADMIN.activePolicies) * 100,
        loading: false,
        backendConnected: false,
        lastSync: `${new Date().toLocaleTimeString('id-ID')} WIB (sim)`
      })

      setRecentLedger([
        {
          id: 'RPC',
          type: 'Program balance (fallback)',
          amount: formatUsd(tvlUsd),
          user: shortenAddress(PROGRAM_ID_STR),
          status: 'Live',
          timestamp: Date.now()
        }
      ])
      setSettlementSeries(tvlUsd > 0 ? [tvlUsd] : [])
    }

    try {
      const metricsApiUrl = getApiUrl('/api/pool/metrics')
      if (!metricsApiUrl) {
        await applyFallback()
        return
      }

      const metricsResponse = await fetch(metricsApiUrl)
      if (!metricsResponse.ok) {
        await applyFallback()
        return
      }

      const metricsPayload = await metricsResponse.json()
      if (!metricsPayload?.success || !metricsPayload?.data) {
        await applyFallback()
        return
      }

      const data = metricsPayload.data
      const tvl = toNumber(data.finance?.totalTvlUsdc)
      const usdcToIdr = toNumber(data.network?.usdcToIdr)
      const tvlIdr = usdcToIdr > 0 ? tvl * usdcToIdr : toNumber(data.program?.balanceIdr)
      const totalPolicies = Math.max(1, toNumber(data.insurance?.totalPolicies, 1))
      const claimToPolicyRatio = toNumber(data.insurance?.totalClaims) / totalPolicies

      setStats({
        tvl,
        tvlIdr,
        insuredHa: toNumber(data.insurance?.insuredHectares),
        avgApy: toNumber(data.finance?.avgApy),
        activePolicies: toNumber(data.insurance?.activePolicies),
        totalClaims: toNumber(data.insurance?.totalClaims),
        activeInvestors: toNumber(data.network?.activeInvestors),
        reserveCoverageRatio:
          typeof data.finance?.reserveCoverageRatio === 'number' ? data.finance.reserveCoverageRatio : null,
        claimToPolicyRatio,
        loading: false,
        backendConnected: true,
        lastSync: `${new Date().toLocaleTimeString('id-ID')} WIB`
      })

      const claims = Array.isArray(data.recent?.claims) ? data.recent.claims : []
      const investments = Array.isArray(data.recent?.investments) ? data.recent.investments : []

      const claimEntries: LedgerEntry[] = claims.map((claim: any) => ({
        id: String(claim.id || 'claim'),
        type: `Claim payout (${claim.commodity || 'Unknown commodity'})`,
        amount: formatUsd(toNumber(claim.payoutUsdc)),
        user: claim.farmName ? String(claim.farmName) : 'Farm policy',
        status: 'Recorded',
        timestamp: new Date(claim.processedAt || Date.now()).getTime()
      }))

      const investmentEntries: LedgerEntry[] = investments.map((investment: any) => ({
        id: String(investment.id || 'investment'),
        type: `Stake ${investment.poolSymbol || ''}`.trim(),
        amount: formatUsd(toNumber(investment.amountUsdc)),
        user: shortenAddress(investment.walletAddress),
        status: 'Recorded',
        timestamp: new Date(investment.stakedAt || Date.now()).getTime()
      }))

      const ledgerRows = [...claimEntries, ...investmentEntries]
        .sort((left, right) => right.timestamp - left.timestamp)
        .slice(0, 8)

      setRecentLedger(ledgerRows)
      setSettlementSeries(
        [...investmentEntries.map((item) => toNumber(Number(item.amount.replace(/[$,]/g, '')))), ...claimEntries.map((item) => toNumber(Number(item.amount.replace(/[$,]/g, ''))))]
          .filter((value) => value > 0)
          .slice(0, 12)
      )
    } catch (e) {
      console.error('Stats fetch error:', e)
      try {
        await applyFallback()
      } catch {
        setStats(prev => ({ ...prev, loading: false }))
      }
    }
  }, [])

  useEffect(() => {
    fetchLiveStats()
    const interval = setInterval(fetchLiveStats, 30000)
    return () => clearInterval(interval)
  }, [fetchLiveStats])

  // ── On-chain: update_weather_data ─────────────────────────────────────────
  const submitUpdateWeather = useCallback(async () => {
    if (!publicKey) { setWeatherError('Hubungkan wallet admin dulu'); return }
    if (!INSURANCE_PROGRAM_ID_STR) { setWeatherError('Set NEXT_PUBLIC_INSURANCE_PROGRAM_ID di .env.local'); return }
    const mm = parseInt(weatherMm, 10)
    if (!weatherRegion.trim() || isNaN(mm) || mm < 0) { setWeatherError('Isi region dan curah hujan yang valid'); return }
    setWeatherPending(true); setWeatherError(null); setWeatherTxSig(null)
    try {
      const disc = await computeAnchorDiscriminator('update_weather_data')
      const data = Buffer.concat([disc, borshStr(weatherRegion.trim()), borshU64(mm), borshStr('Manual_Admin_Devnet')])
      const adminPk = new PublicKey(publicKey)
      const pid = new PublicKey(INSURANCE_PROGRAM_ID_STR)
      const [weatherPda] = PublicKey.findProgramAddressSync([Buffer.from('weather'), Buffer.from(weatherRegion.trim())], pid)
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: weatherPda, isSigner: false, isWritable: true },
          { pubkey: adminPk,    isSigner: true,  isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: pid,
        data,
      })
      const connection = new Connection(RPC_URL, 'confirmed')
      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = adminPk
      tx.add(ix)
      const result = await signAndSendTransaction(tx)
      setWeatherTxSig(result.signature ?? null)
      console.log(`[admin] update_weather_data region=${weatherRegion} mm=${mm} tx=${result.signature}`)
      toast.success(`Cuaca diperbarui! ${result.signature?.slice(0, 8)}…`)
    } catch (e: any) {
      const msg = e?.message || 'Transaction gagal'
      setWeatherError(msg)
      toast.error('Update cuaca gagal: ' + msg)
    } finally {
      setWeatherPending(false)
    }
  }, [publicKey, weatherRegion, weatherMm, signAndSendTransaction])

  // ── On-chain: trigger_claim ───────────────────────────────────────────────
  const submitTriggerClaim = useCallback(async () => {
    if (!publicKey) { setClaimError('Hubungkan wallet admin dulu'); return }
    if (!INSURANCE_PROGRAM_ID_STR) { setClaimError('Set NEXT_PUBLIC_INSURANCE_PROGRAM_ID di .env.local'); return }
    if (!claimFarmer.trim() || !claimPolicyId.trim() || !claimRegion.trim()) {
      setClaimError('Isi farmer wallet, policy ID, dan region'); return
    }
    setClaimPending(true); setClaimError(null); setClaimTxSig(null)
    try {
      const disc = await computeAnchorDiscriminator('trigger_claim')
      const adminPk     = new PublicKey(publicKey)
      const farmerPk    = new PublicKey(claimFarmer.trim())
      const pid         = new PublicKey(INSURANCE_PROGRAM_ID_STR)
      const usdcMint    = new PublicKey(USDC_MINT_STR)
      const TOKEN_PROG  = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
      const ASSOC_PROG  = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJe1bLp')
      const [policyPda]        = PublicKey.findProgramAddressSync([Buffer.from('policy'), farmerPk.toBuffer(), Buffer.from(claimPolicyId.trim())], pid)
      const [weatherPda]       = PublicKey.findProgramAddressSync([Buffer.from('weather'), Buffer.from(claimRegion.trim())], pid)
      const [insuranceStatePda]= PublicKey.findProgramAddressSync([Buffer.from('insurance_state')], pid)
      const [insuranceReserve] = PublicKey.findProgramAddressSync([insuranceStatePda.toBuffer(), TOKEN_PROG.toBuffer(), usdcMint.toBuffer()], ASSOC_PROG)
      const [farmerUsdc]       = PublicKey.findProgramAddressSync([farmerPk.toBuffer(), TOKEN_PROG.toBuffer(), usdcMint.toBuffer()], ASSOC_PROG)
      const ix = new TransactionInstruction({
        keys: [
          { pubkey: policyPda,         isSigner: false, isWritable: true  },
          { pubkey: weatherPda,        isSigner: false, isWritable: false },
          { pubkey: insuranceStatePda, isSigner: false, isWritable: false },
          { pubkey: adminPk,           isSigner: true,  isWritable: true  },
          { pubkey: insuranceReserve,  isSigner: false, isWritable: true  },
          { pubkey: farmerUsdc,        isSigner: false, isWritable: true  },
          { pubkey: TOKEN_PROG,        isSigner: false, isWritable: false },
        ],
        programId: pid,
        data: disc,
      })
      const connection = new Connection(RPC_URL, 'confirmed')
      const { blockhash } = await connection.getLatestBlockhash()
      const tx = new Transaction()
      tx.recentBlockhash = blockhash
      tx.feePayer = adminPk
      tx.add(ix)
      const result = await signAndSendTransaction(tx)
      setClaimTxSig(result.signature ?? null)
      console.log(`[admin] trigger_claim policy=${policyPda.toBase58()} tx=${result.signature}`)
      toast.success(`Klaim ditrigger! ${result.signature?.slice(0, 8)}…`)
    } catch (e: any) {
      const msg = e?.message || 'Transaction gagal'
      setClaimError(msg)
      toast.error('Trigger klaim gagal: ' + msg)
    } finally {
      setClaimPending(false)
    }
  }, [publicKey, claimFarmer, claimPolicyId, claimRegion, signAndSendTransaction])

  const METRICS = [
    {
      label: 'Total Value Locked (USDC)',
      value: stats.loading ? '...' : formatUsd(stats.tvl),
      change: stats.backendConnected ? 'Backend Metrics' : 'On-chain Fallback',
      icon: <Database className="text-amber-400" size={20} />
    },
    {
      label: 'TVL (IDR)',
      value: stats.loading ? '...' : formatIdr(stats.tvlIdr),
      change: 'CoinGecko FX',
      icon: <TrendingUp className="text-blue-400" size={20} />
    },
    {
      label: 'Active Policies',
      value: stats.loading ? '...' : stats.activePolicies.toLocaleString('id-ID'),
      change: 'Database',
      icon: <Globe className="text-emerald-400" size={20} />
    },
    {
      label: 'Average Pool APY',
      value: stats.loading ? '...' : `${stats.avgApy.toFixed(2)}%`,
      change: 'Pool Aggregation',
      icon: <Zap className="text-purple-400" size={20} />
    }
  ]

  const maxSeriesValue = Math.max(...settlementSeries, 1)
  const reserveRatioPct = stats.reserveCoverageRatio !== null ? stats.reserveCoverageRatio * 100 : 0
  const claimRatioPct = stats.claimToPolicyRatio !== null ? stats.claimToPolicyRatio * 100 : 0
  const reserveRatioWidthClass = toProgressWidthClass(Math.max(0, Math.min(100, reserveRatioPct)))
  const claimRatioWidthClass = toProgressWidthClass(Math.max(0, Math.min(100, claimRatioPct)))

  if (!connected) {
    return (
      <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] items-center justify-center">
        <div className="text-center">
          <Shield size={40} className="text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-black text-white mb-2">Admin Center</h2>
          <p className="font-mono text-[12px] text-slate-500">Hubungkan wallet untuk verifikasi akses</p>
        </div>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
            <Shield size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black text-white mb-2">Akses Ditolak</h2>
          <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
            Wallet <span className="text-red-400">{publicKey?.slice(0,6)}...{publicKey?.slice(-4)}</span> tidak ada dalam daftar admin.<br />
            Hubungi tim NusaHarvest untuk whitelist.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Admin Center</span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-blue-900/40 bg-blue-950/30 text-blue-400 hidden sm:block">Protocol Governance</span>
        </div>
        <div className="flex-1 relative overflow-auto">
          <div className="absolute top-0 left-0 w-full h-[400px] bg-gradient-to-b from-blue-500/5 to-transparent -z-10 pointer-events-none" />

      <div className="px-8 pt-8 pb-16 max-w-5xl mx-auto">
        <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="text-4xl font-black mb-2 tracking-tighter">Command <span className="text-emerald-400">Center</span></h1>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Protocol governance with backend + on-chain verification.</p>
          </div>
          <div className="flex gap-3">
             <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                <div className={`w-1.5 h-1.5 rounded-full ${stats.loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400 shadow-[0_0_10px_#10b981]'} `} /> 
               Sync: {stats.loading ? 'Verifying...' : stats.backendConnected ? 'Protocol Live' : 'Direct On-Chain'}
             </div>
             <button
               onClick={fetchLiveStats}
               title="Refresh admin stats"
               aria-label="Refresh admin stats"
               className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all"
             >
                <RefreshCw size={14} className={stats.loading ? 'animate-spin' : ''} />
             </button>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {METRICS.map((statsRow, i) => (
            <motion.div
              key={statsRow.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="hover-lift glass-panel p-6 rounded-3xl group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-white/5 rounded-2xl border border-white/10 group-hover:scale-110 transition-transform">{statsRow.icon}</div>
                <div className="flex items-center gap-1 text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                  {statsRow.change}
                </div>
              </div>
              <div className="text-slate-500 text-[10px] font-black uppercase tracking-widest mb-1">{statsRow.label}</div>
              <div className="text-2xl font-black tracking-tighter text-white">
                {statsRow.value === '...' ? 'Syncing...' : statsRow.value}
              </div>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
             <div className="glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01] relative overflow-hidden">
              <div className="flex items-center justify-between mb-10">
                <h3 className="font-black text-lg flex items-center gap-2 uppercase tracking-tighter text-white"><BarChart3 size={20} className="text-blue-400"/> Settlement Volume (24h)</h3>
                <div className="flex gap-4">
                   <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Deposits</span>
                   <span className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-blue-500" /> Claims</span>
                </div>
              </div>
              
              <div className="flex items-end justify-between h-48 gap-3 relative z-10">
                {settlementSeries.map((volume, i) => {
                  const heightPx = Math.max(14, Math.round((volume / maxSeriesValue) * 140))
                  return (
                  <motion.div 
                    key={i} 
                    initial={{ height: 0 }} 
                    animate={{ height: `${heightPx}px` }} 
                    transition={{ delay: i * 0.05, duration: 1 }}
                    className="flex-1 bg-gradient-to-t from-emerald-600/20 to-emerald-400/40 rounded-t-xl group relative"
                  >
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-white text-slate-950 text-[10px] font-black px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-xl">
                      {formatUsd(volume)}
                    </div>
                  </motion.div>
                  )
                })}
                {settlementSeries.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-500">
                    No recent settlement data
                  </div>
                )}
              </div>
              <div className="absolute inset-0 bg-blue-500/5 blur-[100px] -z-0" />
            </div>

            <div className="glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01]">
                <h3 className="font-black text-sm text-emerald-400 uppercase tracking-[0.2em] mb-8">Recent Protocol Ledger</h3>
                <div className="space-y-4">
                    {recentLedger.map((tx) => (
                        <div key={tx.id} className="flex items-center justify-between p-5 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                            <div className="flex items-center gap-4">
                                <div className="text-xs font-mono text-slate-600">[{tx.id.slice(0, 8)}]</div>
                                <div>
                                    <div className="text-sm font-bold text-white">{tx.user}</div>
                                    <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">{tx.type}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-black text-emerald-400">{tx.amount}</div>
                                <div className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${tx.status === 'Recorded' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>{tx.status}</div>
                            </div>
                        </div>
                    ))}
                    {recentLedger.length === 0 && (
                      <div className="p-5 rounded-3xl bg-white/[0.02] border border-white/5 text-sm text-slate-500 text-center">
                        Tidak ada aktivitas terbaru dari backend.
                      </div>
                    )}
                </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01]">
              <h3 className="font-bold text-white mb-8 flex items-center gap-2 uppercase tracking-widest text-xs">Security Metrics</h3>
              <div className="space-y-8">
                {[
                  { label: 'Reserve Ratio',         pct: reserveRatioPct, grad: 'linear-gradient(to right,#059669,#34d399)', glow: 'rgba(52,211,153,0.5)' },
                  { label: 'Claims / Policy Ratio',  pct: claimRatioPct,   grad: 'linear-gradient(to right,#2563eb,#60a5fa)', glow: 'rgba(96,165,250,0.5)' },
                ].map(r => (
                  <div key={r.label}>
                    <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 mb-2.5 tracking-widest">
                      <span>{r.label}</span>
                      <span className="text-white font-black tabular-nums">{r.pct.toFixed(2)}%</span>
                    </div>
                    <div className="progress-track">
                      <motion.div
                        className="progress-fill"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(3, Math.min(100, r.pct))}%` }}
                        transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
                        style={{ background: r.grad, boxShadow: `0 0 14px ${r.glow}` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-12 space-y-4">
                  <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Protocol Version</span>
                    <span className="text-emerald-400 font-bold text-xs">v1.1.0</span>
                  </div>
                  <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/5">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Last Sync</span>
                    <span className="text-white font-bold text-xs">{stats.lastSync || 'Bebas Antri'}</span>
                  </div>
                  <Link href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} target="_blank" className="w-full py-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 rounded-2xl flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400 transition-all">
                    Verify On-Chain <ArrowRight size={14} />
                  </Link>
              </div>
            </div>
          </div>
        </div>

        {/* ── Simulation Control Panel ── */}
        <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0,transition:{delay:0.3,duration:0.4}}}
          className="mt-8 glass-panel p-8 rounded-[40px] border border-purple-500/20 bg-purple-950/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
              <Zap className="text-purple-400" size={18}/>
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">Simulation Engine</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Override weather · Trigger claims · Admin control</p>
            </div>
            <div className="ml-auto font-mono text-[10px] text-slate-600">
              Mode: <span className={`font-bold ${sim.weatherMode==='normal'?'text-emerald-400':sim.weatherMode==='drought'?'text-orange-400':'text-blue-400'}`}>{sim.weatherMode.toUpperCase()}</span>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {([['normal','Normal','emerald'],['drought','Kekeringan','orange'],['flood','Banjir','blue']] as const).map(([mode, label, col]) => (
              <button
                type="button"
                key={mode}
                onClick={() => sim.setWeatherMode(mode)}
                className={`p-4 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all ${
                  sim.weatherMode === mode
                    ? `bg-${col}-500/20 border-${col}-500/40 text-${col}-400`
                    : 'bg-white/[0.03] border-white/[0.08] text-slate-500 hover:text-white'
                }`}
              >
                Sim: {label}
                <div className="font-mono text-[9px] font-normal mt-1 capitalize text-current/60">
                  {mode==='normal' ? `${sim.rainfallMm}mm normal` : mode==='drought' ? `${sim.rainfallMm}mm < threshold` : `${sim.rainfallMm}mm > threshold`}
                </div>
              </button>
            ))}
          </div>
          <div className="flex flex-col md:flex-row gap-4">
            <button
              type="button"
              onClick={() => sim.triggerClaimManual('SIM-001')}
              disabled={sim.claimProcessing}
              className="flex-1 py-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50"
            >
              {sim.claimProcessing ? '⏳ Processing claim...' : '⚡ Trigger Manual Claim'}
            </button>
            <button
              type="button"
              onClick={() => { sim.resetClaims(); sim.setWeatherMode('normal') }}
              className="flex-1 py-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-slate-400 font-black text-xs uppercase tracking-widest transition-all"
            >
              ↺ Reset Simulation
            </button>
          </div>

          {/* Recent Claims Feed */}
          {sim.recentClaims.length > 0 && (
            <div className="mt-6 pt-6 border-t border-white/[0.05]">
              <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500 mb-3">Recent Claims Feed</p>
              <div className="space-y-2">
                {sim.recentClaims.slice(0, 4).map(c => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <div>
                      <p className="font-mono text-[10px] text-slate-300">{c.id} · {c.farmName}</p>
                      <p className="font-mono text-[9px] text-slate-600 mt-0.5">{c.triggerReason}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[11px] text-emerald-400">${c.amount.toLocaleString()} USDC</p>
                      <p className={`font-mono text-[9px] ${c.status==='paid'?'text-emerald-600':c.status==='processing'?'text-amber-400 animate-pulse':'text-slate-600'}`}>
                        {c.status.toUpperCase()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>

        {/* ── On-Chain Admin Operations ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0, transition: { delay: 0.4, duration: 0.4 } }}
          className="mt-8 glass-panel p-8 rounded-[40px] border border-blue-500/20 bg-blue-950/10"
        >
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <CloudRain className="text-blue-400" size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-widest">On-Chain Admin Operations</h3>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Instruksi langsung ke smart contract — {INSURANCE_PROGRAM_ID_STR ? `Program: ${INSURANCE_PROGRAM_ID_STR.slice(0,10)}…` : 'Set NEXT_PUBLIC_INSURANCE_PROGRAM_ID'}
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* ── Update Weather Data ── */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <CloudRain size={13} /> Update Cuaca On-Chain
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Region ID</label>
                  <input
                    type="text"
                    placeholder="Klaten_JawaTengah"
                    value={weatherRegion}
                    onChange={e => setWeatherRegion(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Curah Hujan 30d (mm)</label>
                  <input
                    type="number"
                    placeholder="25"
                    min="0"
                    value={weatherMm}
                    onChange={e => setWeatherMm(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 font-mono"
                  />
                </div>
                <p className="text-[9px] text-slate-600 font-mono">Data source: Manual_Admin_Devnet (hardcoded)</p>
                {weatherError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-400 font-mono break-words">{weatherError}</p>
                  </div>
                )}
                {weatherTxSig && (
                  <a
                    href={`https://explorer.solana.com/tx/${weatherTxSig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-400 font-mono break-all hover:underline block p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                  >
                    ✅ Tx: {weatherTxSig.slice(0, 24)}… (lihat di Explorer ↗)
                  </a>
                )}
                <button
                  type="button"
                  onClick={submitUpdateWeather}
                  disabled={weatherPending || !INSURANCE_PROGRAM_ID_STR}
                  className="w-full py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 text-emerald-400 font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {weatherPending ? <><RefreshCw size={12} className="animate-spin" /> Processing…</> : '⛅ Submit Update Cuaca'}
                </button>
              </div>
            </div>

            {/* ── Trigger Claim ── */}
            <div className="space-y-4">
              <h4 className="text-xs font-black text-red-400 uppercase tracking-widest flex items-center gap-2">
                <Zap size={13} /> Trigger Klaim On-Chain
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Farmer Wallet (Pubkey)</label>
                  <input
                    type="text"
                    placeholder="Base58 pubkey..."
                    value={claimFarmer}
                    onChange={e => setClaimFarmer(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Policy ID</label>
                  <input
                    type="text"
                    placeholder="POL-TEST-001"
                    value={claimPolicyId}
                    onChange={e => setClaimPolicyId(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-1.5">Region ID</label>
                  <input
                    type="text"
                    placeholder="Klaten_JawaTengah"
                    value={claimRegion}
                    onChange={e => setClaimRegion(e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-red-500/50 font-mono"
                  />
                </div>
                {claimError && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                    <AlertCircle size={12} className="text-red-400 mt-0.5 shrink-0" />
                    <p className="text-[10px] text-red-400 font-mono break-words">{claimError}</p>
                  </div>
                )}
                {claimTxSig && (
                  <a
                    href={`https://explorer.solana.com/tx/${claimTxSig}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-emerald-400 font-mono break-all hover:underline block p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20"
                  >
                    ✅ Tx: {claimTxSig.slice(0, 24)}… (lihat di Explorer ↗)
                  </a>
                )}
                <button
                  type="button"
                  onClick={submitTriggerClaim}
                  disabled={claimPending || !INSURANCE_PROGRAM_ID_STR}
                  className="w-full py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-black text-xs uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {claimPending ? <><RefreshCw size={12} className="animate-spin" /> Processing…</> : '⚡ Trigger Klaim (On-Chain)'}
                </button>
                <p className="text-[9px] text-slate-600 font-mono">PDA dihitung otomatis dari farmer + policyId + region</p>
              </div>
            </div>
          </div>
        </motion.div>

      </div>{/* max-w-5xl mx-auto */}
        </div>{/* flex-1 overflow-auto */}
      </div>{/* flex-1 column */}
    </div>
  )
}
