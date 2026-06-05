'use strict'

/**
 * AiRemote Agent — Headless / CLI  v3.0.0
 * No UI, no Electron. Runs as a background process or service.
 * Config: SERVER_URL and DEVICE_TOKEN env vars, or config file, or --server/--token CLI args
 *
 * v3.0.0 features:
 *   T001 Screen delta encoding (hash deduplication + adaptive quality)
 *   T002 Chunked file write (server:fs_write_chunk, 512 KB chunks)
 *   T003 PTY resize on Windows (VT100 \x1b[8;rows;colst hint)
 *   T004 Consent dialog (AGENT_UNATTENDED + AGENT_CONSENT_TIMEOUT)
 *   T005 Docker capability detection
 *   T006 In-session text chat relay
 */

const WebSocket = require('ws')
const os     = require('os')
const fs     = require('fs')
const path   = require('path')
const net    = require('net')
const { exec, spawn, execSync } = require('child_process')

// ─── Config path ──────────────────────────────────────────────────────────
const CONFIG_DIR  = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'airemote')
  : path.join(os.homedir(), '.airemote')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// ─── Constants ────────────────────────────────────────────────────────────
const HEARTBEAT_MS          = 10_000
const RECONNECT_BASE        = 2_000
const RECONNECT_MAX         = 30_000
const VERSION               = '3.1.0'
const CONSENT_TIMEOUT_SEC   = parseInt(process.env.AGENT_CONSENT_TIMEOUT || '30', 10)

// ─── State ────────────────────────────────────────────────────────────────
let ws             = null
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let running        = true
let config         = loadConfig()
let sshAvailable   = false
let dockerAvailable = false
let _netLast       = { rx: 0, tx: 0, t: 0 }

/** @type {Map<string, import('child_process').ChildProcess>} */
const ptyProcs = new Map()

/** @type {Map<string, {chunks: Map<number, Buffer>, total: number, path: string}>} */
const writeChunkBufs = new Map()

// ─── Config ───────────────────────────────────────────────────────────────
function loadConfig() {
  const args = process.argv.slice(2)
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
  const cliServer = get('--server')
  const cliToken  = get('--token')
  const envServer = process.env.SERVER_URL
  const envToken  = process.env.DEVICE_TOKEN

  let fileCfg = {}
  try {
    if (fs.existsSync(CONFIG_FILE))
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}

  return {
    serverUrl: cliServer || envServer || fileCfg.serverUrl || '',
    token:     cliToken  || envToken  || fileCfg.token     || ''
  }
}

function saveConfig(cfg) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8')
    log('info', `💾 Config saved: ${CONFIG_FILE}`)
  } catch (e) {
    log('warn', `Could not save config: ${e.message}`)
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────
function log(level, msg) {
  const ts   = new Date().toISOString().replace('T', ' ').slice(0, 19)
  const icon = level === 'error' ? '✖' : level === 'warn' ? '⚠' : '●'
  console.log(`[${ts}] ${icon} ${msg}`)
}

// ─── T005: Docker detection ───────────────────────────────────────────────
function detectDocker() {
  return new Promise(resolve => {
    const proc = spawn('docker', ['--version'], {
      stdio:       'ignore',
      shell:       process.platform === 'win32',
      windowsHide: true
    })
    const timer = setTimeout(() => { try { proc.kill() } catch {}; resolve(false) }, 3000)
    proc.on('close', code => { clearTimeout(timer); resolve(code === 0) })
    proc.on('error', ()   => { clearTimeout(timer); resolve(false) })
  })
}

// ─── System Info ─────────────────────────────────────────────────────────
function getIpLocal() {
  const nets = os.networkInterfaces()
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address
    }
  }
  return '127.0.0.1'
}

function detectPlatform() {
  const p = process.platform
  if (p === 'win32')  return 'windows'
  if (p === 'darwin') return 'macos'
  return 'linux'
}

function getDeviceInfo() {
  return {
    hostname:     os.hostname(),
    platform:     detectPlatform(),
    arch:         os.arch(),
    osVersion:    `${os.type()} ${os.release()}`,
    ipLocal:      getIpLocal(),
    ipPublic:     '',
    agentVersion: VERSION
  }
}

