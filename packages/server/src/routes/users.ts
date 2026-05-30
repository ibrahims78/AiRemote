import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../middleware/auth'
import { getAllUsers, createUser, updateUser, updateUserPassword, deleteUser, findUserById } from '../db/users'
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

      const existing = await findUserById(id)
      if (!existing) return reply.code(404).send({ error: 'User not found' })

      if (password !== undefined) {
        if (password.length < 8) return reply.code(400).send({ error: 'Password must be at least 8 characters' })
        await updateUserPassword(id, password)
      }

      if (name !== undefined || role !== undefined) {
        const user = await updateUser(id, { name, role })
        if (!user) return reply.code(404).send({ error: 'User not found' })
        return user
      }

      return findUserById(id)
    }
  )

  fastify.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const existing = await findUserById(request.params.id)
    if (!existing) return reply.code(404).send({ error: 'User not found' })
    await deleteUser(request.params.id)
    return reply.code(204).send()
  })
}
