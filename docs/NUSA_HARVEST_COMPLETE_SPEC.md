# NUSA HARVEST — CORE ARCHITECTURE & TECHNICAL SPECIFICATION (v2.0.0)

**The Decentralized AgroFi Protocol for Indonesia**

---

## 01 — SYSTEM OVERVIEW
Nusa Harvest is a complete vertical stack for agricultural financial infrastructure. It bridges the gap between decentralized finance (DeFi) and real-world agricultural risk.

**The Core Flow:**
1.  **Farmer Registration**: Farm Gps-tagging and crop profiling via the Mobile-Responsive Web App.
2.  **Risk Underwriting**: Backend Risk Engine (Section 6) calculates a personalized premium index based on historical climate variance.
3.  **On-Chain Policy**: A Solana policy account is initialized (Section 8), locking the coverage amount in the Commodity Yield Pool (Section 9).
4.  **Oracle Monitoring**: High-frequency meteorological feeds (Section 5) track precipitation and temperature SPI indices.
5.  **Parametric Trigger**: If the rainfall threshold (e.g., < 40mm/month) is breached, the Parametric Insurance Engine (Section 7) triggers an automatic on-chain payout.

---

## 02 — TECHNOLOGY STACK

-   **Frontend**: Next.js 14, TailwindCSS, Framer Motion, Solana Wallet Adapter.
-   **Backend**: Node.js (Express/TypeScript), Prisma ORM, Winston Logger.
-   **Database**: PostgreSQL (Relational integrity for Policies and Geospatial data).
-   **Blockchain**: Solana (Anchor Framework), SPL Token (USDC), Anchor PDAs.
-   **Infrastructure**: Docker Compose, Redis (Caching), Cron (Policy evaluation).
-   **Verification**: All data is backed by verifiable Oracle signatures (OpenWeather & Open-Meteo).

---

## 03 — PROJECT FOLDER STRUCTURE
```text
nusa-harvest/
├── frontend/               # Next.js Application (AgroFi Dashboard)
│   ├── src/app/            # App Router (Dashboard, Market, Pools)
│   ├── src/providers/      # Wallet & Protocol Contexts
│   └── src/components/     # Design System (Judicial Selectors, Charts)
├── backend/                # Primary API & Parametric Oracle Engine
│   ├── src/services/       # WeatherService, InsuranceEngine, RiskEngine
│   ├── src/cron/           # Automated Trigger Jobs
│   └── prisma/             # Schema & Migrations
├── contracts/              # Solana Programs (Anchor)
│   └── programs/insurance  # Rust Smart Contracts
└── docker-compose.yml      # Complete Local & Remote Environment
```

---

## 04 — DATABASE DESIGN (SCHEMA v2)
The database serves as the **Indexed Ledger of Record**, paralleling the on-chain state for high-speed indexing.
-   `User`: Identity and wallet mapping.
-   `Farm`: Geo-coordinates (Lat/Lon), crop types, and hectare-bps.
-   `InsurancePolicy`: Links Farm to on-chain Policy accounts.
-   `WeatherData`: The immutable history used for trigger calculations.
-   `Pool`: TVL and APY tracking for investors.

---

## 05 — WEATHER DATA INTEGRATION
**Source**: Open-Meteo (WMO-standard high-resolution meteorological data).
**Precision**: Hourly resolution for 25+ climate variables.
**Implementation**: `backend/src/services/weatherService.ts`.
-   `getWeatherForecast()`: Real-time acquisition of temperature and rain mm.
-   `calculateRainfallRisk()`: Algorithmic assessment of rolling 30-day precipitation.

---

## 06 — RISK ENGINE
**Logic**: Climate Volatility Indexing.
**Implementation**: `backend/src/risk/engine.service.ts`.
Calculates `riskScore` (0-1.0) by comparing current forecast to 10-year historical means. Premium is dynamically adjusted:
`Premium = Base_Rate (5%) + (Risk_Score * Coverage * 0.15)`.

---

## 07 — PARAMETRIC INSURANCE ENGINE
**Trigger**: Automated settlement on threshold breach.
**Rules**:
-   **Drought**: Precipitation < 40mm in 30 days.
-   **Flood**: Precipitation > 350mm in 7 days.
**Auto-Action**: Triggered by `cron/cronJobs.ts` every 08:00 WIB.

---

## 08 — SMART CONTRACTS (ANCHOR)
**Address**: `CgMn8QfThDQLkcghfP4A9AV3FTTECjSuZvf6Ngf1LiBx`
**Key Instructions**:
-   `create_policy`: Locks coverage from the pool vault.
-   `trigger_claim`: Transfers USDC to the farmer; requires Oracle signature.
-   `deposit/withdraw`: Liquidity management for Yield Pools.

---

## 09 — INVESTMENT POOLS
Investors provide capital (USDC) into specific "Tranches" (e.g., Rice Jawa, Coffee Lampung).
-   **Senior Tranche**: Lower APY, higher safety.
-   **Junior Tranche**: Higher APY, first to absorb insurance claims.

---

## 10 — FARMER FRONTEND
Mobile-first UI focused on simplicity and verification.
-   **Verification Badge**: "Verified Solana Node" status shown in real-time.
-   **Live Sync**: Wallet balances poll the `finalized` block every 2s.

---

## 11 — INVESTOR DASHBOARD
Visual TVL metrics pulled directly from the Solana RPC. 
-   **Yield Performance**: Real-time APY based on pool activity.
-   **Transparency Tracker**: Listing every on-chain claim paid.

---

## 12 — API ENDPOINTS (SWAGGER READY)
-   `GET /api/weather/forecast?lat={x}&lon={y}`
-   `POST /api/farm/register`
-   `POST /api/insurance/purchase`
-   `GET /api/pool/stats`

---

## 13 — MVP DEVELOPMENT PLAN
-   **Week 1-4**: Core Wallet Hub & Weather Integration. (DONE)
-   **Week 5-8**: Risk Engine & Database Relational Layer. (IN PROGRESS)
-   **Week 9-12**: Mainnet-ready Smart Contract Audit.

---

## 14 — LOCAL DEVELOPMENT SETUP
1.  Enable Docker.
2.  `cp .env.example .env` (Add Solana RPC URL).
3.  `docker-compose up -d`.
4.  `cd frontend && npm install && npm run dev`.

---

## 15 — DOCKER DEPLOYMENT
Unified environment ensuring the database, backend, and frontend communicate over a secure internal bridge.

---

## 16 — SECURITY
-   **Deep Disconnect**: Absolute purge of sensitive wallet session data.
-   **Rate Limiting**: Integrated at the API level (Express Limit).
-   **Audit Trail**: Every risk calculation is logged with a persistent timestamp.

---

## 17 — SCALABILITY
Supporting millions of farmers via a horizontal Microservices architecture and Redis-backed state management for weather caching.

---

## 18 — FUTURE FEATURES
-   **Satellite NDVI Integration**: AI-driven crop growth monitoring.
-   **Government Portal**: Direct subsidy payout integration.
-   **Mobile Push**: SMS alerts for irrigation requirements based on real-time weather.
