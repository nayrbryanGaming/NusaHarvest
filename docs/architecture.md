# NusaHarvest System Architecture

## Smart Contract Layer

Three Anchor programs on Solana:

### Program 1: nusa_harvest_pool
Address: D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq (devnet)

Accounts:
- PoolState (PDA): global protocol state, TVL, admin config
- InvestorRecord (PDA per investor): deposit amount, timestamp, unclaimed yield

Instructions:
- initialize_pool (admin only)
- deposit_to_pool (public) — 2.5% fee atomic to treasury
- withdraw_from_pool (investor) — 2.5% fee atomic to treasury
- disburse_loan (admin only)
- repay_loan (koperasi)

### Program 2: nusa_harvest_insurance
Address: [deploy and fill — HARI 5]

Accounts:
- PolicyAccount (PDA per policy): all policy data, status, claim history
- WeatherDataAccount (PDA per region): oracle data per geographic region

Instructions:
- create_policy (koperasi/public) — 15% admin fee atomic to treasury
- update_weather_data (admin/oracle only)
- trigger_claim (admin after oracle verification)
- expire_policy (permissionless after end_date)

### Program 3: nusa_harvest_vault
Address: [deploy and fill — HARI 8]

Accounts:
- VaultState (PDA): authorized signers, threshold, balance

Instructions:
- initialize_vault (admin only, once)
- collect_fee (CPI from pool/insurance only — not callable directly)
- withdraw_treasury (multisig for large amounts — 2-of-3)

## Treasury Wallet

All protocol fees route atomically to:
`ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`

| Action | Fee |
|--------|-----|
| Investor deposit to pool | 2.5% |
| Investor withdraw from pool | 2.5% |
| Farmer pays insurance premium | 15% |
| Koperasi repay loan (spread) | 1% APY |

## Frontend Layer

Next.js App Router with:
- `@solana/web3.js` for RPC calls
- `@coral-xyz/anchor` for program interaction
- `@solana/wallet-adapter-react` for wallet connection
- Pyth SDK for price feeds (mainnet roadmap)

## Data Sources

| Data | Devnet | Mainnet |
|------|--------|---------|
| SOL/USDC price | CoinGecko free API | Pyth Network |
| Commodity price | BPS/HPP static data | TBD |
| Weather data | Open-Meteo + admin manual feed | Switchboard + BMKG |
| Program state | Solana devnet RPC | Solana mainnet RPC |

## Oracle Design

**Devnet Phase (current):**
- `update_weather_data` instruction called manually by admin wallet with BMKG data
- Labeled in UI as "Manual Admin Feed (Devnet Demo)" — transparent, not misleading
- Data source: Open-Meteo API for real-time display; on-chain feed is admin-controlled

**Mainnet Phase (Q4 2026):**
- Switchboard oracle with BMKG data aggregation
- Fallback: protocol freeze if oracle unavailable > 24 hours
- Multi-source from 3 nearest BMKG stations, take average

## Security Model

- All critical mutations require multisig (2-of-3 team wallets)
- 48-hour timelock on transactions above 10% TVL
- Upgrade authority: transferred to multisig vault post-Colosseum
- No single private key can drain pools unilaterally
- Insurance math: actuarial validation planned before mainnet
- Smart contract audit: OtterSec / Sec3 / Neodyme (post-Colosseum, funded from prize)

## Fee Flow

```
Investor (USDC)
     │ deposit
     ▼
[nusa_harvest_pool]
  ├── 2.5% → Treasury Vault (atomic)
  ├── 80% → Koperasi → Farmer (loan disbursement)
  └── 20% → On-chain Reserve Buffer

Farmer
     │ pays premium
     ▼
[nusa_harvest_insurance]
  ├── 15% → Treasury Vault (atomic)
  └── 85% → Insurance Reserve Pool
       └── oracle breach → auto-trigger payout to farmer wallet

[nusa_harvest_vault]
  ├── 2-of-3 multisig for withdrawals > threshold
  └── upgrade authority (post-Colosseum)
```
