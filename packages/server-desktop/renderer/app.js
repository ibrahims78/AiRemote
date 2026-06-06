'use strict'
/**
 * app.js — AiRemote Server Desktop Renderer
 * Communicates with main process via window.airemote (preload bridge)
 */

const api = window.airemote

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────
let currentPage    = 'dashboard'
let serverStatus   = { running: false, devicesOnline: 0, port: 3001, localIp: '—', localUrl: null, tunnelUrl: null, mode: 'lan' }
let logFilter      = 'all'
let allLogs        = []
let autoScroll     = true
let devicesCache   = []
let jwtVisible     = false

// ─────────────────────────────────────────────────────────────────────────────
// Navigation
// ─────────────────────────────────────────────────────────────────────────────
function navigate(page) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.page').forEach(el    => el.classList.remove('active'))
  const navEl  = document.querySelector(`[data-page="${page}"]`)
  const pageEl = document.getElementById(`page-${page}`)
  if (navEl)  navEl.classList.add('active')
  if (pageEl) pageEl.classList.add('active')
  currentPage = page

  if (page === 'devices') loadDevices()
  if (page === 'logs')    loadLogs()
  if (page === 'settings') loadSettings()
  if (page === 'backup')  loadBackupSettings()
}

document.querySelectorAll('.nav-item').forEach(el => {
  el.addEventListener('click', () => navigate(el.dataset.page))
})

// ─────────────────────────────────────────────────────────────────────────────
// Toast notifications
// ─────────────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container')
  const el = document.createElement('div')
  el.className = `toast ${type}`
  el.textContent = msg
  container.appendChild(el)
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300) }, duration)
}

// ─────────────────────────────────────────────────────────────────────────────
// Header + Stats update
// ─────────────────────────────────────────────────────────────────────────────
function updateHeader(status) {
  const dot  = document.getElementById('hdr-dot')
  const txt  = document.getElementById('hdr-status-text')
  const badge = document.getElementById('devices-badge')

  dot.className  = 'status-dot ' + (status.running ? 'online' : 'offline')
  txt.textContent = status.running
    ? `Running :${status.port} · ${status.devicesOnline} device${status.devicesOnline !== 1 ? 's' : ''}`
    : 'Stopped'

  // Nav badge
  if (status.devicesOnline > 0) {
    badge.style.display = 'inline'
    badge.textContent = status.devicesOnline
  } else {
    badge.style.display = 'none'
  }
}

function updateDashboard(status) {
  // Stats
  document.getElementById('stat-status').textContent = status.running ? 'Online' : 'Offline'
  document.getElementById('stat-status').style.color = status.running ? 'var(--green)' : 'var(--red)'
  document.getElementById('stat-port').textContent   = `Port: ${status.port}`
  document.getElementById('stat-devices').textContent = status.devicesOnline || 0
  document.getElementById('stat-ip').textContent     = status.localIp || '—'

  const tunnelOn = !!status.tunnelUrl
  document.getElementById('stat-tunnel').textContent      = tunnelOn ? 'Active' : 'OFF'
  document.getElementById('stat-tunnel').style.color      = tunnelOn ? 'var(--green)' : 'var(--text-muted)'
  document.getElementById('stat-tunnel-mode').textContent = `Mode: ${status.mode === 'cloudflare' ? 'Cloudflare' : 'LAN'}`

  // Uptime
  if (status.running && status.startedAt) {
    const up = Math.floor((Date.now() - status.startedAt) / 1000)
    document.getElementById('dash-uptime').textContent = `Uptime: ${formatDuration(up)}`
  } else {
    document.getElementById('dash-uptime').textContent = 'Server is offline'
  }

  // Buttons
  const btnStart = document.getElementById('btn-start-server')
  const btnStop  = document.getElementById('btn-stop-server')
  btnStart.style.display = status.running ? 'none' : ''
  btnStop.style.display  = status.running ? '' : 'none'

  // URLs
  const urlLan  = document.getElementById('url-lan')
  const urlCf   = document.getElementById('url-cf')
  const btnCopyLan = document.getElementById('btn-copy-lan')
  const btnCopyCf  = document.getElementById('btn-copy-cf')

  if (status.running && status.localUrl) {
    urlLan.textContent = status.localUrl
    urlLan.classList.remove('offline')
    btnCopyLan.style.display = ''
  } else {
    urlLan.textContent = 'Server offline'
    urlLan.classList.add('offline')
    btnCopyLan.style.display = 'none'
  }

  if (status.tunnelUrl) {
    urlCf.textContent = status.tunnelUrl
    urlCf.classList.remove('offline')
    btnCopyCf.style.display = ''
  } else {
    urlCf.textContent = 'Not connected'
    urlCf.classList.add('offline')
    btnCopyCf.style.display = 'none'
  }

  // Tunnel buttons
  const tunnelRunning = status.tunnelUrl || false
  document.getElementById('btn-tunnel-start').style.display = tunnelRunning ? 'none' : ''
  document.getElementById('btn-tunnel-stop').style.display  = tunnelRunning ? '' : 'none'

  // Agent connect string
  const wsUrl  = status.tunnelUrl ? status.tunnelUrl + '/ws'
    : status.localUrl  ? status.localUrl.replace('http', 'ws') + '/ws'
    : null
  const card   = document.getElementById('card-connect-str')
  card.style.display = wsUrl ? '' : 'none'
  if (wsUrl) {
    document.getElementById('url-ws-connect').textContent = wsUrl
  }
}

