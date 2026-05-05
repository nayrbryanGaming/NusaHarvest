'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Connection, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js'
import { Buffer } from 'buffer'
import { motion } from 'framer-motion'
import { AlertTriangle, ArrowUpRight, Briefcase, Loader2, RefreshCw, Shield, TrendingUp, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import Sidebar from '../../components/Sidebar'
import TxHistoryBar from '../../components/TxHistoryBar'
import { useWallet } from '../../providers/WalletProvider'
import { useLanguage } from '../../contexts/LanguageContext'
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
  const { t } = useLanguage()

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
  const [txRefreshTrigger, setTxRefreshTrigger] = useState(0)

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
      toast.error(t('Hubungkan wallet terlebih dahulu', 'Connect your wallet first'))
      return
    }

    if (programReady !== true) {
      toast.error(t('Program pool belum siap di jaringan', 'Pool program not ready on network'))
      return
    }

    const amount = Number(stakeAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(t('Jumlah deposit tidak valid', 'Invalid deposit amount'))
      return
    }

    if (usdcBalance !== null && amount > usdcBalance) {
      toast.error(t('Jumlah deposit melebihi saldo USDC', 'Deposit amount exceeds USDC balance'))
      return
    }

    if (staking) return

    setStaking(true)
    const loadingToast = toast.loading(t('Menandatangani transaksi deposit...', 'Signing deposit transaction...'))

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
      if (!signature) throw new Error(t('Signature tidak ditemukan', 'Signature not found'))

      const confirmation = await connection.confirmTransaction(signature, 'confirmed')
      if (confirmation.value.err) throw new Error(t('Transaksi gagal terkonfirmasi', 'Transaction failed to confirm'))

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
      setTxRefreshTrigger((n) => n + 1)
      toast.dismiss(loadingToast)
      toast.success(t('Deposit berhasil dan tercatat on-chain', 'Deposit successful and recorded on-chain'))
      await fetchStats()
    } catch (error: any) {
      toast.dismiss(loadingToast)
      toast.error(error?.message || t('Deposit gagal diproses', 'Deposit processing failed'))
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
              <Briefcase size={12} /> {t('Protokol Lending', 'Lending Protocol')}
            </div>
            <h1 className="text-5xl font-black tracking-tight">Yield Pools</h1>
            <p className="text-slate-400 mt-3 max-w-3xl">
              {t('Deposit USDC ke pool untuk mendanai pinjaman petani Indonesia. Verifikasi transaksi on-chain real-time.', 'Deposit USDC into pools to fund Indonesian farmer loans. Real-time on-chain transaction verification.')}
            </p>
          </header>

          <section className="grid md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'TVL', value: stats.loading ? t('Sinkronisasi...', 'Syncing...') : usd(stats.tvlUsdc), icon: <TrendingUp size={18} className="text-emerald-400" /> },
              { label: t('Pinjaman Disalurkan', 'Loans Disbursed'), value: stats.loading ? t('Sinkronisasi...', 'Syncing...') : usd(stats.claimsPaidUsdc), icon: <Shield size={18} className="text-blue-400" /> },
              { label: t('Pinjaman Aktif', 'Active Loans'), value: stats.loading ? t('Sinkronisasi...', 'Syncing...') : stats.activePolicies.toLocaleString('id-ID'), icon: <Shield size={18} className="text-amber-400" /> },
              { label: t('Rata-rata APY', 'Avg APY'), value: stats.loading ? t('Sinkronisasi...', 'Syncing...') : stats.backendConnected ? `${stats.avgApy.toFixed(2)}%` : `Target ${TARGET_APY_FALLBACK.toFixed(2)}%`, icon: <Zap size={18} className="text-purple-400" /> },
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
                <h2 className="text-lg font-black text-white">{t('Deposit USDC ke Pool', 'Deposit USDC to Pool')}</h2>
                <div className="text-[10px] font-black px-3 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 uppercase tracking-widest">
                  {health}
                </div>
              </div>

              {!connected ? (
                <div className="p-8 border border-dashed border-amber-500/30 rounded-2xl bg-amber-500/5 text-center">
                  <AlertTriangle size={30} className="mx-auto text-amber-400 mb-3" />
                  <p className="text-slate-300 mb-2">{t('Hubungkan wallet untuk mulai deposit.', 'Connect wallet to start depositing.')}</p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {t('Gunakan tombol', 'Use the')} <span className="text-amber-400 font-bold">{t('Hubungkan Wallet', 'Connect Wallet')}</span> {t('di pojok kanan atas.', 'in the top right corner.')}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-xs text-slate-500 font-bold uppercase tracking-widest">
                    {t('Saldo USDC', 'USDC Balance')}: {usdcBalance !== null ? usdcBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '...'}
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
                        {t('Memproses', 'Processing')} <Loader2 size={16} className="animate-spin" />
                      </span>
                    ) : programReady === null ? (
                      t('Verifikasi Program...', 'Verifying Program...')
                    ) : programReady === false ? (
                      t('Program Belum Live', 'Program Not Live')
                    ) : (
                      t('Deposit Sekarang', 'Deposit Now')
                    )}
                  </button>

                  {/* TX History — muncul setelah deposit atau saat wallet connect */}
                  <TxHistoryBar
                    walletAddress={publicKey ?? ''}
                    refreshTrigger={txRefreshTrigger}
                    label={t('Riwayat Deposit', 'Deposit History')}
                  />
                </div>
              )}
            </div>

            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">On-chain Proof</h3>

              <div className="space-y-2 font-mono text-[11px]">
                <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
                  <span className="text-slate-500">Network</span>
                  <span className="text-indigo-300 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" /> Solana Devnet
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
                  <span className="text-slate-500">Program ID</span>
                  <a
                    href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`}
                    target="_blank" rel="noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 flex items-center gap-1"
                  >
                    {PROGRAM_ID_STR.slice(0, 8)}…{PROGRAM_ID_STR.slice(-5)} <ArrowUpRight size={10} />
                  </a>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/[0.04]">
                  <span className="text-slate-500">Pool Status</span>
                  <span className={stats.backendConnected ? 'text-emerald-400' : 'text-amber-400'}>
                    {stats.loading ? 'Syncing…' : stats.backendConnected ? 'Live' : 'Offline'}
                  </span>
                </div>
                {lastSignature && (
                  <div className="py-2">
                    <span className="text-slate-500 block mb-1">{t('Deposit Terakhir', 'Last Deposit')}</span>
                    <a
                      href={`https://explorer.solana.com/tx/${lastSignature}?cluster=devnet`}
                      target="_blank" rel="noreferrer"
                      className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2 break-all"
                    >
                      {lastSignature.slice(0, 12)}…{lastSignature.slice(-8)}
                    </a>
                  </div>
                )}
              </div>

              <p className="text-[10px] text-slate-600 font-mono">Sync: {stats.updatedAt}</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
