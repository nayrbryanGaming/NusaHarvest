# NusaHarvest

**Agricultural Lending, On-Chain.**

NusaHarvest is a DeFi yield pool lending protocol connecting global investors with Indonesian farmers, disbursed through Koperasi networks, with every fund flow recorded on-chain, secured by on-chain reserves and crop insurance, built on Solana.

**[Live Demo: nusaharvest.vercel.app](https://nusaharvest.vercel.app)** | **[Pitch Deck](https://canva.link/gb0w1lf3mop143k)**

---

## The Problem

| Problem | Data |
|---------|------|
| Extreme farmer poverty | 47.94% of Indonesian farmers live below the poverty line |
| No access to capital | 34.82% of farmers cannot access bank credit |
| No agricultural investment platform | 0 DeFi platforms specifically built for agricultural lending |

---

## The Solution

NusaHarvest provides two integrated products:

1. **Yield Pool Lending:** Investors deposit USDC into commodity-specific pools (rice, coffee, palm oil). 80% of funds are disbursed as farmer loans through Koperasi networks, 20% held as an on-chain reserve buffer. Every disbursement to farmers is recorded on-chain, publicly auditable and tamper-proof.
2. **Crop Insurance:** Farmers can purchase parametric crop insurance directly through the platform. Required for all borrowers; also available standalone for farmers seeking protection without a loan.

---

## Why Solana

| Property | How NusaHarvest Uses It |
|----------|------------------------|
| Sub-cent transaction fees | Enables micro-disbursements to individual farmers at scale |
| On-chain transparency | Every loan disbursement is publicly auditable in real time |
| Programmable escrow | Smart contracts enforce pool rules without banks or lawyers |
| USDC stablecoin support | Removes crypto volatility risk for farmers and investors |
| High throughput | Supports concurrent active policies across thousands of farmers |

---

## How It Works

```
Investor -> Yield Pool -> Koperasi -> Farmer
                |               |
        On-chain Reserve    On-chain Record
        Crop Insurance      (every disbursement)
        (required for all borrowers)
```

---

## 3-Layer Safety Net

| Layer | Mechanism | Response Time |
|-------|-----------|---------------|
| Layer 1: On-chain Reserve Fund | 20% of TVL allocated as emergency buffer | T+0, automatic |
| Layer 2: Mandatory Crop Insurance | Every borrower must hold an active crop insurance policy | T+0, automatic |
| Layer 3: ASKRINDO KUR Guarantee | Government-backed credit guarantee institution (Indonesia) | T+ days |

---

## Revenue Streams

| Stream | Mechanism | Rate |
|--------|-----------|------|
| Protocol Fee | Per deposit / withdrawal on yield pool | 2.5% |
| Insurance Admin Fee | Per insurance policy issued | 15% of premium |
| On-chain Fund Yield | Idle reserve deployed to low-risk DeFi protocols | ~5% APY |
| Lending Spread | Interest on farmer loans | 6% (5% to investors, 1% to platform) |

### Pilot Projection: Worst Case (5 Koperasi, 100 Farmers, Rice, West Java)

| Parameter | Value |
|-----------|-------|
| Koperasi | 5 x 20 farmers |
| Investor pool | 70 investors x $700 = $49,000 |
| Funds disbursed (80%) | $39,200 |
| **Annual revenue** | **$2,173.26 / Rp 35.4 million** |

---

## Market Opportunity

| Segment | Value |
|---------|-------|
| **TAM** | Rp 571 Trillion: total agricultural, forestry, and fishery credit market |
| **SAM** | Rp 42.7 Trillion: total KUR (subsidized micro-credit) disbursed to farmers |
| **SOM** | Rp 10 Trillion: initial addressable target market |

---

## What's Built

| Component | Status |
|-----------|--------|
| Frontend (Next.js Web3 DApp) | Live at nusaharvest.vercel.app |
| Solana smart contracts (Anchor) | In development on devnet |
| Yield pool logic | In development |
| Koperasi onboarding flow | In development |

---

## Roadmap

```
Q1-Q2 2026              Q3-Q4 2026            Q4 2026+
      |                       |                    |
 Pilot: 1 Koperasi  ->  5 Koperasi  ->  50 Koperasi
 (rice, W. Java)       (rice, W. Java)    + coffee, cocoa
```

---

## Team

| Name | Role |
|------|------|
| **Raisha Al Fadhila Putri** | Digital Business, Web3 Development |
| **Vincentius Bryan Kwandou** | Scalable Digital Solutions |
| **Azmi Maulana** | Infrastructure and Scaling |
| **Evander Franklin** | Ex Digital Agency CCO, 4 Years DeFi Experience |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Solana |
| Smart Contract | Anchor Framework |
| Frontend | Next.js Web3 DApp |
| Distribution | Koperasi networks (last-mile farmer onboarding) |

---

## Disclaimer

> *"This is not an investment. This is an InvesNATION."*

NusaHarvest is currently in the ideation and pilot stage. All revenue projections are conservative estimates based on BPS statistics and ground-level conditions of agricultural cooperatives in West Java.

---

*Built for Indonesia's 73 million farmers. March 2026*