function formatDuration(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ─────────────────────────────────────────────────────────────────────────────
// Server status events
// ─────────────────────────────────────────────────────────────────────────────
api.on('server:status', (status) => {
  serverStatus = status
  updateHeader(status)
  if (currentPage === 'dashboard') updateDashboard(status)
})

api.on('tunnel:url', (url) => {
  serverStatus.tunnelUrl = url
  if (currentPage === 'dashboard') updateDashboard(serverStatus)
})

api.on('tunnel:stopped', () => {
  serverStatus.tunnelUrl = null
  if (currentPage === 'dashboard') updateDashboard(serverStatus)
})

api.on('device:connected', ({ deviceId, name }) => {
  toast(`🟢 ${name} connected`, 'success')
  refreshStatus()
  if (currentPage === 'devices') loadDevices()
})

api.on('device:disconnected', ({ deviceId }) => {
  const d = devicesCache.find(x => x.id === deviceId)
  toast(`⚪ ${d?.name || deviceId} disconnected`, 'info')
  refreshStatus()
  if (currentPage === 'devices') loadDevices()
})

api.on('log:entry', (entry) => {
  allLogs.push(entry)
  if (allLogs.length > 1000) allLogs = allLogs.slice(-800)
  if (currentPage === 'logs') {
    appendLogLine(entry)
    if (autoScroll) scrollLogsBottom()
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Status polling (every 5s)
// ─────────────────────────────────────────────────────────────────────────────
async function refreshStatus() {
  try {
    const s = await api.server.status()
    serverStatus = s
    updateHeader(s)
    if (currentPage === 'dashboard') updateDashboard(s)
  } catch {}
}

setInterval(refreshStatus, 5000)

// ─────────────────────────────────────────────────────────────────────────────
// Dashboard controls
// ─────────────────────────────────────────────────────────────────────────────
document.getElementById('btn-start-server').addEventListener('click', async () => {
  document.getElementById('btn-start-server').disabled = true
  document.getElementById('btn-start-server').innerHTML = '<span class="spinner"></span> Starting...'
  try {
    const s = await api.server.start()
    serverStatus = s
    updateHeader(s)
    updateDashboard(s)
    toast('Server started successfully', 'success')
  } catch (e) {
    toast('Failed to start: ' + e.message, 'error')
  }
  document.getElementById('btn-start-server').disabled = false
  document.getElementById('btn-start-server').innerHTML = '▶ Start Server'
})

document.getElementById('btn-stop-server').addEventListener('click', async () => {
  if (!confirm('Stop the server? All connected agents will be disconnected.')) return
  try {
    const s = await api.server.stop()
    serverStatus = s
    updateHeader(s)
    updateDashboard(s)
    toast('Server stopped', 'info')
  } catch (e) {
    toast('Error: ' + e.message, 'error')
  }
})

document.getElementById('btn-open-dashboard').addEventListener('click', () => {
  api.server.openDashboard()
})

document.getElementById('btn-copy-lan').addEventListener('click', () => {
  navigator.clipboard?.writeText(serverStatus.localUrl || '')
  toast('LAN URL copied', 'success')
})

document.getElementById('btn-copy-cf').addEventListener('click', () => {
  navigator.clipboard?.writeText(serverStatus.tunnelUrl || '')
  toast('Cloudflare URL copied', 'success')
})

document.getElementById('btn-copy-ws').addEventListener('click', () => {
  const wsUrl = document.getElementById('url-ws-connect').textContent
  navigator.clipboard?.writeText(wsUrl)
  toast('WS URL copied', 'success')
})

document.getElementById('btn-tunnel-start').addEventListener('click', async () => {
  await api.tunnel.start()
  toast('Starting Cloudflare Tunnel...', 'info')
})

document.getElementById('btn-tunnel-stop').addEventListener('click', async () => {
  await api.tunnel.stop()
  serverStatus.tunnelUrl = null
  updateDashboard(serverStatus)
  toast('Tunnel stopped', 'info')
})

// ─────────────────────────────────────────────────────────────────────────────
// Devices page
// ─────────────────────────────────────────────────────────────────────────────
async function loadDevices() {
  const list = document.getElementById('device-list')
  list.innerHTML = '<div class="empty-state"><span class="spinner"></span></div>'
  try {
    const devices = await api.devices.list()
    devicesCache  = devices
    renderDevices(devices)
  } catch {
    list.innerHTML = '<div class="empty-state"><div class="empty-text">Failed to load devices</div></div>'
  }
}

function renderDevices(devices) {
  const list = document.getElementById('device-list')
  if (!devices.length) {
    list.innerHTML = '<div class="empty-state"><div class="empty-icon">🖥</div><div class="empty-text">No devices registered yet</div></div>'
    return
  }
  list.innerHTML = devices.map(d => {
    const info = d.info || {}
    const meta = [
      d.isOnline ? 'Online' : `Last seen: ${d.last_seen ? new Date(d.last_seen).toLocaleString() : 'Never'}`,
      info.hostname || '',
      info.platform || '',
    ].filter(Boolean).join(' · ')

    return `<div class="device-card ${d.isOnline ? 'online' : 'offline'}" data-id="${d.id}">
      <div class="device-dot ${d.isOnline ? 'online' : 'offline'}"></div>
      <div class="device-info">
        <div class="device-name">${escHtml(d.name)}</div>
        <div class="device-meta">${escHtml(meta)}</div>
      </div>
      <div class="device-stats">
        ${d.isOnline && d.info?.stats ? `CPU ${d.info.stats.cpu || 0}%` : ''}
      </div>
      <div class="device-actions">
        <button class="btn btn-ghost btn-sm" title="Copy token" onclick="copyDeviceToken('${d.id}','${escHtml(d.token)}')">Copy Token</button>
        <button class="btn btn-danger btn-sm" onclick="deleteDevice('${d.id}')">Delete</button>
      </div>
    </div>`
  }).join('')
}

window.copyDeviceToken = (id, token) => {
  navigator.clipboard?.writeText(token)
  toast('Device token copied', 'success')
}

window.deleteDevice = async (id) => {
  if (!confirm('Delete this device? The agent will lose its registration.')) return
  try {
    const res = await fetch(`http://localhost:${serverStatus.port}/api/devices/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (window._adminToken || '') }
    })
    if (res.ok) { toast('Device deleted', 'success'); loadDevices() }
    else toast('Failed to delete device', 'error')
  } catch {
    toast('Server offline or unauthorized', 'error')
  }
}

document.getElementById('btn-refresh-devices').addEventListener('click', loadDevices)

// Add device modal
const modal = document.getElementById('modal-overlay')
document.getElementById('btn-add-device').addEventListener('click', () => {
  modal.style.display = 'flex'
  document.getElementById('modal-device-name').value = ''
  document.getElementById('modal-device-name').focus()
})
document.getElementById('btn-modal-cancel').addEventListener('click', () => { modal.style.display = 'none' })
modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none' })

document.getElementById('btn-modal-confirm').addEventListener('click', async () => {
  const name = document.getElementById('modal-device-name').value.trim()
  if (!name) { toast('Enter a device name', 'error'); return }
  try {
    const res = await fetch(`http://localhost:${serverStatus.port}/api/devices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (window._adminToken || '') },
      body: JSON.stringify({ name })
    })
    const data = await res.json()
    if (res.ok) {
      modal.style.display = 'none'
      toast(`Device created — Token: ${data.token}`, 'success', 8000)
      navigator.clipboard?.writeText(data.token)
      loadDevices()
    } else {
      toast(data.error || 'Failed to create device', 'error')
    }
  } catch {
    toast('Server offline or unauthorized', 'error')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Logs page
// ─────────────────────────────────────────────────────────────────────────────
async function loadLogs() {
  const entries = await api.logs.recent(300)
  allLogs = entries
  renderLogs()
  if (autoScroll) scrollLogsBottom()
}

function renderLogs() {
  const container = document.getElementById('log-container')
  const filtered  = logFilter === 'all' ? allLogs : allLogs.filter(e => e.level === logFilter)
  container.innerHTML = filtered.map(logLineHtml).join('')
}

function appendLogLine(entry) {
  const container = document.getElementById('log-container')
  if (logFilter !== 'all' && entry.level !== logFilter) return
  const el = document.createElement('div')
  el.innerHTML = logLineHtml(entry)
  container.appendChild(el.firstChild)
  if (container.children.length > 800) container.removeChild(container.firstChild)
}

function logLineHtml(e) {
  const ts  = e.ts ? e.ts.split(' ')[1] || e.ts : ''
  const lvl = (e.level || 'info').toUpperCase().slice(0, 5).padEnd(5)
  const tag = (e.tag || '').slice(0, 10).padEnd(10)
  return `<div class="log-line ${e.level || 'info'}">
    <span class="log-ts">${escHtml(ts)}</span>
    <span class="log-lvl">${lvl}</span>
    <span class="log-tag">${escHtml(tag)}</span>
    <span class="log-msg">${escHtml(e.msg || '')}</span>
  </div>`
}

function scrollLogsBottom() {
  const c = document.getElementById('log-container')
  c.scrollTop = c.scrollHeight
}

document.querySelectorAll('.log-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.log-filter-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    logFilter = btn.dataset.filter
    renderLogs()
    if (autoScroll) scrollLogsBottom()
  })
})

document.getElementById('chk-autoscroll').addEventListener('change', (e) => {
  autoScroll = e.target.checked
})

document.getElementById('btn-clear-logs').addEventListener('click', () => {
  allLogs = []
  document.getElementById('log-container').innerHTML = ''
})

document.getElementById('btn-export-logs').addEventListener('click', async () => {
  try {
    const folder = await api.system.pickFolder()
    if (!folder) return
    const dest = folder + '\\AiRemote-Logs-' + new Date().toISOString().slice(0,10) + '.zip'
    const res  = await api.logs.export(dest)
    if (res.ok) toast('Logs exported to: ' + dest, 'success')
    else toast('Export failed: ' + res.error, 'error')
  } catch (e) {
    toast('Export failed: ' + e.message, 'error')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Settings page
// ─────────────────────────────────────────────────────────────────────────────
async function loadSettings() {
  try {
    const s = await api.settings.get()
    document.getElementById('inp-port').value   = s.port || 3001
    document.getElementById('sel-mode').value   = s.mode || 'lan'
    document.getElementById('chk-auto-start').checked  = !!s.autoStart
    document.getElementById('chk-win-startup').checked = !!s.autoStartWin
    document.getElementById('inp-jwt').value = '••••••••••••••••••••••••' // placeholder
    window._settingsCache = s
  } catch {}
}

document.getElementById('btn-show-jwt').addEventListener('click', async () => {
  jwtVisible = !jwtVisible
  const input = document.getElementById('inp-jwt')
  if (jwtVisible) {
    const s = await api.settings.get()
    // We don't send JWT secret over IPC for security — show data dir
    input.type = 'text'
    input.value = '(see config.json in data folder)'
    document.getElementById('btn-show-jwt').textContent = 'Hide'
  } else {
    input.type  = 'password'
    input.value = '••••••••••••••••••••••••'
    document.getElementById('btn-show-jwt').textContent = 'Show'
  }
})

document.getElementById('btn-save-settings').addEventListener('click', async () => {
  const data = {
    port:         Number(document.getElementById('inp-port').value) || 3001,
    mode:         document.getElementById('sel-mode').value,
    autoStart:    document.getElementById('chk-auto-start').checked,
    autoStartWin: document.getElementById('chk-win-startup').checked,
  }
  try {
    await api.settings.set(data)
    toast('Settings saved', 'success')
    refreshStatus()
  } catch (e) {
    toast('Failed to save: ' + e.message, 'error')
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Backup page
// ─────────────────────────────────────────────────────────────────────────────
async function loadBackupSettings() {
  try {
    const s = await api.settings.get()
    document.getElementById('txt-data-dir').textContent             = s.dataDir || '—'
    document.getElementById('chk-backup-enabled').checked           = !!s.backupEnabled
    document.getElementById('inp-backup-interval').value            = s.backupInterval || 24
    document.getElementById('inp-backup-dir').value                 = s.backupDir || ''
  } catch {}
}

document.getElementById('btn-open-data-dir').addEventListener('click', async () => {
  const s = await api.settings.get()
  api.system.openFolder(s.dataDir)
})

document.getElementById('btn-pick-backup-dir').addEventListener('click', async () => {
  const folder = await api.system.pickFolder()
  if (folder) document.getElementById('inp-backup-dir').value = folder
})

document.getElementById('btn-export-backup').addEventListener('click', async () => {
  try {
    const folder = await api.system.pickFolder()
    if (!folder) return
    const dest = folder + '\\AiRemote-Backup-' + new Date().toISOString().slice(0,10) + '.zip'
    const res  = await api.backup.export(dest)
    if (res.ok) toast(`Backup saved (${res.sizeMb} MB)`, 'success')
    else toast('Backup failed: ' + res.error, 'error')
  } catch (e) {
    toast('Error: ' + e.message, 'error')
  }
})

document.getElementById('btn-import-backup').addEventListener('click', async () => {
  if (!confirm('Restore from backup? The server will restart and current data will be overwritten.')) return
  const file = await api.system.pickFile()
  if (!file) return
  toast('Restoring backup...', 'info')
  const res = await api.backup.import(file)
  if (res.ok) toast('Backup restored successfully. Server restarted.', 'success')
  else toast('Restore failed: ' + res.error, 'error')
})

document.getElementById('btn-save-backup-sched').addEventListener('click', async () => {
  const data = {
    backupEnabled:  document.getElementById('chk-backup-enabled').checked,
    backupInterval: Number(document.getElementById('inp-backup-interval').value) || 24,
    backupDir:      document.getElementById('inp-backup-dir').value,
  }
  await api.settings.set(data)
  toast('Backup schedule saved', 'success')
})

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// ─────────────────────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  const version = await api.system.version()
  document.getElementById('hdr-version').textContent = 'v' + version
  await refreshStatus()
  updateDashboard(serverStatus)
}

init()
