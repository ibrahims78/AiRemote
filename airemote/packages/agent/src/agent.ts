import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { getDeviceInfo } from './system/info'
import { getDeviceStats } from './system/stats'
import { executeCommand } from './system/executor'
import type { WSMessage, AgentRegisterPayload, ServerCommandPayload } from '@airemote/shared'

const HEARTBEAT_INTERVAL = 10000
const RECONNECT_BASE_DELAY = 2000
const RECONNECT_MAX_DELAY = 30000

export class AgentService {
  private ws: WebSocket | null = null
  private deviceId: string | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay = RECONNECT_BASE_DELAY
  private running = false

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
