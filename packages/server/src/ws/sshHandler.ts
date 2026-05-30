import type { WebSocket } from 'ws'
import { Client as SSH2Client } from 'ssh2'
import type { FastifyRequest } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import { logAudit } from '../db/audit'
import type { AuthTokenPayload } from '@airemote/shared'

interface SSHSession {
  client: SSH2Client
  stream: NodeJS.ReadWriteStream | null
  sessionId: string | null
  deviceId: string | null
  userId: string | null
  userEmail: string | null
  startedAt: number
}

const activeSessions = new Map<WebSocket, SSHSession>()

export function handleSshWebSocket(socket: WebSocket, request: FastifyRequest) {
  const jwtUser = request.user as unknown as AuthTokenPayload | undefined
  let session: SSHSession | null = null

  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'ssh:connect') {
        const { host, port, username, password, privateKey, deviceId } = msg.payload
        const client = new SSH2Client()

        client.on('ready', () => {
          client.shell(
            { term: 'xterm-256color', rows: msg.payload.rows || 24, cols: msg.payload.cols || 80 },
            async (err, stream) => {
              if (err) {
                socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }))
                return
              }

              // ── Record session start ─────────────────────────────────────
              let sessionId: string | null = null
              if (jwtUser) {
                try {
                  const db = getDb()
                  sessionId = uuidv4()
                  await db.execute({
                    sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address)
                          VALUES (?, ?, ?, 'ssh', ?, ?)`,
                    args: [sessionId, deviceId || null, jwtUser.userId, new Date().toISOString(), request.ip]
                  })
                  await logAudit({
                    userId: jwtUser.userId, userEmail: jwtUser.email,
                    deviceId: deviceId || undefined, action: 'ssh_connect',
                    details: { host, port: port || 22, username }, ipAddress: request.ip
                  })
                } catch {}
              }

              session = { client, stream, sessionId, deviceId: deviceId || null, userId: jwtUser?.userId || null, userEmail: jwtUser?.email || null, startedAt: Date.now() }
              activeSessions.set(socket, session)
              socket.send(JSON.stringify({ type: 'ssh:connected', payload: { message: 'Connected' } }))

              stream.on('data', (data: Buffer) => {
                if (socket.readyState === 1) {
                  socket.send(JSON.stringify({ type: 'ssh:data', payload: { data: data.toString('base64') } }))
                }
              })

              stream.stderr.on('data', (data: Buffer) => {
                if (socket.readyState === 1) {
                  socket.send(JSON.stringify({ type: 'ssh:data', payload: { data: data.toString('base64') } }))
                }
              })

              stream.on('close', () => {
                socket.send(JSON.stringify({ type: 'ssh:closed', payload: {} }))
                endSession(socket).catch(() => {})
                client.end()
              })
            }
          )
        })

        client.on('error', (err) => {
          socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }))
        })

        const connectConfig: Record<string, unknown> = {
          host, port: port || 22, username, readyTimeout: 15000
        }
        if (privateKey) {
          connectConfig.privateKey = Buffer.from(privateKey, 'base64')
        } else if (password) {
          connectConfig.password = password
        }

        client.connect(connectConfig as Parameters<typeof client.connect>[0])
      }

      else if (msg.type === 'ssh:data') {
        const s = session || activeSessions.get(socket)
        if (s?.stream) s.stream.write(Buffer.from(msg.payload.data, 'base64'))
      }

      else if (msg.type === 'ssh:resize') {
        const s = session || activeSessions.get(socket)
        if (s?.stream) {
          (s.stream as unknown as { setWindow: (rows: number, cols: number) => void })
            .setWindow(msg.payload.rows, msg.payload.cols)
        }
      }

      else if (msg.type === 'ssh:disconnect') {
        cleanup(socket)
      }

    } catch (e) {
      console.error('SSH WS error:', e)
    }
  })

  socket.on('close', () => cleanup(socket))
  socket.on('error', () => cleanup(socket))
}

async function endSession(socket: WebSocket): Promise<void> {
  const s = activeSessions.get(socket)
  if (!s?.sessionId) return
  try {
    const db          = getDb()
    const endedAt     = new Date().toISOString()
    const durationSec = Math.round((Date.now() - s.startedAt) / 1000)
    await db.execute({
      sql: `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`,
      args: [endedAt, durationSec, s.sessionId]
    })
    if (s.userId && s.userEmail) {
      await logAudit({
        userId: s.userId, userEmail: s.userEmail,
        deviceId: s.deviceId || undefined, action: 'ssh_disconnect',
        details: { durationSec }
      })
    }
  } catch {}
}

function cleanup(socket: WebSocket) {
  const s = activeSessions.get(socket)
  if (s) {
    endSession(socket).catch(() => {})
    try { s.stream?.end() } catch {}
    try { s.client.end() } catch {}
    activeSessions.delete(socket)
  }
}
