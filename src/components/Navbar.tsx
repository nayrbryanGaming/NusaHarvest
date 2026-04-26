'use client'

import Link from 'next/link'
import { Leaf, Shield, Briefcase, BarChart3, Globe, Menu, X } from 'lucide-react'
import { ConnectWalletButton } from '../providers/WalletProvider'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const navLinks = [
  { name: 'Home',             href: '/',          icon: Globe      },
  { name: 'Farmer Dashboard', href: '/dashboard', icon: Leaf       },
  { name: 'Admin Center',     href: '/admin',     icon: Shield     },
  { name: 'Yield Pools',      href: '/pools',     icon: Briefcase  },
  { name: 'Market Data',      href: '/market',    icon: BarChart3  },
]

export default function Navbar() {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const activeIndex = navLinks.findIndex(l => l.href === pathname)
  const indicatorRef = useRef<HTMLDivElement>(null)
  const navRef       = useRef<HTMLDivElement>(null)

  useEffect(() => { setMobileOpen(false) }, [pathname])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  /* slide the pill indicator to the active link */
  useEffect(() => {
    const nav = navRef.current
    if (!nav || activeIndex < 0) return
    const links = nav.querySelectorAll<HTMLAnchorElement>('[data-navlink]')
    const target = links[activeIndex]
    const ind = indicatorRef.current
    if (!target || !ind) return
    const parentRect = nav.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    ind.style.width  = `${targetRect.width}px`
    ind.style.left   = `${targetRect.left - parentRect.left}px`
  }, [pathname, activeIndex])

  return (
    <nav
      className={`fixed top-9 w-full z-50 transition-all duration-300 navbar-blur
        ${scrolled
          ? 'bg-[#050b14]/90 border-b border-white/[0.06] shadow-[0_4px_24px_rgba(0,0,0,0.4)]'
          : 'bg-[#050b14]/70 border-b border-white/[0.03]'
        }`}
    >
      <div className="max-w-7xl mx-auto px-5 py-3.5">
        {/* Top row */}
        <div className="flex items-center justify-between">
          <Link href="/" className="group flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 flex items-center justify-center border border-emerald-500/25 group-hover:border-emerald-400/50 group-hover:shadow-emerald-sm transition-all duration-300">
              <Leaf className="text-emerald-400 group-hover:text-emerald-300 transition-colors" size={16} />
            </div>
            <span className="text-[15px] font-black bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400 tracking-tight">
              Nusa Harvest
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08] hover:border-white/15 transition-all duration-200 flex items-center justify-center"
              aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={mobileOpen ? 'x' : 'menu'}
                  initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
                  animate={{ rotate: 0,   opacity: 1, scale: 1   }}
                  exit={{    rotate:  90,  opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.18 }}
                >
                  {mobileOpen ? <X size={16} /> : <Menu size={16} />}
                </motion.span>
              </AnimatePresence>
            </button>

            <ConnectWalletButton className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400/50 hover:shadow-emerald-sm transition-all duration-200" />
          </div>
        </div>

        {/* Desktop pill nav */}
        <div
          ref={navRef}
          className="hidden lg:flex items-center gap-0.5 bg-white/[0.03] rounded-full px-1.5 py-1.5 border border-white/[0.05] mt-3 w-max mx-auto relative"
        >
          {/* Sliding background indicator */}
          <div
            ref={indicatorRef}
            className="absolute top-1.5 bottom-1.5 rounded-full bg-emerald-500 shadow-emerald-sm transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ pointerEvents: 'none' }}
          />

          {navLinks.map((link) => {
            const Icon    = link.icon
            const isActive = pathname === link.href
            return (
              <Link
                key={link.href}
                href={link.href}
                data-navlink
                className={`relative z-10 flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition-colors duration-200 ${
                  isActive
                    ? 'text-emerald-950'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Icon size={13} />
                {link.name}
              </Link>
            )
          })}
        </div>

        {/* Mobile menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{    height: 0, opacity: 0    }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="lg:hidden overflow-hidden"
            >
              <div className="mt-3 grid grid-cols-2 gap-2 bg-white/[0.03] border border-white/[0.07] rounded-2xl p-2">
                {navLinks.map((link, i) => {
                  const Icon    = link.icon
                  const isActive = pathname === link.href
                  return (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04, duration: 0.18 }}
                    >
                      <Link
                        href={link.href}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wider transition-all ${
                          isActive
                            ? 'bg-emerald-500 text-emerald-950 shadow-emerald-sm'
                            : 'text-slate-300 hover:text-white bg-white/[0.02] hover:bg-white/[0.08] border border-white/[0.05]'
                        }`}
                      >
                        <Icon size={13} /> {link.name}
                      </Link>
                    </motion.div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
  )
}
