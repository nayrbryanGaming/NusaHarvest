'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Leaf, Shield, TrendingUp, Zap, CloudRain, BarChart3, ChevronRight, Activity, Globe } from 'lucide-react'
import { useWallet } from '../providers/WalletProvider'
import Navbar from '../components/Navbar'
import { PROGRAM_ID_STR } from '../utils/constants'

const FADE_UP: any = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.6, ease: 'easeOut' }
}

const STAGGER: any = {
  initial: { opacity: 0 },
  whileInView: { opacity: 1 },
  viewport: { once: true },
  transition: { staggerChildren: 0.2 }
}

const STATS = [
  { label: 'Petani Pilot', value: '500+', icon: <Leaf size={18} className="text-emerald-400" /> },
  { label: 'Total Value Locked', value: '$200K', icon: <TrendingUp size={18} className="text-emerald-400" /> },
  { label: 'Estimasi Klaim', value: '< 6 Jam', icon: <Zap size={18} className="text-amber-400" /> },
  { label: 'Cakupan Region', value: 'Jawa Tengah', icon: <Globe size={18} className="text-indigo-400" /> }
]

const FEATURES = [
  { step: '01', icon: <CloudRain className="text-blue-400" size={32} />, title: 'Oracle Cuaca Real-time', desc: 'Terhubung dengan 500+ stasiun BMKG. Data curah hujan diverifikasi on-chain setiap 24 jam.', gradient: 'from-blue-600/20 to-blue-900/20' },
  { step: '02', icon: <Shield className="text-emerald-400" size={32} />, title: 'Smart Contract Engine', desc: 'Otomatis memeriksa threshold curah hujan < 40mm dalam 30 hari. Tanpa perlu klaim manual.', gradient: 'from-emerald-600/20 to-emerald-900/20' },
  { step: '03', icon: <Zap className="text-amber-400" size={32} />, title: 'Payout Instan USDC', desc: 'Dana asuransi langsung cair ke dompet koperasi dalam hitungan jam setelah trigger terpenuhi.', gradient: 'from-amber-600/20 to-amber-900/20' }
]

