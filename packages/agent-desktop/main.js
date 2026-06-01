'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog } = require('electron')
const path   = require('path')
const os     = require('os')
const fs     = require('fs')
const https  = require('https')
const net    = require('net')
const crypto = require('crypto')
const { exec, spawn } = require('child_process')
const WebSocket  = require('ws')

// ─── Single Instance Lock ──────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) { app.quit(); process.exit(0) }
app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus() }
})

// ─── Constants ────────────────────────────────────────────────────────────
const HEARTBEAT_MS   = 10_000
const RECONNECT_BASE = 2_000
const RECONNECT_MAX  = 30_000
const CONFIG_FILE    = path.join(app.getPath('userData'), 'airemote-config.json')
const SSH_KEYS_FILE  = path.join(app.getPath('userData'), 'airemote-ssh-keys.json')
const LOG_MAX        = 300
const AGENT_VERSION  = '1.4.0'

// ─── State ────────────────────────────────────────────────────────────────
let win            = null
let tray           = null
let ws             = null
let agentState     = 'stopped'
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let sessionStart   = null
let config         = loadConfig()
let logEntries     = []
let quitting       = false
let lastStats      = null
let cachedPublicIp = ''
let boundsTimer    = null
let sshAvailable   = false

/** @type {Map<string, import('child_process').ChildProcess>} */
const ptyProcs = new Map()

// ─── Config ───────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    serverUrl: '', token: '', autoStart: false, startMinimized: false,
    _winBounds: null,
    ssh: { host: '', port: 22, username: '', authType: 'password', password: '', keyPath: '' }
  }
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...defaultConfig(), ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
    }
  } catch {}
  return defaultConfig()
}

function saveConfig(updates) {
  config = { ...config, ...updates }
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8') } catch {}
}

// ─── SSH Keys ─────────────────────────────────────────────────────────────
function loadSshKeys() {
  try {
    if (fs.existsSync(SSH_KEYS_FILE))
      return JSON.parse(fs.readFileSync(SSH_KEYS_FILE, 'utf8'))
  } catch {}
  return null
}

function saveSshKeys(keys) {
  try { fs.writeFileSync(SSH_KEYS_FILE, JSON.stringify(keys, null, 2), 'utf8') } catch {}
}

function generateSshKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  })
  const keys = { privateKey, publicKey, generatedAt: new Date().toISOString() }
  saveSshKeys(keys)
  return keys
}

// ─── Public IP ────────────────────────────────────────────────────────────
function fetchPublicIp() {
  return new Promise(resolve => {
    const req = https.get('https://api.ipify.org?format=json', { timeout: 6000 }, res => {
      let data = ''
      res.on('data', c => { data += c })
      res.on('end', () => {
        try {
          const ip = JSON.parse(data).ip || ''
          cachedPublicIp = ip
          if (win && !win.isDestroyed()) win.webContents.send('public-ip', ip)
          resolve(ip)
        } catch { resolve('') }
      })
    })
    req.on('error', () => {
      cachedPublicIp = ''
      if (win && !win.isDestroyed()) win.webContents.send('public-ip', '')
      resolve('')
    })
    req.on('timeout', () => {
      req.destroy()
      cachedPublicIp = ''
      if (win && !win.isDestroyed()) win.webContents.send('public-ip', '')
      resolve('')
    })
  })
}

// ─── Logging ──────────────────────────────────────────────────────────────
function addLog(level, msg) {
  const entry = { t: new Date().toLocaleTimeString('en', { hour12: false }), level, msg }
  logEntries.push(entry)
  if (logEntries.length > LOG_MAX) logEntries.shift()
  if (win && !win.isDestroyed()) win.webContents.send('log', entry)
}

// ─── Status ───────────────────────────────────────────────────────────────
function setState(state, extra) {
  agentState = state
  const uptime = sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0
  const payload = { state, deviceId, serverUrl: config.serverUrl, uptime, ...extra }
  if (win && !win.isDestroyed()) win.webContents.send('state', payload)
  refreshTray()
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
    ipPublic:     cachedPublicIp,
    agentVersion: AGENT_VERSION
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
    }, 150)
  })
}

