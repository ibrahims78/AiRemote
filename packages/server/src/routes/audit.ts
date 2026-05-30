import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/auth'
import { getAuditLog } from '../db/audit'

export async function auditRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin)

  fastify.get<{
    Querystring: {
      userId?: string; deviceId?: string; action?: string
      from?: string; to?: string; page?: string
    }
  }>('/', async (request) => {
    const { userId, deviceId, action, from, to, page = '1' } = request.query
    const pageNum = Math.max(1, parseInt(page))
    const limit   = 50
    const offset  = (pageNum - 1) * limit
    return getAuditLog({ userId, deviceId, action, fromDate: from, toDate: to, limit, offset })
  })

  fastify.get('/export', async (request, reply) => {
    const { from, to, userId, deviceId, action } = request.query as Record<string, string>
    const { entries } = await getAuditLog({ fromDate: from, toDate: to, userId, deviceId, action, limit: 10000 })

    const header = 'ID,User Email,Device ID,Action,Details,IP Address,Status,Timestamp'
    const rows   = (entries as Record<string, unknown>[]).map(e => {
      const safe = (v: unknown) => String(v ?? '').replace(/"/g, '""')
      return `${safe(e.id)},"${safe(e.user_email)}","${safe(e.device_id)}","${safe(e.action)}","${safe(e.details)}","${safe(e.ip_address)}","${safe(e.status_code)}","${safe(e.created_at)}"`
    })

    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="audit-log.csv"')
    return reply.send([header, ...rows].join('\n'))
  })
}
