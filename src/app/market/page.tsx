'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart3,
  CloudRain, 
  ArrowRight,
  RefreshCw,
  Globe,
  Sun,
  Droplets,
  Wind
} from 'lucide-react'
import Navbar from '../../components/Navbar'
import { getApiUrl } from '../../utils/api'

const INITIAL_DATA = [
  { id: 'solana', name: 'Solana (SOL)', price: 'Syncing...', unit: 'SOL', change: '...', up: true, region: 'Mainnet-Beta', oracleId: 'CG-SOL-01' },
  { id: 'usd-coin', name: 'USD Coin (USDC)', price: 'Syncing...', unit: 'USDC', change: '...', up: true, region: 'Stablecoin', oracleId: 'CG-USDC-01' },
  { id: 'padi', name: 'Padi Ciherang', price: 'Syncing...', unit: 'kg', change: '...', up: true, region: 'Jawa Tengah', oracleId: 'NH-IDX-RICE-01' },
  { id: 'kopi', name: 'Kopi Robusta', price: 'Syncing...', unit: 'kg', change: '...', up: true, region: 'Sumatera Selatan', oracleId: 'NH-IDX-COFF-01' }
]

export default function MarketPage() {
  const [data, setData] = useState(INITIAL_DATA)
  const [loading, setLoading] = useState(false)
  const [weatherNow, setWeatherNow] = useState({
    temp: '...',
    rain: '...',
    humidity: '...',
    wind: '...',
  })

  const fetchPrices = async () => {
    setLoading(true)
    try {
      const commodityApiUrl = getApiUrl('/api/market/commodities')

      // 1. Fetch SOL and USDC Price from CoinGecko
      const cgRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr&include_24hr_change=true')
      const cgJson = await cgRes.json()
      
      // 2. Fetch commodity prices from backend API (if available)
      let commData: any[] = []
      try {
        if (commodityApiUrl) {
          const commRes = await fetch(commodityApiUrl)
          if (commRes.ok) {
            const commJson = await commRes.json()
            if (commJson.success) commData = commJson.data
          }
        }
      } catch (e) {
        console.warn('Market API unreachable')
      }

      // 3. Fetch live weather snapshot for oracle panel.
      try {
        const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=-7.7078&longitude=110.6101&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m')
        if (weatherRes.ok) {
          const weatherJson = await weatherRes.json()
          const current = weatherJson?.current
          if (current) {
            setWeatherNow({
              temp: `${current.temperature_2m}°C`,
              rain: `${current.rain} mm`,
              humidity: `${current.relative_humidity_2m}%`,
              wind: `${current.wind_speed_10m} km/h`,
            })
          }
        }
      } catch (e) {
        console.warn('Weather oracle feed unreachable')
      }

      setData(prev => prev.map(item => {
        if (item.id === 'solana' && cgJson.solana) {
          return {
            ...item,
            price: `Rp ${cgJson.solana.idr.toLocaleString('id-ID')}`,
            change: `${cgJson.solana.idr_24h_change >= 0 ? '+' : ''}${cgJson.solana.idr_24h_change.toFixed(2)}%`,
            up: cgJson.solana.idr_24h_change >= 0
          }
        }
        if (item.id === 'usd-coin' && cgJson['usd-coin']) {
          return {
            ...item,
            price: `Rp ${cgJson['usd-coin'].idr.toLocaleString('id-ID')}`,
            change: `${cgJson['usd-coin'].idr_24h_change >= 0 ? '+' : ''}${cgJson['usd-coin'].idr_24h_change.toFixed(2)}%`,
            up: cgJson['usd-coin'].idr_24h_change >= 0
          }
        }
        
        if (item.id === 'padi') {
          const padiData = commData?.find((c: any) => c.id === 'padi' || c.commodity === 'RICE' || c.symbol === 'RICE')
          if (padiData) {
            const change24h = typeof padiData.change24h === 'number' ? padiData.change24h : null
            return {
              ...item,
              price: `Rp ${Number(padiData.priceIdr).toLocaleString('id-ID')}`,
              change: change24h !== null ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%` : '—',
              up: change24h !== null ? change24h >= 0 : true
            }
          }
          return { ...item, price: '—', change: 'N/A', up: true }
        }
        if (item.id === 'kopi') {
          const kopiData = commData?.find((c: any) => c.id === 'kopi' || c.commodity === 'COFFEE' || c.symbol === 'COFFEE')
          if (kopiData) {
            const change24h = typeof kopiData.change24h === 'number' ? kopiData.change24h : null
            return {
              ...item,
              price: `Rp ${Number(kopiData.priceIdr).toLocaleString('id-ID')}`,
              change: change24h !== null ? `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%` : '—',
              up: change24h !== null ? change24h >= 0 : true
            }
          }
          return { ...item, price: '—', change: 'N/A', up: true }
        }
        
        return item
      }))
    } catch (e) {
      console.error('Price fetch error:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPrices()
    const interval = setInterval(fetchPrices, 60000) // 1m refresh
    return () => clearInterval(interval)
  }, [])

  const refreshData = () => {
    fetchPrices()
  }

  return (
    <main className="min-h-screen bg-[#02060c] text-slate-100 pb-20 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[800px] h-[400px] bg-emerald-500/5 blur-[120px] -z-10 rounded-full" />
      
      <Navbar />

      <div className="pt-36 px-6 max-w-7xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-4xl font-black mb-2 italic">Commodity <span className="text-emerald-400">Price Matrix</span></h1>
            <p className="text-slate-500 text-sm font-medium">Real-time feed dari CoinGecko, Yahoo Finance (via backend), dan oracle cuaca publik tanpa angka statis.</p>
          </div>
          <button 
            onClick={refreshData}
            className="flex items-center gap-3 px-6 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all font-black text-[10px] uppercase tracking-widest shadow-inner group"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} /> {loading ? 'Memuat data...' : 'Refresh Data'}
          </button>
        </header>

        <div className="grid lg:grid-cols-4 gap-5 mb-12">
          {data.map((c, i) => {
            const isSyncing  = c.price === 'Syncing...' || c.price === '...'
            const isLive     = !isSyncing
            const topAccent  = c.id === 'solana'   ? 'from-purple-500/0 via-purple-400 to-purple-500/0'
                             : c.id === 'usd-coin' ? 'from-blue-500/0 via-blue-400 to-blue-500/0'
                             : c.id === 'padi'     ? 'from-emerald-500/0 via-emerald-400 to-emerald-500/0'
                             : 'from-amber-500/0 via-amber-400 to-amber-500/0'
            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="hover-lift glass-panel p-6 rounded-3xl relative overflow-hidden group"
              >
                {/* Gradient top border accent */}
                <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r ${topAccent} opacity-70 group-hover:opacity-100 transition-opacity`} />

                <div className="flex justify-between items-start mb-5">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{c.region}</span>
                  <div className="flex items-center gap-1.5">
                    {isLive
                      ? <span className="data-badge data-badge-live text-[8px] px-2 py-0.5"><span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse" />LIVE</span>
                      : <span className="data-badge data-badge-inactive text-[8px] px-2 py-0.5">SYNC</span>
                    }
                    {c.up ? <TrendingUp size={14} className="text-emerald-400" /> : <TrendingDown size={14} className="text-rose-400" />}
                  </div>
                </div>

                <h3 className="text-lg font-black text-white mb-0.5 tracking-tight leading-tight">{c.name}</h3>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <div className={`text-2xl font-mono font-black tabular-nums ${isSyncing ? 'text-slate-600' : 'text-white'}`}>
                    {isSyncing ? <span className="skeleton inline-block w-24 h-7 rounded" /> : c.price}
                  </div>
                  {!isSyncing && <div className="text-xs text-slate-500">/ {c.unit}</div>}
                </div>

                <div className={`inline-flex items-center gap-1 font-bold text-xs mb-4 ${c.change === 'Syncing...' || c.change === '...' || c.change === 'N/A' ? 'text-slate-600' : c.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {!isSyncing && (c.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />)}
                  {c.change} {!isSyncing && <span className="text-[10px] text-slate-600 font-normal">24H</span>}
                </div>

                <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-600 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500/60" />{c.oracleId}
                  </span>
                  {isLive && <span className="text-[9px] text-emerald-600 font-bold uppercase tracking-wider">On-chain ↗</span>}
                </div>
              </motion.div>
            )
          })}
        </div>

        <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-white/5">
            <h3 className="font-black italic text-lg flex items-center gap-2 uppercase tracking-widest"><Globe className="text-blue-400" size={20}/> Active Meteorological Indices</h3>
            <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest">Status: Live feed</span>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {[
              { label: 'Suhu Udara', value: weatherNow.temp, status: weatherNow.temp === '...' ? 'FETCHING' : 'LIVE', color: 'text-amber-400', icon: <Sun size={18}/> },
              { label: 'Curah Hujan', value: weatherNow.rain, status: weatherNow.rain === '...' ? 'FETCHING' : 'LIVE', color: 'text-emerald-400', icon: <CloudRain size={18}/> },
              { label: 'Relative Humidity', value: weatherNow.humidity, status: weatherNow.humidity === '...' ? 'FETCHING' : 'LIVE', color: 'text-blue-400', icon: <Droplets size={18}/> },
              { label: 'Kecepatan Angin', value: weatherNow.wind, status: weatherNow.wind === '...' ? 'FETCHING' : 'LIVE', color: 'text-emerald-400', icon: <Wind size={18}/> }
            ].map((idx, i) => (
              <div key={i} className="group cursor-default">
                <div className="flex items-center gap-2 mb-3">
                    <div className={`p-1.5 rounded-lg bg-white/5 border border-white/10 ${idx.color} group-hover:scale-110 transition-transform`}>{idx.icon}</div>
                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{idx.label}</div>
                </div>
                <div className={`text-4xl font-mono font-black mb-2 ${idx.color} tracking-tighter`}>{idx.value}</div>
                <div className="text-[9px] text-white/40 font-black bg-white/5 px-2.5 py-1 rounded-lg border border-white/5 inline-block uppercase tracking-widest">{idx.status}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center p-8 rounded-[32px] border border-dashed border-white/10">
          <p className="text-slate-500 text-[10px] uppercase font-bold tracking-[0.3em] italic">Data tersinkronisasi otomatis setiap 60 detik.</p>
        </div>
      </div>
    </main>
  )
}
