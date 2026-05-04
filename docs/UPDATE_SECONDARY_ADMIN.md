# Update Secondary Admin Wallet

## Overview

Fungsi `update_secondary_admin` memungkinkan admin utama untuk menambahkan wallet kedua sebagai secondary admin pada Pool Contract. Secondary admin akan memiliki privileges yang sama dengan primary admin.

---

## Perubahan Smart Contract

### 1. PoolState Structure
Field baru ditambahkan ke `PoolState`:

```rust
pub struct PoolState {
    pub admin: Pubkey,           // Primary admin (original deployer)
    pub secondary_admin: Option<Pubkey>,  // Secondary admin (newly added)
    pub treasury: Pubkey,        // Treasury wallet
    pub total_tvl_usdc: u64,     // Total TVL
    // ... other fields
}
```

**Space Change:** 121 bytes → 154 bytes

### 2. New Function: `update_secondary_admin`

```rust
pub fn update_secondary_admin(
    ctx: Context<UpdateSecondaryAdmin>, 
    new_admin: Pubkey
) -> Result<()>
```

**Requirements:**
- ✅ Only PRIMARY ADMIN can call this function
- ✅ Emits `SecondaryAdminUpdated` event
- ❌ Cannot modify other pool settings
- ❌ Cannot transfer treasury or funds

### 3. New Context: `UpdateSecondaryAdmin`

```rust
#[derive(Accounts)]
pub struct UpdateSecondaryAdmin<'info> {
    #[account(mut, seeds = [b"pool_state"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}
```

### 4. New Event: `SecondaryAdminUpdated`

```rust
#[event]
pub struct SecondaryAdminUpdated {
    pub old_admin: Option<Pubkey>,
    pub new_admin: Option<Pubkey>,
    pub timestamp: i64,
}
```

---

## Admin Details

### Primary Admin (Current)
```
B4zL1R2qXwT4w3XwZ2Y8L8V3J5zV2P3A2V8R9L1T0G9
```

### Secondary Admin (To Be Added)
```
35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr
```

### Pool Contract Program ID
```
3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt
```

---

## Deployment Steps

### Step 1: Build the Updated Contract

```bash
cd programs/nusa_harvest_pool
cargo build --release
```

### Step 2: Generate IDL

```bash
anchor idl build --out idl/
```

### Step 3: Deploy to Devnet

```bash
anchor deploy --provider.cluster devnet
```

### Step 4: Call `update_secondary_admin`

Using Anchor CLI or Solana Web3.js:

```bash
anchor run update-secondary-admin
```

Or using `solana-cli`:

```bash
solana program invoke 3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt \
  --data <INSTRUCTION_BYTES>
```

---

## Verification

After deployment, verify the secondary admin was added:

```bash
solana account -u devnet <POOL_STATE_PDA>
```

Look for:
- `secondary_admin: Some(35z7X59rtyts557Up1RAwpyYN7x2cFqcDc7RjPuNxFzr)`

Or check the emitted event:

```bash
solana logs 3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt -u devnet | grep SecondaryAdminUpdated
```

---

## Safety Guarantees

✅ **Only primary admin can add secondary admin**
- Function checks: `require!(pool.admin == ctx.accounts.admin.key())`

✅ **No fund access**
- Function only updates the state variable
- No `CpiContext::new_with_signer` or token transfers

✅ **No treasury modification**
- Treasury address remains immutable constant: `ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m`

✅ **Event emitted for transparency**
- All changes logged on-chain with timestamp

---

## Future Work

To grant secondary admin full privileges (disburse loans, etc.), update the authorization checks:

```rust
// Current check (only primary admin)
require!(pool.admin == ctx.accounts.admin.key(), PoolError::Unauthorized);

// Future check (both primary and secondary admin)
require!(
    pool.admin == ctx.accounts.admin.key() 
    || pool.secondary_admin.map(|sa| sa == ctx.accounts.admin.key()).unwrap_or(false),
    PoolError::Unauthorized
);
```

---

## Support

For issues or questions:
- Check [docs/DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)
- Review [contracts/programs/nusa-harvest/src/lib.rs](../programs/nusa_harvest_pool/src/lib.rs)
