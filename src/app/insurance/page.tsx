'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Shield, Zap, ExternalLink, AlertTriangle, CheckCircle, Clock, Plus, Activity } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import { useSim } from '../../contexts/SimulationContext'
import { PROGRAM_ID_STR, DEPLOY_TX_SIG } from '../../utils/constants'

const POLICIES = [
  { id: 'POL-2208', farm: 'Kebun Sumber Rejeki', crop: 'Kopi Robusta',  trigger: '< 40mm / 30 hari', coverage: 4800, premium: 142, expires: '30 SEP 2026', status: 'Active',    triggerProbPct: 12, daysToWindow: 18 },
  { id: 'POL-2191', farm: 'Sawah Makmur Jaya',   crop: 'Padi Ciherang', trigger: '< 40mm / 30 hari', coverage: 2500, premium: 75,  expires: '15 AUG 2026', status: 'Active',    triggerProbPct: 9,  daysToWindow: 42 },
  { id: 'POL-2177', farm: 'Kebun Hijau Abadi',   crop: 'Kelapa Sawit',  trigger: '< 60mm / 30 hari', coverage: 6000, premium: 200, expires: '10 DEC 2026', status: 'Active',    triggerProbPct: 7,  daysToWindow: 61 },
  { id: 'POL-2140', farm: 'Ladang Subur Raya',   crop: 'Jagung',        trigger: '< 35mm / 30 hari', coverage: 1800, premium: 54,  expires: '01 JUL 2026', status: 'Triggered', triggerProbPct: 94, daysToWindow: 0  },
  { id: 'POL-2119', farm: 'Kebun Pala Banda',    crop: 'Pala',          trigger: '> 250mm / 7 hari', coverage: 3200, premium: 96,  expires: '20 MAR 2026', status: 'Triggered', triggerProbPct: 98, daysToWindow: 0  },
]

const FV = (delay = 0): any => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.4, ease: 'easeOut' } },
})

function StatusBadge({ status }: { status: string }) {
  if (status === 'Active') return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded-[3px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />{status}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] px-2 py-0.5 rounded-[3px] bg-orange-900/40 text-orange-400 border border-orange-800/50">
      <Zap size={9} />{status}
    </span>
  )
}

function TriggerBar({ pct }: { pct: number }) {
  const barColor   = pct >= 80 ? 'bg-red-500' : pct >= 40 ? 'bg-orange-400' : 'bg-emerald-500'
  const textColor  = pct >= 80 ? 'text-red-400' : pct >= 40 ? 'text-orange-400' : 'text-emerald-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`font-mono text-[10px] tabular-nums ${textColor} w-8 text-right`}>{pct}%</span>
    </div>
  )
}

