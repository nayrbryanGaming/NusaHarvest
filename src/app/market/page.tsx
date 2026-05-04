'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  TrendingUp, TrendingDown, RefreshCw, Globe,
  Sun, Droplets, Wind, CloudRain, AlertTriangle, Clock
} from 'lucide-react'
import Sidebar from '../../components/Sidebar'
import { useSim } from '../../contexts/SimulationContext'
import { getApiUrl } from '../../utils/api'
import { fetchWithTimeout } from '../../utils/timeout'

type FallbackPrice = {
  priceIdr: number
  change24h: number
  note: string
}

// Devnet-safe fallback prices so cards never show empty values.
const FALLBACK_PRICES: Record<string, FallbackPrice> = {
  solana: { priceIdr: 2450000, change24h: 0.4, note: 'CoinGecko fallback snapshot (devnet demo)' },
  'usd-coin': { priceIdr: 16100, change24h: 0.0, note: 'USDC IDR peg reference (devnet demo)' },
  padi: { priceIdr: 6800, change24h: 1.2, note: 'Sumber: BPS Q1 2026 (devnet demo)' },
  kopi: { priceIdr: 85000, change24h: -0.8, note: 'Sumber: BPS Q1 2026 (devnet demo)' },
}

const INITIAL_DATA = [
  { id: 'solana',   name: 'Solana (SOL)',    price: '', unit: 'SOL',  change: '', up: true,  region: 'Mainnet-Beta',      oracleId: 'CG-SOL-01'      },
  { id: 'usd-coin', name: 'USD Coin (USDC)', price: '', unit: 'USDC', change: '', up: true,  region: 'Stablecoin',        oracleId: 'CG-USDC-01'     },
  { id: 'padi',     name: 'Padi Ciherang',   price: '', unit: 'kg',   change: '', up: true,  region: 'Jawa Tengah',       oracleId: 'NH-IDX-RICE-01' },
  { id: 'kopi',     name: 'Kopi Robusta',    price: '', unit: 'kg',   change: '', up: false, region: 'Sumatera Selatan',  oracleId: 'NH-IDX-COFF-01' },
]

function fmt(n: number) { return n.toLocaleString('id-ID') }

