'use strict'

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, shell, dialog, screen, clipboard } = require('electron')
const path   = require('path')
const os     = require('os')
const fs     = require('fs')
const https  = require('https')
const crypto = require('crypto')
const { exec, spawn } = require('child_process')
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
const LOG_MAX        = 300
const AGENT_VERSION  = '2.0.0'

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

/** @type {Map<string, import('child_process').ChildProcess>} */
const ptyProcs = new Map()

// ─── Screen Capture State ──────────────────────────────────────────────────
let capWin         = null
let screenSessions = new Map()   // sessionId → { fps, quality }
let psInputProc    = null
let psInputReady   = false

// ─── Config ───────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    serverUrl: '', token: '', autoStart: false, startMinimized: false,
    _winBounds: null
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

// ─── Network Stats ────────────────────────────────────────────────────────
let lastNetBytes = { rx: 0, tx: 0, time: Date.now() }
let netInit = false

function readRawNetBytes() {
  return new Promise(resolve => {
    // Try netstat -e first (fast, works on English Windows)
    exec('netstat -e', { timeout: 3000 }, (err, out) => {
      if (!err && out) {
        const line = out.split('\n').find(l => /^\s*bytes\s+\d/i.test(l))
        if (line) {
          const p = line.trim().split(/\s+/)
          const rx = parseInt(p[1]) || 0
          const tx = parseInt(p[2]) || 0
          if (rx > 0 || tx > 0) return resolve({ rx, tx })
        }
      }
      // Fallback: PowerShell WMI (locale-independent)
      const ps = `$a=Get-CimInstance Win32_PerfRawData_Tcpip_NetworkInterface;$a|ForEach-Object{$_.BytesReceivedPersec,$_.BytesSentPersec}`
      exec(`powershell -NoProfile -Command "${ps}"`, { timeout: 5000 }, (err2, out2) => {
        if (!err2 && out2) {
          const nums = out2.trim().split(/\s+/).map(n => parseInt(n) || 0)
          let rx = 0, tx = 0
          for (let i = 0; i + 1 < nums.length; i += 2) { rx += nums[i]; tx += nums[i + 1] }
          if (rx > 0 || tx > 0) return resolve({ rx, tx })
        }
        resolve({ rx: 0, tx: 0 })
      })
    })
  })
}

async function computeNetKbps() {
  const now = Date.now()
  const bytes = await readRawNetBytes()
  if (!netInit) {
    netInit = true
    lastNetBytes = { rx: bytes.rx, tx: bytes.tx, time: now }
    return { downKbps: 0, upKbps: 0 }
  }
  const elapsed = (now - lastNetBytes.time) / 1000
  let downKbps = 0, upKbps = 0
  if (elapsed > 0 && bytes.rx >= lastNetBytes.rx && bytes.tx >= lastNetBytes.tx) {
    downKbps = Math.round((bytes.rx - lastNetBytes.rx) / elapsed / 1024 * 100) / 100
    upKbps   = Math.round((bytes.tx - lastNetBytes.tx) / elapsed / 1024 * 100) / 100
  }
  lastNetBytes = { rx: bytes.rx, tx: bytes.tx, time: now }
  return { downKbps: Math.max(0, downKbps), upKbps: Math.max(0, upKbps) }
}

