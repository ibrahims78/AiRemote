'use strict'
/* global airemote */

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)
const statusCard  = $('status-card')
const dotWrap     = $('dot-wrap')
const statusLabel = $('status-label')
const statusSub   = $('status-sub')
const toggleBtn   = $('toggle-btn')
const inpServer   = $('inp-server')
const inpToken    = $('inp-token')
const chkAuto     = $('chk-autostart')
const chkMin      = $('chk-minimized')
const saveBtn     = $('save-btn')
const logBox      = $('log-box')

const infState    = $('inf-state')
const infDevId    = $('inf-devid')
const infServer   = $('inf-server')
const infHost     = $('inf-host')

const barCpu  = $('bar-cpu');  const pctCpu  = $('pct-cpu')
const barRam  = $('bar-ram');  const pctRam  = $('pct-ram')
const barDisk = $('bar-disk'); const pctDisk = $('pct-disk')

// ─── State ────────────────────────────────────────────────────────────────
let currentState  = 'stopped'
let statsInterval = null

// ─── Window Controls ──────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => airemote.minimizeWin())
$('btn-tray').addEventListener('click',  () => airemote.hideWin())
$('btn-close').addEventListener('click', () => {
  airemote.hideWin()   // minimize to tray on X, use tray menu to quit
})

// ─── Collapse ─────────────────────────────────────────────────────────────
const cfgToggle = $('cfg-toggle')
const cfgBody   = $('cfg-body')
cfgToggle.addEventListener('click', () => {
  const open = !cfgBody.classList.contains('hidden')
  if (open) { cfgBody.classList.add('hidden');    cfgToggle.classList.remove('open') }
  else      { cfgBody.classList.remove('hidden'); cfgToggle.classList.add('open')    }
})

// ─── Token Visibility ─────────────────────────────────────────────────────
let tokenVisible = false
$('btn-show-token').addEventListener('click', () => {
  tokenVisible = !tokenVisible
  inpToken.type = tokenVisible ? 'text' : 'password'
  $('eye-icon').innerHTML = tokenVisible
    ? '<line x1="1" y1="1" x2="23" y2="23"/><path d="M10.5 10.5a3 3 0 0 0 4 4"/><path d="M9.88 9.88a3 3 0 0 1 4.24 4.24"/><path d="M1 12s4-8 11-8c1.94 0 3.73.5 5.27 1.36"/><path d="M22.81 9.02C23.25 10 23.5 11 23 12c-1 5-5 8-11 8"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── Save ─────────────────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  airemote.saveConfig({
    serverUrl:     inpServer.value.trim(),
    token:         inpToken.value.trim(),
    autoStart:     chkAuto.checked,
    startMinimized: chkMin.checked
  })
  saveBtn.textContent = '✓ تم الحفظ'
  saveBtn.classList.add('saved')
  setTimeout(() => {
    saveBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ الإعدادات'
    saveBtn.classList.remove('saved')
  }, 2200)
})

// ─── Toggle Agent ─────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  if (currentState === 'stopped')  airemote.startAgent()
  else if (currentState === 'connected' || currentState === 'error') airemote.stopAgent()
})

