'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Map, Leaf, Droplets, AlertTriangle, CheckCircle, ExternalLink, Plus } from 'lucide-react'
import Sidebar from '../../components/Sidebar'

const FARMS = [
  { id: 'FRM-0214', name: 'Kebun Pala Banda',    cooperative: 'KOP-0031',  region: 'Maluku Tengah',     crop: 'Pala',          ha: 3.2,  risk: 'HIGH',   rain30d: 268, status: 'Triggered' },
  { id: 'FRM-0201', name: 'Kebun Sumber Rejeki', cooperative: 'KOP-0042',  region: 'Lampung Barat',     crop: 'Kopi Robusta',  ha: 4.2,  risk: 'LOW',    rain30d: 82,  status: 'Active'    },
  { id: 'FRM-0187', name: 'Sawah Makmur Jaya',   cooperative: 'KOP-0017',  region: 'Klaten, Jawa Tengah',crop: 'Padi Ciherang', ha: 1.8,  risk: 'MEDIUM', rain30d: 45,  status: 'Active'    },
  { id: 'FRM-0172', name: 'Kebun Hijau Abadi',   cooperative: 'KOP-0055',  region: 'Jambi',              crop: 'Kelapa Sawit',  ha: 8.5,  risk: 'LOW',    rain30d: 195, status: 'Active'    },
  { id: 'FRM-0163', name: 'Ladang Subur Raya',   cooperative: 'KOP-0029',  region: 'Lombok Tengah',     crop: 'Jagung',        ha: 2.1,  risk: 'CRITICAL',rain30d: 12,  status: 'Triggered' },
  { id: 'FRM-0151', name: 'Sawah Berkah',        cooperative: 'KOP-0017',  region: 'Solo, Jawa Tengah', crop: 'Padi IR-64',    ha: 1.2,  risk: 'LOW',    rain30d: 110, status: 'Active'    },
]

const RISK_COLOR: Record<string, string> = {
  LOW:      'text-emerald-400 bg-emerald-900/30 border-emerald-800/50',
  MEDIUM:   'text-amber-400   bg-amber-900/30   border-amber-800/50',
  HIGH:     'text-orange-400  bg-orange-900/30  border-orange-800/50',
  CRITICAL: 'text-red-400     bg-red-900/30     border-red-800/50',
}

const FV = (delay = 0): any => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.4, ease: 'easeOut' } },
})