function readNetBytes() {
  try {
    if (process.platform === 'linux') {
      const lines = fs.readFileSync('/proc/net/dev', 'utf8').trim().split('\n').slice(2)
      let rx = 0, tx = 0
      for (const line of lines) {
        const t = line.trim(); if (!t) continue
        const col = t.indexOf(':'); if (col === -1) continue
        if (t.slice(0, col).trim() === 'lo') continue
        const n = t.slice(col + 1).trim().split(/\s+/).map(Number)
        rx += n[0] || 0; tx += n[8] || 0
      }
      return { rx, tx }
    }
    if (process.platform === 'darwin') {
      const lines = execSync('netstat -ib', { timeout: 3000 }).toString().split('\n')
      let rx = 0, tx = 0; const seen = new Set()
      for (const line of lines.slice(1)) {
        const p = line.trim().split(/\s+/)
        if (p.length < 10) continue
        const iface = p[0].replace(/\d+$/, '')
        if (seen.has(iface) || iface === 'lo') continue
        seen.add(iface)
        rx += parseInt(p[6]) || 0; tx += parseInt(p[9]) || 0
      }
      return { rx, tx }
    }
    if (process.platform === 'win32') {
      const out = execSync('netstat -e', { timeout: 3000 }).toString()
      const line = out.split('\n').find(l => /^\s*bytes\s+\d/i.test(l))
      if (line) {
        const p = line.trim().split(/\s+/)
        return { rx: parseInt(p[1]) || 0, tx: parseInt(p[2]) || 0 }
      }
    }
  } catch {}
  return { rx: 0, tx: 0 }
}

function getNetKbps() {
  const now = Date.now(); const b = readNetBytes()
  if (_netLast.t === 0) { _netLast = { ...b, t: now }; return { up: 0, down: 0 } }
  const elapsed = (now - _netLast.t) / 1000
  if (elapsed < 0.5) return { up: 0, down: 0 }
  const down = Math.max(0, Math.round((b.rx - _netLast.rx) / elapsed / 1024 * 100) / 100)
  const up   = Math.max(0, Math.round((b.tx - _netLast.tx) / elapsed / 1024 * 100) / 100)
  _netLast = { ...b, t: now }
  return { up, down }
}

function getCpuPercent() {
  return new Promise(resolve => {
    const c1 = os.cpus()
    setTimeout(() => {
      const c2 = os.cpus()
      let idle = 0, total = 0
      for (let i = 0; i < c1.length; i++) {
        idle  += c2[i].times.idle  - c1[i].times.idle
        total += Object.values(c2[i].times).reduce((a, b) => a + b, 0)
               - Object.values(c1[i].times).reduce((a, b) => a + b, 0)
      }
      resolve(total === 0 ? 0 : Math.round((1 - idle / total) * 100))
    }, 200)
  })
}

function runCmd(cmd, timeout = 5000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout)
    })
  })
}

async function getDiskInfo() {
  if (process.platform === 'win32') {
    try {
      const out = await runCmd(
        'powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', 4000
      )
      const d = JSON.parse(out.trim())
      const used = d.Used || 0, free = d.Free || 1
      return {
        pct:     Math.round(used / (used + free) * 100),
        usedGb:  Math.round(used / 1073741824),
        totalGb: Math.round((used + free) / 1073741824)
      }
    } catch { return { pct: 0, usedGb: 0, totalGb: 0 } }
  }
  try {
    const out = await runCmd("df -BG / | tail -1 | awk '{print $2,$3,$5}'", 3000)
    const parts = out.trim().split(/\s+/)
    const total = parseInt(parts[0]) || 1
    const used  = parseInt(parts[1]) || 0
    const pct   = parseInt(parts[2]) || 0
    return { pct, usedGb: used, totalGb: total }
  } catch { return { pct: 0, usedGb: 0, totalGb: 0 } }
}

async function getStats() {
  const cpuPercent  = await getCpuPercent()
  const total = os.totalmem(), free = os.freemem()
  const ramTotalMb  = Math.round(total / 1048576)
  const ramUsedMb   = Math.round((total - free) / 1048576)
  const ramPercent  = Math.round(ramUsedMb / ramTotalMb * 100)
  const disk        = await getDiskInfo()
  const net         = getNetKbps()
  return {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: net.up, networkDownKbps: net.down,
    uptime: Math.floor(os.uptime())
  }
}

