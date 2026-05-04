# NUSA HARVEST — TECHNICAL SPECIFICATION (MVP 2026)

**Role**: Senior CTO & Architect  
**Project**: Nusa Harvest AgroFi Protocol  
**Status**: Production Stabilization Phase

---

## SECTION 1 — SYSTEM OVERVIEW

Nusa Harvest is a decentralized agricultural finance (AgroFi) infrastructure designed to mitigate climate risks for Indonesian farmers while providing transparent yield opportunities for investors.

### Flow Architecture
1. **Farmer Registration**: Farmer inputs location (GPS), crop type, and historical yield.
2. **Risk Assessment**: Weather Risk Engine fetches historical and forecast data for the specific GPS coordinates.
3. **Policy Issuance**: A parametric insurance policy is minted on the Solana blockchain as a state account.
4. **Liquidity Provision**: Investors deposit USDC into commodity-linked yield pools (e.g., Rice Pool JT).
5. **Oracle Monitoring**: Real-time weather oracles (BMKG / OpenWeather) monitor for trigger events (e.g., Rainfall < 40mm in 30 days).
6. **Automatic Payout**: If a trigger is met, the Smart Contract executes an instant payout to the Farmer's wallet without manual claims.

---

## SECTION 2 — TECHNOLOGY STACK

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js 14, TailwindCSS, Framer Motion | High-performance, SEO-optimized, and premium animations. |
| **Backend** | Node.js (Express/NestJS), TypeScript | Scalable event-driven architecture for oracle monitoring. |
| **Database** | PostgreSQL (Prisma ORM) | Relational data for complex farm-client relationships. |
| **Blockchain** | Solana (Anchor Framework) | High TPS and low fees, critical for micro-insurance payouts. |
| **Oracles** | Open-Meteo & BMKG | Redundant climate data sources for trigger verification. |
| **Cache** | Redis | Storing transient weather forecasts and session metadata. |

---

## SECTION 3 — PROJECT FOLDER STRUCTURE

```
nusa-harvest/
├── frontend/             # Next.js Application
│   ├── src/
│   │   ├── app/          # App Router (Dashboard, Pools, Market)
│   │   ├── components/   # UI System (Navbar, Cards, Charts)
│   │   ├── providers/    # Wallet & Theme Context
│   │   └── utils/        # Solana & API Helpers
├── backend/              # Node.js API Service
│   ├── src/
│   │   ├── controllers/  # API Handlers
│   │   ├── services/     # Risk Engine & Oracle Logic
│   │   └── prisma/       # Database Schema & Client
├── contracts/            # Solana Smart Contracts
│   ├── programs/         # Anchor Rust Source
│   └── tests/            # TypeScript Integration Tests
└── infrastructure/       # Deployment Config
    ├── docker/           # Containerization
    └── scripts/          # Migration & Seeders
```

---

## SECTION 4 — DATABASE DESIGN

### Schema Overview (PostgreSQL)

- **`users`**: Auth data, Wallet Address, Role (Farmer/Investor).
- **`farms`**: GPS Coords, Soil Health, Crop Historicals, Owner ID.
- **`policies`**: Link to Solana Account, Premium Paid, Trigger Threshold, Status.
- **`weather_logs`**: Cached historical rainfall/temp data per region.
- **`investments`**: Investor ID, Pool ID, Amount, APY Snapshots.

---

## SECTION 5 — WEATHER DATA INTEGRATION

The system uses a multi-tier oracle strategy:
1. **Primary**: Open-Meteo API for real-time 10-minute resolution data.
2. **Secondary**: BMKG (Badan Meteorologi, Klimatologi, dan Geofisika) for historical seasonal validation.
3. **Logic**: `fetchWeather(lat, lon)` stores data in `weather_logs` and triggers an evaluation if rainfall deviates by >30% from 5-year averages.

---

## SECTION 6 — RISK ENGINE

**Climate Risk Score (CRS)** calculation:
$CRS = (RainfallVolatility \times 0.6) + (TempAnomaly \times 0.4)$

If $CRS > 0.8$, the insurance premium is adjusted upward, or coverage is dynamically capped to protect the Liquidity Pool.

---

## SECTION 7 — PARAMETRIC INSURANCE ENGINE

Unlike traditional insurance, **Parametric Insurance** triggers on data, not damage.
- **Trigger**: Rainfall < 40mm in the last 30 days (Drought) OR Rainfall > 400mm (Flooding).
- **Settlement**: Instant SOL/USDC transfer from the Pool Address to the Farmer.

---

## SECTION 8 — BLOCKCHAIN SMART CONTRACTS (SOLANA)

The program (written in Anchor/Rust) manages:
- **`PolicyAccount`**: Stores farmer pubkey, expiry date, and coverage amount.
- **`PoolAccount`**: Global vault for investor funds.
- **`Instruction: finalize_claim`**: Can only be called by the Authorized Oracle Service.

---

## SECTION 9 — INVESTMENT POOLS

Investors provide the "Capital Buffer".
- **Pool Type**: Commodity-Linked (e.g., "Lampung Coffee Pool").
- **Yield**: Derived from insurance premiums + interest from idle USDC lending.

---

## SECTION 10 — FARMER FRONTEND
- **Features**: 1-Click Farm Registration (GPS-based), Real-time weather alerts, Insurance status tracking.

## SECTION 11 — INVESTOR DASHBOARD
- **Features**: TVL Monitoring, APY History, Risk exposure across regions (Jawa, Sumatra, Sulawesi).

---

## SECTION 12 — API ENDPOINTS

- `POST /api/farms/register`
- `GET /api/weather/forecast/:lat/:lon`
- `POST /api/insurance/purchase`
- `GET /api/invest/pools`

---

## SECTION 13 — MVP DEVELOPMENT PLAN (12 WEEKS)

- **Weeks 1-4**: Core Wallet & On-chain Policy Minting.
- **Weeks 5-8**: Oracle Integration & Risk Engine V1.
- **Weeks 9-12**: Investor Dashboard & Mobile PWA Optimization.

---

## SECTION 14 — LOCAL DEVELOPMENT SETUP

1. `solana-test-validator`
2. `anchor build & anchor deploy`
3. `npm install` in frontend & backend.
4. `prisma migrate dev`

---

## SECTION 15 — DOCKER DEPLOYMENT
- Multi-stage builds for Next.js and Node.js.
- Standard PostgreSQL container with persistence.

---

## SECTION 16 — SECURITY

- **Non-Custodial**: Users always hold their keys.
- **Oracle Guard**: 2/3 Multi-sig for finalizing insurance triggers.
- **Rate Limiting**: Protection against API flooding.

---

## SECTION 17 — SCALABILITY
- Horizonatal scaling via Kubernetes (K8s).
- RPC Load balancing (Helius/Alchemy).

---

## SECTION 18 — FUTURE FEATURES
- Satellite imagery crop monitoring (sentinel-2 integration).
- AI-driven pest prediction models.
- Government subsidy wallet integration.
