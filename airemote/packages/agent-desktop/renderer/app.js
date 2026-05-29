'use strict'
/* global airemote */

// ─── Translations ─────────────────────────────────────────────────────────
const LANG = {
  ar: {
    stopped:        'متوقف',
    connecting:     'جاري الاتصال...',
    connected:      'متصل',
    error:          'خطأ في الاتصال',
    notConnected:   'الـ Agent غير متصل بأي خادم',
    checkConfig:    'تحقق من العنوان والـ Token',
    start:          'تشغيل',
    stop:           'إيقاف',
    reconnect:      'إعادة الاتصال',
    connSettings:   'إعدادات الاتصال',
    serverUrl:      'عنوان الخادم (WebSocket)',
    serverHint:     'مثال: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → Add Device',
    autoStart:      'تشغيل تلقائي عند فتح البرنامج',
    startMinimized: 'بدء مصغراً في شريط الإشعارات',
    saveSettings:   'حفظ الإعدادات',
    saved:          'تم الحفظ',
    resources:      'موارد الجهاز',
    eventLog:       'سجل الأحداث',
    clear:          'مسح',
    noEvents:       'لا توجد أحداث بعد...',
    cleared:        'تم مسح السجل...',
    device:         'الجهاز',
    localIp:        'IP المحلي',
    server:         'الخادم',
    uptime:         'وقت التشغيل',
    errNoConfig:    '⚠ أدخل عنوان الخادم والـ Token أولاً',
    errNeedWs:      '⚠ العنوان يجب أن يبدأ بـ ws:// أو wss://',
    errNeedPath:    '⚠ تأكد أن العنوان ينتهي بـ /ws  مثال: wss://server.replit.app/ws',
    titleConnecting:'جاري الاتصال...',
    titleConnected: 'متصل',
    titleError:     'خطأ',
    titleStopped:   'متوقف',
    lang:           'EN',
    uptimeFmt:      (h, m, s) => `${h ? h + 'س ' : ''}${m}د ${s}ث`,
  },
  en: {
    stopped:        'Stopped',
    connecting:     'Connecting...',
    connected:      'Connected',
    error:          'Connection Error',
    notConnected:   'Agent is not connected to any server',
    checkConfig:    'Check server URL and Token',
    start:          'Start',
    stop:           'Stop',
    reconnect:      'Reconnect',
    connSettings:   'Connection Settings',
    serverUrl:      'Server URL (WebSocket)',
    serverHint:     'Example: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → Add Device',
    autoStart:      'Auto-start when app opens',
    startMinimized: 'Start minimized to tray',
    saveSettings:   'Save Settings',
    saved:          'Saved!',
    resources:      'Device Resources',
    eventLog:       'Event Log',
    clear:          'Clear',
    noEvents:       'No events yet...',
    cleared:        'Log cleared...',
    device:         'Device',
    localIp:        'Local IP',
    server:         'Server',
    uptime:         'Uptime',
    errNoConfig:    '⚠ Enter server URL and Token first',
    errNeedWs:      '⚠ URL must start with ws:// or wss://',
    errNeedPath:    '⚠ Make sure URL ends with /ws  e.g: wss://server.replit.app/ws',
    titleConnecting:'Connecting...',
    titleConnected: 'Connected',
    titleError:     'Error',
    titleStopped:   'Stopped',
    lang:           'عربي',
    uptimeFmt:      (h, m, s) => `${h ? h + 'h ' : ''}${m}m ${s}s`,
  }
}

// ─── Language & Theme State ────────────────────────────────────────────────
let currentLang  = localStorage.getItem('lang')  || 'ar'
let currentTheme = localStorage.getItem('theme') || 'dark'

const html = document.documentElement

function applyLang(lang) {
  currentLang = lang
  localStorage.setItem('lang', lang)
  html.setAttribute('lang', lang)
  html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  $('lang-lbl').textContent = LANG[lang].lang
  // Translate all data-i18n elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (LANG[lang][key] !== undefined) el.textContent = LANG[lang][key]
  })
  // Update placeholder texts
  $('inp-server').placeholder = lang === 'ar' ? 'wss://your-server.replit.app/ws' : 'wss://your-server.replit.app/ws'
  $('inp-token').placeholder  = lang === 'ar' ? 'أدخل الـ Token الخاص بهذا الجهاز' : 'Paste device token here'
  // Re-apply current state labels
  if (currentState) applyStateLabels(currentState, lastDeviceId, lastServerUrl)
}

