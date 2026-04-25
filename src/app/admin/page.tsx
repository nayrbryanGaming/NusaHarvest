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
  RefreshCw
} from 'lucide-react'
import { useWallet } from '../../providers/WalletProvider'
import Navbar from '../../components/Navbar'
import Link from 'next/link'
import { PROGRAM_ID_STR, RPC_URL } from '../../utils/constants'
import { getApiUrl } from '../../utils/api'

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

export default function AdminDashboard() {
  useWallet()
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

      setStats({
        tvl: tvlUsd,
        tvlIdr,
        insuredHa: 0,
        avgApy: 0,
        activePolicies: 0,
        totalClaims: 0,
        activeInvestors: 0,
        reserveCoverageRatio: null,
        claimToPolicyRatio: null,
        loading: false,
        backendConnected: false,
        lastSync: `${new Date().toLocaleTimeString('id-ID')} WIB`
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

  return (
    <main className="min-h-screen bg-[#02060c] text-slate-100 pb-20 overflow-hidden relative">
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-blue-500/5 to-transparent -z-10" />
      
      <Navbar />

      <div className="pt-28 px-6 max-w-7xl mx-auto">
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
      </div>
    </main>
  )
}
