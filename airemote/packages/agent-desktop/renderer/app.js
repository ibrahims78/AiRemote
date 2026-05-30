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
    generating:      'جاري التوليد...',
    keyGenerated:    'تم توليد المفتاح',
    // SSH
    sshNotConn:      'SSH غير نشط',
    sshConnected:    'SSH نشط — الخادم متصل',
    sshConnecting:   'جاري الاتصال بـ SSH...',
    sshFromServer:   'من الخادم',
    sshHost:         'SSH Host',
    sshPort:         'Port',
    sshUser:         'اسم المستخدم',
    sshAuth:         'طريقة المصادقة',
    sshPassword:     'كلمة المرور',
    sshKey:          'مفتاح خاص',
    sshKeyPath:      'مسار ملف المفتاح',
    saveSsh:         'حفظ إعدادات SSH',
    testSsh:         'اختبار الاتصال',
    sshSaved:        'تم الحفظ ✓',
    sshTestOk:       '✓ المنفذ متاح',
    sshTestFail:     '✗ تعذر الاتصال',
    sshTesting:      'جاري الاختبار...',
    sshKeyPair:      'مفتاح SSH التشفيري',
    generateKey:     'توليد مفتاح',
    publicKey:       'المفتاح العام',
    privateKey:      'المفتاح الخاص',
    keyHint:         'أنشئ مفتاحاً حتى يتصل الخادم بهذا الجهاز عبر SSH بدون كلمة مرور',
    keyInstructionPublic:  'أضف هذا المفتاح العام إلى ملف authorized_keys على هذا الجهاز',
    keyInstructionPrivate: 'أعطِ هذا المفتاح الخاص للخادم — الاتصال يُنشأ من طرف الخادم فقط',
    noKeyGenerated:  'لا يوجد مفتاح — اضغط "توليد مفتاح"',
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
    generating:      'Generating...',
    keyGenerated:    'Key generated',
    // SSH
    sshNotConn:      'SSH not active',
    sshConnected:    'SSH active — server connected',
    sshConnecting:   'Connecting via SSH...',
    sshFromServer:   'From server',
    sshHost:         'SSH Host',
    sshPort:         'Port',
    sshUser:         'Username',
    sshAuth:         'Authentication Method',
    sshPassword:     'Password',
    sshKey:          'Private Key',
    sshKeyPath:      'Key file path',
    saveSsh:         'Save SSH Settings',
    testSsh:         'Test Connection',
    sshSaved:        'Saved ✓',
    sshTestOk:       '✓ Port reachable',
    sshTestFail:     '✗ Connection failed',
    sshTesting:      'Testing...',
    sshKeyPair:      'SSH Cryptographic Key',
    generateKey:     'Generate Key',
    publicKey:       'Public Key',
    privateKey:      'Private Key',
    keyHint:         'Generate a key so the server can connect to this device via SSH without a password',
    keyInstructionPublic:  'Add this public key to authorized_keys on this device',
    keyInstructionPrivate: 'Give this private key to the server — connection is initiated by the server only',
    noKeyGenerated:  'No key — click "Generate Key"',
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
  updateKeyInstructions()
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

// ─── SSH Pass Eye ──────────────────────────────────────────────────────────
let sshPassVisible = false
$('btn-show-ssh-pass').addEventListener('click', () => {
  sshPassVisible = !sshPassVisible
  $('inp-ssh-pass').type = sshPassVisible ? 'text' : 'password'
  $('ssh-eye-icon').innerHTML = sshPassVisible
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
})

// ─── SSH Auth Method ───────────────────────────────────────────────────────
document.querySelectorAll('input[name="ssh-auth"]').forEach(r => {
  r.addEventListener('change', () => {
    const isKey = $('rad-key').checked
    $('ssh-pass-group').style.display = isKey ? 'none' : ''
    $('ssh-key-group').style.display  = isKey ? ''     : 'none'
  })
})