async function getStats() {
  const cpuPercent = await getCpuPercent()
  const total = os.totalmem(), free = os.freemem()
  const ramTotalMb  = Math.round(total / 1048576)
  const ramUsedMb   = Math.round((total - free) / 1048576)
  const ramPercent  = Math.round(ramUsedMb / ramTotalMb * 100)
  const disk        = await getDiskPercent()
  const net         = await computeNetKbps()
  const stats = {
    cpuPercent, ramPercent, ramUsedMb, ramTotalMb,
    diskPercent: disk.pct, diskUsedGb: disk.usedGb, diskTotalGb: disk.totalGb,
    networkUpKbps: net.upKbps, networkDownKbps: net.downKbps,
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
  screenSessions.clear()
  destroyCaptureWindow()
  if (psInputProc) { try { psInputProc.kill() } catch {} psInputProc = null; psInputReady = false }
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
      const info  = getDeviceInfo()
      const stats = await getStats()
      const shell = process.platform === 'win32' ? 'powershell' : (process.env.SHELL || '/bin/bash')
      send({
        type: 'agent:register',
        payload: {
          token:        config.token.trim(),
          info,
          stats,
          tunnelLayer:  'relay',
          capabilities: {
            pty: true, shell, fs: true,
            screenControl: true, clipboard: true, multiMonitor: true
          }
        },
        timestamp: Date.now()
      })
      startHeartbeat()
      addLog('info', `🖥 PTY Shell: مفعّل | v${AGENT_VERSION} | Screen: مفعّل`)
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

    // ── Screen Capture ─────────────────────────────────────────────────────
    case 'server:screen_start':
      handleScreenStart(msg.payload)
      break
    case 'server:screen_stop':
      handleScreenStop(msg.payload)
      break
    case 'server:screen_mouse':
      injectMouse(msg.payload)
      break
    case 'server:screen_key':
      injectKey(msg.payload)
      break
    case 'server:screen_clipboard_read': {
      const clipText = clipboard.readText()
      send({ type: 'agent:screen_clipboard', payload: { sessionId: msg.payload?.sessionId, text: clipText }, timestamp: Date.now() })
      break
    }
    case 'server:screen_clipboard_write':
      if (msg.payload?.text != null) clipboard.writeText(String(msg.payload.text))
      break
    case 'server:screen_get_monitors':
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('get-monitors', { sessionId: msg.payload?.sessionId })
      break
    case 'server:screen_set_monitor':
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('set-monitor', msg.payload)
      break
    case 'server:screen_set_quality':
      if (capWin && !capWin.isDestroyed()) capWin.webContents.send('set-quality', msg.payload)
      break
    case 'server:screen_control_request': {
      const { sessionId: scSid, requestId, requesterName } = msg.payload || {}
      const parentWin = (win && !win.isDestroyed()) ? win : null
      dialog.showMessageBox(parentWin, {
        type:      'question',
        buttons:   ['السماح / Allow', 'رفض / Deny'],
        defaultId: 1,
        title:     'طلب التحكم / Remote Control Request',
        message:   `${requesterName || 'شخص ما'} يطلب التحكم في شاشتك`,
        detail:    'هل تسمح بالتحكم الكامل بالفأرة ولوحة المفاتيح؟\nAllow full mouse & keyboard control?'
      }).then(({ response }) => {
        const type = response === 0 ? 'agent:screen_control_granted' : 'agent:screen_control_denied'
        send({ type, payload: { sessionId: scSid, requestId }, timestamp: Date.now() })
        addLog('info', response === 0 ? '✅ منحت إذن التحكم' : '❌ رفضت طلب التحكم')
      }).catch(() => {
        send({ type: 'agent:screen_control_denied', payload: { sessionId: scSid, requestId }, timestamp: Date.now() })
      })
      break
    }
    case 'server:screen_privacy':
      break
  }
}

// ─── File System (proxy FS) ────────────────────────────────────────────────
const fsPromises = require('fs').promises

