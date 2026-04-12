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
  { id: 'solana', name: 'Solana (SOL)', price: '—', unit: 'SOL', change: '—', up: true, region: 'Mainnet-Beta', oracleId: 'CG-SOL-01' },
  { id: 'usd-coin', name: 'USD Coin (USDC)', price: '—', unit: 'USDC', change: '—', up: true, region: 'Stablecoin', oracleId: 'CG-USDC-01' },
  { id: 'padi', name: 'Padi Ciherang', price: 'N/A', unit: 'kg', change: 'N/A', up: true, region: 'Jawa Tengah', oracleId: 'NH-IDX-RICE-01' },
  { id: 'kopi', name: 'Kopi Robusta', price: 'N/A', unit: 'kg', change: 'N/A', up: true, region: 'Sumatera Selatan', oracleId: 'NH-IDX-COFF-01' }
]

export default function MarketPage() {
  const [data, setData] = useState(INITIAL_DATA)
  const [loading, setLoading] = useState(false)
  const [weatherNow, setWeatherNow] = useState({
    temp: 'N/A',
    rain: 'N/A',
    humidity: 'N/A',
    wind: 'N/A',
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
        
        // Find in commData
        const found = commData.find((c: any) => c.slug === item.id)
        if (found) {
          const currency = found.currency === 'USD' ? 'USD' : 'IDR'
          const priceLabel =
            currency === 'USD'
              ? `$ ${Number(found.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
              : `Rp ${Number(found.price).toLocaleString('id-ID')}`

          return {
            ...item,
            price: priceLabel,
            change: `${found.change24h >= 0 ? '+' : ''}${found.change24h.toFixed(2)}%`,
            up: found.change24h >= 0
          }
        }
        
        // Keep commodity value as unavailable when no live backend feed exists.
        if (item.id === 'padi' || item.id === 'kopi') {
          return { ...item, price: 'N/A', change: 'N/A', up: true }
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

      <div className="pt-32 px-6 max-w-7xl mx-auto">
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

        <div className="grid lg:grid-cols-4 gap-6 mb-12">
          {data.map((c, i) => (
            <motion.div 
              key={c.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1 }}
              className="glass-panel p-6 rounded-[32px] border border-white/5 bg-white/[0.01] hover:bg-white/[0.04] transition-all group overflow-hidden relative"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{c.region}</div>
                {c.up ? <TrendingUp size={16} className="text-emerald-400" /> : <TrendingDown size={16} className="text-rose-400" />}
              </div>
              <h3 className="text-2xl font-black mb-1 italic tracking-tighter">{c.name}</h3>
              <div className="flex items-baseline gap-2 mb-4">
                <div className="text-3xl font-mono font-black text-white">{c.price}</div>
                <div className="text-xs text-slate-500">/ {c.unit}</div>
              </div>
              <div className={`inline-flex items-center gap-1 font-black text-xs ${c.change === 'N/A' ? 'text-slate-500' : c.up ? 'text-emerald-400' : 'text-rose-400'} mb-4`}>
                {c.up ? <ArrowRight className="-rotate-45" size={12} /> : <ArrowRight className="rotate-45" size={12} />}
                {c.change} <span className="text-[10px] text-slate-600 ml-1 font-bold">24H</span>
              </div>
              <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                <div className="text-[8px] font-mono text-slate-600 uppercase tracking-widest flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-blue-500" /> Oracle ID: {c.oracleId}
                </div>
                <div className={`text-[8px] font-black uppercase tracking-tighter ${c.price === 'N/A' ? 'text-slate-500' : 'text-emerald-500/40'}`}>
                  {c.price === 'N/A' ? 'Feed unavailable' : 'Live feed'}
                </div>
              </div>
              <div className="absolute -right-6 -bottom-6 w-16 h-16 bg-white/5 blur-2xl rounded-full group-hover:bg-emerald-500/10 transition-all duration-700" />
            </motion.div>
          ))}
        </div>

        <div className="glass-panel p-10 rounded-[48px] border border-white/5 bg-white/[0.01] relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12 pb-8 border-b border-white/5">
            <h3 className="font-black italic text-lg flex items-center gap-2 uppercase tracking-widest"><Globe className="text-blue-400" size={20}/> Active Meteorological Indices</h3>
            <span className="text-[10px] font-black text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-500/20 uppercase tracking-widest">Status: Live feed</span>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
            {[
              { label: 'Suhu Udara', value: weatherNow.temp, status: weatherNow.temp === 'N/A' ? 'UNAVAILABLE' : 'LIVE', color: 'text-amber-400', icon: <Sun size={18}/> },
              { label: 'Curah Hujan', value: weatherNow.rain, status: weatherNow.rain === 'N/A' ? 'UNAVAILABLE' : 'LIVE', color: 'text-emerald-400', icon: <CloudRain size={18}/> },
              { label: 'Relative Humidity', value: weatherNow.humidity, status: weatherNow.humidity === 'N/A' ? 'UNAVAILABLE' : 'LIVE', color: 'text-blue-400', icon: <Droplets size={18}/> },
              { label: 'Kecepatan Angin', value: weatherNow.wind, status: weatherNow.wind === 'N/A' ? 'UNAVAILABLE' : 'LIVE', color: 'text-emerald-400', icon: <Wind size={18}/> }
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
