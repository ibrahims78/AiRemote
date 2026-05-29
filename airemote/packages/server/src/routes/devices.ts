import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth, requireAdmin } from '../middleware/auth'
import {
  createDevice, getDeviceById, getDevicesByOwner,
  getAllDevices, deleteDevice, renameDevice
} from '../db/devices'
import { deviceRegistry } from '../ws/registry'
import { sendCommandToAgent } from '../ws/agentHandler'
import type { AuthTokenPayload } from '@airemote/shared'

export async function deviceRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const devices = user.role === 'admin' ? await getAllDevices() : await getDevicesByOwner(user.userId)
    return devices.map(d => ({ ...d, online: deviceRegistry.isDeviceOnline(d.id) }))
  })

  fastify.post<{ Body: { name: string } }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { name } = request.body
    if (!name?.trim()) return reply.code(400).send({ error: 'Device name required' })
    const device = await createDevice(name.trim(), user.userId)
    return reply.code(201).send(device)
  })

  fastify.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    return { ...device, online: deviceRegistry.isDeviceOnline(device.id) }
  })

  fastify.patch<{ Params: { id: string }; Body: { name: string } }>('/:id', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    await renameDevice(device.id, request.body.name)
    return getDeviceById(device.id)
  })

  fastify.delete<{ Params: { id: string } }>('/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    await deleteDevice(device.id)
    return reply.code(204).send()
  })

  // Execute a command on a device via the Agent WebSocket (no SSH needed)
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

    if (!deviceRegistry.isDeviceOnline(id)) {
      return reply.code(503).send({ error: 'Device is offline' })
    }

    const commandId = uuidv4()
    try {
      const result = await sendCommandToAgent(id, commandId, command.trim(), Math.min(timeoutMs, 120000))
      return reply.send({
        ok: true,
        commandId,
        command: command.trim(),
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration
      })
    } catch (err: unknown) {
      const e = err as Error
      return reply.code(504).send({ error: e.message || 'Command execution failed' })
    }
  })

  // Get live stats for a device
  fastify.get<{ Params: { id: string } }>('/:id/stats', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const device = await getDeviceById(request.params.id)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const regDevice = deviceRegistry.getDevice(request.params.id)
    return {
      online: !!regDevice,
      stats: regDevice?.stats || null,
      connectedAt: regDevice?.connectedAt || null
    }
  })
}
