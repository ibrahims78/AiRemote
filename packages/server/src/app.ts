import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { jwtPlugin } from './plugins/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import { initDatabase } from './db/database'
import { resetAllDevicesOffline, updateDeviceStatus } from './db/devices'
import { authRoutes } from './routes/auth'
import { deviceRoutes } from './routes/devices'
import { sessionRoutes } from './routes/sessions'
import { userRoutes } from './routes/users'
import { sftpRoutes } from './routes/sftp'
import { fsRoutes } from './routes/fs'
import { aiRoutes } from './routes/ai'
import { settingsRoutes } from './routes/settings'
import { auditRoutes } from './routes/audit'
import { alertRoutes } from './routes/alerts'
import { credentialRoutes } from './routes/credentials'
import { downloadRoutes } from './routes/downloads'
import { githubRoutes } from './routes/github'
import { recordingRoutes } from './routes/recordings'
import { wsHandler } from './ws/handler'
import { handleSshWebSocket } from './ws/sshHandler'
import { handlePtyWebSocket } from './ws/ptyHandler'
import { handleScreenWebSocket } from './ws/screenHandler'
import { requireAuthWs } from './middleware/auth'
import { deviceRegistry } from './ws/registry'
import { cleanupDevice } from './ws/agentHandler'

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined
    }
  })

  await initDatabase()
  await resetAllDevicesOffline()

  // ── Zombie sweeper — every 12s, purge sockets that closed without a clean FIN
  // This catches agents killed via SIGKILL or network drops that bypass ping/pong.
  setInterval(async () => {
    const swept = deviceRegistry.sweepZombieDevices()
    for (const deviceId of swept) {
      await updateDeviceStatus(deviceId, 'offline').catch(() => {})
      cleanupDevice(deviceId)
      console.warn(`🧟 Zombie connection swept and marked offline: ${deviceId}`)
    }
  }, 12000)

  const isProduction = process.env.NODE_ENV === 'production'

  // ── CORS ─────────────────────────────────────────────────────────────────
  await app.register(cors, {
    origin: process.env.DASHBOARD_URL
      ? process.env.DASHBOARD_URL
      : (isProduction ? false : true),
    credentials: true
  })

  await app.register(cookie)

  await app.register(multipart, {
    limits: { fileSize: 500 * 1024 * 1024, files: 1 }
  })

  await app.register(jwtPlugin, {
    secret: process.env.JWT_SECRET || 'airemote-dev-secret-change-in-production',
    sign: { expiresIn: '15m' }
  })

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'airemote-dev-secret-change-in-production') {
    app.log.warn('⚠️  JWT_SECRET is not set — using insecure dev default. Set JWT_SECRET in .env for production!')
  }

  // ── Global rate limit ────────────────────────────────────────────────────
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    skipOnError: true
  })

  await app.register(websocket)

  // ── Health check ─────────────────────────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    version: '3.1.0',
    time: new Date().toISOString()
  }))

  // ── API routes ────────────────────────────────────────────────────────────
  await app.register(authRoutes,       { prefix: '/api/auth' })
  await app.register(deviceRoutes,     { prefix: '/api/devices' })
  await app.register(sessionRoutes,    { prefix: '/api/sessions' })
  await app.register(userRoutes,       { prefix: '/api/users' })
  await app.register(sftpRoutes,       { prefix: '/api/sftp' })
  await app.register(fsRoutes,         { prefix: '/api/devices' })
  await app.register(aiRoutes,         { prefix: '/api/ai' })
  await app.register(settingsRoutes,   { prefix: '/api/settings' })
  await app.register(auditRoutes,      { prefix: '/api/audit' })
  await app.register(alertRoutes,      { prefix: '/api/alerts' })
  await app.register(credentialRoutes, { prefix: '/api/credentials' })
  await app.register(downloadRoutes,   { prefix: '/api/downloads' })
  await app.register(githubRoutes,     { prefix: '/api/github' })
  await app.register(recordingRoutes,  { prefix: '/api/recordings' })

  // ── WebSocket routes ──────────────────────────────────────────────────────
  // /ws  — accepts both agents (device-token auth via first message) and
  //         dashboard clients (JWT via ?token= query param)
  // /ssh — SSH tunnel; requires JWT upfront
  // /pty — Direct PTY shell; requires JWT upfront (v1.2.0)
  await app.register(async function (fastify) {
    fastify.get('/ws',     { websocket: true }, wsHandler)
    fastify.get('/ssh',    { websocket: true, preHandler: [requireAuthWs] }, handleSshWebSocket)
    fastify.get('/pty',    { websocket: true, preHandler: [requireAuthWs] }, handlePtyWebSocket)
    fastify.get('/screen', { websocket: true }, handleScreenWebSocket)
  })

  return app
}
