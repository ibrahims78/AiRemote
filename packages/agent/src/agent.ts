import WebSocket from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs/promises'
import path from 'path'
import { getDeviceInfo } from './system/info'
import { getDeviceStats } from './system/stats'
import { executeCommand } from './system/executor'
import { captureScreen, isFfmpegAvailable, startFfmpegCaptureLoop } from './system/screenCapture'
import {
  controlMouse, controlKeyboard,
  readClipboard, writeClipboard,
  listMonitors, isControlAvailable,
  enablePrivacyMode, disablePrivacyMode,
  setScreenResolution,
  type MonitorInfo
} from './system/inputControl'
import type { WSMessage, AgentRegisterPayload, ServerCommandPayload, RemoteMouseEvent, RemoteKeyEvent } from '@airemote/shared'

export const AGENT_VERSION      = '3.1.0'
const HEARTBEAT_INTERVAL        = 4000
const RECONNECT_BASE_DELAY      = 2000
const RECONNECT_MAX_DELAY       = 30000
// Consent timeout: seconds before auto-granting control in unattended headless mode
const CONSENT_TIMEOUT_SEC       = parseInt(process.env.AGENT_CONSENT_TIMEOUT || '30', 10)

interface PtyProcess {
  proc:      ChildProcess
  sessionId: string
  rows:      number
  cols:      number
  shell:     string
}

// Chunked-write accumulator
interface WriteChunkAccum {
  chunks: Map<number, Buffer>
  total:  number
  path:   string
}


export class AgentService {
  private ws: WebSocket | null = null
  private deviceId: string | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private reconnectDelay = RECONNECT_BASE_DELAY
  private running = false
  private ptyProcs         = new Map<string, PtyProcess>()
  private screenTimers     = new Map<string, NodeJS.Timeout>()
  private screenSeq        = new Map<string, number>()
  private screenMonitorId  = new Map<string, number>()
  private ffmpegCleanups   = new Map<string, () => void>()
  private controlAvailable = false
  private cachedMonitors: MonitorInfo[] = []
  private privacyMode = false
  private dockerAvailable = false
  private writeChunkBuffers = new Map<string, WriteChunkAccum>()

  constructor(
    private readonly serverUrl: string,
    private readonly token: string
  ) {}

  start(): void {
    this.running = true
    this.connect()
  }

  stop(): void {
    this.running = false
    this.clearTimers()
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
    const shell = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')

    this.controlAvailable = await isControlAvailable()
    try { this.cachedMonitors = await listMonitors() } catch { this.cachedMonitors = [] }

    const primary = this.cachedMonitors.find(m => m.primary) ?? this.cachedMonitors[0]
    if (primary) setScreenResolution(primary.width, primary.height)

    // ── T005: Docker capability detection ──────────────────────────────────
    this.dockerAvailable = await this.detectDocker()
    console.log(`🐳 Docker available: ${this.dockerAvailable}`)

    const payload: AgentRegisterPayload = {
      token: this.token,
      info:  { ...info, agentVersion: AGENT_VERSION },
      stats,
      tunnelLayer: 'relay',
      capabilities: {
        pty: true,
        sshAvailable: false,
        shell,
        screenControl: this.controlAvailable,
        clipboard: true,
        multiMonitor: this.cachedMonitors.length > 1,
        monitors: this.cachedMonitors,
        docker: this.dockerAvailable
      },
      sshInfo: { available: false, port: 22 }
    }

    this.send({ type: 'agent:register', payload, timestamp: Date.now() })
    this.startHeartbeat()
  }

