use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("CgMn8QfThDQLkcghfP4A9AV3FTTECjSuZvf6Ngf1LiBx");

// ─────────────────────────────────────────────────────────────────────────────
//  NUSA HARVEST — Solana Anchor Smart Contract
//  Network: Devnet (upgradeable to Mainnet-Beta)
// ─────────────────────────────────────────────────────────────────────────────

#[program]
pub mod nusa_harvest {
    use super::*;

    // ── 1. Initialize a Yield Pool ─────────────────────────────────────────
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        commodity: String,   // "RICE", "COFFEE", etc.
        region: String,      // "JAVA", "SUMATRA", etc.
        risk_tranche: u8,    // 1 = junior, 2 = senior
        base_apy_bps: u64,   // e.g. 800 = 8% APY in basis points
    ) -> Result<()> {
        require!(commodity.len() <= 32, NusaError::StringTooLong);
        require!(region.len() <= 32, NusaError::StringTooLong);
        require!(risk_tranche == 1 || risk_tranche == 2, NusaError::InvalidTranche);
        require!(base_apy_bps <= 5000, NusaError::ApyTooHigh); 

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.commodity = commodity;
        pool.region = region;
        pool.risk_tranche = risk_tranche;
        pool.base_apy_bps = base_apy_bps;
        pool.total_deposited_usdc = 0;
        pool.available_reserve_usdc = 0;
        pool.total_claims_paid_usdc = 0;
        pool.total_shares = 0;
        pool.is_paused = false;
        pool.bump = ctx.bumps.pool;

        emit!(PoolInitialized {
            pool: ctx.accounts.pool.key(),
            commodity: pool.commodity.clone(),
            region: pool.region.clone(),
            authority: pool.authority,
        });

        Ok(())
    }

    // ── 2. LP Deposit USDC into Pool ──────────────────────────────────────
    pub fn deposit(ctx: Context<Deposit>, amount_usdc: u64) -> Result<()> {
        require!(amount_usdc >= 1_000_000, NusaError::AmountTooLow); 
        let pool = &mut ctx.accounts.pool;
        require!(!pool.is_paused, NusaError::PoolPaused);

        // Calculate LP shares to mint
        let shares_minted = if pool.total_shares == 0 {
            amount_usdc
        } else {
            (amount_usdc as u128)
                .checked_mul(pool.total_shares as u128)
                .ok_or(NusaError::MathOverflow)?
                .checked_div(pool.total_deposited_usdc as u128)
                .ok_or(NusaError::MathOverflow)? as u64
        };

        // Transfer USDC from LP to pool vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.lp_usdc_account.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.lp.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount_usdc)?;

        // Update pool state
        pool.total_deposited_usdc = pool.total_deposited_usdc
            .checked_add(amount_usdc)
            .ok_or(NusaError::MathOverflow)?;
        pool.available_reserve_usdc = pool.available_reserve_usdc
            .checked_add(amount_usdc)
            .ok_or(NusaError::MathOverflow)?;
        pool.total_shares = pool.total_shares
            .checked_add(shares_minted)
            .ok_or(NusaError::MathOverflow)?;

        // Record LP position
        let position = &mut ctx.accounts.lp_position;
        position.lp = ctx.accounts.lp.key();
        position.pool = ctx.accounts.pool.key();
        position.shares = position.shares
            .checked_add(shares_minted)
            .ok_or(NusaError::MathOverflow)?;
        position.deposited_at = Clock::get()?.unix_timestamp;

        emit!(LpDeposited {
            lp: ctx.accounts.lp.key(),
            pool: ctx.accounts.pool.key(),
            amount_usdc,
            shares_minted,
        });

        Ok(())
    }

    // ── 3. LP Withdraw USDC from Pool ─────────────────────────────────────
    pub fn withdraw(ctx: Context<Withdraw>, shares_to_burn: u64) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.lp_position;

        require!(shares_to_burn <= position.shares, NusaError::InsufficientShares);

        // Enforce 7-day cooldown
        let now = Clock::get()?.unix_timestamp;
        let cooldown_seconds: i64 = 7 * 24 * 60 * 60;
        require!(
            now >= position.deposited_at.checked_add(cooldown_seconds).ok_or(NusaError::MathOverflow)?,
            NusaError::CooldownNotExpired
        );

        // Calculate USDC to return
        let usdc_to_return = (shares_to_burn as u128)
            .checked_mul(pool.total_deposited_usdc as u128)
            .ok_or(NusaError::MathOverflow)?
            .checked_div(pool.total_shares as u128)
            .ok_or(NusaError::MathOverflow)? as u64;

        require!(
            pool.available_reserve_usdc >= usdc_to_return,
            NusaError::InsufficientReserve
        );

        // Transfer USDC from vault back to LP
        let pool_key = pool.key();
        let seeds = &[b"pool", pool.commodity.as_bytes(), pool.region.as_bytes(), &[pool.bump]];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.lp_usdc_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, usdc_to_return)?;

        // Update state
        pool.total_deposited_usdc = pool.total_deposited_usdc
            .checked_sub(usdc_to_return)
            .ok_or(NusaError::MathOverflow)?;
        pool.available_reserve_usdc = pool.available_reserve_usdc
            .checked_sub(usdc_to_return)
            .ok_or(NusaError::MathOverflow)?;
        pool.total_shares = pool.total_shares
            .checked_sub(shares_to_burn)
            .ok_or(NusaError::MathOverflow)?;
        position.shares = position.shares
            .checked_sub(shares_to_burn)
            .ok_or(NusaError::MathOverflow)?;

        emit!(LpWithdrawn {
            lp: ctx.accounts.lp.key(),
            pool: ctx.accounts.pool.key(),
            usdc_returned: usdc_to_return,
            shares_burned: shares_to_burn,
        });

        Ok(())
    }

    // ── 4. Create Insurance Policy ─────────────────────────────────────────
    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        policy_id: String,               
        commodity: String,
        trigger_type: TriggerType,
        trigger_threshold_mm: u64,       
        trigger_window_days: u8,         
        coverage_start: i64,             
        coverage_end: i64,
        covered_hectares_bps: u64,       
        payout_per_hectare_usdc: u64,    
        premium_usdc: u64,
    ) -> Result<()> {
        require!(coverage_end > coverage_start, NusaError::InvalidCoveragePeriod);
        require!(covered_hectares_bps > 0, NusaError::InvalidHectares);
        require!(premium_usdc > 0, NusaError::PremiumRequired);

        let policy = &mut ctx.accounts.policy;
        policy.policy_id = policy_id;
        policy.insured = ctx.accounts.insured.key();
        policy.pool = ctx.accounts.pool.key();
        policy.commodity = commodity;
        policy.trigger_type = trigger_type;
        policy.trigger_threshold_mm = trigger_threshold_mm;
        policy.trigger_window_days = trigger_window_days;
        policy.coverage_start = coverage_start;
        policy.coverage_end = coverage_end;
        policy.covered_hectares_bps = covered_hectares_bps;
        policy.payout_per_hectare_usdc = payout_per_hectare_usdc;
        policy.premium_usdc = premium_usdc;
        policy.status = PolicyStatus::Active;
        policy.created_at = Clock::get()?.unix_timestamp;
        policy.bump = ctx.bumps.policy;

        // Transfer premium from insured to pool vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.insured_usdc_account.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
                authority: ctx.accounts.insured.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, premium_usdc)?;

        // Add premium to pool
        let pool = &mut ctx.accounts.pool;
        pool.total_deposited_usdc = pool.total_deposited_usdc
            .checked_add(premium_usdc)
            .ok_or(NusaError::MathOverflow)?;
        pool.available_reserve_usdc = pool.available_reserve_usdc
            .checked_add(premium_usdc)
            .ok_or(NusaError::MathOverflow)?;

        emit!(PolicyCreated {
            policy: ctx.accounts.policy.key(),
            insured: ctx.accounts.insured.key(),
            pool: ctx.accounts.pool.key(),
            commodity: policy.commodity.clone(),
            max_payout_usdc: (covered_hectares_bps as u128 * payout_per_hectare_usdc as u128 / 10000) as u64,
            premium_usdc,
        });

        Ok(())
    }

    // ── 5. Trigger Claim (Oracle-authorized) ───────────────────────────────
    pub fn trigger_claim(
        ctx: Context<TriggerClaim>,
        actual_rainfall_mm: u64,   
    ) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        let pool = &mut ctx.accounts.pool;
        let now = Clock::get()?.unix_timestamp;

        // Validations
        require!(policy.status == PolicyStatus::Active, NusaError::PolicyNotActive);
        require!(now >= policy.coverage_start, NusaError::CoverageNotStarted);
        require!(now <= policy.coverage_end, NusaError::PolicyExpired);

        // Check trigger condition
        let trigger_met = match policy.trigger_type {
            TriggerType::RainfallDeficit => actual_rainfall_mm < policy.trigger_threshold_mm,
            TriggerType::ExcessRainfall => actual_rainfall_mm > policy.trigger_threshold_mm,
        };
        require!(trigger_met, NusaError::TriggerConditionNotMet);

        // Calculate payout
        let max_payout_usdc = (policy.covered_hectares_bps as u128)
            .checked_mul(policy.payout_per_hectare_usdc as u128)
            .ok_or(NusaError::MathOverflow)?
            .checked_div(10000)
            .ok_or(NusaError::MathOverflow)? as u64;

        let payout_usdc = max_payout_usdc.min(pool.available_reserve_usdc);
        require!(payout_usdc > 0, NusaError::InsufficientReserve);

        // Update policy status
        policy.status = PolicyStatus::Triggered;

        // Update pool reserves
        pool.available_reserve_usdc = pool.available_reserve_usdc
            .checked_sub(payout_usdc)
            .ok_or(NusaError::MathOverflow)?;
        pool.total_claims_paid_usdc = pool.total_claims_paid_usdc
            .checked_add(payout_usdc)
            .ok_or(NusaError::MathOverflow)?;

        // Transfer USDC from pool vault to insured
        let pool_key = pool.key();
        let seeds = &[b"pool", pool.commodity.as_bytes(), pool.region.as_bytes(), &[pool.bump]];
        let signer = &[&seeds[..]];

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.insured_usdc_account.to_account_info(),
                authority: pool.to_account_info(),
            },
            signer,
        );
        token::transfer(cpi_ctx, payout_usdc)?;

        emit!(ClaimTriggered {
            policy: ctx.accounts.policy.key(),
            insured: policy.insured,
            payout_usdc,
            actual_rainfall_mm,
            triggered_at: now,
        });

        Ok(())
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCOUNT STRUCTS
// ─────────────────────────────────────────────────────────────────────────────

