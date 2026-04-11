'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Leaf, Shield, TrendingUp, Zap, CloudRain, ChevronRight, Activity, Globe, ExternalLink, CheckCircle2, Database } from 'lucide-react'
import { useWallet } from '../providers/WalletProvider'
import Navbar from '../components/Navbar'
import { useState, useEffect } from 'react'
import { getApiUrl } from '../utils/api'

const FADE_UP: any = {
  initial: { opacity: 0, y: 30 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.6, ease: 'easeOut' }
}

const FEATURES = [
  {
    step: '01',
    icon: <TrendingUp className="text-blue-400" size={32} />,
    title: 'Commodity Yield Pools',
    desc: 'Real-time liquidity routing for agriculture financing backed by pool analytics.',
    details: ['Pool TVL', 'APY: 12-15%', 'On-chain Reserve'],
    gradient: 'from-blue-600/20 to-blue-900/20'
  },
  {
    step: '02',
    icon: <CloudRain className="text-emerald-400" size={32} />,
    title: 'Parametric Smart Policy',
    desc: 'Weather-indexed insurance powered by BMKG/Open-Meteo inputs with automatic settlement.',
    details: ['Index-based triggers', 'Instant settlement', 'Oracle verifiable'],

    gradient: 'from-emerald-600/20 to-emerald-900/20'
  },
  {
    step: '03',
    icon: <Shield className="text-amber-400" size={32} />,
    title: 'On-chain Smart Contracts',
    desc: 'Seluruh dana dan kontrak di-lock di blockchain Solana dengan transparansi 100% dan audit trail yang immutable.',
    details: ['100% on-chain', 'Solana Devnet', 'Zero downtime'],
    gradient: 'from-amber-600/20 to-amber-900/20'
  }
]

const STEPS = [
  { title: 'GPS Registration', desc: 'Farmers geolocate their plots and bind them to a unique on-chain Policy Account.', icon: <CheckCircle2 size={24} /> },
  { title: 'Risk Underwriting', desc: 'Real-time calculation of climate risk scores based on 10-year historical weather data.', icon: <CheckCircle2 size={24} /> },
  { title: 'Liquidity Binding', desc: 'Policy is collateralized by the Commodity Pool via a secure Solana Escrow.', icon: <CheckCircle2 size={24} /> },
  { title: 'Oracle Settlement', desc: 'Automatic USDC disbursement to the farmer wallet upon weather threshold breach.', icon: <CheckCircle2 size={24} /> }
]

type LivePoolCard = {
  id: string
  name: string
  symbol: string
  apy: number | null
  isPaused: boolean
}

type MarketTicker = {
  crop: string
  price: string
  trend: string
  status: 'live' | 'bullish' | 'bearish' | 'stable' | 'stale'
  source: string
}

