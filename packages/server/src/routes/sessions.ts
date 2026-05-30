import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { getDb } from '../db/database'
import { getAllSessions, getSessionsByDevice, getSessionsByUser } from '../db/sessions'
import type { AuthTokenPayload } from '@airemote/shared'

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
    const sessions = user.role === 'admin' ? await getAllSessions(200) : await getSessionsByUser(user.userId)
    return enrichSessionsWithDeviceNames(sessions)
  })

  fastify.get<{ Params: { deviceId: string } }>('/device/:deviceId', async (request) => {
    const sessions = await getSessionsByDevice(request.params.deviceId)
    return enrichSessionsWithDeviceNames(sessions)
  })
}
