import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import { getDb } from '../db/database'
import {
  findUserByEmail,
  findUserById,
  createUser,
  verifyPassword,
  countUsers
} from '../db/users'
import type { LoginRequest } from '@airemote/shared'

const BCRYPT_ROUNDS = 12
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000

async function createRefreshToken(userId: string): Promise<string> {
  const db = getDb()
  const token = uuidv4()
  const hash = await bcrypt.hash(token, BCRYPT_ROUNDS)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
  await db.execute({
    sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    args: [uuidv4(), userId, hash, expiresAt]
  })
  return token
}

export async function authRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post<{ Body: LoginRequest }>('/login', async (request, reply) => {
    const { email, password } = request.body
    if (!email || !password) return reply.code(400).send({ error: 'Email and password required' })

    const user = await findUserByEmail(email)
    if (!user) return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' })

    const valid = await verifyPassword(password, user.passwordHash!)
    if (!valid) return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' })

    const token = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = await createRefreshToken(user.id)

    const { passwordHash, ...safeUser } = user
    return reply.send({ token, refreshToken, user: safeUser })
  })

  // Refresh access token using refresh token
  fastify.post<{ Body: { refreshToken: string } }>('/refresh', async (request, reply) => {
    const { refreshToken } = request.body
    if (!refreshToken) return reply.code(400).send({ error: 'Refresh token required' })

    const db = getDb()
    const result = await db.execute({
      sql: `SELECT id, user_id, token_hash FROM refresh_tokens WHERE expires_at > ? ORDER BY created_at DESC LIMIT 50`,
      args: [new Date().toISOString()]
    })

    let matchedRow: { id: string; user_id: string } | null = null
    for (const row of result.rows as unknown as { id: string; user_id: string; token_hash: string }[]) {
      const match = await bcrypt.compare(refreshToken, row.token_hash)
      if (match) { matchedRow = row; break }
    }

    if (!matchedRow) return reply.code(401).send({ error: 'Invalid or expired refresh token' })

    const user = await findUserById(matchedRow.user_id)
    if (!user) {
      await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [matchedRow.id] })
      return reply.code(404).send({ error: 'User not found' })
    }

    // Rotate refresh token — delete old, issue new atomically-ish
    try {
      await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [matchedRow.id] })
      const newToken = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
      const newRefreshToken = await createRefreshToken(user.id)
      return reply.send({ token: newToken, refreshToken: newRefreshToken, user })
    } catch (err) {
      console.error('Refresh token rotation failed:', err)
      return reply.code(500).send({ error: 'Token refresh failed' })
    }
  })

  // Setup initial admin account
  fastify.post('/setup', async (request, reply) => {
    const count = await countUsers()
    if (count > 0) return reply.code(400).send({ error: 'Setup already completed' })

    const body = request.body as { email: string; name: string; password: string }
    if (!body.email || !body.name || !body.password) {
      return reply.code(400).send({ error: 'email, name, and password required' })
    }
    if (body.password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })

    const user = await createUser(body.email, body.name, body.password, 'admin')
    const token = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = await createRefreshToken(user.id)

    return reply.code(201).send({ token, refreshToken, user })
  })

  // Setup status
  fastify.get('/setup-status', async () => {
    const count = await countUsers()
    return { setupRequired: count === 0 }
  })

  // Get current user
  fastify.get('/me', {
    preHandler: async (req, rep) => {
      try { await req.jwtVerify() } catch { rep.code(401).send({ error: 'Unauthorized' }) }
    }
  }, async (request, reply) => {
    const payload = request.user as unknown as { userId: string }
    const user = await findUserById(payload.userId)
    if (!user) return reply.code(404).send({ error: 'User not found' })
    return reply.send({ user })
  })

  // Logout — invalidate refresh token
  fastify.post<{ Body: { refreshToken?: string } }>('/logout', async (request) => {
    const { refreshToken } = request.body || {}
    if (refreshToken) {
      try {
        const db = getDb()
        const result = await db.execute({
          sql: `SELECT id, token_hash FROM refresh_tokens WHERE expires_at > ? LIMIT 50`,
          args: [new Date().toISOString()]
        })
        for (const row of result.rows as unknown as { id: string; token_hash: string }[]) {
          const match = await bcrypt.compare(refreshToken, row.token_hash)
          if (match) {
            await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [row.id] })
            break
          }
        }
      } catch {}
    }
    return { ok: true }
  })
}