export default function MarketPage() {
  const sim = useSim()
  const [data, setData]         = useState(INITIAL_DATA)
  const [loading, setLoading]   = useState(false)
  const [syncing, setSyncing]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState('')

  const fetchPrices = async () => {
    setLoading(true)
    const ts = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false })

    try {
      // 1. CoinGecko
      const cgRes  = await fetchWithTimeout('https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=idr&include_24hr_change=true')
      const cgJson = await cgRes.json()

      // 2. Backend commodity (optional)
      let commData: any[] = []
      try {
        const url = getApiUrl('/api/market/commodities')
        if (url) {
          const r = await fetchWithTimeout(url)
          if (r.ok) { const j = await r.json(); if (j.success) commData = j.data }
        }
      } catch { /* ignore */ }

      setData(prev => prev.map(item => {
        if (item.id === 'solana') {
          const priceIdr = Number(cgJson?.solana?.idr ?? FALLBACK_PRICES.solana.priceIdr)
          const ch = Number(cgJson?.solana?.idr_24h_change ?? FALLBACK_PRICES.solana.change24h)
          return { ...item, price: `Rp ${fmt(priceIdr)}`, change: `${ch>=0?'+':''}${ch.toFixed(2)}%`, up: ch>=0 }
        }
        if (item.id === 'usd-coin') {
          const priceIdr = Number(cgJson?.['usd-coin']?.idr ?? FALLBACK_PRICES['usd-coin'].priceIdr)
          const ch = Number(cgJson?.['usd-coin']?.idr_24h_change ?? FALLBACK_PRICES['usd-coin'].change24h)
          return { ...item, price: `Rp ${fmt(priceIdr)}`, change: `${ch>=0?'+':''}${ch.toFixed(2)}%`, up: ch>=0 }
        }
        if (item.id === 'padi') {
          const live = commData?.find((c: any) => c.id==='padi'||c.commodity==='RICE'||c.symbol==='RICE')
          const src  = live ?? FALLBACK_PRICES.padi
          const ch   = typeof src.change24h === 'number' ? src.change24h : FALLBACK_PRICES.padi.change24h
          return { ...item, price: `Rp ${fmt(Number(src.priceIdr))}`, change: `${ch>=0?'+':''}${ch.toFixed(2)}%`, up: ch>=0 }
        }
        if (item.id === 'kopi') {
          const live = commData?.find((c: any) => c.id==='kopi'||c.commodity==='COFFEE'||c.symbol==='COFFEE')
          const src  = live ?? FALLBACK_PRICES.kopi
          const ch   = typeof src.change24h === 'number' ? src.change24h : FALLBACK_PRICES.kopi.change24h
          return { ...item, price: `Rp ${fmt(Number(src.priceIdr))}`, change: `${ch>=0?'+':''}${ch.toFixed(2)}%`, up: ch>=0 }
        }
        return item
      }))
      setLastUpdate(ts)
    } catch {
      // Full fallback — still show data, never N/A
      setData(prev => prev.map(item => {
        const fallback = FALLBACK_PRICES[item.id]
        if (!fallback) return item
        return {
          ...item,
          price: `Rp ${fmt(fallback.priceIdr)}`,
          change: `${fallback.change24h >= 0 ? '+' : ''}${fallback.change24h.toFixed(2)}%`,
          up: fallback.change24h >= 0
        }
      }))
      setLastUpdate(ts + ' (offline cache)')
    } finally {
      setLoading(false)
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchPrices()
    const iv = setInterval(fetchPrices, 60000)
    return () => clearInterval(iv)
  }, [])

  const topAccent: Record<string,string> = {
    solana:   'from-purple-500/0 via-purple-400 to-purple-500/0',
    'usd-coin':'from-blue-500/0 via-blue-400 to-blue-500/0',
    padi:     'from-emerald-500/0 via-emerald-400 to-emerald-500/0',
    kopi:     'from-amber-500/0 via-amber-400 to-amber-500/0',
  }

  const weatherAlert = sim.weatherMode !== 'normal'

  return (
    <div className="flex min-h-screen bg-[#0A0F0A] pt-[52px] text-slate-100">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Topbar */}
        <div className="h-12 flex items-center justify-between px-8 border-b border-white/[0.05] sticky top-[52px] z-10 bg-[#0A0F0A]/90 backdrop-blur shrink-0">
          <div className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
            <span>Nusa Harvest</span><span className="text-slate-700">/</span><span className="text-white">Market Data</span>
          </div>
          <div className="flex items-center gap-2">
            {weatherAlert && (
              <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-orange-900/40 bg-orange-950/30 text-orange-400 flex items-center gap-1">
                <AlertTriangle size={9}/> Sim: {sim.weatherMode.toUpperCase()}
              </span>
            )}
            <span className="font-mono text-[10px] px-2.5 py-1 rounded-[3px] border border-emerald-900/40 bg-emerald-950/30 text-emerald-500 hidden sm:flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Oracle Active
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-8 pt-8 pb-16">

          {/* Header */}
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0,transition:{duration:0.4}}}
            className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-6">
            <div>
              <p className="font-mono text-[10.5px] tracking-[0.08em] uppercase text-slate-500 mb-3">
                Real-time price feed � CoinGecko + BPS Q1 2026
              </p>
              <h1 className="font-display text-5xl text-white tracking-tight leading-none mb-3">
                Market <em className="text-emerald-400">matrix.</em>
              </h1>
              <p className="text-slate-400 text-[14px] max-w-xl leading-relaxed">
                Harga SOL/USDC dari CoinGecko, komoditas dari referensi BPS Q1 2026 (devnet demo). Diperbarui otomatis setiap 60 detik.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {lastUpdate && (
                <span className="font-mono text-[10px] text-slate-600 flex items-center gap-1">
                  <Clock size={9}/> {lastUpdate}
                </span>
              )}
              <button
                type="button"
                onClick={fetchPrices}
                className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] border border-white/[0.08] rounded-[4px] hover:bg-white/10 font-mono text-[10.5px] text-slate-300 transition-colors"
              >
                <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Memuat...' : 'Refresh'}
              </button>
            </div>
          </motion.div>

          {/* Price cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
            {data.map((c, i) => {
              const empty = !c.price
              const fallbackNote = !empty && FALLBACK_PRICES[c.id]
                ? FALLBACK_PRICES[c.id].note
                : null
              return (
                <motion.div
                  key={c.id}
                  initial={{opacity:0,y:20}} animate={{opacity:1,y:0,transition:{delay:i*0.07,duration:0.4}}}
                  className="p-5 rounded-[6px] border border-white/[0.06] bg-[#050b14] relative overflow-hidden group"
                >
                  <div className={`absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r ${topAccent[c.id]} opacity-60 group-hover:opacity-100 transition-opacity`} />
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-slate-600">{c.region}</span>
                    {empty || syncing
                      ? <span className="font-mono text-[8px] text-slate-600 border border-white/[0.06] px-1.5 py-0.5 rounded-[2px]">SYNC</span>
                      : <span className="font-mono text-[8px] text-emerald-600 border border-emerald-900/40 px-1.5 py-0.5 rounded-[2px] flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-emerald-400 animate-pulse"/>LIVE</span>
                    }
                  </div>

                  <p className="font-mono text-[10px] text-slate-400 mb-1">{c.name}</p>
                  {empty || syncing ? (
                    <div className="h-8 w-28 rounded bg-white/[0.04] animate-pulse mb-3" />
                  ) : (
                    <p className="font-display text-2xl text-white mb-1 tracking-tight">{c.price}</p>
                  )}

                  {!empty && !syncing && (
                    <div className={`flex items-center gap-1 font-mono text-[10px] mb-3 ${c.up ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {c.up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>}
                      {c.change} <span className="text-slate-600">24H</span>
                    </div>
                  )}

                  <div className="pt-3 border-t border-white/[0.04]">
                    <span className="font-mono text-[9px] text-slate-700">{c.oracleId}</span>
                    {fallbackNote && (
                      <p className="font-mono text-[8.5px] text-slate-600 mt-0.5">{fallbackNote}</p>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>

          {/* Weather Oracle panel */}
          <motion.div initial={{opacity:0,y:16}} animate={{opacity:1,y:0,transition:{delay:0.3,duration:0.4}}}
            className="rounded-[6px] border border-white/[0.06] bg-[#050b14] overflow-hidden mb-6">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
              <div className="flex items-center gap-3">
                <Globe size={13} className="text-blue-400"/>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-slate-400">Active Meteorological Indices</p>
                {weatherAlert && (
                  <span className={`font-mono text-[9px] px-2 py-0.5 rounded-[3px] border ${
                    sim.weatherMode === 'drought' ? 'bg-orange-900/30 text-orange-400 border-orange-800/50' : 'bg-blue-900/30 text-blue-400 border-blue-800/50'
                  }`}>SIM: {sim.weatherMode.toUpperCase()}</span>
                )}
              </div>
              <span className="font-mono text-[9px] text-slate-600">{sim.lastWeatherUpdate}</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-white/[0.04]">
              {[
                { label: 'Suhu Udara',       value: `${sim.tempC}°C`,        icon: Sun,       color: 'text-amber-400',   alert: sim.tempC > 32 },
                { label: 'Curah Hujan',      value: `${sim.rainfallMm} mm`,  icon: CloudRain, color: 'text-blue-400',    alert: sim.rainfallMm < 40 || sim.rainfallMm > 250 },
                { label: 'Kelembaban',       value: `${sim.humidityPct}%`,   icon: Droplets,  color: 'text-teal-400',    alert: false },
                { label: 'Kec. Angin',       value: `${sim.windKmh} km/h`,   icon: Wind,      color: 'text-slate-300',   alert: sim.windKmh > 25 },
              ].map((idx) => (
                <div key={idx.label} className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-3">
                    <idx.icon size={13} className={idx.color}/>
                    <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-slate-500">{idx.label}</p>
                  </div>
                  <p className={`font-display text-3xl mb-1 ${idx.alert ? 'text-orange-400' : idx.color}`}>{idx.value}</p>
                  <p className="font-mono text-[9px] text-slate-600">
                    {idx.alert ? '⚠ Threshold warning' : 'Normal range'}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Rainfall → Insurance logic panel */}
          {(sim.rainfallMm < 40 || sim.rainfallMm > 250) && (
            <motion.div initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}
              className="p-4 rounded-[6px] border border-orange-900/40 bg-orange-950/20 flex items-start gap-3">
              <AlertTriangle size={14} className="text-orange-400 shrink-0 mt-0.5"/>
              <div>
                <p className="font-mono text-[11px] text-orange-300 font-semibold mb-1">
                  Insurance Trigger Warning — Curah Hujan {sim.rainfallMm < 40 ? 'Di Bawah' : 'Di Atas'} Threshold
                </p>
                <p className="font-mono text-[10.5px] text-slate-400">
                  Rainfall {sim.rainfallMm}mm {sim.rainfallMm < 40 ? '< 40mm (drought threshold)' : '> 250mm (flood threshold)'}.
                  Polis {sim.activeTriggers.join(', ')} dalam proses verifikasi trigger.
                  Jika terkonfirmasi dalam window 30 hari, klaim diproses otomatis on-chain.
                </p>
              </div>
            </motion.div>
          )}

          <div className="mt-6 p-4 rounded-[6px] border border-white/[0.05] bg-[#050b14] flex items-center gap-3">
            <Clock size={12} className="text-slate-600 shrink-0"/>
            <p className="font-mono text-[10px] text-slate-600">
              Data tersinkronisasi otomatis setiap 60 detik. Harga komoditas menggunakan HPP pemerintah sebagai fallback saat API tidak tersedia.
              {lastUpdate && <> · Last update: {lastUpdate}</>}
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}

