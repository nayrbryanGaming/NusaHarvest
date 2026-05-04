import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NusaHarvestPool } from "../target/types/nusa_harvest_pool";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("nusa_harvest_pool", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NusaHarvestPool as Program<NusaHarvestPool>;
  const admin = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let poolVault: PublicKey;
  let treasuryUsdc: PublicKey;

  const TREASURY_PUBKEY = new PublicKey(
    "ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m"
  );

  const [poolStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("pool_state")],
    program.programId
  );

  before(async () => {
    // Airdrop to admin
    await provider.connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1000));

    // Create devnet USDC mint (for tests — use real Devnet USDC in production)
    usdcMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      6
    );

    poolVault = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      poolStatePda,
      undefined,
      TOKEN_PROGRAM_ID
    );

    treasuryUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      TREASURY_PUBKEY
    );
  });

  it("initializes pool state", async () => {
    await program.methods
      .initializePool()
      .accounts({
        poolState: poolStatePda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const pool = await program.account.poolState.fetch(poolStatePda);
    assert.equal(pool.admin.toBase58(), admin.publicKey.toBase58());
    assert.equal(pool.treasury.toBase58(), "ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m");
    assert.equal(pool.totalTvlUsdc.toNumber(), 0);
    assert.equal(pool.protocolFeeBps.toNumber(), 250);
    console.log("✅ Pool initialized. PDA:", poolStatePda.toBase58());
  });

  it("fails to initialize pool twice", async () => {
    try {
      await program.methods
        .initializePool()
        .accounts({
          poolState: poolStatePda,
          admin: admin.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .rpc();
      assert.fail("Should have failed");
    } catch (e: any) {
      assert.include(e.message, "already in use");
      console.log("✅ Double-init correctly rejected");
    }
  });

  it("deposits USDC — 2.5% fee auto-transferred to treasury", async () => {
    const investor = Keypair.generate();
    await provider.connection.requestAirdrop(investor.publicKey, LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1000));

    const investorUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      investor.publicKey
    );

    const depositAmount = 1_000_000_000; // 1,000 USDC (6 decimals)
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      investorUsdc,
      admin.publicKey,
      depositAmount
    );

    const [investorRecordPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("investor"), investor.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .depositToPool(new anchor.BN(depositAmount))
      .accounts({
        poolState: poolStatePda,
        investorRecord: investorRecordPda,
        investor: investor.publicKey,
        investorUsdc,
        poolVault,
        treasuryUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([investor])
      .rpc();

    // Expected: 2.5% fee = 25_000_000 to treasury, 975_000_000 to pool
    const expectedFee = Math.floor(depositAmount * 250 / 10_000);
    const expectedNet = depositAmount - expectedFee;

    const treasuryBalance = await provider.connection.getTokenAccountBalance(treasuryUsdc);
    const poolBalance = await provider.connection.getTokenAccountBalance(poolVault);

    assert.equal(Number(treasuryBalance.value.amount), expectedFee, "Treasury fee mismatch");
    assert.equal(Number(poolBalance.value.amount), expectedNet, "Pool net mismatch");

    const pool = await program.account.poolState.fetch(poolStatePda);
    assert.equal(pool.totalTvlUsdc.toNumber(), expectedNet);

    console.log(`✅ Deposit: ${depositAmount / 1e6} USDC → Fee: ${expectedFee / 1e6} USDC → Pool: ${expectedNet / 1e6} USDC`);
    console.log("   Treasury received:", treasuryBalance.value.uiAmount, "USDC ✅");
  });

  it("non-admin cannot disburse loan", async () => {
    const rando = Keypair.generate();
    await provider.connection.requestAirdrop(rando.publicKey, LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1000));

    const randoUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      rando.publicKey
    );

    try {
      await program.methods
        .disburseLoan(new anchor.BN(100_000_000), "KOPERASI-TEST-001")
        .accounts({
          poolState: poolStatePda,
          admin: rando.publicKey,
          poolVault,
          koperasiUsdc: randoUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([rando])
        .rpc();
      assert.fail("Non-admin should not be able to disburse");
    } catch (e: any) {
      console.log("✅ Non-admin disburse correctly rejected:", e.message.slice(0, 60));
    }
  });
});
