'use strict'
/**
 * AiRemote Agent — Script version (requires Node.js 18+ installed)
 * Run:  node airemote-agent.js --server wss://your-server/ws --token YOUR_TOKEN
 *   OR  set config in config.json and run: node airemote-agent.js
 */

const WebSocket = require('./node_modules/ws/index.js')
const os   = require('os')
const fs   = require('fs')
const path = require('path')
const { exec, execSync } = require('child_process')

const CONFIG_FILE = path.join(__dirname, 'config.json')
const HEARTBEAT_MS   = 10_000
const RECONNECT_BASE = 2_000
const RECONNECT_MAX  = 30_000
const VERSION        = '1.1.0'

let ws = null, deviceId = null, heartbeatTimer = null
let reconnectTimer = null, reconnectDelay = RECONNECT_BASE
let running = true

let _netLast = { rx: 0, tx: 0, t: 0 }

function loadConfig() {
  const args = process.argv.slice(2)
  const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null }
  let fileCfg = {}
  try {
    if (fs.existsSync(CONFIG_FILE)) fileCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
  } catch {}
  return {
    serverUrl: get('--server') || process.env.AIREMOTE_SERVER || fileCfg.serverUrl || '',
    token:     get('--token')  || process.env.AIREMOTE_TOKEN  || fileCfg.token     || '',
  }
}

let config = loadConfig()

function log(level, msg) {
  const ts = new Date().toISOString().replace('T',' ').slice(0,19)
  console.log(`[${ts}] ${level === 'error' ? '✖' : level === 'warn' ? '⚠' : '●'} ${msg}`)
}

function getIpLocal() {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces)
      if (!i.internal && i.family === 'IPv4') return i.address
  return '127.0.0.1'
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

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) try { ws.send(JSON.stringify(msg)) } catch {}
}

function getCpuPercent() {
  return new Promise(resolve => {
    const c1 = os.cpus()
    setTimeout(() => {
      const c2 = os.cpus()
      let idle = 0, total = 0
      for (let i = 0; i < c1.length; i++) {
        idle  += c2[i].times.idle - c1[i].times.idle
        total += Object.values(c2[i].times).reduce((a,b)=>a+b,0) - Object.values(c1[i].times).reduce((a,b)=>a+b,0)
      }
      resolve(total === 0 ? 0 : Math.round((1 - idle/total)*100))
    }, 200)
  })
}

async function getDisk() {
  try {
    const out = await new Promise((res,rej) => exec(
      'powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"',
      {timeout:4000}, (e,s) => e ? rej(e) : res(s)
    ))
    const d = JSON.parse(out.trim())
    const used = d.Used||0, free = d.Free||1
    return { pct: Math.round(used/(used+free)*100), usedGb: Math.round(used/1073741824), totalGb: Math.round((used+free)/1073741824) }
  } catch { return {pct:0,usedGb:0,totalGb:0} }
}

async function getStats() {
  const cpu = await getCpuPercent()
  const tot = os.totalmem(), fre = os.freemem()
  const disk = await getDisk()
  const net = getNetKbps()
  return {
    cpuPercent: cpu,
    ramPercent: Math.round((tot-fre)/tot*100),
    ramUsedMb:  Math.round((tot-fre)/1048576),
    ramTotalMb: Math.round(tot/1048576),
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: net.up, networkDownKbps: net.down,
    uptime: Math.floor(os.uptime())
  }
}

function handleMsg(msg) {
  if (msg.type === 'server:registered') {
    deviceId = msg.payload?.deviceId
    log('info', `✅ Registered — ${deviceId?.slice(0,12)}...`)
  } else if (msg.type === 'server:command') {
    const { commandId, type, command } = msg.payload || {}
    if (type !== 'shell' || !command) return
    log('info', `▶ exec: ${command}`)
    const t0 = Date.now()
    exec(command, {shell:'cmd.exe', timeout:30000, maxBuffer:10*1024*1024}, (err,stdout,stderr) => {
      send({ type:'agent:command_result', payload:{ commandId, stdout:stdout||'', stderr:stderr||(err?.message||''), exitCode:err?.code??0, duration:Date.now()-t0 }, timestamp:Date.now() })
    })
  } else if (msg.type === 'server:ping') {
    send({ type:'agent:pong', payload:{}, timestamp:Date.now() })
  }
}

function connect() {
  if (!running) return
  log('info', `🔌 Connecting to ${config.serverUrl} ...`)
  try { ws = new WebSocket(config.serverUrl, { rejectUnauthorized: false }) }
  catch(e) { log('error', e.message); scheduleReconnect(); return }

  ws.on('open', async () => {
    reconnectDelay = RECONNECT_BASE
    log('info', '✅ Connected — registering...')
    const info = { hostname:os.hostname(), platform:'windows', arch:os.arch(), osVersion:`${os.type()} ${os.release()}`, ipLocal:getIpLocal(), ipPublic:'', agentVersion:VERSION }
    const stats = await getStats().catch(()=>({cpuPercent:0,ramPercent:0,ramUsedMb:0,ramTotalMb:0,diskPercent:0,diskUsedGb:0,diskTotalGb:0,networkUpKbps:0,networkDownKbps:0,uptime:0}))
    send({ type:'agent:register', payload:{ token:config.token.trim(), info, stats, tunnelLayer:'relay' }, timestamp:Date.now() })
    heartbeatTimer = setInterval(async () => {
      if (!ws || ws.readyState !== WebSocket.OPEN || !deviceId) return
      const s = await getStats().catch(()=>({}))
      send({ type:'agent:heartbeat', payload:{ deviceId, stats:s, tunnelLayer:'relay', timestamp:Date.now() }, timestamp:Date.now() })
    }, HEARTBEAT_MS)
  })
  ws.on('message', d => { try { handleMsg(JSON.parse(d.toString())) } catch {} })
  ws.on('close', code => { clearTimers(); if(running){ log('warn',`Disconnected (${code}) — retrying...`); scheduleReconnect() } })
  ws.on('error', e => log('error', e.message))
}

function scheduleReconnect() {
  if (!running) return
  reconnectTimer = setTimeout(()=>connect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay*1.5, RECONNECT_MAX)
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
}

// Main
console.log(`\n⚡ AiRemote Agent v${VERSION} — Script Mode`)
console.log(`   Node.js: ${process.version} | Host: ${os.hostname()} | IP: ${getIpLocal()}`)
console.log(`   Config:  ${CONFIG_FILE}\n`)

if (!config.serverUrl || !config.token) {
  console.error('❌ Missing config!\n')
  console.error('Option 1 — Edit config.json:')
  console.error('  { "serverUrl": "wss://your-server/ws", "token": "YOUR_TOKEN" }\n')
  console.error('Option 2 — CLI args:')
  console.error('  node airemote-agent.js --server wss://your-server/ws --token YOUR_TOKEN\n')
  process.exit(1)
}

connect()
process.on('SIGTERM', ()=>{ running=false; clearTimers(); ws?.close(); process.exit(0) })
process.on('SIGINT',  ()=>{ running=false; clearTimers(); ws?.close(); console.log('\nStopped.'); process.exit(0) })
