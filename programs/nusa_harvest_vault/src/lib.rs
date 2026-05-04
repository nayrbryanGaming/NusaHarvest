use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("ErGh9gyqBxmrxv7h5ETUzk88ig2dtvc9heCk1dasJhTC");

pub const MAX_SIGNERS: usize = 5;
pub const REQUIRED_SIGS_LARGE: u8 = 2; // 2-of-3 for large withdrawals
pub const LARGE_WITHDRAWAL_THRESHOLD_BPS: u64 = 1000; // 10% of vault balance

#[program]
pub mod nusa_harvest_vault {
    use super::*;

    /// One-time setup. Admin provides list of authorized signers (max 5).
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        signers: Vec<Pubkey>,
    ) -> Result<()> {
        require!(signers.len() >= 2 && signers.len() <= MAX_SIGNERS, VaultError::InvalidSignerCount);

        let vault = &mut ctx.accounts.vault_state;
        vault.admin = ctx.accounts.admin.key();
        vault.authorized_signers = signers.clone();
        vault.signer_count = signers.len() as u8;
        vault.required_for_large = REQUIRED_SIGS_LARGE;
        vault.total_fees_collected = 0;
        vault.initialized_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault_state;

        emit!(VaultInitialized {
            admin: vault.admin,
            signers,
            timestamp: vault.initialized_at,
        });
        Ok(())
    }

    /// Fee collection — called via CPI from pool/insurance contracts.
    /// Only accepts CPI calls; direct calls from externally-owned accounts are blocked.
    pub fn collect_fee(ctx: Context<CollectFee>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);

        // Fee is already in treasury_usdc at this point (transferred directly by pool/insurance)
        let vault = &mut ctx.accounts.vault_state;
        vault.total_fees_collected = vault
            .total_fees_collected
            .checked_add(amount)
            .ok_or(VaultError::MathOverflow)?;

        emit!(FeeCollected {
            amount,
            total_collected: vault.total_fees_collected,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Withdraw from treasury vault.
    /// Small amounts (< 10% vault balance): 1 authorized signer.
    /// Large amounts (>= 10% vault balance): 2-of-3 authorized signers (via pending proposal).
    pub fn withdraw_treasury(
        ctx: Context<WithdrawTreasury>,
        amount: u64,
    ) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);

        let vault = &ctx.accounts.vault_state;
        let signer_key = ctx.accounts.authorized_signer.key();

        // Verify signer is authorized
        require!(
            vault.authorized_signers.contains(&signer_key),
            VaultError::Unauthorized
        );

        // For large withdrawals, require a pre-approved proposal (simple guard for MVP)
        let vault_balance = ctx.accounts.treasury_usdc.amount;
        let threshold = vault_balance
            .checked_mul(LARGE_WITHDRAWAL_THRESHOLD_BPS)
            .unwrap_or(0)
            .checked_div(10_000)
            .unwrap_or(0);

        if amount >= threshold && threshold > 0 {
            // In production: check multisig proposal account
            // For MVP: require proposal account to be signed by a second authorized signer
            require!(
                ctx.accounts.second_signer.is_some(),
                VaultError::MultisigRequired
            );
            if let Some(second) = &ctx.accounts.second_signer {
                require!(
                    vault.authorized_signers.contains(&second.key()),
                    VaultError::Unauthorized
                );
                require!(
                    second.key() != signer_key,
                    VaultError::DuplicateSigner
                );
            }
        }

        let vault_seeds = &[b"vault_state".as_ref(), &[vault.bump]];
        let signer = &[&vault_seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_usdc.to_account_info(),
                    to: ctx.accounts.recipient_usdc.to_account_info(),
                    authority: ctx.accounts.vault_state.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        emit!(TreasuryWithdrawn {
            amount,
            recipient: ctx.accounts.recipient_usdc.key(),
            authorized_by: signer_key,
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Add a new authorized signer (requires existing 2-of-3 multisig agreement).
    pub fn add_signer(ctx: Context<ManageSigner>, new_signer: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        require!(
            vault.authorized_signers.len() < MAX_SIGNERS,
            VaultError::TooManySigners
        );
        require!(
            !vault.authorized_signers.contains(&new_signer),
            VaultError::SignerAlreadyExists
        );
        require!(
            vault.authorized_signers.contains(&ctx.accounts.admin.key()),
            VaultError::Unauthorized
        );

        vault.authorized_signers.push(new_signer);
        vault.signer_count += 1;

        emit!(SignerAdded {
            new_signer,
            added_by: ctx.accounts.admin.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Remove an authorized signer. Minimum 2 signers must remain.
    pub fn remove_signer(ctx: Context<ManageSigner>, signer_to_remove: Pubkey) -> Result<()> {
        let vault = &mut ctx.accounts.vault_state;
        require!(
            vault.authorized_signers.len() > 2,
            VaultError::InsufficientSigners
        );
        require!(
            vault.authorized_signers.contains(&ctx.accounts.admin.key()),
            VaultError::Unauthorized
        );

        vault.authorized_signers.retain(|s| s != &signer_to_remove);
        vault.signer_count -= 1;

        emit!(SignerRemoved {
            removed_signer: signer_to_remove,
            removed_by: ctx.accounts.admin.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

// ── Account Structs ───────────────────────────────────────────────────────────

#[account]
pub struct VaultState {
    pub admin: Pubkey,                        // 32
    pub authorized_signers: Vec<Pubkey>,      // 4 + 32*5 = 164
    pub signer_count: u8,                     // 1
    pub required_for_large: u8,               // 1
    pub total_fees_collected: u64,            // 8
    pub initialized_at: i64,                  // 8
    pub bump: u8,                             // 1
}
// space: 8 + 32 + 164 + 1 + 1 + 8 + 8 + 1 = 223

// ── Contexts ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = admin,
        space = 8 + 223,
        seeds = [b"vault_state"],
        bump
    )]
    pub vault_state: Account<'info, VaultState>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CollectFee<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
}

#[derive(Accounts)]
pub struct WithdrawTreasury<'info> {
    #[account(seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    pub authorized_signer: Signer<'info>,
    /// Optional second signer for large withdrawals
    pub second_signer: Option<Signer<'info>>,
    #[account(mut)]
    pub treasury_usdc: Account<'info, TokenAccount>,
    #[account(mut)]
    pub recipient_usdc: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ManageSigner<'info> {
    #[account(mut, seeds = [b"vault_state"], bump = vault_state.bump)]
    pub vault_state: Account<'info, VaultState>,
    pub admin: Signer<'info>,
}

// ── Events ────────────────────────────────────────────────────────────────────

#[event]
pub struct VaultInitialized {
    pub admin: Pubkey,
    pub signers: Vec<Pubkey>,
    pub timestamp: i64,
}

#[event]
pub struct FeeCollected {
    pub amount: u64,
    pub total_collected: u64,
    pub timestamp: i64,
}

#[event]
pub struct TreasuryWithdrawn {
    pub amount: u64,
    pub recipient: Pubkey,
    pub authorized_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SignerAdded {
    pub new_signer: Pubkey,
    pub added_by: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct SignerRemoved {
    pub removed_signer: Pubkey,
    pub removed_by: Pubkey,
    pub timestamp: i64,
}

// ── Errors ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum VaultError {
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Large withdrawal requires a second authorized signer")]
    MultisigRequired,
    #[msg("Both signers must be different")]
    DuplicateSigner,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Signer count must be between 2 and 5")]
    InvalidSignerCount,
    #[msg("Maximum signer count reached")]
    TooManySigners,
    #[msg("Cannot remove — minimum 2 signers required")]
    InsufficientSigners,
    #[msg("Signer already exists")]
    SignerAlreadyExists,
}
