'use client'

import Link from 'next/link'
import { Leaf, Shield, Briefcase, BarChart3, Globe } from 'lucide-react'
import { ConnectWalletButton } from '../providers/WalletProvider'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Connection } from '@solana/web3.js'
import { RPC_URL } from '../utils/constants'

export default function Navbar() {
  const pathname = usePathname()

  const navLinks = [
    { name: 'Farmer Dashboard', href: '/dashboard', icon: <Leaf size={14} /> },
    { name: 'Admin Center', href: '/admin', icon: <Shield size={14} /> },
    { name: 'Yield Pools', href: '/pools', icon: <Briefcase size={14} /> },
    { name: 'Market Data', href: '/market', icon: <BarChart3 size={14} /> },
  ]

  const [blockHeight, setBlockHeight] = useState<number | null>(null)
  
  useEffect(() => {
    let subscriptionId: number;
    const connection = new Connection(RPC_URL, 'confirmed');

    const fetchInitialSlot = async () => {
      try {
        const slot = await connection.getSlot();
        setBlockHeight(slot);
      } catch (e) {
        console.error("Failed to fetch initial slot", e);
      }
    };

    fetchInitialSlot();

    try {
      subscriptionId = connection.onSlotChange((slotInfo) => {
        setBlockHeight(slotInfo.slot);
      });
    } catch (e) {
      // Fallback if websocket fails
      const interval = setInterval(fetchInitialSlot, 5000);
      return () => clearInterval(interval);
    }

    return () => {
      if (subscriptionId) {
        connection.removeSlotChangeListener(subscriptionId).catch(console.error);
      }
    };
  }, [])

  return (
    <nav className="fixed top-0 w-full px-6 py-4 z-50 backdrop-blur-xl bg-[#050b14]/80 border-b border-white/5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-xl font-bold flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
              <Leaf className="text-emerald-400" size={18} />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Nusa Harvest</span>
          </Link>
          
          <div className="hidden lg:flex items-center gap-1 bg-white/[0.03] rounded-full p-1 border border-white/5">
            {navLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link 
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-all ${
                    isActive 
                      ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]' 
                      : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.icon} {link.name}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5">
            <div className={`w-1.5 h-1.5 rounded-full ${blockHeight ? 'bg-emerald-500 animate-pulse' : 'bg-slate-600'}`} />
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none">
              {blockHeight ? `Slot: ${blockHeight.toLocaleString()}` : 'Loading network...'}
            </span>
          </div>
          <ConnectWalletButton className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-inner" />
        </div>
      </div>
    </nav>
  )
}
