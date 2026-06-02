import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import bcrypt from 'bcryptjs'
import QRCode from 'qrcode'
import { authenticator } from '../lib/otplib'
import { getDb } from '../db/database'
import {
  findUserByEmail, findUserById,
  createUser, verifyPassword, countUsers
} from '../db/users'
import { logAudit } from '../db/audit'
import { createWsTicket } from '../lib/wsTickets'
import { requireAuth } from '../middleware/auth'
import type { LoginRequest, AuthTokenPayload } from '@airemote/shared'

const BCRYPT_ROUNDS       = 12
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000   // 30 days
const TOTP_TOKEN_TTL_MS    =  5 * 60 * 1000              //  5 minutes

interface UserRow {
  id: string; email: string; name: string; role: string
  totp_enabled: number; totp_secret: string | null
}

// ── helpers ─────────────────────────────────────────────────────────────────

async function createRefreshToken(userId: string): Promise<string> {
  const db = getDb()
  const token    = uuidv4()
  const hash     = await bcrypt.hash(token, BCRYPT_ROUNDS)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
  await db.execute({
    sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    args: [uuidv4(), userId, hash, expiresAt]
  })
  return token
}

// ── routes ───────────────────────────────────────────────────────────────────

export async function authRoutes(fastify: FastifyInstance) {

  // ── POST /login ─────────────────────────────────────────────────────────
  fastify.post<{ Body: LoginRequest }>('/login', {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: '15 minutes',
        keyGenerator: (req) => req.ip,
        errorResponseBuilder: (_req: unknown, context: { ttl: number }) => ({
          error: 'Too many login attempts. Please try again later.',
          retryAfter: Math.ceil(context.ttl / 1000)
        })
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body
    if (!email || !password) return reply.code(400).send({ error: 'Email and password required' })

    const user = await findUserByEmail(email)
    if (!user) {
      await logAudit({ userId: 'unknown', userEmail: email, action: 'login_failed', ipAddress: request.ip })
      return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' })
    }

    const valid = await verifyPassword(password, user.passwordHash!)
    if (!valid) {
      await logAudit({ userId: user.id, userEmail: user.email, action: 'login_failed', ipAddress: request.ip })
      return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' })
    }

    const db = getDb()
    const userRow = (await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [user.id] })).rows[0] as unknown as UserRow

    // ── 2FA check ────────────────────────────────────────────────────────
    if (userRow?.totp_enabled) {
      // Issue a short-lived "TOTP pending" token
      const totpToken = fastify.jwt.sign(
        { userId: user.id, email: user.email, role: user.role, purpose: 'totp_verify' },
        { expiresIn: '5m' }
      )
      return reply.send({ requiresTOTP: true, totpToken })
    }

    const token        = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = await createRefreshToken(user.id)
    await logAudit({ userId: user.id, userEmail: user.email, action: 'login_success', ipAddress: request.ip })

    const { passwordHash, ...safeUser } = user
    return reply.send({ token, refreshToken, user: safeUser })
  })

  // ── POST /login/verify-totp ─────────────────────────────────────────────
  fastify.post<{ Body: { totpToken: string; code: string } }>('/login/verify-totp', async (request, reply) => {
    const { totpToken, code } = request.body
    if (!totpToken || !code) return reply.code(400).send({ error: 'totpToken and code required' })

    let payload: { userId: string; email: string; role: string; purpose: string }
    try {
      payload = fastify.jwt.verify(totpToken) as typeof payload
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired TOTP token' })
    }

    if (payload.purpose !== 'totp_verify') {
      return reply.code(401).send({ error: 'Invalid token purpose' })
    }

    const db  = getDb()
    const res = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [payload.userId] })
    const row = res.rows[0] as unknown as UserRow
    if (!row?.totp_secret) return reply.code(404).send({ error: 'User not found' })

    const valid = authenticator.verify({ token: code.replace(/\s/g, ''), secret: row.totp_secret })
    if (!valid) return reply.code(401).send({ error: 'Invalid TOTP code' })

    const user = await findUserById(payload.userId)
    if (!user) return reply.code(404).send({ error: 'User not found' })

    const token        = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = await createRefreshToken(user.id)
    await logAudit({ userId: user.id, userEmail: user.email, action: 'login_success', details: { via: '2fa' }, ipAddress: request.ip })

    const { passwordHash, ...safeUser } = user
    return reply.send({ token, refreshToken, user: safeUser })
  })

  // ── POST /refresh ────────────────────────────────────────────────────────
  fastify.post<{ Body: { refreshToken: string } }>('/refresh', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const { refreshToken } = request.body
    if (!refreshToken) return reply.code(400).send({ error: 'Refresh token required' })

    const db     = getDb()
    const result = await db.execute({
      sql: `SELECT id, user_id, token_hash FROM refresh_tokens WHERE expires_at > ? ORDER BY created_at DESC LIMIT 50`,
      args: [new Date().toISOString()]
    })

    let matchedRow: { id: string; user_id: string } | null = null
    for (const row of result.rows as unknown as { id: string; user_id: string; token_hash: string }[]) {
      if (await bcrypt.compare(refreshToken, row.token_hash)) { matchedRow = row; break }
    }

    if (!matchedRow) return reply.code(401).send({ error: 'Invalid or expired refresh token' })

    const user = await findUserById(matchedRow.user_id)
    if (!user) {
      await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [matchedRow.id] })
      return reply.code(404).send({ error: 'User not found' })
    }

    try {
      await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [matchedRow.id] })
      const newToken        = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
      const newRefreshToken = await createRefreshToken(user.id)
      return reply.send({ token: newToken, refreshToken: newRefreshToken, user })
    } catch (err) {
      console.error('Refresh token rotation failed:', err)
      return reply.code(500).send({ error: 'Token refresh failed' })
    }
  })

  // ── POST /setup ──────────────────────────────────────────────────────────
  fastify.post('/setup', async (request, reply) => {
    const count = await countUsers()
    if (count > 0) return reply.code(400).send({ error: 'Setup already completed' })

    const body = request.body as { email: string; name: string; password: string }
    if (!body.email || !body.name || !body.password) {
      return reply.code(400).send({ error: 'email, name, and password required' })
    }
    if (body.password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })

    const user         = await createUser(body.email, body.name, body.password, 'admin')
    const token        = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = await createRefreshToken(user.id)
    await logAudit({ userId: user.id, userEmail: user.email, action: 'setup_completed', ipAddress: request.ip })
    return reply.code(201).send({ token, refreshToken, user })
  })

  // ── GET /setup-status ────────────────────────────────────────────────────
  fastify.get('/setup-status', async () => {
    return { setupRequired: (await countUsers()) === 0 }
  })

  // ── GET /me ──────────────────────────────────────────────────────────────
  fastify.get('/me', {
    preHandler: async (req, rep) => {
      try { await req.jwtVerify() } catch { rep.code(401).send({ error: 'Unauthorized' }) }
    }
  }, async (request, reply) => {
    const payload = request.user as unknown as { userId: string }
    const user    = await findUserById(payload.userId)
    if (!user) return reply.code(404).send({ error: 'User not found' })
    const db  = getDb()
    const row = (await db.execute({ sql: 'SELECT totp_enabled FROM users WHERE id = ?', args: [user.id] })).rows[0] as unknown as { totp_enabled: number } | undefined
    return reply.send({ user: { ...user, totpEnabled: !!(row?.totp_enabled) } })
  })

  // ── POST /logout ─────────────────────────────────────────────────────────
  fastify.post<{ Body: { refreshToken?: string } }>('/logout', async (request) => {
    const { refreshToken } = request.body || {}
    if (refreshToken) {
      try {
        const db     = getDb()
        const result = await db.execute({
          sql: `SELECT id, token_hash FROM refresh_tokens WHERE expires_at > ? LIMIT 50`,
          args: [new Date().toISOString()]
        })
        for (const row of result.rows as unknown as { id: string; token_hash: string }[]) {
          if (await bcrypt.compare(refreshToken, row.token_hash)) {
            await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [row.id] })
            break
          }
        }
      } catch {}
    }
    return { ok: true }
  })

  // ── GET /2fa/setup — generate QR code for user ───────────────────────────
  fastify.get('/2fa/setup', {
    preHandler: async (req, rep) => {
      try { await req.jwtVerify() } catch { rep.code(401).send({ error: 'Unauthorized' }) }
    }
  }, async (request, reply) => {
    const payload = request.user as unknown as { userId: string; email: string }
    const secret    = authenticator.generateSecret()
    const otpauth   = authenticator.keyuri(payload.email, 'AiRemote', secret)
    const qrDataUrl = await QRCode.toDataURL(otpauth)

    // Store temp secret in session (we'll confirm on /2fa/enable)
    const db = getDb()
    await db.execute({ sql: 'UPDATE users SET totp_secret = ? WHERE id = ?', args: [secret, payload.userId] })

    return { qrDataUrl, secret, message: 'Scan QR code then confirm with a 6-digit code' }
  })

  // ── POST /2fa/enable — verify code then officially enable 2FA ────────────
  fastify.post<{ Body: { code: string } }>('/2fa/enable', {
    preHandler: async (req, rep) => {
      try { await req.jwtVerify() } catch { rep.code(401).send({ error: 'Unauthorized' }) }
    }
  }, async (request, reply) => {
    const payload = request.user as unknown as { userId: string; email: string }
    const { code } = request.body
    if (!code) return reply.code(400).send({ error: 'code required' })

    const db  = getDb()
    const res = await db.execute({ sql: 'SELECT totp_secret FROM users WHERE id = ?', args: [payload.userId] })
    const row = res.rows[0] as unknown as { totp_secret: string | null }
    if (!row?.totp_secret) return reply.code(400).send({ error: 'No TOTP secret set. Call GET /2fa/setup first.' })

    if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret: row.totp_secret })) {
      return reply.code(400).send({ error: 'Invalid code. Check your authenticator app.' })
    }

    await db.execute({ sql: 'UPDATE users SET totp_enabled = 1 WHERE id = ?', args: [payload.userId] })
    await logAudit({ userId: payload.userId, userEmail: payload.email, action: 'totp_enabled', ipAddress: request.ip })
    return { ok: true, message: '2FA enabled successfully' }
  })

  // ── POST /ws-ticket — issue a short-lived single-use WS auth ticket ────────
  // Clients call this before opening a WebSocket connection so the raw JWT
  // never has to appear in the WS upgrade URL (and therefore never in logs).
  fastify.post('/ws-ticket', { preHandler: requireAuth }, async (request, reply) => {
    const payload = request.user as unknown as AuthTokenPayload
    const ticket  = createWsTicket(payload.userId, payload.email, payload.role)
    return reply.send({ ticket })
  })

  // ── POST /2fa/disable ────────────────────────────────────────────────────
  fastify.post<{ Body: { code: string } }>('/2fa/disable', {
    preHandler: async (req, rep) => {
      try { await req.jwtVerify() } catch { rep.code(401).send({ error: 'Unauthorized' }) }
    }
  }, async (request, reply) => {
    const payload = request.user as unknown as { userId: string; email: string }
    const { code } = request.body
    if (!code) return reply.code(400).send({ error: 'code required' })

    const db  = getDb()
    const res = await db.execute({ sql: 'SELECT totp_secret, totp_enabled FROM users WHERE id = ?', args: [payload.userId] })
    const row = res.rows[0] as unknown as { totp_secret: string | null; totp_enabled: number }
    if (!row?.totp_enabled || !row.totp_secret) return reply.code(400).send({ error: '2FA is not enabled' })

    if (!authenticator.verify({ token: code.replace(/\s/g, ''), secret: row.totp_secret })) {
      return reply.code(400).send({ error: 'Invalid code' })
    }

    await db.execute({ sql: `UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?`, args: [payload.userId] })
    await logAudit({ userId: payload.userId, userEmail: payload.email, action: 'totp_disabled', ipAddress: request.ip })
    return { ok: true, message: '2FA disabled successfully' }
  })
}
