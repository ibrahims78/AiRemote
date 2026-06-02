'use strict'
/* global airemote */

// ─── Translations ──────────────────────────────────────────────────────────
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
    tabConn:        'الاتصال',
    serverUrl:      'عنوان الخادم (WebSocket)',
    serverHint:     'مثال: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → نسخ Token',
    autoStart:      'تشغيل تلقائي عند فتح البرنامج',
    startMinimized: 'بدء مصغراً في شريط الإشعارات',
    saveSettings:   'حفظ الإعدادات',
    saved:          'تم الحفظ ✓',
    resources:      'موارد الجهاز',
    eventLog:       'سجل الأحداث',
    clear:          'مسح',
    noEvents:       'لا توجد أحداث بعد...',
    cleared:        'تم مسح السجل...',
    device:         'الجهاز',
    localIp:        'IP المحلي',
    publicIp:       'IP الإنترنت',
    server:         'الخادم',
    connServer:     'الخادم',
    sessionTime:    'وقت الجلسة',
    active:         'نشط',
    errNoConfig:    '⚠ أدخل عنوان الخادم والـ Token أولاً',
    errNeedWs:      '⚠ العنوان يجب أن يبدأ بـ ws:// أو wss://',
    titleConnecting: 'جاري الاتصال...',
    titleConnected:  'متصل',
    titleError:      'خطأ',
    titleStopped:    'متوقف',
    lang:            'EN',
    uptimeFmt:       (h, m, s) => `${h ? h + 'س ' : ''}${m}د ${s}ث`,
    copied:          'تم النسخ',
    logCopied:       'تم نسخ السجل',
    logExported:     'تم تصدير السجل',
    deviceInfo:      'معلومات الجهاز',
    settingsTitle:   'الإعدادات',
    connectedToast:  'تم الاتصال بالخادم',
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
    tabConn:        'Connection',
    serverUrl:      'Server URL (WebSocket)',
    serverHint:     'Example: wss://myserver.replit.app/ws',
    deviceToken:    'Device Token',
    tokenHint:      'Dashboard → Devices → Copy Token',
    autoStart:      'Auto-start when app opens',
    startMinimized: 'Start minimized to tray',
    saveSettings:   'Save Settings',
    saved:          'Saved ✓',
    resources:      'Device Resources',
    eventLog:       'Event Log',
    clear:          'Clear',
    noEvents:       'No events yet...',
    cleared:        'Log cleared...',
    device:         'Device',
    localIp:        'Local IP',
    publicIp:       'Public IP',
    server:         'Server',
    connServer:     'Server',
    sessionTime:    'Session',
    active:         'Active',
    errNoConfig:    '⚠ Enter server URL and Token first',
    errNeedWs:      '⚠ URL must start with ws:// or wss://',
    titleConnecting: 'Connecting...',
    titleConnected:  'Connected',
    titleError:      'Error',
    titleStopped:    'Stopped',
    lang:            'عربي',
    uptimeFmt:       (h, m, s) => `${h ? h + 'h ' : ''}${m}m ${s}s`,
    copied:          'Copied',
    logCopied:       'Log copied',
    logExported:     'Log exported',
    deviceInfo:      'Device Info',
    settingsTitle:   'Settings',
    connectedToast:  'Connected to server',
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }
let currentLang  = localStorage.getItem('lang')  || 'ar'
let currentTheme = localStorage.getItem('theme') || 'dark'
const html = document.documentElement

// ─── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 2200) {
  const wrap = $('toast-wrap')
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = msg
  wrap.appendChild(toast)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('show'))
  })
  setTimeout(() => {
    toast.classList.remove('show')
    setTimeout(() => { if (toast.parentNode) toast.remove() }, 320)
  }, duration)
}

// ─── Copy helper ───────────────────────────────────────────────────────────
function copyText(text) {
  if (!text || text === '—') return
  navigator.clipboard.writeText(text).then(() => {
    showToast(LANG[currentLang].copied, 'success')
  }).catch(() => {})
}

