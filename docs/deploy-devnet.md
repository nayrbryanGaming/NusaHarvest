# NusaHarvest — Devnet Deployment Guide

## Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install Solana CLI
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

# Install Anchor
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.30.1
avm use 0.30.1

# Install Node.js deps for tests
yarn install
```

## Step 1 — Configure Devnet Wallet

```bash
# Generate or use existing keypair
solana-keygen new --outfile ~/.config/solana/id.json
# Or import existing: solana-keygen recover --outfile ~/.config/solana/id.json

# Set devnet
solana config set --url devnet

# Check your pubkey
solana address

# Airdrop SOL for deployment gas
solana airdrop 4
# If rate limited: use https://faucet.solana.com
```

## Step 2 — Build All Programs

```bash
cd NusaHarvest

# Build all three programs
anchor build

# This outputs:
# - target/deploy/nusa_harvest_pool.so
# - target/deploy/nusa_harvest_insurance.so
# - target/deploy/nusa_harvest_vault.so
# - target/types/*.ts (IDL TypeScript types)
```

## Step 3 — Deploy to Devnet

```bash
# Deploy pool program
anchor deploy --program-name nusa_harvest_pool --provider.cluster devnet
# Note the deployed Program ID — update Anchor.toml if it changes

# Deploy insurance program
anchor deploy --program-name nusa_harvest_insurance --provider.cluster devnet

# Deploy vault program
anchor deploy --program-name nusa_harvest_vault --provider.cluster devnet
```

## Step 4 — Initialize Programs On-Chain

```bash
# Run initialization script (creates PoolState PDA + InsuranceState PDA)
cd scripts
ts-node initialize.ts
```

Or run via Anchor tests:
```bash
anchor test --skip-local-validator --provider.cluster devnet
```

## Step 5 — Verify on Solana Explorer

After deploy, open:
```
https://explorer.solana.com/address/<PROGRAM_ID>?cluster=devnet
```

You should see:
- `Program` account marked as `Executable`
- Initial `initialize_pool` transaction in history
- `PoolState` PDA account with data

## Step 6 — Update Frontend Environment

```bash
cp frontend/.env.example frontend/.env.local

# Edit .env.local:
NEXT_PUBLIC_POOL_PROGRAM_ID=<your deployed pool program ID>
NEXT_PUBLIC_INSURANCE_PROGRAM_ID=<your deployed insurance program ID>
NEXT_PUBLIC_VAULT_PROGRAM_ID=<your deployed vault program ID>
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
```

## Step 7 — Run Tests

```bash
# Unit tests with local validator
anchor test

# Integration tests against devnet
anchor test --skip-local-validator --provider.cluster devnet
```

Expected output:
```
nusa_harvest_pool
  ✅ Pool initialized. PDA: ...
  ✅ Double-init correctly rejected
  ✅ Deposit: 1000 USDC → Fee: 25 USDC → Pool: 975 USDC
  ✅ Non-admin disburse correctly rejected

nusa_harvest_insurance
  ✅ Policy created. Admin fee to treasury: $2.89 USDC
  ✅ WeatherDataAccount updated. Region: Klaten_JawaTengah
  ✅ Claim correctly rejected when rainfall > threshold
  ✅ CLAIM TRIGGERED — Farmer received $500 USDC
  ✅ Already-triggered policy correctly rejected
```

## Demo Flow (for Colosseum Judges)

Run this sequence during your 2-minute demo video:

```bash
# 1. Show Pool deployed on Explorer
open "https://explorer.solana.com/address/<POOL_ID>?cluster=devnet"

# 2. Initialize pool (if not already)
ts-node scripts/initialize.ts

# 3. Create test policy via dashboard (connect Phantom wallet)
# Go to nusaharvest.vercel.app/dashboard → Beli Proteksi

# 4. Admin: update weather data below threshold
ts-node scripts/update-weather.ts --region Klaten_JawaTengah --mm 25

# 5. Admin: trigger claim
ts-node scripts/trigger-claim.ts --policy <POLICY_PDA>

# 6. Show policy status changed to "Triggered" on Explorer
# This is the MONEY SHOT — USDC sent on-chain, verifiable by anyone
```

## Troubleshooting

**`Error: Deployer does not have enough SOL`**
→ `solana airdrop 4` or get SOL from https://faucet.solana.com

**`Error: Program already deployed`**
→ Use `--program-keypair` flag with same keypair to upgrade

**`Error: RPC timeout`**
→ Try alternative: `NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=<key>`

**`anchor build` fails**
→ `rustup update` then `avm use 0.30.1` and try again
