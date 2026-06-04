import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import {
  listRecordings, getRecordingMeta,
  exportRecordingAsZip, deleteRecording
} from '../services/recording'
import type { AuthTokenPayload } from '@airemote/shared'

export async function recordingRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // GET /api/recordings — list all recordings
  fastify.get('/', async (req, reply) => {
    const user = req.user as unknown as AuthTokenPayload
    const all  = listRecordings()
    // Admins see all; regular users see only their own
    const visible = user.role === 'admin'
      ? all
      : all.filter(r => r.userId === user.userId)
    return visible
  })

  // GET /api/recordings/:sessionId — get metadata
  fastify.get<{ Params: { sessionId: string } }>('/:sessionId', async (req, reply) => {
    const { sessionId } = req.params
    const meta = getRecordingMeta(sessionId)
    if (!meta) return reply.code(404).send({ error: 'Recording not found' })

    const user = req.user as unknown as AuthTokenPayload
    if (user.role !== 'admin' && meta.userId !== user.userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    return meta
  })

  // GET /api/recordings/:sessionId/download — download as ZIP
  fastify.get<{ Params: { sessionId: string } }>('/:sessionId/download', async (req, reply) => {
    const { sessionId } = req.params
    const meta = getRecordingMeta(sessionId)
    if (!meta) return reply.code(404).send({ error: 'Recording not found' })

    const user = req.user as unknown as AuthTokenPayload
    if (user.role !== 'admin' && meta.userId !== user.userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    if (meta.active) return reply.code(409).send({ error: 'Recording still in progress — stop it first' })

    const zip = await exportRecordingAsZip(sessionId)
    if (!zip) return reply.code(404).send({ error: 'No frames to export' })

    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', `attachment; filename="recording-${sessionId.slice(0, 8)}.zip"`)
    reply.send(zip)

    // Auto-cleanup after download
    deleteRecording(sessionId)
  })

  // DELETE /api/recordings/:sessionId — discard recording
  fastify.delete<{ Params: { sessionId: string } }>('/:sessionId', async (req, reply) => {
    const { sessionId } = req.params
    const meta = getRecordingMeta(sessionId)
    if (!meta) return reply.code(404).send({ error: 'Recording not found' })

    const user = req.user as unknown as AuthTokenPayload
    if (user.role !== 'admin' && meta.userId !== user.userId) {
      return reply.code(403).send({ error: 'Forbidden' })
    }
    deleteRecording(sessionId)
    return { ok: true }
  })
}
