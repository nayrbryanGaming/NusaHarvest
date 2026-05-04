'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CloudRain, Shield, AlertTriangle, CheckCircle, TrendingDown, RefreshCw, Activity, ArrowRight, Sun, Wind, Droplets, Zap, Loader2 } from 'lucide-react'
import { Connection } from '@solana/web3.js'
import { useWallet } from '../../providers/WalletProvider'
import toast from 'react-hot-toast'
import Sidebar from '../../components/Sidebar'
import { useSim } from '../../contexts/SimulationContext'
import { getApiUrl } from '../../utils/api'
import { PROGRAM_ID_STR, RPC_URL } from '../../utils/constants'
import { createPolicyTransaction, isProtocolProgramDeployed } from '../../utils/solana'
import { fetchWithTimeout } from '../../utils/timeout'

const INITIAL_WEATHER = {
  location: { lat: -7.7078, lon: 110.6101, regionCode: 'Klaten, Jawa Tengah' },
  current: { rainfallMm: 0, temperatureCelsius: 0, humidityPercent: 0, windSpeed: 0, description: 'Menghubungkan ke Oracle Cuaca...' },
  daily: [] as Array<{ date: string; rainfallMm: number }>,
  risk: {
    droughtIndex: 0,
    rollingRainfall30d: 0,
    droughtRiskScore: 0,
    excessRainRiskScore: 0,
    overallRiskScore: 0,
    riskLevel: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  },
  lastUpdated: ''
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
  triggerType: 'RAINFALL_DEFICIT' as const,
  triggerThresholdMm: 40,
  payoutPerHectareUsdc: 500,
  coverageDays: 120,
  premiumPerHectareUsdc: 2.5,   // ≈ Rp 38.000 / ha at ~15,800 IDR/USDC
  latitude: -7.7078,
  longitude: 110.6101
}

const LOCAL_POLICY_KEY_PREFIX = 'nusa_harvest_policy_'
const TX_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/

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

function getExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}

function getLocalPolicyKey(walletAddress: string): string {
  return `${LOCAL_POLICY_KEY_PREFIX}${walletAddress}`
}

function isLikelyTxSignature(value: string): boolean {
  return TX_SIGNATURE_REGEX.test(value)
}

function clearLocalPolicy(walletAddress: string): void {
  localStorage.removeItem(getLocalPolicyKey(walletAddress))
}