async function getDiskPercent() {
  try {
    const out = await runCmd('powershell -NoProfile -Command "Get-PSDrive C | Select-Object Used,Free | ConvertTo-Json"', 4000)
    const d = JSON.parse(out.trim())
    const used = d.Used || 0, free = d.Free || 1
    return { pct: Math.round(used / (used + free) * 100), usedGb: Math.round(used / 1073741824), totalGb: Math.round((used + free) / 1073741824) }
  } catch { return { pct: 0, usedGb: 0, totalGb: 0 } }
}

function runCmd(cmd, timeout = 10000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) reject(err); else resolve(stdout)
    })
  })
}

async function getStats() {
  const cpuPercent = await getCpuPercent()
  const total = os.totalmem(), free = os.freemem()
  const ramTotalMb  = Math.round(total / 1048576)
  const ramUsedMb   = Math.round((total - free) / 1048576)
  const ramPercent  = Math.round(ramUsedMb / ramTotalMb * 100)
  const disk        = await getDiskPercent()
  const stats = {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    uptime: Math.floor(os.uptime())
  }
  lastStats = stats
  return stats
}

// ─── Agent WebSocket Logic ─────────────────────────────────────────────────
function startAgent() {
  if (agentState !== 'stopped') return
  if (!config.serverUrl || !config.token) {
    addLog('error', '⚠ أدخل عنوان الخادم والـ Token أولاً')
    return
  }
  reconnectDelay = RECONNECT_BASE
  sessionStart   = Date.now()
  setState('connecting')
  doConnect()
}

function stopAgent() {
  if (agentState === 'stopped') return
  clearTimers()
  for (const [, proc] of ptyProcs) { try { proc.kill() } catch {} }
  ptyProcs.clear()
  if (ws) { try { ws.close() } catch {} ws = null }
  deviceId     = null
  sessionStart = null
  setState('stopped')
  addLog('info', '🛑 تم إيقاف الـ Agent')
}

function doConnect() {
  if (agentState === 'stopped') return
  const url = config.serverUrl.trim()
  addLog('info', `🔌 الاتصال بـ ${url} ...`)

  // Fetch public IP in parallel
  fetchPublicIp().catch(() => {})

  try {
    ws = new WebSocket(url, { rejectUnauthorized: false })
  } catch (e) {
    addLog('error', `❌ فشل إنشاء الاتصال: ${e.message}`)
    scheduleReconnect()
    return
  }

  ws.on('open', async () => {
    reconnectDelay = RECONNECT_BASE
    addLog('info', '✅ اتصل بالخادم — جاري التسجيل...')
    try {
      const info   = getDeviceInfo()
      const stats  = await getStats()
      const sshCfg = config.ssh || {}
      sshAvailable = !!(sshCfg.host || sshCfg.username) || await checkSshPort('127.0.0.1', 22)
      const shell  = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')
      send({
        type: 'agent:register',
        payload: {
          token:       config.token.trim(),
          info,
          stats,
          tunnelLayer: 'relay',
          capabilities: { pty: true, sshAvailable, shell, fs: true },
          sshInfo: {
            available: sshAvailable,
            host:      sshCfg.host || info.ipLocal,
            port:      sshCfg.port || 22,
            username:  sshCfg.username
          }
        },
        timestamp: Date.now()
      })
      startHeartbeat()
      addLog('info', `🖥 PTY Shell: مفعّل | SSH: ${sshAvailable ? 'متاح' : 'غير مكتشف'} | v${AGENT_VERSION}`)
    } catch (e) {
      addLog('error', `خطأ في التسجيل: ${e.message}`)
    }
  })

  ws.on('message', data => {
    try { handleMsg(JSON.parse(data.toString())) } catch {}
  })

  ws.on('close', (code) => {
    clearTimers()
    if (agentState !== 'stopped') {
      addLog('warn', `📴 انقطع الاتصال (${code}) — إعادة الاتصال...`)
      setState('connecting')
      scheduleReconnect()
    }
  })

  ws.on('error', err => {
    addLog('error', `🔴 ${err.message}`)
  })
}

