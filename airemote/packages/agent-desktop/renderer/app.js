'use strict'
/* global airemote */

// ─── Translations ──────────────────────────────────────────────────────────
const LANG = {
  ar: {
    stopped:       'متوقف',
    connecting:    'جاري الاتصال...',
    connected:     'متصل',
    error:         'خطأ في الاتصال',
    notConnected:  'الـ Agent غير متصل بأي خادم',
    checkConfig:   'تحقق من العنوان والـ Token',
    start:         'تشغيل',
    stop:          'إيقاف',
    reconnect:     'إعادة الاتصال',
    tabConn:       'الاتصال',
    serverUrl:     'عنوان الخادم (WebSocket)',
    serverHint:    'مثال: wss://myserver.replit.app/ws',
    deviceToken:   'Device Token',
    tokenHint:     'Dashboard → Devices → نسخ Token',
    autoStart:     'تشغيل تلقائي عند فتح البرنامج',
    startMinimized:'بدء مصغراً في شريط الإشعارات',
    saveSettings:  'حفظ الإعدادات',
    saved:         'تم الحفظ ✓',
    resources:     'موارد الجهاز',
    eventLog:      'سجل الأحداث',
    clear:         'مسح',
    noEvents:      'لا توجد أحداث بعد...',
    cleared:       'تم مسح السجل...',
    device:        'الجهاز',
    localIp:       'IP المحلي',
    server:        'الخادم',
    errNoConfig:   '⚠ أدخل عنوان الخادم والـ Token أولاً',
    errNeedWs:     '⚠ العنوان يجب أن يبدأ بـ ws:// أو wss://',
    errNeedPath:   '⚠ تأكد أن العنوان ينتهي بـ /ws',
    titleConnecting:'جاري الاتصال...',
    titleConnected:'متصل',
    titleError:    'خطأ',
    titleStopped:  'متوقف',
    lang:          'EN',
    uptimeFmt:     (h, m, s) => `${h ? h + 'س ' : ''}${m}د ${s}ث`,
    // SSH
    sshNotConn:    'SSH غير متصل',
    sshConnected:  'SSH متصل',
    sshConnecting: 'جاري الاتصال بـ SSH...',
    sshHost:       'SSH Host',
    sshPort:       'Port',
    sshUser:       'اسم المستخدم',
    sshAuth:       'طريقة المصادقة',
    sshPassword:   'كلمة المرور',
    sshKey:        'مفتاح خاص (Private Key)',
    sshKeyPath:    'مسار ملف المفتاح',
    saveSsh:       'حفظ إعدادات SSH',
    testSsh:       'اختبار الاتصال',
    sshSaved:      'تم الحفظ ✓',
    sshTestOk:     '✓ المنفذ متاح',
    sshTestFail:   '✗ تعذر الاتصال',
    sshTesting:    'جاري الاختبار...',
  },
  en: {
    stopped:       'Stopped',
    connecting:    'Connecting...',
    connected:     'Connected',
    error:         'Connection Error',
    notConnected:  'Agent is not connected to any server',
    checkConfig:   'Check server URL and Token',
    start:         'Start',
    stop:          'Stop',
    reconnect:     'Reconnect',
    tabConn:       'Connection',
    serverUrl:     'Server URL (WebSocket)',
    serverHint:    'Example: wss://myserver.replit.app/ws',
    deviceToken:   'Device Token',
    tokenHint:     'Dashboard → Devices → Copy Token',
    autoStart:     'Auto-start when app opens',
    startMinimized:'Start minimized to tray',
    saveSettings:  'Save Settings',
    saved:         'Saved ✓',
    resources:     'Device Resources',
    eventLog:      'Event Log',
    clear:         'Clear',
    noEvents:      'No events yet...',
    cleared:       'Log cleared...',
    device:        'Device',
    localIp:       'Local IP',
    server:        'Server',
    errNoConfig:   '⚠ Enter server URL and Token first',
    errNeedWs:     '⚠ URL must start with ws:// or wss://',
    errNeedPath:   '⚠ Make sure URL ends with /ws',
    titleConnecting:'Connecting...',
    titleConnected:'Connected',
    titleError:    'Error',
    titleStopped:  'Stopped',
    lang:          'عربي',
    uptimeFmt:     (h, m, s) => `${h ? h + 'h ' : ''}${m}m ${s}s`,
    // SSH
    sshNotConn:    'SSH not connected',
    sshConnected:  'SSH connected',
    sshConnecting: 'Connecting via SSH...',
    sshHost:       'SSH Host',
    sshPort:       'Port',
    sshUser:       'Username',
    sshAuth:       'Authentication Method',
    sshPassword:   'Password',
    sshKey:        'Private Key',
    sshKeyPath:    'Key file path',
    saveSsh:       'Save SSH Settings',
    testSsh:       'Test Connection',
    sshSaved:      'Saved ✓',
    sshTestOk:     '✓ Port reachable',
    sshTestFail:   '✗ Connection failed',
    sshTesting:    'Testing...',
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id) }
let currentLang  = localStorage.getItem('lang')  || 'ar'
let currentTheme = localStorage.getItem('theme') || 'dark'
const html = document.documentElement

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