#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub commodity: String,           // max 32 chars
    pub region: String,              // max 32 chars
    pub risk_tranche: u8,
    pub base_apy_bps: u64,
    pub total_deposited_usdc: u64,
    pub available_reserve_usdc: u64,
    pub total_claims_paid_usdc: u64,
    pub total_shares: u64,
    pub is_paused: bool,
    pub bump: u8,
}

#[account]
pub struct LpPosition {
    pub lp: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
}

#[account]
pub struct InsurancePolicy {
    pub policy_id: String,           // UUID from backend (max 36 chars)
    pub insured: Pubkey,
    pub pool: Pubkey,
    pub commodity: String,
    pub trigger_type: TriggerType,
    pub trigger_threshold_mm: u64,
    pub trigger_window_days: u8,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub covered_hectares_bps: u64,
    pub payout_per_hectare_usdc: u64,
    pub premium_usdc: u64,
    pub status: PolicyStatus,
    pub created_at: i64,
    pub bump: u8,
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT STRUCTS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(commodity: String, region: String)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + 32 + 4 + 32 + 4 + 32 + 1 + 8 + 8 + 8 + 8 + 8 + 1 + 1,
        seeds = [b"pool", commodity.as_bytes(), region.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = lp,
        space = 8 + 32 + 32 + 8 + 8,
        seeds = [b"position", pool.key().as_ref(), lp.key().as_ref()],
        bump
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"position", pool.key().as_ref(), lp.key().as_ref()],
        bump
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub lp: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(policy_id: String)]
pub struct CreatePolicy<'info> {
    #[account(
        init,
        payer = insured,
        space = 8 + 4 + 36 + 32 + 32 + 4 + 32 + 1 + 8 + 1 + 8 + 8 + 8 + 8 + 1 + 8 + 1,
        seeds = [b"policy", policy_id.as_bytes()],
        bump
    )]
    pub policy: Account<'info, InsurancePolicy>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub insured_usdc_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub insured: Signer<'info>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerClaim<'info> {
    #[account(mut)]
    pub policy: Account<'info, InsurancePolicy>,

    #[account(mut)]
    pub pool: Account<'info, Pool>,

    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub insured_usdc_account: Account<'info, TokenAccount>,

    // Oracle authority — only designated oracle can trigger claims
    #[account(constraint = oracle.key() == ORACLE_PUBKEY @ NusaError::Unauthorized)]
    pub oracle: Signer<'info>,

    pub token_program: Program<'info, Token>,
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES AND ENUMS
// ─────────────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum TriggerType {
    RainfallDeficit,
    ExcessRainfall,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PolicyStatus {
    Active,
    Triggered,
    Expired,
    Cancelled,
}

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Replace with actual oracle wallet keypair public key after keygen
pub const ORACLE_PUBKEY: &str = "7mgSJBnBr5NVED2xUdZQzkrmNnMwbEhjrCkQ5GxKA2Xd";

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────

