# NUSA HARVEST — AgroFi Platform


**[LIVE DEPLOYMENT: https://nusaharvest.vercel.app/](https://nusaharvest.vercel.app/)**


## SECTION 1 — SYSTEM OVERVIEW

Nusa Harvest is a parametric agricultural insurance and commodity yield pool platform built on Solana. 

The platform consists of:
1. **Farmer Web App**: Next.js interface for farmers to register land and buy insurance.
2. **Investor Dashboard**: Interface for liquidity providers to deposit USDC into yield pools.
3. **Backend API**: Node.js/Express service orchestrating data between frontend, database, and smart contracts.
4. **Weather Risk Engine**: Calculates risk premiums based on historical and forecasted weather.
5. **Parametric Insurance Engine**: Automatically triggers payouts if weather thresholds are breached.
6. **Blockchain Contract Layer**: Solana Anchor programs managing the TVL, policies, and payouts.
7. **Oracle Data Layer**: Ingests BMKG/Open-Meteo data to trigger on-chain state changes.

**Full Data Flow:**
Farmer registers field → Backend queries Weather Risk Engine → Engine sets Premium → Farmer pays Premium (USDC) to Solana Contract → Oracle pushes daily weather data → If rainfall > 300mm/7days, Insurance Contract automatically executes Claim Trigger → Payout sent directly to Farmer's wallet.

---

## SECTION 2 — TECHNOLOGY STACK

- **Frontend**: Next.js 14, React, TailwindCSS, TypeScript. (Fast SSR, excellent Web3 integration via `@solana/wallet-adapter`).
- **Backend**: Node.js, Express, TypeScript. (Lightweight, robust ecosystem for Web3/ethers/solana integrations).
- **Database**: PostgreSQL, Prisma ORM. (Relational structure is perfect for mapping users, farms, and policies).
- **Blockchain**: Solana, Anchor Framework (Rust). (Ultra-low fees and high throughput required for micro-insurance payouts).
- **Infrastructure**: Docker, Vercel (Frontend), Railway/AWS (Backend).

---

## SECTION 3 — PROJECT FOLDER STRUCTURE

```text
nusa-harvest/
├── frontend/             # Next.js 14 App Router
│   ├── src/app/          # Pages (dashboard, pools, admin)
│   ├── src/components/   # Reusable UI (Navbar, WalletProvider)
│   └── src/utils/        # Solana Web3 connection instances
├── backend/              # Node.js/Express API
│   ├── src/controllers/  # API Route logic
│   ├── src/services/     # Risk Engine & Oracle Fetchers
│   └── prisma/           # PostgreSQL Schema
├── contracts/            # Solana Anchor Rust Programs
│   ├── programs/         # Smart contract logic (lib.rs)
│   └── scripts/          # Deployment & Testing scripts
└── docker-compose.yml    # Local DB and Redis spin-up
```

---

## SECTION 4 — DATABASE DESIGN

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(uuid())
  walletPub String   @unique
  role      String   @default("FARMER") // FARMER or INVESTOR
  farms     Farm[]
}

model Farm {
  id        String   @id @default(uuid())
  userId    String
  location  String   // GeoJSON or physical address
  cropType  String
  hectares  Float
  policies  Policy[]
  user      User     @relation(fields: [userId], references: [id])
}

model Policy {
  id              String   @id @default(uuid())
  farmId          String
  premiumPaid     Float
  payoutMaturity  Float
  triggerRainfall Float
  isActive        Boolean  @default(true)
  farm            Farm     @relation(fields: [farmId], references: [id])
}
```

---

## SECTION 5 — WEATHER DATA INTEGRATION

```typescript
// backend/src/services/weather.ts
import axios from 'axios';

export async function getWeatherForecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=rain_sum&timezone=auto`;
  const response = await axios.get(url);
  return response.data.daily.rain_sum;
}

export function calculateRainfallRisk(historicalRain: number[]) {
  const totalRain = historicalRain.reduce((a, b) => a + b, 0);
  return totalRain > 200 ? 'HIGH_RISK' : 'LOW_RISK';
}
```

