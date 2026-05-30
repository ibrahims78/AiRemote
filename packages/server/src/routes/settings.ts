import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { getDb } from '../db/database'
import type { AuthTokenPayload } from '@airemote/shared'

export async function settingsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // Get settings for current user
  fastify.get('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const result = await db.execute({
      sql: 'SELECT value FROM settings WHERE key = ?',
      args: [`user:${user.userId}`]
    })
    const row = result.rows[0] as unknown as { value: string } | undefined
    if (!row) return { aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' }
    try { return JSON.parse(row.value) } catch { return {} }
  })

  // Save settings for current user
  fastify.put<{ Body: Record<string, unknown> }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const now = new Date().toISOString()
    const valueJson = JSON.stringify(request.body)

    await db.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      args: [`user:${user.userId}`, valueJson, now]
    })
    return reply.send({ ok: true })
  })

  // Get global system settings (admin only)
  fastify.get('/system', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Admin required' })
    const db = getDb()
    const result = await db.execute({ sql: 'SELECT key, value, updated_at FROM settings WHERE key NOT LIKE ?', args: ['user:%'] })
    const out: Record<string, unknown> = {}
    for (const row of result.rows as unknown as { key: string; value: string }[]) {
      try { out[row.key] = JSON.parse(row.value) } catch { out[row.key] = row.value }
    }
    return out
  })
}