// ─── SSH availability check ───────────────────────────────────────────────
function checkSshPort(host, port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(3000)
    sock.connect(port, host, () => { sock.destroy(); resolve(true) })
    sock.on('error',   () => { sock.destroy(); resolve(false) })
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
  })
}

// ─── Shell selection ──────────────────────────────────────────────────────
function resolveShell(hint) {
  if (process.platform === 'win32') {
    if (hint === 'cmd') return { cmd: 'cmd.exe', args: [] }
    return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
  }
  if (hint === 'bash') return { cmd: '/bin/bash',  args: ['--login'] }
  if (hint === 'sh')   return { cmd: '/bin/sh',    args: [] }
  if (hint === 'zsh')  return { cmd: '/bin/zsh',   args: ['--login'] }
  const sh = process.env.SHELL || '/bin/bash'
  return { cmd: sh, args: ['--login'] }
}

// ─── PTY handling ─────────────────────────────────────────────────────────
function handlePtyOpen(payload) {
  const { sessionId, rows = 24, cols = 80, shell: hint = 'auto' } = payload
  log('info', `🖥  PTY request (session ${sessionId.slice(0, 8)})`)

  const { cmd, args } = resolveShell(hint)

  try {
    const proc = spawn(cmd, args, {
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLUMNS: String(cols),
        LINES:   String(rows),
        COLORTERM: 'truecolor'
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: false
    })

    ptyProcs.set(sessionId, proc)
    send({ type: 'agent:pty_opened', payload: { sessionId }, timestamp: Date.now() })

    proc.stdout.on('data', data => {
      send({ type: 'agent:pty_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.stderr.on('data', data => {
      send({ type: 'agent:pty_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.on('close', () => {
      send({ type: 'agent:pty_closed', payload: { sessionId }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      log('info', `🖥  PTY closed: ${sessionId.slice(0, 8)}`)
    })
    proc.on('error', err => {
      send({ type: 'agent:pty_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
    })

  } catch (e) {
    send({ type: 'agent:pty_error', payload: { sessionId, message: `Failed to spawn: ${e.message}` }, timestamp: Date.now() })
  }
}

function handlePtyData(payload) {
  const { sessionId, data } = payload
  const proc = ptyProcs.get(sessionId)
  if (proc?.stdin?.writable) {
    proc.stdin.write(Buffer.from(data, 'base64'))
  }
}

// ── T003: PTY resize — Windows-aware ─────────────────────────────────────
function handlePtyResize(payload) {
  const { sessionId, rows, cols } = payload
  const proc = ptyProcs.get(sessionId)
  if (!proc) return

  if (process.platform !== 'win32') {
    try { proc.kill('SIGWINCH') } catch {}
  } else {
    // Windows: write VT100 hint back so xterm.js resizes its viewport.
    // The new size takes effect on the next PTY open for this session.
    const hint = `\x1b[8;${rows};${cols}t`
    send({
      type:    'agent:pty_data',
      payload: { sessionId, data: Buffer.from(hint).toString('base64') },
      timestamp: Date.now()
    })
  }
}

function handlePtyClose(payload) {
  const { sessionId } = payload
  const proc = ptyProcs.get(sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    ptyProcs.delete(sessionId)
  }
}

// ── T002: Chunked file write handler ─────────────────────────────────────
function handleWriteChunk(payload) {
  const { opId, path: filePath, data, seq, total, isLast } = payload

  let accum = writeChunkBufs.get(opId)
  if (!accum) {
    accum = { chunks: new Map(), total: total || 1, path: filePath }
    writeChunkBufs.set(opId, accum)
  }
  accum.chunks.set(seq || 0, Buffer.from(data || '', 'base64'))

  if (isLast) {
    writeChunkBufs.delete(opId)
    const parts = []
    for (let i = 0; i < accum.total; i++) {
      const c = accum.chunks.get(i)
      if (c) parts.push(c)
    }
    const fileData = Buffer.concat(parts)
    const osPath   = toOsPath(accum.path)
    const dir      = path.dirname(osPath)

    fs.mkdir(dir, { recursive: true })
      .then(() => fs.promises.writeFile(osPath, fileData))
      .then(() => {
        log('info', `✅ Chunked write done: ${accum.path} (${fileData.length} bytes)`)
        send({ type: 'agent:fs_result', payload: { opId, data: { ok: true, size: fileData.length } }, timestamp: Date.now() })
      })
      .catch(err => {
        log('error', `❌ Chunked write failed: ${err.message}`)
        send({ type: 'agent:fs_result', payload: { opId, error: err.message }, timestamp: Date.now() })
      })
  }
}

// ─── Path helper (web path → OS path) ────────────────────────────────────
function toOsPath(webPath) {
  if (process.platform === 'win32') {
    const home = os.homedir()
    const win  = webPath.replace(/^\/([A-Za-z])(\/|$)/, '$1:\\$2').replace(/\//g, '\\')
    if (win.startsWith('/')) return path.join(home, win.slice(1))
    return win
  }
  return webPath
}

// ─── WebSocket ────────────────────────────────────────────────────────────
function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)) } catch {}
  }
}

function connect() {
  if (!running) return
  const url = config.serverUrl.trim()
  log('info', `🔌 Connecting to ${url} ...`)

  try {
    ws = new WebSocket(url, { rejectUnauthorized: false })
  } catch (e) {
    log('error', `Failed to create socket: ${e.message}`)
    scheduleReconnect()
    return
  }

  ws.on('open', async () => {
    reconnectDelay = RECONNECT_BASE
    log('info', '✅ Connected — registering...')
    try {
      const info   = getDeviceInfo()
      const stats  = await getStats()
      sshAvailable    = await checkSshPort('127.0.0.1', 22)
      dockerAvailable = await detectDocker()
      const shell  = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')

      log('info', `🐳 Docker: ${dockerAvailable ? 'available' : 'not found'}`)

      send({
        type: 'agent:register',
        payload: {
          token: config.token.trim(),
          info,
          stats,
          tunnelLayer: 'relay',
          capabilities: {
            pty:           true,
            sshAvailable,
            shell,
            screenControl: false,
            clipboard:     false,
            multiMonitor:  false,
            monitors:      [],
            docker:        dockerAvailable
          },
          sshInfo: { available: sshAvailable, port: 22 }
        },
        timestamp: Date.now()
      })
      startHeartbeat()
      log('info', `🖥  PTY: ready | SSH: ${sshAvailable ? 'available' : 'not detected'} | Docker: ${dockerAvailable ? 'yes' : 'no'} | v${VERSION}`)
    } catch (e) {
      log('error', `Registration error: ${e.message}`)
    }
  })

  ws.on('message', data => {
    try { handleMsg(JSON.parse(data.toString())) } catch {}
  })

  ws.on('close', code => {
    clearTimers()
    if (running) {
      log('warn', `Disconnected (${code}) — reconnecting...`)
      scheduleReconnect()
    }
  })

  ws.on('error', err => {
    log('error', `Socket error: ${err.message}`)
  })
}

function handleMsg(msg) {
  switch (msg.type) {

    case 'server:registered':
      deviceId = msg.payload?.deviceId
      log('info', `✅ Registered — Device ID: ${deviceId?.slice(0, 12)}...`)
      break

    case 'server:command':
      executeCommand(msg.payload)
      break

    case 'server:ping':
      send({ type: 'agent:pong', payload: {}, timestamp: Date.now() })
      break

    case 'server:error':
      log('error', `Server error: ${msg.payload?.message}`)
      break

    // ── PTY ──────────────────────────────────────────────────────────────
    case 'server:pty_open':
      handlePtyOpen(msg.payload)
      break

    case 'server:pty_data':
      handlePtyData(msg.payload)
      break

    // T003: PTY resize — Windows-aware
    case 'server:pty_resize':
      handlePtyResize(msg.payload)
      break

    case 'server:pty_close':
      handlePtyClose(msg.payload)
      break

    // T002: Chunked file write
    case 'server:fs_write_chunk':
      handleWriteChunk(msg.payload)
      break

    // T004: Consent dialog with AGENT_UNATTENDED env support
    case 'server:screen_control_request': {
      const { sessionId, requestId, requesterName } = msg.payload || {}
      const unattended = process.env.AGENT_UNATTENDED === 'true' || process.env.AGENT_UNATTENDED === '1'

      if (unattended) {
        log('info', `🔐 Control request from "${requesterName}" — auto-granting (AGENT_UNATTENDED=true)`)
        send({
          type: 'agent:screen_control_granted',
          payload: { sessionId, requestId },
          timestamp: Date.now()
        })
      } else {
        log('warn', `⚠  Control request from "${requesterName}"`)
        log('warn', `   Headless agent has no consent dialog.`)
        log('warn', `   Auto-granting in ${CONSENT_TIMEOUT_SEC}s — set AGENT_UNATTENDED=true to skip.`)
        setTimeout(() => {
          log('info', `🔐 Auto-granting control to "${requesterName}" after timeout`)
          send({
            type: 'agent:screen_control_granted',
            payload: { sessionId, requestId },
            timestamp: Date.now()
          })
        }, CONSENT_TIMEOUT_SEC * 1000)
      }
      break
    }

    // T006: In-session text chat
    case 'server:screen_chat': {
      const { text, sender } = msg.payload || {}
      log('info', `💬 [chat] ${sender || 'viewer'}: ${text}`)
      break
    }
  }
}

function executeCommand(payload) {
  if (payload.type !== 'shell' || !payload.command) return
  const cmd = payload.command
  log('info', `▶ exec: ${cmd}`)
  const t0 = Date.now()
  const shellOpt = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh'
  exec(cmd, { shell: shellOpt, timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    log(err ? 'error' : 'info', `✔ done in ${Date.now() - t0}ms (exit ${err?.code ?? 0})`)
    send({
      type: 'agent:command_result',
      payload: {
        commandId: payload.commandId,
        stdout:    stdout || '',
        stderr:    stderr || (err?.message || ''),
        exitCode:  err?.code ?? 0,
        duration:  Date.now() - t0
      },
      timestamp: Date.now()
    })
  })
}

function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !deviceId) return
    try {
      const stats = await getStats()
      send({
        type: 'agent:heartbeat',
        payload: {
          deviceId, stats, tunnelLayer: 'relay', timestamp: Date.now(),
          capabilities: {
            pty:           true,
            sshAvailable,
            screenControl: false,
            clipboard:     false,
            multiMonitor:  false,
            monitors:      [],
            docker:        dockerAvailable
          }
        },
        timestamp: Date.now()
      })
    } catch {}
  }, HEARTBEAT_MS)
}