function toOsPath(p) {
  if (process.platform !== 'win32') return p
  // Already a Windows drive path like "D:/path" or "D:\path" — normalise slashes
  if (/^[A-Za-z]:/.test(p)) return p.replace(/\//g, '\\')
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
        // Always add a leading "/" so paths are uniform: /D:/folder/file
        const toWebPath = (osFullPath) => {
          if (process.platform !== 'win32') return osFullPath
          const web = osFullPath.replace(/\\/g, '/')
          return web.startsWith('/') ? web : '/' + web
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

// ─── PTY (Direct Shell) ───────────────────────────────────────────────────
// Windows software-PTY: buffer chars per session, echo locally, send lines to shell
/** @type {Map<string, {buf: string, tmpScript: string|null}>} */
const winPtyBufs = new Map()

// PowerShell wrapper: reads stdin line-by-line, shows CWD prompt, executes commands
const WIN_PS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::InputEncoding  = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'Continue'
function Show-Prompt { [Console]::Write("PS " + (Get-Location).Path + "> ") }
Show-Prompt
while ($true) {
  $line = [Console]::ReadLine()
  if ($null -eq $line) { break }
  $line = $line.Trim()
  if ($line -eq "exit" -or $line -eq "quit") { break }
  if ($line.Length -gt 0) {
    try { Invoke-Expression $line 2>&1 | ForEach-Object { [Console]::WriteLine([string]$_) } }
    catch { [Console]::WriteLine("Error: " + $_.Exception.Message) }
  }
  Show-Prompt
}
`.trim()

const WIN_CMD_WRAPPER = `@echo off
setlocal enabledelayedexpansion
:loop
set /p "cmd=> "
if "!cmd!"=="exit" goto end
if "!cmd!"=="quit" goto end
if not "!cmd!"=="" (
  cmd /c !cmd! 2>&1
)
goto loop
:end
`.trim()

function handlePtyOpen(payload) {
  const { sessionId, rows = 24, cols = 80, shell: hint = 'auto' } = payload
  addLog('info', `🖥 PTY فُتح (${sessionId.slice(0, 8)})`)

  let cmd, args, tmpScript = null

  if (process.platform === 'win32') {
    const useCmdShell = (hint === 'cmd')
    if (useCmdShell) {
      tmpScript = path.join(os.tmpdir(), `airemote-pty-${sessionId}.bat`)
      fs.writeFileSync(tmpScript, WIN_CMD_WRAPPER, 'utf8')
      cmd = 'cmd.exe'
      args = ['/Q', '/C', tmpScript]
    } else {
      tmpScript = path.join(os.tmpdir(), `airemote-pty-${sessionId}.ps1`)
      fs.writeFileSync(tmpScript, WIN_PS_SCRIPT, 'utf8')
      cmd = 'powershell.exe'
      args = ['-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmpScript]
    }
    winPtyBufs.set(sessionId, { buf: '', tmpScript })
  } else if (process.platform === 'linux') {
    cmd = '/bin/bash'
    args = []
    // Use `script` to allocate a real PTY so line discipline works
    try {
      const inner = `${process.env.SHELL || '/bin/bash'} --login`
      cmd = 'script'
      args = ['-q', '-c', inner, '/dev/null']
    } catch {}
  } else if (process.platform === 'darwin') {
    cmd = 'script'
    args = ['-q', '/dev/null', process.env.SHELL || '/bin/bash', '--login']
  } else {
    cmd = process.env.SHELL || '/bin/bash'
    args = ['--login']
  }

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
      _cleanWinBuf(sessionId)
      if (win && !win.isDestroyed()) win.webContents.send('pty-state', { active: false, sessionId })
      addLog('info', `🖥 PTY أُغلق (${sessionId.slice(0, 8)})`)
    })
    proc.on('error', err => {
      send({ type: 'agent:pty_error', payload: { sessionId, message: err.message }, timestamp: Date.now() })
      ptyProcs.delete(sessionId)
      _cleanWinBuf(sessionId)
      addLog('error', `PTY error: ${err.message}`)
    })
  } catch (e) {
    _cleanWinBuf(sessionId)
    send({ type: 'agent:pty_error', payload: { sessionId, message: `فشل تشغيل Shell: ${e.message}` }, timestamp: Date.now() })
    addLog('error', `PTY spawn failed: ${e.message}`)
  }
}

function _cleanWinBuf(sessionId) {
  const state = winPtyBufs.get(sessionId)
  if (state?.tmpScript) { try { fs.unlinkSync(state.tmpScript) } catch {} }
  winPtyBufs.delete(sessionId)
}

function _sendPtyData(sessionId, str) {
  send({ type: 'agent:pty_data', payload: { sessionId, data: Buffer.from(str).toString('base64') }, timestamp: Date.now() })
}

function handlePtyData(payload) {
  const proc = ptyProcs.get(payload.sessionId)
  if (!proc?.stdin?.writable) return

  if (process.platform === 'win32') {
    // Software PTY: echo chars locally, buffer until Enter, then send full line
    const state = winPtyBufs.get(payload.sessionId)
    if (!state) return
    const raw = Buffer.from(payload.data, 'base64').toString('binary')
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i]
      const code = ch.charCodeAt(0)
      if (ch === '\r' || ch === '\n') {
        // Echo CRLF then send buffered line to shell
        _sendPtyData(payload.sessionId, '\r\n')
        proc.stdin.write(state.buf + '\n', 'utf8')
        state.buf = ''
      } else if (code === 0x7f || code === 0x08) {
        // Backspace: erase last char locally
        if (state.buf.length > 0) {
          state.buf = state.buf.slice(0, -1)
          _sendPtyData(payload.sessionId, '\x08 \x08')
        }
      } else if (code === 0x03) {
        // Ctrl+C: clear buffer + send newline
        state.buf = ''
        _sendPtyData(payload.sessionId, '^C\r\n')
        proc.stdin.write('\x03', 'binary')
      } else if (code >= 0x20) {
        // Printable: echo + buffer
        const char = Buffer.from([code]).toString('utf8')
        state.buf += char
        _sendPtyData(payload.sessionId, char)
      }
    }
    return
  }

  // Linux/macOS: pass through directly (script handles echo/line discipline)
  proc.stdin.write(Buffer.from(payload.data, 'base64'))
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
  _cleanWinBuf(payload.sessionId)
}

// ─── Screen Capture (Electron desktopCapturer) ─────────────────────────────

function createCaptureWindow() {
  if (capWin && !capWin.isDestroyed()) return capWin
  capWin = new BrowserWindow({
    show:   false,
    width:  200,
    height: 200,
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
      offscreen:        false
    }
  })
  capWin.loadFile(path.join(__dirname, 'renderer', 'capture.html'))
  capWin.on('closed', () => { capWin = null })
  return capWin
}

function destroyCaptureWindow() {
  if (capWin && !capWin.isDestroyed()) { try { capWin.destroy() } catch {} capWin = null }
  screenSessions.clear()
}

function handleScreenStart(payload) {
  const { sessionId, fps, quality, monitorId } = payload
  addLog('info', `🖥️ Screen: بدء البث (${sessionId.slice(0, 8)})`)
  screenSessions.set(sessionId, { fps, quality })
  const cw     = createCaptureWindow()
  const doSend = () => cw.webContents.send('start-capture', { sessionId, fps, quality, monitorIndex: monitorId || 0 })
  if (cw.webContents.isLoading()) cw.webContents.once('did-finish-load', doSend)
  else doSend()
  if (process.platform === 'win32') ensurePsInput()
}

function handleScreenStop(payload) {
  const { sessionId } = payload
  addLog('info', `🖥️ Screen: إيقاف (${sessionId.slice(0, 8)})`)
  screenSessions.delete(sessionId)
  if (capWin && !capWin.isDestroyed()) capWin.webContents.send('stop-capture', { sessionId })
  send({ type: 'agent:screen_closed', payload: { sessionId }, timestamp: Date.now() })
  if (screenSessions.size === 0) destroyCaptureWindow()
}

// ─── Persistent PowerShell process for mouse/keyboard injection ────────────
function ensurePsInput() {
  if (process.platform !== 'win32') return
  if (psInputProc && !psInputProc.killed) return
  psInputReady = false
  psInputProc  = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-NoLogo', '-Command', '-'], {
    stdio:       ['pipe', 'pipe', 'pipe'],
    windowsHide: true
  })
  const init = `
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public class WinUI{
  [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")]public static extern void mouse_event(uint f,int x,int y,int d,IntPtr e);
  [DllImport("user32.dll")]public static extern void keybd_event(byte vk,byte sc,uint f,IntPtr e);
  public const uint LD=2,LU=4,RD=8,RU=16,MD=32,MU=64,WH=2048,KU=2;
}
'@ -Language CSharp
Add-Type -AssemblyName System.Windows.Forms
Write-Host 'PSINPUT_READY'
`
  psInputProc.stdin.write(init + '\n')
  psInputProc.stdout.on('data', d => { if (d.toString().includes('PSINPUT_READY')) psInputReady = true })
  psInputProc.stderr.on('data', () => {})
  psInputProc.on('exit', () => { psInputProc = null; psInputReady = false })
}

function sendPsCmd(cmd) {
  if (process.platform !== 'win32') return
  ensurePsInput()
  if (psInputProc && !psInputProc.killed && psInputReady) {
    try { psInputProc.stdin.write(cmd + '\n') } catch {}
    return
  }
  const deadline = Date.now() + 5000
  const poll = setInterval(() => {
    if (psInputReady && psInputProc && !psInputProc.killed) {
      clearInterval(poll); try { psInputProc.stdin.write(cmd + '\n') } catch {}
    } else if (Date.now() > deadline) clearInterval(poll)
  }, 80)
}

// ─── Mouse injection ────────────────────────────────────────────────────────
function injectMouse(payload) {
  if (process.platform !== 'win32') return
  const { x, y, type, button, delta } = payload
  const xi = Math.round(x || 0), yi = Math.round(y || 0)

  if (type === 'move') {
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi})`)
  } else if (type === 'down' || type === 'up') {
    const btn  = button === 'right' ? 'R' : button === 'middle' ? 'M' : 'L'
    const dir  = type === 'down' ? 'D' : 'U'
    const flag = `[WinUI]::${btn}${dir}`
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event(${flag},0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'dblclick') {
    sendPsCmd(`[WinUI]::SetCursorPos(${xi},${yi});[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LD,0,0,0,[IntPtr]::Zero);[WinUI]::mouse_event([WinUI]::LU,0,0,0,[IntPtr]::Zero)`)
  } else if (type === 'wheel' || type === 'scroll') {
    const wd = Math.round((delta || 0) * -120)
    sendPsCmd(`[WinUI]::mouse_event([WinUI]::WH,0,0,${wd},[IntPtr]::Zero)`)
  }
}

// ─── Key injection ──────────────────────────────────────────────────────────
const KEY_TO_SENDKEYS = {
  Enter: '{ENTER}', Backspace: '{BACKSPACE}', Delete: '{DELETE}', Tab: '{TAB}', Escape: '{ESC}',
  ' ': ' ', ArrowUp: '{UP}', ArrowDown: '{DOWN}', ArrowLeft: '{LEFT}', ArrowRight: '{RIGHT}',
  Home: '{HOME}', End: '{END}', PageUp: '{PGUP}', PageDown: '{PGDN}', Insert: '{INSERT}',
  F1: '{F1}', F2: '{F2}', F3: '{F3}', F4: '{F4}', F5: '{F5}', F6: '{F6}',
  F7: '{F7}', F8: '{F8}', F9: '{F9}', F10: '{F10}', F11: '{F11}', F12: '{F12}',
  '+': '{+}', '^': '{^}', '%': '{%}', '~': '{~}',
  '(': '{(}', ')': '{)}', '{': '{{}', '}': '{}}', '[': '{[}', ']': '{]}'
}

function injectKey(payload) {
  if (process.platform !== 'win32') return
  if (payload.type !== 'down') return
  const { key, modifiers } = payload
  let sk = KEY_TO_SENDKEYS[key] ?? (key && key.length === 1 ? key : null)
  if (!sk) return

  let prefix = ''
  if (modifiers?.ctrl)  prefix += '^'
  if (modifiers?.alt)   prefix += '%'
  if (modifiers?.shift) prefix += '+'

  const sendStr = prefix ? `${prefix}(${sk})` : sk
  sendPsCmd(`[System.Windows.Forms.SendKeys]::SendWait('${sendStr.replace(/'/g, "''")}')`)
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
          capabilities: { pty: true, fs: true, screenControl: true, clipboard: true, multiMonitor: true }
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

// ── Capture Window IPC ─────────────────────────────────────────────────────
ipcMain.on('screen-frame', (_, p) => {
  if (ws?.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type: 'agent:screen_frame', payload: p, timestamp: Date.now() })) } catch {}
  }
})

ipcMain.on('screen-error', (_, p) => {
  addLog('warn', `🖥️ Screen error: ${p.message}`)
  send({ type: 'agent:screen_error', payload: p, timestamp: Date.now() })
  screenSessions.delete(p.sessionId)
  if (screenSessions.size === 0) destroyCaptureWindow()
})

ipcMain.on('screen-monitors', (_, p) => {
  send({ type: 'agent:screen_monitors', payload: p, timestamp: Date.now() })
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
