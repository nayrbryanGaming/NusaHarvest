import cron from 'node-cron'
import { evaluateAllActivePolicies } from '../services/insuranceEngine'
import { indexAllPools, syncAdminMetrics } from '../services/solanaIndexer'
import { logger } from '../utils/logger'
import { getWeatherForecast, storeWeatherReading } from '../services/weatherService'
import { prisma } from '../utils/prisma'

// Key farm coordinates to refresh daily (expanded dynamically from Farm table)
const PILOT_COORDINATES = [
  { lat: -7.7078, lon: 110.6101 }, // Klaten, Central Java
  { lat: -5.4297, lon: 105.2610 }, // Lampung
  { lat: -0.5021, lon: 101.4478 }  // Pekanbaru, Riau
]

export function startCronJobs() {
  // ── Every 30 minutes: Index all pools from smart contract ──────────────────
  cron.schedule('*/30 * * * *', async () => {
    logger.info('⛓️ CRON: Indexing pools from smart contract...')
    await indexAllPools()
    await syncAdminMetrics()
    logger.info('⛓️ CRON: Pool indexing complete.')
  })

  // ── Daily 07:00 WIB: Refresh weather for all active farm locations ────────
  cron.schedule('0 0 * * *', async () => {  // 00:00 UTC = 07:00 WIB
    logger.info('🌦 CRON: Starting daily weather data refresh...')

    // Load all unique farm locations from DB
    const farms = await prisma.farm.findMany({
      select: { latitude: true, longitude: true, id: true }
    })

    const locations = farms.length > 0 ? farms : PILOT_COORDINATES.map((c, i) => ({
      latitude: c.lat, longitude: c.lon, id: `pilot-${i}`
    }))

    for (const farm of locations) {
      try {
        const forecast = await getWeatherForecast(farm.latitude, farm.longitude)
        await storeWeatherReading(forecast, farm.id.startsWith('pilot') ? undefined : farm.id)
        logger.info(`  ✅ Weather stored: ${farm.latitude},${farm.longitude}`)
      } catch (err) {
        logger.error(`  ❌ Failed for farm ${farm.id}:`, err)
      }
      // Throttle to respect API rate limits
      await new Promise(r => setTimeout(r, 1200))
    }

    logger.info('🌦 CRON: Weather refresh complete.')
  })

  // ── Daily 08:00 WIB: Evaluate all active insurance policies ──────────────
  cron.schedule('0 1 * * *', async () => {  // 01:00 UTC = 08:00 WIB
    logger.info('📋 CRON: Evaluating active insurance policies...')
    await evaluateAllActivePolicies()
    logger.info('📋 CRON: Policy evaluation complete.')
  })

  logger.info('⏰ Cron jobs scheduled: on-chain indexing (every 30 min), weather refresh (07:00 WIB), policy evaluation (08:00 WIB)')
}
