import { Router, Request, Response } from 'express'
import { prisma } from '../utils/prisma'

export const farmRouter = Router()

farmRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const farms = await prisma.farm.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        farmer: {
          select: {
            fullName: true,
            province: true,
            district: true,
            village: true
          }
        },
        crops: {
          select: {
            id: true,
            cropType: true,
            status: true
          }
        }
      }
    })

    return res.json({ success: true, data: farms })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})

farmRouter.get('/:farmId', async (req: Request, res: Response) => {
  try {
    const farm = await prisma.farm.findUnique({
      where: { id: req.params.farmId },
      include: {
        farmer: true,
        crops: true,
        weatherReadings: {
          orderBy: { recordedAt: 'desc' },
          take: 30
        },
        policies: true
      }
    })

    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' })
    }

    return res.json({ success: true, data: farm })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})