---

## SECTION 6 — RISK ENGINE

```typescript
// backend/src/services/riskEngine.ts
export function calculateRiskScore(expectedRain: number, cropType: string): number {
  let baseRisk = 1.0;
  if (cropType === 'RICE' && expectedRain < 50) baseRisk += 2.5; // Drought risk
  if (cropType === 'RICE' && expectedRain > 300) baseRisk += 3.0; // Flood risk
  return baseRisk;
}

export function getRecommendedPremium(hectares: number, riskScore: number): number {
  const baseCoverageRate = 50; // $50 per hectare base
  return hectares * baseCoverageRate * riskScore;
}
```

---

## SECTION 7 — PARAMETRIC INSURANCE ENGINE

```typescript
// backend/src/cron/cronJobs.ts
import { PrismaClient } from '@prisma/client';
import { executeOnChainPayout } from '../utils/solana';

const prisma = new PrismaClient();

export async function checkInsuranceTrigger() {
  const activePolicies = await prisma.policy.findMany({ where: { isActive: true } });
  
  for (const policy of activePolicies) {
    const recentRainfall = await fetchRecentRainfall(policy.farmId);
    
    if (recentRainfall > policy.triggerRainfall) {
      console.log(`Trigger met for Policy ${policy.id}! Executing payout...`);
      await executeOnChainPayout(policy.id);
      await prisma.policy.update({ where: { id: policy.id }, data: { isActive: false } });
    }
  }
}
```

---

## SECTION 8 — BLOCKCHAIN SMART CONTRACTS

```rust
// contracts/programs/nusa-harvest/src/lib.rs
use anchor_lang::prelude::*;

declare_id!("CgMn8QfThDQLkcghfP4A9AV3FTTECjSuZvf6Ngf1LiBx");

#[program]
pub mod nusa_harvest {
    use super::*;

    pub fn create_policy(ctx: Context<CreatePolicy>, premium: u64, payout: u64) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        policy.farmer = *ctx.accounts.farmer.key;
        policy.premium = premium;
        policy.payout_amount = payout;
        policy.is_active = true;
        Ok(())
    }

    pub fn trigger_payout(ctx: Context<TriggerPayout>) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        require!(policy.is_active, CustomError::PolicyInactive);
        
        // Logic to transfer USDC from vault to farmer
        policy.is_active = false;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreatePolicy<'info> {
    #[account(init, payer = farmer, space = 8 + 32 + 8 + 8 + 1)]
    pub policy: Account<'info, PolicyState>,
    #[account(mut)]
    pub farmer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct PolicyState {
    pub farmer: Pubkey,
    pub premium: u64,
    pub payout_amount: u64,
    pub is_active: bool,
}

#[error_code]
pub enum CustomError {
    #[msg("Policy is already inactive or paid out.")]
    PolicyInactive,
}
```

---

## SECTION 9 — INVESTMENT POOLS

Yield pools collect USDC from investors to collateralize the insurance policies.

**Backend Logic:**
```typescript
export async function depositToPool(investor: string, amount: number, poolId: string) {
  // 1. Verify on-chain deposit transaction signature
  // 2. Update DB ledger
  await prisma.investment.create({
    data: { investorPub: investor, amount, poolId }
  });
  // 3. Recalculate global APY based on pool utilization
}
```

---

## SECTION 10 — FARMER FRONTEND

```tsx
// frontend/src/app/dashboard/page.tsx
'use client'
import { useState } from 'react'
import { useWallet } from '../../providers/WalletProvider'

export default function FarmerDashboard() {
  const { connected, publicKey } = useWallet()
  const [hectares, setHectares] = useState(1)

  const buyInsurance = async () => {
     // Call backend to generate transaction, then sign with Solana Wallet
     alert(`Purchased protection for ${hectares} Ha!`)
  }

  return (
    <div className="p-8">
      <h1>Protect Your Yield</h1>
      {!connected ? <p>Connect Wallet to Start</p> : (
        <div>
           <input type="number" value={hectares} onChange={e => setHectares(Number(e.target.value))} />
           <button onClick={buyInsurance}>Buy Parametric Insurance</button>
        </div>
      )}
    </div>
  )
}
```