export default function HomePage() {
  useWallet()
  const [livePools, setLivePools] = useState<LivePoolCard[]>([])
  const [activePolicies, setActivePolicies] = useState<string>('—')
  const [poolsLastUpdated, setPoolsLastUpdated] = useState<string>('—')
  
  // Live stats from APIs
  const [solPrice, setSolPrice] = useState<string>('—')
  const [solChange, setSolChange] = useState<string>('—')
  const [solChangeUp, setSolChangeUp] = useState<boolean>(true)
  const [devnetSlot, setDevnetSlot] = useState<string>('Loading...')
  const [marketData, setMarketData] = useState<MarketTicker[]>([
    { crop: 'Solana (SOL)', price: '—', trend: '—', status: 'stale', source: 'CoinGecko' },
    { crop: 'USD Coin (USDC)', price: '—', trend: '—', status: 'stale', source: 'CoinGecko' },
    { crop: 'Kopi Robusta Lampung', price: 'Feed unavailable', trend: 'N/A', status: 'stale', source: 'Backend Oracle' },
    { crop: 'Padi Ciherang (Klaten)', price: 'Feed unavailable', trend: 'N/A', status: 'stale', source: 'Backend Oracle' }
  ])

  useEffect(() => {
    const fetchLiveData = async () => {
      const commoditiesApiUrl = getApiUrl('/api/market/commodities')
      const poolsApiUrl = getApiUrl('/api/pool')
      const metricsApiUrl = getApiUrl('/api/pool/metrics')

      const fetchJson = async (url: string | null) => {
        if (!url) return null
        const response = await fetch(url)
        if (!response.ok) return null
        return response.json()
      }

      try {
        const [coingecko, commoditiesPayload, poolsPayload, metricsPayload] = await Promise.all([
          fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr&include_24hr_change=true')
            .then((response) => (response.ok ? response.json() : null))
            .catch(() => null),
          fetchJson(commoditiesApiUrl),
          fetchJson(poolsApiUrl),
          fetchJson(metricsApiUrl)
        ])

        if (typeof coingecko?.solana?.idr === 'number' && typeof coingecko?.solana?.idr_24h_change === 'number') {
          const price = `Rp ${coingecko.solana.idr.toLocaleString('id-ID')}`
          const change = `${coingecko.solana.idr_24h_change >= 0 ? '+' : ''}${coingecko.solana.idr_24h_change.toFixed(2)}%`
          setSolPrice(price)
          setSolChange(change)
          setSolChangeUp(coingecko.solana.idr_24h_change >= 0)
        }

        const commodityQuotes = Array.isArray(commoditiesPayload?.data) ? commoditiesPayload.data : []
        const coffeeQuote = commodityQuotes.find((quote: any) => {
          const label = `${quote?.commodity || ''} ${quote?.name || ''} ${quote?.symbol || ''}`.toLowerCase()
          return label.includes('coffee') || label.includes('kopi') || label.includes('robusta')
        })
        const riceQuote = commodityQuotes.find((quote: any) => {
          const label = `${quote?.commodity || ''} ${quote?.name || ''} ${quote?.symbol || ''}`.toLowerCase()
          return label.includes('rice') || label.includes('padi')
        })

        const formatCommodityPrice = (value: unknown) => {
          if (typeof value !== 'number' || Number.isNaN(value)) return 'Feed unavailable'
          return `Rp ${Math.round(value).toLocaleString('id-ID')}/kg`
        }

        const formatCommodityTrend = (value: unknown) => {
          if (typeof value !== 'number' || Number.isNaN(value)) return 'N/A'
          return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
        }

        setMarketData([
          {
            crop: 'Solana (SOL)',
            price:
              typeof coingecko?.solana?.idr === 'number' ? `Rp ${coingecko.solana.idr.toLocaleString('id-ID')}` : 'Feed unavailable',
            trend:
              typeof coingecko?.solana?.idr_24h_change === 'number'
                ? `${coingecko.solana.idr_24h_change >= 0 ? '+' : ''}${coingecko.solana.idr_24h_change.toFixed(2)}%`
                : 'N/A',
            status:
              typeof coingecko?.solana?.idr_24h_change === 'number'
                ? coingecko.solana.idr_24h_change >= 0
                  ? 'bullish'
                  : 'bearish'
                : 'stale',
            source: 'CoinGecko'
          },
          {
            crop: 'USD Coin (USDC)',
            price:
              typeof coingecko?.['usd-coin']?.idr === 'number'
                ? `Rp ${coingecko['usd-coin'].idr.toLocaleString('id-ID')}`
                : 'Feed unavailable',
            trend:
              typeof coingecko?.['usd-coin']?.idr_24h_change === 'number'
                ? `${coingecko['usd-coin'].idr_24h_change >= 0 ? '+' : ''}${coingecko['usd-coin'].idr_24h_change.toFixed(2)}%`
                : 'N/A',
            status: 'stable',
            source: 'CoinGecko'
          },
          {
            crop: 'Kopi Robusta Lampung',
            price: formatCommodityPrice(coffeeQuote?.priceIdr),
            trend: formatCommodityTrend(coffeeQuote?.change24h),
            status: coffeeQuote ? 'live' : 'stale',
            source: coffeeQuote?.source || 'Backend Oracle'
          },
          {
            crop: 'Padi Ciherang (Klaten)',
            price: formatCommodityPrice(riceQuote?.priceIdr),
            trend: formatCommodityTrend(riceQuote?.change24h),
            status: riceQuote ? 'live' : 'stale',
            source: riceQuote?.source || 'Backend Oracle'
          }
        ])

        const poolRows = Array.isArray(poolsPayload?.data) ? poolsPayload.data : []
        setLivePools(
          poolRows.slice(0, 4).map((pool: any) => ({
            id: String(pool.id || `${pool.symbol}-${pool.name}`),
            name: String(pool.name || 'Unnamed Pool'),
            symbol: String(pool.symbol || 'UNKNOWN'),
            apy: typeof pool.apy === 'number' ? pool.apy : null,
            isPaused: Boolean(pool.isPaused)
          }))
        )
        setPoolsLastUpdated(new Date().toLocaleTimeString('id-ID'))

        if (typeof metricsPayload?.data?.insurance?.activePolicies === 'number') {
          setActivePolicies(metricsPayload.data.insurance.activePolicies.toLocaleString('id-ID'))
        } else {
          setActivePolicies('—')
        }
      } catch (e) {
        console.error('Live data fetch error:', e)
      }
    }
    
    fetchLiveData()
    const interval = setInterval(fetchLiveData, 15000)
    return () => clearInterval(interval)
  }, [])

  // Fetch Solana devnet slot
  useEffect(() => {
    const fetchSlot = async () => {
      try {
        const res = await fetch('https://api.devnet.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] })
        })
        const data = await res.json()
        if (data.result) setDevnetSlot(data.result.toLocaleString())
      } catch (e) {
        console.error('Slot fetch error:', e)
      }
    }
    fetchSlot()
    const interval = setInterval(fetchSlot, 10000)
    return () => clearInterval(interval)
  }, [])

  const STATS = [
    { label: 'SOL Price (IDR)', value: solPrice, icon: <TrendingUp size={20} className={solChangeUp ? 'text-emerald-400' : 'text-red-400'} />, sub: solChange },
    { label: 'Network', value: 'Solana Devnet', icon: <Globe size={20} className="text-indigo-400" />, sub: 'OPERATIONAL' },
    { label: 'Devnet Slot', value: devnetSlot, icon: <Activity size={20} className="text-emerald-400" />, sub: 'REAL-TIME SYNC' },
    { label: 'Active Policies', value: activePolicies, icon: <Zap size={20} className="text-amber-400" />, sub: 'BACKEND VERIFIED' }
  ]

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#02060c]">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-emerald-500/5 blur-[150px] -z-10 rounded-full" />
      <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-indigo-500/5 blur-[120px] -z-10 rounded-full" />
      
      <Navbar />

      {/* Hero Section */}
      <section className="relative pt-40 pb-20 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05 }}
          className="mb-8 px-4 py-2 rounded-full border border-emerald-500/20 bg-emerald-500/5 text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-3">
          <div className="flex items-center gap-1.5 border-r border-emerald-500/20 pr-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_#10b981]" />
            NETWORK
          </div>
          <div className="flex items-center gap-1.5">
            SOLANA SLOT: <span className="font-mono text-white">#{devnetSlot}</span>
          </div>
        </motion.div>
        
        <motion.h1 initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} 
          className="text-6xl md:text-9xl font-black text-white mb-8 tracking-tighter leading-[0.85]">
          Nusa Harvest <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-400 to-indigo-500">AgroFi Protocol</span>
        </motion.h1>
        
        <motion.p initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.3 }} 
          className="text-xl md:text-2xl text-slate-400 max-w-3xl mb-12 leading-relaxed font-medium">
          Verified infrastructure for agricultural insurance and financial security.
        </motion.p>
        
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="flex flex-col sm:flex-row gap-6 items-center">
          <Link href="/dashboard" className="group relative px-10 py-5 rounded-2xl bg-emerald-500 text-emerald-950 font-black text-xl hover:bg-emerald-400 transition-all shadow-[0_0_50px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-95">
            <span className="relative z-10 flex items-center gap-3">
               Mulai Berinvestasi <ChevronRight size={20} />
            </span>
          </Link>
          <a href="#market" className="px-10 py-5 rounded-2xl bg-white/5 border border-white/10 text-white font-bold text-xl hover:bg-white/10 transition-all">
             Lihat Market Live
          </a>
        </motion.div>
      </section>

      {/* Live Stats Grid */}
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {STATS.map((stat, i) => (
            <motion.div key={i} {...FADE_UP} transition={{ ...FADE_UP.transition, delay: i * 0.1 }} 
              className="p-8 rounded-3xl border border-white/5 hover:border-emerald-500/30 transition-all flex flex-col items-center text-center bg-white/[0.02] relative group">
              <div className="mb-4 p-4 rounded-2xl bg-white/5 group-hover:bg-emerald-500/10 transition-colors">{stat.icon}</div>
              <div className="text-2xl font-black text-white mb-1 tracking-tighter">{stat.value}</div>
              {stat.sub && <div className="text-[10px] font-bold text-emerald-400 mb-1">{stat.sub}</div>}
              <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Live Market Data */}
      <section id="market" className="px-6 py-24 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
          <div className="text-left">
            <h2 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tighter">Market Watch</h2>
            <p className="text-slate-400 text-lg">Harga komoditas & crypto live — CoinGecko + backend oracle.</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Live Data</span>
          </div>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          {marketData.map((item, i) => (
            <motion.div key={i} {...FADE_UP} className="p-6 rounded-3xl bg-white/[0.03] border border-white/5">
              <div className="flex justify-between items-start mb-4">
                <h4 className="font-bold text-white text-sm">{item.crop}</h4>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${item.trend.startsWith('+') ? 'text-emerald-400 bg-emerald-500/10' : item.trend === '—' ? 'text-slate-500 bg-white/5' : 'text-red-400 bg-red-500/10'}`}>
                  {item.trend}
                </span>
              </div>
              <div className="text-xl font-black text-white mb-2 leading-tight">{item.price}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1">
                <Shield size={10} /> {item.source}
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Feature & Workflow */}
      <section className="px-6 py-24 max-w-7xl mx-auto border-t border-white/5">
        <div className="grid lg:grid-cols-2 gap-20">
          <div>
            <h2 className="text-4xl md:text-7xl font-black text-white mb-8 tracking-tighter leading-[0.9]">
              Kenapa <br />
              <span className="text-emerald-400">Nusa Harvest?</span>
            </h2>
            <div className="space-y-8">
              {FEATURES.map((f, i) => (
                <motion.div key={i} {...FADE_UP} className="flex gap-6">
                  <div className={`w-14 h-14 shrink-0 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center`}>
                    {f.icon}
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">{f.title}</h4>
                    <p className="text-slate-400 text-sm leading-relaxed mb-4">{f.desc}</p>
                    <div className="flex gap-4">
                      {f.details.map((d, di) => (
                        <span key={di} className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 size={10} /> {d}
                        </span>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
          <div className="relative">
            <div className="sticky top-40 p-1 rounded-[40px] bg-gradient-to-br from-emerald-500/20 to-indigo-500/20 border border-white/10 shadow-2xl">
              <div className="rounded-[38px] bg-[#050b14] p-10">
                <h3 className="text-2xl font-black text-white mb-6">Alur Kerja Platform</h3>
                <div className="relative space-y-12">
                  {STEPS.map((s, i) => (
                    <div key={i} className="flex items-center gap-6 relative">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 font-black text-lg">
                        {i + 1}
                      </div>
                      <div>
                        <h5 className="font-bold text-white text-lg">{s.title}</h5>
                        <p className="text-slate-500 text-sm">{s.desc}</p>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="absolute top-10 left-5 w-0.5 h-12 bg-emerald-500/20" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Investment Pools */}
      <section className="px-6 py-24 max-w-7xl mx-auto bg-white/[0.01] rounded-[60px] border border-white/5">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-6xl font-black text-white mb-4 tracking-tighter">Investment Pools</h2>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">Sediakan likuiditas untuk dana jaminan petani dan dapatkan imbal hasil dari ekosistem agrikultur.</p>
          <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-4">Last sync: {poolsLastUpdated}</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {livePools.map((pool, i) => (
            <motion.div key={pool.id} {...FADE_UP} transition={{ ...FADE_UP.transition, delay: i * 0.1 }} 
              className="p-8 rounded-[40px] bg-[#050b14] border border-white/5 hover:border-emerald-500/30 transition-all group relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-emerald-950 transition-all">
                  <Database size={24} />
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400 tracking-tighter">{pool.apy !== null ? `${pool.apy.toFixed(2)}%` : 'N/A'}</div>
                  <div className="text-[9px] text-slate-500 font-black uppercase">Backend APY</div>
                </div>
              </div>
              <h3 className="text-lg font-bold text-white mb-1 italic">{pool.name}</h3>
              <div className="text-xs font-mono text-slate-500 mb-6 font-bold">{pool.symbol}</div>
              <div className="flex justify-between items-end pt-6 border-t border-white/5">
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Status</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${pool.isPaused ? 'bg-amber-400' : 'bg-emerald-400 animate-pulse'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-tighter italic ${pool.isPaused ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {pool.isPaused ? 'Paused' : 'Active'}
                    </span>
                  </div>
                </div>
                <Link href="/pools" className="p-3 bg-white/5 border border-white/5 rounded-2xl text-slate-400 hover:bg-emerald-500/10 hover:text-emerald-400 transition-all">
                  <ExternalLink size={16} />
                </Link>
              </div>
            </motion.div>
          ))}
          {livePools.length === 0 && (
            <div className="md:col-span-2 lg:col-span-4 p-10 rounded-3xl border border-white/10 bg-white/[0.02] text-center">
              <p className="text-white font-bold text-lg mb-2">Pool data belum tersedia.</p>
              <p className="text-slate-400 text-sm">Set `NEXT_PUBLIC_API_BASE_URL` agar frontend bisa menarik data pool langsung dari backend.</p>
            </div>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-24 border-t border-white/5 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12 mb-20">
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center">
                <Leaf className="text-emerald-950" size={24} />
              </div>
              <span className="text-2xl font-black text-white tracking-widest uppercase">Nusa Harvest</span>
            </div>
            <p className="text-slate-500 max-w-xs text-sm leading-relaxed">
              Infrastruktur DeFi Agrikultur untuk Indonesia. Melindungi petani, mengoptimalkan yield investor.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-20">
            <div className="space-y-4">
              <h5 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Platform</h5>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                <Link href="/dashboard" className="hover:text-emerald-400 transition-colors">Dashboard</Link>
                <Link href="/pools" className="hover:text-emerald-400 transition-colors">Yield Pools</Link>
                <Link href="/market" className="hover:text-emerald-400 transition-colors">Market Watch</Link>
              </div>
            </div>
            <div className="space-y-4">
              <h5 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Blockchain</h5>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                <a href={`https://explorer.solana.com/address/CgMn8QfThDQLkcghfP4A9AV3FTTECjSuZvf6Ngf1LiBx?cluster=devnet`} target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Program Explorer</a>
                <a href="https://explorer.solana.com/?cluster=devnet" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-400 transition-colors">Devnet Explorer</a>
              </div>
            </div>
            <div className="space-y-4">
              <h5 className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Techstack</h5>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                <span>Next.js 14</span>
                <span>Solana + Anchor</span>
                <span>Open-Meteo API</span>
              </div>
            </div>
          </div>
        </div>
        <div className="pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-[10px] text-slate-600 font-mono uppercase tracking-widest">
            © 2026 Nusa Harvest Protocol
          </p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/5 border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Realtime Data Feed</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
