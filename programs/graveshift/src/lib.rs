use anchor_lang::prelude::*;

declare_id!("6hJAy23ndpQii5QzVmXTjGjgmDPhhPEQNvrd5o9S8JWF");

#[program]
pub mod graveshift {
    use super::*;

    pub fn initialize_migration(ctx: Context<InitializeMigration>, eth_asset_id: String) -> Result<()> {
        let migration_record = &mut ctx.accounts.migration_record;
        migration_record.user = *ctx.accounts.user.key;
        migration_record.eth_asset_id = eth_asset_id;
        migration_record.status = MigrationStatus::Initiated as u8;
        
        msg!("Migration record created for ETH asset: {}", migration_record.eth_asset_id);
        Ok(())
    }

    pub fn complete_migration(ctx: Context<CompleteMigration>) -> Result<()> {
        let migration_record = &mut ctx.accounts.migration_record;
        
        // Mark as completed
        migration_record.status = MigrationStatus::Completed as u8;
        
        msg!("Migration completed for user: {}", migration_record.user);
        // Minting logic for KYD ticket / NFT can be added here or in another instruction via CPI.
        
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(eth_asset_id: String)]
pub struct InitializeMigration<'info> {
    #[account(
        init, 
        payer = user, 
        space = 8 + 32 + 4 + eth_asset_id.len() + 1,
        seeds = [b"migration", user.key().as_ref(), eth_asset_id.as_bytes()],
        bump
    )]
    pub migration_record: Account<'info, MigrationRecord>,

    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CompleteMigration<'info> {
    #[account(
        mut,
        seeds = [b"migration", user.key().as_ref(), migration_record.eth_asset_id.as_bytes()],
        bump
    )]
    pub migration_record: Account<'info, MigrationRecord>,
    
    // Only the user could finish it (or perhaps a trusted relayer/server if we were doing real bridging)
    #[account(mut)]
    pub user: Signer<'info>,
}

#[account]
pub struct MigrationRecord {
    pub user: Pubkey,
    pub eth_asset_id: String,
    pub status: u8,
}

#[derive(Clone, Copy, AnchorSerialize, AnchorDeserialize)]
pub enum MigrationStatus {
    Initiated = 0,
    Completed = 1,
}
