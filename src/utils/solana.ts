import { 
  Connection, 
  Transaction, 
  SystemProgram, 
  PublicKey,
  TransactionInstruction
} from '@solana/web3.js'
import { getProgramId, RPC_URL } from './constants'

let cachedProgramCheck: { checkedAt: number; deployed: boolean } | null = null
const PROGRAM_CHECK_TTL_MS = 30_000

// Anchor Discriminator for 'global:create_policy'
// sha256("global:create_policy").slice(0, 8)
const CREATE_POLICY_DISCRIMINATOR = Buffer.from([11, 237, 241, 203, 114, 219, 137, 245]);

export async function isProtocolProgramDeployed(force = false): Promise<boolean> {
  if (!force && cachedProgramCheck && Date.now() - cachedProgramCheck.checkedAt < PROGRAM_CHECK_TTL_MS) {
    return cachedProgramCheck.deployed
  }

  const connection = new Connection(RPC_URL, 'confirmed')
  const programId = getProgramId()
  const programAccount = await connection.getAccountInfo(programId, 'confirmed')
  const deployed = Boolean(programAccount?.executable)

  cachedProgramCheck = {
    checkedAt: Date.now(),
    deployed
  }

  return deployed
}

export async function assertProtocolProgramDeployed(): Promise<void> {
  const deployed = await isProtocolProgramDeployed(true)
  if (!deployed) {
    throw new Error('Program asuransi belum terdeploy di Solana Devnet. Transaksi dibatalkan untuk menjaga integritas data.')
  }
}

export async function createPolicyTransaction(
  farmerPubkey: string,
  policyData: {
    policyId: string,
    commodity: string,
    triggerThreshold: number,
    payoutPerHectare: number,
    premium: number
  }
) {
  await assertProtocolProgramDeployed()

  const connection = new Connection(RPC_URL, 'confirmed')
  const farmer = new PublicKey(farmerPubkey)
  const programId = getProgramId()
  
  // 1. Derive PDAs
  const [policyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('policy'), Buffer.from(policyData.policyId)],
    programId
  )

  const regionSeed = 'JAVA' // For MVP simplification, but could be dynamic
  const commoditySeed = (policyData.commodity.toUpperCase().includes('RICE') || policyData.commodity.toUpperCase().includes('PADI')) ? 'RICE' : 'OTHER'

  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), Buffer.from(commoditySeed), Buffer.from(regionSeed)],
    programId
  )

  // 2. Derive Token Accounts (Using Devnet USDC Mint)
  const USDC_MINT = new PublicKey('4zMMC9srtVu2nuQJHGGMBVsCLqzr6nYHGL9H5LHvpx5h'); // Standard Devnet USDC
  
  // Simple derive ATA logic
  const [poolVault] = PublicKey.findProgramAddressSync(
    [poolPda.toBuffer(), new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(), USDC_MINT.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );

  const [insuredUsdcAccount] = PublicKey.findProgramAddressSync(
    [farmer.toBuffer(), new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA').toBuffer(), USDC_MINT.toBuffer()],
    new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL')
  );

  try {
    // 3. Serialize Instruction Data (Borsh-lite)
    const data = Buffer.alloc(1000); 
    let offset = 0;

    // Discriminator
    CREATE_POLICY_DISCRIMINATOR.copy(data, offset); offset += 8;

    // policy_id (String) -> 4-byte length + bytes
    data.writeUInt32LE(policyData.policyId.length, offset); offset += 4;
    Buffer.from(policyData.policyId).copy(data, offset); offset += policyData.policyId.length;

    // commodity (String)
    data.writeUInt32LE(policyData.commodity.length, offset); offset += 4;
    Buffer.from(policyData.commodity).copy(data, offset); offset += policyData.commodity.length;

    // trigger_type (Enum RainfallDeficit = 0)
    data.writeUInt8(0, offset); offset += 1;

    // trigger_threshold_mm (u64)
    data.writeBigUInt64LE(BigInt(Math.max(0, policyData.triggerThreshold)), offset); offset += 8;

    // trigger_window_days (u8)
    data.writeUInt8(30, offset); offset += 1;

    // coverage_start (i64)
    data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000)), offset); offset += 8;

    // coverage_end (i64)
    data.writeBigInt64LE(BigInt(Math.floor(Date.now() / 1000) + 2592000), offset); offset += 8;

    // covered_hectares_bps (u64 - 1 hectare = 10000 bps)
    data.writeBigUInt64LE(BigInt(10000), offset); offset += 8;

    // payout_per_hectare_usdc (u64)
    data.writeBigUInt64LE(BigInt(Math.max(0, Math.floor(policyData.payoutPerHectare * 1_000_000))), offset); offset += 8;

    // premium_usdc (u64)
    data.writeBigUInt64LE(BigInt(Math.max(0, Math.floor(policyData.premium * 1_000_000))), offset); offset += 8;

    const ixData = data.slice(0, offset);

    // 4. Construct Instruction
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: policyPda, isSigner: false, isWritable: true },
        { pubkey: poolPda, isSigner: false, isWritable: true },
        { pubkey: poolVault, isSigner: false, isWritable: true },
        { pubkey: insuredUsdcAccount, isSigner: false, isWritable: false },
        { pubkey: farmer, isSigner: true, isWritable: true },
        { pubkey: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      programId,
      data: ixData, 
    });

    const transaction = new Transaction().add(instruction);
    transaction.feePayer = farmer;
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;

    return transaction;
  } catch (err: any) {
    console.error('Wallet transaction error:', err.message);
    throw new Error(`On-chain transaction failed: ${err.message}`);
  }
}

export async function getRecentTransactions(address: string) {
  const connection = new Connection(RPC_URL, 'confirmed')
  const pubkey = new PublicKey(address)
  
  try {
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 5 })
    return signatures.map((s, i) => ({
      id: i,
      signature: s.signature.slice(0, 8) + '...',
      fullSignature: s.signature,
      slot: s.slot,
      time: s.blockTime ? new Date(s.blockTime * 1000).toLocaleTimeString() : 'Pending',
      status: s.err ? 'Failed' : 'Success'
    }))
  } catch (err) {
    console.error('Error fetching transactions:', err)
    return []
  }
}