export default function FarmsPage() {
  const [filter, setFilter] = useState<'all' | 'active' | 'triggered'>('all')

  const filtered = filter === 'all' ? FARMS : FARMS.filter(f =>
    filter === 'active' ? f.status === 'Active' : f.status === 'Triggered'
  )

  const totalHa     = FARMS.reduce((s, f) => s + f.ha, 0)
  const avgRain     = Math.round(FARMS.reduce((s, f) => s + f.rain30d, 0) / FARMS.length)
  const triggeredN  = FARMS.filter(f => f.status === 'Triggered').length

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Farms</span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-teal-900/40 bg-teal-950/20 text-teal-400 hidden sm:block">
            Farmer Registry · Devnet
          </span>
        </div>

        <div className="flex-1 overflow-auto px-8 pt-8 pb-16">

          {/* Page header */}
          <motion.div {...FV()} className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
            <div>
              <p className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500 mb-3">
                Farm registry · BMKG-indexed · Cooperative-verified
              </p>
              <h1 className="font-display text-5xl text-white tracking-tight leading-none mb-3">
                Farms <em className="text-teal-400">atlas.</em>
              </h1>
              <p className="text-slate-400 text-[14px] max-w-xl leading-relaxed">
                All registered farms with real-time rainfall monitoring, parametric risk scores, and on-chain policy linkage.
                Each farm is mapped to a cooperative for identity verification.
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-400 space-y-1 shrink-0">
              <div>Total lahan · <strong className="text-white">{totalHa.toFixed(1)} Ha</strong></div>
              <div>Avg curah hujan 30d · <strong className="text-white">{avgRain} mm</strong></div>
              <div>Trigger aktif · <strong className="text-orange-400">{triggeredN} farm</strong></div>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div {...FV(0.06)} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Farms',    value: String(FARMS.length),      sub: 'Terdaftar & terverifikasi', accent: 'teal'    },
              { label: 'Total Lahan',    value: `${totalHa.toFixed(1)} Ha`, sub: '5 koperasi · 4 provinsi', accent: 'emerald' },
              { label: 'Avg Rainfall 30d', value: `${avgRain} mm`,         sub: 'BMKG oracle real-time',     accent: 'blue'    },
              { label: 'Trigger Aktif',  value: String(triggeredN),         sub: 'Klaim sedang diproses',     accent: 'orange'  },
            ].map((s, i) => (
              <motion.div key={s.label} {...FV(0.06 + i * 0.05)}
                className="p-5 rounded-[6px] border border-white/[0.06] bg-[#050b14]">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500 mb-2">{s.label}</p>
                <p className="font-display text-3xl text-white leading-none mb-1">{s.value}</p>
                <p className="font-mono text-[10px] text-slate-500">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          {/* Farm table */}
          <motion.div {...FV(0.12)} className="rounded-[6px] border border-white/[0.06] bg-[#050b14] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-4">
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-400">Farm Registry</p>
                <div className="flex rounded-[4px] overflow-hidden border border-white/[0.08]">
                  {(['all', 'active', 'triggered'] as const).map(f => (
                    <button key={f} type="button" onClick={() => setFilter(f)}
                      className={`px-3 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors capitalize ${
                        filter === f ? 'bg-white text-[#030810] font-bold' : 'text-slate-500 hover:text-white'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" className="flex items-center gap-1.5 font-mono text-[10.5px] text-slate-300 bg-white/[0.06] border border-white/[0.08] hover:bg-white/10 px-3 py-1 rounded-[4px] transition-colors">
                <Plus size={11} /> Daftarkan Farm
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-white/[0.05]">
                    {['Farm ID', 'Nama', 'Koperasi', 'Region', 'Komoditas', 'Luas', 'Curah Hujan 30d', 'Risk', 'Status'].map(h => (
                      <th key={h} className="text-left font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500 px-4 py-3 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((f, i) => (
                    <motion.tr key={f.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1, transition: { delay: i * 0.04 } }}
                      className="border-b border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 font-mono text-[11px] text-teal-400">{f.id}</td>
                      <td className="px-4 py-3.5 text-slate-200 font-medium">{f.name}</td>
                      <td className="px-4 py-3.5 font-mono text-[11px] text-slate-500">{f.cooperative}</td>
                      <td className="px-4 py-3.5 text-slate-400 text-[12px]">{f.region}</td>
                      <td className="px-4 py-3.5 text-slate-300">{f.crop}</td>
                      <td className="px-4 py-3.5 font-mono text-[12px] text-white tabular-nums">{f.ha} Ha</td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <Droplets size={11} className={f.rain30d < 40 ? 'text-red-400' : 'text-blue-400'} />
                          <span className={`font-mono text-[12px] tabular-nums ${f.rain30d < 40 ? 'text-red-400' : 'text-blue-300'}`}>
                            {f.rain30d} mm
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`font-mono text-[10px] px-2 py-0.5 rounded-[3px] border ${RISK_COLOR[f.risk]}`}>
                          {f.risk}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        {f.status === 'Active'
                          ? <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1"><CheckCircle size={10} />Active</span>
                          : <span className="font-mono text-[10px] text-orange-400 flex items-center gap-1"><AlertTriangle size={10} />Triggered</span>
                        }
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Simulation note */}
          <motion.div {...FV(0.18)} className="mt-6 p-4 rounded-[6px] border border-white/[0.05] bg-[#050b14] flex items-center gap-3">
            <Leaf size={14} className="text-teal-500 shrink-0" />
            <p className="font-mono text-[10.5px] text-slate-500">
              <strong className="text-slate-300">Simulation Mode</strong> — Data farm menggunakan dataset historis BMKG. Farm real akan diverifikasi melalui koperasi setelah onboarding petani dilakukan.
            </p>
          </motion.div>

        </div>
      </div>
    </div>
  )
}
