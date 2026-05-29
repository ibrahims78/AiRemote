'use strict'
/* global airemote */

// ─── DOM refs ─────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id)

const statusCard  = $('status-card')
const dotWrap     = $('dot-wrap')
const statusLabel = $('status-label')
const statusSub   = $('status-sub')
const toggleBtn   = $('toggle-btn')

const titleDot    = $('title-dot')
const titleLbl    = $('title-state-lbl')

const inpServer   = $('inp-server')
const inpToken    = $('inp-token')
const chkAuto     = $('chk-autostart')
const chkMin      = $('chk-minimized')
const saveBtn     = $('save-btn')
const reconnectBtn = $('reconnect-btn')
const logBox      = $('log-box')

const infHost   = $('inf-host')
const infIp     = $('inf-ip')
const infServer = $('inf-server')
const infDevId  = $('inf-devid')

const barCpu  = $('bar-cpu');  const pctCpu  = $('pct-cpu')
const barRam  = $('bar-ram');  const pctRam  = $('pct-ram')
const barDisk = $('bar-disk'); const pctDisk = $('pct-disk')
const statDetail = $('stat-detail')
const statsUptime = $('stats-uptime')

// ─── State ────────────────────────────────────────────────────────────────
let currentState  = 'stopped'
let statsInterval = null
let uptimeInterval = null
let sessionSeconds = 0

// ─── Window Controls ──────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => airemote.minimizeWin())
$('btn-tray').addEventListener('click',  () => airemote.hideWin())
$('btn-close').addEventListener('click', () => airemote.hideWin())

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
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── Save Config ──────────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const url = inpServer.value.trim()
  if (url && !url.startsWith('ws://') && !url.startsWith('wss://')) {
    flashError(inpServer, 'يجب أن يبدأ العنوان بـ ws:// أو wss://')
    return
  }
  airemote.saveConfig({
    serverUrl:      url,
    token:          inpToken.value.trim(),
    autoStart:      chkAuto.checked,
    startMinimized: chkMin.checked
  })
  updateServerDisplay(url)
  saveBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> تم الحفظ`
  saveBtn.classList.add('saved')
  setTimeout(() => {
    saveBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> حفظ الإعدادات`
    saveBtn.classList.remove('saved')
  }, 2500)
})

// ─── Reconnect ────────────────────────────────────────────────────────────
reconnectBtn.addEventListener('click', () => {
  if (currentState !== 'stopped') {
    airemote.stopAgent()
    setTimeout(() => airemote.startAgent(), 800)
  } else {
    airemote.startAgent()
  }
})

// ─── Toggle Agent ─────────────────────────────────────────────────────────
toggleBtn.addEventListener('click', () => {
  if (currentState === 'stopped' || currentState === 'error') {
    airemote.startAgent()
  } else if (currentState === 'connected' || currentState === 'connecting') {
    airemote.stopAgent()
  }
})

// ─── Apply State ──────────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState = state

  // Status card classes
  statusCard.className = state
  dotWrap.className = `status-dot-wrap ${state}`

  // Titlebar
  titleDot.className = `title-dot ${state}`

  const META = {
    stopped:    { label: 'متوقف',            sub: 'الـ Agent غير متصل بأي خادم',   titleLblTxt: 'متوقف' },
    connecting: { label: 'جاري الاتصال...',  sub: resolveHost(serverUrl) || '—',   titleLblTxt: 'جاري الاتصال...' },
    connected:  { label: 'متصل',             sub: resolveHost(serverUrl) || '—',   titleLblTxt: 'متصل' },
    error:      { label: 'خطأ في الاتصال',   sub: 'تحقق من العنوان والـ Token',     titleLblTxt: 'خطأ' }
  }
  const m = META[state] || { label: '—', sub: '—', titleLblTxt: '—' }
  statusLabel.textContent = m.label
  statusSub.textContent   = m.sub
  titleLbl.textContent    = m.titleLblTxt

  // Toggle button
  toggleBtn.className = state
  if (state === 'stopped') {
    toggleBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> تشغيل`
  } else if (state === 'connecting') {
    toggleBtn.innerHTML = `<span class="dot-pulse"><span></span><span></span><span></span></span> جاري...`
    toggleBtn.disabled  = false
  } else if (state === 'connected') {
    toggleBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> إيقاف`
  } else {
    toggleBtn.innerHTML = `↺ إعادة الاتصال`
    toggleBtn.className = 'stopped'
  }

  // Info strip
  infDevId.textContent = deviceId ? deviceId.slice(0, 14) + '...' : '—'
  updateServerDisplay(serverUrl)

  // Stats polling
  if (state === 'connected' || state === 'connecting') {
    startStatsPolling()
    startUptimeCounter(uptime || 0)
  } else {
    stopStatsPolling()
    stopUptimeCounter()
    resetStats()
  }
}

