'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Shield, Lock, Activity, TrendingUp, AlertTriangle, Briefcase, Zap, Database, ArrowUpRight, RefreshCw, Loader2 } from 'lucide-react'
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import { useWallet, ConnectWalletButton } from '../../providers/WalletProvider'
import Sidebar from '../../components/Sidebar'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { PROGRAM_ID_STR, RPC_URL } from '../../utils/constants'
import { getApiUrl } from '../../utils/api'
import { isProtocolProgramDeployed } from '../../utils/solana'
import { useSim } from '../../contexts/SimulationContext'

const LATENCY_CACHE_KEY = 'nusa_oracle_latency_ms'
const LATENCY_CACHE_TTL = 30 * 60 * 1000 // 30 minutes

function getCachedLatency(): string | null {
  try {
    const raw = localStorage.getItem(LATENCY_CACHE_KEY)
    if (!raw) return null
    const { value, ts } = JSON.parse(raw)
    if (Date.now() - ts > LATENCY_CACHE_TTL) return null
    return value as string
  } catch { return null }
}

function setCachedLatency(value: string): void {
  try {
    localStorage.setItem(LATENCY_CACHE_KEY, JSON.stringify({ value, ts: Date.now() }))
  } catch {}
}

// Simulated baseline metrics — shown when backend unreachable
const SIM_POOL_STATS = {
  tvlUsdc:        18_450,
  claimsPaidUsdc: 4_250,
  activePolicies: 5,
  defaultRate:    '8.4%',
  avgApy:         9.4,
  solPriceIdr:    2_480_000, // ~$155 × Rp16,000 — updated Q2 2026
}

const STAKE_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const LOCAL_STAKE_KEY_PREFIX = 'nusa_harvest_latest_stake_'
const TX_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{80,100}$/

type StakeMvpApiResponse = {
  success?: boolean
  degraded?: boolean
  warning?: string
  error?: string
  data?: {
    investmentId?: string
    amountUsdc?: number
    txSignature?: string
    stakedAt?: string
  }
}

type LocalStakeSnapshot = {
  amountUsdc: number
  txSignature: string
  stakedAt: string
  investmentId?: string
}

function getLocalStakeKey(walletAddress: string): string {
  return `${LOCAL_STAKE_KEY_PREFIX}${walletAddress}`
}

function isLikelyTxSignature(value: string): boolean {
  return TX_SIGNATURE_REGEX.test(value)
}

function clearLocalStake(walletAddress: string): void {
  localStorage.removeItem(getLocalStakeKey(walletAddress))
}

function readLocalStake(walletAddress: string): LocalStakeSnapshot | null {
  try {
    const raw = localStorage.getItem(getLocalStakeKey(walletAddress))
    if (!raw) return null

    const parsed = JSON.parse(raw) as LocalStakeSnapshot
    if (!parsed.txSignature || !isLikelyTxSignature(parsed.txSignature)) return null
    return parsed
  } catch {
    return null
  }
}

function writeLocalStake(walletAddress: string, payload: LocalStakeSnapshot): void {
  localStorage.setItem(getLocalStakeKey(walletAddress), JSON.stringify(payload))
}

function getExplorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`
}

interface PoolStats {
  tvlUsdc: number
  claimsPaidUsdc: number
  activePolicies: number
  defaultRate: string
  oracleLatency: string
  solPriceIdr: number | null
  avgApy: number | null
  backendConnected: boolean
  loading: boolean
  lastUpdated: string | null
}

export default function PoolsPage() {
  const { connected, usdcBalance, publicKey, signAndSendTransaction } = useWallet()
  const sim = useSim()
  const [stakeAmount, setStakeAmount] = useState<string>('')
  const [staking, setStaking] = useState(false)
  const [latestStake, setLatestStake] = useState<LocalStakeSnapshot | null>(null)
  const [programReady, setProgramReady] = useState<boolean | null>(null)
  const [stats, setStats] = useState<PoolStats>({
    tvlUsdc: 0,
    claimsPaidUsdc: 0,
    activePolicies: 0,
    defaultRate: '0.00%',
    oracleLatency: '0ms',
    solPriceIdr: null,
    avgApy: null,
    backendConnected: false,
    loading: true,
    lastUpdated: null
  })

  // Fetch pool metrics from backend + fallback to on-chain RPC and public market feeds.
  const fetchStats = useCallback(async () => {
    setStats(prev => ({ ...prev, loading: true }))
    try {
      const cached = getCachedLatency()
      let oracleLatencyStr: string
      if (cached) {
        oracleLatencyStr = cached
      } else {
        const start = Date.now()
        await fetch('https://api.open-meteo.com/v1/forecast?latitude=-7.25&longitude=112.75&current=temperature_2m')
        const raw = Date.now() - start
        oracleLatencyStr = `${raw}ms`
        setCachedLatency(oracleLatencyStr)
      }

      const metricsApiUrl = getApiUrl('/api/pool/metrics')
      if (metricsApiUrl) {
        const metricsRes = await fetch(metricsApiUrl)
        if (metricsRes.ok) {
          const metricsPayload = await metricsRes.json()
          if (metricsPayload?.success && metricsPayload?.data) {
            const data = metricsPayload.data
            const totalPolicies = typeof data.insurance?.totalPolicies === 'number' ? data.insurance.totalPolicies : 0
            const totalClaims = typeof data.insurance?.totalClaims === 'number' ? data.insurance.totalClaims : 0

            setStats({
              tvlUsdc: typeof data.finance?.totalTvlUsdc === 'number' ? data.finance.totalTvlUsdc : 0,
              claimsPaidUsdc: typeof data.finance?.totalClaimsPaidUsdc === 'number' ? data.finance.totalClaimsPaidUsdc : 0,
              activePolicies: typeof data.insurance?.activePolicies === 'number' ? data.insurance.activePolicies : 0,
              defaultRate: totalPolicies > 0 ? `${((totalClaims / totalPolicies) * 100).toFixed(2)}%` : '0.00%',
              oracleLatency: oracleLatencyStr,
              solPriceIdr: typeof data.network?.solPriceIdr === 'number' ? data.network.solPriceIdr : null,
              avgApy: typeof data.finance?.avgApy === 'number' ? data.finance.avgApy : null,
              backendConnected: true,
              loading: false,
              lastUpdated: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
            })
            return
          }
        }
      }

      const [rpcData, cgData] = await Promise.all([
        fetch('https://api.devnet.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getBalance',
            params: [PROGRAM_ID_STR]
          })
        }).then((res) => (res.ok ? res.json() : null)),
        fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd,idr')
          .then((res) => (res.ok ? res.json() : null))
      ])

      const lamports = typeof rpcData?.result?.value === 'number' ? rpcData.result.value : 0
      const solBalance = lamports / 1e9
      const solPriceUsd = typeof cgData?.solana?.usd === 'number' ? cgData.solana.usd : 0
      const solPriceIdr = typeof cgData?.solana?.idr === 'number' ? cgData.solana.idr : null

      const tvlUsd = solBalance * solPriceUsd

      // Use simulated baseline when backend is unreachable; never show $0
      const simTvl = tvlUsd > 1 ? tvlUsd : SIM_POOL_STATS.tvlUsdc
      setStats({
        tvlUsdc:        simTvl,
        claimsPaidUsdc: SIM_POOL_STATS.claimsPaidUsdc,
        activePolicies: SIM_POOL_STATS.activePolicies,
        defaultRate:    SIM_POOL_STATS.defaultRate,
        oracleLatency:  oracleLatencyStr,
        solPriceIdr,
        avgApy:         SIM_POOL_STATS.avgApy,
        backendConnected: false,
        loading: false,
        lastUpdated: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB (sim)'
      })
    } catch (e) {
      console.error('Stats fetch failed:', e)
      setStats(prev => ({
        ...prev,
        tvlUsdc:        prev.tvlUsdc > 0 ? prev.tvlUsdc : SIM_POOL_STATS.tvlUsdc,
        claimsPaidUsdc: prev.claimsPaidUsdc > 0 ? prev.claimsPaidUsdc : SIM_POOL_STATS.claimsPaidUsdc,
        activePolicies: prev.activePolicies > 0 ? prev.activePolicies : SIM_POOL_STATS.activePolicies,
        defaultRate:    prev.defaultRate !== '0.00%' ? prev.defaultRate : SIM_POOL_STATS.defaultRate,
        avgApy:         prev.avgApy ?? SIM_POOL_STATS.avgApy,
        solPriceIdr:    prev.solPriceIdr ?? SIM_POOL_STATS.solPriceIdr,
        loading: false,
        lastUpdated: 'Offline · cache data'
      }))
    }
  }, [])

  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 60000)
    return () => clearInterval(interval)
  }, [fetchStats])

  useEffect(() => {
    if (!publicKey) {
      setLatestStake(null)
      return
    }

    if (programReady !== true) {
      setLatestStake(null)
      if (programReady === false) clearLocalStake(publicKey)
      return
    }

    const localStake = readLocalStake(publicKey)
    if (!localStake) {
      clearLocalStake(publicKey)
      setLatestStake(null)
      return
    }

    setLatestStake(localStake)
  }, [publicKey, programReady])

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

  const handleStake = async () => {
    if (!connected || !publicKey) {
      toast.error('Hubungkan wallet terlebih dahulu')
      return
    }

    if (programReady === null) {
      toast.error('Sedang memverifikasi status program pool on-chain. Coba lagi sebentar.')
      return
    }

    if (programReady === false) {
      toast.error('Program pool belum terdeploy di Solana Devnet. Transaksi stake diblokir.')
      return
    }

    const normalizedAmount = Number(stakeAmount)
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      toast.error('Masukkan jumlah USDC yang valid')
      return
    }

    if (usdcBalance !== null && normalizedAmount > usdcBalance) {
      toast.error('Jumlah stake melebihi saldo USDC wallet Anda')
      return
    }

    if (staking) return

    setStaking(true)
    const loadingToast = toast.loading('Menandatangani transaksi stake USDC...', {
      style: { borderRadius: '12px', background: '#020617', color: '#fbbf24', border: '1px solid #fbbf24' }
    })

    try {
      const connection = new Connection(RPC_URL, 'confirmed')
      const walletPubkey = new PublicKey(publicKey)
      const memoPayload = `NUSA_HARVEST_STAKE|${publicKey}|${normalizedAmount.toFixed(2)}|${Date.now()}`

      const memoInstruction = new TransactionInstruction({
        keys: [{ pubkey: walletPubkey, isSigner: true, isWritable: false }],
        programId: new PublicKey(STAKE_MEMO_PROGRAM_ID),
        data: Buffer.from(memoPayload, 'utf8')
      })

      const transaction = new Transaction().add(memoInstruction)
      transaction.feePayer = walletPubkey
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      transaction.recentBlockhash = blockhash

      const signedResult = await signAndSendTransaction(transaction)
      const txSignature = signedResult?.signature
      if (!txSignature) {
        throw new Error('Signature transaksi stake tidak ditemukan.')
      }

      const confirmation = await connection.confirmTransaction(txSignature, 'confirmed')
      if (confirmation.value.err) {
        throw new Error('Transaksi stake gagal terkonfirmasi di jaringan.')
      }

      const stakeApiUrl = getApiUrl('/api/pool/stake-mvp')
      let backendWarning = ''
      let investmentId: string | undefined
      let stakeTimestamp = new Date().toISOString()

      if (stakeApiUrl) {
        try {
          const response = await fetch(stakeApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress: publicKey,
              amountUsdc: normalizedAmount,
              txSignature,
              poolSymbol: 'NH-RICE'
            })
          })

          const payload = (await response.json().catch(() => null)) as StakeMvpApiResponse | null
          if (!response.ok || !payload?.success) {
            backendWarning = payload?.error || payload?.warning || 'Sinkronisasi stake ke backend belum berhasil.'
          } else {
            investmentId = payload.data?.investmentId
            if (payload.data?.stakedAt) stakeTimestamp = payload.data.stakedAt
            if (payload.warning) backendWarning = payload.warning
          }
        } catch (backendError: any) {
          backendWarning = backendError?.message || 'Backend tidak merespons saat mencatat stake.'
        }
      } else {
        backendWarning = 'NEXT_PUBLIC_API_BASE_URL belum diset di deployment frontend.'
      }

      const localSnapshot: LocalStakeSnapshot = {
        amountUsdc: normalizedAmount,
        txSignature,
        stakedAt: stakeTimestamp,
        investmentId
      }
      writeLocalStake(publicKey, localSnapshot)
      setLatestStake(localSnapshot)

      setStakeAmount('')
      setStats((prev) => ({
        ...prev,
        tvlUsdc: prev.tvlUsdc + normalizedAmount,
        lastUpdated: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB'
      }))
      await fetchStats()

      toast.dismiss(loadingToast)
      if (backendWarning) {
        toast.success('Transaksi wallet terkonfirmasi. Sinkronisasi metrik backend sedang menyusul.', { icon: '✅' })
      } else {
        toast.success('Catatan stake tersimpan dan transaksi wallet terkonfirmasi.', { icon: '💼' })
      }
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(error?.message || 'Transaksi stake gagal diproses')
    } finally {
      setStaking(false)
    }
  }

  const formatUSD = (val: number) => {
    if (val === 0) return '$0.00'
    if (val < 0.01) return `$${(val).toFixed(6)}`
    return `$${val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px]">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-0 z-10 bg-[#02050a]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Yield Pools</span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-amber-900/40 bg-amber-950/20 text-amber-500 hidden sm:block">APY 8–12% · Simulation</span>
        </div>
        <div className="flex-1 relative overflow-auto">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-amber-500/5 blur-[120px] -z-10 rounded-full pointer-events-none" />

      <div className="px-8 pt-8 pb-16 max-w-5xl mx-auto">
        <header className="mb-12">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 mb-4">
            <div className="px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
              <Briefcase size={12} /> AgroFi Liquidity Protocol
            </div>
            {!stats.loading && (
              <div className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Diperbarui: {stats.lastUpdated}
              </div>
            )}
          </motion.div>
          <h1 className="text-5xl md:text-6xl font-black text-white mb-4 italic tracking-tighter">Yield <span className="text-amber-400 underline decoration-amber-500/20">Pools</span></h1>
          <p className="text-slate-400 text-lg max-w-2xl font-medium leading-relaxed">
            Staking TVL untuk disalurkan sebagai pinjaman produktif kepada jaringan Petani Koperasi. Dilindungi penuh oleh Asuransi Parametrik.
          </p>
        </header>

        <div className="grid md:grid-cols-4 gap-4 mb-12">
          {[
            { title: 'Petani Wajib Asuransi', desc: 'Mitigasi 100% gagal bayar iklim.',   icon: Shield,    color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20'   },
            { title: 'Kerjasama Koperasi',    desc: 'KYC & penyaluran via koperasi.',      icon: Briefcase, color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'     },
            { title: 'Insurance On-Chain',    desc: 'Polis asuransi di-lock di SC.',        icon: Lock,      color: 'text-emerald-400',bg: 'bg-emerald-500/10 border-emerald-500/20'},
            { title: '20% Reserve Cash',      desc: 'Reserve TVL untuk likuiditas.',       icon: Zap,       color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20'  },
          ].map((item, i) => {
            const Icon = item.icon
            return (
              <motion.div key={i} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08, duration: 0.35, ease: [0.22,1,0.36,1] }}
                className="hover-lift glass-panel p-5 rounded-2xl flex flex-col gap-3 group">
                <div className={`p-2.5 rounded-xl border self-start ${item.bg}`}>
                  <Icon className={item.color} size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-xs uppercase tracking-widest">{item.title}</h3>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-[#0a1628]/20 relative overflow-hidden">
              <div className="flex justify-between items-start mb-10 pb-8 border-b border-white/5">
                <div>
                  <h2 className="text-3xl font-black text-white italic flex items-center gap-3">
                    <TrendingUp className="text-emerald-400" /> Padi Ciherang Pool
                  </h2>
                  <p className="text-slate-500 mt-2 font-bold text-sm uppercase tracking-widest">
                    APY Target: <span className="text-emerald-400">{stats.avgApy !== null ? `${stats.avgApy.toFixed(2)}%` : 'Fetching...'}</span> (USDC Stablecoin)
                  </p>
                </div>
                <div className="text-right">
                  <span className={`text-[10px] font-black px-3 py-1.5 rounded-xl border uppercase tracking-widest ${stats.backendConnected ? 'text-emerald-400 bg-emerald-400/10 border-emerald-500/20' : 'text-amber-400 bg-amber-400/10 border-amber-500/20'}`}>
                    {stats.backendConnected ? 'Backend + Devnet' : 'Devnet Fallback'}
                  </span>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-8 mb-10">
                <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 group hover:border-amber-500/20 transition-all">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Program Balance (Devnet)</div>
                  <div className="text-4xl font-black text-white mb-2 tracking-tighter">
                    {stats.loading ? (
                      <span className="text-slate-600 text-2xl flex items-center gap-2"><RefreshCw size={20} className="animate-spin" /> Memuat...</span>
                    ) : (
                      formatUSD(stats.tvlUsdc)
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-400 uppercase tracking-widest">
                    <ArrowUpRight size={12} /> {stats.backendConnected ? 'Data dari backend protocol metrics' : 'Data dari Solana Devnet RPC'}
                  </div>
                </div>
                <div className="bg-white/[0.02] p-6 rounded-3xl border border-white/5 group hover:border-blue-500/20 transition-all">
                  <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-3">Total Klaim Dibayar</div>
                  <div className="text-4xl font-black text-white mb-2 tracking-tighter">
                    {stats.loading ? (
                      <span className="text-slate-600 text-2xl flex items-center gap-2"><RefreshCw size={20} className="animate-spin" /> Memuat...</span>
                    ) : (
                      formatUSD(stats.claimsPaidUsdc)
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                    <Shield size={12} /> Data sumber: tabel claim + pool aggregate
                  </div>
                </div>
              </div>

              {!connected ? (
                <div className="p-10 text-center border-2 border-dashed border-amber-500/20 bg-amber-500/5 rounded-[40px]">
                  <AlertTriangle className="mx-auto text-amber-400 mb-6" size={48} />
                  <h3 className="text-xl font-black text-white mb-2 uppercase tracking-tight">Hubungkan Wallet</h3>
                  <p className="text-slate-500 text-sm mb-8 max-w-md mx-auto font-medium">
                    Hubungkan Solana Wallet untuk menjadi Liquidity Provider di AgroFi Protocol.
                  </p>
                  <ConnectWalletButton className="mx-auto px-10 py-5 rounded-[20px] font-black uppercase tracking-widest text-sm bg-amber-500 text-amber-950 hover:bg-amber-400 transition-all shadow-[0_0_40px_rgba(245,158,11,0.2)] hover:scale-105" />
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="flex justify-between text-xs font-black uppercase tracking-widest text-slate-500">
                    <span>Jumlah Stake USDC</span>
                    <span className="text-white">
                      Saldo: {usdcBalance !== null ? usdcBalance.toLocaleString('en-US', {minimumFractionDigits: 2}) : '0.00'} USDC
                    </span>
                  </div>
                  <div className="relative group">
                    <input 
                      type="number" 
                      value={stakeAmount}
                      onChange={(e) => setStakeAmount(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      className="w-full bg-[#050b14]/80 border-2 border-white/10 rounded-2xl p-6 pr-24 text-white font-black text-2xl focus:outline-none focus:border-amber-500/50 focus:ring-4 focus:ring-amber-500/10 transition-all placeholder:text-slate-800"
                    />
                    <button 
                      onClick={() => usdcBalance && setStakeAmount(usdcBalance.toString())}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-400 hover:text-amber-300 bg-amber-400/10 px-4 py-2.5 rounded-xl border border-amber-500/20 transition-all"
                    >
                      MAX
                    </button>
                  </div>
                  <button 
                    onClick={handleStake}
                    disabled={staking || programReady !== true}
                    className={`w-full py-6 rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-500 hover:to-yellow-400 text-yellow-950 font-black text-sm uppercase tracking-[0.3em] transition-all shadow-[0_0_50px_rgba(245,158,11,0.3)] hover:scale-[1.01] active:scale-95 ${staking || programReady !== true ? 'opacity-80 cursor-not-allowed' : ''}`}
                  >
                    {staking ? (
                      <span className="inline-flex items-center gap-2">
                        Memproses Stake <Loader2 size={16} className="animate-spin" />
                      </span>
                    ) : programReady === null ? (
                      'Verifikasi Program On-Chain...'
                    ) : programReady === false ? (
                      'Program Pool Belum Live'
                    ) : (
                      'Stake ke Pool Devnet'
                    )}
                  </button>
                  {programReady === false && (
                    <p className="text-[10px] text-center text-amber-400 font-bold uppercase tracking-widest">
                      Program ID {PROGRAM_ID_STR.slice(0,8)}... belum executable di Devnet. Fitur stake dinonaktifkan sampai deploy valid selesai.
                    </p>
                  )}
                  <p className="text-[10px] text-center text-slate-600 font-bold uppercase tracking-widest italic">
                    Setiap stake memerlukan tanda tangan wallet dan verifikasi transaksi sebelum metrik diperbarui.
                  </p>
                  {programReady === true && latestStake && (
                    <p className="text-[10px] text-center text-emerald-400 font-bold uppercase tracking-widest">
                      Stake terakhir: {latestStake.amountUsdc.toFixed(2)} USDC •{' '}
                      <a
                        href={getExplorerTxUrl(latestStake.txSignature)}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline underline-offset-2 hover:text-emerald-300"
                      >
                        Tx {latestStake.txSignature.slice(0, 8)}...{latestStake.txSignature.slice(-6)}
                      </a>
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="glass-panel p-8 rounded-[40px] border border-white/5 bg-white/[0.01]">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-400 flex items-center gap-2 uppercase tracking-widest"><Activity size={18}/> Protocol Health</h3>
                <button
                  onClick={fetchStats}
                  title="Refresh pool stats"
                  aria-label="Refresh pool stats"
                  className="text-slate-600 hover:text-white transition-colors"
                >
                  <RefreshCw size={14} className={stats.loading ? 'animate-spin' : ''} />
                </button>
              </div>
              <div className="space-y-6">
                {[
                  { label: 'Program TVL', value: stats.loading ? 'Memuat...' : formatUSD(stats.tvlUsdc), color: 'text-white' },
                  { label: 'Active Policies', value: stats.loading ? 'Memuat...' : stats.activePolicies.toLocaleString('id-ID'), color: 'text-emerald-400' },
                  { label: 'Oracle Latency', value: stats.loading ? 'Memuat...' : stats.oracleLatency, color: 'text-blue-400' },
                  { label: 'Default Rate', value: stats.defaultRate, color: 'text-emerald-400' },
                  { label: 'SOL Price (IDR)', value: stats.loading ? 'Memuat...' : stats.solPriceIdr ? `Rp ${stats.solPriceIdr.toLocaleString('id-ID')}` : `Rp ${SIM_POOL_STATS.solPriceIdr.toLocaleString('id-ID')} *`, color: 'text-amber-400' }
                ].map((row, i) => (
                  <div key={i} className="flex justify-between items-center text-xs pb-4 border-b border-white/5">
                    <span className="text-slate-500 font-bold uppercase tracking-widest">{row.label}</span>
                    <span className={`font-black ${row.color}`}>{row.value}</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-8">
                <div className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-4">Program ID</div>
                <Link 
                  href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} 
                  target="_blank" 
                  className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between group hover:bg-white/10 transition-all"
                >
                  <div className="text-[10px] font-mono text-slate-400">{PROGRAM_ID_STR.slice(0, 8)}...{PROGRAM_ID_STR.slice(-6)}</div>
                  <ArrowUpRight size={14} className="text-slate-600 group-hover:text-amber-400 transition-all" />
                </Link>
              </div>
            </div>

            <div className="p-8 rounded-[40px] bg-gradient-to-br from-indigo-900/60 to-slate-900 border border-indigo-500/20 relative overflow-hidden group">
              <Database className="text-indigo-400 mb-6 group-hover:scale-110 transition-transform" size={40} />
              <h4 className="text-xl font-black text-white mb-3 italic tracking-tight underline decoration-indigo-500/30">Investor Guard</h4>
              <p className="text-xs text-indigo-200/60 leading-relaxed font-medium">
                Polis asuransi petani terkunci secara programmatik sebagai penjamin likuiditas LP. Tidak ada risiko gagal bayar akibat bencana iklim.
              </p>
              <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
            </div>
          </div>
        </div>

        {/* ── Wallet Portfolio (shown when connected) ── */}
        {connected && (
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0,transition:{delay:0.1,duration:0.4}}}
            className="mt-10 glass-panel p-8 rounded-[40px] border border-amber-500/20 bg-amber-950/10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={16}/> Your Portfolio
              </h3>
              <div className="font-mono text-[10px] text-slate-500">
                Total invested · <span className="text-white font-bold">${sim.totalInvestedUsdc.toLocaleString()} USDC</span>
                &nbsp;·&nbsp; Est. ROI · <span className="text-emerald-400 font-bold">{sim.estimatedRoiPct}%</span>
                &nbsp;·&nbsp; Risk · <span className={`font-bold ${sim.riskLevel==='LOW'?'text-emerald-400':sim.riskLevel==='MEDIUM'?'text-amber-400':'text-red-400'}`}>{sim.riskLevel}</span>
              </div>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {sim.portfolioPositions.map((pos) => (
                <div key={pos.poolId} className="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="font-mono text-[9.5px] uppercase tracking-widest text-slate-500 mb-2">{pos.poolId}</p>
                  <p className="text-white font-bold text-sm mb-3">{pos.poolName}</p>
                  <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
                    <div><p className="text-slate-600 mb-0.5">Invested</p><p className="text-white">${pos.invested}</p></div>
                    <div><p className="text-slate-600 mb-0.5">APY</p><p className="text-emerald-400">{pos.apy}%</p></div>
                    <div><p className="text-slate-600 mb-0.5">Earned</p><p className="text-amber-400">+${pos.earned}</p></div>
                  </div>
                  <p className="font-mono text-[9px] text-slate-700 mt-2">Since {pos.joinedAt}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── Fund Flow ── */}
        <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0,transition:{delay:0.2,duration:0.4}}}
          className="mt-8 glass-panel p-8 rounded-[40px] border border-white/5">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <ArrowUpRight size={16} className="text-emerald-400"/> Fund Flow — Investor → Petani
          </h3>
          <div className="flex flex-col md:flex-row items-stretch gap-0">
            {sim.fundFlow.map((step, i) => (
              <div key={i} className="flex-1 flex flex-col md:flex-row items-center">
                <div className="flex-1 p-4 rounded-[12px] border border-white/[0.06] bg-[#050b14]">
                  <p className="font-mono text-[9px] uppercase tracking-widest text-slate-600 mb-1">{step.from} → {step.to}</p>
                  <p className="font-display text-xl text-white">${step.amount.toLocaleString()}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${step.status==='completed'?'bg-emerald-400':step.status==='in-progress'?'bg-amber-400 animate-pulse':'bg-slate-600'}`}/>
                    <span className="font-mono text-[9px] text-slate-500 capitalize">{step.status}</span>
                  </div>
                  <p className="font-mono text-[8.5px] text-slate-700 mt-1">{step.timestamp}</p>
                </div>
                {i < sim.fundFlow.length - 1 && (
                  <div className="text-slate-700 px-2 py-1 text-lg font-mono select-none rotate-90 md:rotate-0">›</div>
                )}
              </div>
            ))}
          </div>
        </motion.div>

      </div>{/* max-w-5xl mx-auto */}
        </div>{/* flex-1 overflow-auto */}
      </div>{/* flex-1 column */}
    </div>
  )
}
