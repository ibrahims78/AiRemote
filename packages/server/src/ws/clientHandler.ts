import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { deviceRegistry } from './registry'
import { getDeviceById } from '../db/devices'

export function handleClientMessage(
  socket: WebSocket,
  message: { type: string; payload: Record<string, unknown> },
  _request: FastifyRequest
): void {
  switch (message.type) {
    case 'client:subscribe': {
      const { userId, deviceIds } = message.payload as { userId: string; deviceIds: string[] }
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
