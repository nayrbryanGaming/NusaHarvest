'use client'

import Link from 'next/link'
import { Leaf, Shield, Briefcase, BarChart3, Globe, Menu, X } from 'lucide-react'
import { ConnectWalletButton } from '../providers/WalletProvider'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function Navbar() {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const navLinks = [
    { name: 'Home', href: '/', icon: <Globe size={14} /> },
    { name: 'Farmer Dashboard', href: '/dashboard', icon: <Leaf size={14} /> },
    { name: 'Admin Center', href: '/admin', icon: <Shield size={14} /> },
    { name: 'Yield Pools', href: '/pools', icon: <Briefcase size={14} /> },
    { name: 'Market Data', href: '/market', icon: <BarChart3 size={14} /> },
  ]

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  return (
    <nav className="fixed top-0 w-full px-6 py-4 z-50 backdrop-blur-xl bg-[#050b14]/80 border-b border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-xl font-bold flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:bg-emerald-500/20 transition-all">
              <Leaf className="text-emerald-400" size={18} />
            </div>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Nusa Harvest</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              className="lg:hidden w-9 h-9 rounded-lg bg-white/[0.03] border border-white/10 text-slate-300 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              title={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
            >
              {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <ConnectWalletButton className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all shadow-inner" />
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-1 bg-white/[0.03] rounded-full p-1 border border-white/5 mt-3 w-max mx-auto">
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

        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 grid grid-cols-2 gap-2 bg-white/[0.03] border border-white/10 rounded-2xl p-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-emerald-950 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                      : 'text-slate-300 hover:text-white bg-white/[0.02] hover:bg-white/10'
                  }`}
                >
                  {link.icon} {link.name}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </nav>
  )
}