// ─── Tabs ──────────────────────────────────────────────────────────────────
let activeTab = 'conn'

function switchTab(tab) {
  activeTab = tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tab}`)
  })
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

// ─── Window Controls ───────────────────────────────────────────────────────
$('btn-min').addEventListener('click',   () => airemote.minimizeWin())
$('btn-tray').addEventListener('click',  () => airemote.hideWin())
$('btn-close').addEventListener('click', () => airemote.hideWin())

// ─── Token Eye ─────────────────────────────────────────────────────────────
let tokenVisible = false
$('btn-show-token').addEventListener('click', () => {
  tokenVisible = !tokenVisible
  $('inp-token').type = tokenVisible ? 'text' : 'password'
  $('eye-icon').innerHTML = tokenVisible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── SSH Eye ───────────────────────────────────────────────────────────────
let sshPassVisible = false
$('btn-show-ssh-pass').addEventListener('click', () => {
  sshPassVisible = !sshPassVisible
  $('inp-ssh-pass').type = sshPassVisible ? 'text' : 'password'
  $('ssh-eye-icon').innerHTML = sshPassVisible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── SSH Auth Method Toggle ─────────────────────────────────────────────────
document.querySelectorAll('input[name="ssh-auth"]').forEach(r => {
  r.addEventListener('change', () => {
    const isKey = $('rad-key').checked
    $('ssh-pass-group').style.display = isKey ? 'none' : ''
    $('ssh-key-group').style.display  = isKey ? ''     : 'none'
  })
})

// ─── State ─────────────────────────────────────────────────────────────────
let currentState   = 'stopped'
let lastDeviceId   = null
let lastServerUrl  = ''
let statsInterval  = null
let uptimeInterval = null
let sessionSeconds = 0

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
    switchTab('conn')
    return
  }
  if (!cfg.serverUrl.startsWith('ws://') && !cfg.serverUrl.startsWith('wss://')) {
    flashError($('inp-server'), t.errNeedWs)
    switchTab('conn')
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
})

// ─── SSH Config ─────────────────────────────────────────────────────────────
function getSshConfig() {
  return {
    host:     $('inp-ssh-host').value.trim(),
    port:     parseInt($('inp-ssh-port').value) || 22,
    username: $('inp-ssh-user').value.trim(),
    authType: $('rad-key').checked ? 'key' : 'password',
    password: $('inp-ssh-pass').value,
    keyPath:  $('inp-ssh-key').value.trim()
  }
}

$('save-ssh-btn').addEventListener('click', () => {
  const cfg = getSshConfig()
  airemote.saveSshConfig(cfg)
  const btn = $('save-ssh-btn')
  const origHtml = btn.innerHTML
  const t = LANG[currentLang]
  btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${t.sshSaved}`
  btn.classList.add('saved')
  setTimeout(() => { btn.innerHTML = origHtml; btn.classList.remove('saved') }, 2500)
})

