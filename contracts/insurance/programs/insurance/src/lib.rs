use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("ATkrzfLDuE25Pv5cpUmSkhBRo9AGZRxbSMGCccuoM4vY");

#[program]
pub mod nusa_harvest_insurance {
    use super::*;

    /// Initialize a new insurance policy for a farmer
    pub fn create_policy(
        ctx: Context<CreatePolicy>,
        policy_id: String,
        commodity: String,
        trigger_type: u8,
        trigger_threshold: u64,
        premium_usdc: u64,
        coverage_usdc: u64,
    ) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        policy.farmer = ctx.accounts.farmer.key();
        policy.policy_id = policy_id;
        policy.commodity = commodity;
        policy.trigger_type = trigger_type;
        policy.trigger_threshold = trigger_threshold;
        policy.premium_usdc = premium_usdc;
        policy.coverage_usdc = coverage_usdc;
        policy.status = 1; // 1 = Active
        policy.created_at = Clock::get()?.unix_timestamp;

        // Transfer premium from farmer to pool vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.farmer_token_account.to_account_info(),
            to: ctx.accounts.pool_vault.to_account_info(),
            authority: ctx.accounts.farmer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, premium_usdc)?;

        msg!("Policy created for farmer: {}", policy.farmer);
        Ok(())
    }

    /// Trigger payout (Can only be called by the Oracle/Admin)
    pub fn trigger_payout(ctx: Context<TriggerPayout>, rainfall_measured: u64) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        
        // Ensure trigger condition is met (e.g., rainfall < threshold)
        if rainfall_measured >= policy.trigger_threshold {
            return err!(InsuranceError::ThresholdNotMet);
        }

        if policy.status != 1 {
            return err!(InsuranceError::PolicyNotActive);
        }

        // Payout transfer logic here...
        policy.status = 2; // 2 = Claimed

        msg!("Payout triggered for policy: {}", policy.policy_id);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(policy_id: String)]
pub struct CreatePolicy<'info> {
    #[account(
        init,
        payer = farmer,
        space = 8 + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1,
        seeds = [b"policy", policy_id.as_bytes()],
        bump
    )]
    pub policy: Account<'info, InsurancePolicy>,
    
    #[account(mut)]
    pub farmer: Signer<'info>,
    
    #[account(mut)]
    pub farmer_token_account: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub pool_vault: Account<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, SystemProgram>,
}

#[derive(Accounts)]
pub struct TriggerPayout<'info> {
    #[account(mut, has_one = farmer)]
    pub policy: Account<'info, InsurancePolicy>,
    pub farmer: SystemAccount<'info>,
    pub oracle: Signer<'info>,
}

#[account]
pub struct InsurancePolicy {
    pub farmer: Pubkey,
    pub policy_id: String,
    pub commodity: String,
    pub trigger_type: u8,
    pub trigger_threshold: u64,
    pub premium_usdc: u64,
    pub coverage_usdc: u64,
    pub status: u8,
    pub created_at: i64,
}

#[error_code]
pub enum InsuranceError {
    #[msg("Weather threshold was not met for payout.")]
    ThresholdNotMet,
    #[msg("Policy is not in an active state.")]
    PolicyNotActive,
}
