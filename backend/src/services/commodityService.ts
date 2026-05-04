import axios from 'axios'

type CommoditySlug = 'padi' | 'kopi'

export interface CommodityQuote {
  slug: CommoditySlug
  symbol: string
  name: string
  source: string
  price: number
  currency: 'IDR' | 'USD'
  change24h: number
  asOf: string
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[]
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>
        }>
      }
      meta?: {
        currency?: string
      }
    }>
  }
}

const COMMODITY_MAP: Array<{ slug: CommoditySlug; symbol: string; name: string }> = [
  { slug: 'padi', symbol: 'ZR=F', name: 'Padi (Rough Rice Futures)' },
  { slug: 'kopi', symbol: 'KC=F', name: 'Kopi (Coffee Futures)' },
]

function toNumberList(values: Array<number | null> | undefined): number[] {
  if (!Array.isArray(values)) return []
  return values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
}

async function fetchUsdToIdrRate(): Promise<number | null> {
  try {
    const fxRes = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 12000 })
    const idr = fxRes.data?.rates?.IDR
    if (typeof idr === 'number' && Number.isFinite(idr)) {
      return idr
    }
    return null
  } catch {
    return null
  }
}

async function fetchYahooQuote(symbol: string): Promise<{ price: number; change24h: number; asOf: string }> {
  const encodedSymbol = encodeURIComponent(symbol)
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSymbol}?range=5d&interval=1d`
  const response = await axios.get<YahooChartResponse>(url, {
    timeout: 12000,
    headers: {
      'User-Agent': 'NusaHarvest/1.0',
      Accept: 'application/json',
    },
  })

  const result = response.data?.chart?.result?.[0]
  const closes = toNumberList(result?.indicators?.quote?.[0]?.close)

  if (closes.length < 2) {
    throw new Error(`Insufficient market data for ${symbol}`)
  }

  const latest = closes[closes.length - 1]
  const previous = closes[closes.length - 2]
  const change24h = previous === 0 ? 0 : ((latest - previous) / previous) * 100

  const timestamps = result?.timestamp
  const latestTimestamp = Array.isArray(timestamps) && timestamps.length > 0 ? timestamps[timestamps.length - 1] : null
  const asOf = latestTimestamp ? new Date(latestTimestamp * 1000).toISOString() : new Date().toISOString()

  return {
    price: latest,
    change24h,
    asOf,
  }
}

export async function fetchCommodityQuotes(): Promise<CommodityQuote[]> {
  const usdToIdr = await fetchUsdToIdrRate()

  const quoteResults = await Promise.allSettled(
    COMMODITY_MAP.map(async (item): Promise<CommodityQuote> => {
      const quote = await fetchYahooQuote(item.symbol)

      if (usdToIdr) {
        return {
          slug: item.slug,
          symbol: item.symbol,
          name: item.name,
          source: 'Yahoo Finance + Open ER API',
          price: Number((quote.price * usdToIdr).toFixed(2)),
          currency: 'IDR',
          change24h: Number(quote.change24h.toFixed(4)),
          asOf: quote.asOf,
        }
      }

      return {
        slug: item.slug,
        symbol: item.symbol,
        name: item.name,
        source: 'Yahoo Finance',
        price: Number(quote.price.toFixed(4)),
        currency: 'USD',
        change24h: Number(quote.change24h.toFixed(4)),
        asOf: quote.asOf,
      }
    })
  )

  return quoteResults
    .filter((result): result is PromiseFulfilledResult<CommodityQuote> => result.status === 'fulfilled')
    .map((result) => result.value)
}
