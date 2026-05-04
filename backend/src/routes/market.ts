import { Request, Response, Router } from 'express'
import { fetchCommodityQuotes } from '../services/commodityService'

export const marketRouter = Router()

/**
 * GET /api/market/commodities
 * Returns commodity quotes. If upstream feeds are unavailable, returns empty data.
 */
marketRouter.get('/commodities', async (_req: Request, res: Response) => {
  try {
    const data = await fetchCommodityQuotes()
    return res.json({
      success: true,
      count: data.length,
      data,
      noDummyFallback: true,
      updatedAt: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: err?.message || 'Failed to fetch commodity data',
      data: [],
      noDummyFallback: true,
    })
  }
})
