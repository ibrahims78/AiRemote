import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { deviceRegistry } from './registry'
import { getDb } from '../db/database'
import type { AuthTokenPayload } from '@airemote/shared'

export function handlePtyWebSocket(socket: WebSocket, request: FastifyRequest) {
  const jwtUser = request.user as unknown as AuthTokenPayload | undefined

  socket.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      // ── pty:connect — dashboard wants a direct shell on the agent ──────────
      if (msg.type === 'pty:connect') {
        const { deviceId, rows, cols, shell } = msg.payload

        if (!deviceId) {
          socket.send(JSON.stringify({ type: 'pty:error', payload: { message: 'deviceId is required' } }))
          return
        }

        if (!deviceRegistry.isDeviceOnline(deviceId)) {
          socket.send(JSON.stringify({ type: 'pty:error', payload: { message: 'Device is offline — start the agent and try again' } }))
          return
        }

        const sessionId = uuidv4()
        deviceRegistry.addPtySession(sessionId, socket, deviceId, jwtUser?.userId)

        // Record session in DB
        if (jwtUser) {
          try {
            const db = getDb()
            await db.execute({
              sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address)
                    VALUES (?, ?, ?, 'pty', ?, ?)`,
              args: [sessionId, deviceId, jwtUser.userId, new Date().toISOString(), request.ip]
            })
          } catch {}
        }

        const sent = deviceRegistry.sendToDevice(deviceId, {
          type: 'server:pty_open',
          payload: { sessionId, rows: rows || 24, cols: cols || 80, shell: shell || 'auto' },
          timestamp: Date.now()
        })

        if (!sent) {
          deviceRegistry.removePtySession(sessionId)
          socket.send(JSON.stringify({ type: 'pty:error', payload: { message: 'Failed to reach device agent' } }))
          return
        }

        // Server-side connect timeout: 15 s
        const timer = setTimeout(() => {
          const s = deviceRegistry.getPtySession(sessionId)
          if (s) {
            try {
              s.dashboardSocket.send(JSON.stringify({
                type: 'pty:error',
                payload: { message: 'Shell spawn timed out — check that the agent is running v1.2.0+' }
              }))
            } catch {}
            deviceRegistry.removePtySession(sessionId)
          }
        }, 15_000)

        deviceRegistry.setPtyConnectTimeout(sessionId, timer)
      }

      // ── pty:data — keystrokes from dashboard → agent shell ────────────────
      else if (msg.type === 'pty:data') {
        const sessionId = deviceRegistry.getPtySessionIdByDashboardSocket(socket)
        if (!sessionId) return
        const session = deviceRegistry.getPtySession(sessionId)
        if (!session) return

        deviceRegistry.sendToDevice(session.deviceId, {
          type: 'server:pty_data',
          payload: { sessionId, data: msg.payload.data },
          timestamp: Date.now()
        })
      }

      // ── pty:resize — terminal resize → agent ──────────────────────────────
      else if (msg.type === 'pty:resize') {
        const sessionId = deviceRegistry.getPtySessionIdByDashboardSocket(socket)
        if (!sessionId) return
        const session = deviceRegistry.getPtySession(sessionId)
        if (!session) return

        deviceRegistry.sendToDevice(session.deviceId, {
          type: 'server:pty_resize',
          payload: { sessionId, rows: msg.payload.rows, cols: msg.payload.cols },
          timestamp: Date.now()
        })
      }

      // ── pty:disconnect — dashboard closing the shell ───────────────────────
      else if (msg.type === 'pty:disconnect') {
        await closePtySession(socket)
      }

    } catch (e) {
      console.error('PTY WS error:', e)
    }
  })

  socket.on('close', () => { closePtySession(socket).catch(() => {}) })
  socket.on('error', () => { closePtySession(socket).catch(() => {}) })
}

async function closePtySession(dashboardSocket: WebSocket): Promise<void> {
  const sessionId = deviceRegistry.getPtySessionIdByDashboardSocket(dashboardSocket)
  if (!sessionId) return

  const session = deviceRegistry.removePtySession(sessionId)
  if (!session) return

  deviceRegistry.sendToDevice(session.deviceId, {
    type: 'server:pty_close',
    payload: { sessionId },
    timestamp: Date.now()
  })

  try {
    const db = getDb()
    const endedAt    = new Date().toISOString()
    const durationSec = Math.round((Date.now() - session.startedAt) / 1000)
    await db.execute({
      sql: `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
      args: [endedAt, durationSec, sessionId]
    })
  } catch {}
}
