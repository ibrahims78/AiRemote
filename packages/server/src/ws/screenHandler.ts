import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { deviceRegistry } from './registry'
import type { AuthTokenPayload } from '@airemote/shared'
import { consumeWsTicket } from '../lib/wsTickets'
import { getDb } from '../db/database'

// ── Throttle settings ────────────────────────────────────────────────────────
// Default FPS the server will allow forwarding to the dashboard.
// The agent may send frames faster; we drop extras to protect bandwidth.
const DEFAULT_FPS     = 5
const MAX_FPS         = 15
const CONNECT_TIMEOUT = 15_000   // ms to wait for agent:screen_frame after start

export function handleScreenWebSocket(socket: WebSocket, request: FastifyRequest) {
  const query = request.query as { ticket?: string; token?: string; deviceId?: string; fps?: string; quality?: string }

  // ── Auth — ticket preferred, JWT fallback ────────────────────────────────
  let userId = '', userEmail = '', userRole = ''

  if (query.ticket) {
    const data = consumeWsTicket(query.ticket)
    if (!data) {
      socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Invalid or expired ticket' } }))
      socket.close()
      return
    }
    userId    = data.userId
    userEmail = data.email
    userRole  = data.role
  } else if (query.token) {
    try {
      const payload = request.server.jwt.verify<AuthTokenPayload>(query.token)
      userId    = payload.userId
      userEmail = payload.email
      userRole  = payload.role
    } catch {
      socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Unauthorized' } }))
      socket.close()
      return
    }
  } else {
    socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'No auth provided' } }))
    socket.close()
    return
  }

  const deviceId = query.deviceId
  if (!deviceId) {
    socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'deviceId required' } }))
    socket.close()
    return
  }

  if (!deviceRegistry.isDeviceOnline(deviceId)) {
    socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Device is offline' } }))
    socket.close()
    return
  }

  const fps     = Math.min(MAX_FPS, Math.max(1, parseInt(query.fps     || String(DEFAULT_FPS))))
  const quality = Math.min(95,      Math.max(10, parseInt(query.quality || '65')))
  const sessionId = uuidv4()

  // ── Register screen session ───────────────────────────────────────────────
  deviceRegistry.addScreenSession(sessionId, socket, deviceId, userId)

  // ── Record session in DB ──────────────────────────────────────────────────
  const startedAt = new Date().toISOString()
  getDb().execute({
    sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address)
          VALUES (?, ?, ?, 'screen', ?, ?)`,
    args: [sessionId, deviceId, userId, startedAt, request.ip]
  }).catch(() => {})

  // ── Tell agent to start capturing ─────────────────────────────────────────
  const sent = deviceRegistry.sendToDevice(deviceId, {
    type:      'server:screen_start',
    payload:   { sessionId, fps, quality },
    timestamp: Date.now()
  })

  if (!sent) {
    deviceRegistry.removeScreenSession(sessionId)
    socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Failed to reach device agent' } }))
    socket.close()
    return
  }

  // ── Connect timeout: if agent doesn't respond within N seconds ───────────
  const connectTimer = setTimeout(() => {
    const s = deviceRegistry.getScreenSession(sessionId)
    if (s) {
      try {
        s.dashboardSocket.send(JSON.stringify({
          type: 'screen:error',
          payload: { message: 'Agent did not start screen capture — make sure the agent is v1.6.0+' }
        }))
      } catch {}
      cleanup(sessionId, deviceId)
    }
  }, CONNECT_TIMEOUT)
  deviceRegistry.setScreenConnectTimeout(sessionId, connectTimer)

  console.log(`🖥️  Screen session started: ${sessionId} (device=${deviceId}, fps=${fps}, quality=${quality})`)

  // ── Frame throttling ──────────────────────────────────────────────────────
  // We drop frames that arrive faster than the negotiated FPS to avoid
  // saturating the dashboard's WebSocket buffer.
  const frameIntervalMs = 1000 / fps
  let lastFrameAt = 0

  // Expose throttle check via registry so agentHandler can call it
  deviceRegistry.setScreenFrameThrottle(sessionId, () => {
    const now = Date.now()
    if (now - lastFrameAt < frameIntervalMs) return false
    lastFrameAt = now
    return true
  })

  // ── Handle dashboard messages ─────────────────────────────────────────────
  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'screen:stop':
          cleanup(sessionId, deviceId)
          socket.close()
          break

        case 'screen:set_quality': {
          const newFps     = Math.min(MAX_FPS, Math.max(1, parseInt(msg.payload?.fps     || fps)))
          const newQuality = Math.min(95,      Math.max(10, parseInt(msg.payload?.quality || quality)))
          const monId      = msg.payload?.monitorId ?? 0
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_start',
            payload: { sessionId, fps: newFps, quality: newQuality, monitorId: monId },
            timestamp: Date.now()
          })
          break
        }

        // ── v2.0.0 Remote Control — forward to agent ──────────────────────
        case 'screen:mouse_event':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_mouse',
            payload: { ...msg.payload, sessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:key_event':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_key',
            payload: { ...msg.payload, sessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:clipboard_read':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_clipboard_read',
            payload: { sessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:clipboard_write':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_clipboard_write',
            payload: { sessionId, text: msg.payload?.text || '' },
            timestamp: Date.now()
          })
          break

        case 'screen:get_monitors':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_get_monitors',
            payload: { sessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:set_monitor': {
          const monitorId = msg.payload?.monitorId ?? 0
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_set_monitor',
            payload: { sessionId, monitorId },
            timestamp: Date.now()
          })
          // Restart capture on new monitor
          const newFps2     = Math.min(MAX_FPS, Math.max(1, parseInt(msg.payload?.fps     || fps)))
          const newQuality2 = Math.min(95,      Math.max(10, parseInt(msg.payload?.quality || quality)))
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_start',
            payload: { sessionId, fps: newFps2, quality: newQuality2, monitorId },
            timestamp: Date.now()
          })
          break
        }

        case 'screen:privacy':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_privacy',
            payload: { enable: !!msg.payload?.enable },
            timestamp: Date.now()
          })
          break
      }
    } catch {}
  })

  socket.on('close', () => cleanup(sessionId, deviceId))
  socket.on('error', () => cleanup(sessionId, deviceId))
}

// ── Cleanup helper ────────────────────────────────────────────────────────────
function cleanup(sessionId: string, deviceId: string): void {
  const session = deviceRegistry.removeScreenSession(sessionId)
  if (!session) return

  deviceRegistry.sendToDevice(deviceId, {
    type:      'server:screen_stop',
    payload:   { sessionId },
    timestamp: Date.now()
  })

  const endedAt    = new Date().toISOString()
  const durationSec = Math.round((Date.now() - session.startedAt) / 1000)
  getDb().execute({
    sql:  `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
    args: [endedAt, durationSec, sessionId]
  }).catch(() => {})

  console.log(`🖥️  Screen session ended: ${sessionId} (${durationSec}s)`)
}
