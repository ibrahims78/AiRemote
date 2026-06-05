import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { getDb } from '../db/database'
import { getDeviceById } from '../db/devices'
import { getAllSessions, getSessionsByDevice, getSessionsByUser } from '../db/sessions'
import type { AuthTokenPayload } from '@airemote/shared'
import { deviceRegistry } from '../ws/registry'

interface SessionWithDevice {
  id: string
  deviceId: string
  deviceName: string
  userId: string
  type: string
  startedAt: Date
  endedAt?: Date
  durationSec?: number
  ipAddress?: string
}

async function enrichSessionsWithDeviceNames(sessions: Awaited<ReturnType<typeof getAllSessions>>): Promise<SessionWithDevice[]> {
  if (sessions.length === 0) return []
  const db = getDb()
  const deviceIds = [...new Set(sessions.map(s => s.deviceId))]
  const placeholders = deviceIds.map(() => '?').join(',')
  const result = await db.execute({
    sql: `SELECT id, name FROM devices WHERE id IN (${placeholders})`,
    args: deviceIds
  })
  const nameMap = new Map<string, string>()
  for (const row of result.rows as unknown as { id: string; name: string }[]) {
    nameMap.set(row.id, row.name)
  }
  return sessions.map(s => ({
    ...s,
    deviceName: nameMap.get(s.deviceId) || s.deviceId.slice(0, 8)
  }))
}

export async function sessionRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const sessions = user.role === 'admin'
      ? await getAllSessions(200)
      : await getSessionsByUser(user.userId)
    return enrichSessionsWithDeviceNames(sessions)
  })

  fastify.get<{ Params: { deviceId: string } }>('/device/:deviceId', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { deviceId } = request.params

    if (user.role !== 'admin') {
      const device = await getDeviceById(deviceId)
      if (!device) return reply.code(404).send({ error: 'Device not found' })
      if (device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    }

    const sessions = await getSessionsByDevice(deviceId)
    return enrichSessionsWithDeviceNames(sessions)
  })

  // ── Active screen sessions (in-memory registry) ──────────────────────────

  /** List all currently active screen-sharing sessions (admin only) */
  fastify.get('/screen/active', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

    const raw = deviceRegistry.getAllActiveScreenSessions()

    // Enrich with device names from DB
    const db = getDb()
    const deviceIds = [...new Set(raw.map(s => s.deviceId))]
    let nameMap = new Map<string, string>()
    if (deviceIds.length > 0) {
      const placeholders = deviceIds.map(() => '?').join(',')
      const result = await db.execute({ sql: `SELECT id, name FROM devices WHERE id IN (${placeholders})`, args: deviceIds })
      for (const row of result.rows as unknown as { id: string; name: string }[]) {
        nameMap.set(row.id, row.name)
      }
    }

    return raw.map(s => ({
      sessionId:  s.sessionId,
      deviceId:   s.deviceId,
      deviceName: nameMap.get(s.deviceId) || s.deviceId.slice(0, 8),
      userId:     s.userId,
      startedAt:  new Date(s.startedAt).toISOString()
    }))
  })

  /** Force-stop a screen-sharing session (admin only) */
  fastify.delete<{ Params: { sessionId: string } }>('/screen/:sessionId', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    if (user.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })

    const { sessionId } = request.params
    const stopped = deviceRegistry.forceStopScreenSession(sessionId)
    if (!stopped) return reply.code(404).send({ error: 'Screen session not found' })

    // Update the DB record
    const endedAt     = new Date().toISOString()
    const durationSec = Math.round((Date.now() - stopped.startedAt) / 1000)
    await getDb().execute({
      sql:  `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
      args: [endedAt, durationSec, sessionId]
    }).catch(() => {})

    return { ok: true, sessionId, durationSec }
  })
}
