import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth'
import { getDb } from '../db/database'
import { encryptSecret, decryptSecret } from '../services/crypto'
import { logAudit } from '../db/audit'
import type { AuthTokenPayload } from '@airemote/shared'
import type { InValue } from '@libsql/client'

interface CredentialRow {
  id: string; device_id: string; user_id: string; label: string
  ssh_host: string; ssh_port: number; ssh_username: string
  secret_type: string; secret_enc: string; last_used: string | null; created_at: string
}

export async function credentialRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // List credentials (never return the encrypted secret)
  fastify.get<{ Querystring: { deviceId?: string } }>('/', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const args: InValue[] = [user.userId]
    let sql = `SELECT id, device_id, label, ssh_host, ssh_port, ssh_username, secret_type, last_used, created_at
               FROM device_credentials WHERE user_id = ?`
    if (request.query.deviceId) { sql += ' AND device_id = ?'; args.push(request.query.deviceId) }
    sql += ' ORDER BY created_at DESC'
    const result = await db.execute({ sql, args })
    return result.rows
  })

  // Save credential
  fastify.post<{
    Body: {
      deviceId: string; label: string; sshHost: string; sshPort?: number
      sshUsername: string; secretType: 'password' | 'private_key'; secret: string
    }
  }>('/', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { deviceId, label, sshHost, sshPort = 22, sshUsername, secretType, secret } = request.body

    if (!label?.trim() || !sshHost?.trim() || !sshUsername?.trim() || !secret) {
      return reply.code(400).send({ error: 'label, sshHost, sshUsername and secret are required' })
    }

    const encrypted = encryptSecret(secret)
    const db  = getDb()
    const id  = uuidv4()
    const now = new Date().toISOString()

    await db.execute({
      sql: `INSERT INTO device_credentials
              (id, device_id, user_id, label, ssh_host, ssh_port, ssh_username, secret_type, secret_enc, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(device_id, user_id, label)
            DO UPDATE SET ssh_host=excluded.ssh_host, ssh_port=excluded.ssh_port,
              ssh_username=excluded.ssh_username, secret_type=excluded.secret_type,
              secret_enc=excluded.secret_enc`,
      args: [id, deviceId, user.userId, label.trim(), sshHost.trim(), sshPort, sshUsername.trim(), secretType, encrypted, now]
    })

    await logAudit({ userId: user.userId, userEmail: user.email, deviceId, action: 'credential_saved', details: { label, sshHost }, ipAddress: request.ip })
    return reply.code(201).send({ ok: true, id })
  })

  // Use credential — returns decrypted for one-time SSH connection
  fastify.post<{ Params: { id: string } }>('/:id/use', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const result = await db.execute({ sql: 'SELECT * FROM device_credentials WHERE id = ?', args: [request.params.id] })
    const row = result.rows[0] as unknown as CredentialRow | undefined
    if (!row) return reply.code(404).send({ error: 'Credential not found' })
    if (row.user_id !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const secret = decryptSecret(row.secret_enc)
    await db.execute({ sql: 'UPDATE device_credentials SET last_used = ? WHERE id = ?', args: [new Date().toISOString(), row.id] })

    return {
      sshHost: row.ssh_host, sshPort: row.ssh_port, sshUsername: row.ssh_username,
      secretType: row.secret_type,
      ...(row.secret_type === 'password' ? { password: secret } : { privateKey: Buffer.from(secret).toString('base64') })
    }
  })

  // Delete credential
  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const db   = getDb()
    const result = await db.execute({ sql: 'SELECT * FROM device_credentials WHERE id = ?', args: [request.params.id] })
    const row = result.rows[0] as unknown as CredentialRow | undefined
    if (!row) return reply.code(404).send({ error: 'Credential not found' })
    if (row.user_id !== user.userId) return reply.code(403).send({ error: 'Forbidden' })
    await db.execute({ sql: 'DELETE FROM device_credentials WHERE id = ?', args: [row.id] })
    await logAudit({ userId: user.userId, userEmail: user.email, deviceId: row.device_id, action: 'credential_deleted', details: { label: row.label }, ipAddress: request.ip })
    return reply.code(204).send()
  })
}
