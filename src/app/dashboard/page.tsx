'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CloudRain, Shield, AlertTriangle, CheckCircle, TrendingDown, RefreshCw, Activity, ArrowRight, Sun, Wind, Droplets, Zap, Loader2 } from 'lucide-react'
import { Connection } from '@solana/web3.js'
import { useWallet } from '../../providers/WalletProvider'
import toast from 'react-hot-toast'
import Navbar from '../../components/Navbar'
import { getApiUrl } from '../../utils/api'
import { RPC_URL } from '../../utils/constants'
import { createPolicyTransaction } from '../../utils/solana'

const DEMO_WEATHER = {
  location: { lat: -7.7078, lon: 110.6101, regionCode: 'Klaten, Jawa Tengah' },
  current: { rainfallMm: 1.2, temperatureCelsius: 29.4, humidityPercent: 78, windSpeed: 12, description: 'Sebagian Berawan' },
  daily: [
    { date: '10/10', rainfallMm: 1.2 }, { date: '11/10', rainfallMm: 0.0 },
    { date: '12/10', rainfallMm: 3.5 }, { date: '13/10', rainfallMm: 0.5 },
    { date: '14/10', rainfallMm: 8.0 }, { date: '15/10', rainfallMm: 2.1 },
    { date: '16/10', rainfallMm: 0.0 }
  ],
  risk: { droughtIndex: -1.4, rollingRainfall30d: 28.3, droughtRiskScore: 73.4, excessRainRiskScore: 2, overallRiskScore: 44.0, riskLevel: 'HIGH' as const }
}

const RISK_BADGES: Record<string, string> = {
  LOW: 'text-emerald-300 bg-emerald-900/40 border-emerald-500/40 shadow-[0_0_10px_rgba(52,211,153,0.3)]',
  MEDIUM: 'text-amber-300 bg-amber-900/40 border-amber-500/40 shadow-[0_0_10px_rgba(251,191,36,0.3)]',
  HIGH: 'text-orange-300 bg-orange-900/40 border-orange-500/40 shadow-[0_0_10px_rgba(249,115,22,0.3)] text-glow',
  CRITICAL: 'text-red-300 bg-red-900/40 border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.5)] text-glow'
}

const STAGGER = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { staggerChildren: 0.1 } }
}
const ITEM = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 }
}

const INSURANCE_ORDER = {
  commodityLabel: 'Padi Ciherang',
  commoditySymbol: 'RICE',
  coveredHectares: 1,
  triggerType: 'RAINFALL_DEFICIT' as const,
  triggerThresholdMm: 40,
  payoutPerHectareUsdc: 500,
  coverageDays: 120,
  displayPremiumUsdc: 38.5,
  latitude: -7.7078,
  longitude: 110.6101
}

const LOCAL_POLICY_KEY_PREFIX = 'nusa_harvest_policy_'

type PurchaseMvpApiResponse = {
  success?: boolean
  error?: string
  data?: {
    policyId: string
    status: string
    premiumPaidUsdc: number
    maxPayoutUsdc: number
    txSignature?: string | null
    coverageStartDate?: string
    coverageEndDate?: string
  }
}

type LatestPolicyApiResponse = {
  success?: boolean
  data?: {
    policyId: string
    status: string
    premiumPaidUsdc?: number | null
    maxPayoutUsdc?: number | null
    txSignature?: string | null
    coverageStartDate?: string | null
    coverageEndDate?: string | null
  } | null
}

type LocalPolicySnapshot = {
  policyId: string
  status: string
  premiumPaidUsdc: number
  maxPayoutUsdc: number
  txSignature: string
  coverageStartDate: string
  coverageEndDate: string
}

type SolanaWalletProvider = {
  isConnected?: boolean
  signAndSendTransaction?: (transaction: unknown) => Promise<{ signature?: string }>
}

function formatUsdc(amount: number): string {
  if (!Number.isFinite(amount)) return '$0.00 USDC'
  return `$${amount.toFixed(2)} USDC`
}