export default function InsurancePage() {
  const sim = useSim()
  const [tab, setTab] = useState<'active' | 'triggered'>('active')

  const filtered       = POLICIES.filter(p => tab === 'active' ? p.status === 'Active' : p.status === 'Triggered')
  const totalCoverage  = POLICIES.reduce((s, p) => s + p.coverage, 0)
  const totalPremium   = POLICIES.reduce((s, p) => s + p.premium,  0)
  const activeCount    = POLICIES.filter(p => p.status === 'Active').length
  const triggeredCount = POLICIES.filter(p => p.status === 'Triggered').length
  const weatherAlert   = sim.weatherMode !== 'normal'

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Insurance</span>
          </div>
          <div className="flex items-center gap-2">
            {weatherAlert && (
              <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-orange-900/40 bg-orange-950/30 text-orange-400 flex items-center gap-1">
                <AlertTriangle size={9}/> {sim.weatherMode === 'drought' ? 'DROUGHT' : 'FLOOD'} SIM
              </span>
            )}
            <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-emerald-900/40 bg-emerald-950/30 text-emerald-500">
              Parametric · Auto-settled
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 pt-8 pb-16">

          {/* Page header */}
          <motion.div {...FV()} className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
            <div>
              <p className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500 mb-3">
                Parametric coverage · Auto-settled onchain
              </p>
              <h1 className="font-display text-5xl text-white tracking-tight leading-none mb-3">
                Insurance <em className="text-emerald-400">book.</em>
              </h1>
              <p className="text-slate-400 text-[14px] max-w-xl leading-relaxed">
                Index-based parametric policies. When weather oracles confirm a threshold breach,
                claims execute without paperwork — payouts settle to wallets within one block.
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-400 space-y-1 shrink-0">
              <div>Coverage in force · <strong className="text-white">${totalCoverage.toLocaleString()}</strong></div>
              <div>Premium float · <strong className="text-white">${totalPremium.toLocaleString()}</strong></div>
              <div>Loss ratio YTD · <strong className="text-emerald-400">8.4%</strong></div>
            </div>
          </motion.div>

          {/* Stat tiles */}
          <motion.div {...FV(0.06)} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Coverage',          value: `$${(totalCoverage/1000).toFixed(1)}k`,       sub: `${POLICIES.length} policies in force` },
              { label: 'Premium Collected',        value: `$${totalPremium}`,                           sub: `Avg. $${Math.round(totalPremium/POLICIES.length)} / policy` },
              { label: 'Avg Trigger Probability',  value: '14.2%',                                      sub: 'Weighted by coverage' },
              { label: 'Onchain Settlement',       value: '< 0.4s',                                     sub: 'Avg block to payout' },
            ].map((s, i) => (
              <motion.div key={s.label} {...FV(0.06 + i * 0.05)}
                className="p-5 rounded-[6px] border border-white/[0.06] bg-[#050b14]">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500 mb-2">{s.label}</p>
                <p className="font-display text-3xl text-white leading-none mb-1">{s.value}</p>
                <p className="font-mono text-[10px] text-slate-500">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Weather sim alert banner */}
          {weatherAlert && (
            <motion.div {...FV(0.08)} className={`mb-6 p-4 rounded-[6px] border flex items-start gap-3 ${
              sim.weatherMode === 'drought' ? 'border-orange-900/40 bg-orange-950/20' : 'border-blue-900/40 bg-blue-950/20'
            }`}>
              <AlertTriangle size={14} className={sim.weatherMode === 'drought' ? 'text-orange-400' : 'text-blue-400'} />
              <div>
                <p className={`font-mono text-[11px] font-semibold mb-1 ${sim.weatherMode === 'drought' ? 'text-orange-300' : 'text-blue-300'}`}>
                  {sim.weatherMode === 'drought' ? 'DROUGHT' : 'FLOOD'} SIMULATION — Curah Hujan {sim.rainfallMm}mm
                </p>
                <p className="font-mono text-[10.5px] text-slate-400">
                  Oracle mendeteksi threshold breach. Polis {sim.activeTriggers.join(' & ')} dalam antrian verifikasi.
                  Klaim otomatis diproses jika kondisi berlanjut 30 hari.
                </p>
              </div>
            </motion.div>
          )}

          {/* Policy table */}
          <motion.div {...FV(0.12)} className="rounded-[6px] border border-white/[0.06] bg-[#050b14] overflow-hidden mb-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-4">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-400">Policies</p>
                <div className="flex rounded-[4px] overflow-hidden border border-white/[0.08]">
                  {(['active', 'triggered'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setTab(t)}
                      className={`px-3 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors ${
                        tab === t ? 'bg-white text-[#030810] font-bold' : 'text-slate-500 hover:text-white'
                      }`}>
                      {t === 'active' ? `Active · ${activeCount}` : `Triggered · ${triggeredCount}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 font-mono text-[10.5px] text-emerald-400 hover:text-emerald-300 border border-emerald-900/50 px-3 py-1 rounded-[4px] transition-colors">
                  On-chain proof <ExternalLink size={10} />
                </a>
                <button type="button" className="flex items-center gap-1.5 font-mono text-[10.5px] text-slate-300 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 px-3 py-1 rounded-[4px] transition-colors">
                  <Plus size={11} /> New Policy
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {['Policy', 'Farm', 'Crop', 'Trigger', 'Coverage', 'Premium', 'Trigger Prob', 'Window', 'Status', ''].map(h => (
                      <th key={h} className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p, i) => (
                    <motion.tr key={p.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: i * 0.04 } }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors">
                      <td className="px-4 py-3.5 font-mono text-[11px] text-emerald-400">{p.id}</td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400">{p.farm}</td>
                      <td className="px-4 py-3.5 text-slate-200">{p.crop}</td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-400">{p.trigger}</td>
                      <td className="px-4 py-3.5 font-mono text-[12px] text-white tabular-nums">${p.coverage.toLocaleString()}</td>
                      <td className="px-4 py-3.5 font-mono text-[12px] text-slate-300 tabular-nums">${p.premium}</td>
                      <td className="px-4 py-3.5 min-w-[110px]"><TriggerBar pct={p.triggerProbPct} /></td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">
                        {p.daysToWindow > 0
                          ? <span className="flex items-center gap-1"><Clock size={9}/>{p.daysToWindow}d</span>
                          : <span className="text-orange-400">Triggered</span>}
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3.5 text-slate-600 text-right">›</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Recent Claims Feed */}
          <motion.div {...FV(0.16)} className="rounded-[6px] border border-white/[0.06] bg-[#050b14] overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-white/[0.05] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity size={13} className="text-emerald-500" />
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-400">Recent Claims</p>
              </div>
              <span className="font-mono text-[9px] text-slate-600">{sim.recentClaims.length} total</span>
            </div>
            <div className="divide-y divide-white/[0.04]">
              {sim.recentClaims.slice(0, 5).map(c => (
                <div key={c.id} className="px-6 py-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[10px] text-emerald-400">{c.id}</span>
                      <span className="font-mono text-[10px] text-slate-500">{c.farmName}</span>
                      <span className="font-mono text-[9px] text-slate-600">{c.crop}</span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-600">{c.triggerReason}</p>
                    <p className="font-mono text-[9px] text-slate-700 mt-0.5">{new Date(c.timestamp).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="font-mono text-[13px] text-emerald-400 font-semibold">${c.amount.toLocaleString()}</p>
                    <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] border ${
                      c.status === 'paid'       ? 'text-emerald-400 border-emerald-900/50 bg-emerald-950/30' :
                      c.status === 'processing' ? 'text-amber-400 border-amber-900/50 bg-amber-950/30 animate-pulse' :
                                                  'text-slate-500 border-white/[0.06]'
                    }`}>{c.status.toUpperCase()}</span>
                  </div>
                </div>
              ))}
              {sim.recentClaims.length === 0 && (
                <div className="px-6 py-8 text-center">
                  <CheckCircle size={20} className="text-emerald-700 mx-auto mb-2"/>
                  <p className="font-mono text-[10.5px] text-slate-600">Tidak ada klaim aktif. Semua threshold dalam kondisi normal.</p>
                </div>
              )}
            </div>
          </motion.div>

          {/* Deployment proof */}
          <motion.div {...FV(0.20)} className="p-4 rounded-[6px] border border-emerald-900/40 bg-emerald-950/20 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-emerald-600 mb-1">✓ Smart Contract Deployed · Solana Devnet</p>
              <p className="font-mono text-[11px] text-emerald-400">Program ID: {PROGRAM_ID_STR}</p>
            </div>
            <div className="flex items-center gap-3">
              <a href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} target="_blank" rel="noreferrer"
                className="font-mono text-[10.5px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors">
                Verify Program <ExternalLink size={10} />
              </a>
              <a href={`https://explorer.solana.com/tx/${DEPLOY_TX_SIG}?cluster=devnet`} target="_blank" rel="noreferrer"
                className="font-mono text-[10.5px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
                Deploy Tx <ExternalLink size={10} />
              </a>
            </div>
          </motion.div>

        </div>
      </div>
    </div>
  )
}
