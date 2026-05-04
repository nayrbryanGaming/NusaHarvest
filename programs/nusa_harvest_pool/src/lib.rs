use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("3E4wxrT28UqM2ua9n2XnzMMdGoyuR7qZ9VtXQ29XGAgt");

// Treasury wallet — hardcoded, immutable
pub const TREASURY: &str = "ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m";
pub const PROTOCOL_FEE_BPS: u64 = 250; // 2.5%
pub const RESERVE_RATIO_BPS: u64 = 2000; // 20% minimum reserve
pub const INVESTOR_APY_BPS: u64 = 500; // 5% APY to investors
pub const SPREAD_FEE_BPS: u64 = 100; // 1% APY to treasury on repayment

#[program]
pub mod nusa_harvest_pool {
    use super::*;

    /// One-time initialization — only admin can call.
    /// Creates the global PoolState PDA.
    pub fn initialize_pool(ctx: Context<InitializePool>) -> Result<()> {
        let pool = &mut ctx.accounts.pool_state;
        pool.admin = ctx.accounts.admin.key();
        pool.treasury = TREASURY.parse().unwrap();
        pool.total_tvl_usdc = 0;
        pool.total_reserve_usdc = 0;
        pool.total_loans_active_usdc = 0;
        pool.active_policies_count = 0;
        pool.protocol_fee_bps = PROTOCOL_FEE_BPS;
        pool.initialized_at = Clock::get()?.unix_timestamp;
        pool.bump = ctx.bumps.pool_state;
        emit!(PoolInitialized {
            admin: pool.admin,
            treasury: pool.treasury,
            timestamp: pool.initialized_at,
        });
        Ok(())
    }

