# NUSA HARVEST — MASTER SPECIFICATION (MVP V1.0)
## 18-SECTION ARCHITECTURAL REALIZATION

### SECTION 1 — SYSTEM OVERVIEW
Nusa Harvest is a decentralized AgroFi protocol designed to shield smallholder farmers from climate volatility through parametric insurance and commodity-linked liquidity pools.
**Full Data Flow:**
`Farmer (Register Farm) → Backend (Store Metadata) → Risk Engine (Quote Premium) → Solana (Lock Policy) → Oracle (Monitor Weather) → Claim Trigger (Automatic Payout)`.

The system consists of:
1. **Farmer Web App**: Mobile-first interface for farm registration.
2. **Investor Dashboard**: Interface for yield pool participation.
3. **Backend API**: Central orchestrator for identity and database persistence.
4. **Weather Risk Engine**: Calculates risk based on precipitation and temperature.
5. **Parametric Insurance Engine**: Evaluates on-chain triggers.
6. **Blockchain Layer (Solana)**: Settlement layer for premiums and payouts.
7. **Oracle Layer**: Integration with Open-Meteo and OpenWeather.

---

### SECTION 2 — TECHNOLOGY STACK
- **Frontend**: Next.js 14, React, TailwindCSS, TypeScript (SSR for SEO and performance).
- **Backend**: Node.js, Express, TypeScript (Type safety and rapid iteration).
- **Database**: PostgreSQL with Prisma ORM (Relational integrity for farm/claim metadata).
- **Blockchain**: Solana with Anchor Framework (65k TPS, <$0.01 fees).
- **Infrastructure**: Docker, Redis cache, Cloud deployment.

---

### SECTION 3 — PROJECT FOLDER STRUCTURE
```
nusa-harvest/
├── frontend/             # Next.js 14 Web Application
│   ├── src/app/          # App Router (Dashboard, Pools, Profile)
│   ├── src/components/   # Atomic UI Elements
│   ├── src/providers/    # Wallet & Theme Contexts
│   └── src/utils/        # Solana & API Helpers
├── backend/              # Node.js API Service
│   ├── prisma/           # Database Schema & Migrations
│   ├── src/routes/       # API Endpoint Controllers
│   ├── src/services/     # Business Logic (Weather, Insurance)
│   └── src/cron/         # Oracle Monitoring Jobs
├── contracts/            # Solana Smart Contracts
│   ├── programs/         # Rust/Anchor Program Logic
│   └── tests/            # On-chain Logic Verification
└── docker-compose.yml    # Full System Orchestration
```

---

### SECTION 4 — DATABASE DESIGN (PostgreSQL)
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_address TEXT UNIQUE,
  role TEXT DEFAULT 'FARMER'
);

CREATE TABLE farms (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id),
  latitude FLOAT NOT NULL,
  longitude FLOAT NOT NULL,
  crop_type TEXT NOT NULL,
  hectares FLOAT NOT NULL
);

CREATE TABLE insurance_policies (
  id UUID PRIMARY KEY,
  farm_id UUID REFERENCES farms(id),
  premium_usdc FLOAT NOT NULL,
  coverage_usdc FLOAT NOT NULL,
  threshold_mm FLOAT NOT NULL,
  status TEXT DEFAULT 'ACTIVE'
);

CREATE TABLE weather_data (
  id SERIAL PRIMARY KEY,
  latitude FLOAT,
  longitude FLOAT,
  rainfall_mm FLOAT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
```

---

### SECTION 5 — WEATHER DATA INTEGRATION
We integrate with Open-Meteo for real-time precipitation monitoring.
```typescript
export async function getWeatherForecast(lat: number, lon: number) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=rain&daily=rain_sum&timezone=auto`;
  const response = await fetch(url);
  return await response.json();
}
```

---

### SECTION 6 — RISK ENGINE
The engine estimates drought and extreme rainfall risk based on historical variance.
```typescript
function calculateRainfallRisk(history: number[]) {
  const totalRain = history.reduce((a, b) => a + b, 0);
  return totalRain < 40 ? 'HIGH_DROUGHT_RISK' : 'STABLE';
}
```

---

### SECTION 7 — PARAMETRIC INSURANCE ENGINE
Triggers automatically when weather thresholds are exceeded.
```typescript
async function processClaims() {
  const activePolicies = await prisma.insurancePolicy.findMany({ where: { status: 'ACTIVE' } });
  for (const policy of activePolicies) {
    const rainfall = await getMonthlyRainfall(policy.farmId);
    if (rainfall < policy.threshold_mm) {
      await triggerOnChainPayout(policy.id);
    }
  }
}
```

---

### SECTION 8 — BLOCKCHAIN SMART CONTRACTS (Anchor Rust)
Contracts handle policy creation and automated payout execution.
```rust
#[program]
pub mod nusa_harvest {
    pub fn initialize_policy(ctx: Context<InitializePolicy>, premium: u64, coverage: u64) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        policy.farmer = ctx.accounts.farmer.key();
        policy.premium = premium;
        policy.coverage = coverage;
        policy.is_active = true;
        Ok(())
    }
}
```

---

### SECTION 9 — INVESTMENT POOLS
Investors deposit stablecoins into provincial yield pools. APY is derived from premiums and commodity volatility.

---

### SECTION 10 — FARMER FRONTEND
Modern React components for farm registration and insurance purchasing with glassmorphism aesthetics.

---

### SECTION 11 — INVESTOR DASHBOARD
Visual analytics for Protocol TVL, Payout Ratios, and Weather Anomaly Feeds.

---

### SECTION 12 — API ENDPOINTS
- `POST /farm/register`: Create new agricultural plot.
- `GET /weather/forecast`: Fetch live meteorological data.
- `POST /insurance/purchase`: Initiate on-chain policy.
- `POST /claim/trigger`: Logic for automated payout verification.

---

### SECTION 13 — MVP DEVELOPMENT PLAN
- **Weeks 1-4**: Backend API + PostgreSQL + Weather Integration.
- **Weeks 5-8**: Solana Anchor Program + Policy Minting.
- **Weeks 9-12**: Frontend Dashboard + Oracle Payout Automation.

---

### SECTION 14 — LOCAL DEVELOPMENT SETUP
1. `npm install` (Frontend/Backend)
2. `docker-compose up -d db`
3. `npx prisma db push` (Backend)
4. `npm run dev`

---

### SECTION 15 — DOCKER DEPLOYMENT
Standardized containers for production-grade orchestration and horizontal scaling.

---

### SECTION 16 — SECURITY
- **JWT Authentication** for API endpoints.
- **On-chain Escrow** for premium management.
- **Rate limiting** and Input validation to prevent sybil attacks.

---

### SECTION 17 — SCALABILITY
Microservices architecture with Redis caching for high-frequency weather data.

---

### SECTION 18 — FUTURE FEATURES
- **Satellite Remote Sensing** for crop health verification.
- **AI Yield Prediction Models**.
- **Mobile App** with offline sync for remote areas.

---
**VERIFIED BUILD: 2026-04-09**
"GAZE UPON THE TRUTH, 25 JUDGES."