function handleMsg(msg) {
  switch (msg.type) {
    case 'server:registered': {
      deviceId = msg.payload?.deviceId
      setState('connected')
      addLog('info', `✅ مسجل بنجاح — Device ID: ${deviceId?.slice(0, 12)}...`)
      break
    }
    case 'server:command': {
      executeCommand(msg.payload)
      break
    }
    case 'server:error': {
      addLog('error', `❌ خطأ من الخادم: ${msg.payload?.message}`)
      break
    }
    case 'server:ping': {
      send({ type: 'agent:pong', payload: {}, timestamp: Date.now() })
      break
    }
    case 'server:ssh_state': {
      const { active, sessionId, username, method } = msg.payload || {}
      if (win && !win.isDestroyed()) {
        win.webContents.send('ssh-state', { active, sessionId, username, method })
      }
      addLog('info', active
        ? `🔐 SSH: جلسة نشطة${username ? ' — ' + username : ''}${sessionId ? ' [' + sessionId.slice(0, 8) + ']' : ''}${method ? ' (' + method + ')' : ''}`
        : `🔒 SSH: انتهت جلسة الخادم`)
      break
    }
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
    case 'server:fs_request':
      handleFsRequest(msg.payload)
      break
  }
}

// ─── File System (proxy FS) ────────────────────────────────────────────────
const fsPromises = require('fs').promises

function toOsPath(p) {
  if (process.platform !== 'win32') return p
  if (/^[A-Za-z]:/.test(p)) return p
  if (p === '/' || p === '') return null
  // /C:       → C:\
  // /C:/path  → C:\path
  const m = p.match(/^\/([A-Za-z]:)(\/.*)?$/)
  if (m) return m[1] + (m[2] ? m[2].replace(/\//g, '\\') : '\\')
  return p.replace(/\//g, '\\')
}

async function handleFsRequest(payload) {
  const { opId, op, path: reqPath, newPath, content, encoding } = payload || {}
  const respond = (data) => send({
    type: 'agent:fs_result',
    payload: { opId, ...data },
    timestamp: Date.now()
  })

  try {
    switch (op) {
      case 'list': {
        if (reqPath === '/' || reqPath === '') {
          if (process.platform === 'win32') {
            const checkDrive = async (letter) => {
              try {
                await Promise.race([
                  fsPromises.access(letter + ':\\'),
                  new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500))
                ])
                return { name: letter + ':', path: '/' + letter + ':', isDirectory: true, size: 0, modified: new Date().toISOString(), permissions: '755' }
              } catch { return null }
            }
            const drives = (await Promise.all('CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map(checkDrive))).filter(Boolean)
            return respond({ data: drives })
          }
          return respond({ data: [{ name: '/', path: '/', isDirectory: true, size: 0, modified: new Date().toISOString(), permissions: '755' }] })
        }
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const entries = await fsPromises.readdir(osp, { withFileTypes: true })
        // Convert OS path back to web path for response
        const toWebPath = (osFullPath) => {
          if (process.platform !== 'win32') return osFullPath
          return osFullPath.replace(/\\/g, '/')
        }
        const settled = await Promise.allSettled(entries.map(async e => {
          const full = require('path').join(osp, e.name)
          const st = await Promise.race([
            fsPromises.lstat(full),
            new Promise((_, rej) => setTimeout(() => rej(new Error('stat timeout')), 3000))
          ])
          return {
            name: e.name,
            path: toWebPath(full),
            isDirectory: e.isDirectory() || st.isDirectory(),
            size: st.size,
            modified: st.mtime.toISOString(),
            permissions: '755'
          }
        }))
        const data = settled.map((r, i) => {
          if (r.status === 'fulfilled') return r.value
          const full = require('path').join(osp, entries[i].name)
          return { name: entries[i].name, path: toWebPath(full), isDirectory: entries[i].isDirectory(), size: 0, modified: new Date().toISOString(), permissions: '755' }
        })
        respond({ data })
        break
      }
      case 'read': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const buf = await fsPromises.readFile(osp)
        respond({ data: buf.toString('base64'), encoding: 'base64' })
        break
      }
      case 'read_chunked': {
        // Chunked transfer — keeps WS event loop free, avoids ping-timeout on large files
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const CHUNK = 512 * 1024
        const buf   = await fsPromises.readFile(osp)
        const n     = Math.ceil(buf.length / CHUNK) || 1
        for (let i = 0; i < n; i++) {
          send({
            type:    'agent:fs_chunk',
            payload: {
              opId, seq: i,
              data: buf.slice(i * CHUNK, (i + 1) * CHUNK).toString('base64'),
              done:  i === n - 1,
              total: n
            },
            timestamp: Date.now()
          })
          await new Promise(r => setImmediate(r))
        }
        return
      }
      case 'write': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const writeData = encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content || '')
        await fsPromises.writeFile(osp, writeData)
        respond({ data: { ok: true } })
        break
      }
      case 'delete': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        await fsPromises.rm(osp, { recursive: true, force: true })
        respond({ data: { ok: true } })
        break
      }
      case 'mkdir': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        await fsPromises.mkdir(osp, { recursive: true })
        respond({ data: { ok: true } })
        break
      }
      case 'rename': {
        const osp = toOsPath(reqPath)
        const osp2 = toOsPath(newPath)
        if (!osp || !osp2) return respond({ error: 'Invalid path' })
        await fsPromises.rename(osp, osp2)
        respond({ data: { ok: true } })
        break
      }
      case 'stat': {
        const osp = toOsPath(reqPath)
        if (!osp) return respond({ error: 'Invalid path' })
        const st = await fsPromises.stat(osp)
        respond({ data: { size: st.size, modified: st.mtime.toISOString(), isDirectory: st.isDirectory() } })
        break
      }
      default:
        respond({ error: `Unknown op: ${op}` })
    }
  } catch (e) {
    respond({ error: e.message })
  }
}