// ─── Language ──────────────────────────────────────────────────────────────
function applyLang(lang) {
  currentLang = lang
  localStorage.setItem('lang', lang)
  html.setAttribute('lang', lang)
  html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr')
  $('lang-lbl').textContent = LANG[lang].lang
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (LANG[lang][key] !== undefined) el.textContent = LANG[lang][key]
  })
  $('inp-server').placeholder = 'wss://your-server.replit.app/ws'
  $('inp-token').placeholder  = lang === 'ar' ? 'أدخل الـ Token الخاص بهذا الجهاز' : 'Paste device token here'
  $('log-search').placeholder = lang === 'ar' ? 'بحث...' : 'Search...'
  if (currentState) applyStateLabels(currentState, lastDeviceId, lastServerUrl)
}

// ─── Theme ─────────────────────────────────────────────────────────────────
function applyTheme(theme) {
  currentTheme = theme
  localStorage.setItem('theme', theme)
  html.setAttribute('data-theme', theme)
  $('icon-moon').style.display = theme === 'dark'  ? '' : 'none'
  $('icon-sun').style.display  = theme === 'light' ? '' : 'none'
}

$('btn-lang').addEventListener('click',  () => applyLang(currentLang  === 'ar' ? 'en' : 'ar'))
$('btn-theme').addEventListener('click', () => applyTheme(currentTheme === 'dark' ? 'light' : 'dark'))

// ─── Collapsible Sections ──────────────────────────────────────────────────
const COLL_DEFAULTS = { info: true, settings: false, stats: true, log: false }

function initCollapseSections() {
  Object.entries(COLL_DEFAULTS).forEach(([id, defaultCollapsed]) => {
    const stored = localStorage.getItem(`coll-${id}`)
    const shouldCollapse = stored !== null ? stored === '1' : defaultCollapsed
    if (shouldCollapse) {
      if (id === 'log') {
        document.getElementById('app').classList.add('log-mini')
      } else {
        const sec = $(`sec-${id}`)
        if (sec) sec.classList.add('collapsed')
      }
    } else {
      if (id !== 'log') {
        const sec = $(`sec-${id}`)
        if (sec) sec.classList.remove('collapsed')
      }
    }
  })
}

function toggleSection(id) {
  if (id === 'log') {
    const app = $('app')
    const isMini = app.classList.contains('log-mini')
    app.classList.toggle('log-mini', !isMini)
    localStorage.setItem('coll-log', isMini ? '0' : '1')
  } else {
    const sec = $(`sec-${id}`)
    if (!sec) return
    const wasCollapsed = sec.classList.contains('collapsed')
    sec.classList.toggle('collapsed', !wasCollapsed)
    localStorage.setItem(`coll-${id}`, wasCollapsed ? '0' : '1')
    if (id === 'info') updateInfoSummary()
    if (id === 'stats') updateStatsSummary()
  }
}

document.querySelectorAll('.sec-hdr[data-target]').forEach(btn => {
  btn.addEventListener('click', () => toggleSection(btn.dataset.target))
})
$('log-coll-btn').addEventListener('click', () => toggleSection('log'))

function updateInfoSummary() {
  const host = ($('inf-host').textContent || '').trim()
  const ip   = ($('inf-ip').textContent   || '').trim()
  const pub  = ($('inf-pubip').textContent || '').trim()
  const parts = [
    host !== '—' ? host : '',
    ip   !== '—' ? ip   : '',
    (pub && pub !== '—' && !pub.includes('•')) ? `(${pub})` : ''
  ].filter(Boolean)
  $('sum-info').textContent = parts.join('  ·  ')
}

function updateStatsSummary() {
  const cpu  = $('pct-cpu').textContent
  const ram  = $('pct-ram').textContent
  const disk = $('pct-disk').textContent
  if (cpu && cpu !== '—%') {
    $('sum-stats').textContent = `CPU ${cpu}  RAM ${ram}  Disk ${disk}`
  } else {
    $('sum-stats').textContent = ''
  }
}

