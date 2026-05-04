'use client'

import { motion } from 'framer-motion'
import { CheckCircle2, ExternalLink, Copy, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { ORACLE_PUBKEY_STR, PROGRAM_ID_STR } from '../utils/constants'
import { isProtocolProgramDeployed } from '../utils/solana'

interface DeploymentStatusProps {
  compact?: boolean
}

export default function DeploymentStatus({ compact = false }: DeploymentStatusProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const [programReady, setProgramReady] = useState<boolean | null>(null)

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

  const deploymentInfo = {
    status: programReady === null ? 'SYNCING' : programReady ? 'VERIFIED' : 'UNDEPLOYED',
    network: 'Solana Devnet',
    programId: PROGRAM_ID_STR,
    oraclePubkey: ORACLE_PUBKEY_STR,
    explorerUrl: `https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopied(label)
    toast.success('Disalin ke clipboard')
    setTimeout(() => setCopied(null), 2000)
  }

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${programReady === true ? 'bg-emerald-500/10 border-emerald-500/20' : programReady === false ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-500/10 border-slate-500/20'}`}
      >
        <div className={`w-2 h-2 rounded-full ${programReady === true ? 'bg-emerald-400 animate-pulse' : programReady === false ? 'bg-amber-400' : 'bg-slate-400'}`} />
        <span className={`text-[10px] font-bold uppercase tracking-widest ${programReady === true ? 'text-emerald-400' : programReady === false ? 'text-amber-400' : 'text-slate-400'}`}>
          {programReady === null ? 'Syncing Chain' : programReady ? 'On-Chain Verified' : 'Program Deploy In-Progress'}
        </span>
        <a href={deploymentInfo.explorerUrl} target="_blank" rel="noopener noreferrer" title="Open program in Solana Explorer" aria-label="Open program in Solana Explorer" className="ml-auto hover:scale-110 transition-transform">
          <ExternalLink size={12} className={programReady === true ? 'text-emerald-400' : programReady === false ? 'text-amber-400' : 'text-slate-400'} />
        </a>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-br from-emerald-500/5 to-emerald-900/5 border border-emerald-500/20 rounded-3xl p-8">
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="text-emerald-400" size={28} />
          <div>
            <h3 className="text-xl font-black text-white uppercase tracking-wide">
              {programReady === null ? 'Verifikasi On-Chain Data' : programReady ? 'Identitas Program Terverifikasi' : 'Protokol Sedang Sinkronisasi'}
            </h3>
            <p className="text-sm text-slate-400 font-medium mt-1">
              {programReady === true ? 'Executable binary terdeteksi di Solana Devnet.' : programReady === false ? 'Account executable sedang diproses untuk Program ID ini.' : 'Handshake RPC sedang berlangsung.'}
            </p>
          </div>
        </div>
        <a href={deploymentInfo.explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-xl text-emerald-400 text-sm font-bold transition-all">
          Buka Di Explorer <ExternalLink size={14} />
        </a>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {[
          { label: 'Program ID', value: deploymentInfo.programId },
          { label: 'Oracle Pubkey', value: deploymentInfo.oraclePubkey },
          { label: 'Network', value: deploymentInfo.network }
        ].map((item, i) => (
          <motion.div key={item.label} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 group hover:bg-white/[0.04] transition-all">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">{item.label}</div>
            <div className="flex items-center justify-between gap-3">
              <code className="text-xs font-mono text-slate-300 break-all">{item.value}</code>
              <button onClick={() => copyToClipboard(item.value, item.label)} className="p-2 hover:bg-white/10 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                {copied === item.label ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-slate-400" />}
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-slate-400 font-medium">
        <span>
          {programReady === true
            ? `✓ Node Lokal: Terhubung via RPC Devnet`
            : 'Menunggu koneksi on-chain...'}
        </span>
        <span>Status: <span className={programReady === true ? 'text-emerald-400 font-bold' : programReady === false ? 'text-amber-400 font-bold' : 'text-slate-400 font-bold'}>{deploymentInfo.status}</span></span>
      </div>
    </motion.div>
  )
}