function readLocalPolicy(walletAddress: string): LocalPolicySnapshot | null {
  try {
    const rawValue = localStorage.getItem(getLocalPolicyKey(walletAddress))
    if (!rawValue) return null

    const parsed = JSON.parse(rawValue) as LocalPolicySnapshot
    if (!parsed.policyId || !parsed.txSignature || !isLikelyTxSignature(parsed.txSignature)) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalPolicy(walletAddress: string, policy: LocalPolicySnapshot): void {
  localStorage.setItem(getLocalPolicyKey(walletAddress), JSON.stringify(policy))
}

export default function DashboardPage() {
  const { publicKey, connected, signAndSendTransaction } = useWallet()
  const sim = useSim()
  const [weather, setWeather] = useState(INITIAL_WEATHER)
  const [loading, setLoading] = useState(true)
  const [activePolicy, setActivePolicy] = useState(false)
  const [policyTx, setPolicyTx] = useState('')
  const [policyId, setPolicyId] = useState('')
  const [premiumUsdc, setPremiumUsdc] = useState(INSURANCE_ORDER.premiumPerHectareUsdc)
  const [maxPayoutUsdc, setMaxPayoutUsdc] = useState(INSURANCE_ORDER.payoutPerHectareUsdc)
  const [coverageLabel, setCoverageLabel] = useState('Aktif 120 Hari')
  const [selectedHectares, setSelectedHectares] = useState(1)
  const [buyingInsurance, setBuyingInsurance] = useState(false)
  const [programReady, setProgramReady] = useState<boolean | null>(null)
  const [droughtSimStep, setDroughtSimStep] = useState<0|1|2|3|4>(0)
  const [simPayout, setSimPayout] = useState(0)

  const fetchLiveData = async () => {
    setLoading(true)
    try {
      const { lat, lon } = INITIAL_WEATHER.location
      const res = await fetchWithTimeout(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m&daily=rain_sum&timezone=auto&past_days=30&forecast_days=0`)

      if (!res.ok) throw new Error('Weather API unreachable')
      const json = await res.json()

      const current = json.current
      const dailyRain: number[] = json.daily.rain_sum || []
      const dailyTime: string[] = json.daily.time || []

      // Show last 7 days in chart, use full 30 days for rolling accumulation
      const last7Rain = dailyRain.slice(-7)
      const last7Time = dailyTime.slice(-7)
      const history = last7Time.map((t: string, i: number) => ({
        date: t.split('-').slice(1).join('/'),
        rainfallMm: last7Rain[i] || 0
      }))

      const rolling30d = dailyRain.reduce((a: number, b: number) => a + b, 0)
      
      // Real-time Risk Calculation Logic
      const droughtThreshold = 40
      const deficit = Math.max(0, droughtThreshold - rolling30d)
      const riskScore = Math.min(100, (deficit / droughtThreshold) * 100)
      
      let level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW'
      if (riskScore > 80) level = 'CRITICAL'
      else if (riskScore > 50) level = 'HIGH'
      else if (riskScore > 20) level = 'MEDIUM'

      const updatedAt = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
      setWeather(prev => ({
        ...prev,
        current: {
          rainfallMm: current.rain,
          temperatureCelsius: current.temperature_2m,
          humidityPercent: current.relative_humidity_2m,
          windSpeed: current.wind_speed_10m,
          description: current.rain > 0 ? 'Hujan Terdeteksi' : 'Cerah / Berawan'
        },
        daily: history,
        risk: {
          droughtIndex: parseFloat((rolling30d / 50 - 1).toFixed(2)),
          rollingRainfall30d: parseFloat(rolling30d.toFixed(1)),
          droughtRiskScore: riskScore,
          excessRainRiskScore: current.rain > 50 ? 90 : 5,
          overallRiskScore: riskScore,
          riskLevel: level
        },
        lastUpdated: updatedAt
      }))
    } catch (e) {
      console.error('Weather fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLiveData()
    const interval = setInterval(fetchLiveData, 300000) // 5m refresh
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false

    const checkProgram = async () => {
      try {
        const deployed = await isProtocolProgramDeployed()
        if (!cancelled) setProgramReady(deployed)
      } catch {
        if (!cancelled) setProgramReady(false)
      }
    }

    void checkProgram()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!publicKey || programReady !== false) return

    clearLocalPolicy(publicKey)
    setActivePolicy(false)
    setPolicyId('')
    setPolicyTx('')
    setPremiumUsdc(INSURANCE_ORDER.premiumPerHectareUsdc)
    setMaxPayoutUsdc(INSURANCE_ORDER.payoutPerHectareUsdc)
    setCoverageLabel('Aktif 120 Hari')
  }, [programReady, publicKey])

  useEffect(() => {
    if (!connected || !publicKey) {
      setActivePolicy(false)
      setPolicyId('')
      setPolicyTx('')
      setPremiumUsdc(INSURANCE_ORDER.premiumPerHectareUsdc)
      setMaxPayoutUsdc(INSURANCE_ORDER.payoutPerHectareUsdc)
      setCoverageLabel('Aktif 120 Hari')
      return
    }

    if (programReady !== true) {
      setActivePolicy(false)
      setPolicyId('')
      setPolicyTx('')
      setPremiumUsdc(INSURANCE_ORDER.premiumPerHectareUsdc)
      setMaxPayoutUsdc(INSURANCE_ORDER.payoutPerHectareUsdc)
      setCoverageLabel('Aktif 120 Hari')
      return
    }

    const latestPolicyUrl = getApiUrl(`/api/insurance/latest/wallet/${encodeURIComponent(publicKey)}`)
    let cancelled = false

    const hydrateFromLocalSnapshot = () => {
      const localPolicy = readLocalPolicy(publicKey)
      if (!localPolicy || cancelled) {
        if (!cancelled) clearLocalPolicy(publicKey)
        return
      }

      setActivePolicy(localPolicy.status === 'ACTIVE' && isLikelyTxSignature(localPolicy.txSignature))
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
        const txSignature = typeof latestPolicy.txSignature === 'string' ? latestPolicy.txSignature.trim() : ''
        const validTxSignature = isLikelyTxSignature(txSignature) ? txSignature : ''

        setActivePolicy(latestPolicy.status === 'ACTIVE' && Boolean(validTxSignature))
        setPolicyId(latestPolicy.policyId)
        setPolicyTx(validTxSignature)

        if (typeof latestPolicy.premiumPaidUsdc === 'number') {
          setPremiumUsdc(latestPolicy.premiumPaidUsdc)
        }

        if (typeof latestPolicy.maxPayoutUsdc === 'number') {
          setMaxPayoutUsdc(latestPolicy.maxPayoutUsdc)
        }

        setCoverageLabel(formatCoveragePeriod(latestPolicy.coverageStartDate, latestPolicy.coverageEndDate))

        if (validTxSignature) {
          writeLocalPolicy(publicKey, {
            policyId: latestPolicy.policyId,
            status: latestPolicy.status,
            premiumPaidUsdc: typeof latestPolicy.premiumPaidUsdc === 'number' ? latestPolicy.premiumPaidUsdc : selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc,
            maxPayoutUsdc:
              typeof latestPolicy.maxPayoutUsdc === 'number'
                ? latestPolicy.maxPayoutUsdc
                : INSURANCE_ORDER.payoutPerHectareUsdc * selectedHectares,
            txSignature: validTxSignature,
            coverageStartDate: latestPolicy.coverageStartDate || new Date().toISOString(),
            coverageEndDate: latestPolicy.coverageEndDate || new Date().toISOString()
          })
        } else {
          clearLocalPolicy(publicKey)
        }
      } catch {
        hydrateFromLocalSnapshot()
      }
    }

    void loadLatestPolicy()

    return () => {
      cancelled = true
    }
  }, [connected, publicKey, programReady])

  async function handleBuyInsurance() {
    if (!connected || !publicKey) {
      toast.error('Hubungkan wallet Phantom Anda terlebih dahulu', { icon: '🔗' })
      return
    }

    if (programReady === null) {
      toast.error('Sedang memverifikasi status program on-chain. Coba lagi beberapa detik.')
      return
    }

    if (programReady === false) {
      toast.error('Program asuransi belum terdeploy di Solana Devnet. Tidak ada transaksi yang dijalankan.')
      return
    }

    if (buyingInsurance) return

    setBuyingInsurance(true)
    const loadingToast = toast.loading('Menandatangani dan mengirim transaksi polis asuransi...', {
      style: { background: '#0a1628', color: '#fff', border: '1px solid #10b981' }
    })

    try {
      const connection = new Connection(RPC_URL, 'confirmed')
      const localPolicyRef = `POL-${Date.now().toString(36).toUpperCase()}`
      const transaction = await createPolicyTransaction(publicKey, {
        policyId: localPolicyRef,
        commodity: INSURANCE_ORDER.commoditySymbol,
        triggerThreshold: INSURANCE_ORDER.triggerThresholdMm,
        payoutPerHectare: INSURANCE_ORDER.payoutPerHectareUsdc,
        premium: selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc
      })

      const signedResult = await signAndSendTransaction(transaction)
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
              hectares: selectedHectares,
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
        premiumPaidUsdc: purchasedPolicy?.premiumPaidUsdc ?? selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc,
        maxPayoutUsdc:
          purchasedPolicy?.maxPayoutUsdc ?? INSURANCE_ORDER.payoutPerHectareUsdc * selectedHectares,
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

  async function handleDemoInsurance() {
    if (!connected || !publicKey) {
      toast.error('Hubungkan wallet Phantom Anda terlebih dahulu', { icon: '🔗' })
      return
    }
    if (buyingInsurance) return
    setBuyingInsurance(true)
    const loadingToast = toast.loading('Memproses simulasi polis...', {
      style: { background: '#0a1628', color: '#fff', border: '1px solid #10b981' }
    })
    await new Promise(r => setTimeout(r, 2200))
    const demoId  = `DEMO-${Date.now().toString(36).toUpperCase().slice(-6)}`
    const demoTx  = `SIM${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2,8).toUpperCase()}`
    const now     = new Date()
    const end     = new Date(now); end.setDate(now.getDate() + INSURANCE_ORDER.coverageDays)
    const farmerPays = selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc * 0.5
    setActivePolicy(true)
    setPolicyId(demoId)
    setPolicyTx(demoTx)
    setPremiumUsdc(farmerPays)
    setMaxPayoutUsdc(INSURANCE_ORDER.payoutPerHectareUsdc * selectedHectares)
    setCoverageLabel(formatCoveragePeriod(now.toISOString(), end.toISOString()))
    toast.dismiss(loadingToast)
    toast.success(`Demo polis ${demoId} aktif! Petani membayar $${farmerPays.toFixed(2)} USDC (50% subsidi).`, { icon: '🛡️', duration: 6000 })
    setBuyingInsurance(false)
  }

  async function handleSimulateDrought() {
    if (droughtSimStep === 4) {
      setDroughtSimStep(0)
      setSimPayout(0)
      return
    }
    if (droughtSimStep > 0) return
    const payout = maxPayoutUsdc
    setDroughtSimStep(1)
    await new Promise(r => setTimeout(r, 1400))
    setDroughtSimStep(2)
    await new Promise(r => setTimeout(r, 1600))
    setDroughtSimStep(3)
    await new Promise(r => setTimeout(r, 1800))
    setSimPayout(payout)
    setDroughtSimStep(4)
    toast.success(`✅ Payout ${formatUsdc(payout)} dikirim ke wallet petani — settlement < 6 detik!`, { duration: 8000 })
  }

  const maxRain = Math.max(...weather.daily.map(d => d.rainfallMm), 1)
  const totalRain7d = weather.daily.reduce((sum, day) => sum + day.rainfallMm, 0)

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px]">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span>
            <span className="text-slate-700">/</span>
            <span className="text-white">Farmer Dashboard</span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-emerald-900/40 bg-emerald-950/30 text-emerald-500 hidden sm:block">
            ● Devnet Simulation
          </span>
        </div>

        {/* Page content */}
        <div className="flex-1 relative overflow-auto">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-emerald-600/8 blur-[150px] -z-10 rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[400px] bg-teal-800/8 blur-[120px] -z-10 rounded-full pointer-events-none" />

      <div className="max-w-5xl mx-auto px-8 pt-8 pb-16">
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

        {/* ── Wallet Portfolio (when connected) ── */}
        {connected && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0,transition:{duration:0.4}}}
            className="mb-6 p-5 rounded-[8px] border border-amber-900/30 bg-amber-950/10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <p className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-amber-600 mb-1">Your Portfolio · Devnet Simulation</p>
                <div className="flex items-center gap-6 font-mono text-[12px]">
                  <span className="text-slate-400">Total Invested <strong className="text-white">${sim.totalInvestedUsdc.toLocaleString()} USDC</strong></span>
                  <span className="text-slate-400">Est. APY <strong className="text-emerald-400">{sim.estimatedRoiPct}%</strong></span>
                  <span className="text-slate-400">Risk <strong className={sim.riskLevel==='LOW'?'text-emerald-400':sim.riskLevel==='MEDIUM'?'text-amber-400':'text-red-400'}>{sim.riskLevel}</strong></span>
                  <span className="text-slate-400">Pools <strong className="text-white">{sim.portfolioPositions.length} aktif</strong></span>
                </div>
              </div>
              <div className="flex gap-2">
                {sim.portfolioPositions.map(p => (
                  <div key={p.poolId} className="px-3 py-1.5 rounded-[4px] bg-white/[0.04] border border-white/[0.06] font-mono text-[10px]">
                    <span className="text-slate-500">{p.poolId}</span>
                    <span className="text-amber-400 ml-2">+${p.earned}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Weather → Insurance Alert ── */}
        {sim.weatherMode !== 'normal' && (
          <motion.div initial={{opacity:0,y:-8}} animate={{opacity:1,y:0}}
            className={`mb-6 p-4 rounded-[6px] border flex items-start gap-3 ${
              sim.weatherMode === 'drought' ? 'border-orange-900/40 bg-orange-950/20' : 'border-blue-900/40 bg-blue-950/20'
            }`}>
            <AlertTriangle size={14} className={sim.weatherMode==='drought'?'text-orange-400':'text-blue-400'} />
            <div>
              <p className={`font-mono text-[11px] font-semibold mb-1 ${sim.weatherMode==='drought'?'text-orange-300':'text-blue-300'}`}>
                {sim.weatherMode==='drought' ? 'DROUGHT SIMULATION AKTIF' : 'FLOOD SIMULATION AKTIF'} — Curah Hujan {sim.rainfallMm}mm
              </p>
              <p className="font-mono text-[10.5px] text-slate-400">
                Threshold breach terdeteksi. Polis {sim.activeTriggers.join(', ')} sedang dalam proses verifikasi oracle.
                Klaim otomatis akan diproses jika kondisi berlanjut selama 30 hari.
              </p>
            </div>
          </motion.div>
        )}

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
                    <h2 className="text-xl font-bold text-white tracking-tight">Oracle Cuaca � Open-Meteo (Devnet Demo)</h2>
                    <p className="text-xs text-blue-300/70 font-mono">
                      {weather.lastUpdated ? `Diperbarui: ${weather.lastUpdated}` : 'Memuat data...'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={fetchLiveData}
                  title="Refresh data cuaca"
                  aria-label="Refresh data cuaca"
                  className={`p-2 rounded-full bg-slate-800/50 border border-slate-700 hover:bg-slate-700 transition-colors ${loading ? 'opacity-50' : ''}`}
                >
                  <RefreshCw size={18} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                {[
                  { icon: <Droplets size={18} className="text-blue-400" />, value: weather.current.rainfallMm, unit: 'MM HARI INI',  accent: 'blue-500',   top: 'from-blue-500/0 via-blue-500 to-blue-500/0'   },
                  { icon: <Sun     size={18} className="text-orange-400" />, value: `${weather.current.temperatureCelsius}°`, unit: 'SUHU UDARA', accent: 'orange-500', top: 'from-orange-500/0 via-orange-400 to-orange-500/0' },
                  { icon: <Activity size={18} className="text-teal-400" />, value: `${weather.current.humidityPercent}%`, unit: 'KELEMBABAN', accent: 'teal-500', top: 'from-teal-500/0 via-teal-400 to-teal-500/0' },
                  { icon: <Wind    size={18} className="text-slate-400" />, value: weather.current.windSpeed, unit: 'KM/J ANGIN',  accent: 'slate-500',  top: 'from-slate-500/0 via-slate-400 to-slate-500/0'  },
                ].map((m) => (
                  <div key={m.unit} className="hover-lift p-4 rounded-2xl bg-[#050b14]/60 border border-slate-800/60 flex flex-col items-center justify-center relative overflow-hidden group cursor-default">
                    <div className={`absolute top-0 w-full h-[2px] bg-gradient-to-r ${m.top} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                    <div className="mb-2 opacity-80 group-hover:opacity-100 transition-opacity">{m.icon}</div>
                    <div className="text-2xl md:text-3xl font-black text-white tabular-nums">{m.value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">{m.unit}</div>
                  </div>
                ))}
              </div>

              {/* 7 Day Chart */}
              <div className="bg-[#050b14]/30 rounded-2xl p-5 border border-slate-800/40">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Histori Curah Hujan (7 Hari)</h3>
                  <span className="text-xs text-blue-400 font-mono bg-blue-900/20 px-2 py-0.5 rounded border border-blue-800/30">Total: {totalRain7d.toFixed(1)} mm</span>
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
                        transition={{ delay: 0.2 + (i * 0.05), type: 'spring', stiffness: 120, damping: 14 }}
                        className="w-full max-w-[40px] rounded-t-lg relative overflow-hidden group-hover:brightness-125 transition-all duration-200"
                        style={{ background: 'linear-gradient(to top, rgba(30,58,138,0.6), rgba(59,130,246,0.85))', boxShadow: '0 -2px 8px rgba(59,130,246,0.3)' }}
                      >
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
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
                    { label: 'Indeks Risiko Kekeringan', value: weather.risk.droughtRiskScore,  grad: 'linear-gradient(to right,#d97706,#f97316)', glow: 'rgba(249,115,22,0.4)' },
                    { label: 'Indeks Risiko Banjir',     value: weather.risk.excessRainRiskScore,grad: 'linear-gradient(to right,#2563eb,#6366f1)',   glow: 'rgba(99,102,241,0.4)'  },
                    { label: 'Skor Risiko Komposit',     value: weather.risk.overallRiskScore,   grad: 'linear-gradient(to right,#ea580c,#dc2626)',   glow: 'rgba(239,68,68,0.4)'   },
                  ].map((r, i) => (
                    <div key={r.label}>
                      <div className="flex justify-between items-baseline mb-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{r.label}</span>
                        <span className="font-black text-white text-lg tabular-nums">{r.value.toFixed(0)}<span className="text-xs text-slate-500 font-normal ml-0.5">/100</span></span>
                      </div>
                      <div className="progress-track">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${r.value}%` }}
                          transition={{ delay: 0.45 + i * 0.12, duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
                          className="progress-fill"
                          style={{ background: r.grad, boxShadow: `0 0 12px ${r.glow}` }}
                        />
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

            {/* ── Simulate Drought Demo Card (hackathon demo flow) ── */}
            {activePolicy && (
              <motion.div variants={ITEM} className="glass-panel rounded-3xl p-6 md:p-8 border border-red-900/30 relative overflow-hidden">
                {droughtSimStep === 4 && (
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-teal-900/5 pointer-events-none" />
                )}
                <div className="flex items-center gap-3 mb-6">
                  <div className={`p-2.5 rounded-xl border transition-all ${droughtSimStep === 4 ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
                    <CloudRain className={droughtSimStep === 4 ? 'text-emerald-400' : 'text-red-400'} size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white tracking-tight">Demo Klaim Parametrik</h2>
                    <p className="text-xs text-red-300/60 font-mono">Alur end-to-end · Oracle → Smart Contract → USDC</p>
                  </div>
                </div>

                {/* Step progress */}
                <div className="flex items-center mb-6">
                  {(['Drought\nDetected', 'Oracle\nVerified', 'Claim\nTriggered', 'USDC\nDisbursed'] as const).map((label, i) => {
                    const step = (i + 1) as 1|2|3|4
                    const done = droughtSimStep >= step
                    const active = droughtSimStep === step - 1 && droughtSimStep > 0
                    return (
                      <div key={label} className="flex items-center flex-1">
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all duration-500 ${
                            done ? 'bg-emerald-500 border-emerald-400 text-black shadow-[0_0_12px_rgba(52,211,153,0.5)]'
                            : active ? 'bg-amber-500/20 border-amber-400 text-amber-400 animate-pulse'
                            : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}>
                            {done ? '✓' : step}
                          </div>
                          <span className="text-[8px] font-bold uppercase tracking-wide text-center whitespace-pre-line text-slate-500 leading-tight">{label}</span>
                        </div>
                        {i < 3 && <div className={`h-[2px] flex-1 mx-1 mb-5 transition-all duration-700 rounded-full ${droughtSimStep > step ? 'bg-emerald-500' : 'bg-slate-800'}`} />}
                      </div>
                    )
                  })}
                </div>

                {/* Rainfall indicator */}
                <div className={`p-4 rounded-2xl mb-4 border transition-all duration-500 ${droughtSimStep >= 1 ? 'bg-red-900/20 border-red-500/30' : 'bg-slate-900/40 border-slate-800'}`}>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Curah Hujan 30 Hari</span>
                    <span className={`text-2xl font-black tabular-nums transition-colors ${droughtSimStep >= 1 ? 'text-red-400' : 'text-white'}`}>
                      {droughtSimStep >= 1 ? '12' : weather.risk.rollingRainfall30d.toFixed(0)} mm
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1.5">
                    <span className="text-[10px] text-slate-500">Threshold trigger</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${droughtSimStep >= 1 ? 'text-red-400 bg-red-900/30 border-red-500/30' : 'text-amber-400 bg-amber-900/20 border-amber-900/30'}`}>
                      &lt; 40 mm{droughtSimStep >= 1 ? ' ← ⚠ BREACH' : ' ← OK'}
                    </span>
                  </div>
                </div>

                {/* Payout success */}
                {droughtSimStep === 4 && (
                  <motion.div initial={{ opacity: 0, scale: 0.9, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="p-5 rounded-2xl bg-emerald-900/20 border border-emerald-500/40 mb-4 text-center">
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 mb-1">PAYOUT OTOMATIS DIKIRIM</p>
                    <p className="text-4xl font-black text-emerald-400">{formatUsdc(simPayout)}</p>
                    <p className="text-xs text-slate-400 mt-1 font-mono">→ {publicKey?.slice(0, 8)}...{publicKey?.slice(-6)}</p>
                    <p className="text-[10px] text-emerald-500/70 mt-2 font-mono">⚡ Settlement &lt; 6 detik · Zero manual claim · Fully on-chain</p>
                  </motion.div>
                )}

                <button
                  type="button"
                  onClick={() => void handleSimulateDrought()}
                  disabled={droughtSimStep > 0 && droughtSimStep < 4}
                  className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all ${
                    droughtSimStep === 0 ? 'bg-gradient-to-r from-red-600 to-orange-500 text-white hover:from-red-500 hover:to-orange-400 shadow-lg shadow-red-900/30'
                    : droughtSimStep === 4 ? 'bg-slate-800 border border-slate-700 text-slate-400 hover:bg-slate-700'
                    : 'bg-amber-500/10 border border-amber-500/20 text-amber-400 cursor-not-allowed opacity-60'
                  }`}
                >
                  {droughtSimStep === 0 && '🌵 Simulasi Kekeringan & Payout Otomatis'}
                  {droughtSimStep === 1 && <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Mendeteksi Kekeringan...</span>}
                  {droughtSimStep === 2 && <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Verifikasi Oracle Open-Meteo...</span>}
                  {droughtSimStep === 3 && <span className="flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Trigger Klaim Otomatis On-Chain...</span>}
                  {droughtSimStep === 4 && '↺ Reset Simulasi'}
                </button>
                {droughtSimStep === 0 && (
                  <p className="text-[10px] text-center text-slate-500 mt-2 font-mono">Demonstrasi alur parametrik lengkap untuk juri hackathon</p>
                )}
              </motion.div>
            )}

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
                    <p className="text-2xl font-black text-white mt-0.5">{selectedHectares} Hektar</p>
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
                      <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded border border-amber-500/20">&lt; {INSURANCE_ORDER.triggerThresholdMm}mm / 30d</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-400">Policy ID</span>
                      <span className="text-[10px] font-mono text-emerald-400 bg-[#050b14] px-1.5 py-0.5 rounded">{policyId}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-slate-800">
                      <span className="text-xs font-semibold text-slate-400">Tx Hash</span>
                      {policyTx ? (
                        <a
                          href={getExplorerTxUrl(policyTx)}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-[10px] font-mono text-emerald-500 bg-[#050b14] px-1.5 py-0.5 rounded underline underline-offset-2 hover:text-emerald-300"
                        >
                          {policyTx}
                        </a>
                      ) : (
                        <span className="text-[10px] font-mono text-slate-500 bg-[#050b14] px-1.5 py-0.5 rounded">-</span>
                      )}
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
                    {/* Hectare Selector */}
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Luas Lahan</span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedHectares(h => Math.max(1, h - 1))}
                          className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold text-sm flex items-center justify-center transition-colors"
                        >−</button>
                        <span className="text-sm font-black text-white w-16 text-center bg-slate-800 rounded-lg py-0.5">{selectedHectares} Ha</span>
                        <button
                          type="button"
                          onClick={() => setSelectedHectares(h => Math.min(50, h + 1))}
                          className="w-7 h-7 rounded-lg bg-slate-700 hover:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center transition-colors"
                        >+</button>
                      </div>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Maks. Payout</span>
                      <span className="text-sm font-black text-emerald-400">{formatUsdc(selectedHectares * INSURANCE_ORDER.payoutPerHectareUsdc)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-semibold text-slate-400">Trigger</span>
                      <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2.5 py-1 rounded border border-amber-500/20">&lt; {INSURANCE_ORDER.triggerThresholdMm}mm / 30d</span>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-gradient-to-br from-[#050b14] to-slate-900 border border-emerald-900/40 space-y-2">
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Premi Bruto</span>
                      <span className="text-sm font-bold text-slate-400 line-through">{formatUsdc(selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc)}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-1"><Zap size={10} />Subsidi Pool</span>
                      <span className="text-sm font-bold text-emerald-500">−{formatUsdc(selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc * 0.5)}</span>
                    </div>
                    <div className="h-px bg-emerald-900/40" />
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs font-black uppercase tracking-widest text-white">Anda Bayar</span>
                      <span className="text-lg font-black text-emerald-400">{formatUsdc(selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc * 0.5)}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">≈ Rp {(selectedHectares * INSURANCE_ORDER.premiumPerHectareUsdc * 0.5 * 15800).toLocaleString('id-ID')} · kurs ~15.800 IDR/USDC</p>
                  </div>

                  <button
                    onClick={connected && programReady === false ? handleDemoInsurance : handleBuyInsurance}
                    disabled={buyingInsurance || !connected}
                    className={`w-full relative group overflow-hidden rounded-xl ${buyingInsurance || !connected ? 'opacity-70 cursor-not-allowed' : ''}`}
                  >
                    <div className={`absolute inset-0 w-full h-full transition-all duration-300 ease-out ${
                      connected && programReady === false ? 'bg-gradient-to-r from-amber-600 to-orange-500'
                      : connected ? 'bg-gradient-to-r from-emerald-600 to-teal-500'
                      : 'bg-slate-800'
                    }`}></div>
                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-emerald-500 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ease-out blur-[20px]"></div>
                    <span className="relative flex items-center justify-center gap-2 py-4 px-6 text-sm font-bold text-white tracking-wide">
                      {buyingInsurance ? (
                        <>Memproses... <Loader2 size={16} className="animate-spin" /></>
                      ) : programReady === null ? (
                        <>Verifikasi Program On-Chain...</>
                      ) : connected && programReady === false ? (
                        <>🎮 Demo: Aktifkan Proteksi</>
                      ) : connected ? (
                        <>Beli Proteksi Sekarang <ArrowRight size={16} /></>
                      ) : (
                        <>🔗 Hubungkan Wallet Dulu</>
                      )}
                    </span>
                  </button>
                  {programReady === false && connected && (
                    <p className="text-[10px] text-center text-slate-500 font-mono">
                      Mode Simulasi Devnet · Klik untuk demo end-to-end
                    </p>
                  )}
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
                  <a href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} target="_blank" rel="noreferrer noopener" className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2">{PROGRAM_ID_STR.slice(0, 10)}...{PROGRAM_ID_STR.slice(-6)}</a>
                </div>
                <div className="flex justify-between items-center bg-[#050b14] p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Kode Audit</span>
                  <span className="text-amber-400/80">Planned: Q2 2026</span>
                </div>
                <div className="flex justify-between items-center bg-[#050b14] p-2 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Status Program</span>
                  <span className={programReady === null ? 'text-slate-400' : programReady ? 'text-emerald-400' : 'text-amber-400'}>{programReady === null ? 'Verifikasi...' : programReady ? 'Terdeploy' : 'Belum Terdeploy'}</span>
                </div>
              </div>
            </motion.div>

          </div>
        </motion.div>
        </div>
        </div>{/* flex-1 relative */}
      </div>{/* flex-1 column */}
    </div>
  )
}