// ─── Window Controls ───────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => airemote.minimizeWin())
$('btn-tray').addEventListener('click',  () => airemote.hideWin())
$('btn-close').addEventListener('click', () => airemote.closeApp())

// ─── Token Eye ─────────────────────────────────────────────────────────────
let tokenVisible = false
$('btn-show-token').addEventListener('click', () => {
  tokenVisible = !tokenVisible
  $('inp-token').type = tokenVisible ? 'text' : 'password'
  $('eye-icon').innerHTML = tokenVisible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── Info Grid Copy Buttons ────────────────────────────────────────────────
let fullDeviceId = ''

document.querySelectorAll('.info-copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const targetId = btn.dataset.copy
    if (targetId === 'inf-devid-full') {
      copyText(fullDeviceId || '—')
    } else {
      const el = $(targetId)
      if (el) {
        const txt = el.textContent.trim()
        if (txt && txt !== '—' && !el.querySelector('.ip-loading')) copyText(txt)
      }
    }
  })
})

// ─── Log State ─────────────────────────────────────────────────────────────
let activeLogFilter = 'all'
let logSearchQuery  = ''

document.querySelectorAll('.lf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lf-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeLogFilter = btn.dataset.level
    applyLogFilter()
  })
})

$('log-search').addEventListener('input', () => {
  logSearchQuery = $('log-search').value.toLowerCase().trim()
  applyLogFilter()
})

function applyLogFilter() {
  const entries = $('log-box').querySelectorAll('.log-entry')
  entries.forEach(el => {
    const msg   = (el.querySelector('.log-msg')?.textContent || '').toLowerCase()
    const level = el.dataset.level || 'info'
    const matchSearch = !logSearchQuery || msg.includes(logSearchQuery)
    const matchLevel  = activeLogFilter === 'all' || level === activeLogFilter
    el.style.display  = matchSearch && matchLevel ? '' : 'none'
  })
}

// ─── Log Copy All ──────────────────────────────────────────────────────────
$('copy-log-btn').addEventListener('click', () => {
  const entries = $('log-box').querySelectorAll('.log-entry')
  const lines = [...entries].map(el => {
    const t = el.querySelector('.log-t')?.textContent   || ''
    const m = el.querySelector('.log-msg')?.textContent || ''
    return `[${t}] ${m}`
  }).join('\n')
  if (!lines) return
  navigator.clipboard.writeText(lines).then(() => {
    showToast(LANG[currentLang].logCopied, 'success')
  }).catch(() => {})
})

