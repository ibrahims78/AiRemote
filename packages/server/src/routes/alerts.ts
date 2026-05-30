import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth'
import { getDb } from '../db/database'
import { logAudit } from '../db/audit'
import type { AuthTokenPayload } from '@airemote/shared'

export async function alertRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // Get all alert rules for current user
  fastify.get('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT * FROM alert_rules WHERE user_id = ? ORDER BY created_at DESC`,
      args: [user.userId]
    })
    return result.rows
  })

  // Create alert rule
  fastify.post<{
    Body: {
      type: string; deviceId?: string; threshold?: number
      cooldownMin?: number; channel?: string; webhookUrl?: string
    }
  }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { type, deviceId, threshold, cooldownMin = 30, channel = 'in_app', webhookUrl } = request.body

    const validTypes = ['device_offline', 'device_online', 'cpu_high', 'ram_high', 'disk_high']
    if (!validTypes.includes(type)) {
      return reply.code(400).send({ error: `Invalid type. Must be one of: ${validTypes.join(', ')}` })
    }

    const db = getDb()
    const id  = uuidv4()
    const now = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO alert_rules
              (id, user_id, device_id, type, threshold, cooldown_min, channel, webhook_url, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [id, user.userId, deviceId ?? null, type, threshold ?? null, cooldownMin, channel, webhookUrl ?? null, now]
    })

    await logAudit({ userId: user.userId, userEmail: user.email, action: 'alert_created', details: { type, deviceId, threshold }, ipAddress: request.ip })
    return reply.code(201).send({ id, type, deviceId, threshold, cooldownMin, channel })
  })

  // Toggle alert rule enabled/disabled
  fastify.patch<{ Params: { id: string }; Body: { enabled: boolean } }>(
    '/:id', async (request, reply) => {
      const user = request.user as unknown as AuthTokenPayload
      const db   = getDb()
      const rule = await db.execute({ sql: 'SELECT * FROM alert_rules WHERE id = ?', args: [request.params.id] })
      const row  = rule.rows[0] as unknown as { user_id: string } | undefined
      if (!row) return reply.code(404).send({ error: 'Rule not found' })
      if (row.user_id !== user.userId && user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
      await db.execute({ sql: 'UPDATE alert_rules SET enabled = ? WHERE id = ?', args: [request.body.enabled ? 1 : 0, request.params.id] })
      return { ok: true }
    }
  )

  // Delete alert rule
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const rule = await db.execute({ sql: 'SELECT * FROM alert_rules WHERE id = ?', args: [request.params.id] })
    const row  = rule.rows[0] as unknown as { user_id: string } | undefined
    if (!row) return reply.code(404).send({ error: 'Rule not found' })
    if (row.user_id !== user.userId && user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    await db.execute({ sql: 'DELETE FROM alert_rules WHERE id = ?', args: [request.params.id] })
    await logAudit({ userId: user.userId, userEmail: user.email, action: 'alert_deleted', ipAddress: request.ip })
    return reply.code(204).send()
  })

  // Get notifications for current user
  fastify.get('/notifications', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const result = await db.execute({
      sql: `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      args: [user.userId]
    })
    const unread = (result.rows as unknown as { read: number }[]).filter(r => r.read === 0).length
    return { notifications: result.rows, unread }
  })

  // Mark notification(s) as read
  fastify.post<{ Body: { ids?: string[]; all?: boolean } }>('/notifications/read', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const { ids, all } = request.body
    if (all) {
      await db.execute({ sql: 'UPDATE notifications SET read = 1 WHERE user_id = ?', args: [user.userId] })
    } else if (ids?.length) {
      for (const id of ids) {
        await db.execute({ sql: 'UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', args: [id, user.userId] })
      }
    }
    return { ok: true }
  })

  // Clear all read notifications
  fastify.delete('/notifications', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    await db.execute({ sql: 'DELETE FROM notifications WHERE user_id = ? AND read = 1', args: [user.userId] })
    return { ok: true }
  })
}
