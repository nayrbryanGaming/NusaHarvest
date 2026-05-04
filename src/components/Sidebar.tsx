'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Shield, Briefcase, BarChart3,
  Settings, Map, Activity, ExternalLink, Leaf, Users
} from 'lucide-react'
import { useWallet } from '../providers/WalletProvider'
import { useLanguage } from '../contexts/LanguageContext'
import { PROGRAM_ID_STR, DEPLOY_TX_SIG, DEPLOY_SLOT } from '../utils/constants'

export default function Sidebar() {
  const pathname = usePathname()
  const { publicKey, connected } = useWallet()
  const { t } = useLanguage()

  const NAV = [
    {
      section: t('IKHTISAR', 'OVERVIEW'),
      items: [
        { href: '/dashboard', label: t('Dashboard', 'Dashboard'), icon: LayoutDashboard },
      ],
    },
    {
      section: t('PLATFORM', 'PLATFORM'),
      items: [
        { href: '/insurance',    label: t('Asuransi', 'Insurance'),    icon: Shield    },
        { href: '/farms',        label: t('Lahan', 'Farms'),           icon: Map       },
        { href: '/cooperatives', label: t('Koperasi', 'Cooperatives'), icon: Users     },
        { href: '/pools',        label: t('Yield Pools', 'Yield Pools'), icon: Briefcase },
        { href: '/market',       label: t('Pasar', 'Market'),          icon: BarChart3 },
      ],
    },
    {
      section: t('SISTEM', 'SYSTEM'),
      items: [
        { href: '/admin', label: t('Pusat Admin', 'Admin Center'), icon: Settings },
      ],
    },
  ]

  return (
    <aside className="w-[220px] shrink-0 border-r border-white/[0.05] bg-[#0A0F0A] flex flex-col sticky top-[52px] overflow-hidden z-30 h-[calc(100vh-52px)]">

      {/* Brand */}
      <div className="px-5 pt-5 pb-4 border-b border-white/[0.05]">
        <Link href="/" className="flex items-center gap-2.5 mb-3 group">
          <div className="w-7 h-7 bg-emerald-500 rounded-[3px] grid place-items-center shrink-0">
            <Leaf size={14} className="text-black" />
          </div>
          <span className="font-display text-[19px] text-white tracking-tight leading-none">Nusa Harvest</span>
        </Link>
        <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-slate-600">
          {t('AgroFi Lending · Devnet', 'AgroFi Lending · Devnet')}
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-3 space-y-5 overflow-y-auto">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <p className="font-mono text-[9.5px] tracking-[0.12em] uppercase text-slate-600 px-2 pb-1.5">
              {section}
            </p>
            {items.map(({ href, label, icon: Icon }) => {
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
                  <Icon size={13} />
                  <span className="flex-1">{label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>

      {/* Deployed Contract Proof */}
      <div className="mx-2.5 mb-2 p-3 rounded-[4px] border border-emerald-900/50 bg-emerald-950/25">
        <p className="font-mono text-[9px] tracking-[0.08em] uppercase text-emerald-600 mb-2">
          ✓ {t('Deployed · Solana Devnet', 'Deployed · Solana Devnet')}
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

      {/* Wallet Status */}
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
                <Activity size={8} /> {t('Terhubung', 'Connected')}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <div className="w-2 h-2 rounded-full bg-slate-600 shrink-0" />
            <p className="font-mono text-[10px] text-slate-600 uppercase tracking-wider">
              {t('Wallet tidak terhubung', 'Wallet not connected')}
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}
