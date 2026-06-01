import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { deviceRegistry } from '../ws/registry'
import { sendFsRequest, sendFsDownload } from '../ws/agentHandler'

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
      const path = req.query.path || '/'
      if (!assertOnline(deviceId, reply)) return
      try {
        return await sendFsRequest(deviceId, 'list', path)
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )

  fastify.get<{ Params: { deviceId: string }; Querystring: { path: string } }>(
    '/:deviceId/fs/download',
    async (req, reply) => {
      const { deviceId } = req.params
      const { path } = req.query
      if (!path) return reply.code(400).send({ error: 'path مطلوب' })
      if (!assertOnline(deviceId, reply)) return
      try {
        // Use chunked transfer — avoids sending one giant WS message that
        // blocks the event loop and trips the ping/pong timeout
        const buf  = await sendFsDownload(deviceId, path, 120000)
        const name = path.split('/').pop() || 'file'
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
      const { path } = req.body
      if (!path) return reply.code(400).send({ error: 'path مطلوب' })
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'delete', path)
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
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'rename', oldPath, { newPath })
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
      const { path } = req.body
      if (!path) return reply.code(400).send({ error: 'path مطلوب' })
      if (!assertOnline(deviceId, reply)) return
      try {
        await sendFsRequest(deviceId, 'mkdir', path)
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
      const fields = data.fields as Record<string, { value: string }>
      const uploadPath = fields.path?.value || '/'
      const fileBuffer = await data.toBuffer()
      const fileName = data.filename
      const fullPath = uploadPath.endsWith('/') ? uploadPath + fileName : uploadPath + '/' + fileName
      try {
        await sendFsRequest(deviceId, 'write', fullPath, { data: fileBuffer.toString('base64') }, 60000)
        return { ok: true, path: fullPath, size: fileBuffer.length }
      } catch (e: unknown) {
        return reply.code(500).send({ error: (e as Error).message })
      }
    }
  )
}
