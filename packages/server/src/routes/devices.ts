import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import * as dgram from 'dgram'
import { requireAuth, requireAdmin } from '../middleware/auth'
import {
  createDevice, getDeviceById, getDevicesByOwner,
  getAllDevices, deleteDevice, renameDevice
} from '../db/devices'
import { deviceRegistry } from '../ws/registry'
import { sendCommandToAgent } from '../ws/agentHandler'
import { logAudit, maskSensitiveData } from '../db/audit'
import { getDb } from '../db/database'
import type { AuthTokenPayload } from '@airemote/shared'

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // ── GET / — list devices ─────────────────────────────────────────────────
  fastify.get<{ Querystring: { tag?: string } }>('/', async (request) => {
    const user    = request.user as unknown as AuthTokenPayload
    const { tag } = request.query
    let devices   = user.role === 'admin' ? await getAllDevices() : await getDevicesByOwner(user.userId)

    if (tag) {
      devices = devices.filter(d => (d.tags ?? []).includes(tag))
    }

    return devices.map(d => ({
      ...d,
      online: deviceRegistry.isDeviceOnline(d.id),
    }))
  })

  // ── POST / — create device ───────────────────────────────────────────────
  fastify.post<{ Body: { name: string } }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { name } = request.body
    if (!name?.trim()) return reply.code(400).send({ error: 'Device name required' })
    const device = await createDevice(name.trim(), user.userId)
    await logAudit({ userId: user.userId, userEmail: user.email, action: 'device_created', deviceId: device.id, details: { name: name.trim() }, ipAddress: request.ip })
    return reply.code(201).send(device)
  })

  // ── GET /:id — get single device ─────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    return {
      ...device,
      online: deviceRegistry.isDeviceOnline(device.id),
    }
  })

  // ── PATCH /:id — rename device ───────────────────────────────────────────
  fastify.patch<{ Params: { id: string }; Body: { name: string } }>('/:id', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    await renameDevice(device.id, request.body.name)
    await logAudit({ userId: user.userId, userEmail: user.email, action: 'device_renamed', deviceId: device.id, details: { from: device.name, to: request.body.name }, ipAddress: request.ip })
    return getDeviceById(device.id)
  })

  // ── DELETE /:id ──────────────────────────────────────────────────────────
  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    await deleteDevice(device.id)
    await logAudit({ userId: user.userId, userEmail: user.email, action: 'device_deleted', deviceId: device.id, details: { name: device.name }, ipAddress: request.ip })
    return reply.code(204).send()
  })

  // ── POST /:id/exec — run command via agent ───────────────────────────────
  fastify.post<{
    Params: { id: string }
    Body: { command: string; timeoutMs?: number }
  }>('/:id/exec', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { id } = request.params
    const { command, timeoutMs = 30000 } = request.body
    if (!command?.trim()) return reply.code(400).send({ error: 'Command required' })

    const device = await getDeviceById(id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    if (!deviceRegistry.isDeviceOnline(id)) return reply.code(503).send({ error: 'Device is offline' })

    const commandId = uuidv4()
    try {
      const result = await sendCommandToAgent(id, commandId, command.trim(), Math.min(timeoutMs, 120000))
      await logAudit({
        userId: user.userId, userEmail: user.email, deviceId: id, action: 'exec_command',
        details: maskSensitiveData({ command: command.trim(), exitCode: result.exitCode }),
        ipAddress: request.ip
      })
      return reply.send({ ok: true, commandId, command: command.trim(), stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, duration: result.duration })
    } catch (err: unknown) {
      return reply.code(504).send({ error: (err as Error).message || 'Command execution failed' })
    }
  })

  // ── POST /bulk-exec — run command on multiple devices ───────────────────
  fastify.post<{
    Body: { deviceIds: string[]; command: string; timeoutMs?: number }
  }>('/bulk-exec', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { deviceIds, command, timeoutMs = 30000 } = request.body

    if (!command?.trim()) return reply.code(400).send({ error: 'Command required' })
    if (!Array.isArray(deviceIds) || deviceIds.length === 0) return reply.code(400).send({ error: 'deviceIds array required' })
    if (deviceIds.length > 50) return reply.code(400).send({ error: 'Max 50 devices per bulk command' })

    const results = await Promise.allSettled(
      deviceIds.map(async (id) => {
        const device = await getDeviceById(id)
        if (!device) return { error: 'Device not found' }
        if (user.role !== 'admin' && device.ownerId !== user.userId) return { error: 'Forbidden' }
        if (!deviceRegistry.isDeviceOnline(id)) return { error: 'Device offline', exitCode: -1 }

        const commandId = uuidv4()
        try {
          const result = await sendCommandToAgent(id, commandId, command.trim(), Math.min(timeoutMs, 60000))
          return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode, duration: result.duration }
        } catch (e) {
          return { error: (e as Error).message, exitCode: -1 }
        }
      })
    )

    await logAudit({
      userId: user.userId, userEmail: user.email, action: 'bulk_exec',
      details: maskSensitiveData({ command: command.trim(), deviceCount: deviceIds.length }),
      ipAddress: request.ip
    })

    return results.map((r, i) => ({
      deviceId: deviceIds[i],
      ...(r.status === 'fulfilled' ? r.value : { error: (r.reason as Error)?.message || 'Failed', exitCode: -1 })
    }))
  })

  // ── GET /:id/stats — live stats ──────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    const regDevice = deviceRegistry.getDevice(request.params.id)
    return { online: !!regDevice, stats: regDevice?.stats || null, connectedAt: regDevice?.connectedAt || null }
  })

  // ── GET /:id/history — historical stats ─────────────────────────────────
  fastify.get<{
    Params: { id: string }
    Querystring: { range?: '1h' | '24h' | '7d' | '30d' }
  }>('/:id/history', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const range    = request.query.range ?? '24h'
    const intervals: Record<string, string> = { '1h': '-1 hours', '24h': '-24 hours', '7d': '-7 days', '30d': '-30 days' }
    const groupBy:  Record<string, string> = {
      '1h':  `strftime('%Y-%m-%dT%H:%M:00', recorded_at)`,
      '24h': `strftime('%Y-%m-%dT%H:%M:00', datetime(strftime('%s', recorded_at) - (strftime('%s', recorded_at) % 300), 'unixepoch'))`,
      '7d':  `strftime('%Y-%m-%dT%H:00:00', recorded_at)`,
      '30d': `strftime('%Y-%m-%dT%H:00:00', recorded_at)`
    }

    const db     = getDb()
    const result = await db.execute({
      sql: `SELECT
              ${groupBy[range]} as time,
              ROUND(AVG(cpu_percent))   as cpu,
              ROUND(AVG(ram_percent))   as ram,
              ROUND(AVG(disk_percent))  as disk,
              ROUND(AVG(net_up_kbps))   as net_up,
              ROUND(AVG(net_down_kbps)) as net_down
            FROM device_stats_history
            WHERE device_id = ?
              AND recorded_at > datetime('now', '${intervals[range]}')
            GROUP BY ${groupBy[range]}
            ORDER BY time ASC`,
      args: [device.id]
    })
    return { deviceId: device.id, range, points: result.rows }
  })

  // ── POST /:id/tags — add tag ─────────────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: { tag: string } }>('/:id/tags', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const tag = request.body.tag?.trim()
    if (!tag) return reply.code(400).send({ error: 'tag required' })

    const db   = getDb()
    const row  = (await db.execute({ sql: 'SELECT tags FROM devices WHERE id = ?', args: [device.id] })).rows[0] as unknown as { tags: string }
    const tags = JSON.parse(row.tags || '[]') as string[]
    if (!tags.includes(tag)) {
      tags.push(tag)
      await db.execute({ sql: 'UPDATE devices SET tags = ? WHERE id = ?', args: [JSON.stringify(tags), device.id] })
    }
    return { tags }
  })

  // ── DELETE /:id/tags/:tag — remove tag ───────────────────────────────────
  fastify.delete<{ Params: { id: string; tag: string } }>('/:id/tags/:tag', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const db   = getDb()
    const row  = (await db.execute({ sql: 'SELECT tags FROM devices WHERE id = ?', args: [device.id] })).rows[0] as unknown as { tags: string }
    const tags = (JSON.parse(row.tags || '[]') as string[]).filter(t => t !== request.params.tag)
    await db.execute({ sql: 'UPDATE devices SET tags = ? WHERE id = ?', args: [JSON.stringify(tags), device.id] })
    return reply.code(204).send()
  })

  // ── GET /:id/docker/containers — list Docker containers via agent ─────────
  fastify.get<{ Params: { id: string } }>('/:id/docker/containers', async (request, reply) => {
    const user   = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    if (!deviceRegistry.isDeviceOnline(device.id)) return reply.code(503).send({ error: 'Device offline' })

    try {
      const commandId = uuidv4()
      const result = await sendCommandToAgent(device.id, commandId, 'docker ps --format "{{json .}}" 2>/dev/null', 15000)
      if (result.exitCode !== 0) return reply.send({ available: false, containers: [] })
      const containers = result.stdout
        .split('\n').filter(Boolean)
        .map(line => { try { return JSON.parse(line) } catch { return null } })
        .filter(Boolean)
      return { available: true, containers }
    } catch (e) {
      return reply.code(503).send({ error: (e as Error).message })
    }
  })

  // ── POST /:id/docker/:containerId/:action — start/stop/restart container ──
  fastify.post<{ Params: { id: string; containerId: string; action: string } }>(
    '/:id/docker/:containerId/:action', async (request, reply) => {
      const user   = request.user as unknown as AuthTokenPayload
      const { id, containerId, action } = request.params
      if (!['start', 'stop', 'restart'].includes(action)) return reply.code(400).send({ error: 'action must be start | stop | restart' })

      const device = await getDeviceById(id)
      if (!device) return reply.code(404).send({ error: 'Device not found' })
      if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
      if (!deviceRegistry.isDeviceOnline(device.id)) return reply.code(503).send({ error: 'Device offline' })

      try {
        const commandId = uuidv4()
        const result = await sendCommandToAgent(device.id, commandId, `docker ${action} ${containerId} 2>&1`, 20000)
        await logAudit({
          userId: user.userId, userEmail: user.email, deviceId: id,
          action: `docker_${action}`, details: { containerId }, ipAddress: request.ip
        })
        return { ok: result.exitCode === 0, exitCode: result.exitCode, output: result.stdout + result.stderr }
      } catch (e) {
        return reply.code(503).send({ error: (e as Error).message })
      }
    }
  )

  // ── T007: POST /:id/wol — Wake-on-LAN ────────────────────────────────────
  // Sends an IEEE 802.3 Magic Packet to wake a device that supports WoL.
  // The device must already have WoL enabled in its BIOS/firmware and NIC driver.
  fastify.post<{
    Params: { id: string }
    Body: { macAddress: string; broadcast?: string; port?: number }
  }>('/:id/wol', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { id } = request.params
    const { macAddress, broadcast = '255.255.255.255', port = 9 } = request.body

    if (!macAddress) return reply.code(400).send({ error: 'macAddress مطلوب' })

    const device = await getDeviceById(id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    // Normalise MAC: strip separators, validate length
    const mac = macAddress.replace(/[:\-. ]/g, '').toUpperCase()
    if (!/^[0-9A-F]{12}$/.test(mac)) {
      return reply.code(400).send({ error: 'MAC address غير صالح — يجب أن يكون 12 رمز hex (مثال: AA:BB:CC:DD:EE:FF)' })
    }

    try {
      await sendWakeOnLan(mac, broadcast, port)
      await logAudit({
        userId: user.userId, userEmail: user.email, deviceId: id,
        action: 'wake_on_lan', details: { mac, broadcast, port }, ipAddress: request.ip
      })
      return { ok: true, message: `Magic packet sent to ${macAddress} via ${broadcast}:${port}` }
    } catch (e) {
      return reply.code(500).send({ error: (e as Error).message })
    }
  })
}

// ── Wake-on-LAN: Magic Packet via UDP broadcast ───────────────────────────────
function sendWakeOnLan(mac: string, broadcast: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Magic Packet: 6 bytes of 0xFF followed by 16 repetitions of the 6-byte MAC
    const macBytes = Buffer.from(mac, 'hex')
    const packet   = Buffer.alloc(102)
    packet.fill(0xff, 0, 6)
    for (let i = 0; i < 16; i++) macBytes.copy(packet, 6 + i * 6)

    // Dynamic import to keep module loading synchronous in Fastify context
    const socket = dgram.createSocket('udp4')

    socket.once('error', (err) => {
      try { socket.close() } catch {}
      reject(err)
    })

    socket.bind(0, () => {
      socket.setBroadcast(true)
      socket.send(packet, 0, packet.length, port, broadcast, (err) => {
        try { socket.close() } catch {}
        if (err) reject(err); else resolve()
      })
    })
  })
}
