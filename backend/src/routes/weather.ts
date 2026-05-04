import { Router, Request, Response } from 'express'
import { getWeatherForecast, storeWeatherReading } from '../services/weatherService'
import { calculateRiskScore, saveYieldPrediction } from '../services/riskEngine'
import { authenticate } from '../middleware/auth'

export const weatherRouter = Router()

/**
 * GET /api/weather/forecast?lat=...&lon=...
 * Returns 7-day weather forecast + risk metrics for coordinates
 */
weatherRouter.get('/forecast', async (req: Request, res: Response) => {
  try {
    const lat = parseFloat(req.query.lat as string)
    const lon = parseFloat(req.query.lon as string)

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Valid lat and lon query params required' })
    }

    const forecast = await getWeatherForecast(lat, lon)
    await storeWeatherReading(forecast)

    const risk = await calculateRiskScore('RICE', lat, lon, new Date(), forecast.rollingRainfall30d)

    return res.json({
      success: true,
      data: {
        location: { lat, lon, regionCode: forecast.regionCode },
        current: forecast.current,
        daily: forecast.daily,
        risk: {
          droughtIndex: forecast.droughtIndex,
          rollingRainfall30d: forecast.rollingRainfall30d,
          droughtRiskScore: risk.droughtRiskScore,
          excessRainRiskScore: risk.excessRainRiskScore,
          overallRiskScore: risk.overallRiskScore,
          riskLevel: risk.riskLevel
        }
      }
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

/**
 * GET /api/weather/history?regionCode=...&days=30
 */
weatherRouter.get('/history', async (req: Request, res: Response) => {
  try {
    const { regionCode, days = '30' } = req.query
    const { prisma } = await import('../utils/prisma')

    const since = new Date(Date.now() - parseInt(days as string) * 24 * 60 * 60 * 1000)
    const records = await prisma.weatherData.findMany({
      where: { regionCode: regionCode as string, recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
      select: { recordedAt: true, rainfallMm: true, droughtIndex: true, dataSource: true }
    })

    return res.json({ success: true, data: records })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})
