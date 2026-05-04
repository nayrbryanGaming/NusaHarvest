# NusaHarvest Oracle Design

## Devnet Phase (Current — Q2 2026)

Oracle = admin wallet manually calling `update_weather_data` instruction.

Data pipeline:
1. BMKG / Open-Meteo data fetched off-chain by admin
2. Admin calls `update_weather_data(region_id, rainfall_mm_30d, "Manual_Admin_Devnet")`
3. WeatherDataAccount PDA updated on-chain
4. `trigger_claim` checks this account when evaluating payout eligibility

Label in UI and on-chain: **"Oracle: Manual Admin Feed (Devnet Demo)"**

This is intentionally transparent. Judges can verify the data_source field on-chain.

## Mainnet Phase (Q4 2026)

Oracle = Switchboard Network with BMKG data feed.

- Switchboard push oracle aggregates from 3 nearest BMKG stations
- 6-hour update frequency minimum
- `update_weather_data` instruction restricted to Switchboard oracle pubkey only
- Fallback: if oracle unavailable > 24 hours → protocol freeze (no trigger_claim possible)
- Multi-source aggregation prevents single point of failure

## Trigger Logic

```
For each active PolicyAccount:
  region = policy.region
  WeatherData = fetch WeatherDataAccount[region]
  
  if WeatherData.rainfall_mm_30_days < policy.rain_threshold_mm:
    trigger_claim(policy_pda)
    transfer policy.coverage_amount USDC → policy.farmer_wallet
    policy.status = Triggered
  else:
    return ThresholdNotMet error
```

## Fraud Prevention

- WeatherDataAccount update requires authorized signer (admin devnet / Switchboard mainnet)
- All trigger_claim calls emitted as events — publicly auditable
- Claim history stored permanently on-chain in PolicyAccount
- Treasury fee transfer is atomic with every fee-generating action
