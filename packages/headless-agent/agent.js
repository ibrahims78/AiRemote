'use strict'

/**
 * AiRemote Agent — Headless / CLI  v1.2.0
 * No UI, no Electron. Runs as a background process or Windows service.
 * New in v1.2.0: PTY direct-shell tunnel (no SSH needed for Terminal tab)
 *                SSH availability auto-detect
 * Config: %APPDATA%\airemote\config.json  (or same folder as exe)
 */

const WebSocket = require('ws')
const os     = require('os')
const fs     = require('fs')
const path   = require('path')
const net    = require('net')
const { exec, spawn } = require('child_process')

// ─── Config path ─────────────────────────────────────────────────────────
const CONFIG_DIR  = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'airemote')
  : path.join(os.homedir(), '.airemote')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// ─── Constants ────────────────────────────────────────────────────────────
const HEARTBEAT_MS   = 10_000
const RECONNECT_BASE = 2_000
const RECONNECT_MAX  = 30_000
const VERSION        = '1.2.0'

// ─── State ────────────────────────────────────────────────────────────────
let ws             = null
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let running        = true
let config         = loadConfig()
let sshAvailable   = false

/** @type {Map<string, import('child_process').ChildProcess>} */
const ptyProcs = new Map()

// ─── Config ───────────────────────────────────────────────────────────────
function loadConfig() {
  const args = process.argv.slice(2)
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
  const cliServer = get('--server')
  const cliToken  = get('--token')
  const envServer = process.env.AIREMOTE_SERVER
  const envToken  = process.env.AIREMOTE_TOKEN

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
  return {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: 0, networkDownKbps: 0,
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

function handlePtyResize(payload) {
  const { sessionId } = payload
  if (process.platform !== 'win32') {
    const proc = ptyProcs.get(sessionId)
    if (proc) { try { proc.kill('SIGWINCH') } catch {} }
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
      sshAvailable = await checkSshPort('127.0.0.1', 22)
      const shell  = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')

      send({
        type: 'agent:register',
        payload: {
          token: config.token.trim(),
          info,
          stats,
          tunnelLayer: 'relay',
          capabilities: { pty: true, sshAvailable, shell },
          sshInfo: { available: sshAvailable, port: 22 }
        },
        timestamp: Date.now()
      })
      startHeartbeat()
      log('info', `🖥  PTY: ready | SSH: ${sshAvailable ? 'available' : 'not detected'} | v${VERSION}`)
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

    // ── PTY ───────────────────────────────────────────────────────────────
    case 'server:pty_open':
      handlePtyOpen(msg.payload)
      break

    case 'server:pty_data':
      handlePtyData(msg.payload)
      break

    case 'server:pty_resize':
      handlePtyResize(msg.payload)
      break

    case 'server:pty_close':
      handlePtyClose(msg.payload)
      break
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
          capabilities: { pty: true, sshAvailable }
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

  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║  AiRemote Agent v' + VERSION + ' — First Setup  ║')
  console.log('╚══════════════════════════════════════════╝\n')

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
  console.log(`   Features: PTY (direct shell) | SSH detect | Cross-platform\n`)

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