// ─── Apply State ──────────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl) {
  currentState = state

  // Status card
  statusCard.className = state
  dotWrap.className    = `status-dot-wrap ${state}`

  const labels = {
    stopped:    ['متوقف',            '—'],
    connecting: ['جاري الاتصال...', serverUrl || '—'],
    connected:  ['متصل',             serverUrl || '—'],
    error:      ['خطأ في الاتصال',   serverUrl || '—']
  }
  const [lbl, sub] = labels[state] || ['—', '—']
  statusLabel.textContent = lbl
  statusSub.textContent   = sub

  // Toggle button
  toggleBtn.className = state
  if (state === 'stopped') {
    toggleBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> تشغيل'
  } else if (state === 'connecting') {
    toggleBtn.innerHTML = '<span class="dot-pulse"><span></span><span></span><span></span></span>'
  } else if (state === 'connected') {
    toggleBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> إيقاف'
  } else {
    toggleBtn.innerHTML = '↺ إعادة'
    toggleBtn.className = 'stopped'
  }

  // Info panel
  infState.textContent  = lbl
  infDevId.textContent  = deviceId ? deviceId.slice(0, 16) + '...' : '—'
  infServer.textContent = serverUrl ? new URL(serverUrl.replace('ws://', 'http://').replace('wss://', 'https://')).host : '—'
  infHost.textContent   = location.hostname || '—'

  // Start/stop stats polling
  if (state === 'connected' || state === 'connecting') {
    startStatsPolling()
  } else {
    stopStatsPolling()
    resetStats()
  }
}

// ─── Stats Polling ────────────────────────────────────────────────────────
function startStatsPolling() {
  if (statsInterval) return
  pollStats()
  statsInterval = setInterval(pollStats, 8000)
}

function stopStatsPolling() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
}

async function pollStats() {
  try {
    const s = await airemote.getStatsNow()
    if (!s) return
    setBar(barCpu,  pctCpu,  s.cpuPercent,  '#38bdf8')
    setBar(barRam,  pctRam,  s.ramPercent,  '#2dd4bf')
    setBar(barDisk, pctDisk, s.diskPercent, s.diskPercent > 85 ? '#fb923c' : '#c084fc')
    if (s.ramUsedMb && s.ramTotalMb) {
      pctRam.textContent = `${s.ramPercent}%`
    }
  } catch {}
}

function setBar(bar, lbl, val, color) {
  const pct = Math.min(Math.max(val, 0), 100)
  bar.style.width = `${pct}%`
  bar.style.background = color
  lbl.textContent = `${pct}%`
}

function resetStats() {
  [barCpu, barRam, barDisk].forEach(b => { b.style.width = '0%' })
  pctCpu.textContent = pctRam.textContent = pctDisk.textContent = '—%'
}

// ─── Logging ──────────────────────────────────────────────────────────────
function appendLog(entry) {
  const empty = logBox.querySelector('.log-empty')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'log-entry'
  el.innerHTML = `<span class="log-t">${entry.t}</span><span class="log-msg ${entry.level || ''}">${escHtml(entry.msg)}</span>`
  logBox.appendChild(el)

  // Keep max 80 entries visible
  while (logBox.children.length > 80) logBox.removeChild(logBox.firstChild)
  logBox.scrollTop = logBox.scrollHeight
}

$('clear-log').addEventListener('click', () => {
  logBox.innerHTML = '<div class="log-empty">تم مسح السجل...</div>'
})

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ─── Try resolve server info ───────────────────────────────────────────────
function tryResolveHost(serverUrl) {
  try {
    const url = new URL(serverUrl.replace('ws://', 'http://').replace('wss://', 'https://'))
    infServer.textContent = url.host
  } catch { infServer.textContent = serverUrl || '—' }
}

// ─── Init from main ────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, logs, state, deviceId, serverUrl } = data

  // Fill form
  inpServer.value   = config.serverUrl    || ''
  inpToken.value    = config.token        || ''
  chkAuto.checked   = config.autoStart    || false
  chkMin.checked    = config.startMinimized || false

  // Apply state
  applyState(state || 'stopped', deviceId, config.serverUrl)

  // Show logs
  if (logs && logs.length) {
    logs.forEach(appendLog)
  }

  // Host info
  infHost.textContent = navigator.platform || '—'
  tryResolveHost(config.serverUrl)
})

// ─── State updates ─────────────────────────────────────────────────────────
airemote.onState(data => {
  applyState(data.state, data.deviceId, data.serverUrl)
})

// ─── Log updates ──────────────────────────────────────────────────────────
airemote.onLog(entry => {
  appendLog(entry)
})

// ─── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
})
