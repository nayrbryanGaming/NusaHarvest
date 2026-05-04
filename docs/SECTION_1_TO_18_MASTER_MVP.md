# Nusa Harvest: 18-Section MVP Master Specification

This document serves as the **Official Senior CTO Mandate** for the Nusa Harvest AgroFi platform. It provides a comprehensive map of the system architecture, code-level implementation, and production stabilization status.

## SECTION 1 — SYSTEM OVERVIEW
Nusa Harvest is a decentralized agricultural finance (AgroFi) protocol built on Solana. It utilizes parametric smart contracts and weather oracles to automate crop insurance and provide liquidity to farmers.
- **Data Flow**: Farmer (Frontend) → Risk Engine (Backend) → Insurance Policy (Smart Contract) → Climate Event (Oracle) → Automated Payout (Solana).

## SECTION 2 — TECHNOLOGY STACK
- **Frontend**: Next.js 14, React, TailwindCSS, Framer Motion (Real-time UI).
- **Backend**: Node.js, Express, TypeScript, Prisma ORM.
- **Database**: PostgreSQL (Relational schema for farms/policies).
- **Blockchain**: Solana (Anchor Framework / Rust) for immutable ledger.
- **Oracles**: OpenWeatherMap & Open-Meteo (Verifiable weather nodes).

## SECTION 3 — PROJECT FOLDER STRUCTURE
- `frontend/`: React components, state providers (Wallet/Sync).
- `backend/`: API routes, risk calculation services, weather integration.
- `contracts/`: Anchor-based Rust smart contracts (Policy/Vault/Pool).
- `docker-compose.yml`: Local production environment orchestration.

## SECTION 4 — DATABASE DESIGN
The PostgreSQL schema (`nusa_harvest.sql`) defines relationships between:
- `users`: Authentication & wallet binding.
- `farms`: Geolocation and crop metadata.
- `insurance_policies`: On-chain policy states and trigger thresholds.
- `weather_data`: Historical and real-time oracle logs.

## SECTION 5 — WEATHER DATA INTEGRATION
Implemented in `backend/src/services/weatherService.ts`.
- `getWeatherForecast()`: Fetches real-time localized data from OpenWeather API.
- `storeWeatherReading()`: Commits readings to the local oracle database for verification.

## SECTION 6 — RISK ENGINE
Implemented in `backend/src/services/riskEngine.ts`.
- Estimates drought and rainfall risk scores (0-100) based on rolling 30-day precipitation history vs. regional means.

## SECTION 7 — PARAMETRIC INSURANCE ENGINE
Implemented in `backend/src/services/insuranceEngine.ts`.
- `checkInsuranceTrigger()`: Evaluates if rainfall thresholds have been breached.
- `processClaim()`: Handles the workflow from breach detection to on-chain disbursement.

## SECTION 8 — BLOCKCHAIN SMART CONTRACTS
Implemented in `contracts/programs/nusa-harvest/src/lib.rs`.
- **Policy PDA**: Stores encrypted policy metadata on-chain.
- **Vault System**: Manages automated escrow and instant payout execution via SPL tokens.

## SECTION 9 — INVESTMENT POOLS
Implemented in `backend/src/services/yieldEngine.ts`.
- Manages liquidity binding of stablecoins to commodity pools (Padi, Kopi).
- Calculates real-time APY based on active coverage demand.

## SECTION 10 — FARMER FRONTEND
Implemented in `frontend/src/app/dashboard/page.tsx`.
- Dashboard for farm registration, risk monitoring, and policy management.

## SECTION 11 — INVESTOR DASHBOARD
Implemented in `frontend/src/app/market/page.tsx`.
- Real-time visualization of commodity price matrices and oracle indices.

## SECTION 12 — API ENDPOINTS
Defined in `backend/src/routes/index.ts`.
- `POST /api/farms`: Register agricultural plots.
- `GET /api/weather`: Fetch localized oracle data.
- `POST /api/insurance`: Issue parametric policies.

## SECTION 13 — MVP DEVELOPMENT PLAN
- **Phase 1**: Geolocation & Risk Analysis (Weeks 1-4).
- **Phase 2**: Parametric Trigger Logic (Weeks 5-8).
- **Phase 3**: On-Chain Settlement (Weeks 9-12).

## SECTION 14 — LOCAL DEVELOPMENT SETUP
- Detailed in `NUSA_HARVEST_MASTER_ARCH_PROD.md`.
- Requires Node 18+, Docker, and Solana CLI.

## SECTION 15 — DOCKER DEPLOYMENT
- Multi-container setup provided in `docker-compose.yml`.
- Includes PostgreSQL, Backend API, and Frontend web-server.

## SECTION 16 — SECURITY
- **Wallets**: Non-custodial Phantom/Solflare integration.
- **API**: JWT-based authentication for sensitive farm metadata.
- **Smart Contracts**: Anchor discriminators to prevent duplicate PDA initialization.

## SECTION 17 — SCALABILITY
- Utilizes Redis-based oracle caching to handle high-frequency requests from millions of viewers.
- Load-balancing via multi-node backend strategy.

## SECTION 18 — FUTURE FEATURES
- Satellite-based vegetation index (NDVI) monitoring.
- AI-driven crop yield prediction models.
- Government subsidy distribution via programmable SOL/USDC.