// ─── Browse SSH Key File ───────────────────────────────────────────────────
$('btn-browse-key').addEventListener('click', async () => {
  try {
    const filePath = await airemote.browseForFile()
    if (filePath) {
      $('inp-ssh-key').value = filePath
      $('inp-ssh-key').dispatchEvent(new Event('input'))
    }
  } catch (e) {
    showToast('❌ ' + e.message, 'error')
  }
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
      if (el) copyText(el.textContent.trim())
    }
  })
})

// ─── Log State ─────────────────────────────────────────────────────────────
let activeLogFilter = 'all'
let logSearchQuery  = ''

// ─── Log Filter ────────────────────────────────────────────────────────────
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
  showToast(t.saved, 'success')
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
  showToast(t.sshSaved, 'success')
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
      showToast(t.sshTestOk, 'success')
    } else {
      throw new Error(result.error || 'unreachable')
    }
  } catch (e) {
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${t.sshTestFail}`
    btn.className = 'btn-ghost fail'
    sshLog(`❌ ${t.sshTestFail}: ${e.message}`, 'error')
    setSshDot('error')
    showToast(t.sshTestFail, 'error')
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

// ─── SSH State from Server ─────────────────────────────────────────────────
airemote.onSshState(data => {
  const { active, sessionId, username } = data
  const t = LANG[currentLang]
  const badge = $('ssh-server-badge')

  if (active) {
    setSshDot('connected')
    const sessionPart = sessionId ? sessionId.slice(0, 8) + '…' : ''
    const userPart    = username   ? `${username}` : ''
    $('ssh-session-info').textContent = [userPart, sessionPart].filter(Boolean).join(' · ')
    badge.style.display = ''
    showToast(`🔐 ${t.sshConnected}${username ? ' (' + username + ')' : ''}`, 'success', 3500)
  } else {
    setSshDot('')
    $('ssh-session-info').textContent = ''
    badge.style.display = 'none'
    showToast(t.sshNotConn, 'warn')
  }
})

// ─── Public IP ─────────────────────────────────────────────────────────────
airemote.onPublicIp(ip => {
  const el = $('inf-pubip')
  if (ip) {
    el.textContent = ip
    el.classList.add('mono')
  } else {
    el.textContent = '—'
  }
})

// ─── SSH Key Pair ──────────────────────────────────────────────────────────
let currentKeyType = 'public'
let currentKeys    = null

async function loadAndShowKeys() {
  const keys = await airemote.getSshKeys()
  if (keys) {
    currentKeys = keys
    showKeys(keys)
  }
}

function showKeys(keys) {
  currentKeys = keys
  $('key-display').style.display = ''
  renderKeyContent()
}

function renderKeyContent() {
  if (!currentKeys) return
  const content = currentKeyType === 'public' ? currentKeys.publicKey : currentKeys.privateKey
  $('key-content').textContent = content || ''
  $('key-instruction-public').style.display  = currentKeyType === 'public'  ? '' : 'none'
  $('key-instruction-private').style.display = currentKeyType === 'private' ? '' : 'none'
}

function updateKeyInstructions() {
  if (!currentKeys) return
  const t = LANG[currentLang]
  $('key-instruction-public').textContent  = t.keyInstructionPublic
  $('key-instruction-private').textContent = t.keyInstructionPrivate
}

document.querySelectorAll('.key-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.key-tab-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentKeyType = btn.dataset.kt
    renderKeyContent()
  })
})

$('gen-key-btn').addEventListener('click', async () => {
  const btn = $('gen-key-btn')
  const t = LANG[currentLang]
  const orig = btn.textContent
  btn.textContent = t.generating
  btn.disabled = true
  try {
    const keys = await airemote.generateSshKeys()
    showKeys(keys)
    showToast(t.keyGenerated, 'success')
  } catch (e) {
    showToast('❌ ' + e.message, 'error')
  } finally {
    btn.textContent = orig
    btn.disabled = false
  }
})

$('copy-key-btn').addEventListener('click', () => {
  if (!currentKeys) return
  const content = currentKeyType === 'public' ? currentKeys.publicKey : currentKeys.privateKey
  if (content) copyText(content)
})

// ─── State Management ───────────────────────────────────────────────────────
function applyState(state, deviceId, serverUrl, uptime) {
  currentState  = state
  lastDeviceId  = deviceId
  lastServerUrl = serverUrl || lastServerUrl
  applyStateLabels(state, deviceId, serverUrl || lastServerUrl)

  const wasConnected = (state === 'connected')
  const wasConnecting = (state === 'connecting')

  if (wasConnected || wasConnecting) {
    startStatsPolling()
    startUptimeCounter(uptime || 0)
  } else {
    stopStatsPolling()
    stopUptimeCounter()
    resetStats()
  }

  // Toast on state change
  const t = LANG[currentLang]
  if (state === 'connected') showToast(`✅ ${t.connected}`, 'success')
  if (state === 'error')     showToast(`❌ ${t.error}`, 'error')
}

function applyStateLabels(state, deviceId, serverUrl) {
  const t = LANG[currentLang]
  const card    = $('status-card')
  const dotWrap = $('dot-wrap')
  card.className    = state
  dotWrap.className = `status-dot-wrap ${state}`
  $('title-dot').className = `title-dot ${state}`

  const META = {
    stopped:    { label: t.stopped,    sub: t.notConnected,               title: t.titleStopped    },
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

  // Device ID — full value stored separately
  fullDeviceId = deviceId || ''
  if (deviceId) {
    $('inf-devid').textContent = deviceId.length > 28
      ? deviceId.slice(0, 14) + '…' + deviceId.slice(-8)
      : deviceId
  } else {
    $('inf-devid').textContent = '—'
  }
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
  const disk = s.diskTotalGb > 0 ? `${s.diskUsedGb}/${s.diskTotalGb} GB` : `${s.diskPercent}%`
  $('stat-detail').textContent = `RAM: ${ramUsed}/${ramTotal} GB  ·  Disk C: ${disk}`
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
}

// ─── Logging ────────────────────────────────────────────────────────────────
function appendLog(entry) {
  const box = $('log-box')
  const empty = box.querySelector('.log-empty')
  if (empty) empty.remove()

  const el = document.createElement('div')
  el.className = 'log-entry'
  el.dataset.level = entry.level || 'info'
  el.innerHTML = `<span class="log-t">${esc(entry.t)}</span><span class="log-msg ${entry.level || ''}">${esc(entry.msg)}</span>`

  // Apply current filter
  const msg = (entry.msg || '').toLowerCase()
  const matchSearch = !logSearchQuery || msg.includes(logSearchQuery)
  const matchLevel  = activeLogFilter === 'all' || (entry.level || 'info') === activeLogFilter
  if (!matchSearch || !matchLevel) el.style.display = 'none'

  box.appendChild(el)
  while (box.children.length > 200) box.removeChild(box.firstChild)
  box.scrollTop = box.scrollHeight
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

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
  if ((e.ctrlKey || e.metaKey) && e.key === '1') { e.preventDefault(); switchTab('conn') }
  if ((e.ctrlKey || e.metaKey) && e.key === '2') { e.preventDefault(); switchTab('ssh') }
})

// ─── Init ────────────────────────────────────────────────────────────────────
airemote.onInit(data => {
  const { config, ssh, logs, state, deviceId, serverUrl, hostname, ipLocal, ipPublic, platform } = data

  $('inp-server').value      = config.serverUrl       || ''
  $('inp-token').value       = config.token           || ''
  $('chk-autostart').checked    = config.autoStart      || false
  $('chk-minimized').checked    = config.startMinimized || false

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

  $('inf-host').textContent   = hostname || '—'
  $('inf-ip').textContent     = ipLocal  || '—'
  $('footer-os').textContent  = platform || 'Windows'

  // Public IP
  if (ipPublic) {
    $('inf-pubip').textContent = ipPublic
    $('inf-pubip').classList.add('mono')
  }

  applyLang(currentLang)
  applyTheme(currentTheme)
  applyState(state || 'stopped', deviceId, serverUrl, 0)

  if (logs && logs.length) logs.forEach(appendLog)

  // Load SSH keys if any
  loadAndShowKeys()
})

airemote.onState(data  => applyState(data.state, data.deviceId, data.serverUrl, data.uptime || 0))
airemote.onLog(entry   => appendLog(entry))
airemote.onStats(s     => { if (s) applyStats(s) })
