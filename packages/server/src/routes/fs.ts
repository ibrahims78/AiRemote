import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { deviceRegistry } from '../ws/registry'
import { sendFsRequest, sendFsDownload } from '../ws/agentHandler'
import type { AuthTokenPayload } from '@airemote/shared'

// ── Path sanitization ────────────────────────────────────────────────────────
// Prevents path traversal attacks: rejects null bytes, ".." sequences, and
// relative paths. The agent trusts the path it receives, so we must validate
// on the server side before forwarding.
function sanitizePath(input: string): string | null {
  if (!input || typeof input !== 'string') return null
  // Reject null bytes (poison byte attack)
  if (input.includes('\0')) return null
  // Decode any URL-encoded sequences before checking
  let decoded: string
  try {
    decoded = decodeURIComponent(input)
  } catch {
    decoded = input
  }
  // Reject traversal sequences in any form
  if (decoded.includes('..')) return null
  // Reject traversal with backslashes (Windows-style)
  if (decoded.includes('..\\') || decoded.includes('\\..')) return null
  // Must be an absolute path (starts with /) OR a Windows drive-style (/C:/)
  if (!decoded.startsWith('/')) return null
  return decoded
}

// ── Upload size limit ─────────────────────────────────────────────────────────
// Files are buffered entirely in memory before being sent to the agent as
// base64. A 50 MB ceiling prevents OOM crashes on the server.
// TODO: implement write_chunked protocol for large files (> 50 MB).
const UPLOAD_MAX_BYTES = 50 * 1024 * 1024  // 50 MB

export async function fsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  function assertOnline(deviceId: string, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
    if (!deviceRegistry.isDeviceOnline(deviceId)) {
      reply.code(503).send({ error: 'الجهاز غير متصل' })
      return false
    }
    return true
  }

  fastify.get<{ Params: { deviceId: string }; Querystring: { path?: string } }>(
    '/:deviceId/fs/list',
    async (req, reply) => {
      const { deviceId } = req.params
      const rawPath = req.query.path || '/'
      const safePath = sanitizePath(rawPath)
      if (!safePath) return reply.code(400).send({ error: 'مسار غير صالح' })
      if (!assertOnline(deviceId, reply)) return
      try {
        return await sendFsRequest(deviceId, 'list', safePath)
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.get<{ Params: { deviceId: string }; Querystring: { path: string } }>(
    '/:deviceId/fs/download',
    async (req, reply) => {
      const { deviceId } = req.params
      const rawPath = req.query.path
      if (!rawPath) return reply.code(400).send({ error: 'path مطلوب' })
      const safePath = sanitizePath(rawPath)
      if (!safePath) return reply.code(400).send({ error: 'مسار غير صالح' })
      if (!assertOnline(deviceId, reply)) return
      try {
        const buf  = await sendFsDownload(deviceId, safePath, 120000)
        const name = safePath.split('/').pop() || 'file'
        reply.header('Content-Disposition', `attachment; filename="${encodeURIComponent(name)}"`)
        reply.header('Content-Type', 'application/octet-stream')
        return reply.send(buf)
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.post<{ Params: { deviceId: string }; Body: { path: string } }>(
    '/:deviceId/fs/delete',
    async (req, reply) => {
      const { deviceId } = req.params
      const rawPath = req.body.path
      if (!rawPath) return reply.code(400).send({ error: 'path مطلوب' })
      const safePath = sanitizePath(rawPath)
      if (!safePath) return reply.code(400).send({ error: 'مسار غير صالح' })
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'delete', safePath)
        const user = req.user as unknown as AuthTokenPayload
        await import('../db/audit').then(m => m.logAudit({
          userId: user.userId, userEmail: user.email, deviceId,
          action: 'sftp_delete', details: { path: safePath }, ipAddress: req.ip
        }))
        return { ok: true }
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.post<{ Params: { deviceId: string }; Body: { oldPath: string; newPath: string } }>(
    '/:deviceId/fs/rename',
    async (req, reply) => {
      const { deviceId } = req.params
      const { oldPath, newPath } = req.body
      if (!oldPath || !newPath) return reply.code(400).send({ error: 'oldPath و newPath مطلوبان' })
      const safeOld = sanitizePath(oldPath)
      const safeNew = sanitizePath(newPath)
      if (!safeOld || !safeNew) return reply.code(400).send({ error: 'مسار غير صالح' })
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'rename', safeOld, { newPath: safeNew })
        const user = req.user as unknown as AuthTokenPayload
        await import('../db/audit').then(m => m.logAudit({
          userId: user.userId, userEmail: user.email, deviceId,
          action: 'sftp_rename', details: { from: safeOld, to: safeNew }, ipAddress: req.ip
        }))
        return { ok: true }
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.post<{ Params: { deviceId: string }; Body: { path: string } }>(
    '/:deviceId/fs/mkdir',
    async (req, reply) => {
      const { deviceId } = req.params
      const rawPath = req.body.path
      if (!rawPath) return reply.code(400).send({ error: 'path مطلوب' })
      const safePath = sanitizePath(rawPath)
      if (!safePath) return reply.code(400).send({ error: 'مسار غير صالح' })
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'mkdir', safePath)
        const user = req.user as unknown as AuthTokenPayload
        await import('../db/audit').then(m => m.logAudit({
          userId: user.userId, userEmail: user.email, deviceId,
          action: 'sftp_mkdir', details: { path: safePath }, ipAddress: req.ip
        }))
        return { ok: true }
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.post(
    '/:deviceId/fs/upload',
    async (req, reply) => {
      const { deviceId } = (req.params as { deviceId: string })
      if (!assertOnline(deviceId, reply)) return

      const data = await req.file()
      if (!data) return reply.code(400).send({ error: 'لا يوجد ملف' })

      const fields    = data.fields as Record<string, { value: string }>
      const rawUploadPath = fields.path?.value || '/'
      const safeUploadPath = sanitizePath(rawUploadPath)
      if (!safeUploadPath) return reply.code(400).send({ error: 'مسار الرفع غير صالح' })

      // Buffer entire file — guarded by UPLOAD_MAX_BYTES ceiling
      const fileBuffer = await data.toBuffer()

      if (fileBuffer.length > UPLOAD_MAX_BYTES) {
        return reply.code(413).send({
          error: `حجم الملف (${(fileBuffer.length / 1024 / 1024).toFixed(1)} MB) يتجاوز الحد المسموح (50 MB)`
        })
      }

      const fileName = data.filename
      const fullPath = safeUploadPath.endsWith('/')
        ? safeUploadPath + fileName
        : safeUploadPath + '/' + fileName

      // Validate the final combined path too
      const safeFull = sanitizePath(fullPath)
      if (!safeFull) return reply.code(400).send({ error: 'اسم الملف غير صالح' })

      try {
        await sendFsRequest(deviceId, 'write', safeFull, { data: fileBuffer.toString('base64') }, 60000)
        const user = req.user as unknown as AuthTokenPayload
        await import('../db/audit').then(m => m.logAudit({
          userId: user.userId, userEmail: user.email, deviceId,
          action: 'sftp_upload',
          details: { path: safeFull, size: fileBuffer.length },
          ipAddress: req.ip
        }))
        return { ok: true, path: safeFull, size: fileBuffer.length }
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )
}
