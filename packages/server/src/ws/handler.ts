import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'
import { deviceRegistry } from './registry'
import { handleAgentMessage } from './agentHandler'
import { handleClientMessage } from './clientHandler'
import { updateDeviceStatus } from '../db/devices'

export function wsHandler(socket: WebSocket, request: FastifyRequest) {
  const clientIp = request.ip
  let connectionType: 'agent' | 'client' | 'unknown' = 'unknown'
  let connectionId: string | null = null
  let authenticatedUser: AuthTokenPayload | null = null

  console.log(`🔌 New WebSocket connection from ${clientIp}`)

  socket.on('message', (raw: Buffer) => {
    try {
      const message = JSON.parse(raw.toString())
      if (!message.type || message.payload === undefined) {
        socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid message format' } }))
        return
      }

      if (message.type.startsWith('agent:')) {
        // Agents authenticate via device token inside agent:register payload
        if (connectionType === 'unknown') connectionType = 'agent'
        handleAgentMessage(socket, message, clientIp).then(result => {
          if (result?.deviceId) connectionId = result.deviceId
        }).catch(err => console.error('Agent message error:', err))

      } else if (message.type.startsWith('client:')) {
        // Dashboard clients authenticate via JWT in ?token= query param
        if (connectionType === 'unknown') {
          connectionType = 'client'

          // Verify JWT once on first client message
          const query = request.query as { token?: string }
          const token = query.token
          if (!token) {
            socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Unauthorized' } }))
            socket.close()
            return
          }
          try {
            authenticatedUser = request.server.jwt.verify<AuthTokenPayload>(token)
            // Inject into request so clientHandler can read request.user
            ;(request as unknown as Record<string, unknown>).user = authenticatedUser
          } catch {
            socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid token' } }))
            socket.close()
            return
          }
        }

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