#[event]
pub struct PoolInitialized {
    pub pool: Pubkey,
    pub commodity: String,
    pub region: String,
    pub authority: Pubkey,
}

#[event]
pub struct LpDeposited {
    pub lp: Pubkey,
    pub pool: Pubkey,
    pub amount_usdc: u64,
    pub shares_minted: u64,
}

#[event]
pub struct LpWithdrawn {
    pub lp: Pubkey,
    pub pool: Pubkey,
    pub usdc_returned: u64,
    pub shares_burned: u64,
}

#[event]
pub struct PolicyCreated {
    pub policy: Pubkey,
    pub insured: Pubkey,
    pub pool: Pubkey,
    pub commodity: String,
    pub max_payout_usdc: u64,
    pub premium_usdc: u64,
}

#[event]
pub struct ClaimTriggered {
    pub policy: Pubkey,
    pub insured: Pubkey,
    pub payout_usdc: u64,
    pub actual_rainfall_mm: u64,
    pub triggered_at: i64,
}

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS
// ─────────────────────────────────────────────────────────────────────────────

#[error_code]
pub enum NusaError {
    #[msg("String value too long")]
    StringTooLong,
    #[msg("Invalid risk tranche (must be 1 or 2)")]
    InvalidTranche,
    #[msg("APY too high (max 50%)")]
    ApyTooHigh,
    #[msg("Deposit amount too low (min 1 USDC)")]
    AmountTooLow,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Insufficient shares to withdraw")]
    InsufficientShares,
    #[msg("7-day cooldown period not yet expired")]
    CooldownNotExpired,
    #[msg("Insufficient pool reserve for payout")]
    InsufficientReserve,
    #[msg("Coverage period invalid: end must be after start")]
    InvalidCoveragePeriod,
    #[msg("Covered hectares must be greater than zero")]
    InvalidHectares,
    #[msg("Premium must be greater than zero")]
    PremiumRequired,
    #[msg("Policy is not active")]
    PolicyNotActive,
    #[msg("Coverage period has not started yet")]
    CoverageNotStarted,
    #[msg("Policy has expired")]
    PolicyExpired,
    #[msg("Trigger condition not met")]
    TriggerConditionNotMet,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Unauthorized — oracle only")]
    Unauthorized,
}
