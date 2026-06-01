import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { deviceRegistry } from './registry'
import { getDeviceById } from '../db/devices'
import type { AuthTokenPayload } from '@airemote/shared'

export function handleClientMessage(
  socket: WebSocket,
  message: { type: string; payload: Record<string, unknown> },
  request: FastifyRequest
): void {
  // Use the authenticated user identity — never trust client-provided userId
  const authUser = request.user as unknown as AuthTokenPayload | undefined
  const authenticatedUserId = authUser?.userId

  switch (message.type) {
    case 'client:subscribe': {
      const { deviceIds } = message.payload as { deviceIds: string[] }
      const userId = authenticatedUserId || ''
      deviceRegistry.addClient(userId, socket)

      if (Array.isArray(deviceIds) && deviceIds.length > 0) {
        for (const deviceId of deviceIds) {
          deviceRegistry.subscribeClientToDevice(socket, deviceId)
        }
      }
      // Stats are broadcast to all clients regardless — no explicit subscription needed

      const onlineDeviceIds = deviceRegistry.getOnlineDeviceIds()
      socket.send(JSON.stringify({
        type: 'server:registered',
        payload: { message: 'Subscribed', onlineDevices: onlineDeviceIds },
        timestamp: Date.now()
      }))

      // Push current stats for all online devices so the client
      // doesn't have to wait for the next heartbeat cycle
      const currentStats = deviceRegistry.getAllDeviceStats()
      for (const { deviceId, stats } of currentStats) {
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({
            type: 'broadcast:stats_update',
            payload: { deviceId, stats },
            timestamp: Date.now()
          }))
        }
      }
      break
    }

    case 'client:command': {
      const { deviceId, commandId, command } = message.payload as {
        deviceId: string
        commandId: string
        command: string
      }

      // getDeviceById is async — fire and forget with proper handling
      getDeviceById(deviceId).then(device => {
        if (!device) {
          socket.send(JSON.stringify({
            type: 'server:error',
            payload: { commandId, message: 'Device not found' },
            timestamp: Date.now()
          }))
          return
        }

        const sent = deviceRegistry.sendToDevice(deviceId, {
          type: 'server:command',
          payload: { commandId, type: 'shell', command },
          timestamp: Date.now()
        })

        if (!sent) {
          socket.send(JSON.stringify({
            type: 'server:error',
            payload: { commandId, message: 'Device offline' },
            timestamp: Date.now()
          }))
        }
      }).catch(err => {
        console.error('client:command error:', err)
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { commandId, message: 'Internal error' },
          timestamp: Date.now()
        }))
      })
      break
    }

    default:
      break
  }
}
