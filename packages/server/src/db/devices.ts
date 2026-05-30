import { v4 as uuidv4 } from 'uuid'
import { getDb } from './database'
import type { Device, DeviceRow, DeviceStatus, TunnelLayer, DeviceInfo } from '@airemote/shared'

function rowToDevice(row: DeviceRow): Device {
  return {
    id: row.id,
    name: row.name,
    token: row.token,
    ownerId: row.owner_id,
    info: row.info ? JSON.parse(row.info) : undefined,
    status: row.status,
    tunnelLayer: row.tunnel_layer || undefined,
    tunnelAddress: row.tunnel_address || undefined,
    tags: (() => { try { return JSON.parse(row.tags || '[]') } catch { return [] } })(),
    lastSeen: row.last_seen ? new Date(row.last_seen) : undefined,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

export async function createDevice(name: string, ownerId: string): Promise<Device> {
  const db = getDb()
  const id = uuidv4()
  const token = uuidv4() + '-' + uuidv4()
  const now = new Date().toISOString()
  await db.execute({
    sql: `INSERT INTO devices (id, name, token, owner_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'offline', ?, ?)`,
    args: [id, name, token, ownerId, now, now]
  })
  return (await getDeviceById(id))!
}

export async function getDeviceById(id: string): Promise<Device | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM devices WHERE id = ?', args: [id] })
  const row = result.rows[0] as unknown as DeviceRow | undefined
  if (!row) return null
  return rowToDevice(row)
}

export async function getDeviceByToken(token: string): Promise<Device | null> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM devices WHERE token = ?', args: [token] })
  const row = result.rows[0] as unknown as DeviceRow | undefined
  if (!row) return null
  return rowToDevice(row)
}

export async function getDevicesByOwner(ownerId: string): Promise<Device[]> {
  const db = getDb()
  const result = await db.execute({ sql: 'SELECT * FROM devices WHERE owner_id = ? ORDER BY name', args: [ownerId] })
  return (result.rows as unknown as DeviceRow[]).map(rowToDevice)
}

export async function getAllDevices(): Promise<Device[]> {
  const db = getDb()
  const result = await db.execute('SELECT * FROM devices ORDER BY name')
  return (result.rows as unknown as DeviceRow[]).map(rowToDevice)
}

export async function updateDeviceStatus(id: string, status: DeviceStatus, tunnelLayer?: TunnelLayer, tunnelAddress?: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.execute({
    sql: 'UPDATE devices SET status = ?, tunnel_layer = ?, tunnel_address = ?, last_seen = ?, updated_at = ? WHERE id = ?',
    args: [status, tunnelLayer || null, tunnelAddress || null, now, now, id]
  })
}

export async function updateDeviceInfo(id: string, info: DeviceInfo): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.execute({ sql: 'UPDATE devices SET info = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(info), now, id] })
}

export async function updateDeviceSeen(id: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.execute({ sql: 'UPDATE devices SET last_seen = ?, updated_at = ? WHERE id = ?', args: [now, now, id] })
}

export async function resetAllDevicesOffline(): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.execute({ sql: `UPDATE devices SET status = 'offline', updated_at = ? WHERE status != 'offline'`, args: [now] })
}

export async function deleteDevice(id: string): Promise<void> {
  const db = getDb()
  await db.execute({ sql: 'DELETE FROM devices WHERE id = ?', args: [id] })
}

export async function renameDevice(id: string, name: string): Promise<void> {
  const db = getDb()
  const now = new Date().toISOString()
  await db.execute({ sql: 'UPDATE devices SET name = ?, updated_at = ? WHERE id = ?', args: [name, now, id] })
}
