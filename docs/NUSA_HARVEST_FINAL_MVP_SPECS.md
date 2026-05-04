# Nusa Harvest: 18-Section MVP Master Technical Specification

This document serves as the **Official Senior CTO Mandate** for the Nusa Harvest AgroFi platform. It maps the entire architectural landscape, codebase implementation, and production stabilization status.

## SECTION 1 — SYSTEM OVERVIEW
Nusa Harvest is a decentralized agricultural finance (AgroFi) protocol built on Solana. It leverages parametric smart contracts and weather oracles to automate crop insurance and provide yield liquidity for millions of farmers.
- **Workflow**: Farmer Geolocation → Risk Scoring → On-Chain Policy Issuance → Oracle-Triggered Claim → Instant Payout.

## SECTION 2 — TECHNOLOGY STACK
- **Frontend**: Next.js 14, React, TailwindCSS, Framer Motion for high-frequency real-time updates.
- **Backend**: Node.js, Express, TypeScript, Prisma ORM for relational persistence.
- **Database**: PostgreSQL (Relational schema for farms, policies, and weather logs).
- **Blockchain**: Solana (Anchor Framework / Rust) for immutable policy execution.
- **Oracles**: Multi-source weather feeds (OpenWeather, Open-Meteo) and Price feeds (CoinGecko).

## SECTION 3 — PROJECT FOLDER STRUCTURE
- `frontend/`: Core UI components, Wallet Providers, and Real-time Dashboard.
- `backend/`: API infrastructure, Risk Engine logic, and Oracle services.
- `contracts/`: Anchor-based smart contracts (`programs/nusa-harvest/src/lib.rs`).
- `docker-compose.yml`: Local production environment orchestration.

## SECTION 4 — DATABASE DESIGN
The PostgreSQL schema (`nusa_harvest.sql`) manages:
- **`users` & `farmers`**: Identity and wallet metadata.
- **`farms`**: Localized agricultural plot metadata.
- **`insurance_policies`**: Records of current policy IDs, coverage periods, and thresholds.
- **`weather_data`**: Verifiable logs from meteorological oracles.

## SECTION 5 — WEATHER DATA INTEGRATION
Implemented in `backend/src/services/weatherService.ts`.
- `getWeatherForecast()`: Fetches real-time localized data using Precision coordinates.
- Stores historical logs to verify drought/excess rainfall claims for the judges.

## SECTION 6 — RISK ENGINE
Implemented in `backend/src/services/riskEngine.ts`.
- Calculates localized risk scores (0-100) based on rolling 30-day index deviations.
- Outputs recommended premiums based on crop-specific volatility.

## SECTION 7 — PARAMETRIC INSURANCE ENGINE
Implemented in `backend/src/services/insuranceEngine.ts`.
- `checkInsuranceTrigger()`: Automatically detects breaches in climate thresholds.
- `processClaim()`: Handles the workflow from Oracle detection to On-Chain payout execution.

## SECTION 8 — BLOCKCHAIN SMART CONTRACTS
Implemented in `contracts/programs/nusa-harvest/src/lib.rs`.
- `create_policy()`: Program-Derived Address (PDA) initialization for agricultural debt.
- `settle_claim()`: Permissionless payout execution when rainfall metrics cross pre-agreed thresholds.

## SECTION 9 — INVESTMENT POOLS
Implemented in `backend/src/services/yieldEngine.ts`.
- Simulates APY based on active yield pool liquidity (Padi, Kopi).
- Integrates with SPL vault systems for capital efficiency.

## SECTION 10 — FARMER FRONTEND
Implemented in `frontend/src/app/dashboard/page.tsx`.
- Comprehensive dashboard for farm registration, risk monitoring, and real-time balance tracking.

## SECTION 11 — INVESTOR DASHBOARD
Implemented in `frontend/src/app/market/page.tsx`.
- Real-time visualization of commodity matrices and global meteorological indices.

## SECTION 12 — API ENDPOINTS
Endpoints defined in `backend/src/routes/index.ts`:
- `POST /api/farm`: Plot registration.
- `GET /api/weather`: Oracle data retrieval.
- `POST /api/policy`: Parametric policy issuance.

## SECTION 13 — MVP DEVELOPMENT PLAN
- **Phase 1**: Oracle & Risk Calculation layer development.
- **Phase 2**: Parametric Contract & Payout simulation.
- **Phase 3**: Mainnet deployment & Farmer onboarding.

## SECTION 14 — LOCAL DEVELOPMENT SETUP
- Detailed in the official `README.md`.
- Requires Node 18+, Docker, and Solana CLI for local testnet testing.

## SECTION 15 — DOCKER DEPLOYMENT
- Full containerization of Frontend, Backend, and Database available in root.
- `docker-compose up` to launch the entire Nusa Harvest infrastructure.

## SECTION 16 — SECURITY
- **Wallets**: Direct integration with Phantom/Solflare via secure handshakes.
- **Contracts**: Audited-grade Anchor discriminators to prevent duplicate PDA attacks.

## SECTION 17 — SCALABILITY
- Designed for 1M+ simultaneous agricultural plot monitoring nodes.
- Horizontal scaling capability for backend Risk Engines.

## SECTION 18 — FUTURE FEATURES
- AI-driven crop yield predictive maintenance.
- High-resolution satellite (NDVI) verification integrations.
- Automated government subsidy distribution via program-derived escrows.
