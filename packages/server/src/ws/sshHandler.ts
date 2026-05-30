import type { WebSocket } from 'ws'
import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { deviceRegistry } from './registry'
import { logAudit } from '../db/audit'
import { getDb } from '../db/database'
import type { AuthTokenPayload } from '@airemote/shared'

export function handleSshWebSocket(socket: WebSocket, request: FastifyRequest) {
  const jwtUser = request.user as unknown as AuthTokenPayload | undefined

  socket.on('message', async (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      // ── ssh:connect — client wants to open an SSH tunnel via the agent ──────
      if (msg.type === 'ssh:connect') {
        const { host, port, username, password, privateKey, deviceId, rows, cols } = msg.payload

        if (!deviceId) {
          socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: 'deviceId is required' } }))
          return
        }

        if (!deviceRegistry.isDeviceOnline(deviceId)) {
          socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: 'Device is offline' } }))
          return
        }

        const sessionId = uuidv4()

        deviceRegistry.addSshSession(
          sessionId,
          socket,
          deviceId,
          jwtUser?.userId,
          jwtUser?.email
        )

        // Record DB session
        if (jwtUser) {
          try {
            const db = getDb()
            await db.execute({
              sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address)
                    VALUES (?, ?, ?, 'ssh', ?, ?)`,
              args: [sessionId, deviceId, jwtUser.userId, new Date().toISOString(), request.ip]
            })
            await logAudit({
              userId: jwtUser.userId,
              userEmail: jwtUser.email,
              deviceId,
              action: 'ssh_connect',
              details: { host, port: port || 22, username, via: 'agent_tunnel' },
              ipAddress: request.ip
            })
          } catch {}
        }

        // Forward to agent: ask it to open SSH to the given host:port
        const sent = deviceRegistry.sendToDevice(deviceId, {
          type: 'server:ssh_open',
          payload: { sessionId, host, port: port || 22, username, password, privateKey, rows, cols },
          timestamp: Date.now()
        })

        if (!sent) {
          deviceRegistry.removeSshSession(sessionId)
          socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: 'Failed to reach device agent' } }))
          return
        }

        // Server-side connect timeout — if agent doesn't respond in 20s, notify the dashboard
        const connectTimer = setTimeout(() => {
          const session = deviceRegistry.getSshSession(sessionId)
          if (session) {
            try {
              session.dashboardSocket.send(JSON.stringify({
                type: 'ssh:error',
                payload: { message: `Connection timed out — could not reach ${host}:${port || 22} within 20s` }
              }))
            } catch {}
            deviceRegistry.removeSshSession(sessionId)
          }
        }, 20_000)

        deviceRegistry.setSshConnectTimeout(sessionId, connectTimer)
      }

      // ── ssh:data — keystrokes from dashboard → forward to agent ─────────────
      else if (msg.type === 'ssh:data') {
        const sessionId = deviceRegistry.getSessionIdByDashboardSocket(socket)
        if (!sessionId) return
        const session = deviceRegistry.getSshSession(sessionId)
        if (!session) return

        deviceRegistry.sendToDevice(session.deviceId, {
          type: 'server:ssh_data',
          payload: { sessionId, data: msg.payload.data },
          timestamp: Date.now()
        })
      }

      // ── ssh:resize — terminal resize from dashboard → forward to agent ───────
      else if (msg.type === 'ssh:resize') {
        const sessionId = deviceRegistry.getSessionIdByDashboardSocket(socket)
        if (!sessionId) return
        const session = deviceRegistry.getSshSession(sessionId)
        if (!session) return

        deviceRegistry.sendToDevice(session.deviceId, {
          type: 'server:ssh_resize',
          payload: { sessionId, rows: msg.payload.rows, cols: msg.payload.cols },
          timestamp: Date.now()
        })
      }

      // ── ssh:disconnect — dashboard is closing the session ───────────────────
      else if (msg.type === 'ssh:disconnect') {
        await closeSession(socket)
      }

    } catch (e) {
      console.error('SSH WS error:', e)
    }
  })

  socket.on('close', () => { closeSession(socket).catch(() => {}) })
  socket.on('error', () => { closeSession(socket).catch(() => {}) })
}

async function closeSession(dashboardSocket: WebSocket): Promise<void> {
  const sessionId = deviceRegistry.getSessionIdByDashboardSocket(dashboardSocket)
  if (!sessionId) return

  const session = deviceRegistry.removeSshSession(sessionId)
  if (!session) return

  // Tell agent to close its SSH connection
  deviceRegistry.sendToDevice(session.deviceId, {
    type: 'server:ssh_close',
    payload: { sessionId },
    timestamp: Date.now()
  })

  // Update DB session record
  try {
    const db = getDb()
    const endedAt = new Date().toISOString()
    const durationSec = Math.round((Date.now() - session.startedAt) / 1000)
    await db.execute({
      sql: `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
      args: [endedAt, durationSec, sessionId]
    })
    if (session.userId && session.userEmail) {
      await logAudit({
        userId: session.userId,
        userEmail: session.userEmail,
        deviceId: session.deviceId,
        action: 'ssh_disconnect',
        details: { durationSec }
      })
    }
  } catch {}
}
