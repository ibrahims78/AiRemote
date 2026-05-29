import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import type { Session, SessionRow, SessionType } from '@airemote/shared'

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    deviceId: row.device_id,
    userId: row.user_id,
    type: row.type,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
    durationSec: row.duration_sec || undefined,
    ipAddress: row.ip_address || undefined
  }
}

export async function createSession(deviceId: string, userId: string, type: SessionType, ipAddress?: string): Promise<Session> {
  const db = getDb()
  const id = uuidv4()
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, deviceId, userId, type, now, ipAddress || null]
  })
  return (await getSessionById(id))!
}

export async function endSession(id: string): Promise<void> {
  const db = getDb()
  const session = await getSessionById(id)
  if (!session) return
  const now = new Date()
  const durationSec = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000)
  await db.execute({ sql: `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`, args: [now.toISOString(), durationSec, id] })
}

export async function getSessionById(id: string): Promise<Session | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [id] })
  const row = result.rows[0] as unknown as SessionRow | undefined
  if (!row) return null
  return rowToSession(row)
}

export async function getSessionsByDevice(deviceId: string, limit = 50): Promise<Session[]> {
  const db = getDb()
  const result = await db.execute({ sql: `SELECT * FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ?`, args: [deviceId, limit] })
  return (result.rows as unknown as SessionRow[]).map(rowToSession)
}

export async function getSessionsByUser(userId: string, limit = 50): Promise<Session[]> {
  const db = getDb()
  const result = await db.execute({ sql: `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?`, args: [userId, limit] })
  return (result.rows as unknown as SessionRow[]).map(rowToSession)
}

export async function getAllSessions(limit = 100): Promise<Session[]> {
  const db = getDb()
  const result = await db.execute({ sql: `SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?`, args: [limit] })
  return (result.rows as unknown as SessionRow[]).map(rowToSession)
}
