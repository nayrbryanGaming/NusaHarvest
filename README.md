# NusaHarvest — AgroFi Protocol

> Parametric crop insurance and yield pool lending on Solana, built for 73 million Indonesian farmers.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-nusaharvest.vercel.app-brightgreen)](https://nusaharvest.vercel.app)
[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-9945FF)](https://explorer.solana.com/address/3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt?cluster=devnet)
[![Anchor](https://img.shields.io/badge/Anchor-v0.30-blue)](https://anchor-lang.com)
[![Built for Colosseum Frontier 2026](https://img.shields.io/badge/Hackathon-Colosseum%20Frontier%202026-orange)](https://colosseum.org)

---

## The Problem

**47.94% of Indonesian farmers live below the poverty line.** They face:
- Annual crop losses from drought — no financial safety net
- No access to DeFi or traditional credit markets  
- Insurance products that take weeks to pay out, with manual verification prone to fraud
- 34.82% unbanked — cannot participate in traditional finance

*Source: BPS 2025, UGM Agricultural Research 2026*

---

## The Solution

NusaHarvest is a two-product DeFi protocol on Solana:

### 1. Parametric Crop Insurance
- Farmer pays a micro-premium ($1.25 USDC for 1 hectare with 50% pool subsidy)
- Oracle monitors real rainfall data (Open-Meteo devnet / BMKG mainnet)
- Smart contract auto-triggers USDC payout when rainfall < threshold
- **Target settlement: under 6 hours. No manual claims. No human verification.**

### 2. Yield Pool Lending
- Investors deposit USDC → 80% disbursed as farmer loans via Koperasi networks
- 20% held as on-chain reserve buffer
- Investors earn 5% APY; treasury earns 1% lending spread
- Every disbursement is publicly auditable on-chain

---

## Live Demo

**Frontend:** https://nusaharvest.vercel.app

**Demo Flow (Hackathon Judges):**
1. Open the app → Connect wallet (Phantom devnet)
2. Go to **Farmer Dashboard** → Click "Demo: Aktifkan Proteksi" to activate a mock policy
3. Scroll to **Demo Klaim Parametrik** → Click "Simulasi Kekeringan & Payout Otomatis"
4. Watch the full flow: Drought Detected → Oracle Verified → Claim Triggered → USDC Disbursed
5. View **Yield Pools** to see TVL and staking interface
6. View **Market Data** for live SOL/USDC/commodity price feeds

---

## Deployed Programs (Solana Devnet)

| Contract | Program ID | Explorer |
|----------|-----------|---------|
| **NusaHarvest Pool** (yield lending) | `3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt` | [View ↗](https://explorer.solana.com/address/3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt?cluster=devnet) |
| **NusaHarvest Insurance** (parametric) | `H6snTB1Akud3SLgZTvg7mdTojVEVRuYEZR8KHYRStKsh` | [View ↗](https://explorer.solana.com/address/H6snTB1Akud3SLgZTvg7mdTojVEVRuYEZR8KHYRStKsh?cluster=devnet) |
| **NusaHarvest Vault** (multisig treasury) | `ErGh9gyqBxmrxv7h5ETUzk88ig2dtvc9heCk1dasJhTC` | [View ↗](https://explorer.solana.com/address/ErGh9gyqBxmrxv7h5ETUzk88ig2dtvc9heCk1dasJhTC?cluster=devnet) |

**Deploy Transaction:** [`3VHuq1ZN...V3sLmTY`](https://explorer.solana.com/tx/3VHuq1ZNjeAdJT7vCKLpeQXoNfwHUVpqCmVUtHQRpvevwLGw6xCPVrHbXHBusj1ZQkyLzUx2oxsum6xTkV3sLmTY?cluster=devnet)  
**Deploy Slot:** #458,157,863 · **Deploy Date:** 2026-04-26  
**Deploy Authority:** `35z7X59r...NxFzr`

---

## Architecture

```
Investor (USDC)
     │
     ▼
[Pool Contract · 3E4wxrT2...]
  ├── 97.5% net → Pool Vault (PDA)
  │     ├── 80% lendable → Koperasi → Farmer (loan)
  │     └── 20% reserve (on-chain, cannot be spent)
  └── 2.5% fee → Treasury (ETcQvsQe...)

Farmer
     │ pays micro-premium
     ▼
[Insurance Contract · H6snTB1A...]
  ├── 85% → Insurance Reserve (PDA)
  └── 15% → Treasury
        │
        ├── oracle: update_weather_data [admin-only]
        └── oracle breach → trigger_claim [admin-only]
               └── → USDC auto-sent to farmer_usdc (verified via constraint)

[Vault Contract · ErGh9gyq...]
  ├── authorized_signers: Vec<Pubkey> (max 5)
  ├── small withdrawal: 1-of-N authorized signer
  └── large withdrawal (>10% balance): 2-of-3 multisig
```

---

## Security Design (Audit-Ready)

Hardened after internal security review before this submission:

| Vulnerability | Fix Applied |
|--------------|-------------|
| `update_weather_data` callable by anyone | Fixed: `has_one = admin` via `InsuranceState` PDA |
| `farmer_usdc` payout can be redirected | Fixed: `constraint = farmer_usdc.owner == policy.farmer` |
| `insurance_reserve` not bound to program state | Fixed: stored in `InsuranceState.reserve_account`, verified at runtime |
| `trigger_claim` accepts stale weather data | Fixed: `MAX_WEATHER_DATA_AGE_SECONDS = 7 days` check |
| `repay_loan` uses `saturating_sub` (silent underflow) | Fixed: `checked_sub` with `MathOverflow` error |
| Pool token accounts unconstrained | Fixed: `owner == pool_state.key()` and `owner == pool_state.treasury` |
| Frontend PDA derivation missing farmer pubkey | Fixed: `[b"policy", farmer.toBuffer(), policy_id]` |

**Planned:** External audit with OtterSec / Sec3 after Colosseum (funded from prize pool).

---

## Revenue Streams

| Stream | Rate | Beneficiary |
|--------|------|-------------|
| Protocol Deposit Fee | 2.5% | Treasury |
| Protocol Withdrawal Fee | 2.5% | Treasury |
| Insurance Admin Fee | 15% of premium | Treasury |
| Lending Spread | 1% APY | Treasury |
| Investor Yield | 5% APY target | Pool Investors |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana (Devnet) |
| Smart Contracts | Anchor v0.30 (Rust) — 3 programs |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS |
| Wallets | Phantom, Solflare, Backpack |
| Weather Oracle (Devnet) | Open-Meteo API (admin-fed) |
| Weather Oracle (Mainnet) | Switchboard + BMKG integration |
| Price Feeds | CoinGecko API + Pyth Network |
| Settlement Asset | USDC (SPL Token, 6 decimals) |
| Deployment | Vercel (frontend) + Solana Devnet (contracts) |

---

## Run Locally

```bash
# Prerequisites: Node.js 20+, Rust, Solana CLI, Anchor CLI

git clone https://github.com/nayrbryanGaming/NusaHarvest
cd NusaHarvest

# Install and run frontend
npm install
cp .env.example .env.local
npm run dev
# → http://localhost:3000

# Build smart contracts (Anchor 0.30+)
anchor build

# Deploy to devnet (requires funded keypair)
anchor deploy --provider.cluster devnet
```

---

## Team

| Name | Role |
|------|------|
| Vincentius Bryan Kwandou | Lead Developer — Smart Contracts, Frontend, Architecture |
| Raisha Al Fadhila Putri | Product Strategy, Digital Business |

---

## Roadmap

| Phase | Timeline | Milestone |
|-------|----------|-----------|
| Hackathon MVP | Q2 2026 | 3 Anchor programs on devnet, parametric demo, yield pools UI |
| Pilot | Q3 2026 | 1 Koperasi partner, 50 farmers, rice crop, Central Java |
| Scale | Q4 2026 | 5 Koperasi, 500 farmers, +coffee & cocoa coverage |
| Mainnet | Q1 2027 | Post-audit mainnet, TVL from DeFi investors, BMKG oracle live |

---

## Disclaimer

NusaHarvest is deployed on Solana **devnet**. All balances shown are devnet test tokens. No real funds at risk. Mainnet deployment follows post-Colosseum security audit.

Built for **Colosseum Frontier 2026 Hackathon** — DeFi / RWA track.
