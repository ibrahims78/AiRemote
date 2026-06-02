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
import { captureScreen } from './system/screenCapture'
import {
  controlMouse, controlKeyboard,
  readClipboard, writeClipboard,
  listMonitors, isControlAvailable,
  enablePrivacyMode, disablePrivacyMode,
  setScreenResolution,
  type MonitorInfo
} from './system/inputControl'
import type { WSMessage, AgentRegisterPayload, ServerCommandPayload, RemoteMouseEvent, RemoteKeyEvent } from '@airemote/shared'

const AGENT_VERSION     = '2.0.0'
const HEARTBEAT_INTERVAL = 4000
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
  private sshTunnels    = new Map<string, SshTunnel>()
  private ptyProcs      = new Map<string, PtyProcess>()
  private screenTimers  = new Map<string, NodeJS.Timeout>()
  private screenSeq     = new Map<string, number>()
  private screenMonitorId = new Map<string, number>()
  private sshDetected   = false
  // v2.0.0 — Remote control state
  private controlAvailable = false
  private cachedMonitors: MonitorInfo[] = []
  private privacyMode = false

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
    for (const [sessionId] of this.screenTimers) {
      this.stopScreenCapture(sessionId)
    }
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

    // v2.0.0 — detect remote control + monitor capabilities
    this.controlAvailable = await isControlAvailable()
    try { this.cachedMonitors = await listMonitors() } catch { this.cachedMonitors = [] }

    // Update screen resolution for absolute coordinate mapping
    const primary = this.cachedMonitors.find(m => m.primary) ?? this.cachedMonitors[0]
    if (primary) setScreenResolution(primary.width, primary.height)

    const payload: AgentRegisterPayload = {
      token: this.token,
      info:  { ...info, agentVersion: AGENT_VERSION },
      stats,
      tunnelLayer: 'relay',
      capabilities: {
        pty: true, sshAvailable, shell,
        screenControl: this.controlAvailable,
        clipboard: true,
        multiMonitor: this.cachedMonitors.length > 1,
        monitors: this.cachedMonitors
      },
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
        case 'server:screen_start': {
          const p = message.payload as { sessionId: string; fps: number; quality: number; monitorId?: number }
          this.handleScreenStart(p)
          break
        }
        case 'server:screen_stop': {
          const p = message.payload as { sessionId: string }
          this.stopScreenCapture(p.sessionId)
          break
        }

        // ── v2.0.0 Remote Control ──────────────────────────────────────────
        case 'server:screen_mouse': {
          const p = message.payload as RemoteMouseEvent
          if (this.controlAvailable) {
            controlMouse({
              type: p.type,
              x: p.x, y: p.y,
              button: p.button,
              deltaY: p.deltaY
            }).catch(err => console.error('[agent] mouse error:', err.message))
          }
          break
        }
        case 'server:screen_key': {
          const p = message.payload as RemoteKeyEvent
          if (this.controlAvailable) {
            controlKeyboard({
              type: p.type,
              key: p.key,
              modifiers: p.modifiers
            }).catch(err => console.error('[agent] key error:', err.message))
          }
          break
        }
        case 'server:screen_clipboard_read': {
          const p = message.payload as { sessionId: string }
          readClipboard().then(text => {
            this.send({
              type: 'agent:screen_clipboard',
              payload: { sessionId: p.sessionId, text },
              timestamp: Date.now()
            })
          }).catch(err => console.error('[agent] clipboard read error:', err.message))
          break
        }
        case 'server:screen_clipboard_write': {
          const p = message.payload as { text: string }
          writeClipboard(p.text).catch(err => console.error('[agent] clipboard write error:', err.message))
          break
        }
        case 'server:screen_get_monitors': {
          const p = message.payload as { sessionId: string }
          listMonitors().then(monitors => {
            this.cachedMonitors = monitors
            this.send({
              type: 'agent:screen_monitors',
              payload: { sessionId: p.sessionId, monitors },
              timestamp: Date.now()
            })
          }).catch(err => console.error('[agent] monitors error:', err.message))
          break
        }
        case 'server:screen_set_monitor': {
          const p = message.payload as { sessionId: string; monitorId: number }
          this.screenMonitorId.set(p.sessionId, p.monitorId)
          // Update resolution for the selected monitor
          const mon = this.cachedMonitors.find(m => m.id === p.monitorId)
          if (mon) setScreenResolution(mon.width, mon.height)
          console.log(`[agent] Monitor set to ${p.monitorId} for session ${p.sessionId}`)
          break
        }
        case 'server:screen_privacy': {
          const p = message.payload as { enable: boolean }
          if (p.enable) {
            this.privacyMode = true
            enablePrivacyMode().catch(err => console.error('[agent] privacy enable error:', err.message))
          } else {
            this.privacyMode = false
            disablePrivacyMode().catch(err => console.error('[agent] privacy disable error:', err.message))
          }
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
    console.log(`🖥️  PTY request (session ${sessionId}, shell=${shellHint})`)

    const { cmd, args } = this.resolveShell(shellHint)

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLUMNS: String(cols),
      LINES: String(rows),
      COLORTERM: 'truecolor'
    }

    try {
      let proc: ChildProcess

      if (process.platform !== 'win32') {
        // Use `script` to allocate a real PTY so the shell runs interactively:
        // • backspace / arrow keys / Ctrl+C all work via PTY line discipline
        // • cd updates PS1 because the shell sees a real terminal
        // • readline / vi-mode / autocomplete work as expected
        const shellCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd
        const scriptArgs = process.platform === 'darwin'
          ? ['-q', '/dev/null', cmd, ...args]          // macOS: script -q /dev/null bash --login
          : ['-q', '-c', shellCmd, '/dev/null']         // Linux:  script -q -c "bash --login" /dev/null

        proc = spawn('script', scriptArgs, {
          env: { ...env, SHELL: cmd },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        })
      } else {
        // Windows: spawn PowerShell / CMD directly (ConPTY requires node-pty)
        proc = spawn(cmd, args, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: false
        })
      }

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
    console.log(`📂 FS request: op=${op} path=${p.path}`)

    // Overall operation timeout — prevents hanging fs ops from blocking forever
    const OVERALL_TIMEOUT_MS = 8000
    const READDIR_TIMEOUT_MS = 5000
    const STAT_TIMEOUT_MS    = 2000

    const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        )
      ])

    try {
      let result: unknown
      const osPath = this.toOsPath(p.path)

      const doOp = async (): Promise<unknown> => {
        switch (op) {
          case 'list': {
            if (p.path === '/' && process.platform === 'win32') {
              return this.listWindowsDrives()
            }

            const entries = await withTimeout(
              fs.readdir(osPath, { withFileTypes: true }),
              READDIR_TIMEOUT_MS,
              `readdir(${osPath})`
            )

            const settled = await Promise.allSettled(entries.map(async (e) => {
              const fullPath = path.join(osPath, e.name)
              const webPath  = (p.path === '/' ? '' : p.path) + '/' + e.name

              let size = 0, modified = new Date().toISOString(), permissions = '---'
              let isDir = e.isDirectory()

              try {
                const stat = await withTimeout(
                  fs.lstat(fullPath),
                  STAT_TIMEOUT_MS,
                  `lstat(${fullPath})`
                )
                size        = stat.size
                modified    = stat.mtime.toISOString()
                permissions = (Number(stat.mode) & 0o777).toString(8)
                isDir       = isDir || stat.isDirectory()
              } catch {
                // Stat failed or timed out — return partial entry
              }

              return { name: e.name, path: webPath, isDirectory: isDir, size, modified, permissions }
            }))

            return settled
              .filter(r => r.status === 'fulfilled')
              .map(r => (r as PromiseFulfilledResult<unknown>).value)
          }

          case 'read': {
            const buf = await withTimeout(fs.readFile(osPath), OVERALL_TIMEOUT_MS, `readFile(${osPath})`)
            return buf.toString('base64')
          }

          case 'read_chunked': {
            // Send file in 512 KB pieces so the WS event loop stays free
            // (prevents ping-timeout disconnects on large files)
            const CHUNK = 512 * 1024
            const buf   = await withTimeout(fs.readFile(osPath), 120000, `readFile_c(${osPath})`)
            const n     = Math.ceil(buf.length / CHUNK) || 1
            for (let i = 0; i < n; i++) {
              this.send({
                type:    'agent:fs_chunk',
                payload: {
                  opId, seq: i,
                  data: buf.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64'),
                  done:  i === n - 1,
                  total: n
                },
                timestamp: Date.now()
              })
              // Yield so pings / heartbeats can pass between chunks
              await new Promise(r => setImmediate(r))
            }
            console.log(`✅ FS chunked: path=${p.path} chunks=${n}`)
            return '__chunked__'
          }

          case 'write': {
            const dir = path.dirname(osPath)
            await fs.mkdir(dir, { recursive: true })
            await withTimeout(
              fs.writeFile(osPath, Buffer.from(p.data || '', 'base64')),
              OVERALL_TIMEOUT_MS,
              `writeFile(${osPath})`
            )
            return { ok: true }
          }

          case 'delete': {
            await withTimeout(
              fs.rm(osPath, { recursive: true, force: true }),
              OVERALL_TIMEOUT_MS,
              `rm(${osPath})`
            )
            return { ok: true }
          }

          case 'rename': {
            const newOsPath = this.toOsPath(p.newPath || '')
            await withTimeout(fs.rename(osPath, newOsPath), OVERALL_TIMEOUT_MS, `rename`)
            return { ok: true }
          }

          case 'mkdir': {
            await withTimeout(fs.mkdir(osPath, { recursive: true }), OVERALL_TIMEOUT_MS, `mkdir(${osPath})`)
            return { ok: true }
          }

          default:
            throw new Error(`عملية غير معروفة: ${op}`)
        }
      }

      result = await withTimeout(doOp(), op === 'read_chunked' ? 125000 : OVERALL_TIMEOUT_MS + 1000, `fs:${op}`)

      // read_chunked sends its own agent:fs_chunk messages; skip fs_result
      if (result === '__chunked__') return

      console.log(`✅ FS result: op=${op} path=${p.path}`)
      this.send({
        type: 'agent:fs_result',
        payload: { opId, data: result },
        timestamp: Date.now()
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`❌ FS error: op=${op} path=${p.path} — ${msg}`)
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
    const checkDrive = async (letter: string): Promise<unknown | null> => {
      const drivePath = letter + ':\\'
      try {
        await Promise.race([
          fs.access(drivePath),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), 1500)
          )
        ])
        return {
          name: letter + ':',
          path: '/' + letter + ':',
          isDirectory: true,
          size: 0,
          modified: new Date().toISOString(),
          permissions: '755'
        }
      } catch {
        return null
      }
    }

    const results = await Promise.all(
      'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(checkDrive)
    )
    return results.filter(Boolean)
  }

  private closeSshTunnel(sessionId: string): void {
    const tunnel = this.sshTunnels.get(sessionId)
    if (tunnel) {
      try { tunnel.stream?.end() } catch {}
      try { tunnel.client.end() } catch {}
      this.sshTunnels.delete(sessionId)
    }
  }

  // ── Screen Capture ────────────────────────────────────────────────────────

  private handleScreenStart(p: { sessionId: string; fps: number; quality: number; monitorId?: number }): void {
    const { sessionId, fps, quality, monitorId = 0 } = p

    // Stop any existing session with same ID (re-start with new settings)
    this.stopScreenCapture(sessionId)

    // Track monitor for this session
    this.screenMonitorId.set(sessionId, monitorId)
    const mon = this.cachedMonitors.find(m => m.id === monitorId)
    if (mon) setScreenResolution(mon.width, mon.height)

    const intervalMs = Math.max(66, Math.round(1000 / Math.min(fps, 15)))
    let seq = 0

    const capture = async () => {
      if (!this.screenTimers.has(sessionId)) return
      if (this.ws?.readyState !== WebSocket.OPEN) return

      const currentMonitorId = this.screenMonitorId.get(sessionId) ?? monitorId

      try {
        const frame = await captureScreen({
          quality,
          maxWidth: 1280,
          monitorId: currentMonitorId,
          monitors: this.cachedMonitors.length > 0 ? this.cachedMonitors : undefined
        })
        if (!frame) {
          // No backend available
          this.send({
            type: 'agent:screen_unavailable',
            payload: { sessionId, message: 'No screen capture tool available (install scrot or imagemagick on Linux)' },
            timestamp: Date.now()
          })
          this.stopScreenCapture(sessionId)
          return
        }

        this.send({
          type:      'agent:screen_frame',
          payload:   {
            sessionId,
            data:   frame.data.toString('base64'),
            width:  frame.width,
            height: frame.height,
            seq:    seq++
          },
          timestamp: Date.now()
        })
      } catch (err) {
        console.error('[screen] Capture error:', (err as Error).message)
        this.send({
          type:      'agent:screen_error',
          payload:   { sessionId, message: (err as Error).message },
          timestamp: Date.now()
        })
        this.stopScreenCapture(sessionId)
      }
    }

    // First frame immediately, then interval
    capture()
    const timer = setInterval(capture, intervalMs)
    this.screenTimers.set(sessionId, timer)
    this.screenSeq.set(sessionId, 0)
    console.log(`🖥️  Screen capture started: sessionId=${sessionId} fps=${fps} quality=${quality}`)
  }

  private stopScreenCapture(sessionId: string): void {
    const timer = this.screenTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.screenTimers.delete(sessionId)
      this.screenSeq.delete(sessionId)
      this.screenMonitorId.delete(sessionId)
      this.send({
        type:      'agent:screen_closed',
        payload:   { sessionId },
        timestamp: Date.now()
      })
      console.log(`🖥️  Screen capture stopped: sessionId=${sessionId}`)
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
          capabilities: {
            pty:          true,
            sshAvailable: this.sshDetected,
            screenControl: this.controlAvailable,
            clipboard:    true,
            multiMonitor: this.cachedMonitors.length > 1,
            monitors:     this.cachedMonitors
          }
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
