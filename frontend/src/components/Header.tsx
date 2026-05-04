'use client'

import Link from 'next/link'
import { Leaf, Menu, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ConnectWalletButton, useWallet } from '../providers/WalletProvider'

const NAV = [
  { href: '/',          label: 'HOME'             },
  { href: '/dashboard', label: 'FARMER DASHBOARD' },
  { href: '/admin',     label: 'ADMIN CENTER'     },
  { href: '/pools',     label: 'YIELD POOLS'      },
  { href: '/market',    label: 'MARKET DATA'      },
]

export default function Header() {
  const pathname   = usePathname()
  const { connected, publicKey, disconnect } = useWallet()
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href)

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-50 h-[52px] flex items-center justify-between px-6"
        style={{
          background: 'rgba(10,15,10,0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(0,211,127,0.10)',
        }}
      >
        {/* ── Logo ─────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-[22px] h-[22px] rounded-[3px] grid place-items-center" style={{ background: '#00D37F' }}>
            <Leaf size={12} color="#0A0F0A" />
          </div>
          <span className="font-display font-bold text-[18px] text-white tracking-tight leading-none">
            Nusa Harvest
          </span>
        </Link>

        {/* ── Nav Links (desktop) ───────────────── */}
        <nav className="hidden md:flex items-center gap-8">
          {NAV.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="font-sans text-[13px] font-medium uppercase tracking-[0.06em] transition-colors duration-150"
              style={{ color: isActive(href) ? '#00D37F' : '#6B7D66' }}
              onMouseEnter={e => { if (!isActive(href)) (e.target as HTMLElement).style.color = '#00D37F' }}
              onMouseLeave={e => { if (!isActive(href)) (e.target as HTMLElement).style.color = '#6B7D66' }}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* ── Wallet + Mobile Toggle ────────────── */}
        <div className="flex items-center gap-3">
          {connected && publicKey ? (
            <button
              type="button"
              onClick={disconnect}
              className="font-sans text-[12px] font-bold uppercase tracking-wider px-4 py-[7px] rounded-[6px] transition-all active:scale-[0.98]"
              style={{ background: '#00D37F', color: '#0A0F0A' }}
            >
              {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
            </button>
          ) : (
            <ConnectWalletButton
              className="bg-[#00D37F] text-[#0A0F0A] font-sans text-[12px] font-bold uppercase tracking-wider px-4 py-[7px] rounded-[6px] transition-all active:scale-[0.98]"
            />
          )}
          <button
            type="button"
            className="md:hidden p-1.5 rounded-[4px] text-[#6B7D66] hover:text-white transition-colors"
            onClick={() => setMobileOpen(v => !v)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Drawer ────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden flex"
          onClick={() => setMobileOpen(false)}
        >
          <div
            className="w-64 h-full pt-[52px] px-6 py-8 flex flex-col gap-6"
            style={{ background: '#0D1410', borderRight: '1px solid rgba(0,211,127,0.10)' }}
            onClick={e => e.stopPropagation()}
          >
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="font-sans text-[16px] font-medium uppercase tracking-[0.06em] transition-colors"
                style={{ color: isActive(href) ? '#00D37F' : '#A8B5A0' }}
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex-1" />
        </div>
      )}
    </>
  )
}
