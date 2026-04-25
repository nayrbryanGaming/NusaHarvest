import axios from 'axios'
import { prisma } from '../utils/prisma'
import { logger } from '../utils/logger'

const OPENWEATHER_BASE = 'https://api.openweathermap.org/data/2.5'
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast'

// Regional climatological mean rainfall (mm/30d) for major Indonesian agricultural zones
// Source: BMKG historical normals 1991-2020
function getRegionalMeanRainfall30d(lat: number, lon: number): number {
  // Papua & Maluku (very wet)
  if (lon >= 130) return 280
  // Kalimantan (equatorial, very wet)
  if (lat >= -2 && lat <= 4 && lon >= 108 && lon <= 118) return 250
  // Sulawesi
  if (lon >= 118 && lon <= 128) return 175
  // Sumatra
  if (lon >= 95 && lon <= 108 && lat >= -6 && lat <= 6) return 210
  // Java, Bali, NTB (seasonal, drier dry season)
  if (lat <= -5 && lat >= -9) return 145
  // NTT (driest region)
  if (lat <= -8 && lon >= 118 && lon <= 127) return 90
  // Default: Java/Jawa mean
  return 150
}

// Crop-specific payout rates (USDC per hectare) and reserve ratio
const PAYOUT_PER_HECTARE: Record<string, number> = {
  RICE: 500,
  CORN: 400,
  COFFEE: 800,
  SOYBEAN: 350
}

export function getPayoutPerHectare(cropType: string): number {
  return PAYOUT_PER_HECTARE[cropType.toUpperCase()] ?? 450
}

// Reserve allocation ratio: portion of each deposit allocated to claims reserve
export const RESERVE_RATIO = 0.20

// Initial pool APY (adjusts monthly via oracle; 12% is the launch floor)
export const POOL_BASE_APY = 12.0

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

function mapOpenMeteoWeatherCode(code: number | undefined): string {
  if (code === undefined) return 'unknown'
  if (code === 0) return 'clear sky'
  if ([1, 2, 3].includes(code)) return 'partly cloudy'
  if ([45, 48].includes(code)) return 'fog'
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow'
  if ([95, 96, 99].includes(code)) return 'thunderstorm'
  return 'unknown'
}

async function getRollingRainfall30d(lat: number, lon: number): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  try {
    const historical = await prisma.weatherData.findMany({
      where: {
        latitude: { gte: lat - 0.15, lte: lat + 0.15 },
        longitude: { gte: lon - 0.15, lte: lon + 0.15 },
        recordedAt: { gte: thirtyDaysAgo }
      },
      select: { rainfallMm: true }
    })

    return historical.reduce((sum: number, r: { rainfallMm: number }) => sum + r.rainfallMm, 0)
  } catch (error) {
    logger.warn('WeatherService.getRollingRainfall30d DB unavailable, using live-only baseline', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    return 0
  }
}

// ── Fetch current + 7-day forecast from OpenWeatherMap ──────────────────────
export async function getWeatherForecast(lat: number, lon: number): Promise<WeatherForecast> {
  try {
    const apiKey = process.env.OPENWEATHER_API_KEY || ''

    if (apiKey) {
      try {
        const url = `${OPENWEATHER_BASE}/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&cnt=40`
        const response = await axios.get(url, { timeout: 10000 })
        const data = response.data

        // Current conditions from first 3h slot
        const current = data.list[0]
        const rainfallMm = current.rain?.['3h'] ?? 0

        // Aggregate daily rainfall and real temp max/min from 3-hour slots
        const dailyRain: Record<string, number> = {}
        const dailyTempMax: Record<string, number> = {}
        const dailyTempMin: Record<string, number> = {}
        for (const slot of data.list) {
          const date = new Date(slot.dt * 1000).toISOString().split('T')[0]
          dailyRain[date] = (dailyRain[date] || 0) + (slot.rain?.['3h'] ?? 0)
          const tMax = slot.main?.temp_max ?? slot.main?.temp ?? 0
          const tMin = slot.main?.temp_min ?? slot.main?.temp ?? 0
          dailyTempMax[date] = Math.max(dailyTempMax[date] ?? -99, tMax)
          dailyTempMin[date] = Math.min(dailyTempMin[date] ?? 99, tMin)
        }

        const daily = Object.keys(dailyRain).slice(0, 7).map(date => ({
          date,
          rainfallMm: dailyRain[date],
          tempMax: parseFloat((dailyTempMax[date] ?? 0).toFixed(1)),
          tempMin: parseFloat((dailyTempMin[date] ?? 0).toFixed(1))
        }))

        const rollingRainfall30d = await getRollingRainfall30d(lat, lon)

        // SPI proxy: compare 30d rainfall to region-calibrated climatological mean
        const LONG_TERM_MEAN_30D = getRegionalMeanRainfall30d(lat, lon)
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
      } catch (openWeatherError) {
        logger.warn('OpenWeather fetch failed, falling back to Open-Meteo', {
          error: openWeatherError instanceof Error ? openWeatherError.message : 'Unknown error'
        })
      }
    }

    const fallbackUrl = `${OPEN_METEO_BASE}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,rain,weather_code&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&forecast_days=7&timezone=auto`
    const fallbackResponse = await axios.get(fallbackUrl, { timeout: 10000 })
    const fallbackData = fallbackResponse.data

    const current = fallbackData.current ?? {}
    const daily = Array.isArray(fallbackData.daily?.time)
      ? fallbackData.daily.time.slice(0, 7).map((date: string, idx: number) => ({
          date,
          rainfallMm: Number(fallbackData.daily?.precipitation_sum?.[idx] ?? 0),
          tempMax: Number(fallbackData.daily?.temperature_2m_max?.[idx] ?? 0),
          tempMin: Number(fallbackData.daily?.temperature_2m_min?.[idx] ?? 0)
        }))
      : []

    const rollingRainfall30d = await getRollingRainfall30d(lat, lon)
    const LONG_TERM_MEAN_30D = getRegionalMeanRainfall30d(lat, lon)
    const droughtIndex = parseFloat(
      ((rollingRainfall30d - LONG_TERM_MEAN_30D) / LONG_TERM_MEAN_30D * 2).toFixed(2)
    )
    const regionCode = `${Math.round(lat * 4) / 4}_${Math.round(lon * 4) / 4}`

    return {
      lat,
      lon,
      regionCode,
      current: {
        rainfallMm: Number(current.rain ?? 0),
        temperatureCelsius: Number(current.temperature_2m ?? 0),
        humidityPercent: Number(current.relative_humidity_2m ?? 0),
        windSpeedKmh: Number(current.wind_speed_10m ?? 0),
        description: mapOpenMeteoWeatherCode(current.weather_code)
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
