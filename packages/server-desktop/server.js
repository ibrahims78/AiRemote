'use strict'
/**
 * server.js — AiRemote Server Desktop v3.2.0
 * Full-featured Fastify server — complete parity with the web server.
 * Runs inside the Electron main process (better-sqlite3, jsonwebtoken).
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Requires
// ─────────────────────────────────────────────────────────────────────────────
const Fastify           = require('fastify')
const fcors             = require('@fastify/cors')
const fws               = require('@fastify/websocket')
const frateLimit        = require('@fastify/rate-limit')
const bcrypt            = require('bcryptjs')
const jwt               = require('jsonwebtoken')
const { v4: uuidv4 }    = require('uuid')
const Database          = require('better-sqlite3')
const path              = require('path')
const fs                = require('fs')
const os                = require('os')
const crypto            = require('crypto')
const { EventEmitter }  = require('events')

// Optional deps — loaded lazily so the app starts even if not yet installed
let _authenticator = null
let _QRCode        = null
let _fstatic       = null
let _ssh2          = null

function getAuthenticator() {
  if (!_authenticator) { const o = require('otplib'); _authenticator = o.authenticator || o.default?.authenticator || o; _authenticator.options = { step: 30, window: 1 } }
  return _authenticator
}
function getQRCode()   { if (!_QRCode)   _QRCode   = require('qrcode');     return _QRCode   }
function getFStatic()  { if (!_fstatic)  _fstatic  = require('@fastify/static'); return _fstatic }
function getSsh2()     { if (!_ssh2)     _ssh2     = require('ssh2');        return _ssh2     }

// ─────────────────────────────────────────────────────────────────────────────
// 2. In-Memory Registries
// ─────────────────────────────────────────────────────────────────────────────
const agentSockets      = new Map()   // deviceId → { ws, info, deviceName, connectedAt, stats }
const clientSockets     = new Set()   // Set<WebSocket>
const ptyClients        = new Map()   // sessionId → Set<WebSocket>
const screenViewers     = new Map()   // deviceId  → Set<WebSocket>
const sshSessions       = new Map()   // sessionId → { conn, stream }
const sftpSessions      = new Map()   // sessionId → { sftp, conn }
const wsTickets         = new Map()   // ticketId  → { userId, email, role, expires }
const pendingFsRequests = new Map()   // requestId → { resolve, reject, timer }
const publishStates     = new Map()   // publishId → { status, log, url }

const events = new EventEmitter()

// Desktop bridge callbacks (injected from main.js via start())
let _desktopCallbacks = {}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Database
// ─────────────────────────────────────────────────────────────────────────────
let db  = null
let JWT = ''

function initDb(dbPath) {
  const dir = path.dirname(dbPath)
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT UNIQUE NOT NULL,
      name          TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      totp_enabled  INTEGER NOT NULL DEFAULT 0,
      totp_secret   TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS devices (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      token          TEXT UNIQUE NOT NULL,
      owner_id       TEXT NOT NULL,
      info           TEXT,
      status         TEXT NOT NULL DEFAULT 'offline',
      tags           TEXT NOT NULL DEFAULT '[]',
      capabilities   TEXT NOT NULL DEFAULT '{}',
      last_seen      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      device_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      type         TEXT NOT NULL DEFAULT 'shell',
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      duration_sec INTEGER,
      metadata     TEXT
    );
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      token_hash  TEXT UNIQUE NOT NULL,
      expires_at  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS audit_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL DEFAULT '',
      user_email  TEXT NOT NULL DEFAULT '',
      device_id   TEXT,
      action      TEXT NOT NULL,
      details     TEXT,
      ip_address  TEXT,
      status_code INTEGER,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id         TEXT PRIMARY KEY,
      device_id  TEXT NOT NULL DEFAULT '',
      user_id    TEXT NOT NULL,
      title      TEXT,
      messages   TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS alert_rules (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      device_id     TEXT,
      type          TEXT NOT NULL,
      threshold     REAL,
      cooldown_min  INTEGER NOT NULL DEFAULT 30,
      channel       TEXT NOT NULL DEFAULT 'in_app',
      webhook_url   TEXT,
      enabled       INTEGER NOT NULL DEFAULT 1,
      last_fired_at TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS device_credentials (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      device_id    TEXT NOT NULL,
      label        TEXT NOT NULL,
      ssh_host     TEXT NOT NULL,
      ssh_port     INTEGER NOT NULL DEFAULT 22,
      ssh_username TEXT NOT NULL,
      secret_type  TEXT NOT NULL DEFAULT 'password',
      secret_enc   TEXT NOT NULL,
      last_used    TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS recordings (
      id          TEXT PRIMARY KEY,
      device_id   TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      name        TEXT,
      started_at  TEXT NOT NULL,
      ended_at    TEXT,
      file_path   TEXT,
      size_mb     REAL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS stats_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    TEXT NOT NULL,
      cpu_percent  REAL,
      ram_percent  REAL,
      disk_percent REAL,
      net_in_kb    REAL,
      net_out_kb   REAL,
      recorded_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_devices_token    ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_devices_owner    ON devices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_device  ON sessions(device_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created    ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_stats_device     ON stats_history(device_id, recorded_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ai_conv_user     ON ai_conversations(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_alerts_user      ON alert_rules(user_id);
  `)

  // Cleanup expired tokens on start
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(new Date().toISOString())
  // Cleanup old stats (keep 7 days)
  const oldStats = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare("DELETE FROM stats_history WHERE recorded_at < ?").run(oldStats)

  // Schedule daily cleanup
  setInterval(() => {
    try {
      if (!db) return
      db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(new Date().toISOString())
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      db.prepare("DELETE FROM stats_history WHERE recorded_at < ?").run(cutoff)
    } catch {}
  }, 24 * 60 * 60 * 1000)
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. JWT Helpers
// ─────────────────────────────────────────────────────────────────────────────
function signToken(payload, expiresIn = '8h') {
  return jwt.sign(payload, JWT, { expiresIn })
}
function verifyToken(token) {
  return jwt.verify(token, JWT)
}
function extractBearer(req) {
  const auth = req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7)
  if (req.query?.token) return req.query.token
  return null
}
function authMiddleware(req, reply) {
  const token = extractBearer(req)
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return null }
  try { return verifyToken(token) } catch { reply.code(401).send({ error: 'Invalid token' }); return null }
}
function adminMiddleware(req, reply) {
  const user = authMiddleware(req, reply)
  if (!user) return null
  if (user.role !== 'admin') { reply.code(403).send({ error: 'Admin required' }); return null }
  return user
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Crypto — AES-256-CBC for SSH credential encryption
// ─────────────────────────────────────────────────────────────────────────────
function getDerivedKey() {
  return crypto.pbkdf2Sync(JWT || 'airemote-default', 'airemote-credentials-salt-v1', 100000, 32, 'sha256')
}
function encryptSecret(plaintext) {
  const key    = getDerivedKey()
  const iv     = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return iv.toString('hex') + ':' + enc.toString('hex')
}
function decryptSecret(encrypted) {
  const [ivHex, encHex] = encrypted.split(':')
  const key    = getDerivedKey()
  const iv     = Buffer.from(ivHex, 'hex')
  const enc    = Buffer.from(encHex, 'hex')
  const d      = crypto.createDecipheriv('aes-256-cbc', key, iv)
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8')
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Utilities
// ─────────────────────────────────────────────────────────────────────────────
function sendJson(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch {}
}
function broadcastToClients(msg) {
  for (const ws of clientSockets) sendJson(ws, msg)
}
function markDeviceOnline(deviceId, info) {
  if (info) {
    db.prepare("UPDATE devices SET status='online', info=?, last_seen=datetime('now'), updated_at=datetime('now') WHERE id=?").run(JSON.stringify(info), deviceId)
  } else {
    db.prepare("UPDATE devices SET status='online', last_seen=datetime('now'), updated_at=datetime('now') WHERE id=?").run(deviceId)
  }
}
function markDeviceOffline(deviceId) {
  if (!db) return
  db.prepare("UPDATE devices SET status='offline', updated_at=datetime('now') WHERE id=?").run(deviceId)
  broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'offline' } })
  events.emit('device:disconnected', deviceId)
}
function getLocalIp() {
  const nets = os.networkInterfaces()
  for (const n of Object.values(nets)) {
    for (const i of n) { if (!i.internal && i.family === 'IPv4') return i.address }
  }
  return '127.0.0.1'
}
function parseJson(str, fallback = null) {
  try { return JSON.parse(str) } catch { return fallback }
}
function dbLogAudit({ userId = '', userEmail = '', deviceId = null, action, details = null, ipAddress = null } = {}) {
  try {
    db.prepare("INSERT INTO audit_log (user_id, user_email, device_id, action, details, ip_address) VALUES (?,?,?,?,?,?)")
      .run(userId, userEmail, deviceId, action, details ? JSON.stringify(details) : null, ipAddress)
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. AI Provider
// ─────────────────────────────────────────────────────────────────────────────
const AI_SYSTEM_PROMPT = `أنت مساعد ذكي متخصص في إدارة الخوادم والأجهزة البعيدة، جزء من منصة AiRemote.
ساعد المستخدم في تشخيص المشكلات وإدارة الخوادم وتحليل الأداء.
كن دقيقاً ومفيداً ومختصراً. استخدم اللغة العربية كافتراضي.`

function getAiConfig() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='ai_config'").get()
    return row ? parseJson(row.value) : null
  } catch { return null }
}

async function callAI(messages, cfg, stream = false, onChunk = null) {
  if (!cfg?.provider) throw new Error('AI provider not configured')
  const { provider, apiKey, model, baseUrl } = cfg

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ model: model || 'gpt-4o-mini', messages, stream })
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`OpenAI ${res.status}: ${t.slice(0, 200)}`) }
    if (stream && onChunk && res.body) {
      const reader = res.body.getReader(); const dec = new TextDecoder(); let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const lines = dec.decode(value).split('\n').filter(l => l.startsWith('data: ') && !l.includes('[DONE]'))
        for (const line of lines) {
          try { const obj = JSON.parse(line.slice(6)); const delta = obj.choices?.[0]?.delta?.content || ''; if (delta) { full += delta; onChunk(delta) } } catch {}
        }
      }
      return full
    }
    const data = await res.json()
    return data.choices?.[0]?.message?.content || ''
  }

  if (provider === 'gemini') {
    const gemModel = model || 'gemini-1.5-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${gemModel}:generateContent?key=${apiKey}`
    const gemMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const body    = { contents: gemMsgs }
    const sysmsg  = messages.find(m => m.role === 'system')
    if (sysmsg) body.system_instruction = { parts: [{ text: sysmsg.content }] }
    const res  = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Gemini ${res.status}: ${t.slice(0, 200)}`) }
    const data = await res.json()
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  if (provider === 'ollama') {
    const base = (baseUrl || 'http://localhost:11434').replace(/\/$/, '')
    const res  = await fetch(`${base}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body:   JSON.stringify({ model: model || 'llama3.2', messages, stream: false })
    })
    if (!res.ok) { const t = await res.text().catch(() => ''); throw new Error(`Ollama ${res.status}: ${t.slice(0, 200)}`) }
    const data = await res.json()
    return data.message?.content || ''
  }

  throw new Error(`Unknown AI provider: ${provider}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Alert Engine
// ─────────────────────────────────────────────────────────────────────────────
function checkAlerts(deviceId, stats) {
  if (!stats || !db) return
  try {
    const rules = db.prepare("SELECT * FROM alert_rules WHERE enabled=1 AND (device_id IS NULL OR device_id=?)").all(deviceId)
    const now   = new Date().toISOString()
    for (const rule of rules) {
      let triggered = false; let value = null
      if (rule.type === 'cpu_high'  && stats.cpuPercent  != null) { triggered = stats.cpuPercent  >= rule.threshold; value = Math.round(stats.cpuPercent)  }
      if (rule.type === 'ram_high'  && stats.ramPercent  != null) { triggered = stats.ramPercent  >= rule.threshold; value = Math.round(stats.ramPercent)  }
      if (rule.type === 'disk_high' && stats.diskPercent != null) { triggered = stats.diskPercent >= rule.threshold; value = Math.round(stats.diskPercent) }
      if (!triggered) continue
      if (rule.last_fired_at && Date.now() - new Date(rule.last_fired_at).getTime() < rule.cooldown_min * 60000) continue
      db.prepare("UPDATE alert_rules SET last_fired_at=? WHERE id=?").run(now, rule.id)
      const device     = db.prepare("SELECT name FROM devices WHERE id=?").get(deviceId)
      const deviceName = device?.name || deviceId
      const alertMsg   = `🚨 ${deviceName}: ${rule.type} = ${value}% (حد: ${rule.threshold}%)`
      broadcastToClients({ type: 'alert:triggered', payload: { ruleId: rule.id, deviceId, deviceName, type: rule.type, value, threshold: rule.threshold, message: alertMsg } })
      if (rule.channel === 'webhook' && rule.webhook_url) {
        fetch(rule.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: alertMsg, device: deviceName, type: rule.type, value, threshold: rule.threshold, timestamp: now }) }).catch(() => {})
      }
    }
  } catch {}
}

function fireOfflineAlerts(deviceId) {
  if (!db) return
  try {
    const rules = db.prepare("SELECT * FROM alert_rules WHERE enabled=1 AND type='device_offline' AND (device_id IS NULL OR device_id=?)").all(deviceId)
    const now = new Date().toISOString()
    const device = db.prepare("SELECT name FROM devices WHERE id=?").get(deviceId)
    const deviceName = device?.name || deviceId
    for (const rule of rules) {
      if (rule.last_fired_at && Date.now() - new Date(rule.last_fired_at).getTime() < rule.cooldown_min * 60000) continue
      db.prepare("UPDATE alert_rules SET last_fired_at=? WHERE id=?").run(now, rule.id)
      const msg = `📴 جهاز غير متصل: ${deviceName}`
      broadcastToClients({ type: 'alert:triggered', payload: { ruleId: rule.id, deviceId, deviceName, type: 'device_offline', message: msg } })
      if (rule.channel === 'webhook' && rule.webhook_url) {
        fetch(rule.webhook_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: msg, device: deviceName, type: 'device_offline', timestamp: now }) }).catch(() => {})
      }
    }
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. WebSocket — Agent
// ─────────────────────────────────────────────────────────────────────────────
function handleAgentWs(socket) {
  let deviceId   = null
  let registered = false
  let hbCount    = 0

  const PING_MS = 15000; const PONG_MS = 12000
  let pingTimer = null; let pongTimer = null

  function schedulePing() {
    clearTimeout(pingTimer)
    pingTimer = setTimeout(() => {
      if (socket.readyState !== 1) return
      pongTimer = setTimeout(() => { socket.terminate() }, PONG_MS)
      try { socket.ping() } catch {}
      sendJson(socket, { type: 'server:ping', payload: {}, timestamp: Date.now() })
    }, PING_MS)
  }

  socket.on('pong', () => { clearTimeout(pongTimer); pongTimer = null; schedulePing() })

  socket.on('message', (raw, isBinary) => {
    if (isBinary) {
      if (!deviceId) return
      try {
        const buf       = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        const idLen     = buf.readUInt32BE(0)
        const sessionId = buf.slice(4, 4 + idLen).toString('utf8')
        const frame     = buf.slice(4 + idLen)
        broadcastToClients({ type: 'screen:frame', payload: { deviceId, sessionId, data: frame.toString('base64') } })
        const viewers = screenViewers.get(deviceId)
        if (viewers?.size > 0) { for (const vws of viewers) { try { if (vws.readyState === 1) vws.send(raw) } catch {} } }
      } catch {}
      return
    }

    let msg; try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg
    clearTimeout(pongTimer); pongTimer = null
    schedulePing()

    if (type === 'agent:register') {
      const { token, info, capabilities } = payload
      const device = db.prepare("SELECT * FROM devices WHERE token=?").get(token)
      if (!device) { sendJson(socket, { type: 'server:error', payload: { message: 'Invalid token' } }); socket.close(); return }
      deviceId = device.id; registered = true
      markDeviceOnline(deviceId, info)
      if (capabilities) db.prepare("UPDATE devices SET capabilities=? WHERE id=?").run(JSON.stringify(capabilities), deviceId)
      agentSockets.set(deviceId, { ws: socket, info, deviceName: device.name, connectedAt: Date.now(), stats: null })
      sendJson(socket, { type: 'server:registered', payload: { deviceId, name: device.name } })
      broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'online', name: device.name, info } })
      events.emit('device:connected', deviceId, device.name)
      schedulePing()
      return
    }

    if (!registered) { socket.close(); return }

    if (type === 'agent:heartbeat') {
      const { stats } = payload
      markDeviceOnline(deviceId, null)
      const rec = agentSockets.get(deviceId)
      if (rec && stats) rec.stats = stats
      sendJson(socket, { type: 'server:pong', payload: {} })
      broadcastToClients({ type: 'device:heartbeat', payload: { deviceId, stats } })
      if (stats) {
        hbCount++
        if (hbCount % 3 === 0) {
          try {
            db.prepare("INSERT INTO stats_history (device_id, cpu_percent, ram_percent, disk_percent, net_in_kb, net_out_kb) VALUES (?,?,?,?,?,?)")
              .run(deviceId, stats.cpuPercent || 0, stats.ramPercent || 0, stats.diskPercent || 0, stats.netInKb || 0, stats.netOutKb || 0)
          } catch {}
        }
        checkAlerts(deviceId, stats)
      }
      return
    }

    if (type === 'agent:pong') { clearTimeout(pongTimer); pongTimer = null; schedulePing(); return }

    if (type === 'agent:command_result') {
      broadcastToClients({ type: 'agent:command_result', payload: { ...payload, deviceId } })
      return
    }

    if (type === 'agent:pty_output') {
      const { sessionId, data } = payload
      broadcastToClients({ type: 'agent:pty_output', payload: { deviceId, sessionId, data } })
      const set = ptyClients.get(sessionId)
      if (set) for (const vws of set) sendJson(vws, { type: 'pty_output', data })
      return
    }

    if (type === 'agent:screen_frame') {
      broadcastToClients({ type: 'screen:frame', payload: { deviceId, ...payload } })
      return
    }

    if (type === 'agent:fs_response') {
      const { requestId, data, error } = payload
      const pending = pendingFsRequests.get(requestId)
      if (pending) { clearTimeout(pending.timer); pendingFsRequests.delete(requestId); error ? pending.reject(new Error(error)) : pending.resolve(data) }
      return
    }
  })

  socket.on('close', () => {
    clearTimeout(pingTimer); clearTimeout(pongTimer)
    if (deviceId) { agentSockets.delete(deviceId); markDeviceOffline(deviceId); fireOfflineAlerts(deviceId) }
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. WebSocket — Dashboard Client
// ─────────────────────────────────────────────────────────────────────────────
function handleClientWs(socket) {
  clientSockets.add(socket)

  const devices  = db.prepare("SELECT * FROM devices ORDER BY name").all()
  const snapshot = devices.map(d => ({
    ...d, info: parseJson(d.info), tags: parseJson(d.tags, []),
    capabilities: parseJson(d.capabilities, {}), isOnline: agentSockets.has(d.id),
    stats: agentSockets.get(d.id)?.stats || null,
  }))
  sendJson(socket, { type: 'server:snapshot', payload: { devices: snapshot } })

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg

    if (type === 'client:command') {
      const { deviceId, command, cmdType = 'shell', sessionId } = payload
      const commandId = uuidv4()
      const rec = agentSockets.get(deviceId)
      if (!rec) { sendJson(socket, { type: 'agent:command_result', payload: { commandId, deviceId, error: 'Device offline' } }); return }
      sendJson(rec.ws, { type: 'server:command', payload: { commandId, type: cmdType, command, sessionId } })
      return
    }
    if (type === 'client:screen_start') {
      const { deviceId, fps = 10, quality = 60, maxWidth = 1280, sessionId } = payload
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_start', payload: { sessionId: sessionId || uuidv4(), fps, quality, maxWidth } })
      return
    }
    if (type === 'client:screen_stop') {
      const { deviceId, sessionId } = payload
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_stop', payload: { sessionId } })
      return
    }
    if (type === 'client:screen_control') {
      const { deviceId, action, x, y, button, key, sessionId } = payload
      const rec = agentSockets.get(deviceId)
      if (rec) sendJson(rec.ws, { type: 'server:screen_control', payload: { action, x, y, button, key, sessionId } })
      return
    }
  })

  socket.on('close', () => { clientSockets.delete(socket) })
  socket.on('error', () => { clientSockets.delete(socket) })
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. WebSocket — PTY Terminal
// ─────────────────────────────────────────────────────────────────────────────
function handlePtyWs(socket, request) {
  const query     = request.query || {}
  const deviceId  = query.deviceId
  const sessionId = query.sessionId || uuidv4()
  if (!deviceId) { socket.close(); return }

  if (!ptyClients.has(sessionId)) ptyClients.set(sessionId, new Set())
  ptyClients.get(sessionId).add(socket)

  const agentRec = agentSockets.get(deviceId)
  if (agentRec) sendJson(agentRec.ws, { type: 'server:pty_start', payload: { sessionId, cols: 80, rows: 24 } })
  sendJson(socket, { type: 'pty_ready', sessionId })

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const rec = agentSockets.get(deviceId)
    if (!rec) { sendJson(socket, { type: 'pty_error', error: 'Device offline' }); return }
    if (msg.type === 'pty_input')  sendJson(rec.ws, { type: 'server:command',    payload: { type: 'pty_input',   data: msg.data, sessionId } })
    if (msg.type === 'pty_resize') sendJson(rec.ws, { type: 'server:pty_resize', payload: { sessionId, cols: msg.cols || 80, rows: msg.rows || 24 } })
  })

  socket.on('close', () => {
    const set = ptyClients.get(sessionId)
    if (set) { set.delete(socket); if (!set.size) ptyClients.delete(sessionId) }
    const rec = agentSockets.get(deviceId)
    if (rec) sendJson(rec.ws, { type: 'server:pty_stop', payload: { sessionId } })
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. WebSocket — Screen Viewer
// ─────────────────────────────────────────────────────────────────────────────
function handleScreenWs(socket, request) {
  const query    = request.query || {}
  const deviceId = query.deviceId
  if (!deviceId) { socket.close(); return }

  if (!screenViewers.has(deviceId)) screenViewers.set(deviceId, new Set())
  screenViewers.get(deviceId).add(socket)

  const agentRec = agentSockets.get(deviceId)
  if (!agentRec) { sendJson(socket, { type: 'error', error: 'Device offline' }) }
  else sendJson(socket, { type: 'screen_ready', deviceId })

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }
    const rec = agentSockets.get(deviceId)
    if (!rec) return
    if (msg.type === 'screen_start')   sendJson(rec.ws, { type: 'server:screen_start',   payload: { sessionId: uuidv4(), fps: msg.fps || 10, quality: msg.quality || 60, maxWidth: msg.maxWidth || 1280 } })
    if (msg.type === 'screen_stop')    sendJson(rec.ws, { type: 'server:screen_stop',    payload: { sessionId: msg.sessionId } })
    if (msg.type === 'screen_control') sendJson(rec.ws, { type: 'server:screen_control', payload: msg })
  })

  socket.on('close', () => {
    const set = screenViewers.get(deviceId)
    if (set) { set.delete(socket); if (!set.size) screenViewers.delete(deviceId) }
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. WebSocket — Direct SSH
// ─────────────────────────────────────────────────────────────────────────────
function handleSshWs(socket) {
  let conn = null; let stream = null; const sessionId = uuidv4()
  sendJson(socket, { type: 'ssh_connected', sessionId })

  socket.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw) } catch { return }

    if (msg.type === 'ssh_connect') {
      const { host, port = 22, username, password, privateKey } = msg
      if (!host || !username) { sendJson(socket, { type: 'ssh_error', error: 'host and username required' }); return }
      try {
        const { Client } = getSsh2()
        conn = new Client()
        const authConf = { host, port, username }
        if (privateKey) authConf.privateKey = privateKey; else authConf.password = password

        conn.on('ready', () => {
          conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, sh) => {
            if (err) { sendJson(socket, { type: 'ssh_error', error: err.message }); conn.end(); return }
            stream = sh
            sshSessions.set(sessionId, { conn, stream })
            sendJson(socket, { type: 'ssh_ready' })
            sh.on('data', d  => sendJson(socket, { type: 'ssh_output', data: d.toString('utf8') }))
            sh.stderr?.on('data', d => sendJson(socket, { type: 'ssh_output', data: d.toString('utf8') }))
            sh.on('close', () => { sendJson(socket, { type: 'ssh_closed' }); socket.close() })
          })
        })
        conn.on('error', err => sendJson(socket, { type: 'ssh_error', error: err.message }))
        conn.connect(authConf)
      } catch (e) { sendJson(socket, { type: 'ssh_error', error: e.message }) }
      return
    }
    if (msg.type === 'ssh_input'  && stream) { stream.write(msg.data); return }
    if (msg.type === 'ssh_resize' && stream) { stream.setWindow(msg.rows || 24, msg.cols || 80); return }
  })

  socket.on('close', () => {
    if (stream) try { stream.close() } catch {}
    if (conn)   try { conn.end()     } catch {}
    sshSessions.delete(sessionId)
  })
  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// 14. Agent FS Request Helper
// ─────────────────────────────────────────────────────────────────────────────
function agentFsRequest(deviceId, action, params, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const rec = agentSockets.get(deviceId)
    if (!rec) return reject(new Error('Device offline'))
    const requestId = uuidv4()
    const timer = setTimeout(() => { pendingFsRequests.delete(requestId); reject(new Error('FS request timeout')) }, timeoutMs)
    pendingFsRequests.set(requestId, { resolve, reject, timer })
    sendJson(rec.ws, { type: 'server:fs_request', payload: { requestId, action, ...params } })
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// 15. WS Auth Helper
// ─────────────────────────────────────────────────────────────────────────────
function resolveWsUser(query) {
  if (query.ticket) {
    const t = wsTickets.get(query.ticket)
    if (t && t.expires > Date.now()) { wsTickets.delete(query.ticket); return t }
    return null
  }
  if (query.token) { try { return verifyToken(query.token) } catch { return null } }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// 16. Fastify Instance + All Routes
// ─────────────────────────────────────────────────────────────────────────────
let fastify    = null
let started    = false
let _config    = {}
let _startedAt = null

const AGENT_VERSION = '3.2.0'

async function start(config) {
  if (started) return
  _config = config
  const { port = 3001, jwtSecret, dbPath, logger: log, desktopCallbacks = {} } = config
  JWT = jwtSecret
  _desktopCallbacks = desktopCallbacks

  initDb(dbPath)

  fastify = Fastify({ logger: false })
  await fastify.register(fcors, { origin: true, credentials: true })
  await fastify.register(frateLimit, { global: false, max: 200, timeWindow: '1 minute' })
  await fastify.register(fws)

  // Serve static React Dashboard if built
  const staticDir = path.join(__dirname, 'static')
  let hasDashboard = false
  if (fs.existsSync(path.join(staticDir, 'index.html'))) {
    try {
      await fastify.register(getFStatic(), { root: staticDir, prefix: '/', wildcard: false, decorateReply: false })
      hasDashboard = true
    } catch {}
  }

  // SPA fallback
  if (hasDashboard) {
    fastify.setNotFoundHandler((req, reply) => {
      if (/^\/(api|ws|pty|ssh|screen)/.test(req.url)) return reply.code(404).send({ error: 'Not found' })
      reply.sendFile('index.html')
    })
  }

  // ── Health ────────────────────────────────────────────────────────────────
  fastify.get('/api/health', async () => ({
    status: 'ok', version: AGENT_VERSION, uptime: Math.floor(process.uptime()),
    devices: { online: agentSockets.size, total: db.prepare("SELECT COUNT(*) as c FROM devices").get().c },
    port, localIp: getLocalIp(), isDesktop: true,
  }))

  // ── Setup ─────────────────────────────────────────────────────────────────
  fastify.get('/api/setup/check', async () => {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    return { needsSetup: c === 0 }
  })

  fastify.post('/api/setup/init', async (req, reply) => {
    const { email, password, name = 'Admin' } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' })
    if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    if (c > 0) return reply.code(400).send({ error: 'Already initialized' })
    const hash = await bcrypt.hash(password, 12); const id = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, 'admin', hash)
    const accessToken  = signToken({ userId: id, email, role: 'admin' })
    const refreshToken = uuidv4()
    const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex')
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), id, refreshHash, new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: id, userEmail: email, action: 'setup_completed', ipAddress: req.ip })
    return { accessToken, refreshToken, user: { id, email, name, role: 'admin' } }
  })

  // ── Auth ──────────────────────────────────────────────────────────────────
  fastify.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'Email and password required' })
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email)
    if (!user) { dbLogAudit({ action: 'login_failed', userEmail: email, ipAddress: req.ip }); return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' }) }
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) { dbLogAudit({ userId: user.id, userEmail: email, action: 'login_failed', ipAddress: req.ip }); return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' }) }
    if (user.totp_enabled && user.totp_secret) {
      const totpToken = signToken({ userId: user.id, email: user.email, role: user.role, purpose: 'totp_verify' }, '5m')
      return { requiresTOTP: true, totpToken }
    }
    const accessToken  = signToken({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = uuidv4()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: user.id, userEmail: user.email, action: 'login_success', ipAddress: req.ip })
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.post('/api/auth/login/verify-totp', async (req, reply) => {
    const { totpToken, code } = req.body || {}
    if (!totpToken || !code) return reply.code(400).send({ error: 'totpToken and code required' })
    let payload; try { payload = verifyToken(totpToken) } catch { return reply.code(401).send({ error: 'Invalid token' }) }
    if (payload.purpose !== 'totp_verify') return reply.code(401).send({ error: 'Invalid token purpose' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(payload.userId)
    if (!user?.totp_secret) return reply.code(404).send({ error: 'User not found' })
    const valid = getAuthenticator().check(code.replace(/\s/g, ''), user.totp_secret)
    if (!valid) return reply.code(401).send({ error: 'Invalid TOTP code' })
    const accessToken  = signToken({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = uuidv4()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, crypto.createHash('sha256').update(refreshToken).digest('hex'), new Date(Date.now() + 30 * 24 * 3600000).toISOString())
    dbLogAudit({ userId: user.id, userEmail: user.email, action: 'login_success', details: { via: '2fa' }, ipAddress: req.ip })
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.post('/api/auth/refresh', async (req, reply) => {
    const { refreshToken } = req.body || {}
    if (!refreshToken) return reply.code(400).send({ error: 'refreshToken required' })
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const row  = db.prepare("SELECT * FROM refresh_tokens WHERE token_hash=? AND expires_at > ?").get(hash, new Date().toISOString())
    if (!row) return reply.code(401).send({ error: 'Invalid or expired refresh token' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(row.user_id)
    if (!user) return reply.code(401).send({ error: 'User not found' })
    return { accessToken: signToken({ userId: user.id, email: user.email, role: user.role }), user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.get('/api/auth/me', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const u = db.prepare("SELECT id, email, name, role, totp_enabled, created_at FROM users WHERE id=?").get(p.userId)
    if (!u) return reply.code(404).send({ error: 'Not found' })
    return u
  })

  fastify.post('/api/auth/ws-ticket', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const ticketId = uuidv4()
    wsTickets.set(ticketId, { ...p, expires: Date.now() + 30_000 })
    setTimeout(() => wsTickets.delete(ticketId), 31_000)
    return { ticket: ticketId }
  })

  fastify.post('/api/auth/logout', async (req) => {
    const { refreshToken } = req.body || {}
    if (refreshToken) db.prepare("DELETE FROM refresh_tokens WHERE token_hash=?").run(crypto.createHash('sha256').update(refreshToken).digest('hex'))
    return { ok: true }
  })

  fastify.post('/api/auth/change-password', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { currentPassword, newPassword } = req.body || {}
    if (!currentPassword || !newPassword) return reply.code(400).send({ error: 'Both passwords required' })
    if (newPassword.length < 8) return reply.code(400).send({ error: 'Min 8 characters' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(p.userId)
    if (!await bcrypt.compare(currentPassword, user.password_hash)) return reply.code(401).send({ error: 'Incorrect current password' })
    db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(await bcrypt.hash(newPassword, 12), p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'password_changed', ipAddress: req.ip })
    return { ok: true }
  })

  // ── 2FA ───────────────────────────────────────────────────────────────────
  fastify.post('/api/auth/2fa/setup', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const user   = db.prepare("SELECT email FROM users WHERE id=?").get(p.userId)
    const secret = getAuthenticator().generateSecret()
    db.prepare("UPDATE users SET totp_secret=? WHERE id=?").run(secret, p.userId)
    const otpUrl    = getAuthenticator().keyuri(user.email, 'AiRemote', secret)
    const qrCodeUrl = await getQRCode().toDataURL(otpUrl)
    return { secret, otpUrl, qrCodeUrl }
  })

  fastify.post('/api/auth/2fa/enable', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { code } = req.body || {}
    if (!code) return reply.code(400).send({ error: 'code required' })
    const user = db.prepare("SELECT totp_secret FROM users WHERE id=?").get(p.userId)
    if (!user?.totp_secret) return reply.code(400).send({ error: 'Run /2fa/setup first' })
    if (!getAuthenticator().check(code.replace(/\s/g, ''), user.totp_secret)) return reply.code(400).send({ error: 'Invalid code' })
    db.prepare("UPDATE users SET totp_enabled=1, updated_at=datetime('now') WHERE id=?").run(p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: '2fa_enabled', ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/auth/2fa/disable', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { password } = req.body || {}
    if (!password) return reply.code(400).send({ error: 'password required' })
    const user = db.prepare("SELECT * FROM users WHERE id=?").get(p.userId)
    if (!await bcrypt.compare(password, user.password_hash)) return reply.code(401).send({ error: 'Incorrect password' })
    db.prepare("UPDATE users SET totp_enabled=0, totp_secret=NULL, updated_at=datetime('now') WHERE id=?").run(p.userId)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: '2fa_disabled', ipAddress: req.ip })
    return { ok: true }
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  fastify.get('/api/users', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    return db.prepare("SELECT id, email, name, role, totp_enabled, created_at, updated_at FROM users ORDER BY created_at").all()
  })

  fastify.post('/api/users', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { email, name, password, role = 'viewer' } = req.body || {}
    if (!email || !name || !password) return reply.code(400).send({ error: 'email, name, password required' })
    if (password.length < 8) return reply.code(400).send({ error: 'Min 8 characters' })
    if (!['admin','viewer','user'].includes(role)) return reply.code(400).send({ error: 'Invalid role' })
    if (db.prepare("SELECT id FROM users WHERE email=?").get(email)) return reply.code(409).send({ error: 'Email already exists' })
    const id = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, role, await bcrypt.hash(password, 12))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_created', details: { email, name, role }, ipAddress: req.ip })
    return reply.code(201).send({ id, email, name, role })
  })

  fastify.patch('/api/users/:id', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { name, role, password } = req.body || {}
    const existing = db.prepare("SELECT * FROM users WHERE id=?").get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'User not found' })
    if (password) { if (password.length < 8) return reply.code(400).send({ error: 'Min 8 characters' }); db.prepare("UPDATE users SET password_hash=?, updated_at=datetime('now') WHERE id=?").run(await bcrypt.hash(password, 12), req.params.id) }
    const updates = []; const vals = []
    if (name) { updates.push('name=?'); vals.push(name) }
    if (role) { updates.push('role=?'); vals.push(role) }
    if (updates.length) { updates.push("updated_at=datetime('now')"); vals.push(req.params.id); db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...vals) }
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_updated', details: { targetId: req.params.id, name, role }, ipAddress: req.ip })
    return db.prepare("SELECT id, email, name, role, totp_enabled, created_at FROM users WHERE id=?").get(req.params.id)
  })

  fastify.delete('/api/users/:id', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    if (req.params.id === p.userId) return reply.code(400).send({ error: 'Cannot delete yourself' })
    const existing = db.prepare("SELECT email FROM users WHERE id=?").get(req.params.id)
    if (!existing) return reply.code(404).send({ error: 'User not found' })
    db.prepare("DELETE FROM users WHERE id=?").run(req.params.id)
    db.prepare("DELETE FROM refresh_tokens WHERE user_id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'user_deleted', details: { email: existing.email }, ipAddress: req.ip })
    return reply.code(204).send()
  })

  // ── Sessions ──────────────────────────────────────────────────────────────
  fastify.get('/api/sessions', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (p.role === 'admin') return db.prepare("SELECT s.*, d.name as device_name, u.email as user_email FROM sessions s LEFT JOIN devices d ON s.device_id=d.id LEFT JOIN users u ON s.user_id=u.id ORDER BY s.started_at DESC LIMIT 100").all()
    return db.prepare("SELECT s.*, d.name as device_name FROM sessions s LEFT JOIN devices d ON s.device_id=d.id WHERE s.user_id=? ORDER BY s.started_at DESC LIMIT 100").all(p.userId)
  })

  fastify.delete('/api/sessions/:id', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const s = db.prepare("SELECT id FROM sessions WHERE id=?").get(req.params.id)
    if (!s) return reply.code(404).send({ error: 'Session not found' })
    db.prepare("UPDATE sessions SET ended_at=datetime('now') WHERE id=?").run(req.params.id)
    return { ok: true }
  })

  // ── Devices ───────────────────────────────────────────────────────────────
  fastify.get('/api/devices', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return db.prepare("SELECT * FROM devices ORDER BY name").all().map(d => ({
      ...d, info: parseJson(d.info), tags: parseJson(d.tags, []),
      capabilities: parseJson(d.capabilities, {}), isOnline: agentSockets.has(d.id),
      stats: agentSockets.get(d.id)?.stats || null,
    }))
  })

  fastify.post('/api/devices', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { name, tags = [] } = req.body || {}
    if (!name) return reply.code(400).send({ error: 'name required' })
    const id = uuidv4(); const token = uuidv4()
    db.prepare("INSERT INTO devices (id, name, token, owner_id, tags) VALUES (?,?,?,?,?)").run(id, name, token, p.userId, JSON.stringify(tags))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_created', details: { name }, ipAddress: req.ip })
    return reply.code(201).send({ id, name, token, tags, status: 'offline', isOnline: false })
  })

  fastify.get('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const d = db.prepare("SELECT * FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    return { ...d, info: parseJson(d.info), tags: parseJson(d.tags, []), capabilities: parseJson(d.capabilities, {}), isOnline: agentSockets.has(d.id), stats: agentSockets.get(d.id)?.stats || null }
  })

  fastify.put('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { name, tags } = req.body || {}
    const updates = []; const vals = []
    if (name) { updates.push('name=?'); vals.push(name) }
    if (tags) { updates.push('tags=?'); vals.push(JSON.stringify(tags)) }
    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })
    updates.push("updated_at=datetime('now')"); vals.push(req.params.id)
    db.prepare(`UPDATE devices SET ${updates.join(',')} WHERE id=?`).run(...vals)
    return { ok: true }
  })

  fastify.delete('/api/devices/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const d = db.prepare("SELECT name FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    db.prepare("DELETE FROM devices WHERE id=?").run(req.params.id)
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_deleted', details: { name: d.name }, ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/devices/:id/wol', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const d = db.prepare("SELECT info FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Device not found' })
    const info = parseJson(d.info) || {}
    const mac  = info?.mac || req.body?.mac
    if (!mac) return reply.code(400).send({ error: 'No MAC address' })
    const mac_hex = mac.replace(/[:-]/g, '')
    if (mac_hex.length !== 12) return reply.code(400).send({ error: 'Invalid MAC' })
    const buf = Buffer.alloc(102); buf.fill(0xff, 0, 6)
    for (let i = 1; i <= 16; i++) for (let j = 0; j < 6; j++) buf[i * 6 + j] = parseInt(mac_hex.substr(j * 2, 2), 16)
    const dgram = require('dgram'); const sock = dgram.createSocket('udp4')
    sock.once('listening', () => sock.setBroadcast(true))
    sock.send(buf, 0, buf.length, 9, '255.255.255.255', () => sock.close())
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'device_wol', deviceId: req.params.id, details: { mac }, ipAddress: req.ip })
    return { ok: true, mac }
  })

  fastify.get('/api/devices/:id/stats/history', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const hours = Math.min(parseInt(req.query?.hours || '24'), 168)
    const since = new Date(Date.now() - hours * 3600000).toISOString()
    return db.prepare("SELECT cpu_percent, ram_percent, disk_percent, net_in_kb, net_out_kb, recorded_at FROM stats_history WHERE device_id=? AND recorded_at > ? ORDER BY recorded_at ASC").all(req.params.id, since)
  })

  // ── Device FS Relay ───────────────────────────────────────────────────────
  fastify.get('/api/devices/:id/fs', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    try { return await agentFsRequest(req.params.id, 'list', { path: req.query?.path || '/' }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.get('/api/devices/:id/fs/download', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { path: fsPath } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try {
      const data = await agentFsRequest(req.params.id, 'read', { path: fsPath })
      reply.header('Content-Disposition', `attachment; filename="${fsPath.split('/').pop() || 'file'}"`)
      reply.header('Content-Type', 'application/octet-stream')
      return Buffer.from(data?.base64 || '', 'base64')
    } catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.post('/api/devices/:id/fs/mkdir', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { path: fsPath } = req.body || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try { return await agentFsRequest(req.params.id, 'mkdir', { path: fsPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  fastify.delete('/api/devices/:id/fs', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { path: fsPath } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    try { return await agentFsRequest(req.params.id, 'delete', { path: fsPath }) }
    catch (e) { return reply.code(502).send({ error: e.message }) }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  fastify.get('/api/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rows = db.prepare("SELECT key, value FROM settings").all()
    const result = {}
    for (const r of rows) result[r.key] = parseJson(r.value, r.value)
    return result
  })

  fastify.put('/api/settings/:key', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?,?,datetime('now'))").run(req.params.key, JSON.stringify(req.body))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'settings_updated', details: { key: req.params.key }, ipAddress: req.ip })
    return { ok: true }
  })

  // ── AI ────────────────────────────────────────────────────────────────────
  fastify.get('/api/ai/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cfg = getAiConfig()
    if (!cfg) return { configured: false }
    return { configured: true, provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey }
  })

  fastify.put('/api/ai/settings', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { provider, apiKey, model, baseUrl } = req.body || {}
    if (!provider) return reply.code(400).send({ error: 'provider required' })
    const existing = getAiConfig() || {}
    const finalKey = apiKey && apiKey !== '__keep__' ? apiKey : existing.apiKey || ''
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('ai_config',?,datetime('now'))").run(JSON.stringify({ provider, apiKey: finalKey, model, baseUrl }))
    return { ok: true }
  })

  fastify.post('/api/ai/chat', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, message, conversationId, context } = req.body || {}
    if (!message) return reply.code(400).send({ error: 'message required' })
    const cfg = getAiConfig()
    if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    const convId   = conversationId || uuidv4()
    const existing = db.prepare("SELECT messages FROM ai_conversations WHERE id=?").get(convId)
    const history  = existing ? parseJson(existing.messages, []) : []
    const sysMsg   = { role: 'system', content: AI_SYSTEM_PROMPT + (context ? `\n\n${context}` : '') }
    const userMsg  = { role: 'user', content: message }
    try {
      const responseText = await callAI([sysMsg, ...history, userMsg], cfg)
      const newHistory   = [...history, userMsg, { role: 'assistant', content: responseText }]
      const now = new Date().toISOString()
      if (existing) { db.prepare("UPDATE ai_conversations SET messages=?, updated_at=? WHERE id=?").run(JSON.stringify(newHistory), now, convId) }
      else { db.prepare("INSERT INTO ai_conversations (id, device_id, user_id, title, messages, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(convId, deviceId || '', p.userId, message.slice(0, 60), JSON.stringify(newHistory), now, now) }
      return { conversationId: convId, response: responseText, model: cfg.model || 'default' }
    } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  fastify.post('/api/ai/chat/stream', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, message, conversationId, context } = req.body || {}
    if (!message) return reply.code(400).send({ error: 'message required' })
    const cfg = getAiConfig()
    if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    const convId   = conversationId || uuidv4()
    const existing = db.prepare("SELECT messages FROM ai_conversations WHERE id=?").get(convId)
    const history  = existing ? parseJson(existing.messages, []) : []
    const sysMsg   = { role: 'system', content: AI_SYSTEM_PROMPT + (context ? `\n\n${context}` : '') }
    const userMsg  = { role: 'user', content: message }

    reply.raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' })
    reply.raw.write(`data: ${JSON.stringify({ conversationId: convId })}\n\n`)

    let fullResponse = ''
    try {
      fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, true, (chunk) => {
        reply.raw.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`)
      })
      if (!fullResponse) {
        fullResponse = await callAI([sysMsg, ...history, userMsg], cfg, false)
        reply.raw.write(`data: ${JSON.stringify({ delta: fullResponse })}\n\n`)
      }
    } catch (e) { reply.raw.write(`data: ${JSON.stringify({ error: e.message })}\n\n`) }
    reply.raw.write('data: [DONE]\n\n'); reply.raw.end()

    try {
      const newHistory = [...history, userMsg, { role: 'assistant', content: fullResponse }]
      const now = new Date().toISOString()
      if (existing) { db.prepare("UPDATE ai_conversations SET messages=?, updated_at=? WHERE id=?").run(JSON.stringify(newHistory), now, convId) }
      else { db.prepare("INSERT INTO ai_conversations (id, device_id, user_id, title, messages, created_at, updated_at) VALUES (?,?,?,?,?,?,?)").run(convId, deviceId || '', p.userId, message.slice(0, 60), JSON.stringify(newHistory), now, now) }
    } catch {}
  })

  fastify.post('/api/ai/auto-heal', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, issue, stats, logs: agentLogs } = req.body || {}
    if (!issue) return reply.code(400).send({ error: 'issue required' })
    const cfg = getAiConfig(); if (!cfg) return reply.code(400).send({ error: 'AI not configured' })
    const prompt = `أنت خبير في إدارة الخوادم. حلّل المشكلة التالية واقترح خطوات الإصلاح:\nالمشكلة: ${issue}${stats ? `\nالإحصائيات: CPU: ${stats.cpuPercent}%, RAM: ${stats.ramPercent}%` : ''}${agentLogs ? `\nLogs:\n${agentLogs}` : ''}`
    try {
      const analysis = await callAI([{ role: 'user', content: prompt }], cfg)
      return { analysis, deviceId }
    } catch (e) { return reply.code(500).send({ error: e.message }) }
  })

  fastify.get('/api/ai/conversations', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    if (deviceId) return db.prepare("SELECT id, device_id, title, created_at, updated_at FROM ai_conversations WHERE user_id=? AND device_id=? ORDER BY updated_at DESC LIMIT 50").all(p.userId, deviceId)
    return db.prepare("SELECT id, device_id, title, created_at, updated_at FROM ai_conversations WHERE user_id=? ORDER BY updated_at DESC LIMIT 50").all(p.userId)
  })

  fastify.get('/api/ai/conversations/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const conv = db.prepare("SELECT * FROM ai_conversations WHERE id=? AND user_id=?").get(req.params.id, p.userId)
    if (!conv) return reply.code(404).send({ error: 'Not found' })
    return { ...conv, messages: parseJson(conv.messages, []) }
  })

  fastify.delete('/api/ai/conversations/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    db.prepare("DELETE FROM ai_conversations WHERE id=? AND user_id=?").run(req.params.id, p.userId)
    return reply.code(204).send()
  })

  // ── Alerts ────────────────────────────────────────────────────────────────
  fastify.get('/api/alerts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return db.prepare("SELECT * FROM alert_rules WHERE user_id=? ORDER BY created_at DESC").all(p.userId)
  })

  fastify.post('/api/alerts', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { type, deviceId, threshold, cooldownMin = 30, channel = 'in_app', webhookUrl } = req.body || {}
    const validTypes = ['device_offline','device_online','cpu_high','ram_high','disk_high']
    if (!validTypes.includes(type)) return reply.code(400).send({ error: `type must be one of: ${validTypes.join(', ')}` })
    const id = uuidv4()
    db.prepare("INSERT INTO alert_rules (id, user_id, device_id, type, threshold, cooldown_min, channel, webhook_url) VALUES (?,?,?,?,?,?,?,?)").run(id, p.userId, deviceId || null, type, threshold || null, cooldownMin, channel, webhookUrl || null)
    return reply.code(201).send({ id, type, deviceId, threshold, cooldownMin, channel })
  })

  fastify.patch('/api/alerts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rule = db.prepare("SELECT * FROM alert_rules WHERE id=?").get(req.params.id)
    if (!rule) return reply.code(404).send({ error: 'Not found' })
    if (rule.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("UPDATE alert_rules SET enabled=? WHERE id=?").run((req.body?.enabled ? 1 : 0), req.params.id)
    return { ok: true }
  })

  fastify.delete('/api/alerts/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rule = db.prepare("SELECT user_id FROM alert_rules WHERE id=?").get(req.params.id)
    if (!rule) return reply.code(404).send({ error: 'Not found' })
    if (rule.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("DELETE FROM alert_rules WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── SSH Credentials ───────────────────────────────────────────────────────
  fastify.get('/api/credentials', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    if (deviceId) return db.prepare("SELECT id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, last_used, created_at FROM device_credentials WHERE user_id=? AND device_id=? ORDER BY created_at DESC").all(p.userId, deviceId)
    return db.prepare("SELECT id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, last_used, created_at FROM device_credentials WHERE user_id=? ORDER BY created_at DESC").all(p.userId)
  })

  fastify.post('/api/credentials', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, label, sshHost, sshPort = 22, sshUsername, secretType = 'password', secret } = req.body || {}
    if (!deviceId || !label || !sshHost || !sshUsername || !secret) return reply.code(400).send({ error: 'deviceId, label, sshHost, sshUsername, secret required' })
    const id = uuidv4()
    db.prepare("INSERT INTO device_credentials (id, user_id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, secret_enc) VALUES (?,?,?,?,?,?,?,?,?)").run(id, p.userId, deviceId, label, sshHost, sshPort, sshUsername, secretType, encryptSecret(secret))
    return reply.code(201).send({ id, deviceId, label, sshHost, sshPort, sshUsername, secretType })
  })

  fastify.delete('/api/credentials/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cred = db.prepare("SELECT user_id FROM device_credentials WHERE id=?").get(req.params.id)
    if (!cred) return reply.code(404).send({ error: 'Not found' })
    if (cred.user_id !== p.userId && p.role !== 'admin') return reply.code(403).send({ error: 'Forbidden' })
    db.prepare("DELETE FROM device_credentials WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── SFTP ──────────────────────────────────────────────────────────────────
  fastify.post('/api/sftp/connect', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { host, port = 22, username, password, privateKey, credentialId } = req.body || {}
    let fHost = host, fPort = port, fUser = username, fPass = password, fKey = privateKey
    if (credentialId) {
      const cred = db.prepare("SELECT * FROM device_credentials WHERE id=? AND user_id=?").get(credentialId, p.userId)
      if (!cred) return reply.code(404).send({ error: 'Credential not found' })
      fHost = cred.ssh_host; fPort = cred.ssh_port; fUser = cred.ssh_username
      const sec = decryptSecret(cred.secret_enc)
      if (cred.secret_type === 'private_key') fKey = sec; else fPass = sec
      db.prepare("UPDATE device_credentials SET last_used=datetime('now') WHERE id=?").run(credentialId)
    }
    if (!fHost || !fUser) return reply.code(400).send({ error: 'host and username required' })
    return new Promise((resolve) => {
      try {
        const { Client } = getSsh2(); const conn = new Client(); const sessionId = uuidv4()
        const authConf = { host: fHost, port: fPort, username: fUser }
        if (fKey) authConf.privateKey = fKey; else if (fPass) authConf.password = fPass
        conn.on('ready', () => {
          conn.sftp((err, sftp) => {
            if (err) { conn.end(); resolve(reply.code(502).send({ error: err.message })); return }
            sftpSessions.set(sessionId, { sftp, conn })
            setTimeout(() => { if (sftpSessions.has(sessionId)) { try { sftpSessions.get(sessionId).conn.end() } catch {}; sftpSessions.delete(sessionId) } }, 30 * 60000)
            resolve({ sessionId, host: fHost, username: fUser })
          })
        })
        conn.on('error', err => resolve(reply.code(502).send({ error: err.message })))
        conn.connect(authConf)
      } catch (e) { resolve(reply.code(502).send({ error: e.message })) }
    })
  })

  fastify.get('/api/sftp/:sessionId/list', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    return new Promise((resolve) => {
      sess.sftp.readdir(req.query?.path || '/', (err, list) => {
        if (err) { resolve(reply.code(502).send({ error: err.message })); return }
        resolve(list.map(f => ({ name: f.filename, type: f.attrs.isDirectory() ? 'directory' : 'file', size: f.attrs.size, modified: new Date(f.attrs.mtime * 1000).toISOString(), mode: f.attrs.mode })))
      })
    })
  })

  fastify.get('/api/sftp/:sessionId/download', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { path: fsPath } = req.query || {}
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => {
      const chunks = []; const stream = sess.sftp.createReadStream(fsPath)
      stream.on('data', c => chunks.push(c))
      stream.on('end', () => {
        const buf = Buffer.concat(chunks)
        reply.header('Content-Disposition', `attachment; filename="${fsPath.split('/').pop() || 'file'}"`).header('Content-Type', 'application/octet-stream')
        resolve(buf)
      })
      stream.on('error', err => resolve(reply.code(502).send({ error: err.message })))
    })
  })

  fastify.post('/api/sftp/:sessionId/mkdir', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    const { path: fsPath } = req.body || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => { sess.sftp.mkdir(fsPath, err => err ? resolve(reply.code(502).send({ error: err.message })) : resolve({ ok: true })) })
  })

  fastify.delete('/api/sftp/:sessionId/delete', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (!sess) return reply.code(404).send({ error: 'SFTP session not found' })
    const { path: fsPath, type } = req.query || {}
    if (!fsPath) return reply.code(400).send({ error: 'path required' })
    return new Promise((resolve) => {
      const fn = type === 'directory' ? 'rmdir' : 'unlink'
      sess.sftp[fn](fsPath, err => err ? resolve(reply.code(502).send({ error: err.message })) : resolve({ ok: true }))
    })
  })

  fastify.post('/api/sftp/:sessionId/close', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const sess = sftpSessions.get(req.params.sessionId)
    if (sess) { try { sess.conn.end() } catch {}; sftpSessions.delete(req.params.sessionId) }
    return { ok: true }
  })

  // ── Recordings ────────────────────────────────────────────────────────────
  fastify.get('/api/recordings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId } = req.query || {}
    const base = "SELECT r.*, d.name as device_name FROM recordings r LEFT JOIN devices d ON r.device_id=d.id"
    if (deviceId) {
      return p.role === 'admin'
        ? db.prepare(`${base} WHERE r.device_id=? ORDER BY r.created_at DESC LIMIT 100`).all(deviceId)
        : db.prepare(`${base} WHERE r.device_id=? AND r.user_id=? ORDER BY r.created_at DESC LIMIT 100`).all(deviceId, p.userId)
    }
    return p.role === 'admin'
      ? db.prepare(`${base} ORDER BY r.created_at DESC LIMIT 100`).all()
      : db.prepare(`${base} WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 100`).all(p.userId)
  })

  fastify.post('/api/recordings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const { deviceId, name } = req.body || {}
    if (!deviceId) return reply.code(400).send({ error: 'deviceId required' })
    const id = uuidv4(); const now = new Date().toISOString()
    db.prepare("INSERT INTO recordings (id, device_id, user_id, name, started_at) VALUES (?,?,?,?,?)").run(id, deviceId, p.userId, name || `Recording ${now.slice(0,10)}`, now)
    return reply.code(201).send({ id, deviceId, userId: p.userId, name, startedAt: now })
  })

  fastify.patch('/api/recordings/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    if (!db.prepare("SELECT id FROM recordings WHERE id=?").get(req.params.id)) return reply.code(404).send({ error: 'Not found' })
    const now = new Date().toISOString()
    db.prepare("UPDATE recordings SET ended_at=? WHERE id=?").run(now, req.params.id)
    return { ok: true, endedAt: now }
  })

  fastify.delete('/api/recordings/:id', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const rec = db.prepare("SELECT * FROM recordings WHERE id=?").get(req.params.id)
    if (!rec) return reply.code(404).send({ error: 'Not found' })
    if (rec.file_path && fs.existsSync(rec.file_path)) try { fs.unlinkSync(rec.file_path) } catch {}
    db.prepare("DELETE FROM recordings WHERE id=?").run(req.params.id)
    return reply.code(204).send()
  })

  // ── Audit Log ─────────────────────────────────────────────────────────────
  fastify.get('/api/audit', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const limit = Math.min(parseInt(req.query?.limit || '100'), 500)
    const offset = parseInt(req.query?.offset || '0')
    const { action, userId } = req.query || {}
    let sql = "SELECT * FROM audit_log WHERE 1=1"; const args = []
    if (action) { sql += " AND action=?"; args.push(action) }
    if (userId) { sql += " AND user_id=?"; args.push(userId) }
    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?"; args.push(limit, offset)
    return db.prepare(sql).all(...args)
  })

  // ── Notifications ─────────────────────────────────────────────────────────
  fastify.get('/api/notifications', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return []
  })

  // ── GitHub Releases ───────────────────────────────────────────────────────
  const REPO_ROOT    = path.resolve(__dirname, '../..')
  const RELEASES_DIR = path.join(REPO_ROOT, 'releases')

  const GH_RELEASES = [
    { id: 'win-gui',    label: 'Windows Agent (GUI)',    assetName: `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`, filePath: path.join(RELEASES_DIR, 'agent-windows',  `AiRemote-Agent-v${AGENT_VERSION}-Windows-x64.zip`) },
    { id: 'win-exe',    label: 'Windows Agent (CLI)',    assetName: `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`,     filePath: path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-win-x64.exe`) },
    { id: 'linux-bin',  label: 'Linux Agent (Binary)',   assetName: `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`,       filePath: path.join(RELEASES_DIR, 'agent-headless', `AiRemote-Agent-v${AGENT_VERSION}-linux-x64`) },
    { id: 'script-js',  label: 'Node.js Script',         assetName: `agent-v${AGENT_VERSION}.js`,                       filePath: path.join(RELEASES_DIR, 'agent-script',   `agent-v${AGENT_VERSION}.js`) },
    { id: 'script-pkg', label: 'Script Package (ZIP)',   assetName: `agent-script-v${AGENT_VERSION}.zip`,               filePath: path.join(RELEASES_DIR, 'agent-script',   `agent-script-v${AGENT_VERSION}.zip`) },
  ]

  async function ghApi(method, url, token, body, fileBuffer, contentType) {
    const headers = { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': `AiRemote/${AGENT_VERSION}` }
    let fetchBody
    if (fileBuffer) { headers['Content-Type'] = contentType || 'application/octet-stream'; headers['Content-Length'] = String(fileBuffer.length); fetchBody = fileBuffer }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; fetchBody = JSON.stringify(body) }
    const res = await fetch(url, { method, headers, body: fetchBody })
    if (!res.ok) { const t = await res.text().catch(() => ''); let msg = `GitHub API ${res.status}`; try { const j = JSON.parse(t); if (j.message) msg += ': ' + j.message } catch {}; throw new Error(msg) }
    if (res.status === 204) return {}
    return res.json()
  }

  function getGhConfig() {
    const row = db.prepare("SELECT value FROM settings WHERE key='github_config'").get()
    return row ? parseJson(row.value) : null
  }

  fastify.get('/api/github/config', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const cfg = getGhConfig()
    return cfg ? { configured: true, owner: cfg.owner, repo: cfg.repo, tokenSet: !!cfg.token } : { configured: false }
  })

  fastify.post('/api/github/config', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const { token, owner, repo } = req.body || {}
    if (!owner?.trim() || !repo?.trim()) return reply.code(400).send({ error: 'owner and repo required' })
    const existing = getGhConfig()
    const finalToken = token?.trim() && token !== '__keep__' ? token.trim() : existing?.token || ''
    if (!finalToken) return reply.code(400).send({ error: 'Token required' })
    db.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('github_config',?,datetime('now'))").run(JSON.stringify({ token: finalToken, owner: owner.trim(), repo: repo.trim() }))
    dbLogAudit({ userId: p.userId, userEmail: p.email, action: 'github_config_saved', ipAddress: req.ip })
    return { ok: true }
  })

  fastify.post('/api/github/test', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const cfg = getGhConfig(); if (!cfg) return reply.code(400).send({ error: 'GitHub not configured' })
    try {
      const user = await ghApi('GET', 'https://api.github.com/user', cfg.token)
      const repo = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}`, cfg.token)
      return { ok: true, user: user.login, repo: repo.full_name, private: repo.private }
    } catch (e) { return reply.code(400).send({ error: e.message }) }
  })

  fastify.get('/api/github/releases', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    return GH_RELEASES.map(r => {
      const exists = fs.existsSync(r.filePath)
      return { id: r.id, label: r.label, assetName: r.assetName, exists, sizeMB: exists ? (fs.statSync(r.filePath).size / 1024 / 1024).toFixed(1) : null }
    })
  })

  fastify.post('/api/github/publish/:releaseId', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    const cfg = getGhConfig(); if (!cfg) return reply.code(400).send({ error: 'Configure GitHub first' })
    const { releaseId } = req.params
    const validIds = [...GH_RELEASES.map(r => r.id), 'all']
    if (!validIds.includes(releaseId)) return reply.code(400).send({ error: 'Invalid releaseId' })
    const publishId = `${releaseId}-${Date.now()}`
    publishStates.set(publishId, { status: 'running', log: [], startedAt: new Date().toISOString() })

    ;(async () => {
      const state = publishStates.get(publishId)
      const log   = (msg) => { state.log.push(msg); console.log(`[GitHub] ${msg}`) }
      const targets = releaseId === 'all' ? GH_RELEASES : GH_RELEASES.filter(r => r.id === releaseId)
      const available = targets.filter(r => fs.existsSync(r.filePath))
      if (!available.length) { state.status = 'error'; log('لا توجد ملفات — قم ببناء الإصدار أولاً'); state.finishedAt = new Date().toISOString(); return }
      try {
        log(`التحقق من الإصدار v${AGENT_VERSION}...`)
        let release
        try { release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/tags/v${AGENT_VERSION}`, cfg.token) }
        catch { release = await ghApi('POST', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases`, cfg.token, { tag_name: `v${AGENT_VERSION}`, name: `AiRemote v${AGENT_VERSION}`, draft: false, prerelease: false }); log(`تم إنشاء إصدار جديد`) }
        release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/${release.id}`, cfg.token)
        state.url = release.html_url
        const uploadBase = release.upload_url.replace('{?name,label}', '')
        for (const def of available) {
          log(`📦 رفع ${def.assetName}...`)
          const existing = release.assets?.find(a => a.name === def.assetName)
          if (existing) { await ghApi('DELETE', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/assets/${existing.id}`, cfg.token); log('  حذف النسخة القديمة') }
          const buf = fs.readFileSync(def.filePath)
          const ct  = def.assetName.endsWith('.zip') ? 'application/zip' : def.assetName.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable' : 'application/octet-stream'
          await ghApi('POST', `${uploadBase}?name=${encodeURIComponent(def.assetName)}`, cfg.token, undefined, buf, ct)
          log(`  ✅ ${def.assetName} (${(buf.length/1024/1024).toFixed(1)} MB)`)
        }
        state.status = 'done'; state.finishedAt = new Date().toISOString(); log(`🎉 اكتمل النشر`)
      } catch (e) { state.status = 'error'; state.finishedAt = new Date().toISOString(); log(`❌ ${e.message}`) }
    })().catch(() => {})

    return { publishId }
  })

  fastify.get('/api/github/publish/:publishId/status', async (req, reply) => {
    if (!adminMiddleware(req, reply)) return
    const state = publishStates.get(req.params.publishId)
    if (!state) return reply.code(404).send({ error: 'Publish job not found' })
    return state
  })

  // ── Downloads (via GitHub API) ────────────────────────────────────────────
  fastify.get('/api/downloads/releases', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    const cfg = getGhConfig()
    if (!cfg) return { configured: false, releases: [], version: AGENT_VERSION }
    try {
      const release = await ghApi('GET', `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/releases/latest`, cfg.token)
      return {
        configured: true, version: release.tag_name, releaseName: release.name,
        releaseUrl: release.html_url, publishedAt: release.published_at,
        assets: (release.assets || []).map(a => ({
          name: a.name, size: a.size, downloadUrl: a.browser_download_url,
          platform: a.name.includes('Windows') || a.name.endsWith('.exe') ? 'windows' : a.name.includes('linux') ? 'linux' : 'any',
          updatedAt: a.updated_at,
        })),
      }
    } catch (e) { return { configured: true, assets: [], version: AGENT_VERSION, error: e.message } }
  })

  fastify.get('/api/downloads/version', async () => ({ version: AGENT_VERSION, isDesktop: true }))

  // ── Desktop API ───────────────────────────────────────────────────────────
  fastify.get('/api/desktop/status', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return { ...(_desktopCallbacks.getStatus?.() || {}), isDesktop: true, version: AGENT_VERSION }
  })

  fastify.post('/api/desktop/server/restart', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.restartServer?.().catch?.(() => {})
    return { ok: true }
  })

  fastify.post('/api/desktop/tunnel/start', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.startTunnel?.()
    return { ok: true }
  })

  fastify.post('/api/desktop/tunnel/stop', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    _desktopCallbacks.stopTunnel?.()
    return { ok: true }
  })

  fastify.get('/api/desktop/logs', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    return _desktopCallbacks.getLogs?.(parseInt(req.query?.n || '100')) || []
  })

  fastify.get('/api/desktop/settings', async (req, reply) => {
    const p = authMiddleware(req, reply); if (!p) return
    return _desktopCallbacks.getDesktopSettings?.() || {}
  })

  fastify.put('/api/desktop/settings', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    await _desktopCallbacks.setDesktopSettings?.(req.body)
    return { ok: true }
  })

  fastify.post('/api/desktop/backup', async (req, reply) => {
    const p = adminMiddleware(req, reply); if (!p) return
    try {
      return await (_desktopCallbacks.createBackup?.() || Promise.reject(new Error('Backup not available')))
    } catch (e) { return reply.code(500).send({ ok: false, error: e.message }) }
  })

  // ── WebSockets ────────────────────────────────────────────────────────────
  fastify.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      if (q.agent === '1' || q.type === 'agent') { handleAgentWs(socket); return }
      const user = resolveWsUser(q)
      if (!user) { socket.close(); return }
      handleClientWs(socket)
    })

    app.get('/pty', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      if (!resolveWsUser(q)) { socket.close(); return }
      handlePtyWs(socket, request)
    })

    app.get('/screen', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      if (!resolveWsUser(q)) { socket.close(); return }
      handleScreenWs(socket, request)
    })

    app.get('/ssh', { websocket: true }, (socket, request) => {
      const q = request.query || {}
      if (!resolveWsUser(q)) { socket.close(); return }
      handleSshWs(socket)
    })
  })

  await fastify.listen({ port, host: '0.0.0.0' })
  started    = true
  _startedAt = Date.now()
  log?.info('server', `✅ AiRemote Server v${AGENT_VERSION} listening on port ${port}`)
  log?.info('server', `📡 Local IP: ${getLocalIp()}`)
  log?.info('server', hasDashboard ? '🖥️  Dashboard: embedded (static)' : '⚠️  Dashboard: not built yet')
}

async function stop() {
  if (!started || !fastify) return
  started = false; _startedAt = null
  for (const [id] of agentSockets) markDeviceOffline(id)
  agentSockets.clear(); clientSockets.clear(); ptyClients.clear()
  screenViewers.clear(); wsTickets.clear()
  for (const { conn } of sftpSessions.values()) try { conn.end() } catch {}
  sftpSessions.clear()
  for (const { conn } of sshSessions.values()) try { conn.end() } catch {}
  sshSessions.clear()
  try { await fastify.close() } catch {}
  if (db) { try { db.close() } catch {} }
  db = null; fastify = null
}

function getStatus() {
  return { running: started, port: _config.port || 3001, devicesOnline: agentSockets.size, localIp: getLocalIp(), startedAt: _startedAt, version: AGENT_VERSION }
}

function getAllDevices() {
  if (!db) return []
  return db.prepare("SELECT id, name, token, status, last_seen, tags, info FROM devices ORDER BY name").all()
    .map(d => ({ ...d, info: parseJson(d.info), tags: parseJson(d.tags, []), isOnline: agentSockets.has(d.id) }))
}

module.exports = { start, stop, getStatus, getAllDevices, events }
