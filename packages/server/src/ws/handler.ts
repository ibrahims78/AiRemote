import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'
import { deviceRegistry } from './registry'
import { handleAgentMessage, handleAgentBinaryFrame, cleanupDevice } from './agentHandler'
import { handleClientMessage } from './clientHandler'
import { updateDeviceStatus } from '../db/devices'

// Ping interval for dead-connection detection.
// Uses BOTH protocol-level WebSocket pings AND application-level JSON pings
// so the cycle works even when a reverse proxy intercepts protocol frames.
// On every incoming agent message the full cycle is reset.
// Max silent window before kill: PING_INTERVAL_MS + PONG_TIMEOUT_MS = 17s.
const PING_INTERVAL_MS = 5000
const PONG_TIMEOUT_MS  = 12000  // covers 10s heartbeat + stats collection delay

export function wsHandler(socket: WebSocket, request: FastifyRequest) {
  const clientIp = request.ip
  let connectionType: 'agent' | 'client' | 'unknown' = 'unknown'
  let connectionId: string | null = null
  let authenticatedUser: AuthTokenPayload | null = null

  // ── Ping / Pong — detect half-open (zombie) connections ──────────────────
  let pongTimer: NodeJS.Timeout | null = null
  let pingTimer: NodeJS.Timeout | null = null

  let disconnected = false  // guard against double handleDisconnect calls

  function schedulePing() {
    if (pingTimer) { clearTimeout(pingTimer); pingTimer = null }
    pingTimer = setTimeout(() => {
      pingTimer = null
      if (socket.readyState !== 1) return

      // Expect a pong (protocol OR application-level) within PONG_TIMEOUT_MS
      pongTimer = setTimeout(() => {
        console.warn(`💀 WS ping timeout — terminating ${connectionType} connection${connectionId ? ` (${connectionId})` : ''}`)
        handleDisconnect()
        socket.terminate()
      }, PONG_TIMEOUT_MS)

      // Send both protocol-level ping (ws library) AND application-level JSON ping.
      // The JSON ping works even when a reverse proxy intercepts protocol frames.
      try { socket.ping() } catch { /* socket already closing */ }
      if (connectionType === 'agent' && socket.readyState === 1) {
        try { socket.send(JSON.stringify({ type: 'server:ping', payload: {}, timestamp: Date.now() })) } catch {}
      }
    }, PING_INTERVAL_MS)
  }

  function clearPongTimer() {
    if (pongTimer) { clearTimeout(pongTimer); pongTimer = null }
  }

  // Protocol-level pong
  socket.on('pong', () => {
    clearPongTimer()
    schedulePing()
  })

  function clearTimers() {
    if (pingTimer)  { clearTimeout(pingTimer);  pingTimer  = null }
    if (pongTimer)  { clearTimeout(pongTimer);  pongTimer  = null }
  }

  function handleDisconnect() {
    if (disconnected) return   // guard against double-fire (terminate() triggers close event)
    disconnected = true
    clearTimers()
    if (connectionType === 'agent' && connectionId) {
      deviceRegistry.disconnectDevice(connectionId)
      updateDeviceStatus(connectionId, 'offline').catch(() => {})
      cleanupDevice(connectionId)
      console.log(`📴 Agent disconnected: ${connectionId}`)
    } else if (connectionType === 'client') {
      deviceRegistry.removeClient(socket)
    }
  }

  schedulePing()

  console.log(`🔌 New WebSocket connection from ${clientIp}`)

  socket.on('message', (raw: Buffer, isBinary: boolean) => {
    // ── Binary frame: raw JPEG from v3.1+ agent (no JSON/base64 overhead) ──
    if (isBinary) {
      if (connectionType === 'unknown') connectionType = 'agent'
      clearPongTimer()
      schedulePing()
      handleAgentBinaryFrame(socket, raw, connectionId).catch(err => console.error('Binary frame error:', err))
      return
    }

    try {
      const message = JSON.parse(raw.toString())
      if (!message.type || message.payload === undefined) {
        socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid message format' } }))
        return
      }

      if (message.type.startsWith('agent:')) {
        if (connectionType === 'unknown') connectionType = 'agent'

        // ── Any agent message proves the connection is alive ────────────────
        // Unconditionally reset the full ping/pong cycle so that:
        //   • pongTimer (kill countdown) is cancelled
        //   • pingTimer is rescheduled from now (not from the last heartbeat)
        // This handles the case where getStats() delays heartbeats and the
        // old pong window would have expired before the heartbeat arrived.
        clearPongTimer()
        schedulePing()   // schedulePing now always clears+replaces the existing timer

        // agent:pong is an application-level response to server:ping — no further processing needed
        if (message.type === 'agent:pong') return

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
