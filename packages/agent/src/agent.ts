import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { Client as SSH2Client } from 'ssh2'
import { getDeviceInfo } from './system/info'
import { getDeviceStats } from './system/stats'
import { executeCommand } from './system/executor'
import type { WSMessage, AgentRegisterPayload, ServerCommandPayload } from '@airemote/shared'

const HEARTBEAT_INTERVAL = 10000
const RECONNECT_BASE_DELAY = 2000
const RECONNECT_MAX_DELAY = 30000

interface SshTunnel {
  client: SSH2Client
  stream: NodeJS.ReadWriteStream | null
}

export class AgentService {
  private ws: WebSocket | null = null
  private deviceId: string | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay = RECONNECT_BASE_DELAY
  private running = false
  private sshTunnels = new Map<string, SshTunnel>()

  constructor(
    private readonly serverUrl: string,
    private readonly token: string
  ) {}

  start(): void {
    this.running = true
    this.connect()
    console.log(`🚀 AiRemote Agent starting...`)
    console.log(`📡 Server: ${this.serverUrl}`)
  }

  stop(): void {
    this.running = false
    this.clearTimers()
    for (const [, tunnel] of this.sshTunnels) {
      try { tunnel.stream?.end() } catch {}
      try { tunnel.client.end() } catch {}
    }
    this.sshTunnels.clear()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    console.log('🛑 Agent stopped')
  }

  private connect(): void {
    if (!this.running) return
    console.log(`🔌 Connecting to ${this.serverUrl}...`)
    this.ws = new WebSocket(this.serverUrl)
    this.ws.on('open', () => this.onOpen())
    this.ws.on('message', (data: Buffer) => this.onMessage(data))
    this.ws.on('close', () => this.onClose())
    this.ws.on('error', (err: Error) => this.onError(err))
  }

  private async onOpen(): Promise<void> {
    console.log('✅ Connected to server')
    this.reconnectDelay = RECONNECT_BASE_DELAY

    const info = await getDeviceInfo()
    const stats = await getDeviceStats()

    const payload: AgentRegisterPayload = {
      token: this.token,
      info,
      stats,
      tunnelLayer: 'relay'
    }

    this.send({ type: 'agent:register', payload, timestamp: Date.now() })
    this.startHeartbeat()
  }

  private onMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as WSMessage