// ─── SSH port check ────────────────────────────────────────────────────────
function checkSshPort(host, port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(3000)
    sock.connect(port, host, () => { sock.destroy(); resolve(true) })
    sock.on('error',   () => { sock.destroy(); resolve(false) })
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
  })
}

// ─── PTY (Direct Shell) ───────────────────────────────────────────────────
function resolveShell(hint) {
  if (process.platform === 'win32') {
    if (hint === 'cmd') return { cmd: 'cmd.exe', args: [] }
    return { cmd: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
  }
  if (hint === 'bash') return { cmd: '/bin/bash', args: ['--login'] }
  if (hint === 'sh')   return { cmd: '/bin/sh',   args: [] }
  if (hint === 'zsh')  return { cmd: '/bin/zsh',  args: ['--login'] }
  return { cmd: process.env.SHELL || '/bin/bash', args: ['--login'] }
}

function handlePtyOpen(payload) {
  const { sessionId, rows = 24, cols = 80, shell: hint = 'auto' } = payload
  addLog('info', `🖥 PTY فُتح (${sessionId.slice(0, 8)})`)
  const { cmd, args } = resolveShell(hint)
  try {
    const proc = spawn(cmd, args, {
      env: { ...process.env, TERM: 'xterm-256color', COLUMNS: String(cols), LINES: String(rows), COLORTERM: 'truecolor' },
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: false
    })
    ptyProcs.set(sessionId, proc)
    send({ type: 'agent:pty_opened', payload: { sessionId }, timestamp: Date.now() })
    if (win && !win.isDestroyed()) win.webContents.send('pty-state', { active: true, sessionId })

    proc.stdout.on('data', data => {
      send({ type: 'agent:pty_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.stderr.on('data', data => {
      send({ type: 'agent:pty_data', payload: { sessionId, data: data.toString('base64') }, timestamp: Date.now() })
    })
    proc.on('close', () => {
      send({ type: 'agent:pty_closed', payload: { sessionId }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      if (win && !win.isDestroyed()) win.webContents.send('pty-state', { active: false, sessionId })
      addLog('info', `🖥 PTY أُغلق (${sessionId.slice(0, 8)})`)
    })
    proc.on('error', err => {
      send({ type: 'agent:pty_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      addLog('error', `PTY error: ${err.message}`)
    })
  } catch (e) {
    send({ type: 'agent:pty_error', payload: { sessionId, message: `فشل تشغيل Shell: ${e.message}` }, timestamp: Date.now() })
    addLog('error', `PTY spawn failed: ${e.message}`)
  }
}

function handlePtyData(payload) {
  const proc = ptyProcs.get(payload.sessionId)
  if (proc?.stdin?.writable) {
    proc.stdin.write(Buffer.from(payload.data, 'base64'))
  }
}

function handlePtyResize(payload) {
  if (process.platform !== 'win32') {
    const proc = ptyProcs.get(payload.sessionId)
    if (proc) { try { proc.kill('SIGWINCH') } catch {} }
  }
}

function handlePtyClose(payload) {
  const proc = ptyProcs.get(payload.sessionId)
  if (proc) {
    try { proc.kill() } catch {}
    ptyProcs.delete(payload.sessionId)
  }
}

function executeCommand(payload) {
  if (payload.type !== 'shell' || !payload.command) return
  const cmd = payload.command
  addLog('info', `▶ تنفيذ: ${cmd}`)
  const t0 = Date.now()
  exec(cmd, { shell: 'cmd.exe', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
    addLog(err ? 'error' : 'info', `✔ انتهى في ${Date.now() - t0}ms`)
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

async function startHeartbeat() {
  heartbeatTimer = setInterval(async () => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !deviceId) return
    try {
      const stats = await getStats()
      send({
        type: 'agent:heartbeat',
        payload: {
          deviceId, stats, tunnelLayer: 'relay', timestamp: Date.now(),
          capabilities: { pty: true, sshAvailable, fs: true }
        },
        timestamp: Date.now()
      })
      if (win && !win.isDestroyed()) win.webContents.send('stats', stats)
    } catch {}
  }, HEARTBEAT_MS)
}

function scheduleReconnect() {
  if (agentState === 'stopped') return
  addLog('info', `🔄 إعادة الاتصال خلال ${(reconnectDelay / 1000).toFixed(0)}ث...`)
  reconnectTimer = setTimeout(() => doConnect(), reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 1.5, RECONNECT_MAX)
}

function clearTimers() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null }
  if (reconnectTimer) { clearTimeout(reconnectTimer);  reconnectTimer = null }
}

function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)) } catch {}
  }
}

// ─── Tray ─────────────────────────────────────────────────────────────────
function getTrayIcon() {
  const pngPath = path.join(__dirname, 'build', 'icon.png')
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath).resize({ width: 16, height: 16 })
  const icoPath = path.join(__dirname, 'build', 'icon.ico')
  if (fs.existsSync(icoPath)) return nativeImage.createFromPath(icoPath).resize({ width: 16, height: 16 })
  return nativeImage.createEmpty()
}

