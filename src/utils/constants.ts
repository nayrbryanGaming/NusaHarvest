import { PublicKey } from '@solana/web3.js'

export const PROGRAM_ID_STR = 'D1zZDFSbwLzVswWk3TnqMpFqSSJeu7CGARjju6qQoZYq'
export const ORACLE_PUBKEY_STR = '7mgSJBnBr5NVED2xUdZQzkrmNnMwbEhjrCkQ5GxKA2Xd'
export const NETWORK = 'devnet'
export const RPC_URL = 'https://api.devnet.solana.com'

export function getProgramId(): PublicKey {
	try {
		return new PublicKey(PROGRAM_ID_STR)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown error'
		throw new Error(`Invalid PROGRAM_ID_STR: ${message}`)
	}
}

export function getOraclePubkey(): PublicKey | null {
	try {
		return new PublicKey(ORACLE_PUBKEY_STR)
	} catch {
		return null
	}
}

export const USDC_MINT_STR = '4zMMC9srtVu2nuQJHGGMBVsCLqzr6nYHGL9H5LHvpx5h'
