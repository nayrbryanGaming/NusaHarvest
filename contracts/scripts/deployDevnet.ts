#!/usr/bin/env ts-node
/**
 * Nusa Harvest — Solana Devnet Deployment Script
 *
 * Prerequisites:
 *   - Solana CLI installed: sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
 *   - Anchor CLI: cargo install --git https://github.com/coral-xyz/anchor avm --locked
 *   - Wallet keypair at ~/.config/solana/id.json with SOL on devnet
 *   - Run: solana airdrop 2 (on devnet)
 *
 * Execute:
 *   cd contracts
 *   anchor build
 *   anchor deploy --provider.cluster devnet
 *   ts-node scripts/deployDevnet.ts
 */

import * as anchor from '@coral-xyz/anchor'
import { Program } from '@coral-xyz/anchor'
import { Connection, Keypair, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import path from 'path'

const DEVNET_RPC = 'https://api.devnet.solana.com'

async function main() {
  console.log('\n🌾 Nusa Harvest — Devnet Deployment Script')
  console.log('==========================================\n')

  // Load wallet
  const walletPath = path.join(homedir(), '.config', 'solana', 'id.json')
  const secretKey = JSON.parse(readFileSync(walletPath, 'utf-8'))
  const keypair = Keypair.fromSecretKey(new Uint8Array(secretKey))

  const connection = new Connection(DEVNET_RPC, 'confirmed')
  const wallet = new anchor.Wallet(keypair)
  const provider = new anchor.AnchorProvider(connection, wallet, {
    preflightCommitment: 'confirmed'
  })
  anchor.setProvider(provider)

  console.log(`👛 Deployer wallet: ${keypair.publicKey.toBase58()}`)
  const balance = await connection.getBalance(keypair.publicKey)
  console.log(`💰 Balance: ${(balance / 1e9).toFixed(4)} SOL`)

  if (balance < 0.5 * 1e9) {
    console.log('⚠️  Low balance! Run: solana airdrop 2 --url devnet')
    const airdropSig = await connection.requestAirdrop(keypair.publicKey, 2 * 1e9)
    await connection.confirmTransaction(airdropSig, 'confirmed')
    console.log(`✅ Airdrop received. Tx: ${airdropSig}`)
  }

  // Load IDL
  const idl = JSON.parse(readFileSync(path.join(__dirname, '../target/idl/nusa_harvest.json'), 'utf-8'))
  const programId = new PublicKey(idl.address)
  const program = new Program(idl, provider)

  console.log(`\n📋 Program ID: ${programId.toBase58()}`)
  console.log(`🌐 Network: Devnet`)

  // ── Initialize a Rice Pool on devnet ────────────────────────────────────
  console.log('\n🏊 Initializing Rice Pool (Java region)...')

  const commodity = 'RICE'
  const region = 'JAVA'

  const [poolPda, poolBump] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), Buffer.from(commodity), Buffer.from(region)],
    programId
  )

  console.log(`   Pool PDA: ${poolPda.toBase58()}`)

  try {
    const tx = await program.methods
      .initializePool(
        commodity,
        region,
        1,      // junior tranche
        800     // 8% APY in basis points
      )
      .accounts({
        pool: poolPda,
        authority: keypair.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId
      })
      .signers([keypair])
      .rpc()

    console.log(`\n✅ Pool initialized!`)
    console.log(`   Transaction Signature: ${tx}`)
    console.log(`   Devnet Explorer: https://explorer.solana.com/tx/${tx}?cluster=devnet`)

    // Fetch and display the created pool account
    const poolAccount = await (program.account as any).pool.fetch(poolPda)
    console.log('\n📊 Pool Account State:')
    console.log(`   Commodity:    ${poolAccount.commodity}`)
    console.log(`   Region:       ${poolAccount.region}`)
    console.log(`   Risk Tranche: ${poolAccount.riskTranche} (Junior)`)
    console.log(`   Base APY:     ${poolAccount.baseApyBps / 100}%`)
    console.log(`   Total Deposits: ${poolAccount.totalDepositedUsdc / 1e6} USDC`)
    console.log(`   Is Paused:    ${poolAccount.isPaused}`)

    // Summary output
    console.log('\n' + '='.repeat(60))
    console.log('DEPLOYMENT PROOF — SAVE THIS INFORMATION')
    console.log('='.repeat(60))
    console.log(`Program ID:     ${programId.toBase58()}`)
    console.log(`Pool Address:   ${poolPda.toBase58()}`)
    console.log(`Deploy Tx Hash: ${tx}`)
    console.log(`Network:        Solana Devnet`)
    console.log(`Explorer URL:   https://explorer.solana.com/address/${poolPda.toBase58()}?cluster=devnet`)
    console.log('='.repeat(60))

    // Write proof to file
    const proof = {
      deployedAt: new Date().toISOString(),
      network: 'devnet',
      programId: programId.toBase58(),
      pools: [
        {
          name: `${commodity} Pool — ${region}`,
          address: poolPda.toBase58(),
          txSignature: tx,
          explorerUrl: `https://explorer.solana.com/tx/${tx}?cluster=devnet`,
          poolExplorerUrl: `https://explorer.solana.com/address/${poolPda.toBase58()}?cluster=devnet`
        }
      ],
      deployerWallet: keypair.publicKey.toBase58()
    }

    const { writeFileSync } = await import('fs')
    writeFileSync(
      path.join(__dirname, '../DEPLOYMENT_PROOF.json'),
      JSON.stringify(proof, null, 2)
    )
    console.log('\n💾 Deployment proof saved to contracts/DEPLOYMENT_PROOF.json')

  } catch (err: any) {
    if (err.message?.includes('already in use')) {
      console.log('ℹ️  Pool already initialized on devnet. Fetching existing state...')
      const poolAccount = await (program.account as any).pool.fetch(poolPda)
      console.log('Existing pool:', JSON.stringify(poolAccount, null, 2))
    } else {
      console.error('❌ Deployment failed:', err.message)
      throw err
    }
  }
}

main().catch(console.error)
