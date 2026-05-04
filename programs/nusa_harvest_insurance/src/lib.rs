use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("H6snTB1Akud3SLgZTvg7mdTojVEVRuYEZR8KHYRStKsh");

pub const TREASURY: &str = "ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m";
pub const INSURANCE_ADMIN_FEE_BPS: u64 = 1500; // 15% of premium to treasury
pub const RAINFALL_DROUGHT_THRESHOLD_MM: u64 = 40;
// Weather data must be updated within 7 days before a claim can be triggered
pub const MAX_WEATHER_DATA_AGE_SECONDS: i64 = 7 * 24 * 3600;

#[program]
pub mod nusa_harvest_insurance {
    use super::*;

    /// One-time setup — only admin can call.
    /// Binds the admin wallet and the insurance reserve token account to this state PDA.
    pub fn initialize_insurance_state(ctx: Context<InitializeInsuranceState>) -> Result<()> {
        let state = &mut ctx.accounts.insurance_state;
        state.admin = ctx.accounts.admin.key();
        state.treasury = TREASURY.parse().unwrap();
        state.reserve_account = ctx.accounts.insurance_reserve.key();
        state.bump = ctx.bumps.insurance_state;
        Ok(())
    }

    /// Create a new insurance policy (PDA per farmer+policy_id).
    /// 15% of premium goes atomically to treasury; rest to insurance reserve pool.
    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        policy_id: String,
        commodity: String,
        region: String,
        coverage_usdc: u64,
        rain_threshold_mm: u64,
        coverage_start: i64,
        coverage_end: i64,
        premium_usdc: u64,
        subsidy_usdc: u64,
    ) -> Result<()> {
        require!(policy_id.len() <= 32, InsuranceError::InvalidInput);
        require!(commodity.len() <= 16, InsuranceError::InvalidInput);
        require!(region.len() <= 64, InsuranceError::InvalidInput);
        require!(coverage_usdc > 0, InsuranceError::InvalidAmount);
        require!(premium_usdc > 0, InsuranceError::InvalidAmount);
        require!(coverage_end > coverage_start, InsuranceError::InvalidDates);
        require!(rain_threshold_mm > 0, InsuranceError::InvalidAmount);

        let farmer_pays = premium_usdc.saturating_sub(subsidy_usdc);
        require!(farmer_pays > 0, InsuranceError::InvalidAmount);

        let admin_fee = farmer_pays
            .checked_mul(INSURANCE_ADMIN_FEE_BPS)
            .ok_or(InsuranceError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(InsuranceError::MathOverflow)?;
        let net_to_reserve = farmer_pays
            .checked_sub(admin_fee)
            .ok_or(InsuranceError::MathOverflow)?;

        // Transfer fee to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.farmer_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.farmer.to_account_info(),
                },
            ),
            admin_fee,
        )?;

        // Transfer net premium to insurance reserve pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.farmer_usdc.to_account_info(),
                    to: ctx.accounts.insurance_reserve.to_account_info(),
                    authority: ctx.accounts.farmer.to_account_info(),
                },
            ),
            net_to_reserve,
        )?;

        let policy = &mut ctx.accounts.policy;
        policy.farmer = ctx.accounts.farmer.key();
        policy.policy_id = policy_id.clone();
        policy.commodity = commodity.clone();
        policy.region = region.clone();
        policy.coverage_usdc = coverage_usdc;
        policy.rain_threshold_mm = rain_threshold_mm;
        policy.coverage_start = coverage_start;
        policy.coverage_end = coverage_end;
        policy.premium_paid_usdc = farmer_pays;
        policy.subsidy_usdc = subsidy_usdc;
        policy.admin_fee_usdc = admin_fee;
        policy.status = PolicyStatus::Active;
        policy.claim_amount_usdc = 0;
        policy.claimed_at = 0;
        policy.created_at = Clock::get()?.unix_timestamp;
        policy.bump = ctx.bumps.policy;

        emit!(PolicyCreated {
            farmer: policy.farmer,
            policy_id,
            commodity,
            region,
            coverage_usdc,
            rain_threshold_mm,
            premium_paid: farmer_pays,
            admin_fee_to_treasury: admin_fee,
            net_to_reserve,
            coverage_start,
            coverage_end,
            timestamp: policy.created_at,
        });
        Ok(())
    }

    /// Admin/oracle updates weather data for a geographic region.
    /// SECURITY: requires insurance_state.admin — not callable by arbitrary wallets.
    pub fn update_weather_data(
        ctx: Context<UpdateWeatherData>,
        region_id: String,
        rainfall_mm_30d: u64,
        data_source: String,
    ) -> Result<()> {
        require!(region_id.len() <= 64, InsuranceError::InvalidInput);
        require!(data_source.len() <= 64, InsuranceError::InvalidInput);

        let weather = &mut ctx.accounts.weather_data;
        weather.region_id = region_id.clone();
        weather.rainfall_mm_30d = rainfall_mm_30d;
        weather.updated_at = Clock::get()?.unix_timestamp;
        weather.data_source = data_source.clone();
        weather.admin = ctx.accounts.admin.key();
        weather.bump = ctx.bumps.weather_data;

        emit!(WeatherDataUpdated {
            region_id,
            rainfall_mm_30d,
            data_source,
            updated_by: ctx.accounts.admin.key(),
            timestamp: weather.updated_at,
        });
        Ok(())
    }

    /// Admin triggers a claim payout when oracle data shows drought.
    /// SECURITY: verifies farmer_usdc belongs to the policy farmer; weather data freshness enforced.
    pub fn trigger_claim(ctx: Context<TriggerClaim>) -> Result<()> {
        let policy = &ctx.accounts.policy;
        let weather = &ctx.accounts.weather_data;
        let now = Clock::get()?.unix_timestamp;

        require!(
            policy.status == PolicyStatus::Active,
            InsuranceError::PolicyNotActive
        );
        require!(
            now >= policy.coverage_start && now <= policy.coverage_end,
            InsuranceError::OutsideCoveragePeriod
        );
        require!(
            weather.region_id == policy.region,
            InsuranceError::RegionMismatch
        );
        // Reject stale weather data to prevent old drought readings from triggering false claims
        require!(
            now - weather.updated_at <= MAX_WEATHER_DATA_AGE_SECONDS,
            InsuranceError::StaleWeatherData
        );
        require!(
            weather.rainfall_mm_30d < policy.rain_threshold_mm,
            InsuranceError::ThresholdNotMet
        );

        let payout = policy.coverage_usdc;

        let insurance_seeds = &[b"insurance_state".as_ref(), &[ctx.accounts.insurance_state.bump]];
        let signer = &[&insurance_seeds[..]];

        // Transfer payout from reserve to farmer's verified account
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.insurance_reserve.to_account_info(),
                    to: ctx.accounts.farmer_usdc.to_account_info(),
                    authority: ctx.accounts.insurance_state.to_account_info(),
                },
                signer,
            ),
            payout,
        )?;

        let policy = &mut ctx.accounts.policy;
        policy.status = PolicyStatus::Triggered;
        policy.claim_amount_usdc = payout;
        policy.claimed_at = now;

        emit!(ClaimTriggered {
            policy_id: policy.policy_id.clone(),
            farmer: policy.farmer,
            region: policy.region.clone(),
            rainfall_actual_mm: weather.rainfall_mm_30d,
            threshold_mm: policy.rain_threshold_mm,
            payout_usdc: payout,
            timestamp: now,
        });
        Ok(())
    }

    /// Permissionless: expire policy after coverage_end date.
    pub fn expire_policy(ctx: Context<ExpirePolicy>) -> Result<()> {
        let policy = &ctx.accounts.policy;
        let now = Clock::get()?.unix_timestamp;
        require!(
            policy.status == PolicyStatus::Active,
            InsuranceError::PolicyNotActive
        );
        require!(now > policy.coverage_end, InsuranceError::CoverageNotEnded);

        let policy = &mut ctx.accounts.policy;
        policy.status = PolicyStatus::Expired;

        emit!(PolicyExpired {
            policy_id: policy.policy_id.clone(),
            farmer: policy.farmer,
            timestamp: now,
        });
        Ok(())
    }
}