function applyTheme(theme) {
  currentTheme = theme
  localStorage.setItem('theme', theme)
  html.setAttribute('data-theme', theme)
  $('icon-moon').style.display = theme === 'dark'  ? ''     : 'none'
  $('icon-sun').style.display  = theme === 'light' ? ''     : 'none'
}

$('btn-lang').addEventListener('click', () => {
  applyLang(currentLang === 'ar' ? 'en' : 'ar')
})
$('btn-theme').addEventListener('click', () => {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark')
})

// ─── DOM refs ─────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }

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
let currentState   = 'stopped'
let lastDeviceId   = null
let lastServerUrl  = ''
let statsInterval  = null
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

// ─── Get current config from inputs ───────────────────────────────────────
function getInputConfig() {
  return {
    serverUrl:      inpServer.value.trim(),
    token:          inpToken.value.trim(),
    autoStart:      chkAuto.checked,
    startMinimized: chkMin.checked
  }
}

// ─── Save Config ──────────────────────────────────────────────────────────
saveBtn.addEventListener('click', () => {
  const cfg = getInputConfig()
  const t = LANG[currentLang]

  if (cfg.serverUrl && !cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError(inpServer, t.errNeedWs)
    return
  }
  if (cfg.serverUrl && !cfg.serverUrl.includes('/ws')) {
    // Warn but don't block — auto-append hint
    flashWarn(inpServer, t.errNeedPath)
  }

  airemote.saveConfig(cfg)
  updateServerDisplay(cfg.serverUrl)

  const savedLabel = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${LANG[currentLang].saved}`
  const origLabel = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> <span data-i18n="saveSettings">${LANG[currentLang].saveSettings}</span>`
  saveBtn.innerHTML = savedLabel
  saveBtn.classList.add('saved')
  setTimeout(() => { saveBtn.innerHTML = origLabel; saveBtn.classList.remove('saved') }, 2500)
})

// ─── Reconnect ────────────────────────────────────────────────────────────
reconnectBtn.addEventListener('click', () => {
  if (currentState !== 'stopped') {
    airemote.stopAgent()
    setTimeout(() => doStart(), 800)
  } else {
    doStart()
  }
})

// ─── Toggle Agent (passes current input values to main process) ───────────
toggleBtn.addEventListener('click', () => {
  if (currentState === 'stopped' || currentState === 'error') {
    doStart()
  } else if (currentState === 'connected' || currentState === 'connecting') {
    airemote.stopAgent()
  }
})

function doStart() {
  const cfg = getInputConfig()
  const t = LANG[currentLang]

  if (!cfg.serverUrl || !cfg.token) {
    flashError(!cfg.serverUrl ? inpServer : inpToken, t.errNoConfig)
    // Expand settings panel so user can see
    cfgBody.classList.remove('hidden')
    cfgToggle.classList.add('open')
    return
  }
  if (!cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError(inpServer, t.errNeedWs)
    cfgBody.classList.remove('hidden')
    cfgToggle.classList.add('open')
    return
  }
  // Pass config to main process (save + start atomically)
  airemote.startAgent(cfg)
}

// ─── Apply State ──────────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState  = state
  lastDeviceId  = deviceId
  lastServerUrl = serverUrl || lastServerUrl
  applyStateLabels(state, deviceId, serverUrl || lastServerUrl)

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

