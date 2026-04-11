'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  CloudRain,
  Database,
  Droplets,
  RefreshCw,
  RotateCcw,
  Shield,
  Wallet,
  Wind
} from 'lucide-react'
import Navbar from '../../components/Navbar'
import DeploymentStatus from '../../components/DeploymentStatus'
import { ConnectWalletButton, useWallet } from '../../providers/WalletProvider'
import { getApiUrl } from '../../utils/api'
import { PROGRAM_ID_STR } from '../../utils/constants'

type DashboardStats = {
  loading: boolean
  backendConnected: boolean
  slot: string
  solPriceIdr: number
  tvlUsdc: number
  activePolicies: number
  activeInvestors: number
  totalClaims: number
  reserveCoverageRatio: number | null
  riskLevel: string
  weatherRainMm: number | null
  weatherWindKmh: number | null
  weatherHumidityPct: number | null
  weatherRegion: string
  lastSync: string
}

type FeedItem = {
  id: string
  title: string
  subtitle: string
  amount?: string
  tag: string
  timestamp: string
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function shortAddress(address: string): string {
  if (address.length < 12) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatIdr(value: number): string {
  return `Rp ${Math.round(value).toLocaleString('id-ID')}`
}

function nowWibLabel(): string {
  return `${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} WIB`
}

function toProgressWidthClass(value: number): string {
  if (value >= 100) return 'w-full'
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
  if (value >= 5) return 'w-[5%]'
  return 'w-[4%]'
}

export default function DashboardPage() {
  const {
    connected,
    publicKey,
    balance,
    usdcBalance,
    connecting,
    disconnect,
    selectWallet,
    refreshBalance
  } = useWallet()

  const [stats, setStats] = useState<DashboardStats>({
    loading: true,
    backendConnected: false,
    slot: 'Loading...',
    solPriceIdr: 0,
    tvlUsdc: 0,
    activePolicies: 0,
    activeInvestors: 0,
    totalClaims: 0,
    reserveCoverageRatio: null,
    riskLevel: 'N/A',
    weatherRainMm: null,
    weatherWindKmh: null,
    weatherHumidityPct: null,
    weatherRegion: 'N/A',
    lastSync: '—'
  })

  const [feed, setFeed] = useState<FeedItem[]>([])

  const fetchDashboardData = useCallback(async () => {
    setStats((prev) => ({ ...prev, loading: true }))

    try {
      const [slotRpc, coingecko, metricsPayload, weatherPayload] = await Promise.all([
        fetch('https://api.devnet.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] })
        })
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=idr')
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null),
        (async () => {
          const url = getApiUrl('/api/pool/metrics')
          if (!url) return null
          const res = await fetch(url)
          if (!res.ok) return null
          return res.json()
        })().catch(() => null),
        (async () => {
          const url = getApiUrl('/api/weather/forecast?lat=-7.7078&lon=110.6101')
          if (!url) return null
          const res = await fetch(url)
          if (!res.ok) return null
          return res.json()
        })().catch(() => null)
      ])

      const slot = toNumber(slotRpc?.result)
      const solPriceIdr = toNumber(coingecko?.solana?.idr)

      const metricsData = metricsPayload?.success ? metricsPayload?.data : null
      const finance = metricsData?.finance || {}
      const insurance = metricsData?.insurance || {}
      const network = metricsData?.network || {}
      const recentClaims = Array.isArray(metricsData?.recent?.claims) ? metricsData.recent.claims : []
      const recentInvestments = Array.isArray(metricsData?.recent?.investments) ? metricsData.recent.investments : []

      const weatherData = weatherPayload?.success ? weatherPayload?.data : null
      const weatherCurrent = weatherData?.current || {}
      const weatherRisk = weatherData?.risk || {}
      const weatherLocation = weatherData?.location || {}

      const resolvedStats: DashboardStats = {
        loading: false,
        backendConnected: Boolean(metricsData),
        slot: slot > 0 ? slot.toLocaleString('id-ID') : stats.slot,
        solPriceIdr,
        tvlUsdc: toNumber(finance.totalTvlUsdc),
        activePolicies: toNumber(insurance.activePolicies),
        activeInvestors: toNumber(network.activeInvestors),
        totalClaims: toNumber(insurance.totalClaims),
        reserveCoverageRatio:
          typeof finance.reserveCoverageRatio === 'number' ? finance.reserveCoverageRatio : null,
        riskLevel: weatherRisk.riskLevel || 'N/A',
        weatherRainMm:
          typeof weatherCurrent.rainfallMm === 'number' ? weatherCurrent.rainfallMm : null,
        weatherWindKmh:
          typeof weatherCurrent.windSpeedKmh === 'number' ? weatherCurrent.windSpeedKmh : null,
        weatherHumidityPct:
          typeof weatherCurrent.humidityPercent === 'number' ? weatherCurrent.humidityPercent : null,
        weatherRegion: weatherLocation.regionCode || 'N/A',
        lastSync: nowWibLabel()
      }

      setStats(resolvedStats)

      const feedRows: FeedItem[] = [
        ...recentInvestments.slice(0, 4).map((item: any) => ({
          id: `stake-${item.id}`,
          title: `Stake ${item.poolSymbol || ''}`.trim(),
          subtitle: shortAddress(item.walletAddress || ''),
          amount: formatUsd(toNumber(item.amountUsdc)),
          tag: 'Investment',
          timestamp: item.stakedAt ? new Date(item.stakedAt).toLocaleString('id-ID') : nowWibLabel()
        })),
        ...recentClaims.slice(0, 4).map((item: any) => ({
          id: `claim-${item.id}`,
          title: `Claim ${item.commodity || 'Policy'}`,
          subtitle: item.farmName || 'Farm policy',
          amount: formatUsd(toNumber(item.payoutUsdc)),
          tag: 'Claim',
          timestamp: item.processedAt ? new Date(item.processedAt).toLocaleString('id-ID') : nowWibLabel()
        }))
      ]

      if (feedRows.length === 0) {
        feedRows.push({
          id: 'network-heartbeat',
          title: 'Network heartbeat',
          subtitle: `Slot #${resolvedStats.slot}`,
          tag: 'Live',
          timestamp: resolvedStats.lastSync
        })
      }

      setFeed(feedRows)
    } catch (error) {
      console.error('Dashboard fetch failed:', error)
      setStats((prev) => ({ ...prev, loading: false, lastSync: nowWibLabel() }))
    }
  }, [stats.slot])

  useEffect(() => {
    fetchDashboardData()
    const interval = window.setInterval(fetchDashboardData, 15000)
    return () => window.clearInterval(interval)
  }, [fetchDashboardData])

  const walletLabel = useMemo(() => {
    if (!connected || !publicKey) return 'Wallet belum terhubung'
    return shortAddress(publicKey)
  }, [connected, publicKey])

  const reservePct = stats.reserveCoverageRatio !== null ? Math.max(0, Math.min(100, stats.reserveCoverageRatio * 100)) : 0
  const reserveWidthClass = toProgressWidthClass(reservePct)
  const walletValueIdr = balance !== null ? balance * stats.solPriceIdr : 0
  const judgeNodes = useMemo(() => Array.from({ length: 25 }, (_, idx) => idx + 1), [])
  const selectedJudge = useMemo(() => {
    if (!publicKey) return 20
    let acc = 0
    for (let i = 0; i < publicKey.length; i += 1) {
      acc = (acc + publicKey.charCodeAt(i) * (i + 1)) % 10007
    }
    return (acc % 25) + 1
  }, [publicKey])
  const protocolSyncLabel = stats.backendConnected
    ? 'V1.9.0-STABLE-JUDICIAL-SYNC'
    : 'V1.9.0-DEGRADED-NETWORK-SYNC'
  const handshakeLabel = connected ? 'REAL-TIME HANDSHAKE (EXTENSION)' : 'WALLET BELUM TERHUBUNG'

  return (
    <main className="min-h-screen bg-[#02060c] text-slate-100 pb-20 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/10 blur-[140px] -z-10 rounded-full" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-blue-500/10 blur-[120px] -z-10 rounded-full" />

      <Navbar />

      <section className="pt-28 px-6 max-w-7xl mx-auto space-y-8">
        <div className="flex justify-center">
          <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest text-emerald-300 text-center">
            <CheckCircle2 size={12} />
            JUDICIAL VERIFICATION ACTIVE - PROTOCOL {protocolSyncLabel}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-8 rounded-[36px] border border-white/10"
        >
          <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6 items-start">
            <div>
              <h1 className="text-4xl md:text-6xl font-black tracking-tighter text-white mb-3 italic">
                Ikhtisar <span className="text-emerald-400">Lahan Hakim</span>
              </h1>
              <p className="text-slate-300 text-sm md:text-lg max-w-3xl">
                MASTER PROTOCOL SYNC ({protocolSyncLabel}) - REAL-TIME ACTIVE
              </p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mt-3">Last sync: {stats.lastSync}</p>

              <div className="mt-5 flex flex-wrap gap-3 items-center">
                <button
                  onClick={() => {
                    void refreshBalance()
                    void fetchDashboardData()
                  }}
                  className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest bg-rose-500/10 border border-rose-500/40 text-rose-300 hover:bg-rose-500/20 transition-all"
                >
                  PROTOCOL RESET (DEEP CACHE FLUSH)
                </button>
                <ConnectWalletButton className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all" />
                {connected && (
                  <>
                    <button
                      onClick={selectWallet}
                      disabled={connecting}
                      className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
                    >
                      Ganti Wallet
                    </button>
                    <button
                      onClick={disconnect}
                      disabled={connecting}
                      className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-all"
                    >
                      Disconnect
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    void refreshBalance()
                    void fetchDashboardData()
                  }}
                  title="Refresh data"
                  aria-label="Refresh data"
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-slate-300 hover:text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center justify-center"
                >
                  <RefreshCw size={15} className={stats.loading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div className="mt-6 grid sm:grid-cols-3 gap-3">
                {judgeNodes.map((node) => (
                  <div
                    key={node}
                    className={`rounded-2xl border px-3 py-3 text-center text-xs font-black tracking-widest transition-all ${
                      node === selectedJudge
                        ? 'bg-blue-500/80 border-blue-300 text-white'
                        : 'bg-white/[0.02] border-white/10 text-slate-300'
                    }`}
                  >
                    HAKIM #{node}
                  </div>
                ))}
              </div>

              <div className="mt-6 rounded-2xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                <div className="text-sm font-black text-emerald-300">Protocol Sync Status: {protocolSyncLabel}</div>
                <div className="text-xs text-slate-300 mt-1 break-all">Selected Wallet: {publicKey || 'Wallet belum terhubung'}</div>
              </div>
            </div>

            <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-6">
              <div className="text-[11px] font-black uppercase tracking-widest text-emerald-300 mb-4">Hakim Tak Terdaftar</div>
              <div className="rounded-2xl border border-emerald-500/20 bg-[#041018] p-4">
                <div className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{handshakeLabel}</div>
                <div className="mt-3 text-sm text-white font-black break-all">
                  {publicKey || 'Tidak ada alamat wallet aktif'}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-widest text-slate-400">
                  Judge Node #{selectedJudge}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-widest font-black">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-300">
                  Network Sync
                  <div className="mt-1 text-emerald-400">{stats.backendConnected ? 'Backend + Devnet' : 'Devnet fallback'}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-slate-300">
                  Active Claims
                  <div className="mt-1 text-blue-300">{stats.totalClaims.toLocaleString('id-ID')}</div>
                </div>
              </div>

              <button
                onClick={() => {
                  void fetchDashboardData()
                }}
                className="mt-5 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center justify-center gap-2"
              >
                <RotateCcw size={14} /> Manual Re-Handshake
              </button>
            </div>
          </div>

          <div className="mt-6">
            <DeploymentStatus compact />
          </div>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: 'Wallet Value',
              value: connected && balance !== null ? formatIdr(walletValueIdr) : '—',
              sub: connected && balance !== null ? `${balance.toFixed(4)} SOL` : 'Hubungkan wallet',
              icon: <Wallet size={18} className="text-emerald-400" />
            },
            {
              label: 'Protocol TVL',
              value: formatUsd(stats.tvlUsdc),
              sub: stats.backendConnected ? 'Backend metrics' : 'Fallback mode',
              icon: <Database size={18} className="text-amber-400" />
            },
            {
              label: 'Active Policies',
              value: stats.activePolicies.toLocaleString('id-ID'),
              sub: `Claims: ${stats.totalClaims.toLocaleString('id-ID')}`,
              icon: <Shield size={18} className="text-blue-400" />
            },
            {
              label: 'Solana Slot',
              value: `#${stats.slot}`,
              sub: `SOL ${formatIdr(stats.solPriceIdr)}`,
              icon: <Activity size={18} className="text-indigo-400" />
            }
          ].map((card) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel p-5 rounded-2xl border border-white/10 bg-white/[0.02]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</span>
                {card.icon}
              </div>
              <div className="text-xl md:text-2xl font-black text-white tracking-tight break-all">{card.value}</div>
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">{card.sub}</div>
            </motion.div>
          ))}
        </div>

        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-black text-white uppercase tracking-widest">Wallet & Quick Actions</h2>
                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">{walletLabel}</span>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">USDC Balance</div>
                  <div className="text-2xl font-black text-white">{connected && usdcBalance !== null ? `${usdcBalance.toFixed(2)} USDC` : '—'}</div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                  <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Active Investors</div>
                  <div className="text-2xl font-black text-white">{stats.activeInvestors.toLocaleString('id-ID')}</div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {[
                  { href: '/register', label: 'Register Farm', icon: <ArrowUpRight size={14} /> },
                  { href: '/pools', label: 'Yield Pools', icon: <Briefcase size={14} /> },
                  { href: '/market', label: 'Market Data', icon: <Database size={14} /> },
                  { href: '/admin', label: 'Admin Center', icon: <Shield size={14} /> }
                ].map((action) => (
                  <Link
                    key={action.href}
                    href={action.href}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/10 hover:bg-emerald-500/10 hover:border-emerald-500/30 text-xs font-black uppercase tracking-widest text-slate-200 transition-all flex items-center justify-between"
                  >
                    {action.label}
                    {action.icon}
                  </Link>
                ))}
              </div>
            </div>

            <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-white/[0.02]">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-5">Climate Snapshot</h3>
              <div className="grid md:grid-cols-4 gap-4">
                {[
                  { label: 'Risk Level', value: stats.riskLevel, icon: <CloudRain size={16} />, color: 'text-amber-400' },
                  {
                    label: 'Rainfall',
                    value: stats.weatherRainMm !== null ? `${stats.weatherRainMm.toFixed(2)} mm` : 'N/A',
                    icon: <CloudRain size={16} />,
                    color: 'text-emerald-400'
                  },
                  {
                    label: 'Humidity',
                    value: stats.weatherHumidityPct !== null ? `${stats.weatherHumidityPct.toFixed(0)}%` : 'N/A',
                    icon: <Droplets size={16} />,
                    color: 'text-blue-400'
                  },
                  {
                    label: 'Wind',
                    value: stats.weatherWindKmh !== null ? `${stats.weatherWindKmh.toFixed(1)} km/h` : 'N/A',
                    icon: <Wind size={16} />,
                    color: 'text-cyan-400'
                  }
                ].map((item) => (
                  <div key={item.label} className="p-4 rounded-2xl bg-white/[0.02] border border-white/10">
                    <div className={`inline-flex items-center gap-2 ${item.color} mb-2`}>{item.icon}<span className="text-[10px] font-black uppercase tracking-widest">{item.label}</span></div>
                    <div className="text-lg font-black text-white">{item.value}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 text-[10px] uppercase tracking-widest font-black text-slate-500">Region code: {stats.weatherRegion}</div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-white/[0.02]">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Protocol Health</h2>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">
                    <span>Reserve Coverage</span>
                    <span className="text-white">{reservePct.toFixed(2)}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 border border-white/10 p-0.5">
                    <div className={`h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 ${reserveWidthClass}`} />
                  </div>
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 text-xs text-slate-400 leading-relaxed">
                  Program ID: <span className="text-slate-200 font-mono break-all">{PROGRAM_ID_STR}</span>
                </div>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-3xl border border-white/10 bg-white/[0.02]">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">Live Feed</h2>
              <div className="space-y-3 max-h-[420px] overflow-auto pr-1">
                {feed.map((item) => (
                  <div key={item.id} className="p-3 rounded-xl bg-white/[0.02] border border-white/10">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-black text-white">{item.title}</div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">{item.tag}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">{item.subtitle}</div>
                    {item.amount && <div className="text-sm font-black text-emerald-400 mt-1">{item.amount}</div>}
                    <div className="text-[10px] text-slate-600 mt-1">{item.timestamp}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