  // ── T005: Docker detection ────────────────────────────────────────────────
  private detectDocker(): Promise<boolean> {
    return new Promise(resolve => {
      const proc = spawn('docker', ['--version'], {
        stdio:       'ignore',
        shell:       process.platform === 'win32',
        windowsHide: true
      })
      const timer = setTimeout(() => {
        try { proc.kill() } catch {}
        resolve(false)
      }, 3000)
      proc.on('close', code => {
        clearTimeout(timer)
        resolve(code === 0)
      })
      proc.on('error', () => {
        clearTimeout(timer)
        resolve(false)
      })
    })
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
        // ── T003: PTY resize — Windows-aware ────────────────────────────────
        case 'server:pty_resize': {
          const p = message.payload as { sessionId: string; rows: number; cols: number }
          const pty = this.ptyProcs.get(p.sessionId)
          if (pty) {
            pty.rows = p.rows
            pty.cols = p.cols
            if (process.platform !== 'win32') {
              // Unix: SIGWINCH tells the shell to re-query terminal size
              try { pty.proc.kill('SIGWINCH') } catch {}
            } else {
              // Windows: update COLUMNS/LINES by relaunching would be too disruptive.
              // Write VT sequence back to the dashboard so xterm.js resizes its viewport
              // even if the underlying shell can't resize. The new size takes effect on
              // the next PTY open for this session.
              const hint = `\x1b[8;${p.rows};${p.cols}t`
              this.send({
                type:    'agent:pty_data',
                payload: { sessionId: p.sessionId, data: Buffer.from(hint).toString('base64') },
                timestamp: Date.now()
              })
            }
          }
          break
        }
        case 'server:pty_close': {
          const p = message.payload as { sessionId: string }
          this.closePty(p.sessionId)
          break
        }
        case 'server:fs_request': {
          const p = message.payload as {
            opId: string; op: string; path: string; newPath?: string; data?: string
            seq?: number; total?: number; isLast?: boolean
          }
          this.handleFsRequest(p)
          break
        }
        // ── T002: Chunked write (multi-message protocol) ─────────────────────
        case 'server:fs_write_chunk': {
          const p = message.payload as {
            opId: string; path: string; data: string
            seq: number; total: number; isLast: boolean
          }
          this.handleWriteChunk(p)
          break
        }
        case 'server:screen_start': {
          const p = message.payload as { sessionId: string; fps: number; quality: number; maxWidth?: number; monitorId?: number }
          this.handleScreenStart(p)
          break
        }
        case 'server:screen_stop': {
          const p = message.payload as { sessionId: string }
          this.stopScreenCapture(p.sessionId)
          break
        }

        // ── Remote Control ─────────────────────────────────────────────────
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

        // ── T006: In-session text chat ───────────────────────────────────────
        case 'server:screen_chat': {
          const p = message.payload as { sessionId: string; text: string; sender: string }
          console.log(`💬 [chat] ${p.sender}: ${p.text}`)
          // Echo back as host-side message (agent acknowledges receipt)
          // In desktop agent main.js this triggers a notification — here we just log
          break
        }

        // ── T004: Consent dialog with AGENT_UNATTENDED env support ────────────
        case 'server:screen_control_request': {
          const p = message.payload as { sessionId: string; requestId: string; requesterName: string }
          const unattended = process.env.AGENT_UNATTENDED === 'true' || process.env.AGENT_UNATTENDED === '1'

          if (unattended) {
            console.log(`🔐 Control request from "${p.requesterName}" — auto-granting (AGENT_UNATTENDED=true)`)
            this.send({
              type: 'agent:screen_control_granted',
              payload: { sessionId: p.sessionId, requestId: p.requestId },
              timestamp: Date.now()
            })
          } else {
            // Headless mode: warn and auto-grant after CONSENT_TIMEOUT_SEC
            console.warn(`⚠️  Control request from "${p.requesterName}"`)
            console.warn(`   Headless agent has no consent dialog.`)
            console.warn(`   Auto-granting in ${CONSENT_TIMEOUT_SEC}s — set AGENT_UNATTENDED=true to skip the delay.`)
            const { sessionId, requestId } = p
            setTimeout(() => {
              console.log(`🔐 Auto-granting control to "${p.requesterName}" after timeout`)
              this.send({
                type: 'agent:screen_control_granted',
                payload: { sessionId, requestId },
                timestamp: Date.now()
              })
            }, CONSENT_TIMEOUT_SEC * 1000)
          }
          break
        }

        case 'server:error': {
          const p = message.payload as { message: string }
          console.error(`❌ Server error: ${p.message}`)
          break
        }

        case 'server:ping': {
          // Application-level ping — respond immediately so the server's
          // pong timer is cleared even when protocol-level pings are intercepted by a proxy.
          this.send({ type: 'agent:pong', payload: {}, timestamp: Date.now() })
          break
        }
      }
    } catch (err) {
      console.error('Failed to parse message:', err)
    }
  }

  // ── T002: Chunked write handler ───────────────────────────────────────────

  private handleWriteChunk(p: {
    opId: string; path: string; data: string
    seq: number; total: number; isLast: boolean
  }): void {
    let accum = this.writeChunkBuffers.get(p.opId)
    if (!accum) {
      accum = { chunks: new Map(), total: p.total, path: p.path }
      this.writeChunkBuffers.set(p.opId, accum)
    }
    accum.chunks.set(p.seq, Buffer.from(p.data, 'base64'))

    if (p.isLast) {
      this.writeChunkBuffers.delete(p.opId)
      const osPath = this.toOsPath(accum.path)
      const parts: Buffer[] = []
      for (let i = 0; i < accum.total; i++) {
        const chunk = accum.chunks.get(i)
        if (chunk) parts.push(chunk)
      }
      const fileData = Buffer.concat(parts)
      const dir = path.dirname(osPath)

      fs.mkdir(dir, { recursive: true })
        .then(() => fs.writeFile(osPath, fileData))
        .then(() => {
          console.log(`✅ Chunked write done: ${accum!.path} (${fileData.length} bytes)`)
          this.send({
            type:    'agent:fs_result',
            payload: { opId: p.opId, data: { ok: true, size: fileData.length } },
            timestamp: Date.now()
          })
        })
        .catch((err: Error) => {
          console.error(`❌ Chunked write failed: ${err.message}`)
          this.send({
            type:    'agent:fs_result',
            payload: { opId: p.opId, error: err.message },
            timestamp: Date.now()
          })
        })
    }
  }

  // ── PTY (Direct Shell) ────────────────────────────────────────────────────

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
        const shellCmd = args.length > 0 ? `${cmd} ${args.join(' ')}` : cmd
        const scriptArgs = process.platform === 'darwin'
          ? ['-q', '/dev/null', cmd, ...args]
          : ['-q', '-c', shellCmd, '/dev/null']

        proc = spawn('script', scriptArgs, {
          env: { ...env, SHELL: cmd },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        })
      } else {
        proc = spawn(cmd, args, {
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
          windowsHide: false
        })
      }

      this.ptyProcs.set(sessionId, { proc, sessionId, rows, cols, shell: shellHint })

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

  // ── File System (via Agent) ───────────────────────────────────────────────

  private async handleFsRequest(p: {
    opId: string; op: string; path: string; newPath?: string; data?: string
    seq?: number; total?: number; isLast?: boolean
  }): Promise<void> {
    const { opId, op } = p
    console.log(`📂 FS request: op=${op} path=${p.path}`)

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
              } catch {}

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
              await new Promise(r => setImmediate(r))
            }
            console.log(`✅ FS chunked: path=${p.path} chunks=${n}`)
            return '__chunked__'
          }

          // ── T002: Incremental write_chunk via fs_request (small-file path) ──
          case 'write_chunk': {
            // Accumulate via write_chunk inside fs_request envelope
            let accum = this.writeChunkBuffers.get(opId)
            if (!accum) {
              accum = { chunks: new Map(), total: p.total ?? 1, path: p.path }
              this.writeChunkBuffers.set(opId, accum)
            }
            accum.chunks.set(p.seq ?? 0, Buffer.from(p.data || '', 'base64'))

            if (p.isLast) {
              this.writeChunkBuffers.delete(opId)
              const parts: Buffer[] = []
              for (let i = 0; i < accum.total; i++) {
                const c = accum.chunks.get(i)
                if (c) parts.push(c)
              }
              const fileData = Buffer.concat(parts)
              const dir = path.dirname(osPath)
              await fs.mkdir(dir, { recursive: true })
              await withTimeout(fs.writeFile(osPath, fileData), 60000, `writeChunked(${osPath})`)
              console.log(`✅ write_chunk done: ${p.path} (${fileData.length} bytes)`)
              return { ok: true, size: fileData.length }
            }
            // Intermediate chunk — no response yet
            return '__write_chunk_pending__'
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
            throw new Error(`Unknown operation: ${op}`)
        }
      }

      result = await withTimeout(
        doOp(),
        op === 'read_chunked' ? 125000 : op === 'write_chunk' ? 65000 : OVERALL_TIMEOUT_MS + 1000,
        `fs:${op}`
      )

      if (result === '__chunked__' || result === '__write_chunk_pending__') return

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

  // ── Screen Capture ────────────────────────────────────────────────────────

  // Clears the capture timer without notifying the server — used when restarting
  // capture for quality/monitor changes on the same session.
  private clearScreenTimer(sessionId: string): void {
    const timer = this.screenTimers.get(sessionId)
    if (timer) {
      clearInterval(timer)
      this.screenTimers.delete(sessionId)
      this.screenSeq.delete(sessionId)
    }
    const stopFfmpeg = this.ffmpegCleanups.get(sessionId)
    if (stopFfmpeg) {
      stopFfmpeg()
      this.ffmpegCleanups.delete(sessionId)
    }
  }

  /**
   * Send a raw binary frame directly over the WebSocket.
   * Packet layout (matches server agentHandler.ts):
   *   [0x01][sessionId:36B UTF-8][width:4B BE][height:4B BE][seq:4B BE][flags:1B][JPEG...]
   * This avoids base64 encoding, saving ~33% bandwidth vs the JSON path.
   */
  private sendBinaryFrame(sessionId: string, jpeg: Buffer, width: number, height: number, seq: number, flags = 0): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return
    const hdr = Buffer.allocUnsafe(50)
    hdr[0]    = 0x01
    const sid = Buffer.from(sessionId.slice(0, 36).padEnd(36, '\0'), 'utf8')
    sid.copy(hdr, 1)
    hdr.writeUInt32BE(width,  37)
    hdr.writeUInt32BE(height, 41)
    hdr.writeUInt32BE(seq,    45)
    hdr[49]   = flags
    try { this.ws.send(Buffer.concat([hdr, jpeg])) } catch { /* ws closed */ }
  }

  private handleScreenStart(p: { sessionId: string; fps: number; quality: number; maxWidth?: number; monitorId?: number }): void {
    const { sessionId, fps, quality, maxWidth = 1280, monitorId = 0 } = p

    // Use clearScreenTimer (not stopScreenCapture) so we do NOT send agent:screen_closed
    // to the server when restarting for quality / monitor changes on the same session.
    this.clearScreenTimer(sessionId)
    this.screenMonitorId.set(sessionId, monitorId)
    const mon = this.cachedMonitors.find(m => m.id === monitorId)
    if (mon) setScreenResolution(mon.width, mon.height)

    const clampedFps = Math.min(fps, 30)

    // ── Fast path: ffmpeg gdigrab (15–30 fps) ─────────────────────────────────
    // isFfmpegAvailable() caches its result after the first call (takes ~1 s),
    // so subsequent screen-start / quality-change events are instant.
    isFfmpegAvailable().then(ffmpegOk => {
      // Guard: session may have been stopped while detection was in-flight
      if (!this.screenTimers.has(sessionId) && !this.ffmpegCleanups.has(sessionId)) {
        if (!ffmpegOk) {
          // Still need to start if not yet started — fall through to PS path below
        } else {
          return // session was stopped, do nothing
        }
      }

      if (ffmpegOk) {
        let seq = 0
        const currentMon = this.cachedMonitors.find(m => m.id === (this.screenMonitorId.get(sessionId) ?? monitorId))
        const stopFfmpeg = startFfmpegCaptureLoop({
          fps:      clampedFps,
          quality,
          maxWidth,
          ...(currentMon ? { monitorX: currentMon.x, monitorY: currentMon.y, monitorW: currentMon.width, monitorH: currentMon.height } : {}),
          onFrame: (jpeg, width, height) => {
            if (!this.screenTimers.has(sessionId)) return  // session stopped
            if (this.ws?.readyState !== WebSocket.OPEN)   return
            this.sendBinaryFrame(sessionId, jpeg, width, height, seq++)
          },
          onError: (err) => console.error('[screen] ffmpeg error:', err.message),
        })

        this.ffmpegCleanups.set(sessionId, stopFfmpeg)
        // Sentinel timer so .has(sessionId) / .delete(sessionId) checks still work
        const sentinel = setInterval(() => { /* intentionally empty */ }, 2_147_483_647)
        this.screenTimers.set(sessionId, sentinel)
        this.screenSeq.set(sessionId, 0)
        console.log(`🖥️  Screen capture started (ffmpeg/binary): sessionId=${sessionId} fps=${clampedFps} quality=${quality} maxWidth=${maxWidth}`)
        return
      }

      // ── Fallback: PowerShell persistent process (~1 fps) ──────────────────
      const intervalMs = Math.max(100, Math.round(1000 / clampedFps))
      let seq = 0
      let capturing = false

      const capture = async () => {
        if (!this.screenTimers.has(sessionId)) return
        if (this.ws?.readyState !== WebSocket.OPEN) return
        if (capturing) return
        capturing = true

        const currentMonitorId = this.screenMonitorId.get(sessionId) ?? monitorId

        try {
          const frame = await captureScreen({
            quality,
            maxWidth,
            monitorId: currentMonitorId,
            monitors: this.cachedMonitors.length > 0 ? this.cachedMonitors : undefined
          })

          if (!frame) {
            this.send({
              type:    'agent:screen_unavailable',
              payload: { sessionId, message: 'No screen capture tool available (Linux: install scrot or imagemagick; ensure DISPLAY is set)' },
              timestamp: Date.now()
            })
            this.stopScreenCapture(sessionId)
            return
          }

          this.send({
            type:    'agent:screen_frame',
            payload: {
              sessionId,
              data:        frame.data.toString('base64'),
              width:       frame.width,
              height:      frame.height,
              seq:         seq++,
              keyframe:    !frame.deltaRegion,
              quality,
              deltaRegion: frame.deltaRegion
            },
            timestamp: Date.now()
          })
        } catch (err) {
          console.error('[screen] Capture error:', (err as Error).message)
          this.send({
            type:    'agent:screen_error',
            payload: { sessionId, message: (err as Error).message },
            timestamp: Date.now()
          })
          this.stopScreenCapture(sessionId)
        } finally {
          capturing = false
        }
      }

      capture()
      const timer = setInterval(capture, intervalMs)
      this.screenTimers.set(sessionId, timer)
      this.screenSeq.set(sessionId, 0)
      console.log(`🖥️  Screen capture started (PowerShell): sessionId=${sessionId} fps=${clampedFps} quality=${quality} interval=${intervalMs}ms`)
    }).catch(err => console.error('[screen] handleScreenStart error:', err))
  }

  private stopScreenCapture(sessionId: string): void {
    const hadTimer = this.screenTimers.has(sessionId)
    this.clearScreenTimer(sessionId)
    this.screenMonitorId.delete(sessionId)
    if (hadTimer) {
      this.send({
        type:      'agent:screen_closed',
        payload:   { sessionId },
        timestamp: Date.now()
      })
      console.log(`🖥️  Screen capture stopped: sessionId=${sessionId}`)
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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
            sshAvailable: false,
            screenControl: this.controlAvailable,
            clipboard:    true,
            multiMonitor: this.cachedMonitors.length > 1,
            monitors:     this.cachedMonitors,
            docker:       this.dockerAvailable
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
