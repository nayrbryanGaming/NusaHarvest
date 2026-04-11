'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Leaf, MapPin, Compass, Shield, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react'
import { useWallet, ConnectWalletButton } from '../../providers/WalletProvider'
import Navbar from '../../components/Navbar'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { getApiUrl } from '../../utils/api'

export default function RegisterFarmPage() {
  const { connected, publicKey } = useWallet()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    cropType: 'RICE',
    hectares: ''
  })

  // Simulated GPS geolocation in MVP mode
  const detectLocation = () => {
    setLoading(true)
    setTimeout(() => {
      // Coordinates for Klaten, Central Java
      setFormData(prev => ({
        ...prev,
        latitude: '-7.7078',
        longitude: '110.6101'
      }))
      setLoading(false)
      toast.success('GPS Lokasi Terdeteksi: Klaten, Jawa Tengah')
    }, 1500)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!connected || !publicKey) {
      toast.error('Hubungkan Wallet untuk mengunci identitas On-Chain')
      return
    }

    setLoading(true)
    try {
      const registerUrl = getApiUrl('/api/farm/register')
      if (!registerUrl) {
        throw new Error('Backend API URL belum dikonfigurasi')
      }

      const res = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerId: publicKey, // In MVP we use wallet as ID
          name: formData.name,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          cropType: formData.cropType,
          hectares: parseFloat(formData.hectares)
        })
      })

      if (!res.ok) throw new Error('Pendaftaran Gagal')

      toast.success('Lahan berhasil didaftarkan di Nusa Harvest')
      router.push('/dashboard')
    } catch (err: any) {
      toast.error(err?.message || 'Gagal mendaftar. Pastikan backend aktif dan URL API benar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#02060c] relative overflow-hidden text-slate-100 pb-20">
      <div className="absolute top-0 right-0 w-[800px] h-[600px] bg-emerald-500/5 blur-[120px] -z-10 rounded-full" />
      
      <Navbar />

      <div className="pt-32 px-6 max-w-4xl mx-auto">
        <header className="mb-12 text-center">
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full mb-6">
             <Leaf className="text-emerald-400" size={16} />
             <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">Pendaftaran Lahan Baru</span>
          </motion.div>
          <h1 className="text-5xl md:text-6xl font-black text-white italic tracking-tighter mb-4">
            Digital <span className="text-emerald-400">Onboarding</span>
          </h1>
          <p className="text-slate-500 text-lg font-medium leading-relaxed max-w-2xl mx-auto">
            Daftarkan koordinat lahan Anda untuk mendapatkan analisis risiko iklim real-time dan proteksi asuransi parametrik.
          </p>
        </header>

        {!connected ? (
          <div className="glass-panel p-16 rounded-[48px] border border-white/5 bg-white/[0.01] text-center">
            <Shield className="mx-auto text-emerald-400 mb-8" size={64} />
            <h2 className="text-2xl font-black text-white mb-4 uppercase tracking-tight">Wallet Connection Required</h2>
            <p className="text-slate-500 mb-10 max-w-md mx-auto font-medium leading-relaxed">
              Anda harus menghubungkan wallet Solana untuk membuat identitas digital petani yang immutable di blockchain.
            </p>
            <ConnectWalletButton className="mx-auto px-12 py-5 rounded-2xl bg-emerald-500 text-emerald-950 font-black uppercase tracking-widest text-sm hover:bg-emerald-400 transition-all shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:scale-105" />
          </div>
        ) : (
          <motion.form 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="glass-panel p-10 md:p-16 rounded-[48px] border border-white/5 bg-white/[0.01] space-y-10"
          >
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-2 italic">Informasi Lahan</label>
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Nama Lahan (e.g. Sawah Klaten 01)"
                    required
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-white/[0.03] border-2 border-white/10 rounded-2xl p-5 text-white font-bold focus:border-emerald-500/50 focus:outline-none transition-all"
                  />
                  <select 
                    aria-label="Jenis komoditas"
                    value={formData.cropType}
                    onChange={e => setFormData({...formData, cropType: e.target.value})}
                    className="w-full bg-white/[0.03] border-2 border-white/10 rounded-2xl p-5 text-white font-bold focus:border-emerald-500/50 focus:outline-none appearance-none"
                  >
                    <option value="RICE">Padi (Rice)</option>
                    <option value="CORN">Jagung (Corn)</option>
                    <option value="COFFEE">Kopi (Coffee)</option>
                    <option value="SOYBEAN">Kedelai (Soybean)</option>
                  </select>
                  <input 
                    type="number" 
                    placeholder="Luas Lahan (Hektar)"
                    required
                    step="0.1"
                    value={formData.hectares}
                    onChange={e => setFormData({...formData, hectares: e.target.value})}
                    className="w-full bg-white/[0.03] border-2 border-white/10 rounded-2xl p-5 text-white font-bold focus:border-emerald-500/50 focus:outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-2 italic">Koordinat GPS</label>
                <div className="space-y-4">
                  <div className="flex gap-4">
                    <input 
                      type="text" 
                      placeholder="Latitude"
                      required
                      readOnly
                      value={formData.latitude}
                      className="w-full bg-white/[0.02] border-2 border-white/5 border-dashed rounded-2xl p-5 text-slate-400 font-mono text-sm focus:outline-none cursor-not-allowed"
                    />
                    <input 
                      type="text" 
                      placeholder="Longitude"
                      required
                      readOnly
                      value={formData.longitude}
                      className="w-full bg-white/[0.02] border-2 border-white/5 border-dashed rounded-2xl p-5 text-slate-400 font-mono text-sm focus:outline-none cursor-not-allowed"
                    />
                  </div>
                  <button 
                    type="button" 
                    onClick={detectLocation}
                    disabled={loading}
                    className="w-full py-5 rounded-2xl border-2 border-emerald-500/20 bg-emerald-500/5 text-emerald-400 font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-3 hover:bg-emerald-500/10 transition-all disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="animate-spin" size={16} /> : <Compass size={16} />}
                    Deteksi Lokasi Otomatis
                  </button>
                  <p className="text-[9px] text-slate-600 font-bold bg-white/5 p-3 rounded-xl border border-white/5">
                    <CheckCircle2 className="inline mr-2 text-blue-500" size={12} /> Data lokasi akan di-binding secara permanen dengan wallet address Anda {publicKey?.slice(0, 6)}...
                  </p>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full py-8 rounded-3xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-emerald-950 font-black text-sm uppercase tracking-[0.4em] transition-all shadow-[0_0_50px_rgba(16,185,129,0.3)] flex items-center justify-center gap-4 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" /> : <><ArrowRight /> Selesaikan Pendaftaran</>}
            </button>
          </motion.form>
        )}

        <footer className="mt-12 text-center">
            <p className="text-[10px] text-slate-600 font-bold uppercase tracking-[0.2em] italic">
              Dengan mendaftar, Anda menyetujui protokol mitigasi risiko otomatis Nusa Harvest.
            </p>
        </footer>
      </div>
    </main>
  )
}