function createTray() {
  tray = new Tray(getTrayIcon())
  refreshTray()
  tray.on('double-click', showWindow)
  tray.on('click', showWindow)
}

function refreshTray() {
  if (!tray) return
  const labels = {
    stopped:    'Stopped / متوقف',
    connecting: 'Connecting... / جاري الاتصال',
    connected:  `Connected — ${os.hostname()}`,
    error:      'Error / خطأ'
  }
  tray.setToolTip(`AiRemote Agent  ·  ${labels[agentState] || agentState}`)
  const menu = Menu.buildFromTemplate([
    { label: 'AiRemote Agent', enabled: false },
    { label: labels[agentState] || agentState, enabled: false },
    { type: 'separator' },
    { label: 'Open / فتح', click: showWindow },
    { type: 'separator' },
    {
      label: agentState === 'stopped' ? 'Start / تشغيل' : 'Stop / إيقاف',
      click: () => { agentState === 'stopped' ? startAgent() : stopAgent() }
    },
    { type: 'separator' },
    { label: 'Quit / إغلاق', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

// ─── Window ───────────────────────────────────────────────────────────────
function showWindow() {
  if (!win || win.isDestroyed()) createWindow()
  else { win.show(); win.focus() }
}

function saveBounds() {
  if (!win || win.isDestroyed() || win.isMaximized() || win.isMinimized()) return
  clearTimeout(boundsTimer)
  boundsTimer = setTimeout(() => {
    if (!win || win.isDestroyed()) return
    saveConfig({ _winBounds: win.getBounds() })
  }, 500)
}

function createWindow() {
  const saved = (config._winBounds && config._winBounds.width > 300) ? config._winBounds : {}
  win = new BrowserWindow({
    width:     saved.width  || 480,
    height:    saved.height || 740,
    x:         saved.x,
    y:         saved.y,
    minWidth:  440,
    minHeight: 560,
    resizable: true,
    frame:     false,
    transparent: false,
    backgroundColor: '#0f172a',
    title: 'AiRemote Agent',
    show:   false,
    center: !saved.x,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  win.on('resize', saveBounds)
  win.on('move',   saveBounds)

  win.once('ready-to-show', () => {
    if (!config.startMinimized) win.show()
    const info = getDeviceInfo()
    win.webContents.send('init', {
      config: {
        serverUrl:      config.serverUrl,
        token:          config.token,
        autoStart:      config.autoStart,
        startMinimized: config.startMinimized
      },
      ssh:       config.ssh || defaultConfig().ssh,
      logs:      logEntries,
      state:     agentState,
      deviceId,
      serverUrl: config.serverUrl,
      hostname:  info.hostname,
      ipLocal:   info.ipLocal,
      ipPublic:  cachedPublicIp,
      platform:  info.osVersion,
      arch:      info.arch
    })
    if (config.autoStart && config.serverUrl && config.token && agentState === 'stopped') {
      setTimeout(startAgent, 800)
    }
    // Try to fetch public IP
    fetchPublicIp().catch(() => {})
  })

  win.on('close', e => {
    if (!quitting) {
      e.preventDefault()
      win.hide()
      if (!tray) createTray()
    }
  })

  win.on('closed', () => { win = null })
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────
ipcMain.on('start-agent', (_, cfg) => {
  if (cfg && (cfg.serverUrl || cfg.token)) saveConfig(cfg)
  startAgent()
})
ipcMain.on('stop-agent',   () => stopAgent())
ipcMain.on('minimize-win', () => win?.minimize())
ipcMain.on('hide-win',     () => win?.hide())
ipcMain.on('close-app',    () => { quitting = true; app.quit() })

ipcMain.on('save-config', (_, cfg) => {
  saveConfig(cfg)
  addLog('info', '💾 تم حفظ الإعدادات')
})

ipcMain.on('save-ssh-config', (_, ssh) => {
  saveConfig({ ssh: { ...defaultConfig().ssh, ...ssh } })
  addLog('info', '💾 تم حفظ إعدادات SSH')
  // Notify server if connected — so it updates the SSH credentials for this device
  if (ws?.readyState === WebSocket.OPEN && deviceId) {
    send({
      type: 'agent:ssh_info',
      payload: {
        deviceId,
        sshHost:     ssh.host || getIpLocal(),
        sshPort:     ssh.port || 22,
        sshUsername: ssh.username,
        sshAuthType: ssh.authType,
        timestamp:   Date.now()
      }
    })
    addLog('info', '📡 تم إرسال بيانات SSH إلى الخادم')
  }
})

ipcMain.handle('test-ssh-port', (_, { host, port }) => {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(4000)
    sock.connect(port || 22, host, () => { sock.destroy(); resolve({ ok: true }) })
    sock.on('error',   err => { sock.destroy(); resolve({ ok: false, error: err.message }) })
    sock.on('timeout', ()  => { sock.destroy(); resolve({ ok: false, error: 'timeout'   }) })
  })
})

ipcMain.handle('get-ssh-keys',      () => loadSshKeys())
ipcMain.handle('generate-ssh-keys', () => generateSshKeyPair())

ipcMain.handle('browse-file', async () => {
  if (!win || win.isDestroyed()) return null
  const result = await dialog.showOpenDialog(win, {
    title: 'Select SSH Private Key',
    properties: ['openFile'],
    filters: [
      { name: 'SSH Keys', extensions: ['pem', 'key', 'ppk', 'rsa', 'ed25519', 'ecdsa'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: path.join(os.homedir(), '.ssh')
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('get-state', () => ({
  state:     agentState,
  deviceId,
  serverUrl: config.serverUrl,
  uptime:    sessionStart ? Math.floor((Date.now() - sessionStart) / 1000) : 0,
  config: {
    serverUrl:      config.serverUrl,
    token:          config.token,
    autoStart:      config.autoStart,
    startMinimized: config.startMinimized
  },
  logs: logEntries
}))

ipcMain.handle('get-stats-now', async () => {
  try { return await getStats() } catch { return lastStats }
})

ipcMain.handle('get-device-info', () => {
  const info = getDeviceInfo()
  return { ...info, uptime: Math.floor(os.uptime()) }
})

// ─── App Lifecycle ─────────────────────────────────────────────────────────
app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  createWindow()
  createTray()
  app.on('activate', () => { if (!win || win.isDestroyed()) createWindow() })
})

app.on('window-all-closed', () => {})

app.on('before-quit', () => {
  quitting = true
  stopAgent()
})
