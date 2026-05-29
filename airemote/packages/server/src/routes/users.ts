import type { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { requireAdmin } from '../middleware/auth'
import { getAllUsers, createUser, updateUser, deleteUser } from '../db/users'
import { getDb } from '../db/database'
import type { UserRole } from '@airemote/shared'

export async function userRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAdmin)

  fastify.get('/', async () => getAllUsers())

  fastify.post<{ Body: { email: string; name: string; password: string; role: UserRole } }>(
    '/', async (request, reply) => {
      const { email, name, password, role } = request.body
      if (!email || !name || !password) return reply.code(400).send({ error: 'email, name, and password required' })
      if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
      const user = await createUser(email, name, password, role || 'viewer')
      return reply.code(201).send(user)
    }
  )

  fastify.patch<{ Params: { id: string }; Body: { name?: string; role?: UserRole; password?: string } }>(
    '/:id', async (request, reply) => {
      const { name, role, password } = request.body
      const { id } = request.params

      if (password !== undefined) {
        if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
        const db = getDb()
        const hash = await bcrypt.hash(password, 12)
        const now = new Date().toISOString()
        await db.execute({
          sql: 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
          args: [hash, now, id]
        })
      }

      const user = await updateUser(id, { name, role })
      if (!user) return reply.code(404).send({ error: 'User not found' })
      return user
    }
  )

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    await deleteUser(request.params.id)
    return reply.code(204).send()
  })
}
