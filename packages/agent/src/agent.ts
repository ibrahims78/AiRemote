import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { Client as SSH2Client } from 'ssh2'
import { spawn, ChildProcess } from 'child_process'
import * as net from 'net'
import fs from 'fs/promises'
import path from 'path'
import { getDeviceInfo } from './system/info'
import { getDeviceStats } from './system/stats'
import { executeCommand } from './system/executor'
import type { WSMessage, AgentRegisterPayload, ServerCommandPayload } from '@airemote/shared'

const AGENT_VERSION     = '1.4.0'
const HEARTBEAT_INTERVAL = 10000
const RECONNECT_BASE_DELAY = 2000
const RECONNECT_MAX_DELAY  = 30000

interface SshTunnel {
  client: SSH2Client
  stream: NodeJS.ReadWriteStream | null
}

interface PtyProcess {
  proc: ChildProcess
  sessionId: string
}

export class AgentService {
  private ws: WebSocket | null = null
  private deviceId: string | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay = RECONNECT_BASE_DELAY
  private running = false
  private sshTunnels  = new Map<string, SshTunnel>()
  private ptyProcs    = new Map<string, PtyProcess>()
  private sshDetected = false

  constructor(
    private readonly serverUrl: string,
    private readonly token: string
  ) {}

  start(): void {
    this.running = true
    this.connect()
    console.log(`🚀 AiRemote Agent v${AGENT_VERSION} starting...`)
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
    for (const [, p] of this.ptyProcs) {
      try { p.proc.kill() } catch {}
    }
    this.ptyProcs.clear()
    if (this.ws) { this.ws.close(); this.ws = null }
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

    const info  = await getDeviceInfo()
    const stats = await getDeviceStats()
    const sshAvailable = await this.checkSshAvailable('127.0.0.1', 22)
    this.sshDetected   = sshAvailable
    const shell = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')

    const payload: AgentRegisterPayload = {
      token: this.token,
      info:  { ...info, agentVersion: AGENT_VERSION },
      stats,
      tunnelLayer: 'relay',
      capabilities: { pty: true, sshAvailable, shell },
      sshInfo: { available: sshAvailable, port: 22 }
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
            sessionId: string; host: string; port: number
            username: string; password?: string; privateKey?: string
            rows?: number; cols?: number
          }
          this.handleSshOpen(p)
          break
        }
        case 'server:ssh_data': {
          const p = message.payload as { sessionId: string; data: string }
          const tunnel = this.sshTunnels.get(p.sessionId)
          if (tunnel?.stream) tunnel.stream.write(Buffer.from(p.data, 'base64'))
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
        case 'server:pty_open': {
          const p = message.payload as {
            sessionId: string; rows?: number; cols?: number; shell?: string
          }
          this.handlePtyOpen(p)
          break
        }
        case 'server:pty_data': {
          const p = message.payload as { sessionId: string; data: string }
          const pty = this.ptyProcs.get(p.sessionId)
          if (pty?.proc.stdin?.writable) {
            pty.proc.stdin.write(Buffer.from(p.data, 'base64'))
          }
          break
        }
        case 'server:pty_resize': {
          // SIGWINCH on Unix; on Windows this has no effect without node-pty
          const p = message.payload as { sessionId: string; rows: number; cols: number }
          const pty = this.ptyProcs.get(p.sessionId)
          if (pty && process.platform !== 'win32') {
            try { pty.proc.kill('SIGWINCH') } catch {}
          }
          break
        }
        case 'server:pty_close': {
          const p = message.payload as { sessionId: string }
          this.closePty(p.sessionId)
          break
        }
        case 'server:fs_request': {
          const p = message.payload as { opId: string; op: string; path: string; newPath?: string; data?: string }
          this.handleFsRequest(p)
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

  // ── PTY (Direct Shell) ───────────────────────────────────────────────────

  private handlePtyOpen(p: { sessionId: string; rows?: number; cols?: number; shell?: string }): void {
    const { sessionId, rows = 24, cols = 80, shell: shellHint = 'auto' } = p
    console.log(`🖥️  PTY request (session ${sessionId})`)

    const { cmd, args } = this.resolveShell(shellHint)

    try {
      const proc = spawn(cmd, args, {
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLUMNS: String(cols),
          LINES: String(rows),
          COLORTERM: 'truecolor'
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: false
      })

      this.ptyProcs.set(sessionId, { proc, sessionId })

      this.send({
        type: 'agent:pty_opened',
        payload: { sessionId },
        timestamp: Date.now()
      })

      proc.stdout?.on('data', (data: Buffer) => {
        this.send({
          type: 'agent:pty_data',
          payload: { sessionId, data: data.toString('base64') },
          timestamp: Date.now()
        })
      })

      proc.stderr?.on('data', (data: Buffer) => {
        this.send({
          type: 'agent:pty_data',
          payload: { sessionId, data: data.toString('base64') },
          timestamp: Date.now()
        })
      })

      proc.on('close', () => {
        this.send({
          type: 'agent:pty_closed',
          payload: { sessionId },
          timestamp: Date.now()
        })
        this.ptyProcs.delete(sessionId)
        console.log(`🖥️  PTY closed: session ${sessionId}`)
      })

      proc.on('error', (err) => {
        this.send({
          type: 'agent:pty_error',
          payload: { sessionId, message: err.message },
          timestamp: Date.now()
        })
        this.ptyProcs.delete(sessionId)
      })

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.send({
        type: 'agent:pty_error',
        payload: { sessionId, message: `Failed to spawn shell: ${msg}` },
        timestamp: Date.now()
      })
    }
  }

  private resolveShell(hint: string): { cmd: string; args: string[] } {
    if (process.platform === 'win32') {
      if (hint === 'cmd')  return { cmd: 'cmd.exe',        args: [] }
      return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
    }
    if (hint === 'bash')  return { cmd: '/bin/bash',  args: ['--login'] }
    if (hint === 'sh')    return { cmd: '/bin/sh',    args: [] }
    if (hint === 'zsh')   return { cmd: '/bin/zsh',   args: ['--login'] }
    const shell = process.env.SHELL || '/bin/bash'
    return { cmd: shell, args: ['--login'] }
  }

  private closePty(sessionId: string): void {
    const pty = this.ptyProcs.get(sessionId)
    if (pty) {
      try { pty.proc.kill() } catch {}
      this.ptyProcs.delete(sessionId)
    }
  }

  // ── SSH Tunnel ────────────────────────────────────────────────────────────

  private handleSshOpen(p: {
    sessionId: string; host: string; port: number
    username: string; password?: string; privateKey?: string
    rows?: number; cols?: number
  }): void {
    const { sessionId, host, port, username, password, privateKey, rows, cols } = p
    console.log(`🔒 SSH tunnel: ${username}@${host}:${port} (${sessionId})`)

    const client = new SSH2Client()

    client.on('ready', () => {
      client.shell(
        { term: 'xterm-256color', rows: rows || 24, cols: cols || 80 },
        (err, stream) => {
          if (err) {
            this.send({ type: 'agent:ssh_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
            client.end()
            return
          }
          this.sshTunnels.set(sessionId, { client, stream })
          this.send({ type: 'agent:ssh_opened', payload: { sessionId }, timestamp: Date.now() })

          stream.on('data', (data: Buffer) => {
            this.send({ type: 'agent:ssh_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
          })
          stream.stderr.on('data', (data: Buffer) => {
            this.send({ type: 'agent:ssh_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
          })
          stream.on('close', () => {
            this.send({ type: 'agent:ssh_closed', payload: { sessionId }, timestamp: Date.now() })
            this.sshTunnels.delete(sessionId)
            client.end()
          })
        }
      )
    })

    client.on('error', (err) => {
      this.send({ type: 'agent:ssh_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
      this.sshTunnels.delete(sessionId)
    })

    const abortTimer = setTimeout(() => {
      if (!this.sshTunnels.has(sessionId)) {
        try { client.end() } catch {}
        this.send({ type: 'agent:ssh_error', payload: { sessionId, message: `Connection timed out after 15s` }, timestamp: Date.now() })
      }
    }, 15_000)
    client.once('ready', () => clearTimeout(abortTimer))
    client.once('error', () => clearTimeout(abortTimer))

    const connectConfig: Record<string, unknown> = {
      host, port, username, readyTimeout: 12000, keepaliveInterval: 5000, keepaliveCountMax: 3
    }
    if (privateKey) connectConfig.privateKey = Buffer.from(privateKey, 'base64')
    else if (password) connectConfig.password = password

    client.connect(connectConfig as Parameters<typeof client.connect>[0])
  }

  // ── File System (via Agent) ───────────────────────────────────────────────

  private async handleFsRequest(p: {
    opId: string; op: string; path: string; newPath?: string; data?: string
  }): Promise<void> {
    const { opId, op } = p
    try {
      let result: unknown
      const osPath = this.toOsPath(p.path)

      switch (op) {
        case 'list': {
          if (p.path === '/' && process.platform === 'win32') {
            result = await this.listWindowsDrives()
          } else {
            const entries = await fs.readdir(osPath, { withFileTypes: true })
            const settled = await Promise.allSettled(entries.map(async (e) => {
              const fullPath = path.join(osPath, e.name)
              const webPath = (p.path === '/' ? '' : p.path) + '/' + e.name
              // Use lstat (never follows symlinks) to avoid hangs on broken mounts
              const statResult = await Promise.race([
                fs.lstat(fullPath),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('stat timeout')), 3000))
              ]) as Awaited<ReturnType<typeof fs.lstat>>
              return {
                name: e.name,
                path: webPath,
                isDirectory: e.isDirectory() || statResult.isDirectory(),
                size: statResult.size,
                modified: statResult.mtime.toISOString(),
                permissions: (Number(statResult.mode) & 0o777).toString(8)
              }
            }))
            result = settled.map((r, i) => {
              if (r.status === 'fulfilled') return r.value
              const e = entries[i]
              const webPath = (p.path === '/' ? '' : p.path) + '/' + e.name
              return { name: e.name, path: webPath, isDirectory: e.isDirectory(), size: 0, modified: new Date().toISOString(), permissions: '---' }
            })
          }
          break
        }
        case 'read': {
          const buf = await fs.readFile(osPath)
          result = buf.toString('base64')
          break
        }
        case 'write': {
          const dir = path.dirname(osPath)
          await fs.mkdir(dir, { recursive: true })
          await fs.writeFile(osPath, Buffer.from(p.data || '', 'base64'))
          result = { ok: true }
          break
        }
        case 'delete': {
          await fs.rm(osPath, { recursive: true, force: true })
          result = { ok: true }
          break
        }
        case 'rename': {
          const newOsPath = this.toOsPath(p.newPath || '')
          await fs.rename(osPath, newOsPath)
          result = { ok: true }
          break
        }
        case 'mkdir': {
          await fs.mkdir(osPath, { recursive: true })
          result = { ok: true }
          break
        }
        default:
          throw new Error(`عملية غير معروفة: ${op}`)
      }

      this.send({
        type: 'agent:fs_result',
        payload: { opId, data: result },
        timestamp: Date.now()
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      this.send({
        type: 'agent:fs_result',
        payload: { opId, error: msg },
        timestamp: Date.now()
      })
    }
  }

  private toOsPath(webPath: string): string {
    if (process.platform !== 'win32') return webPath
    if (webPath === '/') return '/'
    const m = webPath.match(/^\/([A-Za-z]:[\\/].*)$/)
    if (m) return m[1].replace(/\//g, '\\')
    const drive = webPath.match(/^\/([A-Za-z]:)$/)
    if (drive) return drive[1] + '\\'
    return webPath
  }

  private async listWindowsDrives(): Promise<unknown[]> {
    const drives: unknown[] = []
    for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
      const drivePath = letter + ':\\'
      try {
        await fs.access(drivePath)
        drives.push({
          name: letter + ':',
          path: '/' + letter + ':',
          isDirectory: true,
          size: 0,
          modified: new Date().toISOString(),
          permissions: '755'
        })
      } catch {}
    }
    return drives
  }

  private closeSshTunnel(sessionId: string): void {
    const tunnel = this.sshTunnels.get(sessionId)
    if (tunnel) {
      try { tunnel.stream?.end() } catch {}
      try { tunnel.client.end() } catch {}
      this.sshTunnels.delete(sessionId)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private checkSshAvailable(host: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const sock = new net.Socket()
      sock.setTimeout(3000)
      sock.connect(port, host, () => { sock.destroy(); resolve(true) })
      sock.on('error', () => { sock.destroy(); resolve(false) })
      sock.on('timeout', () => { sock.destroy(); resolve(false) })
    })
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
        stdout: result.stdout, stderr: result.stderr,
        exitCode: result.exitCode, duration: result.duration
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
          deviceId: this.deviceId, stats, tunnelLayer: 'relay',
          timestamp: Date.now(),
          capabilities: { pty: true, sshAvailable: this.sshDetected }
        },
        timestamp: Date.now()
      })
    }, HEARTBEAT_INTERVAL)
  }

  private scheduleReconnect(): void {
    if (!this.running) return
    console.log(`🔄 Reconnecting in ${this.reconnectDelay / 1000}s...`)
    this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, RECONNECT_MAX_DELAY)
  }

  private clearTimers(): void {
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer);  this.reconnectTimer = null }
  }

  private send(message: WSMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message))
  }
}
