import type { WebSocket } from 'ws'
import { Client as SSH2Client } from 'ssh2'
import type { FastifyRequest } from 'fastify'

interface SSHSession {
  client: SSH2Client
  stream: NodeJS.ReadWriteStream | null
}

const activeSessions = new Map<WebSocket, SSHSession>()

export function handleSshWebSocket(socket: WebSocket, _request: FastifyRequest) {
  let session: SSHSession | null = null

  socket.on('message', (raw: Buffer) => {
    try {
      const msg = JSON.parse(raw.toString())

      if (msg.type === 'ssh:connect') {
        const { host, port, username, password, privateKey } = msg.payload
        const client = new SSH2Client()

        client.on('ready', () => {
          client.shell({ term: 'xterm-256color', rows: msg.payload.rows || 24, cols: msg.payload.cols || 80 }, (err, stream) => {
            if (err) {
              socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }))
              return
            }

            session = { client, stream }
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
              client.end()
            })
          })
        })

        client.on('error', (err) => {
          socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }))
        })

        const connectConfig: Record<string, unknown> = {
          host,
          port: port || 22,
          username,
          readyTimeout: 15000
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
        if (s?.stream) {
          s.stream.write(Buffer.from(msg.payload.data, 'base64'))
        }
      }

      else if (msg.type === 'ssh:resize') {
        const s = session || activeSessions.get(socket)
        if (s?.stream) {
          (s.stream as unknown as { setWindow: (rows: number, cols: number) => void }).setWindow(
            msg.payload.rows,
            msg.payload.cols
          )
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

function cleanup(socket: WebSocket) {
  const s = activeSessions.get(socket)
  if (s) {
    try { s.stream?.end() } catch {}
    try { s.client.end() } catch {}
    activeSessions.delete(socket)
  }
}
