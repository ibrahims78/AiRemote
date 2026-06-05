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

const DEFAULT_FPS     = 20
const MAX_FPS         = 30
const CONNECT_TIMEOUT = 60_000

export function handleScreenWebSocket(socket: WebSocket, request: FastifyRequest) {
  const query = request.query as {
    ticket?: string; token?: string; deviceId?: string
    fps?: string; quality?: string
  }

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

  // Per-viewer DB session ID (unique for every WS connection, for history tracking)
  const viewerSessionId = uuidv4()

  // ── Register viewer — join existing agent capture if possible ─────────────
  const { agentSessionId, isNew } = deviceRegistry.addScreenSession(
    viewerSessionId, socket, deviceId, userId
  )

  // ── Record this viewer's session in DB ────────────────────────────────────
  const startedAt = new Date().toISOString()
  getDb().execute({
    sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address)
          VALUES (?, ?, ?, 'screen', ?, ?)`,
    args: [viewerSessionId, deviceId, userId, startedAt, request.ip]
  }).catch(() => {})

  // ── Notify this viewer of how many others are watching ───────────────────
  const viewerCount = deviceRegistry.getScreenViewerCount(agentSessionId)
  if (viewerCount > 1) {
    socket.send(JSON.stringify({
      type:    'screen:viewer_count',
      payload: { count: viewerCount }
    }))
  }
  // Notify all OTHER viewers of the new count
  broadcastViewerCount(agentSessionId)

  if (isNew) {
    // ── New capture session: ask agent to start capturing ─────────────────
    const sent = deviceRegistry.sendToDevice(deviceId, {
      type:      'server:screen_start',
      payload:   { sessionId: agentSessionId, fps, quality },
      timestamp: Date.now()
    })

    if (!sent) {
      deviceRegistry.removeViewerFromScreenSession(agentSessionId, socket)
      deviceRegistry.removeScreenSession(agentSessionId)
      socket.send(JSON.stringify({ type: 'screen:error', payload: { message: 'Failed to reach device agent' } }))
      socket.close()
      return
    }

    // ── Connect timeout (only for new capture sessions) ───────────────────
    const connectTimer = setTimeout(() => {
      const s = deviceRegistry.getScreenSession(agentSessionId)
      if (s) {
        deviceRegistry.closeAllScreenViewers(agentSessionId, {
          type: 'screen:error',
          payload: { message: 'Agent did not start screen capture — make sure the agent is v2.0.0+' }
        })
        cleanup(agentSessionId, deviceId)
      }
    }, CONNECT_TIMEOUT)
    deviceRegistry.setScreenConnectTimeout(agentSessionId, connectTimer)

    // ── Frame throttling (new session only) ───────────────────────────────
    deviceRegistry.setScreenFrameThrottle(agentSessionId, makeThrottle(fps))

    console.log(`🖥️  Screen session started: ${agentSessionId} (device=${deviceId}, fps=${fps}, quality=${quality})`)
  } else {
    console.log(`🖥️  Viewer joined screen session: ${agentSessionId} (device=${deviceId}, viewers=${viewerCount})`)
  }

  // ── Keep-alive ────────────────────────────────────────────────────────────
  const keepAliveTimer = setInterval(() => {
    if (socket.readyState === 1) {
      try { socket.ping() } catch {}
      try {
        socket.send(JSON.stringify({ type: 'screen:keepalive', payload: { ts: Date.now() } }))
      } catch {}
    } else {
      clearInterval(keepAliveTimer)
    }
  }, 15_000)

  // ── Handle dashboard → server messages ───────────────────────────────────
  const chatHistory: Array<{ text: string; sender: string; ts: number }> = []

  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      switch (msg.type) {
        case 'screen:stop':
          leaveSession(agentSessionId, viewerSessionId, deviceId, socket)
          socket.close()
          break

        case 'screen:set_quality': {
          const newFps     = Math.min(MAX_FPS, Math.max(1, parseInt(msg.payload?.fps     || fps)))
          const newQuality = Math.min(95,      Math.max(10, parseInt(msg.payload?.quality || quality)))
          const monId      = msg.payload?.monitorId ?? 0
          deviceRegistry.setScreenFrameThrottle(agentSessionId, makeThrottle(newFps))
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_start',
            payload: { sessionId: agentSessionId, fps: newFps, quality: newQuality, monitorId: monId },
            timestamp: Date.now()
          })
          break
        }

        case 'screen:mouse_event':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_mouse',
            payload: { ...msg.payload, sessionId: agentSessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:key_event':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_key',
            payload: { ...msg.payload, sessionId: agentSessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:clipboard_read':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_clipboard_read',
            payload: { sessionId: agentSessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:clipboard_write':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_clipboard_write',
            payload: { sessionId: agentSessionId, text: msg.payload?.text || '' },
            timestamp: Date.now()
          })
          break

        case 'screen:get_monitors':
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_get_monitors',
            payload: { sessionId: agentSessionId },
            timestamp: Date.now()
          })
          break

        case 'screen:set_monitor': {
          const monitorId   = msg.payload?.monitorId ?? 0
          const newFps2     = Math.min(MAX_FPS, Math.max(1, parseInt(msg.payload?.fps     || fps)))
          const newQuality2 = Math.min(95,      Math.max(10, parseInt(msg.payload?.quality || quality)))
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_set_monitor',
            payload: { sessionId: agentSessionId, monitorId },
            timestamp: Date.now()
          })
          deviceRegistry.setScreenFrameThrottle(agentSessionId, makeThrottle(newFps2))
          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_start',
            payload: { sessionId: agentSessionId, fps: newFps2, quality: newQuality2, monitorId },
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
            payload: { sessionId: agentSessionId, requestId, requesterName: userEmail },
            timestamp: Date.now()
          })
          break
        }

        case 'screen:chat': {
          const text   = (msg.payload?.text || '').toString().slice(0, 2000)
          const sender = 'viewer'
          const ts     = Date.now()
          if (!text.trim()) break

          const entry = { text, sender, ts }
          chatHistory.push(entry)

          deviceRegistry.sendToDevice(deviceId, {
            type:    'server:screen_chat',
            payload: { sessionId: agentSessionId, text, sender, ts },
            timestamp: ts
          })

          // Echo back only to THIS viewer (sender)
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'screen:chat', payload: { text, sender, ts } }))
          }
          break
        }

        case 'screen:record_start': {
          if (!isRecording(agentSessionId)) {
            const maxFrames = Math.min(msg.payload?.maxFrames || 600, 3600)
            startRecording(agentSessionId, deviceId, userId, maxFrames)
            if (socket.readyState === 1) {
              socket.send(JSON.stringify({
                type:    'screen:record_status',
                payload: { recording: true, sessionId: agentSessionId }
              }))
            }
          }
          break
        }

        case 'screen:record_stop': {
          const meta = stopRecording(agentSessionId)
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:record_status',
              payload: { recording: false, sessionId: agentSessionId, meta }
            }))
          }
          break
        }

        case 'screen:record_status': {
          const meta = getRecordingMeta(agentSessionId)
          if (socket.readyState === 1) {
            socket.send(JSON.stringify({
              type:    'screen:record_status',
              payload: { recording: isRecording(agentSessionId), sessionId: agentSessionId, meta }
            }))
          }
          break
        }

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

  socket.on('close', () => {
    clearInterval(keepAliveTimer)
    leaveSession(agentSessionId, viewerSessionId, deviceId, socket)
  })
  socket.on('error', () => {
    clearInterval(keepAliveTimer)
    leaveSession(agentSessionId, viewerSessionId, deviceId, socket)
  })
}

// ── makeThrottle ─────────────────────────────────────────────────────────────
function makeThrottle(targetFps: number): () => boolean {
  const intervalMs = 1000 / Math.max(1, Math.min(MAX_FPS, targetFps))
  let lastAt = 0
  return () => {
    const now = Date.now()
    if (now - lastAt < intervalMs) return false
    lastAt = now
    return true
  }
}

// ── broadcastViewerCount ──────────────────────────────────────────────────────
function broadcastViewerCount(agentSessionId: string): void {
  const count = deviceRegistry.getScreenViewerCount(agentSessionId)
  deviceRegistry.sendToScreenViewers(agentSessionId, JSON.stringify({
    type:    'screen:viewer_count',
    payload: { count }
  }))
}

// ── leaveSession ──────────────────────────────────────────────────────────────
// Called when a viewer disconnects (close / stop / error).
// If this is the last viewer, cleanly stops the agent capture loop.
function leaveSession(
  agentSessionId: string,
  viewerSessionId: string,
  deviceId: string,
  socket: WebSocket
): void {
  const isLast = deviceRegistry.removeViewerFromScreenSession(agentSessionId, socket)

  // Always end this viewer's own DB session
  const endedAt     = new Date().toISOString()
  const session     = deviceRegistry.getScreenSession(agentSessionId)
  const durationSec = session
    ? Math.round((Date.now() - session.startedAt) / 1000)
    : 0
  getDb().execute({
    sql:  `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
    args: [endedAt, durationSec, viewerSessionId]
  }).catch(() => {})

  if (isLast) {
    // No more viewers — stop agent capture and clean up fully
    cleanup(agentSessionId, deviceId)
  } else {
    // Remaining viewers still watching — just broadcast updated count
    broadcastViewerCount(agentSessionId)
    console.log(`🖥️  Viewer left screen session: ${agentSessionId} viewers=${deviceRegistry.getScreenViewerCount(agentSessionId)}`)
  }
}

// ── cleanup ───────────────────────────────────────────────────────────────────
function cleanup(agentSessionId: string, deviceId: string): void {
  const session = deviceRegistry.removeScreenSession(agentSessionId)
  if (!session) return

  if (isRecording(agentSessionId)) stopRecording(agentSessionId)

  deviceRegistry.sendToDevice(deviceId, {
    type:      'server:screen_stop',
    payload:   { sessionId: agentSessionId },
    timestamp: Date.now()
  })

  console.log(`🖥️  Screen session ended: ${agentSessionId}`)
}

// ── Recording download ────────────────────────────────────────────────────────
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

  deleteRecording(sessionId)
}
