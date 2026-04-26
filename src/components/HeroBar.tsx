'use client'

const ITEMS = [
  '🌾 PADI CIHERANG — Terlindungi',
  '☕ KOPI ROBUSTA — Terlindungi',
  '🌴 KELAPA SAWIT — Terlindungi',
  '⚡ PAYOUT < 2 JAM',
  '🔒 ANCHOR v0.30 AUDIT',
  '📡 BMKG REAL-TIME',
  '💵 SETTLEMENT USDC',
  '🔗 SOLANA DEVNET',
  '📈 APY POOL 12%',
  '🛡️ PARAMETRIC INSURANCE',
]

export default function HeroBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[60] h-9 bg-[#01040a] border-b border-emerald-900/40 overflow-hidden flex items-center">
      <div className="ticker-wrap">
        <div className="ticker-content">
          {[...ITEMS, ...ITEMS].map((item, i) => (
            <span key={i} className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/80">
              {item}
              <span className="mx-5 text-emerald-900/60">◆</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