// ─── Log Export ────────────────────────────────────────────────────────────
$('export-log-btn').addEventListener('click', () => {
  const entries = $('log-box').querySelectorAll('.log-entry')
  const lines = [...entries].map(el => {
    const t = el.querySelector('.log-t')?.textContent   || ''
    const m = el.querySelector('.log-msg')?.textContent || ''
    return `[${t}] ${m}`
  }).join('\n')
  if (!lines) return
  const blob = new Blob([lines], { type: 'text/plain' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `airemote-log-${new Date().toISOString().slice(0, 10)}.txt`
  a.click()
  URL.revokeObjectURL(url)
  showToast(LANG[currentLang].logExported, 'info')
})

// ─── Log Clear ─────────────────────────────────────────────────────────────
$('clear-log').addEventListener('click', () => {
  $('log-box').innerHTML = `<div class="log-empty">${LANG[currentLang].cleared}</div>`
})

// ─── State ─────────────────────────────────────────────────────────────────
let currentState   = 'stopped'
let lastDeviceId   = null
let lastServerUrl  = ''
let statsInterval  = null
let sessionSeconds = 0

// ─── Uptime counter ──────────────────────────────────────────────────────────
let uptimeInterval = null

function startUptimeCounter(initial) {
  stopUptimeCounter()
  sessionSeconds = initial || 0
  renderUptime()
  uptimeInterval = setInterval(() => { sessionSeconds++; renderUptime() }, 1000)
}
function stopUptimeCounter() {
  if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null }
  $('stats-uptime').textContent = ''
  const el = $('strip-uptime')
  if (el) el.textContent = '—'
}
function renderUptime() {
  const h = Math.floor(sessionSeconds / 3600)
  const m = Math.floor((sessionSeconds % 3600) / 60)
  const s = sessionSeconds % 60
  const fmt = LANG[currentLang].uptimeFmt(h, m, s)
  $('stats-uptime').textContent = fmt
  const el = $('strip-uptime')
  if (el) el.textContent = fmt
}

function startStripUptime(initial) { startUptimeCounter(initial) }
function stopStripUptime()          { stopUptimeCounter() }

// ─── Agent Control ─────────────────────────────────────────────────────────
function getConnConfig() {
  return {
    serverUrl:      $('inp-server').value.trim(),
    token:          $('inp-token').value.trim(),
    autoStart:      $('chk-autostart').checked,
    startMinimized: $('chk-minimized').checked
  }
}

$('toggle-btn').addEventListener('click', () => {
  if (currentState === 'stopped' || currentState === 'error') doStart()
  else airemote.stopAgent()
})

$('reconnect-btn').addEventListener('click', () => {
  if (currentState !== 'stopped') {
    airemote.stopAgent()
    setTimeout(doStart, 800)
  } else {
    doStart()
  }
})

function doStart() {
  const cfg = getConnConfig()
  const t = LANG[currentLang]
  if (!cfg.serverUrl || !cfg.token) {
    flashError(!cfg.serverUrl ? $('inp-server') : $('inp-token'), t.errNoConfig)
    const sec = $('sec-settings')
    if (sec && sec.classList.contains('collapsed')) toggleSection('settings')
    return
  }
  if (!cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError($('inp-server'), t.errNeedWs)
    const sec = $('sec-settings')
    if (sec && sec.classList.contains('collapsed')) toggleSection('settings')
    return
  }
  airemote.startAgent(cfg)
}

// ─── Save Connection Config ─────────────────────────────────────────────────
$('save-btn').addEventListener('click', () => {
  const cfg = getConnConfig()
  const t = LANG[currentLang]
  if (cfg.serverUrl && !cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError($('inp-server'), t.errNeedWs); return
  }
  airemote.saveConfig(cfg)
  updateServerDisplay(cfg.serverUrl)
  const btn = $('save-btn')
  const origHtml = btn.innerHTML
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${t.saved}`
  btn.classList.add('saved')
  setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('saved') }, 2500)
  showToast(t.saved, 'success')
})

// ─── Public IP ─────────────────────────────────────────────────────────────
let ipReceived = false

airemote.onPublicIp(ip => {
  ipReceived = true
  const el = $('inf-pubip')
  if (ip && ip.trim()) {
    el.textContent = ip.trim()
    el.classList.add('mono')
  } else {
    el.textContent = '—'
    el.classList.remove('mono')
  }
  updateInfoSummary()
})

setTimeout(() => {
  if (!ipReceived) {
    const el = $('inf-pubip')
    if (el && el.querySelector('.ip-loading')) {
      el.textContent = '—'
      el.classList.remove('mono')
      updateInfoSummary()
    }
  }
}, 9000)

// ─── State Management ───────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState  = state
  lastDeviceId  = deviceId
  lastServerUrl = serverUrl || lastServerUrl
  applyStateLabels(state, deviceId, serverUrl || lastServerUrl)

  const connStrip = $('conn-strip')

  if (state === 'connected') {
    startStatsPolling()
    startStripUptime(uptime || 0)
    if (connStrip) connStrip.classList.remove('hidden')
    const stripServer = $('strip-server')
    if (stripServer) stripServer.textContent = resolveHost(serverUrl || lastServerUrl) || '—'
    const secStats = $('sec-stats')
    if (secStats && secStats.classList.contains('collapsed')) toggleSection('stats')
  } else if (state === 'connecting') {
    startStatsPolling()
    if (connStrip) connStrip.classList.remove('hidden')
    const stripServer = $('strip-server')
    if (stripServer) stripServer.textContent = resolveHost(serverUrl || lastServerUrl) || '—'
  } else {
    stopStatsPolling()
    stopStripUptime()
    resetStats()
    if (connStrip) connStrip.classList.add('hidden')
  }

  const t = LANG[currentLang]
  if (state === 'connected') showToast(`✅ ${t.connectedToast}`, 'success')
  if (state === 'error')     showToast(`❌ ${t.error}`, 'error')
}

function applyStateLabels(state, deviceId, serverUrl) {
  const t = LANG[currentLang]
  const card    = $('status-card')
  const dotWrap = $('dot-wrap')
  card.className    = state
  dotWrap.className = `status-dot-wrap ${state}`
  $('title-dot').className = `title-dot ${state}`

  const titleSep  = $('title-sep')
  const titleHost = $('title-host')
  const host = resolveHost(serverUrl)
  if ((state === 'connected' || state === 'connecting') && host) {
    if (titleSep)  titleSep.style.display  = ''
    if (titleHost) titleHost.textContent   = host
  } else {
    if (titleSep)  titleSep.style.display  = 'none'
    if (titleHost) titleHost.textContent   = ''
  }

  const META = {
    stopped:    { label: t.stopped,    sub: t.notConnected,                title: t.titleStopped    },
    connecting: { label: t.connecting, sub: resolveHost(serverUrl) || '—', title: t.titleConnecting },
    connected:  { label: t.connected,  sub: resolveHost(serverUrl) || '—', title: t.titleConnected  },
    error:      { label: t.error,      sub: t.checkConfig,                 title: t.titleError      }
  }
  const m = META[state] || { label: '—', sub: '—', title: '—' }
  $('status-label').textContent    = m.label
  $('status-sub').textContent      = m.sub
  $('title-state-lbl').textContent = m.title

  const btn = $('toggle-btn')
  btn.className = state
  if (state === 'stopped') {
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg> ${t.start}`
  } else if (state === 'connecting') {
    btn.innerHTML = `<span class="dot-pulse"><span></span><span></span><span></span></span> ${t.connecting}`
  } else if (state === 'connected') {
    btn.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> ${t.stop}`
  } else {
    btn.innerHTML = `↺ ${t.reconnect}`
    btn.className = 'stopped'
  }

  fullDeviceId = deviceId || ''
  if (deviceId) {
    $('inf-devid').textContent = deviceId.length > 28
      ? deviceId.slice(0, 14) + '…' + deviceId.slice(-8)
      : deviceId
  } else {
    $('inf-devid').textContent = '—'
  }
  updateServerDisplay(serverUrl)
  updateInfoSummary()
}

function resolveHost(url) {
  if (!url) return null
  try {
    return new URL(url.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')).hostname
  } catch { return url }
}

function updateServerDisplay(url) {
  $('inf-server').textContent = resolveHost(url) || '—'
  updateInfoSummary()
}

// ─── Stats ──────────────────────────────────────────────────────────────────
function startStatsPolling() {
  if (statsInterval) return
  pollStats()
  statsInterval = setInterval(pollStats, 8000)
}
function stopStatsPolling() {
  if (statsInterval) { clearInterval(statsInterval); statsInterval = null }
}
async function pollStats() {
  try { const s = await airemote.getStatsNow(); if (s) applyStats(s) } catch {}
}
function applyStats(s) {
  setBar($('bar-cpu'),  $('pct-cpu'),  s.cpuPercent,  s.cpuPercent  > 85)
  setBar($('bar-ram'),  $('pct-ram'),  s.ramPercent,  s.ramPercent  > 85)
  setBar($('bar-disk'), $('pct-disk'), s.diskPercent, s.diskPercent > 90)
  const ramUsed  = (s.ramUsedMb  / 1024).toFixed(1)
  const ramTotal = (s.ramTotalMb / 1024).toFixed(1)
  const disk = s.diskTotalGb > 0 ? `${s.diskUsedGb}/${s.diskTotalGb} GB` : `${s.diskPercent}%`
  $('stat-detail').textContent = `RAM: ${ramUsed}/${ramTotal} GB  ·  Disk C: ${disk}`
  updateStatsSummary()
}
function setBar(bar, lbl, val, danger) {
  const pct = Math.min(Math.max(val || 0, 0), 100)
  bar.style.width = `${pct}%`
  bar.classList.toggle('danger', danger)
  lbl.textContent = `${pct}%`
}
function resetStats() {
  ;[$('bar-cpu'), $('bar-ram'), $('bar-disk')].forEach(b => {
    b.style.width = '0%'; b.classList.remove('danger')
  })
  $('pct-cpu').textContent = $('pct-ram').textContent = $('pct-disk').textContent = '—%'
  $('stat-detail').textContent = '—'
  $('sum-stats').textContent = ''
}

// ─── IPC Stats (from heartbeat) ─────────────────────────────────────────────
airemote.onStats(s => { if (s) applyStats(s) })

// ─── Logging ────────────────────────────────────────────────────────────────
function appendLog(entry) {
  const box = $('log-box')
  const empty = box.querySelector('.log-empty')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'log-entry'
  el.dataset.level = entry.level || 'info'
  el.innerHTML = `<span class="log-t">${esc(entry.t)}</span><span class="log-msg ${entry.level || ''}">${esc(entry.msg)}</span>`

  const msg = (entry.msg || '').toLowerCase()
  const matchSearch = !logSearchQuery || msg.includes(logSearchQuery)
  const matchLevel  = activeLogFilter === 'all' || (entry.level || 'info') === activeLogFilter
  if (!matchSearch || !matchLevel) el.style.display = 'none'

  box.appendChild(el)
  while (box.children.length > 200) box.removeChild(box.firstChild)

  if (!document.getElementById('app').classList.contains('log-mini')) {
    box.scrollTop = box.scrollHeight
  }
}

airemote.onLog(entry => appendLog(entry))

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// ─── State IPC ───────────────────────────────────────────────────────────────
airemote.onState(data => {
  applyState(data.state, data.deviceId, data.serverUrl, data.uptime)
})

// ─── Flash helpers ───────────────────────────────────────────────────────────
function flashError(el, msg) {
  el.style.borderColor = 'var(--red)'
  el.style.boxShadow   = '0 0 0 3px rgba(239,68,68,.15)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; el.title = '' }, 3000)
}

// ─── Keyboard Shortcuts ───────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
  if ((e.ctrlKey || e.metaKey) && e.key === 'i') { e.preventDefault(); toggleSection('info') }
  if ((e.ctrlKey || e.metaKey) && e.key === 'l') { e.preventDefault(); toggleSection('log') }
})

// ─── Init ────────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, logs, state, deviceId, serverUrl, hostname, ipLocal, ipPublic, platform } = data

  $('inp-server').value         = config.serverUrl       || ''
  $('inp-token').value          = config.token           || ''
  $('chk-autostart').checked    = config.autoStart      || false
  $('chk-minimized').checked    = config.startMinimized || false

  $('inf-host').textContent  = hostname || '—'
  $('inf-ip').textContent    = ipLocal  || '—'
  $('footer-os').textContent = platform || 'Windows'

  if (ipPublic && ipPublic.trim()) {
    ipReceived = true
    $('inf-pubip').textContent = ipPublic.trim()
    $('inf-pubip').classList.add('mono')
  }

  initCollapseSections()
  updateInfoSummary()
  updateStatsSummary()

  applyLang(currentLang)
  applyTheme(currentTheme)

  if (state && state !== 'stopped') {
    applyState(state, deviceId, serverUrl, data.uptime || 0)
  } else {
    applyStateLabels('stopped', deviceId, serverUrl)
    updateServerDisplay(serverUrl)
  }

  if (logs && logs.length) {
    logs.forEach(entry => appendLog(entry))
  }

  if (config.autoStart && config.serverUrl && config.token && state === 'stopped') {
    setTimeout(doStart, 800)
  }
})
