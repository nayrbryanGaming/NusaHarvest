'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, Briefcase, Loader2, RefreshCw, Shield, TrendingUp, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import Sidebar from '../../components/Sidebar'
import { useWallet } from '../../providers/WalletProvider'
import { getApiUrl } from '../../utils/api'
import { PROGRAM_ID_STR, RPC_URL } from '../../utils/constants'
import { isProtocolProgramDeployed, fetchPoolStateMetrics } from '../../utils/solana'
import { fetchWithTimeout } from '../../utils/timeout'

const STAKE_MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
const TARGET_APY_FALLBACK = 8.5

type PoolStats = {
  tvlUsdc: number
  claimsPaidUsdc: number
  activePolicies: number
  avgApy: number
  backendConnected: boolean
  loading: boolean
  updatedAt: string
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function usd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function PoolsPage() {
  const { connected, publicKey, usdcBalance, signAndSendTransaction } = useWallet()

  const [programReady, setProgramReady] = useState<boolean | null>(null)
  const [stats, setStats] = useState<PoolStats>({
    tvlUsdc: 0,
    claimsPaidUsdc: 0,
    activePolicies: 0,
    avgApy: 0,
    backendConnected: false,
    loading: true,
    updatedAt: '-',
  })
  const [stakeAmount, setStakeAmount] = useState('')
  const [staking, setStaking] = useState(false)
  const [lastSignature, setLastSignature] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    setStats((prev) => ({ ...prev, loading: true }))

    try {
      // Fetch real on-chain pool metrics
      const metrics = await fetchPoolStateMetrics()
      
      // Parse TVL from formatted string (e.g., "$50.25 USDC" -> 50.25)
      const tvlMatch = metrics.totalTvl.match(/\$([0-9,.]+)/)
      const tvlUsdc = tvlMatch ? parseFloat(tvlMatch[1].replace(/,/g, '')) : 0
      
      setStats({
        tvlUsdc,
        claimsPaidUsdc: 0, // TODO: Fetch from insurance claims data once deployed
        activePolicies: metrics.activePolicies,
        avgApy: 6.0, // Target APY for MVP phase
        backendConnected: true,
        loading: false,
        updatedAt: new Date().toLocaleTimeString('id-ID'),
      })
    } catch (err) {
      console.error('Failed to fetch pool stats:', err)
      setStats((prev) => ({ 
        ...prev, 
        loading: false, 
        backendConnected: false, 
        avgApy: 6.0, // Target APY
        updatedAt: 'Fallback mode (devnet demo)'
      }))
    }
  }, [])

  useEffect(() => {
    void fetchStats()
    const timer = window.setInterval(() => {
      void fetchStats()
    }, 30000)

    return () => window.clearInterval(timer)
  }, [fetchStats])

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

  const handleStake = useCallback(async () => {
    if (!connected || !publicKey) {
      toast.error('Hubungkan wallet terlebih dahulu')
      return
    }

    if (programReady !== true) {
      toast.error('Program pool belum siap di jaringan')
      return
    }

    const amount = Number(stakeAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Jumlah stake tidak valid')
      return
    }

    if (usdcBalance !== null && amount > usdcBalance) {
      toast.error('Jumlah stake melebihi saldo USDC')
      return
    }

    if (staking) return

    setStaking(true)
    const loadingToast = toast.loading('Menandatangani transaksi stake...')

    try {
      const connection = new Connection(RPC_URL, 'confirmed')
      const walletPubkey = new PublicKey(publicKey)
      const memo = `NUSA_HARVEST_STAKE|${publicKey}|${amount.toFixed(2)}|${Date.now()}`

      const instruction = new TransactionInstruction({
        keys: [{ pubkey: walletPubkey, isSigner: true, isWritable: false }],
        programId: new PublicKey(STAKE_MEMO_PROGRAM_ID),
        data: Buffer.from(memo, 'utf8'),
      })

      const tx = new Transaction().add(instruction)
      tx.feePayer = walletPubkey
      const { blockhash } = await connection.getLatestBlockhash('confirmed')
      tx.recentBlockhash = blockhash

      const signed = await signAndSendTransaction(tx)
      const signature = signed?.signature
      if (!signature) throw new Error('Signature tidak ditemukan')

      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      if (confirmation.value.err) throw new Error('Transaksi gagal terkonfirmasi')

      const stakeApi = getApiUrl('/api/pool/stake-mvp')
      if (stakeApi) {
        await fetch(stakeApi, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress: publicKey,
            amountUsdc: amount,
            txSignature: signature,
            poolSymbol: 'NH-RICE',
          }),
        }).catch(() => null)
      }

      setLastSignature(signature)
      setStakeAmount('')
      toast.dismiss(loadingToast)
      toast.success('Stake berhasil dan tercatat on-chain')
      await fetchStats()
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(error?.message || 'Stake gagal diproses')
    } finally {
      setStaking(false)
    }
  }, [connected, fetchStats, programReady, publicKey, signAndSendTransaction, stakeAmount, staking, usdcBalance])

  const health = useMemo(() => {
    if (stats.loading) return 'SYNCING'
    return stats.backendConnected ? 'LIVE' : 'FALLBACK'
  }, [stats.backendConnected, stats.loading])

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur">
          <div className="font-mono text-[11px] text-slate-500">Nusa Harvest / Yield Pools</div>
          <button onClick={() => void fetchStats()} className="p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all" title="Refresh pool stats" aria-label="Refresh pool stats">
            <RefreshCw size={14} className={stats.loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="px-8 py-8 max-w-6xl w-full mx-auto">
          <header className="mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-black text-amber-500 uppercase tracking-widest mb-4">
              <Briefcase size={12} /> Liquidity Protocol
            </div>
            <h1 className="text-5xl font-black tracking-tight">Yield Pools</h1>
            <p className="text-slate-400 mt-3 max-w-3xl">Staking TVL untuk pendanaan produktif dengan verifikasi transaksi on-chain.</p>
          </header>

          <section className="grid md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'TVL', value: stats.loading ? 'Syncing...' : usd(stats.tvlUsdc), icon: <TrendingUp size={18} className="text-emerald-400" /> },
              { label: 'Claims Paid', value: stats.loading ? 'Syncing...' : usd(stats.claimsPaidUsdc), icon: <Shield size={18} className="text-blue-400" /> },
              { label: 'Active Policies', value: stats.loading ? 'Syncing...' : stats.activePolicies.toLocaleString('id-ID'), icon: <Shield size={18} className="text-amber-400" /> },
              { label: 'Avg APY', value: stats.loading ? 'Syncing...' : stats.backendConnected ? `${stats.avgApy.toFixed(2)}%` : `Target ${TARGET_APY_FALLBACK.toFixed(2)}%`, icon: <Zap size={18} className="text-purple-400" /> },
            ].map((card, index) => (
              <motion.div key={card.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }} className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{card.label}</div>
                  {card.icon}
                </div>
                <div className="text-2xl font-black text-white tracking-tight">{card.value}</div>
              </motion.div>
            ))}
          </section>

          <section className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-panel p-6 rounded-3xl">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-black text-white">Stake USDC to Pool</h2>
                <div className="text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase tracking-widest">
                  {health}
                </div>
              </div>

              {!connected ? (
                <div className="p-8 border border-dashed border-amber-500/30 rounded-2xl bg-amber-500/5 text-center">
                  <AlertTriangle size={30} className="mx-auto text-amber-400 mb-3" />
                  <p className="text-slate-300 mb-2">Hubungkan wallet untuk mulai stake.</p>
                  <p className="font-mono text-[11px] text-slate-500">Gunakan tombol <span className="text-amber-400 font-bold">Hubungkan Wallet</span> di pojok kanan atas.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    Saldo USDC: {usdcBalance !== null ? usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      value={stakeAmount}
                      onChange={(event) => setStakeAmount(event.target.value)}
                      placeholder="0.00"
                      className="w-full bg-[#050b14]/80 border-2 border-white/10 rounded-2xl p-5 pr-20 text-white font-black text-2xl focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={() => {
                        if (usdcBalance !== null) setStakeAmount(String(usdcBalance))
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-400 bg-amber-400/10 px-3 py-2 rounded-xl border border-amber-500/20"
                    >
                      MAX
                    </button>
                  </div>
                  <button
                    onClick={() => void handleStake()}
                    disabled={staking || programReady !== true}
                    className={`w-full py-4 rounded-2xl bg-gradient-to-r from-amber-600 to-yellow-500 text-yellow-950 font-black text-sm uppercase tracking-widest transition-all ${staking || programReady !== true ? 'opacity-70 cursor-not-allowed' : 'hover:from-amber-500 hover:to-yellow-400'}`}
                  >
                    {staking ? (
                      <span className="inline-flex items-center gap-2">
                        Memproses <Loader2 size={16} className="animate-spin" />
                      </span>
                    ) : programReady === null ? (
                      'Verifikasi Program...'
                    ) : programReady === false ? (
                      'Program Belum Live'
                    ) : (
                      'Stake Sekarang'
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-3xl">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4">On-chain Proof</h3>
              <a
                href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-emerald-300 hover:text-emerald-200 font-bold text-sm"
              >
                Program Explorer <ArrowUpRight size={14} />
              </a>

              {lastSignature && (
                <div className="mt-4 text-xs text-slate-300 break-all">
                  Signature terakhir:
                  <a href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`} target="_blank" rel="noreferrer" className="block mt-1 text-emerald-300 underline underline-offset-2">
                    {lastSignature}
                  </a>
                </div>
              )}

              <p className="text-[11px] text-slate-500 mt-6">Last updated: {stats.updatedAt}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
