import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify()
    const payload = request.user as unknown as AuthTokenPayload
    if (payload.role !== 'admin') {
      reply.code(403).send({ error: 'Forbidden — Admin required' })
    }
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}