// ── Account Structs ───────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum PolicyStatus {
    Active,
    Triggered,
    Expired,
    Cancelled,
}

#[account]
pub struct InsuranceState {
    pub admin: Pubkey,           // 32 — only this wallet may update weather data and trigger claims
    pub treasury: Pubkey,        // 32
    pub reserve_account: Pubkey, // 32 — the one valid insurance reserve token account
    pub bump: u8,                // 1
}
// discriminator=8, total=8+32+32+32+1 = 105

#[account]
pub struct PolicyAccount {
    pub farmer: Pubkey,              // 32
    pub policy_id: String,           // 4 + 32 = 36
    pub commodity: String,           // 4 + 16 = 20
    pub region: String,              // 4 + 64 = 68
    pub coverage_usdc: u64,          // 8
    pub rain_threshold_mm: u64,      // 8
    pub coverage_start: i64,         // 8
    pub coverage_end: i64,           // 8
    pub premium_paid_usdc: u64,      // 8
    pub subsidy_usdc: u64,           // 8
    pub admin_fee_usdc: u64,         // 8
    pub status: PolicyStatus,        // 1 + 1 (enum)
    pub claim_amount_usdc: u64,      // 8
    pub claimed_at: i64,             // 8
    pub created_at: i64,             // 8
    pub bump: u8,                    // 1
}

#[account]
pub struct WeatherDataAccount {
    pub region_id: String,       // 4 + 64 = 68
    pub rainfall_mm_30d: u64,    // 8
    pub updated_at: i64,         // 8
    pub data_source: String,     // 4 + 64 = 68
    pub admin: Pubkey,           // 32
    pub bump: u8,                // 1
}

// ── Contexts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeInsuranceState<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32 + 32 + 1,
        seeds = [b"insurance_state"],
        bump
    )]
    pub insurance_state: Account<'info, InsuranceState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    /// The token account that will hold all insurance premiums and fund payouts.
    /// Its address is stored immutably in insurance_state.reserve_account.
    pub insurance_reserve: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(policy_id: String)]
