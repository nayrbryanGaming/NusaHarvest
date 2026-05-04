'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion, useInView } from 'framer-motion'
import { Leaf, Shield, Zap, CloudRain, ChevronRight, Activity, Globe, ArrowUpRight, Lock, Cpu } from 'lucide-react'
import { useWallet } from '../providers/WalletProvider'
import { PROGRAM_ID_STR, DEPLOY_TX_SIG, DEPLOY_SLOT, DEPLOY_DATE } from '../utils/constants'
import { isProtocolProgramDeployed, fetchPoolStateMetrics } from '../utils/solana'

/* Animation Presets */
const FV = (delay = 0): any => ({
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-40px' },
  transition: { duration: 0.55, ease: 'easeOut', delay },
})

const FEATURES = [
  {
    step: '01',
    icon: Globe,
    iconColor: 'text-blue-400',
    iconBg: 'bg-blue-500/15 border-blue-500/25',
    glow: 'from-blue-600/15 via-blue-800/10 to-transparent',
    border: 'hover:border-blue-500/30',
    title: 'Global Investors Deposit',
    desc: 'Investor global menyetor USDC ke yield pool on-chain di Solana. Transparan, non-custodial, real-time.',
  },
  {
    step: '02',
    icon: Cpu,
    iconColor: 'text-emerald-400',
    iconBg: 'bg-emerald-500/15 border-emerald-500/25',
    glow: 'from-emerald-600/15 via-emerald-800/10 to-transparent',
    border: 'hover:border-emerald-500/30',
    title: 'Yield Pool Lending',
    desc: 'Smart contract mengalokasikan likuiditas pool ke petani terverifikasi sebagai pinjaman modal kerja.',
  },
  {
    step: '03',
    icon: Leaf,
    iconColor: 'text-amber-400',
    iconBg: 'bg-amber-500/15 border-amber-500/25',
    glow: 'from-amber-600/15 via-amber-800/10 to-transparent',
    border: 'hover:border-amber-500/30',
    title: 'Pencairan ke Petani',
    desc: 'Petani Indonesia menerima modal dalam menit langsung ke wallet. Bunga kompetitif, tanpa bank.',
  },
]

const CAPABILITIES = [
  { icon: Globe, title: 'Akses Modal Global', desc: 'Investor dari seluruh dunia dapat menyetor USDC ke pool dan mendapatkan yield dari sektor agrikultur Indonesia.' },
  { icon: Lock, title: 'Agunan On-Chain', desc: 'Data lahan petani terdaftar on-chain sebagai agunan terverifikasi, menggantikan jaminan fisik konvensional.' },
  { icon: Zap, title: 'Pencairan Instan', desc: 'Disbursement ke petani dalam hitungan menit melalui Solana. Tidak perlu proses bank berminggu-minggu.' },
]

const FUSION_MODULES = [
  { title: 'Farmer Dashboard', href: '/dashboard', desc: 'Monitoring pinjaman aktif, cicilan, dan status agunan lahan petani.', icon: Leaf },
  { title: 'Yield Pools', href: '/pools', desc: 'Deposit USDC, pantau APY, dan kelola portofolio lending global.', icon: Zap },
  { title: 'Market Data', href: '/market', desc: 'Feed harga SOL, USDC, dan komoditas agrikultur dari API live.', icon: Globe },
  { title: 'Registry', href: '/register', desc: 'Onboarding petani, verifikasi lahan, dan aktivasi agunan on-chain.', icon: Shield },
  { title: 'SOLQ QRIS', href: '/solq', desc: 'Parser EMVCo QRIS + payment intent non-custodial untuk disbursement.', icon: Activity },
  { title: 'Admin Center', href: '/admin', desc: 'Kontrol operasional pool, monitoring pinjaman, dan audit deployment.', icon: Lock },
]