    /// Investor deposits USDC into the pool.
    /// 2.5% fee transferred atomically to treasury before adding to pool.
    pub fn deposit_to_pool(ctx: Context<DepositToPool>, amount_usdc: u64) -> Result<()> {
        require!(amount_usdc > 0, PoolError::InvalidAmount);

        let fee = amount_usdc
            .checked_mul(PROTOCOL_FEE_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;
        let net = amount_usdc.checked_sub(fee).ok_or(PoolError::MathOverflow)?;

        // Transfer fee to treasury
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.investor_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.investor.to_account_info(),
                },
            ),
            fee,
        )?;

        // Transfer net to pool vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.investor_usdc.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.investor.to_account_info(),
                },
            ),
            net,
        )?;

        // Update investor record
        let record = &mut ctx.accounts.investor_record;
        record.investor = ctx.accounts.investor.key();
        record.deposited_usdc = record
            .deposited_usdc
            .checked_add(net)
            .ok_or(PoolError::MathOverflow)?;
        record.last_deposit_at = Clock::get()?.unix_timestamp;
        record.bump = ctx.bumps.investor_record;

        // Update pool state
        let pool = &mut ctx.accounts.pool_state;
        pool.total_tvl_usdc = pool
            .total_tvl_usdc
            .checked_add(net)
            .ok_or(PoolError::MathOverflow)?;
        pool.total_reserve_usdc = pool
            .total_tvl_usdc
            .checked_mul(RESERVE_RATIO_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;

        emit!(DepositMade {
            investor: ctx.accounts.investor.key(),
            amount_gross: amount_usdc,
            fee_to_treasury: fee,
            net_to_pool: net,
            new_tvl: pool.total_tvl_usdc,
            timestamp: record.last_deposit_at,
        });
        Ok(())
    }

    /// Investor withdraws USDC. 2.5% exit fee to treasury.
    /// Cannot withdraw more than 80% liquid portion.
    pub fn withdraw_from_pool(ctx: Context<WithdrawFromPool>, amount_usdc: u64) -> Result<()> {
        require!(amount_usdc > 0, PoolError::InvalidAmount);

        let pool = &ctx.accounts.pool_state;
        let record = &ctx.accounts.investor_record;

        require!(
            record.deposited_usdc >= amount_usdc,
            PoolError::InsufficientBalance
        );

        // Enforce 20% reserve — only 80% liquid
        let max_withdrawable = pool
            .total_tvl_usdc
            .checked_mul(10_000 - RESERVE_RATIO_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;
        require!(amount_usdc <= max_withdrawable, PoolError::ReserveConstraint);

        let fee = amount_usdc
            .checked_mul(PROTOCOL_FEE_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;
        let net = amount_usdc.checked_sub(fee).ok_or(PoolError::MathOverflow)?;

        let pool_seeds = &[b"pool_state".as_ref(), &[pool.bump]];
        let signer = &[&pool_seeds[..]];

        // Fee to treasury from vault
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.pool_state.to_account_info(),
                },
                signer,
            ),
            fee,
        )?;

        // Net to investor
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.investor_usdc.to_account_info(),
                    authority: ctx.accounts.pool_state.to_account_info(),
                },
                signer,
            ),
            net,
        )?;

        let record = &mut ctx.accounts.investor_record;
        record.deposited_usdc = record
            .deposited_usdc
            .checked_sub(amount_usdc)
            .ok_or(PoolError::MathOverflow)?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_tvl_usdc = pool
            .total_tvl_usdc
            .checked_sub(amount_usdc)
            .ok_or(PoolError::MathOverflow)?;
        pool.total_reserve_usdc = pool
            .total_tvl_usdc
            .checked_mul(RESERVE_RATIO_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;

        emit!(WithdrawalMade {
            investor: ctx.accounts.investor.key(),
            amount_gross: amount_usdc,
            fee_to_treasury: fee,
            net_to_investor: net,
            new_tvl: pool.total_tvl_usdc,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Admin disburses a loan to a koperasi wallet. Records on-chain.
    pub fn disburse_loan(
        ctx: Context<DisburseLoan>,
        amount_usdc: u64,
        koperasi_id: String,
    ) -> Result<()> {
        require!(amount_usdc > 0, PoolError::InvalidAmount);
        require!(koperasi_id.len() <= 64, PoolError::InvalidInput);

        let pool = &ctx.accounts.pool_state;
        require!(
            pool.admin == ctx.accounts.admin.key(),
            PoolError::Unauthorized
        );

        // Cannot lend more than 80% of TVL (keep 20% reserve)
        let max_lendable = pool
            .total_tvl_usdc
            .checked_mul(10_000 - RESERVE_RATIO_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;
        let already_lent = pool.total_loans_active_usdc;
        require!(
            already_lent.checked_add(amount_usdc).unwrap_or(u64::MAX) <= max_lendable,
            PoolError::ReserveConstraint
        );

        let pool_seeds = &[b"pool_state".as_ref(), &[pool.bump]];
        let signer = &[&pool_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.koperasi_usdc.to_account_info(),
                    authority: ctx.accounts.pool_state.to_account_info(),
                },
                signer,
            ),
            amount_usdc,
        )?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_loans_active_usdc = pool
            .total_loans_active_usdc
            .checked_add(amount_usdc)
            .ok_or(PoolError::MathOverflow)?;

        emit!(LoanDisbursed {
            koperasi: ctx.accounts.koperasi_usdc.key(),
            koperasi_id,
            amount_usdc,
            total_active_loans: pool.total_loans_active_usdc,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Koperasi repays loan principal + interest.
    /// 1% APY spread goes to treasury; 5% APY goes to pool (investor yield).
    pub fn repay_loan(ctx: Context<RepayLoan>, principal: u64, interest: u64) -> Result<()> {
        let total = principal.checked_add(interest).ok_or(PoolError::MathOverflow)?;
        require!(total > 0, PoolError::InvalidAmount);

        // Treasury gets 1% spread of interest
        let treasury_cut = interest
            .checked_mul(SPREAD_FEE_BPS)
            .ok_or(PoolError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(PoolError::MathOverflow)?;
        let pool_interest = interest.checked_sub(treasury_cut).ok_or(PoolError::MathOverflow)?;

        // Principal back to pool
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.koperasi_usdc.to_account_info(),
                    to: ctx.accounts.pool_vault.to_account_info(),
                    authority: ctx.accounts.koperasi.to_account_info(),
                },
            ),
            principal.checked_add(pool_interest).ok_or(PoolError::MathOverflow)?,
        )?;

        // Treasury cut
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.koperasi_usdc.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.koperasi.to_account_info(),
                },
            ),
            treasury_cut,
        )?;

        let pool = &mut ctx.accounts.pool_state;
        pool.total_loans_active_usdc = pool
            .total_loans_active_usdc
            .checked_sub(principal)
            .ok_or(PoolError::MathOverflow)?;
        pool.total_tvl_usdc = pool
            .total_tvl_usdc
            .checked_add(pool_interest)
            .ok_or(PoolError::MathOverflow)?;

        emit!(LoanRepaid {
            koperasi: ctx.accounts.koperasi.key(),
            principal,
            interest_total: interest,
            to_treasury: treasury_cut,
            to_pool: pool_interest,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ── Account Structs ───────────────────────────────────────────────────────────

#[account]
pub struct PoolState {
    pub admin: Pubkey,           // 32
    pub treasury: Pubkey,        // 32
    pub total_tvl_usdc: u64,     // 8
    pub total_reserve_usdc: u64, // 8
    pub total_loans_active_usdc: u64, // 8
    pub active_policies_count: u64, // 8
    pub protocol_fee_bps: u64,   // 8
    pub initialized_at: i64,     // 8
    pub bump: u8,                // 1
}
// discriminator=8, total=8+32+32+8+8+8+8+8+8+1 = 121

#[account]
pub struct InvestorRecord {
    pub investor: Pubkey,        // 32
    pub deposited_usdc: u64,     // 8
    pub last_deposit_at: i64,    // 8
    pub bump: u8,                // 1
}
// discriminator=8, total=8+32+8+8+1 = 57

// ── Contexts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 121,
        seeds = [b"pool_state"],
        bump
    )]
    pub pool_state: Account<'info, PoolState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositToPool<'info> {
    #[account(mut, seeds = [b"pool_state"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(
        init_if_needed,
        payer = investor,
        space = 8 + 57,
        seeds = [b"investor", investor.key().as_ref()],
        bump
    )]
    pub investor_record: Account<'info, InvestorRecord>,
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut, constraint = investor_usdc.owner == investor.key() @ PoolError::Unauthorized)]
    pub investor_usdc: Account<'info, TokenAccount>,
    #[account(mut, constraint = pool_vault.owner == pool_state.key() @ PoolError::Unauthorized)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_usdc.owner == pool_state.treasury @ PoolError::Unauthorized)]
    pub treasury_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFromPool<'info> {
    #[account(mut, seeds = [b"pool_state"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    #[account(mut, seeds = [b"investor", investor.key().as_ref()], bump = investor_record.bump)]
    pub investor_record: Account<'info, InvestorRecord>,
    #[account(mut)]
    pub investor: Signer<'info>,
    #[account(mut, constraint = investor_usdc.owner == investor.key() @ PoolError::Unauthorized)]
    pub investor_usdc: Account<'info, TokenAccount>,
    #[account(mut, constraint = pool_vault.owner == pool_state.key() @ PoolError::Unauthorized)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_usdc.owner == pool_state.treasury @ PoolError::Unauthorized)]
    pub treasury_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DisburseLoan<'info> {
    #[account(mut, seeds = [b"pool_state"], bump = pool_state.bump, has_one = admin)]
    pub pool_state: Account<'info, PoolState>,
    pub admin: Signer<'info>,
    #[account(mut, constraint = pool_vault.owner == pool_state.key() @ PoolError::Unauthorized)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub koperasi_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RepayLoan<'info> {
    #[account(mut, seeds = [b"pool_state"], bump = pool_state.bump)]
    pub pool_state: Account<'info, PoolState>,
    pub koperasi: Signer<'info>,
    #[account(mut, constraint = koperasi_usdc.owner == koperasi.key() @ PoolError::Unauthorized)]
    pub koperasi_usdc: Account<'info, TokenAccount>,
    #[account(mut, constraint = pool_vault.owner == pool_state.key() @ PoolError::Unauthorized)]
    pub pool_vault: Account<'info, TokenAccount>,
    #[account(mut, constraint = treasury_usdc.owner == pool_state.treasury @ PoolError::Unauthorized)]
    pub treasury_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct PoolInitialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct DepositMade {
    pub investor: Pubkey,
    pub amount_gross: u64,
    pub fee_to_treasury: u64,
    pub net_to_pool: u64,
    pub new_tvl: u64,
    pub timestamp: i64,
}

#[event]
pub struct WithdrawalMade {
    pub investor: Pubkey,
    pub amount_gross: u64,
    pub fee_to_treasury: u64,
    pub net_to_investor: u64,
    pub new_tvl: u64,
    pub timestamp: i64,
}

#[event]
pub struct LoanDisbursed {
    pub koperasi: Pubkey,
    pub koperasi_id: String,
    pub amount_usdc: u64,
    pub total_active_loans: u64,
    pub timestamp: i64,
}

#[event]
pub struct LoanRepaid {
    pub koperasi: Pubkey,
    pub principal: u64,
    pub interest_total: u64,
    pub to_treasury: u64,
    pub to_pool: u64,
    pub timestamp: i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum PoolError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Insufficient investor balance")]
    InsufficientBalance,
    #[msg("Action would violate 20% reserve constraint")]
    ReserveConstraint,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Invalid input string")]
    InvalidInput,
}
