# NusaHarvest Security Model

## Current Status (Devnet — Colosseum MVP)

- Single admin key for all privileged instructions
- Upgrade authority: deploy keypair `35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr`
- Multisig: planned post-Colosseum via Squads Protocol

## Planned Mainnet Security (Q1 2027)

### Multisig Setup
- All privileged instructions require 2-of-3 authorized signers
- Upgrade authority transferred to multisig vault after audit
- Withdrawal above 10% TVL requires 2-of-3 signatures + 48h timelock
- Program upgrade requires 3-of-3 signatures

### Audit Plan
- Target: OtterSec, Sec3, or Neodyme
- Budget: funded from Colosseum prize allocation
- Scope: all three programs + cross-program invocations
- No mainnet launch until zero critical findings

### Key Rotation Protocol
- 3 authorized signers minimum, documented in hardware wallets
- Each signer holds backup in separate secure storage (Bitwarden / hardware wallet)
- No mnemonic ever shared digitally (chat, email, cloud)

### TVL Cap
- Batch 1 mainnet: $50,000 USD cap
- Scale after audit verified + 90-day soak period
- Emergency pause: 1-of-3 signer can freeze deposit/withdraw in < 5 minutes

## Fee Atomicity Guarantee

Every fee transfer is atomic with its triggering action:
```rust
// Example: deposit_to_pool
// fee_amount = deposit_amount * 250 / 10_000  (2.5%)
// transfer fee_amount → treasury_wallet  <- same CPI, same transaction
// transfer net_amount → pool_vault
// If either fails, entire transaction reverts
```

This means no manual fee collection is ever needed. Treasury balance is always
the exact sum of all fees from all protocol actions, verifiable on Solana Explorer.
