import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { deviceRegistry } from './registry'
import type { AuthTokenPayload } from '@airemote/shared'
import { consumeWsTicket } from '../lib/wsTickets'
import { getDb } from '../db/database'
import {
  startRecording, stopRecording, isRecording,
  getRecordingMeta, exportRecordingAsZip, deleteRecording
} from '../services/recording'

// ── Throttle settings ────────────────────────────────────────────────────────
const DEFAULT_FPS     = 20
const MAX_FPS         = 30
const CONNECT_TIMEOUT = 60_000

export function handleScreenWebSocket(socket: WebSocket, request: FastifyRequest) {
  const query = request.query as {
    ticket?: string; token?: string; deviceId?: string
    fps?: string; quality?: string
  }

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

  // ── Connect timeout ───────────────────────────────────────────────────────
  const connectTimer = setTimeout(() => {
    const s = deviceRegistry.getScreenSession(sessionId)
    if (s) {
      try {
        s.dashboardSocket.send(JSON.stringify({
          type: 'screen:error',
          payload: { message: 'Agent did not start screen capture — make sure the agent is v2.0.0+' }
        }))
        s.dashboardSocket.close()
      } catch {}
      cleanup(sessionId, deviceId)
    }
  }, CONNECT_TIMEOUT)
  deviceRegistry.setScreenConnectTimeout(sessionId, connectTimer)

  console.log(`🖥️  Screen session started: ${sessionId} (device=${deviceId}, fps=${fps}, quality=${quality})`)

  // ── Keep-alive: prevent Replit proxy from closing idle WS connections ─────
  // Sends a protocol-level WebSocket ping every 30s so the proxy sees activity
  // even when no frames are flowing (e.g., static screen with no changes).
  const keepAliveTimer = setInterval(() => {
    if (socket.readyState === 1) {
      try { socket.ping() } catch { /* socket closing */ }
    } else {
      clearInterval(keepAliveTimer)
    }
  }, 30_000)

  // ── Frame throttling ──────────────────────────────────────────────────────
  const frameIntervalMs = 1000 / fps
  let lastFrameAt = 0

  deviceRegistry.setScreenFrameThrottle(sessionId, () => {
    const now = Date.now()
    if (now - lastFrameAt < frameIntervalMs) return false
    lastFrameAt = now
    return true
  })

  // ── T006: In-session chat state ───────────────────────────────────────────
  const chatHistory: Array<{ text: string; sender: string; ts: number }> = []

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

        // ── v2.0.0 Remote Control ──────────────────────────────────────────
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

        case 'screen:request_control': {
          const requestId = msg.payload?.requestId || uuidv4()
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_control_request',
            payload: { sessionId, requestId, requesterName: userEmail },
            timestamp: Date.now()
          })
          break
        }

        // ── T006: In-session text chat (dashboard → agent) ────────────────
        case 'screen:chat': {
          const text   = (msg.payload?.text || '').toString().slice(0, 2000)
          const sender = 'viewer'
          const ts     = Date.now()
          if (!text.trim()) break

          const entry = { text, sender, ts }
          chatHistory.push(entry)

          // Relay to agent (shows notification on desktop agent)
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_chat',
            payload: { sessionId, text, sender, ts },
            timestamp: ts
          })

          // Echo back to dashboard so the sender sees their own message
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:chat',
              payload: { text, sender, ts }
            }))
          }
          break
        }

        // ── T008: Session recording ───────────────────────────────────────
        case 'screen:record_start': {
          if (!isRecording(sessionId)) {
            const maxFrames = Math.min(msg.payload?.maxFrames || 600, 3600)
            startRecording(sessionId, deviceId, userId, maxFrames)
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({
                type:    'screen:record_status',
                payload: { recording: true, sessionId }
              }))
            }
          }
          break
        }

        case 'screen:record_stop': {
          const meta = stopRecording(sessionId)
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:record_status',
              payload: { recording: false, sessionId, meta }
            }))
          }
          break
        }

        case 'screen:record_status': {
          const meta = getRecordingMeta(sessionId)
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:record_status',
              payload: { recording: isRecording(sessionId), sessionId, meta }
            }))
          }
          break
        }

        // ── Latency ping-pong ─────────────────────────────────────────────
        case 'screen:ping':
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:pong',
              payload: { clientTs: msg.payload?.ts, serverTs: Date.now() },
              timestamp: Date.now()
            }))
          }
          break
      }
    } catch {}
  })

  socket.on('close', () => { clearInterval(keepAliveTimer); cleanup(sessionId, deviceId) })
  socket.on('error', () => { clearInterval(keepAliveTimer); cleanup(sessionId, deviceId) })
}

// ── Cleanup helper ────────────────────────────────────────────────────────────
function cleanup(sessionId: string, deviceId: string): void {
  const session = deviceRegistry.removeScreenSession(sessionId)
  if (!session) return

  // Stop recording if still active
  if (isRecording(sessionId)) {
    stopRecording(sessionId)
  }

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

// ── T008: Recording download HTTP endpoint (called from route registration) ──
export async function handleRecordingDownload(
  sessionId: string,
  reply: {
    code: (n: number) => { send: (b: unknown) => void }
    header: (k: string, v: string) => void
    send: (b: unknown) => void
  }
): Promise<void> {
  const meta = getRecordingMeta(sessionId)
  if (!meta) {
    reply.code(404).send({ error: 'Recording not found' })
    return
  }
  if (meta.active) {
    reply.code(409).send({ error: 'Recording still in progress — stop it first' })
    return
  }

  const zip = await exportRecordingAsZip(sessionId)
  if (!zip) {
    reply.code(404).send({ error: 'No frames recorded' })
    return
  }

  reply.header('Content-Type', 'application/zip')
  reply.header('Content-Disposition', `attachment; filename="recording-${sessionId.slice(0, 8)}.zip"`)
  reply.send(zip)

  // Auto-cleanup after download
  deleteRecording(sessionId)
}