export default function HomePage() {
  const { publicKey, connected } = useWallet()

  return (
    <main className="min-h-screen relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-emerald-500/10 blur-[120px] -z-10 rounded-full" />
      <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-teal-500/10 blur-[100px] -z-10 rounded-full" />

      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-36 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div {...FADE_UP} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-300 text-xs font-medium tracking-wide mb-8 backdrop-blur shadow-[0_0_15px_rgba(20,184,166,0.15)]">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
          </span>
          PLATFORM AGROFI INDONESIA
        </motion.div>

        <motion.h1 
          {...FADE_UP} transition={{ delay: 0.1, duration: 0.7 }}
          className="text-6xl md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-slate-200 to-slate-500 mb-6 tracking-tight leading-[1.1]"
        >
          Perlindungan <br className="hidden md:block"/>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 text-glow">
            Anti-Krisis
          </span> 
          {' '}untuk Petani
        </motion.h1>

        <motion.p 
          {...FADE_UP} transition={{ delay: 0.2, duration: 0.7 }}
          className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed"
        >
          Infrastruktur <span className="text-slate-200 font-semibold">AgroFi</span> pertama di Indonesia. Asuransi parametrik otomatis yang cair dalam hitungan jam saat gagal panen akibat cuaca. Tanpa klaim manual. Disokong oleh DeFi yield pools.
        </motion.p>

        <motion.div 
          {...FADE_UP} transition={{ delay: 0.3, duration: 0.7 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-5 w-full sm:w-auto"
        >
          <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-lg transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] hover:-translate-y-1 flex items-center justify-center gap-2">
            Masuk Dashboard Petani <ChevronRight size={20} />
          </Link>
          <Link href="/pools" className="w-full sm:w-auto px-8 py-4 rounded-xl glass-panel text-emerald-300 font-bold text-lg hover:bg-white/5 transition-all flex items-center justify-center gap-2">
            Buka Peluang Investasi
          </Link>
        </motion.div>

        {/* Floating Wallet Status */}
        {connected && publicKey && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mt-8 px-5 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 flex items-center gap-2 text-sm font-mono backdrop-blur-md">
            <Activity size={16} className="animate-pulse" /> Wallet Aktif: {publicKey.slice(0, 6)}...{publicKey.slice(-4)}
          </motion.div>
        )}
      </section>

      {/* Stats Matrix Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <motion.div 
          variants={STAGGER}
          initial="initial"
          whileInView="whileInView"
          className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6"
        >
          {STATS.map((stat, i) => (
            <motion.div 
              key={stat.label}
              variants={FADE_UP}
              className="glass-panel p-6 rounded-2xl flex flex-col items-center justify-center text-center group hover:border-emerald-500/40 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50 group-hover:scale-110 transition-transform">
                {stat.icon}
              </div>
              <h3 className="text-2xl md:text-3xl font-black text-white mb-1 drop-shadow-md">{stat.value}</h3>
              <p className="text-xs md:text-sm text-slate-400 font-medium">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* How It Works Section */}
      <section className="relative py-24 bg-[#03070b]">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <motion.div {...FADE_UP} className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">Evolusi Asuransi Pertanian</h2>
            <p className="text-lg text-slate-400">Dari ladang hingga ke dompet tanpa campur tangan manusia. Algoritma kami memastikan keadilan absolut bagi petani.</p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            {FEATURES.map((feat, i) => (
              <motion.div 
                key={feat.title}
                initial={{ opacity: 0, y: 50 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.6, delay: i * 0.2 }}
                className="relative p-1 rounded-2xl bg-gradient-to-b from-slate-800 to-slate-900/50 hover:from-emerald-500/40 hover:to-teal-900/50 transition-all duration-500 group"
              >
                <div className="h-full bg-[#050b14] rounded-xl p-8 relative overflow-hidden">
                  <div className={`absolute -right-10 -top-10 w-40 h-40 bg-gradient-to-br ${feat.gradient} blur-[40px] rounded-full group-hover:scale-150 transition-transform duration-700`} />
                  
                  <div className="flex items-center gap-4 mb-6 relative z-10">
                    <span className="text-4xl font-black text-slate-800">{feat.step}</span>
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-700 shadow-md">
                      {feat.icon}
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3 relative z-10">{feat.title}</h3>
                  <p className="text-slate-400 leading-relaxed text-sm relative z-10">{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Advanced Capabilities */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <motion.div {...FADE_UP} className="space-y-8">
            <h2 className="text-4xl font-black text-white leading-tight">Teknologi Defi yang Berdampak ke Dunia Nyata</h2>
            <p className="text-slate-400 text-lg leading-relaxed">
              Nusa Harvest menghancurkan tembok batas antara keuangan terdesentralisasi (DeFi) dan kebutuhan finansial dunia nyata (RWA). Liquidity provider mendapatkan imbal hasil yang stabil dan tidak berkorelasi dengan pasar kripto, sementara petani mendapatkan safety net absolut terhadap krisis iklim.
            </p>
            <ul className="space-y-4">
              {[
                { title: 'Smart Contract Audit', desc: 'Arsitektur Solana Anchor v0.30 yang secure by design.' },
                { title: 'Machine Learning Risk Engine', desc: 'Pemodelan risiko presisi menggunakan ENSO index dan historis 20 tahun BMKG.' },
                { title: 'Komoditas Premium', desc: 'Coverage eksklusif untuk Padi, Kopi Robusta & Kelapa Sawit.' }
              ].map((item, i) => (
                <li key={i} className="flex gap-4">
                  <div className="mt-1 w-6 h-6 rounded bg-emerald-900/50 border border-emerald-500/50 flex items-center justify-center shrink-0">
                    <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-semibold">{item.title}</h4>
                    <p className="text-slate-400 text-sm">{item.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            {/* Holographic glowing card representation */}
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/20 to-purple-500/20 blur-[80px] -z-10 rounded-full" />
            <div className="glass-panel p-8 rounded-2xl border border-slate-700/50 bg-[#0a1628]/80">
              <div className="flex justify-between items-center mb-6 pb-6 border-b border-slate-800">
                <div>
                  <h3 className="text-slate-400 text-sm font-medium mb-1">Status Smart Contract</h3>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span className="text-white font-semibold">Aktif di Devnet</span>
                  </div>
                </div>
                <div className="text-right">
                  <h3 className="text-slate-400 text-sm font-medium mb-1">Total Transaksi</h3>
                  <span className="text-emerald-400 font-mono font-bold text-lg">1,248</span>
                </div>
              </div>
              
              <div className="space-y-4 font-mono text-xs text-slate-300">
                <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Program ID</span>
                  <a
                    href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                  >
                    {PROGRAM_ID_STR.slice(0, 10)}...{PROGRAM_ID_STR.slice(-6)}
                  </a>
                </div>
                <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800 shadow-inner">
                  <span className="text-slate-500">Data Source</span>
                  <span className="text-blue-300">oracle.bmkg.go.id</span>
                </div>
                <div className="flex justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Settlement Asset</span>
                  <span className="text-teal-300">USDC (SPL Token)</span>
                </div>
              </div>
              
              <div className="mt-8">
                <a
                  href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-semibold transition-colors border border-slate-600 inline-flex items-center justify-center"
                >
                  Lihat di Solana Explorer ↗
                </a>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#1e3a2f]/40 py-12 text-center text-slate-500 text-sm bg-[#02050a] relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Leaf size={16} className="text-emerald-600" />
            <span className="font-bold text-slate-300">Nusa Harvest AgroFi</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">v1.0 Devnet</span>
          </div>
          <p className="font-mono text-xs text-slate-500">
            © 2026. Built with precision for Indonesian farmers.
          </p>
        </div>
      </footer>
    </main>
  )
}

function CheckIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}
