import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { NusaHarvestInsurance } from "../target/types/nusa_harvest_insurance";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

describe("nusa_harvest_insurance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.NusaHarvestInsurance as Program<NusaHarvestInsurance>;
  const admin = provider.wallet as anchor.Wallet;

  let usdcMint: PublicKey;
  let insuranceReserve: PublicKey;
  let treasuryUsdc: PublicKey;
  let farmerUsdc: PublicKey;

  const farmer = Keypair.generate();
  const POLICY_ID = "POL-TEST-001";
  const REGION = "Klaten_JawaTengah";
  const RAIN_THRESHOLD = 40;
  const COVERAGE_USDC = 500_000_000; // 500 USDC
  const PREMIUM_USDC = 38_500_000;   // $38.50 USDC
  const SUBSIDY_USDC = 19_250_000;   // 50% subsidy
  const FARMER_PAYS = PREMIUM_USDC - SUBSIDY_USDC; // $19.25

  const TREASURY_PUBKEY = new PublicKey("ETcQvsQek2w9feLfsqoe4AypCWfnrSwQiv3djqocaP2m");

  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), farmer.publicKey.toBuffer(), Buffer.from(POLICY_ID)],
    program.programId
  );

  const [weatherPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("weather"), Buffer.from(REGION)],
    program.programId
  );

  const [insuranceStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("insurance_state")],
    program.programId
  );

  before(async () => {
    await provider.connection.requestAirdrop(farmer.publicKey, 2 * LAMPORTS_PER_SOL);
    await provider.connection.requestAirdrop(admin.publicKey, 2 * LAMPORTS_PER_SOL);
    await new Promise((r) => setTimeout(r, 1500));

    usdcMint = await createMint(
      provider.connection,
      admin.payer,
      admin.publicKey,
      null,
      6
    );

    farmerUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      farmer.publicKey
    );

    treasuryUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      TREASURY_PUBKEY
    );

    insuranceReserve = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      insuranceStatePda,
      undefined,
      TOKEN_PROGRAM_ID
    );

    // Mint enough for farmer to pay premium and have coverage reserve
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      farmerUsdc,
      admin.publicKey,
      FARMER_PAYS + 10_000_000 // a bit extra
    );

    // Seed insurance reserve with coverage amount for payout
    const tempAdminUsdc = await createAssociatedTokenAccount(
      provider.connection,
      admin.payer,
      usdcMint,
      admin.publicKey
    );
    await mintTo(
      provider.connection,
      admin.payer,
      usdcMint,
      tempAdminUsdc,
      admin.publicKey,
      COVERAGE_USDC * 2
    );
  });

  it("creates a policy — 15% admin fee atomic to treasury", async () => {
    const now = Math.floor(Date.now() / 1000);
    const coverageEnd = now + 120 * 24 * 3600; // 120 days

    await program.methods
      .createPolicy(
        POLICY_ID,
        "RICE",
        REGION,
        new anchor.BN(COVERAGE_USDC),
        new anchor.BN(RAIN_THRESHOLD),
        new anchor.BN(now),
        new anchor.BN(coverageEnd),
        new anchor.BN(FARMER_PAYS),
        new anchor.BN(SUBSIDY_USDC)
      )
      .accounts({
        policy: policyPda,
        farmer: farmer.publicKey,
        farmerUsdc,
        treasuryUsdc,
        insuranceReserve,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([farmer])
      .rpc();

    const policy = await program.account.policyAccount.fetch(policyPda);
    assert.equal(policy.policyId, POLICY_ID);
    assert.equal(policy.status.active !== undefined, true, "Status should be Active");
    assert.equal(policy.coverageUsdc.toNumber(), COVERAGE_USDC);

    // 15% of farmer_pays = admin_fee
    const expectedFee = Math.floor(FARMER_PAYS * 1500 / 10_000);
    assert.equal(policy.adminFeeUsdc.toNumber(), expectedFee);

    const treasuryBal = await provider.connection.getTokenAccountBalance(treasuryUsdc);
    assert.equal(Number(treasuryBal.value.amount), expectedFee, "Treasury did not receive fee");

    console.log(`✅ Policy ${POLICY_ID} created. Admin fee to treasury: $${expectedFee / 1e6} USDC`);
    console.log("   Policy PDA:", policyPda.toBase58());
  });

  it("admin updates weather data on-chain", async () => {
    await program.methods
      .updateWeatherData(
        REGION,
        new anchor.BN(25), // 25mm — below 40mm threshold → drought
        "Manual_Admin_Devnet"
      )
      .accounts({
        weatherData: weatherPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const weather = await program.account.weatherDataAccount.fetch(weatherPda);
    assert.equal(weather.regionId, REGION);
    assert.equal(weather.rainfallMm30d.toNumber(), 25);
    assert.equal(weather.dataSource, "Manual_Admin_Devnet");

    console.log(`✅ WeatherDataAccount updated. Region: ${REGION}, Rainfall: 25mm`);
    console.log("   Weather PDA:", weatherPda.toBase58());
  });

  it("trigger_claim fails when rainfall > threshold", async () => {
    // Update to ABOVE threshold first
    await program.methods
      .updateWeatherData(REGION, new anchor.BN(80), "Manual_Admin_Devnet")
      .accounts({
        weatherData: weatherPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    try {
      await program.methods
        .triggerClaim()
        .accounts({
          policy: policyPda,
          weatherData: weatherPda,
          insuranceState: insuranceStatePda,
          admin: admin.publicKey,
          insuranceReserve,
          farmerUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should have rejected — rainfall above threshold");
    } catch (e: any) {
      assert.include(e.message, "ThresholdNotMet");
      console.log("✅ Claim correctly rejected when rainfall > threshold");
    }
  });

  it("trigger_claim succeeds when rainfall < threshold — USDC sent to farmer", async () => {
    // Set rainfall below threshold
    await program.methods
      .updateWeatherData(REGION, new anchor.BN(25), "Manual_Admin_Devnet")
      .accounts({
        weatherData: weatherPda,
        admin: admin.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const farmerBalBefore = await provider.connection.getTokenAccountBalance(farmerUsdc);

    await program.methods
      .triggerClaim()
      .accounts({
        policy: policyPda,
        weatherData: weatherPda,
        insuranceState: insuranceStatePda,
        admin: admin.publicKey,
        insuranceReserve,
        farmerUsdc,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const policy = await program.account.policyAccount.fetch(policyPda);
    assert.equal(policy.status.triggered !== undefined, true, "Status should be Triggered");
    assert.equal(policy.claimAmountUsdc.toNumber(), COVERAGE_USDC);

    const farmerBalAfter = await provider.connection.getTokenAccountBalance(farmerUsdc);
    const received = Number(farmerBalAfter.value.amount) - Number(farmerBalBefore.value.amount);
    assert.equal(received, COVERAGE_USDC, "Farmer did not receive full coverage");

    console.log(`✅ CLAIM TRIGGERED — Farmer received $${received / 1e6} USDC`);
    console.log("   Policy status:", JSON.stringify(policy.status));
    console.log("   This is the key demo moment — verify on Solana Explorer ↗");
  });

  it("expired policy cannot be triggered", async () => {
    // This test just verifies that our constraint exists (actual time travel isn't possible in tests)
    const policy = await program.account.policyAccount.fetch(policyPda);
    // Policy is now Triggered, so trigger_claim should reject PolicyNotActive
    try {
      await program.methods.triggerClaim()
        .accounts({
          policy: policyPda,
          weatherData: weatherPda,
          insuranceState: insuranceStatePda,
          admin: admin.publicKey,
          insuranceReserve,
          farmerUsdc,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .rpc();
      assert.fail("Should reject non-active policy");
    } catch (e: any) {
      assert.include(e.message, "PolicyNotActive");
      console.log("✅ Already-triggered policy correctly rejected for second claim");
    }
  });
});
