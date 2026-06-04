import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'
import { deviceRegistry } from './registry'
import { handleAgentMessage } from './agentHandler'
import { handleClientMessage } from './clientHandler'
import { updateDeviceStatus } from '../db/devices'

// Ping interval for dead-connection detection.
// On every incoming agent message we clear pongTimer AND re-arm pingTimer so
// the cycle stays alive.  If the agent goes truly silent the ping fires after
// PING_INTERVAL_MS and terminates after PONG_TIMEOUT_MS → max detection = 50s.
const PING_INTERVAL_MS = 30000
const PONG_TIMEOUT_MS  = 20000

export function wsHandler(socket: WebSocket, request: FastifyRequest) {
  const clientIp = request.ip
  let connectionType: 'agent' | 'client' | 'unknown' = 'unknown'
  let connectionId: string | null = null
  let authenticatedUser: AuthTokenPayload | null = null

  // ── Ping / Pong — detect half-open (zombie) connections ──────────────────
  let pongTimer: NodeJS.Timeout | null = null
  let pingTimer: NodeJS.Timeout | null = null

  function schedulePing() {
    pingTimer = setTimeout(() => {
      pingTimer = null  // ← mark as fired so the message handler can re-arm the cycle
      if (socket.readyState !== 1) return

      // Expect a pong within PONG_TIMEOUT_MS; if none → terminate
      pongTimer = setTimeout(() => {
        console.warn(`💀 WS ping timeout — terminating ${connectionType} connection${connectionId ? ` (${connectionId})` : ''}`)
        handleDisconnect()
        socket.terminate()
      }, PONG_TIMEOUT_MS)

      try { socket.ping() } catch { /* socket already closing */ }
    }, PING_INTERVAL_MS)
  }

  socket.on('pong', () => {
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
    schedulePing()
  })

  function clearTimers() {
    if (pingTimer)  { clearTimeout(pingTimer);  pingTimer  = null }
    if (pongTimer)  { clearTimeout(pongTimer);  pongTimer  = null }
  }

  function handleDisconnect() {
    clearTimers()
    if (connectionType === 'agent' && connectionId) {
      deviceRegistry.disconnectDevice(connectionId)
      updateDeviceStatus(connectionId, 'offline').catch(() => {})
      console.log(`📴 Agent disconnected: ${connectionId}`)
    } else if (connectionType === 'client') {
      deviceRegistry.removeClient(socket)
    }
  }

  schedulePing()

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

        // ── Any agent message proves the connection is alive ────────────────
        // Clear the kill-timer (pongTimer) and, crucially, re-arm pingTimer if
        // it has already fired (pingTimer === null after it sends the ping).
        // Without the re-arm the monitoring cycle goes dead and zombie
        // connections are never detected.
        if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
        if (!pingTimer) { schedulePing() }  // restart the 30s monitoring window
        handleAgentMessage(socket, message, clientIp).then(result => {
          if (result?.deviceId) connectionId = result.deviceId
        }).catch(err => console.error('Agent message error:', err))

      } else if (message.type.startsWith('client:')) {
        if (connectionType === 'unknown') {
          connectionType = 'client'

          const query = request.query as { token?: string }
          const token = query.token
          if (!token) {
            socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Unauthorized' } }))
            socket.close()
            return
          }
          try {
            authenticatedUser = request.server.jwt.verify<AuthTokenPayload>(token)
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

  socket.on('close', () => { handleDisconnect() })
  socket.on('error', (err) => {
    console.error(`WebSocket error:`, err.message)
    handleDisconnect()
  })
}