$('test-ssh-btn').addEventListener('click', async () => {
  const cfg = getSshConfig()
  const t = LANG[currentLang]
  const btn = $('test-ssh-btn')
  const host = cfg.host || resolveHost(lastServerUrl)
  if (!host) { sshLog('⚠ ' + (currentLang === 'ar' ? 'أدخل SSH Host أولاً' : 'Enter SSH Host first'), 'warn'); return }

  btn.textContent = t.sshTesting
  btn.className = 'btn-ghost testing'
  sshLog(`🔌 Testing ${host}:${cfg.port}...`, 'info')

  try {
    const result = await airemote.testSshPort({ host, port: cfg.port })
    if (result.ok) {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${t.sshTestOk}`
      btn.className = 'btn-ghost ok'
      sshLog(`✅ ${host}:${cfg.port} — ${t.sshTestOk}`, 'info')
      setSshDot('connected')
    } else {
      throw new Error(result.error || 'unreachable')
    }
  } catch (e) {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${t.sshTestFail}`
    btn.className = 'btn-ghost fail'
    sshLog(`❌ ${t.sshTestFail}: ${e.message}`, 'error')
    setSshDot('error')
  }

  setTimeout(() => {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> <span data-i18n="testSsh">${t.testSsh}</span>`
    btn.className = 'btn-ghost'
  }, 4000)
})

function setSshDot(state) {
  const dot = $('ssh-dot')
  dot.className = `ssh-dot${state ? ' ' + state : ''}`
  const lbl = $('ssh-status-lbl')
  const t = LANG[currentLang]
  const map = { connected: t.sshConnected, connecting: t.sshConnecting, error: t.sshTestFail }
  lbl.textContent = map[state] || t.sshNotConn
}

function sshLog(msg, level) {
  const box = $('ssh-log-box')
  box.classList.add('visible')
  const line = document.createElement('div')
  line.style.cssText = `color:${level === 'error' ? '#fc8181' : level === 'warn' ? '#f6ad55' : '#90cdf4'};margin-bottom:2px`
  line.textContent = msg
  box.appendChild(line)
  while (box.children.length > 20) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}

// ─── State Management ───────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState  = state
  lastDeviceId  = deviceId
  lastServerUrl = serverUrl || lastServerUrl
  applyStateLabels(state, deviceId, serverUrl || lastServerUrl)
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
  const card    = $('status-card')
  const dotWrap = $('dot-wrap')
  card.className    = state
  dotWrap.className = `status-dot-wrap ${state}`
  $('title-dot').className = `title-dot ${state}`

  const META = {
    stopped:    { label: t.stopped,    sub: t.notConnected,                     title: t.titleStopped    },
    connecting: { label: t.connecting, sub: resolveHost(serverUrl) || '—',      title: t.titleConnecting },
    connected:  { label: t.connected,  sub: resolveHost(serverUrl) || '—',      title: t.titleConnected  },
    error:      { label: t.error,      sub: t.checkConfig,                      title: t.titleError      }
  }
  const m = META[state] || { label: '—', sub: '—', title: '—' }
  $('status-label').textContent   = m.label
  $('status-sub').textContent     = m.sub
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

  $('inf-devid').textContent = deviceId ? deviceId.slice(0, 13) + '...' : '—'
  updateServerDisplay(serverUrl)
}

function resolveHost(url) {
  if (!url) return null
  try {
    return new URL(url.replace(/^wss?:\/\//, m => m === 'wss://' ? 'https://' : 'http://')).hostname
  } catch { return url }
}

function updateServerDisplay(url) {
  $('inf-server').textContent = resolveHost(url) || '—'
}

// ─── Uptime ─────────────────────────────────────────────────────────────────
function startUptimeCounter(initial) {
  stopUptimeCounter()
  sessionSeconds = initial || 0
  renderUptime()
  uptimeInterval = setInterval(() => { sessionSeconds++; renderUptime() }, 1000)
}
function stopUptimeCounter() {
  if (uptimeInterval) { clearInterval(uptimeInterval); uptimeInterval = null }
  $('stats-uptime').textContent = ''
}
function renderUptime() {
  const h = Math.floor(sessionSeconds / 3600)
  const m = Math.floor((sessionSeconds % 3600) / 60)
  const s = sessionSeconds % 60
  $('stats-uptime').textContent = LANG[currentLang].uptimeFmt(h, m, s)
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
  const disk     = s.diskTotalGb > 0 ? `${s.diskUsedGb}/${s.diskTotalGb} GB` : `${s.diskPercent}%`
  $('stat-detail').textContent = `RAM: ${ramUsed}/${ramTotal} GB  ·  Disk C: ${disk}`
}
function setBar(bar, lbl, val, danger) {
  const pct = Math.min(Math.max(val || 0, 0), 100)
  bar.style.width = `${pct}%`
  bar.classList.toggle('danger', danger)
  lbl.textContent = `${pct}%`
}
function resetStats() {
  ;[$('bar-cpu'), $('bar-ram'), $('bar-disk')].forEach(b => { b.style.width = '0%'; b.classList.remove('danger') })
  $('pct-cpu').textContent = $('pct-ram').textContent = $('pct-disk').textContent = '—%'
  $('stat-detail').textContent = '—'
}

// ─── Logging ────────────────────────────────────────────────────────────────
function appendLog(entry) {
  const box = $('log-box')
  const empty = box.querySelector('.log-empty')
  if (empty) empty.remove()
  const el = document.createElement('div')
  el.className = 'log-entry'
  el.innerHTML = `<span class="log-t">${esc(entry.t)}</span><span class="log-msg ${entry.level || ''}">${esc(entry.msg)}</span>`
  box.appendChild(el)
  while (box.children.length > 100) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}
$('clear-log').addEventListener('click', () => {
  $('log-box').innerHTML = `<div class="log-empty">${LANG[currentLang].cleared}</div>`
})
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ─── Flash helpers ───────────────────────────────────────────────────────────
function flashError(el, msg) {
  el.style.borderColor = 'var(--red)'
  el.style.boxShadow   = '0 0 0 3px rgba(239,68,68,.15)'
  el.title = msg
  setTimeout(() => { el.style.borderColor = ''; el.style.boxShadow = ''; el.title = '' }, 3000)
}

// ─── Init ────────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, ssh, logs, state, deviceId, serverUrl, hostname, ipLocal, platform } = data

  $('inp-server').value   = config.serverUrl      || ''
  $('inp-token').value    = config.token          || ''
  $('chk-autostart').checked = config.autoStart   || false
  $('chk-minimized').checked = config.startMinimized || false

  if (ssh) {
    $('inp-ssh-host').value = ssh.host     || ''
    $('inp-ssh-port').value = ssh.port     || 22
    $('inp-ssh-user').value = ssh.username || ''
    if (ssh.authType === 'key') {
      $('rad-key').checked = true
      $('ssh-pass-group').style.display = 'none'
      $('ssh-key-group').style.display  = ''
      $('inp-ssh-key').value = ssh.keyPath || ''
    } else {
      $('rad-pass').checked = true
    }
  }

  $('inf-host').textContent = hostname || '—'
  $('inf-ip').textContent   = ipLocal  || '—'
  $('footer-os').textContent = platform || 'Windows'

  applyLang(currentLang)
  applyTheme(currentTheme)
  applyState(state || 'stopped', deviceId, serverUrl, 0)

  if (logs && logs.length) logs.forEach(appendLog)
})

airemote.onState(data  => applyState(data.state, data.deviceId, data.serverUrl, data.uptime || 0))
airemote.onLog(entry   => appendLog(entry))
airemote.onStats(s     => { if (s) applyStats(s) })

// ─── Keyboard shortcuts ──────────────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') airemote.hideWin()
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    if (activeTab === 'ssh') $('save-ssh-btn').click()
    else $('save-btn').click()
  }
})
