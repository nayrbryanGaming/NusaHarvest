import axios from 'axios'
import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5'
const API_KEY = process.env.OPENWEATHER_API_KEY || ''

export interface WeatherForecast {
  lat: number
  lon: number
  regionCode: string
  current: {
    rainfallMm: number
    temperatureCelsius: number
    humidityPercent: number
    windSpeedKmh: number
    description: string
  }
  daily: Array<{
    date: string
    rainfallMm: number
    tempMax: number
    tempMin: number
  }>
  droughtIndex: number          // SPI proxy — negative = drought, positive = wet
  rollingRainfall30d: number    // mm in last 30 days
}

// ── Fetch current + 7-day forecast from OpenWeatherMap ──────────────────────
export async function getWeatherForecast(lat: number, lon: number): Promise<WeatherForecast> {
  try {
    const url = `${OPENWEATHER_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&cnt=40`
    const response = await axios.get(url, { timeout: 10000 })
    const data = response.data

    // Current conditions from first 3h slot
    const current = data.list[0]
    const rainfallMm = current.rain?.['3h'] ?? 0

    // Aggregate daily rainfall
    const dailyMap: Record<string, number> = {}
    for (const slot of data.list) {
      const date = new Date(slot.dt * 1000).toISOString().split('T')[0]
      dailyMap[date] = (dailyMap[date] || 0) + (slot.rain?.['3h'] ?? 0)
    }

    const daily = Object.entries(dailyMap).slice(0, 7).map(([date, rain]) => ({
      date,
      rainfallMm: rain,
      tempMax: 33, // simplified; full version pulls temp array
      tempMin: 24
    }))

    // Retrieve 30-day historical from DB for rolling sum
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const historical = await prisma.weatherData.findMany({
      where: {
        latitude: { gte: lat - 0.15, lte: lat + 0.15 },
        longitude: { gte: lon - 0.15, lte: lon + 0.15 },
        recordedAt: { gte: thirtyDaysAgo }
      },
      select: { rainfallMm: true }
    })
    const rollingRainfall30d = historical.reduce((sum: number, r: { rainfallMm: number }) => sum + r.rainfallMm, 0)

    // Simple SPI proxy: compare 30d rainfall to long-term mean (~150mm for Java)
    const LONG_TERM_MEAN_30D = 150
    const droughtIndex = parseFloat(
      ((rollingRainfall30d - LONG_TERM_MEAN_30D) / LONG_TERM_MEAN_30D * 2).toFixed(2)
    )

    const regionCode = `${Math.round(lat * 4) / 4}_${Math.round(lon * 4) / 4}`

    return {
      lat,
      lon,
      regionCode,
      current: {
        rainfallMm,
        temperatureCelsius: current.main.temp,
        humidityPercent: current.main.humidity,
        windSpeedKmh: current.wind.speed * 3.6,
        description: current.weather[0].description
      },
      daily,
      droughtIndex,
      rollingRainfall30d
    }
  } catch (error) {
    logger.error('WeatherService.getWeatherForecast error:', error)
    throw new Error('Failed to fetch weather data')
  }
}

// ── Persist weather reading to database ──────────────────────────────────────
export async function storeWeatherReading(
  forecast: WeatherForecast,
  farmId?: string
): Promise<void> {
  await prisma.weatherData.create({
    data: {
      farmId: farmId ?? null,
      latitude: forecast.lat,
      longitude: forecast.lon,
      regionCode: forecast.regionCode,
      recordedAt: new Date(),
      rainfallMm: forecast.current.rainfallMm,
      temperatureCelsius: forecast.current.temperatureCelsius,
      humidityPercent: forecast.current.humidityPercent,
      windSpeedKmh: forecast.current.windSpeedKmh,
      droughtIndex: forecast.droughtIndex,
      dataSource: 'OPENWEATHER',
      isVerified: false
    }
  })
}

// ── Calculate rainfall risk score (0–100) ────────────────────────────────────
export function calculateRainfallRisk(
  rollingRainfall30d: number,
  droughtThresholdMm: number = 40
): { droughtRisk: number; excessRainRisk: number } {
  // Drought risk: higher when rolling 30d rainfall is far below threshold
  const deficit = Math.max(0, droughtThresholdMm - rollingRainfall30d)
  const droughtRisk = Math.min(100, (deficit / droughtThresholdMm) * 100)

  // Excess rain risk: higher when rolling rainfall is far above mean
  const EXCESS_THRESHOLD = 300 // mm/30days
  const excess = Math.max(0, rollingRainfall30d - EXCESS_THRESHOLD)
  const excessRainRisk = Math.min(100, (excess / EXCESS_THRESHOLD) * 100)

  return {
    droughtRisk: parseFloat(droughtRisk.toFixed(1)),
    excessRainRisk: parseFloat(excessRainRisk.toFixed(1))
  }
}

// ── Check if policy trigger threshold is breached ────────────────────────────
export async function checkInsuranceTrigger(
  regionCode: string,
  triggerType: 'RAINFALL_DEFICIT' | 'EXCESS_RAINFALL',
  thresholdMm: number,
  windowDays: number = 30
): Promise<{ triggered: boolean; actualValue: number }> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  const readings = await prisma.weatherData.findMany({
    where: {
      regionCode,
      recordedAt: { gte: since }
    },
    select: { rainfallMm: true }
  })

  const total = readings.reduce((sum: number, r: { rainfallMm: number }) => sum + r.rainfallMm, 0)

  if (triggerType === 'RAINFALL_DEFICIT') {
    return { triggered: total < thresholdMm, actualValue: total }
  } else {
    return { triggered: total > thresholdMm, actualValue: total }
  }
}
