import type { FastifyInstance } from 'fastify'
import { requireAuth } from '../middleware/auth'
import { createAIProvider, SYSTEM_PROMPT_AR } from '@airemote/ai-engine'
import { getDb } from '../db/database'
import type { AIConfig, AIMessage, AuthTokenPayload } from '@airemote/shared'

async function loadConversation(convId: string): Promise<AIMessage[]> {
  try {
    const db = getDb()
    const result = await db.execute({ sql: 'SELECT messages FROM ai_conversations WHERE id = ?', args: [convId] })
    const row = result.rows[0] as unknown as { messages: string } | undefined
    if (!row) return []
    return JSON.parse(row.messages)
  } catch { return [] }
}

async function saveConversation(convId: string, deviceId: string, userId: string, messages: AIMessage[]): Promise<void> {
  try {
    const db = getDb()
    const now = new Date().toISOString()
    const msgJson = JSON.stringify(messages)
    await db.execute({
      sql: `INSERT INTO ai_conversations (id, device_id, user_id, messages, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
      args: [convId, deviceId, userId, msgJson, now, now]
    })
  } catch (e) { console.error('Failed to save conversation:', e) }
}

export async function aiRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', requireAuth)

  // Send chat message
  fastify.post<{
    Body: {
      message: string
      deviceId?: string
      conversationId?: string
      config: AIConfig
    }
  }>('/chat', async (request, reply) => {
    const { message, deviceId, conversationId, config } = request.body
    const user = request.user as unknown as AuthTokenPayload

    if (!message?.trim()) return reply.code(400).send({ error: 'Message required' })
    if (!config?.provider) return reply.code(400).send({ error: 'AI config required' })

    const convId = conversationId || `${user.userId}-${deviceId || 'global'}`
    const deviceRef = deviceId || 'global'

    const history = await loadConversation(convId)
    const userMsg: AIMessage = { role: 'user', content: message, timestamp: new Date() }
    history.push(userMsg)

    try {
      const provider = createAIProvider(config)
      const response = await provider.chat(history, SYSTEM_PROMPT_AR)

      const assistantMsg: AIMessage = { role: 'assistant', content: response, timestamp: new Date() }
      history.push(assistantMsg)
      if (history.length > 100) history.splice(0, history.length - 100)

      await saveConversation(convId, deviceRef, user.userId, history)

      return reply.send({
        reply: response,
        conversationId: convId,
        messageCount: history.length
      })
    } catch (err: unknown) {
      const error = err as Error
      history.pop()
      return reply.code(500).send({ error: `AI error: ${error.message}` })
    }
  })

  // Get conversation history
  fastify.get<{ Querystring: { conversationId?: string; deviceId?: string } }>('/history', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const convId = request.query.conversationId || `${user.userId}-${request.query.deviceId || 'global'}`
    const messages = await loadConversation(convId)
    return { messages, conversationId: convId }
  })

  // List all conversations for user
  fastify.get('/conversations', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT id, device_id, created_at, updated_at, 
               json_extract(messages, '$[#-1].content') as last_message
            FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`,
      args: [user.userId]
    })
    return result.rows
  })

  // Delete conversation
  fastify.delete<{ Querystring: { conversationId?: string; deviceId?: string } }>('/history', async (request) => {
    const user = request.user as unknown as AuthTokenPayload
    const convId = request.query.conversationId || `${user.userId}-${request.query.deviceId || 'global'}`
    try {
      const db = getDb()
      await db.execute({ sql: 'DELETE FROM ai_conversations WHERE id = ?', args: [convId] })
    } catch {}
    return { ok: true }
  })

  // Validate AI API key
  fastify.post<{ Body: { config: AIConfig } }>('/validate', async (request, reply) => {
    const { config } = request.body
    if (!config?.provider) return reply.code(400).send({ error: 'Config required' })

    if (config.provider !== 'ollama' && !config.apiKey?.trim()) {
      return reply.code(400).send({ error: 'API key is required' })
    }

    try {
      const provider = createAIProvider(config)
      const testMessages: AIMessage[] = [{ role: 'user', content: 'Say "OK" in one word only.', timestamp: new Date() }]
      const response = await provider.chat(testMessages)
      return { ok: true, response: response.slice(0, 100) }
    } catch (err: unknown) {
      const error = err as Error
      return reply.code(400).send({ ok: false, error: error.message })
    }
  })
}
