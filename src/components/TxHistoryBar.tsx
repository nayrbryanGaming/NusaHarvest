'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock, ExternalLink, RefreshCw, XCircle } from 'lucide-react'
import { getRecentTransactions } from '../utils/solana'

type TxRow = {
  id: number
  signature: string
  fullSignature: string
  slot: number
  time: string
  status: string
}

type Props = {
  walletAddress: string
  refreshTrigger?: number
  label?: string
  maxRows?: number
}

export default function TxHistoryBar({
  walletAddress,
  refreshTrigger = 0,
  label,
  maxRows = 7,
}: Props) {
  const [txs, setTxs] = useState<TxRow[]>([])
  const [loading, setLoading] = useState(false)
  const [lastFetched, setLastFetched] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!walletAddress) return
    setLoading(true)
    try {
      const result = await getRecentTransactions(walletAddress, maxRows)
      setTxs(result as TxRow[])
      setLastFetched(new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      // silent — getRecentTransactions already handles errors
    } finally {
      setLoading(false)
    }
  }, [walletAddress, maxRows])

  useEffect(() => {
    void load()
  }, [load, refreshTrigger])

  if (!walletAddress) return null

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#030810] overflow-hidden">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] bg-white/[0.01]">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
            }`}
          />
          {label ?? 'Riwayat Transaksi On-Chain'}
        </div>
        <div className="flex items-center gap-3">
          {lastFetched && (
            <span className="font-mono text-[9px] text-slate-700 flex items-center gap-1">
              <Clock size={8} /> {lastFetched}
            </span>
          )}
          <a
            href={`https://explorer.solana.com/address/${walletAddress}?cluster=devnet`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-emerald-500 hover:text-emerald-400 flex items-center gap-1 transition-colors"
          >
            Explorer <ExternalLink size={9} />
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="p-1 rounded text-slate-600 hover:text-slate-300 transition-colors"
            aria-label="Refresh riwayat transaksi"
          >
            <RefreshCw size={11} className={loading ? 'animate-spin text-amber-400' : ''} />
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {loading && txs.length === 0 ? (
        <div className="px-4 py-3 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-6 rounded bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : txs.length === 0 ? (
        <div className="px-4 py-5 text-center font-mono text-[11px] text-slate-600">
          Belum ada transaksi on-chain dari wallet ini.
        </div>
      ) : (
        <div>
          {txs.map((tx, i) => (
            <div
              key={tx.id}
              className={`flex items-center justify-between px-4 py-2 hover:bg-white/[0.02] transition-colors group ${
                i < txs.length - 1 ? 'border-b border-white/[0.03]' : ''
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {tx.status === 'Success' ? (
                  <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                ) : (
                  <XCircle size={12} className="text-red-400 shrink-0" />
                )}
                <a
                  href={`https://explorer.solana.com/tx/${tx.fullSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[11px] text-slate-400 hover:text-emerald-300 transition-colors truncate group-hover:text-slate-200"
                  title={tx.fullSignature}
                >
                  {tx.signature}
                </a>
              </div>
              <div className="flex items-center gap-2.5 shrink-0 ml-3">
                <span className="font-mono text-[9.5px] text-slate-600">{tx.time}</span>
                <span
                  className={`font-mono text-[8.5px] px-1.5 py-0.5 rounded border ${
                    tx.status === 'Success'
                      ? 'text-emerald-400 border-emerald-800/50 bg-emerald-950/25'
                      : 'text-red-400 border-red-800/50 bg-red-950/25'
                  }`}
                >
                  {tx.status === 'Success' ? '✓ OK' : '✕ FAIL'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
