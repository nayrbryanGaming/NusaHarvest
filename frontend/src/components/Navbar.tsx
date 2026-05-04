'use client'

import Link from 'next/link'
import { Leaf, Menu, X } from 'lucide-react'
import { ConnectWalletButton } from '../providers/WalletProvider'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const LINKS = [
  { label: 'Untuk Petani',   href: '/dashboard' },
  { label: 'Untuk Investor', href: '/pools'     },
  { label: 'Risk Engine',    href: '/market'    },
  { label: 'Admin',          href: '/admin'     },
]

export default function Navbar() {
  const [scrolled,    setScrolled]    = useState(false)
  const [mobileOpen,  setMobileOpen]  = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMobileOpen(false) }, [pathname])

  return (
    <nav className={`fixed top-9 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled
        ? 'bg-[#030810]/92 border-b border-white/[0.06] backdrop-blur-md'
        : 'bg-[#030810]/60 backdrop-blur-sm'
    }`}>
      <div className="h-14 flex items-center justify-between px-6 md:px-10">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 bg-emerald-500 rounded-[3px] grid place-items-center shrink-0">
            <Leaf size={14} className="text-black" />
          </div>
          <span className="font-display text-[19px] text-white tracking-tight leading-none">Nusa Harvest</span>
          <span className="hidden sm:block font-mono text-[8.5px] px-1.5 py-0.5 rounded-[3px] bg-emerald-900/30 border border-emerald-500/20 text-emerald-500 uppercase tracking-widest ml-0.5">
            v1.0 · Devnet
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden lg:flex items-center gap-8 font-mono text-[11.5px] tracking-[0.04em]">
          {LINKS.map(l => (
            <Link
              key={l.href}
              href={l.href}
              className="text-slate-400 hover:text-white transition-colors duration-150"
            >
              {l.label}
            </Link>
          ))}
        </div>

        {/* Right: mobile toggle + CTA */}
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setMobileOpen(v => !v)}
            className="lg:hidden w-8 h-8 rounded-[4px] border border-white/[0.08] text-slate-400 hover:text-white hover:border-white/20 flex items-center justify-center transition-all"
            aria-label="Toggle menu"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={mobileOpen ? 'x' : 'm'}
                initial={{ opacity: 0, rotate: -90 }}
                animate={{ opacity: 1, rotate: 0 }}
                exit={{    opacity: 0, rotate:  90 }}
                transition={{ duration: 0.14 }}
              >
                {mobileOpen ? <X size={15} /> : <Menu size={15} />}
              </motion.span>
            </AnimatePresence>
          </button>

          <ConnectWalletButton className="h-8 px-4 rounded-[4px] font-mono text-[11px] uppercase tracking-wider bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors" />
        </div>
      </div>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{    height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="lg:hidden overflow-hidden border-t border-white/[0.05] bg-[#030810]/95 backdrop-blur-md"
          >
            <div className="px-6 py-5 flex flex-col gap-4">
              {LINKS.map(l => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="font-mono text-[12px] text-slate-300 hover:text-white tracking-[0.04em] transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
