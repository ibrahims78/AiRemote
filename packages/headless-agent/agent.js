'use strict'

/**
 * AiRemote Agent — Headless / CLI version
 * No UI, no Electron. Runs as a background process / Windows service.
 * Config: %APPDATA%\airemote\config.json  (or same folder as exe)
 */

const WebSocket = require('ws')
const os   = require('os')
const fs   = require('fs')
const path = require('path')
const { exec } = require('child_process')

// ─── Config path ──────────────────────────────────────────────────────────
const CONFIG_DIR  = process.env.APPDATA
  ? path.join(process.env.APPDATA, 'airemote')
  : path.join(os.homedir(), '.airemote')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

// ─── Constants ────────────────────────────────────────────────────────────
const HEARTBEAT_MS   = 10_000
const RECONNECT_BASE = 2_000
const RECONNECT_MAX  = 30_000
const VERSION        = '1.1.0'

// ─── State ────────────────────────────────────────────────────────────────
let ws             = null
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let sessionStart   = null
let running        = true
let config         = loadConfig()

// ─── Config ───────────────────────────────────────────────────────────────
function loadConfig() {
  // 1. CLI args:  agent.exe --server wss://... --token abc
  const args = process.argv.slice(2)
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
  const cliServer = get('--server')
  const cliToken  = get('--token')

  // 2. Env vars
  const envServer = process.env.AIREMOTE_SERVER
  const envToken  = process.env.AIREMOTE_TOKEN

  // 3. Config file
  let fileCfg = {}
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
    }
  } catch {}

  return {
    serverUrl: cliServer || envServer || fileCfg.serverUrl || '',
    token:     cliToken  || envToken  || fileCfg.token     || '',
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

// ─── System Info ──────────────────────────────────────────────────────────
function getIpLocal() {
  const nets = os.networkInterfaces()
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (!iface.internal && iface.family === 'IPv4') return iface.address
    }
  }
  return '127.0.0.1'
}

function getDeviceInfo() {
  return {
    hostname:     os.hostname(),
    platform:     'windows',
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
              -  Object.values(c1[i].times).reduce((a, b) => a + b, 0)
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

async function getDiskPercent() {
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

async function getStats() {
  const cpuPercent  = await getCpuPercent()
  const total = os.totalmem(), free = os.freemem()
  const ramTotalMb  = Math.round(total / 1048576)
  const ramUsedMb   = Math.round((total - free) / 1048576)
  const ramPercent  = Math.round(ramUsedMb / ramTotalMb * 100)
  const disk        = await getDiskPercent()
  return {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: 0, networkDownKbps: 0,
    uptime: Math.floor(os.uptime())
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
    sessionStart   = Date.now()
    log('info', '✅ Connected — registering...')
    try {
      const info  = getDeviceInfo()
      const stats = await getStats()
      send({
        type: 'agent:register',
        payload: { token: config.token.trim(), info, stats, tunnelLayer: 'relay' },
        timestamp: Date.now()
      })
      startHeartbeat()
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
  }
}

function executeCommand(payload) {
  if (payload.type !== 'shell' || !payload.command) return
  const cmd = payload.command
  log('info', `▶ exec: ${cmd}`)
  const t0 = Date.now()
  exec(cmd, { shell: 'cmd.exe', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
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
        payload: { deviceId, stats, tunnelLayer: 'relay', timestamp: Date.now() },
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

  console.log('\n╔══════════════════════════════════════╗')
  console.log('║     AiRemote Agent — First Setup     ║')
  console.log('╚══════════════════════════════════════╝\n')

  return q('Server URL (e.g. wss://your-server.replit.app/ws): ').then(serverUrl => {
    return q('Device Token (from dashboard): ').then(token => {
      rl.close()
      const cfg = {
        serverUrl: serverUrl.trim(),
        token:     token.trim()
      }
      saveConfig(cfg)
      return cfg
    })
  })
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n⚡ AiRemote Agent v${VERSION} — Headless Mode`)
  console.log(`   Hostname: ${os.hostname()} | IP: ${getIpLocal()}`)
  console.log(`   Config:   ${CONFIG_FILE}\n`)

  // If no config, run setup wizard
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

  process.on('SIGTERM', () => { running = false; clearTimers(); ws?.close(); process.exit(0) })
  process.on('SIGINT',  () => { running = false; clearTimers(); ws?.close(); console.log('\nStopped.'); process.exit(0) })
}

main().catch(e => { log('error', e.message); process.exit(1) })
