import { PrismaClient } from '@prisma/client'

declare global {
  var __prisma: PrismaClient | undefined
}

function createPrismaClient() {
  try {
    return new PrismaClient({
      log: ['error'],
      errorFormat: 'minimal'
    })
  } catch (err) {
    console.warn('Prisma init deferred (no DATABASE_URL yet)')
    return new PrismaClient() as any
  }
}

export const prisma = global.__prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
}