function applyStateLabels(state, deviceId, serverUrl) {
  const t = LANG[currentLang]

  statusCard.className = state
  dotWrap.className = `status-dot-wrap ${state}`
  titleDot.className = `title-dot ${state}`

  const META = {
    stopped:    { label: t.stopped,    sub: t.notConnected,  titleTxt: t.titleStopped   },
    connecting: { label: t.connecting, sub: resolveHost(serverUrl) || '—', titleTxt: t.titleConnecting },
    connected:  { label: t.connected,  sub: resolveHost(serverUrl) || '—', titleTxt: t.titleConnected  },
    error:      { label: t.error,      sub: t.checkConfig,   titleTxt: t.titleError     }
  }
  const m = META[state] || { label: '—', sub: '—', titleTxt: '—' }
  statusLabel.textContent = m.label
  statusSub.textContent   = m.sub
  titleLbl.textContent    = m.titleTxt

  // Toggle button
  toggleBtn.className = state
  if (state === 'stopped') {
    toggleBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> ${t.start}`
  } else if (state === 'connecting') {
    toggleBtn.innerHTML = `<span class="dot-pulse"><span></span><span></span><span></span></span> ${t.connecting}`
    toggleBtn.disabled  = false
  } else if (state === 'connected') {
    toggleBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> ${t.stop}`
  } else {
    toggleBtn.innerHTML = `↺ ${t.reconnect}`
    toggleBtn.className = 'stopped'
  }

  // Info strip
  infDevId.textContent = deviceId ? deviceId.slice(0, 14) + '...' : '—'
  updateServerDisplay(serverUrl)
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
  uptimeInterval = setInterval(() => { sessionSeconds++; renderUptime() }, 1000)
}
function stopUptimeCounter() {
  if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null }
  statsUptime.textContent = ''
}
function renderUptime() {
  const h = Math.floor(sessionSeconds / 3600)
  const m = Math.floor((sessionSeconds % 3600) / 60)
  const s = sessionSeconds % 60
  const t = LANG[currentLang]
  statsUptime.textContent = t.uptimeFmt(h, m, s)
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
    if (s) applyStats(s)
  } catch {}
}
function applyStats(s) {
  const danger = v => v > 85
  setBar(barCpu,  pctCpu,  s.cpuPercent,  danger(s.cpuPercent))
  setBar(barRam,  pctRam,  s.ramPercent,  danger(s.ramPercent))
  setBar(barDisk, pctDisk, s.diskPercent, danger(s.diskPercent))

  const ramUsedGb  = (s.ramUsedMb  / 1024).toFixed(1)
  const ramTotalGb = (s.ramTotalMb / 1024).toFixed(1)
  const diskParts  = s.diskTotalGb > 0 ? `${s.diskUsedGb}GB / ${s.diskTotalGb}GB` : `${s.diskPercent}%`
  statDetail.textContent = `RAM: ${ramUsedGb}/${ramTotalGb} GB  ·  Disk C: ${diskParts}`
}
function setBar(bar, lbl, val, isDanger) {
  const pct = Math.min(Math.max(val || 0, 0), 100)
  bar.style.width = `${pct}%`
  if (isDanger) bar.classList.add('danger')
  else          bar.classList.remove('danger')
  lbl.textContent = `${pct}%`
}
function resetStats() {
  ;[barCpu, barRam, barDisk].forEach(b => { b.style.width = '0%'; b.classList.remove('danger') })
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
  logBox.innerHTML = `<div class="log-empty">${LANG[currentLang].cleared}</div>`
})
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Flash helpers ─────────────────────────────────────────────────────────
function flashError(el, msg) {
  el.style.borderColor = 'var(--red)'
  el.style.boxShadow = '0 0 0 3px rgba(239,68,68,.15)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; el.title = '' }, 3000)
}
function flashWarn(el, msg) {
  el.style.borderColor = 'var(--yellow)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.title = '' }, 4000)
}

// ─── Preload bridge (pass config to start-agent) ───────────────────────────
// Override default so renderer can pass current field values
const _originalStart = airemote.startAgent
// We use IPC directly via the exposed API — the preload already handles it

// ─── Init ─────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, logs, state, deviceId, serverUrl, hostname, ipLocal, platform } = data

  inpServer.value   = config.serverUrl      || ''
  inpToken.value    = config.token          || ''
  chkAuto.checked   = config.autoStart      || false
  chkMin.checked    = config.startMinimized || false

  infHost.textContent = hostname || '—'
  infIp.textContent   = ipLocal  || '—'
  $('footer-os').textContent = platform || 'Windows'

  // Apply saved lang/theme
  applyLang(currentLang)
  applyTheme(currentTheme)

  applyState(state || 'stopped', deviceId, serverUrl, 0)

  if (logs && logs.length) logs.forEach(appendLog)
})

airemote.onState(data => {
  applyState(data.state, data.deviceId, data.serverUrl, data.uptime || 0)
})

airemote.onLog(entry => appendLog(entry))

airemote.onStats(s => { if (s) applyStats(s) })

// ─── Keyboard shortcuts ────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
  if ((e.ctrlKey || e.metaKey) && e.key === 's') saveBtn.click()
})
