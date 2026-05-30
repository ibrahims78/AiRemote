import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { deviceRegistry } from './registry'
import { handleAgentMessage } from './agentHandler'
import { handleClientMessage } from './clientHandler'
import { updateDeviceStatus } from '../db/devices'

export function wsHandler(socket: WebSocket, request: FastifyRequest) {
  const clientIp = request.ip
  let connectionType: 'agent' | 'client' | 'unknown' = 'unknown'
  let connectionId: string | null = null

  console.log(`🔌 New WebSocket connection from ${clientIp}`)

  socket.on('message', (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString())
      if (!message.type || message.payload === undefined) {
        socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid message format' } }))
        return
      }

      if (message.type.startsWith('agent:')) {
        if (connectionType === 'unknown') connectionType = 'agent'
        handleAgentMessage(socket, message, clientIp).then(result => {
          if (result?.deviceId) connectionId = result.deviceId
        }).catch(err => console.error('Agent message error:', err))
      } else if (message.type.startsWith('client:')) {
        if (connectionType === 'unknown') connectionType = 'client'
        handleClientMessage(socket, message, request)
      }
    } catch {
      socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Parse error' } }))
    }
  })

  socket.on('close', () => {
    if (connectionType === 'agent' && connectionId) {
      deviceRegistry.disconnectDevice(connectionId)
      updateDeviceStatus(connectionId, 'offline').catch(() => {})
      console.log(`📴 Agent disconnected: ${connectionId}`)
    } else if (connectionType === 'client') {
      deviceRegistry.removeClient(socket)
    }
  })

  socket.on('error', (err) => { console.error(`WebSocket error:`, err.message) })
}
