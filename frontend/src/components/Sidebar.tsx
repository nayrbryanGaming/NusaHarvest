'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Shield, Briefcase, BarChart3,
  Settings, Map, Activity, ExternalLink, Leaf, Users
} from 'lucide-react'
import { ConnectWalletButton, useWallet } from '../providers/WalletProvider'
import { PROGRAM_ID_STR, DEPLOY_TX_SIG, DEPLOY_SLOT } from '../utils/constants'

const NAV = [
  {
    section: 'OVERVIEW',
    items: [
      { href: '/dashboard', label: 'Dashboard',   icon: LayoutDashboard, num: '01' },
    ],
  },
  {
    section: 'PLATFORM',
    items: [
      { href: '/insurance',    label: 'Insurance',    icon: Shield,       num: '02' },
      { href: '/farms',        label: 'Farms',         icon: Map,          num: '03' },
      { href: '/cooperatives', label: 'Koperasi',      icon: Users,        num: '04' },
      { href: '/pools',        label: 'Yield Pools',   icon: Briefcase,    num: '05' },
      { href: '/market',       label: 'Market',         icon: BarChart3,    num: '06' },
    ],
  },
  {
    section: 'SYSTEM',
    items: [
      { href: '/admin',     label: 'Admin Center', icon: Settings,        num: '07' },
    ],
  },
]

export default function Sidebar() {
  const pathname  = usePathname()
  const { publicKey, connected } = useWallet()

  return (
    <aside className="w-[220px] shrink-0 border-r border-white/[0.05] bg-[#0A0F0A] flex flex-col sticky top-[52px] overflow-hidden z-30" style={{ height: 'calc(100vh - 52px)' }}>

      {/* ── Brand ─────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.05]">
        <Link href="/" className="flex items-center gap-2.5 mb-3 group">
          <div className="w-7 h-7 bg-emerald-500 rounded-[3px] grid place-items-center shrink-0">
            <Leaf size={14} className="text-black" />
          </div>
          <span className="font-display text-[19px] text-white tracking-tight leading-none">Nusa Harvest</span>
        </Link>
        <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-slate-600">
          AgroFi Protocol · Devnet Sim
        </p>
      </div>

      {/* ── Navigation ────────────────────────────── */}
      <nav className="flex-1 px-2.5 py-3 space-y-5 overflow-y-auto">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-slate-600 px-2 pb-1.5">
              {section}
            </p>
            {items.map(({ href, label, icon: Icon, num }) => {
              const active = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-2.5 px-2 py-[7px] rounded-[4px] text-[13px] transition-all duration-100 ${
                    active
                      ? 'bg-white text-[#030810] font-medium'
                      : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
                  }`}
                >
                  <span className={`font-mono text-[10px] w-[18px] ${active ? 'text-slate-500' : 'text-slate-600'}`}>
                    {num}
                  </span>
                  <Icon size={13} />
                  <span className="flex-1">{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* ── Deployed Contract Proof ───────────────── */}
      <div className="mx-2.5 mb-2 p-3 rounded-[4px] border border-emerald-900/50 bg-emerald-950/25">
        <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-emerald-600 mb-2">
          ✓ Deployed · Solana Devnet
        </p>
        <a
          href={`https://explorer.solana.com/address/${PROGRAM_ID_STR}?cluster=devnet`}
          target="_blank" rel="noreferrer"
          className="font-mono text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 transition-colors"
        >
          {PROGRAM_ID_STR.slice(0, 8)}…{PROGRAM_ID_STR.slice(-5)}
          <ExternalLink size={9} />
        </a>
        <a
          href={`https://explorer.solana.com/tx/${DEPLOY_TX_SIG}?cluster=devnet`}
          target="_blank" rel="noreferrer"
          className="font-mono text-[9px] text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors mt-1"
        >
          Slot #{DEPLOY_SLOT.toLocaleString()} <ExternalLink size={8} />
        </a>
      </div>

      {/* ── Wallet Footer ─────────────────────────── */}
      <div className="p-2.5 border-t border-white/[0.05]">
        {connected && publicKey ? (
          <div className="flex items-center gap-2.5 px-1.5 py-1.5">
            <div className="w-7 h-7 rounded-full bg-emerald-700/60 grid place-items-center font-mono text-[11px] text-white shrink-0">
              {publicKey.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10.5px] text-white truncate">
                {publicKey.slice(0, 6)}…{publicKey.slice(-4)}
              </p>
              <p className="font-mono text-[9px] text-emerald-400 flex items-center gap-1 mt-0.5">
                <Activity size={8} /> Connected
              </p>
            </div>
          </div>
        ) : (
          <ConnectWalletButton className="w-full py-2 rounded-[4px] font-mono text-[10.5px] uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all" />
        )}
      </div>
    </aside>
  )
}
