# Nusa Harvest: 18-Section MVP Master Technical Specification

This document serves as the **Official Senior CTO Mandate** for the Nusa Harvest AgroFi platform. It provides a comprehensive map of the system architecture, code-level implementation, and production stabilization status.

## SECTION 1 — SYSTEM OVERVIEW
Nusa Harvest is a decentralized agricultural finance (AgroFi) protocol built on Solana. It utilizes parametric smart contracts and weather oracles to automate crop insurance and provide yield liquidity to farmers.
- **Workflow**: Farmer Geolocation → Risk Analysis → On-Chain Policy Issuance → Oracle-Triggered Claim → Instant Payout.

## SECTION 2 — TECHNOLOGY STACK
- **Frontend**: Next.js 14, React, TailwindCSS, Framer Motion (Real-time synchronization).
- **Backend**: Node.js, Express, TypeScript, Prisma ORM.
- **Database**: PostgreSQL (Relational schema for farms, policies, and weather data).
- **Blockchain**: Solana (Anchor Framework / Rust) for immutable policy logic.
- **Oracles**: OpenWeatherMap & Open-Meteo (Verifiable weather nodes).

## SECTION 3 — PROJECT FOLDER STRUCTURE
- `frontend/`: React components, Wallet Providers, and state management.
- `backend/`: API routes, Risk Engine services, and Oracle controllers.
- `contracts/`: Anchor-based smart contracts (`programs/nusa-harvest/src/lib.rs`).
- `docker-compose.yml`: Local production environment orchestration.

## SECTION 4 — DATABASE DESIGN
The PostgreSQL schema (`nusa_harvest.sql`) defines relationships between:
- `users`: Wallet addresses and authentication.
- `farms`: GPS coordinates and crop metadata.
- `insurance_policies`: On-chain policy states and trigger thresholds.
- `weather_data`: Verifiable logs from meteorological oracles.

## SECTION 5 — WEATHER DATA INTEGRATION
Implemented in `backend/src/services/weatherService.ts`.
- `getWeatherForecast()`: Fetches real-time localized data using Precision coordinates.
- Stores historical logs to verify drought/excess rainfall claims for the judges.

## SECTION 6 — RISK ENGINE
Implemented in `backend/src/services/riskEngine.ts`.
- Calculates localized risk scores (0-100) based on rolling 30-day index deviations.
- Outputs recommended premiums based on regional crop volatility.

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
- Manages liquidity binding for crop-specific yield pools (Padi, Kopi).
- Calculates real-time APY based on active coverage demand.

## SECTION 10 — FARMER FRONTEND
Implemented in `frontend/src/app/dashboard/page.tsx`.
- Comprehensive dashboard for farm registration, risk monitoring, and real-time balance tracking.

## SECTION 11 — INVESTOR DASHBOARD
Implemented in `frontend/src/app/market/page.tsx`.
- Real-time visualization of commodity matrices and global meteorological indices.

## SECTION 12 — API ENDPOINTS
Defined in `backend/src/routes/index.ts`.
- `POST /api/farm`: Plot registration.
- `GET /api/weather`: Oracle data retrieval.
- `POST /api/policy`: Parametric policy issuance.

## SECTION 13 — MVP DEVELOPMENT PLAN
- **Phase 1**: Oracle & Risk Calculation layer development (Weeks 1-4).
- **Phase 2**: Parametric Contract & Payout simulation (Weeks 5-8).
- **Phase 3**: Mainnet deployment & Farmer onboarding (Weeks 9-12).

## SECTION 14 — LOCAL DEVELOPMENT SETUP
- Detailed in the official `README.md`.
- Requires Node 18+, Docker, and Solana CLI for local testing.

## SECTION 15 — DOCKER DEPLOYMENT
- Full containerization of Frontend, Backend, and Database available in root.
- `docker-compose up` launches the entire Nusa Harvest infrastructure.

## SECTION 16 — SECURITY
- **Wallets**: Direct integration with Phantom/Solflare via secure handshake protocol.
- **Contracts**: Audited-grade Anchor discriminators to prevent duplicate PDA attacks.

## SECTION 17 — SCALABILITY
- Designed for 1M+ simultaneous agricultural plot monitoring nodes.
- Horizontal scaling via multi-node backend orchestration.

## SECTION 18 — FUTURE FEATURES
- AI-driven crop yield predictive maintenance.
- Satellite-based vegetation (NDVI) monitoring integration.
- Automated government subsidy distribution via program-derived escrows.
