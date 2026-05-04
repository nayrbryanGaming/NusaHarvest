import { PrismaClient } from '@prisma/client'
import { logger } from './logger'

declare global {
  var __prisma: PrismaClient | undefined
}

let prisma: PrismaClient

try {
  if (!process.env.DATABASE_URL) {
    logger.warn('⚠️ DATABASE_URL not set - Prisma queries will fail gracefully')
  }
  
  prisma = global.__prisma ?? new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: 'pretty'
  })

  if (process.env.NODE_ENV !== 'production') {
    global.__prisma = prisma
  }
} catch (err) {
  logger.error('❌ Prisma initialization error:', err)
  // Create a dummy prisma-like object that returns errors instead of crashing
  prisma = new PrismaClient({
    log: ['error']
  }) as any
}

export { prisma }