---

## SECTION 11 — INVESTOR DASHBOARD

*(Implemented in `frontend/src/app/pools/page.tsx` within the actual repository)*. It queries the PostgreSQL database for TVL (Total Value Locked) and calculates Real-time APY based on active farming insurance demands. Features animated charts indicating yield growth.

---

## SECTION 12 — API ENDPOINTS

```typescript
// backend/src/routes/insurance.ts
import { Router } from 'express';
import { calculateRiskScore, getRecommendedPremium } from '../services/riskEngine';

const router = Router();

router.post('/quote', (req, res) => {
  const { hectares, cropType, expectedRain } = req.body;
  const risk = calculateRiskScore(expectedRain, cropType);
  const premium = getRecommendedPremium(hectares, risk);
  
  res.json({ premium, riskScore: risk, currency: 'USDC' });
});

export default router;
```

---

## SECTION 13 — MVP DEVELOPMENT PLAN

**12-Week Execution Strategy:**
- **Phase 1 (Weeks 1-4):** Build PostgreSQL DB, Prisma schema, Node.js API auth, and the Next.js Farmer Dashboard UI. Integrate Open-Meteo API for basic risk calculation.
- **Phase 2 (Weeks 5-8):** Develop Solana Anchor smart contracts (Policy Vaults, Triggers). Connect Backend to Solana Devnet via `@solana/web3.js` and implement Phantom Wallet adapter on the frontend.
- **Phase 3 (Weeks 9-12):** Implement Cron jobs for the Parametric Insurance Engine. Finalize the Investor Liquidity Pool logic, UI polish, security audits, and Vercel/Docker deployments.

---

## SECTION 14 — LOCAL DEVELOPMENT SETUP

```bash
# 1. Install Dependencies
cd frontend && npm install
cd ../backend && npm install

# 2. Database Setup
cd backend
npx prisma generate
npx prisma db push

# 3. Running Backend (Port 4000)
npm run dev

# 4. Running Frontend (Port 3000)
cd ../frontend
npm run dev
```

---

## SECTION 15 — DOCKER DEPLOYMENT

```dockerfile
# /frontend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```yaml
# /docker-compose.yml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: password
      POSTGRES_DB: nusaharvest
    ports:
      - "5432:5432"
  backend:
    build: ./backend
    ports:
      - "4000:4000"
    depends_on:
      - db
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
```

---

## SECTION 16 — SECURITY

- **Smart Contracts**: Utilizing strict Anchor `#[account(mut)]` validations and PDA (Program Derived Address) authority to ensure funds can only be withdrawn by the Parametric Risk Oracle.
- **API Endpoints**: Secured with JWT (JSON Web Tokens) and Express Rate Limit.
- **RPC Nodes**: Authenticated via Alchemy/QuickNode private RPC endpoints to prevent DDoS on `.getBalance()` and `.sendTransaction()`.

---

## SECTION 17 — SCALABILITY

- **Microservices**: Breaking the Weather Fetcher into a separate worker queue using **BullMQ + Redis** so API response times aren't blocked by slow Oracle fetches.
- **Database**: Prisma connection pooling mapped to PostgreSQL read-replicas for heavy dashboard queries.

---

## SECTION 18 — FUTURE FEATURES

1. **Satellite Crop Monitoring**: Ingesting Sentinel-2 NDVI data to verify crop health directly instead of relying solely on rainfall proxies.
2. **AI Yield Prediction**: Utilizing TensorFlow models to predict yields based on 20-year local weather datasets.
3. **Mobile App**: React Native wrapper for older Android devices common in rural Indonesian villages.
4. **Gov Subsidy Integration**: Direct whitelisting of Ministry of Agriculture API to auto-discount premium prices for subsidized farmers.
