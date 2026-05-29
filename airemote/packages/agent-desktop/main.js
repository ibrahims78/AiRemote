'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell } = require('electron')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { exec } = require('child_process')
const WebSocket = require('ws')

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
const LOG_MAX        = 200

// ─── State ────────────────────────────────────────────────────────────────
let win            = null
let tray           = null
let ws             = null
let agentState     = 'stopped'   // stopped | connecting | connected | error
let deviceId       = null
let heartbeatTimer = null
let reconnectTimer = null
let reconnectDelay = RECONNECT_BASE
let sessionStart   = null
let config         = loadConfig()
let logEntries     = []
let quitting       = false
let lastStats      = null

// ─── Config ───────────────────────────────────────────────────────────────
function defaultConfig() {
  return { serverUrl: '', token: '', autoStart: false, startMinimized: false }
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

// ─── Logging ──────────────────────────────────────────────────────────────
function addLog(level, msg) {
  const entry = { t: new Date().toLocaleTimeString('en', { hour12: false }), level, msg }
  logEntries.push(entry)
  if (logEntries.length > LOG_MAX) logEntries.shift()
  if (win && !win.isDestroyed()) {
    win.webContents.send('log', entry)
  }
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
    ipPublic:     '',
    agentVersion: '1.0.0'
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
    networkUpKbps: 0, networkDownKbps: 0,
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
      const info  = getDeviceInfo()
      const stats = await getStats()
      send({ type: 'agent:register', payload: { token: config.token.trim(), info, stats, tunnelLayer: 'relay' }, timestamp: Date.now() })
      startHeartbeat()
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
        payload: { deviceId, stats, tunnelLayer: 'relay', timestamp: Date.now() },
        timestamp: Date.now()
      })
      // Send stats to renderer too
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

// ─── Tray Icon ────────────────────────────────────────────────────────────
function buildTrayIcon(state) {
  const colors = { connected: '#22c55e', connecting: '#f59e0b', error: '#ef4444', stopped: '#64748b' }
  const fill = colors[state] || colors.stopped
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect width="16" height="16" rx="3" fill="#0f172a"/>
    <path d="M9.5 2L4 9h3.5L6 14l6-7H8.5z" fill="${fill}"/>
  </svg>`
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  )
}

// ─── Tray ─────────────────────────────────────────────────────────────────
function createTray() {
  const icon = buildTrayIcon(agentState)
  tray = new Tray(icon)
  refreshTray()
  tray.on('double-click', showWindow)
}

function refreshTray() {
  if (!tray) return
  const labels = { stopped: 'متوقف', connecting: 'جاري الاتصال...', connected: 'متصل', error: 'خطأ' }
  tray.setToolTip(`AiRemote Agent — ${labels[agentState] || agentState}`)
  tray.setImage(buildTrayIcon(agentState))

  const statusLabel = agentState === 'connected'
    ? `● متصل — ${os.hostname()}`
    : agentState === 'connecting'
    ? '◌ جاري الاتصال...'
    : '○ متوقف'

  const menu = Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: '↑ فتح النافذة', click: showWindow },
    { type: 'separator' },
    {
      label: agentState === 'stopped' ? '▶ تشغيل Agent' : '■ إيقاف Agent',
      click: () => { agentState === 'stopped' ? startAgent() : stopAgent() }
    },
    { type: 'separator' },
    { label: '✕ إغلاق التطبيق', click: () => { quitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
}

// ─── Window ───────────────────────────────────────────────────────────────
function showWindow() {
  if (!win || win.isDestroyed()) createWindow()
  else { win.show(); win.focus() }
}

function createWindow() {
  win = new BrowserWindow({
    width:     480,
    height:    720,
    minWidth:  440,
    minHeight: 600,
    resizable: true,
    frame:     false,
    transparent: false,
    backgroundColor: '#0f172a',
    title: 'AiRemote Agent',
    show:   false,
    center: true,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      sandbox:          false
    }
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))

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
      logs:      logEntries,
      state:     agentState,
      deviceId,
      serverUrl: config.serverUrl,
      // Device info for the UI
      hostname:  info.hostname,
      ipLocal:   info.ipLocal,
      platform:  info.osVersion,
      arch:      info.arch
    })
    if (config.autoStart && config.serverUrl && config.token && agentState === 'stopped') {
      setTimeout(startAgent, 800)
    }
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
ipcMain.on('start-agent',  () => startAgent())
ipcMain.on('stop-agent',   () => stopAgent())
ipcMain.on('minimize-win', () => win?.minimize())
ipcMain.on('hide-win',     () => win?.hide())
ipcMain.on('close-app',    () => { quitting = true; app.quit() })

ipcMain.on('save-config', (_, cfg) => {
  saveConfig(cfg)
  addLog('info', '💾 تم حفظ الإعدادات')
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

app.on('window-all-closed', () => {
  // Keep running in tray on Windows
})

app.on('before-quit', () => {
  quitting = true
  stopAgent()
})