function formatCoveragePeriod(startDateRaw?: string | null, endDateRaw?: string | null): string {
  if (!startDateRaw || !endDateRaw) return 'Aktif 120 Hari'

  const startDate = new Date(startDateRaw)
  const endDate = new Date(endDateRaw)
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'Aktif 120 Hari'

  return `${startDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}`
}

function getLocalPolicyKey(walletAddress: string): string {
  return `${LOCAL_POLICY_KEY_PREFIX}${walletAddress}`
}

function readLocalPolicy(walletAddress: string): LocalPolicySnapshot | null {
  try {
    const rawValue = localStorage.getItem(getLocalPolicyKey(walletAddress))
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as LocalPolicySnapshot
    if (!parsed.policyId || !parsed.txSignature) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalPolicy(walletAddress: string, policy: LocalPolicySnapshot): void {
  localStorage.setItem(getLocalPolicyKey(walletAddress), JSON.stringify(policy))
}

export default function DashboardPage() {
  const { publicKey, connected } = useWallet()
  const [weather] = useState(DEMO_WEATHER)
  const [loading, setLoading] = useState(false)
  const [activePolicy, setActivePolicy] = useState(false)
  const [policyTx, setPolicyTx] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [premiumUsdc, setPremiumUsdc] = useState(INSURANCE_ORDER.displayPremiumUsdc)
  const [maxPayoutUsdc, setMaxPayoutUsdc] = useState(INSURANCE_ORDER.payoutPerHectareUsdc)
  const [coverageLabel, setCoverageLabel] = useState('Aktif 120 Hari')
  const [buyingInsurance, setBuyingInsurance] = useState(false)

  useEffect(() => {
    if (!connected || !publicKey) {
      setActivePolicy(false)
      setPolicyId('')
      setPolicyTx('')
      setPremiumUsdc(INSURANCE_ORDER.displayPremiumUsdc)
      setMaxPayoutUsdc(INSURANCE_ORDER.payoutPerHectareUsdc)
      setCoverageLabel('Aktif 120 Hari')
      return
    }

    const latestPolicyUrl = getApiUrl(`/api/insurance/latest/wallet/${encodeURIComponent(publicKey)}`)
    let cancelled = false

    const hydrateFromLocalSnapshot = () => {
      const localPolicy = readLocalPolicy(publicKey)
      if (!localPolicy || cancelled) return

      setActivePolicy(localPolicy.status === 'ACTIVE')
      setPolicyId(localPolicy.policyId)
      setPolicyTx(localPolicy.txSignature)
      setPremiumUsdc(localPolicy.premiumPaidUsdc)
      setMaxPayoutUsdc(localPolicy.maxPayoutUsdc)
      setCoverageLabel(formatCoveragePeriod(localPolicy.coverageStartDate, localPolicy.coverageEndDate))
    }

    if (!latestPolicyUrl) {
      hydrateFromLocalSnapshot()
      return () => {
        cancelled = true
      }
    }

    const loadLatestPolicy = async () => {
      try {
        const response = await fetch(latestPolicyUrl, { cache: 'no-store' })
        if (!response.ok) {
          hydrateFromLocalSnapshot()
          return
        }

        const payload = (await response.json()) as LatestPolicyApiResponse
        if (!payload.success || !payload.data || cancelled) {
          hydrateFromLocalSnapshot()
          return
        }

        const latestPolicy = payload.data
        setActivePolicy(latestPolicy.status === 'ACTIVE')
        setPolicyId(latestPolicy.policyId)
        setPolicyTx(latestPolicy.txSignature || latestPolicy.policyId)

        if (typeof latestPolicy.premiumPaidUsdc === 'number') {
          setPremiumUsdc(latestPolicy.premiumPaidUsdc)
        }

        if (typeof latestPolicy.maxPayoutUsdc === 'number') {
          setMaxPayoutUsdc(latestPolicy.maxPayoutUsdc)
        }

        setCoverageLabel(formatCoveragePeriod(latestPolicy.coverageStartDate, latestPolicy.coverageEndDate))

        writeLocalPolicy(publicKey, {
          policyId: latestPolicy.policyId,
          status: latestPolicy.status,
          premiumPaidUsdc: typeof latestPolicy.premiumPaidUsdc === 'number' ? latestPolicy.premiumPaidUsdc : INSURANCE_ORDER.displayPremiumUsdc,
          maxPayoutUsdc:
            typeof latestPolicy.maxPayoutUsdc === 'number'
              ? latestPolicy.maxPayoutUsdc
              : INSURANCE_ORDER.payoutPerHectareUsdc * INSURANCE_ORDER.coveredHectares,
          txSignature: latestPolicy.txSignature || latestPolicy.policyId,
          coverageStartDate: latestPolicy.coverageStartDate || new Date().toISOString(),
          coverageEndDate: latestPolicy.coverageEndDate || new Date().toISOString()
        })
      } catch {
        hydrateFromLocalSnapshot()
      }
    }

    void loadLatestPolicy()

    return () => {
      cancelled = true
    }
  }, [connected, publicKey])

  async function handleBuyInsurance() {
    if (!connected || !publicKey) {
      toast.error('Hubungkan wallet Phantom Anda terlebih dahulu', { icon: '🔗' })
      return
    }
    if (buyingInsurance) return

    setBuyingInsurance(true)
    const loadingToast = toast.loading('Menandatangani dan mengirim transaksi polis asuransi...', {
      style: { background: '#0a1628', color: '#fff', border: '1px solid #10b981' }
    })

    try {
      const injectedProvider = (window as unknown as { solana?: SolanaWalletProvider }).solana
      if (!injectedProvider?.isConnected || typeof injectedProvider.signAndSendTransaction !== 'function') {
        throw new Error('Wallet provider tidak mendukung transaksi. Buka Phantom dan coba lagi.')
      }

      const connection = new Connection(RPC_URL, 'confirmed')
      const localPolicyRef = `POL-${Date.now().toString(36).toUpperCase()}`
      const transaction = await createPolicyTransaction(publicKey, {
        policyId: localPolicyRef,
        commodity: INSURANCE_ORDER.commoditySymbol,
        triggerThreshold: INSURANCE_ORDER.triggerThresholdMm,
        payoutPerHectare: INSURANCE_ORDER.payoutPerHectareUsdc,
        premium: INSURANCE_ORDER.displayPremiumUsdc
      })

      const signedResult = await injectedProvider.signAndSendTransaction(transaction)
      const txSignature = signedResult?.signature
      if (!txSignature) {
        throw new Error('Transaksi tidak menghasilkan signature.')
      }

      const confirmation = await connection.confirmTransaction(txSignature, 'confirmed')
      if (confirmation.value.err) {
        throw new Error('Transaksi on-chain gagal terkonfirmasi.')
      }

      const purchaseUrl = getApiUrl('/api/insurance/purchase-mvp')
      let purchasedPolicy: PurchaseMvpApiResponse['data'] | null = null
      let backendSyncWarning = ''

      if (purchaseUrl) {
        try {
          const response = await fetch(purchaseUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: publicKey,
              commodity: INSURANCE_ORDER.commoditySymbol,
              hectares: INSURANCE_ORDER.coveredHectares,
              latitude: INSURANCE_ORDER.latitude,
              longitude: INSURANCE_ORDER.longitude,
              triggerType: INSURANCE_ORDER.triggerType,
              triggerThreshold: INSURANCE_ORDER.triggerThresholdMm,
              coverageDays: INSURANCE_ORDER.coverageDays,
              txSignature
            })
          })

          const payload = (await response.json().catch(() => null)) as PurchaseMvpApiResponse | null
          if (!response.ok || !payload?.success || !payload.data) {
            backendSyncWarning = payload?.error || 'Sinkronisasi backend gagal diproses.'
          } else {
            purchasedPolicy = payload.data
          }
        } catch (backendError: any) {
          backendSyncWarning = backendError?.message || 'Backend tidak merespons saat sinkronisasi.'
        }
      } else {
        backendSyncWarning = 'NEXT_PUBLIC_API_BASE_URL belum diset di deployment frontend.'
      }

      const now = new Date()
      const coverageEnd = new Date(now)
      coverageEnd.setDate(now.getDate() + INSURANCE_ORDER.coverageDays)

      const snapshot: LocalPolicySnapshot = {
        policyId: purchasedPolicy?.policyId || `POL-${Date.now().toString(36).toUpperCase()}`,
        status: purchasedPolicy?.status || 'ACTIVE',
        premiumPaidUsdc: purchasedPolicy?.premiumPaidUsdc ?? INSURANCE_ORDER.displayPremiumUsdc,
        maxPayoutUsdc:
          purchasedPolicy?.maxPayoutUsdc ?? INSURANCE_ORDER.payoutPerHectareUsdc * INSURANCE_ORDER.coveredHectares,
        txSignature: purchasedPolicy?.txSignature || txSignature,
        coverageStartDate: purchasedPolicy?.coverageStartDate || now.toISOString(),
        coverageEndDate: purchasedPolicy?.coverageEndDate || coverageEnd.toISOString()
      }

      writeLocalPolicy(publicKey, snapshot)

      setActivePolicy(snapshot.status === 'ACTIVE')
      setPolicyId(snapshot.policyId)
      setPolicyTx(snapshot.txSignature)
      setPremiumUsdc(snapshot.premiumPaidUsdc)
      setMaxPayoutUsdc(snapshot.maxPayoutUsdc)
      setCoverageLabel(formatCoveragePeriod(snapshot.coverageStartDate, snapshot.coverageEndDate))

      toast.dismiss(loadingToast)
      if (backendSyncWarning) {
        toast.success('Transaksi on-chain berhasil. Sinkronisasi server polis sedang menyusul.', { icon: '✅' })
      } else {
        toast.success('Polis aktif on-chain dan backend tersinkron.', { icon: '🛡️' })
      }
    } catch (err: any) {
      toast.dismiss(loadingToast)
      toast.error(err?.message || 'Pembelian polis gagal diproses.')
    } finally {
      setBuyingInsurance(false)
    }
  }

  const maxRain = Math.max(...weather.daily.map(d => d.rainfallMm), 1)

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#02050a]">
      {/* Dynamic Ambient Backgrounds */}
      <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-emerald-600/10 blur-[150px] -z-10 rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[800px] h-[600px] bg-teal-800/15 blur-[120px] -z-10 rounded-full" />
      <div className="absolute top-[40%] left-[30%] w-[400px] h-[400px] bg-blue-900/10 blur-[100px] -z-10 rounded-full" />

      <Navbar />

      <div className="max-w-7xl mx-auto px-6 pt-28 pb-12">
        {/* Header Area */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-white mb-2 tracking-tight">Ikhtisar Lahan</h1>
            <p className="text-slate-400 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Real-time monitoring untuk Region {weather.location.regionCode}
            </p>
          </div>
          {connected ? (
            <div className="self-start md:self-auto px-4 py-2 glass-panel !bg-emerald-900/20 border-emerald-500/30 rounded-full flex items-center gap-2 text-emerald-300 text-xs font-mono">
              <CheckCircle size={14} className="text-emerald-400" /> Wallet: {publicKey?.slice(0,6)}...{publicKey?.slice(-4)}
            </div>
          ) : (
            <div className="self-start md:self-auto px-4 py-2 glass-panel !bg-amber-900/20 border-amber-500/30 rounded-full flex items-center gap-2 text-amber-300 text-xs shadow-[0_0_10px_rgba(251,191,36,0.1)]">
              <AlertTriangle size={14} className="text-amber-400" /> Hubungkan Phantom untuk Akses Asuransi
            </div>
          )}
        </motion.div>

        <motion.div variants={STAGGER} initial="initial" animate="animate" className="grid lg:grid-cols-3 gap-6">
          
          {/* Main Content (2/3) */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Weather Oracle Card */}
            <motion.div variants={ITEM} className="glass-panel rounded-3xl p-6 md:p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-500/20 border border-blue-500/30">
                    <CloudRain className="text-blue-400" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Oracle Cuaca BMKG</h2>
                    <p className="text-xs text-blue-300/70 font-mono">Diperbarui: Hari ini, 07:00 WIB</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setLoading(true)
                    setTimeout(() => setLoading(false), 800)
                  }}
                  title="Refresh data cuaca"
                  aria-label="Refresh data cuaca"
                  className={`p-2 rounded-full bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors ${loading ? 'opacity-50' : ''}`}
                >
                  <RefreshCw size={18} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="p-4 rounded-2xl bg-[#050b14]/50 border border-slate-800/60 shadow-inner flex flex-col items-center justify-center relative overflow-hidden group hover:border-blue-500/40 transition-colors">
                  <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-blue-500/0 via-blue-500 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Droplets size={20} className="text-blue-400 mb-2" />
                  <div className="text-3xl font-black text-white">{weather.current.rainfallMm}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">MM HARI INI</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#050b14]/50 border border-slate-800/60 shadow-inner flex flex-col items-center justify-center hover:border-orange-500/40 transition-colors">
                  <Sun size={20} className="text-orange-400 mb-2" />
                  <div className="text-3xl font-black text-white">{weather.current.temperatureCelsius}°</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">SUHU UDARA</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#050b14]/50 border border-slate-800/60 shadow-inner flex flex-col items-center justify-center hover:border-teal-500/40 transition-colors">
                  <Activity size={20} className="text-teal-400 mb-2" />
                  <div className="text-3xl font-black text-white">{weather.current.humidityPercent}%</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">KELEMBABAN</div>
                </div>
                <div className="p-4 rounded-2xl bg-[#050b14]/50 border border-slate-800/60 shadow-inner flex flex-col items-center justify-center hover:border-slate-500/40 transition-colors">
                  <Wind size={20} className="text-slate-400 mb-2" />
                  <div className="text-3xl font-black text-white">{weather.current.windSpeed}</div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">KM/J ANGIN</div>
                </div>
              </div>

              {/* 7 Day Chart */}
              <div className="bg-[#050b14]/30 rounded-2xl p-5 border border-slate-800/40">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Histori Curah Hujan (7 Hari)</h3>
                  <span className="text-xs text-blue-400 font-mono bg-blue-900/20 px-2 py-0.5 rounded border border-blue-800/30">Total: 15.3 mm</span>
                </div>
                <div className="flex items-end gap-2 h-32">
                  {weather.daily.map((d, i) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end relative group">
                      <span className="absolute -top-6 text-[10px] font-mono text-blue-300 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-blue-900/60 px-1.5 py-0.5 rounded backdrop-blur">
                        {d.rainfallMm}mm
                      </span>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${Math.max(12, (d.rainfallMm / maxRain) * 100)}%` }}
                        transition={{ delay: 0.2 + (i * 0.05), type: 'spring', stiffness: 100 }}
                        className="w-full max-w-[40px] bg-gradient-to-t from-blue-900/50 to-blue-500/80 rounded-t-md border-t border-x border-blue-400/30 group-hover:to-cyan-400/80 transition-colors relative overflow-hidden"
                      >
                        <div className="absolute top-0 left-0 w-full h-[1px] bg-white/40" />
                      </motion.div>
                      <span className="text-[10px] text-slate-500 mt-3 font-medium">{d.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* Risk Analysis Card */}
            <motion.div variants={ITEM} className="glass-panel rounded-3xl p-6 md:p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-orange-500/20 border border-orange-500/30 shadow-[0_0_15px_rgba(249,115,22,0.15)]">
                    <TrendingDown className="text-orange-400" size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">AI Risk Engine</h2>
                    <p className="text-xs text-orange-300/70 font-mono">Pemodelan Cerdas • Aktuaria Aktif</p>
                  </div>
                </div>
                <span className={`px-4 py-1.5 text-xs font-black tracking-widest uppercase rounded-lg border ${RISK_BADGES[weather.risk.riskLevel]}`}>
                  Status: {weather.risk.riskLevel}
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-6">
                <div className="space-y-6">
                  {[
                    { label: 'Indeks Risiko Kekeringan', value: weather.risk.droughtRiskScore, color: 'from-amber-600 to-orange-500', glow: 'rgba(249,115,22,0.3)' },
                    { label: 'Indeks Risiko Banjir', value: weather.risk.excessRainRiskScore, color: 'from-blue-600 to-indigo-500', glow: 'rgba(99,102,241,0.3)' },
                    { label: 'Skor Risiko Komposit', value: weather.risk.overallRiskScore, color: `from-orange-600 to-red-500`, glow: 'rgba(239,68,68,0.3)' }
                  ].map((r, i) => (
                    <div key={r.label}>
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-xs font-semibold text-slate-400 tracking-wide uppercase">{r.label}</span>
                        <span className="font-black text-white text-lg">{r.value.toFixed(0)}<span className="text-xs text-slate-500 font-normal">/100</span></span>
                      </div>
                      <div className="h-2 bg-[#050b14] rounded-full overflow-hidden border border-slate-800/80 shadow-inner p-[1px]">
                        <motion.div
                          initial={{ width: 0 }} animate={{ width: `${r.value}%` }} transition={{ delay: 0.5 + (i * 0.1), duration: 1 }}
                          className={`h-full bg-gradient-to-r ${r.color} rounded-full relative`}
                          style={{ boxShadow: `0 0 10px ${r.glow}` }}
                        >
                          <div className="absolute top-0 right-0 bottom-0 w-4 bg-white/20 blur-[2px]" />
                        </motion.div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col justify-center gap-3">
                  <div className="p-4 bg-slate-900/40 rounded-2xl border border-slate-800">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Akumulasi 30 Hari</h4>
                    <p className="text-3xl font-black text-white">{weather.risk.rollingRainfall30d} <span className="text-sm font-medium text-slate-400">mm</span></p>
                    <div className="mt-2 w-full h-[1px] bg-slate-800" />
                    <p className="text-xs text-slate-400 mt-2">Batas Threshold: <span className="text-amber-400 font-semibold">40 mm</span></p>
                  </div>
                  
                  <div className="p-4 bg-red-900/10 rounded-2xl border border-red-900/30">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">Standardized Precipitation Index (SPI)</h4>
                    <p className={`text-2xl font-black ${weather.risk.droughtIndex < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{weather.risk.droughtIndex}</p>
                    {weather.risk.droughtIndex < -1 && (
                      <p className="text-[10px] text-red-400/80 mt-2 leading-tight">
                        <AlertTriangle size={10} className="inline mr-1 -mt-0.5" />
                        Defisit curah hujan ekstrem terdeteksi. Risiko gagal panen meningkat.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Sidebar / Insurance Action (1/3) */}
          <div className="space-y-6">
            
            {/* Action Card */}
            <motion.div variants={ITEM} className="glass-panel rounded-3xl p-6 md:p-8 relative overflow-hidden group">
              {/* Dynamic Glow Background */}
              <div className={`absolute -inset-20 bg-gradient-to-br ${activePolicy ? 'from-emerald-500/10 to-teal-900/10' : 'from-indigo-500/10 to-purple-900/10'} blur-[40px] -z-10 group-hover:opacity-100 opacity-60 transition-opacity duration-700`} />
              
              <div className="flex items-center gap-3 mb-6">
                <div className={`p-2.5 rounded-xl border shadow-lg ${activePolicy ? 'bg-emerald-500/20 border-emerald-500/30 shadow-emerald-500/20' : 'bg-purple-500/20 border-purple-500/30 shadow-purple-500/20'}`}>
                  <Shield className={activePolicy ? 'text-emerald-400' : 'text-purple-400'} size={24} />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">Proteksi Lahan</h2>
              </div>

              {activePolicy ? (
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-[#050b14] border border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.1)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 bg-emerald-500/10 rounded-bl-xl border-b border-l border-emerald-500/20">
                      <span className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest"><div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> AKTIF</span>
                    </div>
                    <p className="text-sm font-medium text-slate-400 mt-2">{INSURANCE_ORDER.commodityLabel}</p>
                    <p className="text-2xl font-black text-white mt-0.5">{INSURANCE_ORDER.coveredHectares} Hektar</p>
                    <div className="w-full h-[1px] bg-slate-800 my-4" />
                    <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Periode Coverage</p>
                    <p className="text-sm font-medium text-slate-300">{coverageLabel}</p>
                  </div>

                  <div className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-400">Maks. Payout</span>
                      <span className="text-sm font-black text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded border border-emerald-500/20">{formatUsdc(maxPayoutUsdc)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-400">Kondisi Trigger</span>
                      <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/20">&lt; {INSURANCE_ORDER.triggerThresholdMm}mm / 30h</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-400">Policy ID</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-[#050b14] px-1.5 py-0.5 rounded">{policyId}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <span className="text-xs font-semibold text-slate-400">{policyTx === policyId ? 'Ref Backend' : 'Tx Hash'}</span>
                      <span className="text-[10px] font-mono text-emerald-500 bg-[#050b14] px-1.5 py-0.5 rounded">{policyTx}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="bg-slate-900/40 rounded-2xl border border-slate-800/80 p-5 space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Komoditas</span>
                      <span className="text-sm font-bold text-white">{INSURANCE_ORDER.commodityLabel}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Luas Lahan</span>
                      <span className="text-sm font-bold text-white bg-slate-800 px-2 py-0.5 rounded">{INSURANCE_ORDER.coveredHectares} Hektar</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Maks. Rekayasa</span>
                      <span className="text-sm font-black text-emerald-400">{formatUsdc(maxPayoutUsdc)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Trigger</span>
                      <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2.5 py-1 rounded border border-amber-500/20">&lt; {INSURANCE_ORDER.triggerThresholdMm}mm dalam 30 hari</span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#050b14] to-slate-900 border border-emerald-900/40">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Premi Total</span>
                      <span className="text-lg font-black text-white">{formatUsdc(premiumUsdc)}</span>
                    </div>
                    <div className="flex items-start gap-2 mt-3 p-2 bg-emerald-900/20 rounded-lg border border-emerald-500/20">
                      <Zap size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                      <p className="text-[10px] text-emerald-300 leading-tight">50% premi disubsidi otomatis oleh Nusa Harvest Yield Pool. Petani membayar {formatUsdc(premiumUsdc)}.</p>
                    </div>
                  </div>

                  <button
                    onClick={handleBuyInsurance}
                    disabled={buyingInsurance}
                    className={`w-full relative group overflow-hidden rounded-xl ${buyingInsurance ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${connected ? 'bg-gradient-to-r from-emerald-600 to-teal-500' : 'bg-slate-800'}`}></div>
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out blur-[20px]"></div>
                    <span className="relative flex items-center justify-center gap-2 py-4 px-6 text-sm font-bold text-white tracking-wide">
                      {buyingInsurance ? (
                        <>Memproses Pembelian <Loader2 size={16} className="animate-spin" /></>
                      ) : connected ? (
                        <>Beli Proteksi Sekarang <ArrowRight size={16} /></>
                      ) : (
                        <>🔗 Hubungkan Wallet Dulu</>
                      )}
                    </span>
                  </button>
                </div>
              )}
            </motion.div>

            {/* Smart Contract Proof Card */}
            <motion.div variants={ITEM} className="glass-panel rounded-2xl p-5 border border-indigo-900/30">
              <div className="flex items-center gap-2 mb-4">
                <Shield size={14} className="text-indigo-400" />
                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400">Layer Keamanan</h3>
              </div>
              <div className="space-y-2.5 font-mono text-[10px] leading-relaxed">
                <div className="flex justify-between items-center bg-[#050b14] p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Jaringan</span>
                  <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" /><span className="text-indigo-300">Solana Devnet</span></div>
                </div>
                <div className="flex justify-between items-center bg-[#050b14] p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Program</span>
                  <a href="https://explorer.solana.com/address/NuHarVest1111111111111111111111111111111111?cluster=devnet" target="_blank" rel="noreferrer noopener" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">NuHarVest11...111</a>
                </div>
                <div className="flex justify-between items-center bg-[#050b14] p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Kode Audit</span>
                  <span className="text-slate-400">Anchor v0.30.0 / Rust</span>
                </div>
              </div>
            </motion.div>

          </div>
        </motion.div>
      </div>
    </main>
  )
}
