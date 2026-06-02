import type { FastifyRequest, FastifyReply } from 'fastify'
import type { AuthTokenPayload } from '@airemote/shared'
import { consumeWsTicket } from '../lib/wsTickets'

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

/**
 * WebSocket auth — two supported methods (in priority order):
 *
 * 1. ?ticket=<uuid>  — Preferred. A short-lived (30 s), single-use ticket
 *    obtained from POST /api/auth/ws-ticket. The raw JWT never appears in
 *    server access logs this way.
 *
 * 2. ?token=<jwt>    — Legacy fallback. Kept for backward-compatibility with
 *    older dashboard builds and the agent-desktop app.
 */
export async function requireAuthWs(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { token?: string; ticket?: string }

  // ── Method 1: ticket ──────────────────────────────────────────────────────
  if (query.ticket) {
    const data = consumeWsTicket(query.ticket)
    if (!data) {
      reply.code(401).send({ error: 'Invalid or expired WS ticket' })
      return
    }
    // Synthesise a fake JWT payload so the rest of the codebase can do
    // `request.user as AuthTokenPayload` as usual.
    ;(request as unknown as { user: AuthTokenPayload }).user = {
      userId: data.userId,
      email:  data.email,
      role:   data.role,
    } as AuthTokenPayload
    return
  }

  // ── Method 2: token (legacy) ──────────────────────────────────────────────
  if (query.token) {
    request.headers.authorization = `Bearer ${query.token}`
  }
  try {
    await request.jwtVerify()
  } catch {
    reply.code(401).send({ error: 'Unauthorized' })
  }
}