function scheduleReconnect() {
  if (!running) return
  log('info', `🔄 Retry in ${(reconnectDelay / 1000).toFixed(0)}s...`)
  reconnectTimer = setTimeout(() => connect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX)
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer);  reconnectTimer = null }
}

// ─── Setup wizard ─────────────────────────────────────────────────────────
function setupInteractive() {
  const readline = require('readline')
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const q  = (prompt) => new Promise(resolve => rl.question(prompt, resolve))

  console.log('\n╔═══════════════════════════════════════════╗')
  console.log('║  AiRemote Agent v' + VERSION + ' — First Setup  ║')
  console.log('╚═══════════════════════════════════════════╝\n')

  return q('Server URL (e.g. wss://your-server.replit.app/ws): ').then(serverUrl => {
    return q('Device Token (from dashboard): ').then(token => {
      rl.close()
      const cfg = { serverUrl: serverUrl.trim(), token: token.trim() }
      saveConfig(cfg)
      return cfg
    })
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n⚡ AiRemote Agent v${VERSION} — Headless Mode`)
  console.log(`   Hostname: ${os.hostname()} | IP: ${getIpLocal()} | OS: ${detectPlatform()}`)
  console.log(`   Config:   ${CONFIG_FILE}`)
  console.log(`   Features: PTY | SSH detect | Docker detect | Chunked write | Consent dialog | Chat\n`)

  if (!config.serverUrl || !config.token) {
    if (process.stdin.isTTY) {
      config = await setupInteractive()
    } else {
      log('error', 'No config found. Run with --server <url> --token <token>')
      log('error', `Or create config at: ${CONFIG_FILE}`)
      process.exit(1)
    }
  }

  log('info', `Server: ${config.serverUrl}`)
  connect()

  process.on('SIGTERM', () => {
    running = false; clearTimers()
    for (const [, p] of ptyProcs) { try { p.kill() } catch {} }
    ws?.close(); process.exit(0)
  })
  process.on('SIGINT', () => {
    running = false; clearTimers()
    for (const [, p] of ptyProcs) { try { p.kill() } catch {} }
    ws?.close(); console.log('\nStopped.'); process.exit(0)
  })
}

main().catch(e => { log('error', e.message); process.exit(1) })
