'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Users, MapPin, Leaf, TrendingUp, CheckCircle, Clock, ArrowRight } from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import { useSim } from '../../contexts/SimulationContext'

const COOPERATIVES = [
  {
    id: 'KOP-0017', name: 'KUD Makmur Jaya',       region: 'Klaten & Solo, Jawa Tengah',
    chair: 'Bp. Suyatno',    foundedYear: 1988, members: 142, activeFarms: 2,
    activeLoansUsdc: 4200,   disbursedUsdc: 18_500, repaymentRate: 97.2,
    commodities: ['Padi Ciherang', 'Padi IR-64'], status: 'Active',
    kycVerified: true,
  },
  {
    id: 'KOP-0029', name: 'Koperasi Subur Lombok',  region: 'Lombok Tengah, NTB',
    chair: 'Ibu Rahmawati',  foundedYear: 2005, members: 68,  activeFarms: 1,
    activeLoansUsdc: 1800,   disbursedUsdc: 6_200,  repaymentRate: 91.0,
    commodities: ['Jagung'], status: 'Active',
    kycVerified: true,
  },
  {
    id: 'KOP-0031', name: 'Koperasi Rempah Banda',  region: 'Maluku Tengah, Maluku',
    chair: 'Bp. Rizal Banda', foundedYear: 1995, members: 55,  activeFarms: 1,
    activeLoansUsdc: 3200,   disbursedUsdc: 14_000, repaymentRate: 98.1,
    commodities: ['Pala'], status: 'Active',
    kycVerified: true,
  },
  {
    id: 'KOP-0042', name: 'KKSP Lampung Barat',     region: 'Lampung Barat, Lampung',
    chair: 'Bp. Hendrayana',  foundedYear: 2001, members: 89,  activeFarms: 1,
    activeLoansUsdc: 4800,   disbursedUsdc: 21_300, repaymentRate: 95.5,
    commodities: ['Kopi Robusta'], status: 'Active',
    kycVerified: true,
  },
  {
    id: 'KOP-0055', name: 'Koperasi Hijau Jambi',   region: 'Jambi, Sumatera',
    chair: 'Ibu Srimulyani',  foundedYear: 2009, members: 210, activeFarms: 1,
    activeLoansUsdc: 6000,   disbursedUsdc: 32_000, repaymentRate: 93.8,
    commodities: ['Kelapa Sawit'], status: 'Active',
    kycVerified: false,
  },
]

const FV = (delay = 0): any => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0, transition: { delay, duration: 0.4, ease: 'easeOut' } },
})