      switch (message.type) {
        case 'server:registered': {
          const p = message.payload as { deviceId: string }
          this.deviceId = p.deviceId
          console.log(`✅ Registered as device: ${this.deviceId}`)
          break
        }

        case 'server:command': {
          const p = message.payload as ServerCommandPayload
          this.handleCommand(p)
          break
        }

        case 'server:ssh_open': {
          const p = message.payload as {
            sessionId: string
            host: string
            port: number
            username: string
            password?: string
            privateKey?: string
            rows?: number
            cols?: number
          }
          this.handleSshOpen(p)
          break
        }

        case 'server:ssh_data': {
          const p = message.payload as { sessionId: string; data: string }
          const tunnel = this.sshTunnels.get(p.sessionId)
          if (tunnel?.stream) {
            tunnel.stream.write(Buffer.from(p.data, 'base64'))
          }
          break
        }

        case 'server:ssh_resize': {
          const p = message.payload as { sessionId: string; rows: number; cols: number }
          const tunnel = this.sshTunnels.get(p.sessionId)
          if (tunnel?.stream) {
            (tunnel.stream as unknown as { setWindow: (r: number, c: number) => void })
              .setWindow(p.rows, p.cols)
          }
          break
        }

        case 'server:ssh_close': {
          const p = message.payload as { sessionId: string }
          this.closeSshTunnel(p.sessionId)
          break
        }

        case 'server:error': {
          const p = message.payload as { message: string }
          console.error(`❌ Server error: ${p.message}`)
          break
        }
      }
    } catch (err) {
      console.error('Failed to parse message:', err)
    }
  }

  private handleSshOpen(p: {
    sessionId: string
    host: string
    port: number
    username: string
    password?: string
    privateKey?: string
    rows?: number
    cols?: number
  }): void {
    const { sessionId, host, port, username, password, privateKey, rows, cols } = p
    console.log(`🔒 SSH tunnel request: ${username}@${host}:${port} (session ${sessionId})`)

    const client = new SSH2Client()

    client.on('ready', () => {
      client.shell(
        { term: 'xterm-256color', rows: rows || 24, cols: cols || 80 },
        (err, stream) => {
          if (err) {
            this.send({
              type: 'agent:ssh_error',
              payload: { sessionId, message: err.message },
              timestamp: Date.now()
            })
            client.end()
            return
          }

          const tunnel: SshTunnel = { client, stream }
          this.sshTunnels.set(sessionId, tunnel)

          this.send({
            type: 'agent:ssh_opened',
            payload: { sessionId },
            timestamp: Date.now()
          })

          stream.on('data', (data: Buffer) => {
            this.send({
              type: 'agent:ssh_data',
              payload: { sessionId, data: data.toString('base64') },
              timestamp: Date.now()
            })
          })

          stream.stderr.on('data', (data: Buffer) => {
            this.send({
              type: 'agent:ssh_data',
              payload: { sessionId, data: data.toString('base64') },
              timestamp: Date.now()
            })
          })

          stream.on('close', () => {
            this.send({
              type: 'agent:ssh_closed',
              payload: { sessionId },
              timestamp: Date.now()
            })
            this.sshTunnels.delete(sessionId)
            client.end()
            console.log(`🔒 SSH tunnel closed: session ${sessionId}`)
          })
        }
      )
    })

    client.on('error', (err) => {
      console.error(`❌ SSH error for session ${sessionId}: ${err.message}`)
      this.send({
        type: 'agent:ssh_error',
        payload: { sessionId, message: err.message },
        timestamp: Date.now()
      })
      this.sshTunnels.delete(sessionId)
    })

    // Hard abort if the overall connect takes longer than 15 s (covers TCP-level hangs)
    const abortTimer = setTimeout(() => {
      if (!this.sshTunnels.has(sessionId)) {
        try { client.end() } catch {}
        this.send({
          type: 'agent:ssh_error',
          payload: { sessionId, message: `Connection timed out after 15s — is SSH running on ${host}:${port}?` },
          timestamp: Date.now()
        })
      }
    }, 15_000)

    client.once('ready', () => clearTimeout(abortTimer))
    client.once('error', () => clearTimeout(abortTimer))

    const connectConfig: Record<string, unknown> = {
      host,
      port,
      username,
      readyTimeout: 12000,
      keepaliveInterval: 5000,
      keepaliveCountMax: 3
    }
    if (privateKey) {
      connectConfig.privateKey = Buffer.from(privateKey, 'base64')
    } else if (password) {
      connectConfig.password = password
    }

    client.connect(connectConfig as Parameters<typeof client.connect>[0])
  }

  private closeSshTunnel(sessionId: string): void {
    const tunnel = this.sshTunnels.get(sessionId)
    if (tunnel) {
      try { tunnel.stream?.end() } catch {}
      try { tunnel.client.end() } catch {}
      this.sshTunnels.delete(sessionId)
      console.log(`🔒 SSH tunnel closed by server: session ${sessionId}`)
    }
  }

  private onClose(): void {
    console.log('📴 Disconnected from server')
    this.clearTimers()
    this.scheduleReconnect()
  }

  private onError(err: Error): void {
    console.error(`🔴 WebSocket error: ${err.message}`)
  }

  private async handleCommand(payload: ServerCommandPayload): Promise<void> {
    if (payload.type !== 'shell' || !payload.command) return
    console.log(`▶️  Executing: ${payload.command}`)
    const result = await executeCommand(payload.command)
    this.send({
      type: 'agent:command_result',
      payload: {
        commandId: payload.commandId,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        duration: result.duration
      },
      timestamp: Date.now()
    })
  }

  private async startHeartbeat(): Promise<void> {
    this.heartbeatTimer = setInterval(async () => {
      if (!this.deviceId || this.ws?.readyState !== WebSocket.OPEN) return
      const stats = await getDeviceStats()
      this.send({
        type: 'agent:heartbeat',
        payload: {
          deviceId: this.deviceId,
          stats,
          tunnelLayer: 'relay',
          timestamp: Date.now()
        },
        timestamp: Date.now()
      })
    }, HEARTBEAT_INTERVAL)
  }

  private scheduleReconnect(): void {
    if (!this.running) return
    console.log(`🔄 Reconnecting in ${this.reconnectDelay / 1000}s...`)
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, RECONNECT_MAX_DELAY)
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null }
  }

  private send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }
}