function resolveHost(url) {
  if (!url) return null
  try {
    return new URL(url.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')).host
  } catch {
    return url
  }
}

function updateServerDisplay(url) {
  infServer.textContent = resolveHost(url) || '—'
}

// ─── Uptime Counter ───────────────────────────────────────────────────────
function startUptimeCounter(initial) {
  stopUptimeCounter()
  sessionSeconds = initial || 0
  renderUptime()
  uptimeInterval = setInterval(() => {
    sessionSeconds++
    renderUptime()
  }, 1000)
}

function stopUptimeCounter() {
  if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null }
  statsUptime.textContent = ''
}

function renderUptime() {
  const h = Math.floor(sessionSeconds / 3600)
  const m = Math.floor((sessionSeconds % 3600) / 60)
  const s = sessionSeconds % 60
  statsUptime.textContent = `وقت التشغيل: ${h ? h + 'س ' : ''}${m}د ${s}ث`
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
    applyStats(s)
  } catch {}
}

function applyStats(s) {
  const cpuColor  = s.cpuPercent  > 85 ? '#fb923c' : '#38bdf8'
  const ramColor  = s.ramPercent  > 85 ? '#fb923c' : '#2dd4bf'
  const diskColor = s.diskPercent > 85 ? '#fb923c' : '#c084fc'

  setBar(barCpu,  pctCpu,  s.cpuPercent,  cpuColor)
  setBar(barRam,  pctRam,  s.ramPercent,  ramColor)
  setBar(barDisk, pctDisk, s.diskPercent, diskColor)

  const ramUsedGb  = (s.ramUsedMb  / 1024).toFixed(1)
  const ramTotalGb = (s.ramTotalMb / 1024).toFixed(1)
  const diskParts  = (s.diskTotalGb > 0)
    ? `${s.diskUsedGb}GB / ${s.diskTotalGb}GB`
    : `${s.diskPercent}%`

  statDetail.textContent = `RAM: ${ramUsedGb}/${ramTotalGb} GB  ·  Disk C: ${diskParts}`
}

function setBar(bar, lbl, val, color) {
  const pct = Math.min(Math.max(val || 0, 0), 100)
  bar.style.width      = `${pct}%`
  bar.style.background = color
  lbl.textContent      = `${pct}%`
}

function resetStats() {
  ;[barCpu, barRam, barDisk].forEach(b => { b.style.width = '0%' })
  pctCpu.textContent = pctRam.textContent = pctDisk.textContent = '—%'
  statDetail.textContent = '—'
}

// ─── Logging ──────────────────────────────────────────────────────────────
function appendLog(entry) {
  const empty = logBox.querySelector('.log-empty')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'log-entry'
  el.innerHTML = `<span class="log-t">${escHtml(entry.t)}</span><span class="log-msg ${entry.level || ''}">${escHtml(entry.msg)}</span>`
  logBox.appendChild(el)
  while (logBox.children.length > 100) logBox.removeChild(logBox.firstChild)
  logBox.scrollTop = logBox.scrollHeight
}

$('clear-log').addEventListener('click', () => {
  logBox.innerHTML = '<div class="log-empty">تم مسح السجل...</div>'
})

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── Input validation flash ────────────────────────────────────────────────
function flashError(el, msg) {
  el.style.borderColor = 'var(--red)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.title = '' }, 3000)
}

// ─── Init ─────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, logs, state, deviceId, serverUrl, hostname, ipLocal, platform } = data

  inpServer.value   = config.serverUrl    || ''
  inpToken.value    = config.token        || ''
  chkAuto.checked   = config.autoStart    || false
  chkMin.checked    = config.startMinimized || false

  infHost.textContent = hostname || '—'
  infIp.textContent   = ipLocal  || '—'
  $('footer-os').textContent = platform || 'Windows'

  applyState(state || 'stopped', deviceId, serverUrl, 0)

  if (logs && logs.length) logs.forEach(appendLog)
})

// ─── State updates ─────────────────────────────────────────────────────────
airemote.onState(data => {
  applyState(data.state, data.deviceId, data.serverUrl, data.uptime || 0)
})

// ─── Log updates ──────────────────────────────────────────────────────────
airemote.onLog(entry => {
  appendLog(entry)
})

// ─── Live stats from heartbeat ────────────────────────────────────────────
airemote.onStats(s => {
  if (s) applyStats(s)
})

// ─── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
  if ((e.ctrlKey || e.metaKey) && e.key === 's') saveBtn.click()
})
