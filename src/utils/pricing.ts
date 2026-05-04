const PRICE_TTL_MS = 60_000

type CacheEntry = {
  expiresAt: number
  usdcIdr: number
}

let cache: CacheEntry | null = null

export async function getUsdcIdrPrice(forceRefresh = false): Promise<number> {
  const now = Date.now()
  if (!forceRefresh && cache && cache.expiresAt > now) {
    return cache.usdcIdr
  }

  const endpoint =
    'https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=idr'
  const response = await fetch(endpoint, { cache: 'no-store' })

  if (!response.ok) {
    throw new Error(`CoinGecko request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as {
    'usd-coin'?: { idr?: number }
  }

  const usdcIdr = payload?.['usd-coin']?.idr
  if (typeof usdcIdr !== 'number' || !Number.isFinite(usdcIdr) || usdcIdr <= 0) {
    throw new Error('CoinGecko returned invalid USDC/IDR rate')
  }

  cache = {
    usdcIdr,
    expiresAt: now + PRICE_TTL_MS,
  }

  return usdcIdr
}

export function convertIdrToUsdc(amountIdr: number, usdcIdrRate: number): number {
  if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
    throw new Error('Amount IDR must be greater than zero')
  }
  if (!Number.isFinite(usdcIdrRate) || usdcIdrRate <= 0) {
    throw new Error('USDC/IDR rate must be greater than zero')
  }

  // 6 decimals for SPL-token style precision.
  return Number((amountIdr / usdcIdrRate).toFixed(6))
}
