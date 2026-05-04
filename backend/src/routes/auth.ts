import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { body, validationResult } from 'express-validator'
import { prisma } from '../utils/prisma'

export const authRouter = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'nusa_harvest_dev_secret'
const JWT_EXPIRY = '7d'

/**
 * POST /api/auth/register
 */
authRouter.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('role').isIn(['FARMER', 'INVESTOR', 'COOPERATIVE_ADMIN']),
    body('phone').optional().isMobilePhone('any')
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const { email, password, role, phone } = req.body
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) return res.status(409).json({ error: 'Email already registered' })

      const passwordHash = await bcrypt.hash(password, 12)
      const user = await prisma.user.create({
        data: { email, passwordHash, role, phone: phone ?? null }
      })

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
      return res.status(201).json({
        success: true,
        data: { userId: user.id, email: user.email, role: user.role, token }
      })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }
)

/**
 * POST /api/auth/login
 */
authRouter.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
      const { email, password } = req.body
      const user = await prisma.user.findUnique({ where: { email } })
      if (!user) return res.status(401).json({ error: 'Invalid credentials' })

      const valid = await bcrypt.compare(password, user.passwordHash)
      if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRY })
      return res.json({
        success: true,
        data: { userId: user.id, email: user.email, role: user.role, token }
      })
    } catch (err: any) {
      return res.status(500).json({ error: err.message })
    }
  }
)

/**
 * POST /api/auth/connect-wallet
 * Links a Solana wallet address to the authenticated user
 */
authRouter.post('/connect-wallet', async (req: Request, res: Response) => {
  try {
    const { userId, walletAddress } = req.body
    if (!userId || !walletAddress) {
      return res.status(400).json({ error: 'userId and walletAddress required' })
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { walletAddress }
    })

    return res.json({ success: true, data: { userId: user.id, walletAddress: user.walletAddress } })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
})