export default function CooperativesPage() {
  const sim = useSim()
  const [selected, setSelected] = useState<string | null>(null)

  const totalMembers = COOPERATIVES.reduce((s, k) => s + k.members, 0)
  const totalLoans   = COOPERATIVES.reduce((s, k) => s + k.activeLoansUsdc, 0)
  const avgRepayment = (COOPERATIVES.reduce((s, k) => s + k.repaymentRate, 0) / COOPERATIVES.length).toFixed(1)

  const selectedCoop = COOPERATIVES.find(k => k.id === selected)
  const coopFarmers  = sim.farmers.filter(f => f.cooperative === selected)

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Cooperatives</span>
          </div>
          <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-teal-900/40 bg-teal-950/20 text-teal-400 hidden sm:block">
            KYC-Verified · Backbone
          </span>
        </div>

        <div className="flex-1 overflow-auto px-8 pt-8 pb-16">

          {/* Header */}
          <motion.div {...FV()} className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
            <div>
              <p className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500 mb-3">
                Cooperative registry · KYC-verified · Fund distribution backbone
              </p>
              <h1 className="font-display text-5xl text-white tracking-tight leading-none mb-3">
                Koperasi <em className="text-teal-400">network.</em>
              </h1>
              <p className="text-slate-400 text-[14px] max-w-xl leading-relaxed">
                Koperasi adalah backbone distribusi dana dan verifikasi identitas petani.
                Setiap polis asuransi dan pinjaman produktif disalurkan melalui jaringan koperasi yang terverifikasi.
              </p>
            </div>
            <div className="text-right font-mono text-[11px] text-slate-400 space-y-1 shrink-0">
              <div>Total anggota · <strong className="text-white">{totalMembers.toLocaleString()}</strong></div>
              <div>Active loans · <strong className="text-white">${totalLoans.toLocaleString()} USDC</strong></div>
              <div>Avg repayment · <strong className="text-emerald-400">{avgRepayment}%</strong></div>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div {...FV(0.06)} className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[
              { label: 'Total Koperasi',    value: String(COOPERATIVES.length),        sub: 'Aktif & terverifikasi'     },
              { label: 'Total Anggota',     value: totalMembers.toLocaleString(),       sub: '5 provinsi · 4 pulau'      },
              { label: 'Active Loans',      value: `$${totalLoans.toLocaleString()}`,   sub: 'USDC · via smart contract' },
              { label: 'Avg Repayment',     value: `${avgRepayment}%`,                 sub: 'Historis 12 bulan'         },
            ].map((s, i) => (
              <motion.div key={s.label} {...FV(0.06 + i * 0.05)}
                className="p-5 rounded-[6px] border border-white/[0.06] bg-[#050b14]">
                <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-slate-500 mb-2">{s.label}</p>
                <p className="font-display text-3xl text-white leading-none mb-1">{s.value}</p>
                <p className="font-mono text-[10px] text-slate-500">{s.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-6">

            {/* Cooperative list */}
            <div className="lg:col-span-2 space-y-3">
              {COOPERATIVES.map((k, i) => (
                <motion.div key={k.id} {...FV(0.08 + i * 0.05)}
                  onClick={() => setSelected(selected === k.id ? null : k.id)}
                  className={`p-5 rounded-[6px] border cursor-pointer transition-all ${
                    selected === k.id
                      ? 'border-teal-700/50 bg-teal-950/20'
                      : 'border-white/[0.06] bg-[#050b14] hover:border-white/[0.12] hover:bg-white/[0.02]'
                  }`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[10px] text-teal-400">{k.id}</span>
                        {k.kycVerified
                          ? <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-[2px] bg-emerald-900/40 text-emerald-400 border border-emerald-800/50 flex items-center gap-0.5"><CheckCircle size={7}/> KYC</span>
                          : <span className="font-mono text-[8px] px-1.5 py-0.5 rounded-[2px] bg-amber-900/40 text-amber-400 border border-amber-800/50 flex items-center gap-0.5"><Clock size={7}/> Pending KYC</span>
                        }
                      </div>
                      <p className="text-white font-semibold text-[14px] mb-1">{k.name}</p>
                      <p className="font-mono text-[10px] text-slate-500 flex items-center gap-1">
                        <MapPin size={9}/>{k.region}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-mono text-[10px] text-slate-400">{k.members} anggota</p>
                      <p className="font-mono text-[10px] text-white">${k.activeLoansUsdc.toLocaleString()} USDC</p>
                      <p className="font-mono text-[9px] text-emerald-400">{k.repaymentRate}% repayment</p>
                    </div>
                    <ArrowRight size={13} className={`shrink-0 transition-transform ${selected === k.id ? 'rotate-90 text-teal-400' : 'text-slate-600'}`}/>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {k.commodities.map(c => (
                      <span key={c} className="font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] bg-white/[0.04] border border-white/[0.06] text-slate-400">
                        <Leaf size={7} className="inline mr-0.5"/>{c}
                      </span>
                    ))}
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] bg-white/[0.04] border border-white/[0.06] text-slate-500">
                      {k.activeFarms} farm aktif
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] bg-white/[0.04] border border-white/[0.06] text-slate-500">
                      Est. {k.foundedYear}
                    </span>
                  </div>

                  {/* Repayment bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-0.5 rounded-full bg-white/[0.06] overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${k.repaymentRate}%` }}/>
                    </div>
                    <span className="font-mono text-[9px] text-slate-600">{k.repaymentRate}%</span>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Detail panel */}
            <div className="space-y-4">
              {selectedCoop ? (
                <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} key={selectedCoop.id}
                  className="p-6 rounded-[6px] border border-teal-900/40 bg-[#050b14]">
                  <p className="font-mono text-[9.5px] uppercase tracking-widest text-teal-600 mb-1">Detail Koperasi</p>
                  <h3 className="font-display text-2xl text-white mb-4">{selectedCoop.name}</h3>

                  <div className="space-y-3 mb-6">
                    {[
                      { label: 'ID',           value: selectedCoop.id },
                      { label: 'Ketua',        value: selectedCoop.chair },
                      { label: 'Berdiri',      value: String(selectedCoop.foundedYear) },
                      { label: 'Anggota',      value: `${selectedCoop.members} orang` },
                      { label: 'Active Loans', value: `$${selectedCoop.activeLoansUsdc.toLocaleString()} USDC` },
                      { label: 'Total Disbursed', value: `$${selectedCoop.disbursedUsdc.toLocaleString()} USDC` },
                      { label: 'Repayment',    value: `${selectedCoop.repaymentRate}%` },
                    ].map(row => (
                      <div key={row.label} className="flex items-center justify-between font-mono text-[10.5px]">
                        <span className="text-slate-600">{row.label}</span>
                        <span className="text-slate-200">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Farmers under this coop */}
                  <p className="font-mono text-[9.5px] uppercase tracking-widest text-slate-600 mb-2">Petani Terdaftar</p>
                  <div className="space-y-2">
                    {coopFarmers.length > 0 ? coopFarmers.map(f => (
                      <div key={f.id} className="p-3 rounded-[4px] bg-white/[0.03] border border-white/[0.05]">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-mono text-[10px] text-teal-400">{f.id}</p>
                            <p className="text-slate-200 text-[11px] font-medium">{f.name}</p>
                            <p className="font-mono text-[9px] text-slate-500">{f.crop} · {f.ha} Ha</p>
                          </div>
                          <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded-[2px] border ${
                            f.fundingStatus === 'funded'  ? 'text-emerald-400 border-emerald-900/40 bg-emerald-950/20' :
                            f.fundingStatus === 'partial' ? 'text-amber-400 border-amber-900/40 bg-amber-950/20' :
                                                            'text-slate-500 border-white/[0.06]'
                          }`}>{f.fundingStatus}</span>
                        </div>
                      </div>
                    )) : (
                      <p className="font-mono text-[10px] text-slate-600">Tidak ada petani terdaftar untuk koperasi ini.</p>
                    )}
                  </div>
                </motion.div>
              ) : (
                <div className="p-6 rounded-[6px] border border-white/[0.06] bg-[#050b14] text-center">
                  <Users size={24} className="text-slate-700 mx-auto mb-3"/>
                  <p className="font-mono text-[10.5px] text-slate-600">Pilih koperasi untuk melihat detail, daftar petani, dan status pinjaman.</p>
                </div>
              )}

              {/* Fund flow mini */}
              <div className="p-5 rounded-[6px] border border-white/[0.06] bg-[#050b14]">
                <p className="font-mono text-[9.5px] uppercase tracking-widest text-slate-600 mb-3">Fund Flow</p>
                {[
                  { step: 'Investor', sub: 'Yield Pool deposit', color: 'text-blue-400' },
                  { step: 'Koperasi', sub: 'KYC + distribusi', color: 'text-teal-400' },
                  { step: 'Petani',   sub: 'Pinjaman produktif', color: 'text-emerald-400' },
                ].map((s, i) => (
                  <div key={s.step} className="flex items-center gap-2 py-1.5">
                    <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? 'bg-blue-400' : i === 1 ? 'bg-teal-400' : 'bg-emerald-400'}`}/>
                    <div>
                      <p className={`font-mono text-[10px] ${s.color}`}>{s.step}</p>
                      <p className="font-mono text-[9px] text-slate-600">{s.sub}</p>
                    </div>
                    {i < 2 && <div className="ml-auto text-slate-700 font-mono text-[11px]">↓</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <motion.div {...FV(0.24)} className="mt-6 p-4 rounded-[6px] border border-white/[0.05] bg-[#050b14] flex items-center gap-3">
            <TrendingUp size={13} className="text-teal-500 shrink-0"/>
            <p className="font-mono text-[10.5px] text-slate-500">
              <strong className="text-slate-300">Simulation Mode</strong> — Data koperasi menggunakan dataset pilot. Verifikasi KYC dilakukan setelah onboarding lapangan selesai.
            </p>
          </motion.div>

        </div>
      </div>
    </div>
  )
}
