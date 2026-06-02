import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth'
import { createAIProvider, SYSTEM_PROMPT_AR } from '@airemote/ai-engine'
import { getDb } from '../db/database'
import { getDeviceById } from '../db/devices'
import { deviceRegistry } from '../ws/registry'
import { sendCommandToAgent } from '../ws/agentHandler'
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
    if (config.provider !== 'ollama' && !config.apiKey?.trim()) {
      const name = config.provider === 'gemini' ? 'Gemini' : 'OpenAI'
      return reply.code(400).send({ error: `${name} API key is required. Please configure it in Settings.` })
    }

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

  // ── POST /auto-heal — AI Auto-Healing diagnosis ──────────────────────────
  fastify.post<{
    Body: { deviceId: string; config: AIConfig; metric?: string }
  }>('/auto-heal', async (request, reply) => {
    const user = request.user as unknown as AuthTokenPayload
    const { deviceId, config, metric = 'general' } = request.body

    if (!deviceId) return reply.code(400).send({ error: 'deviceId required' })
    if (!config?.provider) return reply.code(400).send({ error: 'AI config required' })

    const device = await getDeviceById(deviceId)
    if (!device) return reply.code(404).send({ error: 'Device not found' })
    if (user.role !== 'admin' && device.ownerId !== user.userId) return reply.code(403).send({ error: 'Forbidden' })

    const isOnline = deviceRegistry.isDeviceOnline(deviceId)
    let context = 'Device is currently offline — no live data available.'

    if (isOnline) {
      const diagnosticCmds = [
        `echo "=== top ===" && top -bn1 2>/dev/null | head -15`,
        `echo "=== memory ===" && free -h 2>/dev/null`,
        `echo "=== disk ===" && df -h 2>/dev/null`,
        `echo "=== journal ===" && journalctl -n 30 --no-pager 2>/dev/null || dmesg | tail -20 2>/dev/null`
      ]
      const parts: string[] = []
      for (const cmd of diagnosticCmds) {
        try {
          const r = await sendCommandToAgent(deviceId, uuidv4(), cmd, 10000)
          parts.push(r.stdout.trim())
        } catch { /* skip failed diagnostics */ }
      }
      if (parts.length) context = parts.join('\n\n')
    }

    const prompt = `Device "${device.name}" may be experiencing issues related to: ${metric}.\n\nDiagnostic data collected:\n\`\`\`\n${context.slice(0, 3000)}\n\`\`\`\n\nPlease analyze the data and respond in this exact JSON format (no extra text):\n{\n  "diagnosis": "<root cause>",\n  "suggestion": "<shell command to fix>",\n  "confidence": "high|medium|low",\n  "risk": "low|medium|high",\n  "explanation": "<brief explanation>"\n}`

    try {
      const provider = createAIProvider(config)
      const msgs: AIMessage[] = [{ role: 'user', content: prompt, timestamp: new Date() }]
      const raw = await provider.chat(msgs)

      let parsed: unknown
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/)
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { diagnosis: raw, suggestion: '', confidence: 'low', risk: 'medium', explanation: '' }
      } catch {
        parsed = { diagnosis: raw, suggestion: '', confidence: 'low', risk: 'medium', explanation: '' }
      }

      return reply.send({ deviceId, device: device.name, metric, result: parsed, contextLength: context.length })
    } catch (err) {
      return reply.code(500).send({ error: `AI error: ${(err as Error).message}` })
    }
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