/* Animated Counter */
function AnimatedNumber({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true })

  return (
    <span ref={ref} className={`metric-value transition-all duration-500 ${inView ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}>
      {value}
    </span>
  )
}

export default function HomePage() {
  const { publicKey, connected } = useWallet()
  const [programReady, setProgramReady] = useState<boolean | null>(null)
  const [poolMetrics, setPoolMetrics] = useState({ totalTvl: '$0 USDC', activePolicies: 0 })

  useEffect(() => {
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setProgramReady(false)
    }, 6000) // Force failure after 6 seconds if no response

    isProtocolProgramDeployed()
      .then((deployed) => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setProgramReady(deployed)
        }
      })
      .catch(() => {
        if (!cancelled) {
          clearTimeout(timeoutId)
          setProgramReady(false)
        }
      })

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  // Fetch real pool metrics from on-chain
  useEffect(() => {
    let cancelled = false
    
    fetchPoolStateMetrics()
      .then((metrics) => {
        if (!cancelled) {
          setPoolMetrics(metrics)
        }
      })
      .catch(() => {
        // Silently fail, use defaults
        if (!cancelled) {
          setPoolMetrics({ totalTvl: '$0 USDC (Devnet)', activePolicies: 0 })
        }
      })
    
    return () => {
      cancelled = true
    }
  }, [])

  const stats = [
    { label: 'Total Value Locked', value: poolMetrics.totalTvl, icon: Globe, accent: 'emerald' },
    { label: 'Active Loans', value: poolMetrics.activePolicies.toString(), icon: Activity, accent: 'teal' },
    { label: 'Target APY', value: '8–14%', icon: Zap, accent: 'amber' },
    { label: 'Farmer Region', value: 'Jawa Tengah — Pilot', icon: Leaf, accent: 'indigo' },
  ]

  const accentMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    teal: 'text-teal-400 bg-teal-500/10 border-teal-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    indigo: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  }

  return (
    <main className="min-h-screen pt-[52px] relative overflow-hidden">
      {/* Ambient Glows */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/8 blur-[140px] rounded-full animate-float-delayed" />
        <div className="absolute bottom-0 right-[-10%] w-[700px] h-[500px] bg-teal-500/6 blur-[120px] rounded-full animate-float" />
        <div className="absolute top-[50%] left-[-5%] w-[400px] h-[400px] bg-indigo-600/5 blur-[100px] rounded-full" />
      </div>

      {/* Hero */}
      <section className="relative pt-16 pb-16 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <div className="absolute inset-0 bg-grid-dark bg-[size:48px_48px] opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,#000_50%,transparent_100%)]" />

        <motion.div {...FV(0)} className="relative inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/8 text-teal-300 text-[11px] font-bold tracking-widest uppercase mb-8 backdrop-blur-sm shadow-teal-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inset-0 rounded-full bg-teal-400 opacity-70" />
            <span className="relative rounded-full h-2 w-2 bg-teal-500" />
          </span>
          AgroFi Lending — Solana Devnet
        </motion.div>

        <motion.h1 {...FV(0.08)} className="font-display text-5xl md:text-7xl lg:text-8xl text-white mb-5 tracking-tight leading-[1.06]">
          Modal global masuk
          <br className="hidden md:block" />
          <em className="text-emerald-400"> ke petani Indonesia.</em>
          <br className="hidden md:block" />
          On-chain. Transparan.
        </motion.h1>

        <motion.p {...FV(0.16)} className="text-base md:text-lg text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Platform <span className="text-slate-200 font-semibold">lending DeFi</span> pertama Indonesia — investor global setor USDC, smart contract menyalurkan modal ke 73 juta petani tanpa perantara bank.
        </motion.p>

        <motion.div {...FV(0.24)} className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto mb-8">
          <Link href="/pools" className="btn-primary w-full sm:w-auto px-8 py-4 text-white font-bold text-[15px] flex items-center justify-center gap-2">
            Mulai Lending Sekarang <ChevronRight size={18} />
          </Link>
          <Link href="/dashboard" className="btn-ghost w-full sm:w-auto px-8 py-4 text-emerald-300 font-bold text-[15px] flex items-center justify-center gap-2">
            Dashboard Petani <ArrowUpRight size={16} />
          </Link>
        </motion.div>

        {connected && publicKey && (
          <motion.div initial={{ opacity: 0, scale: 0.88, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} className="data-badge data-badge-live px-5 py-2 text-xs font-mono">
            <Activity size={14} /> Wallet Aktif: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
          </motion.div>
        )}
      </section>

      {/* Stats Matrix */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
          {stats.map((stat, index) => {
            const Icon = stat.icon
            return (
              <motion.div key={stat.label} {...FV(index * 0.1)} className="glass-panel hover-lift p-5 md:p-7 rounded-2xl flex flex-col items-center text-center">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center mb-4 border ${accentMap[stat.accent]}`}>
                  <Icon size={20} className={accentMap[stat.accent].split(' ')[0]} />
                </div>
                <h3 className={`text-2xl md:text-3xl font-black mb-1 ${accentMap[stat.accent].split(' ')[0]}`}>
                  <AnimatedNumber value={stat.value} />
                </h3>
                <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider">{stat.label}</p>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Fusion Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-20">
        <motion.div {...FV()} className="text-center max-w-3xl mx-auto mb-10">
          <p className="data-badge data-badge-inactive mx-auto w-fit mb-4">Design Fusion</p>
          <h2 className="text-3xl md:text-4xl font-black text-white mb-4 tracking-tight">Ekosistem Lending Agrikultur</h2>
          <p className="text-slate-400">Semua modul — dari deposit investor hingga disbursement petani — terintegrasi dalam satu platform on-chain yang transparan.</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FUSION_MODULES.map((module, index) => {
            const Icon = module.icon
            return (
              <motion.div key={module.href} {...FV(index * 0.08)} className="glass-panel rounded-2xl p-6 hover-lift">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                  <Icon size={20} />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">{module.title}</h3>
                <p className="text-slate-400 text-sm mb-5 leading-relaxed">{module.desc}</p>
                <Link href={module.href} className="inline-flex items-center gap-2 text-sm font-bold text-emerald-300 hover:text-emerald-200">
                  Buka Modul <ArrowUpRight size={14} />
                </Link>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* How It Works */}
      <section className="relative py-24 bg-[#02050a]">
        <div className="absolute inset-0 bg-grid-dark bg-[size:48px_48px] opacity-40 bg-grid-fade" />
        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div {...FV()} className="text-center max-w-3xl mx-auto mb-16">
            <p className="data-badge data-badge-inactive mx-auto w-fit mb-4">Cara Kerja</p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-5 tracking-tight">Cara Kerja Lending On-Chain</h2>
            <p className="text-slate-400 leading-relaxed">Dari dompet investor global ke tangan petani Indonesia — tanpa bank, tanpa perantara, dieksekusi smart contract.</p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, index) => {
              const Icon = feature.icon
              return (
                <motion.div key={feature.title} {...FV(index * 0.12)} className={`group relative rounded-2xl border border-slate-800 ${feature.border} transition-colors duration-400 overflow-hidden hover-lift`}>
                  <div className={`absolute -right-12 -top-12 w-48 h-48 bg-gradient-to-br ${feature.glow} blur-[50px] rounded-full group-hover:scale-150 transition-transform duration-700`} />
                  <div className="relative z-10 p-7 bg-gradient-card h-full">
                    <div className="flex items-center gap-4 mb-6">
                      <span className="text-5xl font-black text-slate-800 leading-none select-none">{feature.step}</span>
                      <div className={`p-3 rounded-xl border ${feature.iconBg}`}>
                        <Icon className={feature.iconColor} size={26} />
                      </div>
                    </div>
                    <h3 className="text-lg font-bold text-white mb-3">{feature.title}</h3>
                    <p className="text-slate-400 text-sm leading-relaxed">{feature.desc}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Capabilities + Contract Card */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-14 items-center">
          <motion.div {...FV()} className="space-y-8">
            <div>
              <p className="data-badge data-badge-inactive w-fit mb-4">Teknologi</p>
              <h2 className="text-4xl font-black text-white leading-tight mb-4">Modal Global, Dampak Lokal</h2>
              <p className="text-slate-400 leading-relaxed">Yield pool on-chain menjembatani likuiditas global ke sektor agrikultur Indonesia — transparan, dapat diaudit, real yield.</p>
            </div>
            <ul className="space-y-4">
              {CAPABILITIES.map((capability, index) => {
                const Icon = capability.icon
                return (
                  <motion.li key={index} {...FV(index * 0.1)} className="flex gap-4 group">
                    <div className="mt-0.5 w-8 h-8 rounded-xl bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20 transition-colors">
                      <Icon className="text-emerald-400" size={15} />
                    </div>
                    <div>
                      <h4 className="text-white font-semibold text-sm">{capability.title}</h4>
                      <p className="text-slate-400 text-sm mt-0.5">{capability.desc}</p>
                    </div>
                  </motion.li>
                )
              })}
            </ul>
          </motion.div>

          <motion.div {...FV(0.1)} className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/15 to-purple-500/15 blur-[80px] -z-10 rounded-full" />
            <div className="glass-panel rounded-3xl border border-slate-700/40 p-7 space-y-5">
              <div className="flex justify-between items-center pb-5 border-b border-slate-800/60">
                <div>
                  <p className="text-slate-400 text-xs font-medium mb-1">Status Pool Contract</p>
                  <div className="flex items-center gap-2">
                    <div className={`status-dot-live ${programReady === null ? 'bg-slate-500' : programReady ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-white font-bold text-sm">
                      {programReady === null ? 'Memeriksa status...' : programReady ? 'Live di Devnet' : 'Deploy In-Progress'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-slate-400 text-xs font-medium mb-1">Verifikasi</p>
                  <span className={`font-mono font-black text-base ${programReady === true ? 'text-emerald-400' : programReady === false ? 'text-amber-400' : 'text-slate-400'}`}>
                    {programReady === null ? 'CHECKING' : programReady ? 'EXECUTABLE' : 'NOT FOUND'}
                  </span>
                </div>
              </div>

              {[
                { label: 'Program ID', value: `${PROGRAM_ID_STR.slice(0, 10)}...${PROGRAM_ID_STR.slice(-6)}`, href: `https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`, color: 'text-emerald-300' },
                { label: 'Deploy Tx', value: `${DEPLOY_TX_SIG.slice(0, 10)}...${DEPLOY_TX_SIG.slice(-6)}`, href: `https://explorer.solana.com/tx/${DEPLOY_TX_SIG}?cluster=devnet`, color: 'text-purple-300' },
                { label: 'Deploy Slot', value: `#${DEPLOY_SLOT.toLocaleString()} - ${DEPLOY_DATE}`, color: 'text-slate-400' },
                { label: 'Lending Asset', value: 'USDC (SPL Token)', color: 'text-teal-300' },
                { label: 'Framework', value: 'Anchor v0.30 / Rust', color: 'text-slate-300' },
              ].map((row) => (
                <div key={row.label} className="mono-block flex justify-between items-center">
                  <span className="text-slate-500">{row.label}</span>
                  {row.href ? (
                    <a href={row.href} target="_blank" rel="noreferrer" className={`${row.color} hover:brightness-125 underline underline-offset-2 transition-all`}>
                      {row.value}
                    </a>
                  ) : (
                    <span className={row.color}>{row.value}</span>
                  )}
                </div>
              ))}

              <a href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`} target="_blank" rel="noreferrer" className="btn-ghost w-full py-3 flex items-center justify-center gap-2 text-sm font-bold text-slate-300 rounded-xl">
                Lihat di Solana Explorer <ArrowUpRight size={15} />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-10 bg-[#02050a]">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <Leaf size={14} className="text-emerald-500" />
            </div>
            <span className="font-bold text-slate-300 text-sm">Nusa Harvest AgroFi</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-500 font-mono">v1.0 Devnet</span>
          </div>
          <p className="text-[11px] font-mono text-slate-600">(c) 2026 - Built with precision for Indonesia's 73 million farmers.</p>
          <div className="flex items-center gap-4 text-[11px] text-slate-600 font-medium">
            <Link href="/dashboard" className="hover:text-slate-400 transition-colors">Dashboard</Link>
            <Link href="/pools" className="hover:text-slate-400 transition-colors">Pools</Link>
            <Link href="/market" className="hover:text-slate-400 transition-colors">Market</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
