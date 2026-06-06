'use strict'
/**
 * server.js — AiRemote Fastify Server (self-contained, better-sqlite3, jsonwebtoken)
 * Compatible with all AiRemote agents v3.2.0+
 * Runs inside the Electron main process.
 */
const Fastify          = require('fastify')
const fcors            = require('@fastify/cors')
const fws              = require('@fastify/websocket')
const frateLimit       = require('@fastify/rate-limit')
const bcrypt           = require('bcryptjs')
const jwt              = require('jsonwebtoken')
const { v4: uuidv4 }   = require('uuid')
const Database         = require('better-sqlite3')
const path             = require('path')
const fs               = require('fs')
const os               = require('os')
const { EventEmitter } = require('events')
const crypto           = require('crypto')

// ─────────────────────────────────────────────────────────────────────────────
// Registry (in-memory)
// ─────────────────────────────────────────────────────────────────────────────
const agentSockets  = new Map()   // deviceId → { ws, info, deviceName, connectedAt, stats }
const clientSockets = new Set()   // Set<WebSocket>
const wsTickets     = new Map()   // ticketId → { userId, email, role, expires }

const events = new EventEmitter()

// ─────────────────────────────────────────────────────────────────────────────
// Database
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
      last_seen      TEXT,
      created_at     TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id           TEXT PRIMARY KEY,
      device_id    TEXT NOT NULL,
      user_id      TEXT NOT NULL,
      type         TEXT NOT NULL,
      started_at   TEXT NOT NULL DEFAULT (datetime('now')),
      ended_at     TEXT,
      duration_sec INTEGER
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
    CREATE INDEX IF NOT EXISTS idx_devices_token   ON devices(token);
    CREATE INDEX IF NOT EXISTS idx_devices_owner   ON devices(owner_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_device ON sessions(device_id);
  `)

  // Cleanup expired tokens on start
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(new Date().toISOString())
}

// ─────────────────────────────────────────────────────────────────────────────
// JWT helpers
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
  return null
}

function authMiddleware(req, reply) {
  const token = extractBearer(req)
  if (!token) { reply.code(401).send({ error: 'Unauthorized' }); return null }
  try { return verifyToken(token) } catch { reply.code(401).send({ error: 'Invalid token' }); return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function sendJson(ws, obj) {
  try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) } catch {}
}

function broadcastToClients(msg) {
  for (const ws of clientSockets) sendJson(ws, msg)
}

function markDeviceOnline(deviceId, info) {
  const infoStr = info ? JSON.stringify(info) : undefined
  if (infoStr) {
    db.prepare("UPDATE devices SET status='online', info=?, last_seen=datetime('now'), updated_at=datetime('now') WHERE id=?").run(infoStr, deviceId)
  } else {
    db.prepare("UPDATE devices SET status='online', last_seen=datetime('now'), updated_at=datetime('now') WHERE id=?").run(deviceId)
  }
}

function markDeviceOffline(deviceId) {
  db.prepare("UPDATE devices SET status='offline', updated_at=datetime('now') WHERE id=?").run(deviceId)
  broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'offline' } })
  events.emit('device:disconnected', deviceId)
}

function getLocalIp() {
  const nets = os.networkInterfaces()
  for (const n of Object.values(nets)) {
    for (const i of n) {
      if (!i.internal && i.family === 'IPv4') return i.address
    }
  }
  return '127.0.0.1'
}

function parseJson(str) {
  try { return JSON.parse(str) } catch { return null }
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket — Agent handler
// ─────────────────────────────────────────────────────────────────────────────
function handleAgentWs(socket) {
  let deviceId   = null
  let registered = false

  const PING_MS = 15000
  const PONG_MS = 12000
  let pingTimer = null
  let pongTimer = null

  function schedulePing() {
    clearTimeout(pingTimer)
    pingTimer = setTimeout(() => {
      if (socket.readyState !== 1) return
      pongTimer = setTimeout(() => { socket.terminate() }, PONG_MS)
      try { socket.ping() } catch {}
      sendJson(socket, { type: 'server:ping', payload: {}, timestamp: Date.now() })
    }, PING_MS)
  }

  function clearPong() { clearTimeout(pongTimer); pongTimer = null }

  socket.on('pong', () => { clearPong(); schedulePing() })

  socket.on('message', (raw, isBinary) => {
    // ── Binary frame: 4-byte sessionId length + sessionId + JPEG ────────────
    if (isBinary) {
      if (!deviceId) return
      try {
        const buf       = Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
        const idLen     = buf.readUInt32BE(0)
        const sessionId = buf.slice(4, 4 + idLen).toString('utf8')
        const frame     = buf.slice(4 + idLen)
        broadcastToClients({ type: 'screen:frame', payload: { deviceId, sessionId, data: frame.toString('base64') } })
      } catch {}
      return
    }

    let msg
    try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg

    clearPong()
    schedulePing()

    // ── Register ─────────────────────────────────────────────────────────────
    if (type === 'agent:register') {
      const { token, info } = payload
      const device = db.prepare("SELECT * FROM devices WHERE token=?").get(token)
      if (!device) {
        sendJson(socket, { type: 'server:error', payload: { message: 'Invalid token' } })
        socket.close()
        return
      }
      deviceId   = device.id
      registered = true
      markDeviceOnline(deviceId, info)
      agentSockets.set(deviceId, { ws: socket, info, deviceName: device.name, connectedAt: Date.now() })

      sendJson(socket, { type: 'server:registered', payload: { deviceId, name: device.name } })
      broadcastToClients({ type: 'device:status', payload: { deviceId, status: 'online', name: device.name, info } })
      events.emit('device:connected', deviceId, device.name)
      schedulePing()
      return
    }

    if (!registered) { socket.close(); return }

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    if (type === 'agent:heartbeat') {
      const { stats } = payload
      markDeviceOnline(deviceId, null)
      const rec = agentSockets.get(deviceId)
      if (rec && stats) rec.stats = stats
      sendJson(socket, { type: 'server:pong', payload: {} })
      broadcastToClients({ type: 'device:heartbeat', payload: { deviceId, stats } })
      return
    }

    if (type === 'agent:pong') { clearPong(); schedulePing(); return }

    // ── Command result ────────────────────────────────────────────────────────
    if (type === 'agent:command_result') {
      broadcastToClients({ type: 'agent:command_result', payload: { ...payload, deviceId } })
      return
    }

    // ── Screen frame (JSON) ───────────────────────────────────────────────────
    if (type === 'agent:screen_frame') {
      broadcastToClients({ type: 'screen:frame', payload: { deviceId, ...payload } })
      return
    }
  })

  socket.on('close', () => {
    clearTimeout(pingTimer)
    clearTimeout(pongTimer)
    if (deviceId) {
      agentSockets.delete(deviceId)
      markDeviceOffline(deviceId)
    }
  })

  socket.on('error', () => {})
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket — Dashboard client handler
// ─────────────────────────────────────────────────────────────────────────────
function handleClientWs(socket) {
  clientSockets.add(socket)

  // Send initial snapshot
  const devices  = db.prepare("SELECT * FROM devices ORDER BY name").all()
  const snapshot = devices.map(d => ({
    ...d,
    info:     parseJson(d.info),
    tags:     parseJson(d.tags) || [],
    isOnline: agentSockets.has(d.id),
    stats:    agentSockets.get(d.id)?.stats || null,
  }))
  sendJson(socket, { type: 'server:snapshot', payload: { devices: snapshot } })

  socket.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(raw) } catch { return }
    const { type, payload = {} } = msg

    if (type === 'client:command') {
      const { deviceId, command, cmdType = 'shell', sessionId } = payload
      const commandId = uuidv4()
      const rec = agentSockets.get(deviceId)
      if (!rec) {
        sendJson(socket, { type: 'agent:command_result', payload: { commandId, deviceId, error: 'Device offline' } })
        return
      }
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
  })

  socket.on('close', () => { clientSockets.delete(socket) })
  socket.on('error', () => { clientSockets.delete(socket) })
}

// ─────────────────────────────────────────────────────────────────────────────
// Fastify + routes
// ─────────────────────────────────────────────────────────────────────────────
let fastify = null
let started = false
let _config = {}

async function start(config) {
  if (started) return
  _config = config
  const { port = 3001, jwtSecret, dbPath, logger: log } = config
  JWT = jwtSecret

  initDb(dbPath)

  fastify = Fastify({ logger: false })
  await fastify.register(fcors, { origin: true, credentials: true })
  await fastify.register(frateLimit, { global: false, max: 5, timeWindow: '1 minute' })
  await fastify.register(fws)

  // ── Health ──────────────────────────────────────────────────────────────────
  fastify.get('/api/health', async () => ({
    status:  'ok',
    version: '3.2.0',
    uptime:  Math.floor(process.uptime()),
    devices: { online: agentSockets.size },
    port,
    localIp: getLocalIp(),
  }))

  // ── Auth ────────────────────────────────────────────────────────────────────
  fastify.post('/api/auth/login', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } }
  }, async (req, reply) => {
    const { email, password } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'Email and password required' })
    const user = db.prepare("SELECT * FROM users WHERE email=?").get(email)
    if (!user) return reply.code(401).send({ error: 'Invalid credentials' })
    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })
    const accessToken  = signToken({ userId: user.id, email: user.email, role: user.role })
    const refreshToken = uuidv4()
    const refreshHash  = crypto.createHash('sha256').update(refreshToken).digest('hex')
    const refreshExp   = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    db.prepare("INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?,?,?,?)").run(uuidv4(), user.id, refreshHash, refreshExp)
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  })

  fastify.get('/api/auth/me', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const u = db.prepare("SELECT id, email, name, role FROM users WHERE id=?").get(payload.userId)
    if (!u) return reply.code(404).send({ error: 'Not found' })
    return u
  })

  fastify.post('/api/auth/ws-ticket', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const ticketId = uuidv4()
    wsTickets.set(ticketId, { ...payload, expires: Date.now() + 30_000 })
    setTimeout(() => wsTickets.delete(ticketId), 31_000)
    return { ticket: ticketId }
  })

  fastify.post('/api/auth/logout', async (req) => {
    const { refreshToken } = req.body || {}
    if (refreshToken) {
      const h = crypto.createHash('sha256').update(refreshToken).digest('hex')
      db.prepare("DELETE FROM refresh_tokens WHERE token_hash=?").run(h)
    }
    return { ok: true }
  })

  // ── Setup ───────────────────────────────────────────────────────────────────
  fastify.get('/api/setup/check', async () => {
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    return { needsSetup: c === 0 }
  })

  fastify.post('/api/setup/init', async (req, reply) => {
    const { email, password, name = 'Admin' } = req.body || {}
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' })
    const { c } = db.prepare("SELECT COUNT(*) as c FROM users").get()
    if (c > 0) return reply.code(400).send({ error: 'Already initialized' })
    const hash = await bcrypt.hash(password, 12)
    const id   = uuidv4()
    db.prepare("INSERT INTO users (id, email, name, role, password_hash) VALUES (?,?,?,?,?)").run(id, email, name, 'admin', hash)
    const accessToken = signToken({ userId: id, email, role: 'admin' })
    return { accessToken, user: { id, email, name, role: 'admin' } }
  })

  // ── Devices ─────────────────────────────────────────────────────────────────
  fastify.get('/api/devices', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    return db.prepare("SELECT * FROM devices ORDER BY name").all().map(d => ({
      ...d, info: parseJson(d.info), tags: parseJson(d.tags) || [], isOnline: agentSockets.has(d.id)
    }))
  })

  fastify.post('/api/devices', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const { name, tags = [] } = req.body || {}
    if (!name) return reply.code(400).send({ error: 'name required' })
    const id = uuidv4(); const token = uuidv4()
    db.prepare("INSERT INTO devices (id, name, token, owner_id, tags) VALUES (?,?,?,?,?)").run(id, name, token, payload.userId, JSON.stringify(tags))
    return { id, name, token, tags, status: 'offline', isOnline: false }
  })

  fastify.get('/api/devices/:id', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const d = db.prepare("SELECT * FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Not found' })
    return { ...d, info: parseJson(d.info), tags: parseJson(d.tags) || [], isOnline: agentSockets.has(d.id) }
  })

  fastify.put('/api/devices/:id', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const { name, tags } = req.body || {}
    const updates = []; const vals = []
    if (name) { updates.push("name=?"); vals.push(name) }
    if (tags) { updates.push("tags=?"); vals.push(JSON.stringify(tags)) }
    if (!updates.length) return reply.code(400).send({ error: 'Nothing to update' })
    updates.push("updated_at=datetime('now')")
    vals.push(req.params.id)
    db.prepare(`UPDATE devices SET ${updates.join(',')} WHERE id=?`).run(...vals)
    return { ok: true }
  })

  fastify.delete('/api/devices/:id', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    db.prepare("DELETE FROM devices WHERE id=?").run(req.params.id)
    return { ok: true }
  })

  fastify.post('/api/devices/:id/wol', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const d = db.prepare("SELECT info FROM devices WHERE id=?").get(req.params.id)
    if (!d) return reply.code(404).send({ error: 'Device not found' })
    const info = parseJson(d.info) || {}
    const mac  = info?.mac || req.body?.mac
    if (!mac) return reply.code(400).send({ error: 'No MAC address' })
    const mac_hex = mac.replace(/[:-]/g, '')
    const buf = Buffer.alloc(102)
    buf.fill(0xff, 0, 6)
    for (let i = 1; i <= 16; i++) {
      for (let j = 0; j < 6; j++) buf[i * 6 + j] = parseInt(mac_hex.substr(j * 2, 2), 16)
    }
    const dgram = require('dgram')
    const sock  = dgram.createSocket('udp4')
    sock.once('listening', () => sock.setBroadcast(true))
    sock.send(buf, 0, buf.length, 9, '255.255.255.255', () => sock.close())
    return { ok: true, mac }
  })

  // ── Settings ────────────────────────────────────────────────────────────────
  fastify.get('/api/settings', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    const rows = db.prepare("SELECT key, value FROM settings").all()
    const result = {}
    for (const r of rows) { try { result[r.key] = JSON.parse(r.value) } catch { result[r.key] = r.value } }
    return result
  })

  fastify.put('/api/settings/:key', async (req, reply) => {
    const payload = authMiddleware(req, reply)
    if (!payload) return
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)").run(req.params.key, JSON.stringify(req.body))
    return { ok: true }
  })

  // ── WebSocket ───────────────────────────────────────────────────────────────
  fastify.register(async (app) => {
    app.get('/ws', { websocket: true }, (socket, request) => {
      const query   = request.query || {}
      const isAgent = query.agent === '1' || query.type === 'agent'

      if (isAgent) {
        handleAgentWs(socket)
        return
      }

      // Dashboard client — needs ticket or bearer token
      let user = null
      if (query.ticket) {
        const t = wsTickets.get(query.ticket)
        if (t && t.expires > Date.now()) { user = t; wsTickets.delete(query.ticket) }
        else { socket.close(); return }
      } else if (query.token) {
        try { user = verifyToken(query.token) } catch { socket.close(); return }
      } else {
        socket.close(); return
      }

      if (!user) { socket.close(); return }
      handleClientWs(socket)
    })
  })

  await fastify.listen({ port, host: '0.0.0.0' })
  started = true
  log?.info('server', `✅ AiRemote Server v3.2.0 listening on port ${port}`)
  log?.info('server', `📡 Local IP: ${getLocalIp()}`)
}

async function stop() {
  if (!started || !fastify) return
  started = false
  for (const [deviceId] of agentSockets) markDeviceOffline(deviceId)
  agentSockets.clear()
  clientSockets.clear()
  wsTickets.clear()
  try { await fastify.close() } catch {}
  if (db) { try { db.close() } catch {} }
  db      = null
  fastify = null
}

function getStatus() {
  return {
    running:       started,
    port:          _config.port || 3001,
    devicesOnline: agentSockets.size,
    localIp:       getLocalIp(),
  }
}

function getAllDevices() {
  if (!db) return []
  return db.prepare("SELECT id, name, token, status, last_seen, tags, info FROM devices ORDER BY name").all()
    .map(d => ({
      ...d,
      info:     parseJson(d.info),
      tags:     parseJson(d.tags) || [],
      isOnline: agentSockets.has(d.id),
    }))
}

module.exports = { start, stop, getStatus, getAllDevices, events }