pub struct CreatePolicy<'info> {
    #[account(
        init,
        payer = farmer,
        space = 8 + 32 + 36 + 20 + 68 + 8*7 + 2 + 8 + 8*2 + 1,
        seeds = [b"policy", farmer.key().as_ref(), policy_id.as_bytes()],
        bump
    )]
    pub policy: Account<'info, PolicyAccount>,
    /// Read insurance_state to validate that treasury and reserve accounts are correct.
    #[account(seeds = [b"insurance_state"], bump = insurance_state.bump)]
    pub insurance_state: Account<'info, InsuranceState>,
    #[account(mut)]
    pub farmer: Signer<'info>,
    /// Farmer must own this token account — prevents redirecting premium payments.
    #[account(mut, constraint = farmer_usdc.owner == farmer.key() @ InsuranceError::Unauthorized)]
    pub farmer_usdc: Account<'info, TokenAccount>,
    /// Must match insurance_state.treasury — prevents fee redirection.
    #[account(mut, constraint = treasury_usdc.owner == insurance_state.treasury @ InsuranceError::Unauthorized)]
    pub treasury_usdc: Account<'info, TokenAccount>,
    /// Must match insurance_state.reserve_account — prevents premium theft.
    #[account(mut, constraint = insurance_reserve.key() == insurance_state.reserve_account @ InsuranceError::Unauthorized)]
    pub insurance_reserve: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(region_id: String)]
pub struct UpdateWeatherData<'info> {
    /// has_one = admin enforces only insurance_state.admin may update weather data.
    #[account(seeds = [b"insurance_state"], bump = insurance_state.bump, has_one = admin)]
    pub insurance_state: Account<'info, InsuranceState>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + 68 + 8 + 8 + 68 + 32 + 1,
        seeds = [b"weather", region_id.as_bytes()],
        bump
    )]
    pub weather_data: Account<'info, WeatherDataAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TriggerClaim<'info> {
    #[account(mut, seeds = [b"policy", policy.farmer.as_ref(), policy.policy_id.as_bytes()], bump = policy.bump)]
    pub policy: Account<'info, PolicyAccount>,
    #[account(seeds = [b"weather", weather_data.region_id.as_bytes()], bump = weather_data.bump)]
    pub weather_data: Account<'info, WeatherDataAccount>,
    /// has_one = admin — only the registered admin can trigger claims.
    #[account(seeds = [b"insurance_state"], bump = insurance_state.bump, has_one = admin)]
    pub insurance_state: Account<'info, InsuranceState>,
    pub admin: Signer<'info>,
    /// Must match insurance_state.reserve_account — prevents draining wrong accounts.
    #[account(mut, constraint = insurance_reserve.key() == insurance_state.reserve_account @ InsuranceError::Unauthorized)]
    pub insurance_reserve: Account<'info, TokenAccount>,
    /// Must be owned by the policy farmer — prevents admin redirecting payout.
    #[account(mut, constraint = farmer_usdc.owner == policy.farmer @ InsuranceError::Unauthorized)]
    pub farmer_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ExpirePolicy<'info> {
    #[account(mut, seeds = [b"policy", policy.farmer.as_ref(), policy.policy_id.as_bytes()], bump = policy.bump)]
    pub policy: Account<'info, PolicyAccount>,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct PolicyCreated {
    pub farmer: Pubkey,
    pub policy_id: String,
    pub commodity: String,
    pub region: String,
    pub coverage_usdc: u64,
    pub rain_threshold_mm: u64,
    pub premium_paid: u64,
    pub admin_fee_to_treasury: u64,
    pub net_to_reserve: u64,
    pub coverage_start: i64,
    pub coverage_end: i64,
    pub timestamp: i64,
}

#[event]
pub struct WeatherDataUpdated {
    pub region_id: String,
    pub rainfall_mm_30d: u64,
    pub data_source: String,
    pub updated_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ClaimTriggered {
    pub policy_id: String,
    pub farmer: Pubkey,
    pub region: String,
    pub rainfall_actual_mm: u64,
    pub threshold_mm: u64,
    pub payout_usdc: u64,
    pub timestamp: i64,
}

#[event]
pub struct PolicyExpired {
    pub policy_id: String,
    pub farmer: Pubkey,
    pub timestamp: i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum InsuranceError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Invalid input string length")]
    InvalidInput,
    #[msg("Coverage end must be after coverage start")]
    InvalidDates,
    #[msg("Policy is not in Active status")]
    PolicyNotActive,
    #[msg("Coverage period has not ended yet")]
    CoverageNotEnded,
    #[msg("Outside active coverage period")]
    OutsideCoveragePeriod,
    #[msg("Weather data region does not match policy region")]
    RegionMismatch,
    #[msg("Rainfall is above threshold — claim condition not met")]
    ThresholdNotMet,
    #[msg("Weather data is older than 7 days — update required before triggering claims")]
    StaleWeatherData,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized signer")]
    Unauthorized,
}
