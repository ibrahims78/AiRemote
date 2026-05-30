import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import jwt from '@fastify/jwt'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import { initDatabase } from './db/database'
import { authRoutes } from './routes/auth'
import { deviceRoutes } from './routes/devices'
import { sessionRoutes } from './routes/sessions'
import { userRoutes } from './routes/users'
import { sftpRoutes } from './routes/sftp'
import { aiRoutes } from './routes/ai'
import { settingsRoutes } from './routes/settings'
import { wsHandler } from './ws/handler'
import { handleSshWebSocket } from './ws/sshHandler'

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

  await app.register(cors, {
    origin: process.env.DASHBOARD_URL || true,
    credentials: true
  })

  await app.register(cookie)

  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500 MB
      files: 1
    }
  })

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'airemote-dev-secret-change-in-production',
    sign: { expiresIn: '15m' }
  })

  await app.register(websocket)

  app.get('/health', async () => ({
    status: 'ok',
    version: '1.0.0',
    time: new Date().toISOString()
  }))

  await app.register(authRoutes, { prefix: '/api/auth' })
  await app.register(deviceRoutes, { prefix: '/api/devices' })
  await app.register(sessionRoutes, { prefix: '/api/sessions' })
  await app.register(userRoutes, { prefix: '/api/users' })
  await app.register(sftpRoutes, { prefix: '/api/sftp' })
  await app.register(aiRoutes, { prefix: '/api/ai' })
  await app.register(settingsRoutes, { prefix: '/api/settings' })

  await app.register(async function (fastify) {
    fastify.get('/ws', { websocket: true }, wsHandler)
    fastify.get('/ssh', { websocket: true }, handleSshWebSocket)
  })

  return app
}
