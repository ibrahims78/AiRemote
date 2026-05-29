"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiRoutes = aiRoutes;
const auth_1 = require("../middleware/auth");
const ai_engine_1 = require("@airemote/ai-engine");
const database_1 = require("../db/database");
async function loadConversation(convId) {
    try {
        const db = (0, database_1.getDb)();
        const result = await db.execute({ sql: 'SELECT messages FROM ai_conversations WHERE id = ?', args: [convId] });
        const row = result.rows[0];
        if (!row)
            return [];
        return JSON.parse(row.messages);
    }
    catch {
        return [];
    }
}
async function saveConversation(convId, deviceId, userId, messages) {
    try {
        const db = (0, database_1.getDb)();
        const now = new Date().toISOString();
        const msgJson = JSON.stringify(messages);
        await db.execute({
            sql: `INSERT INTO ai_conversations (id, device_id, user_id, messages, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
            args: [convId, deviceId, userId, msgJson, now, now]
        });
    }
    catch (e) {
        console.error('Failed to save conversation:', e);
    }
}
async function aiRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAuth);
    // Send chat message
    fastify.post('/chat', async (request, reply) => {
        const { message, deviceId, conversationId, config } = request.body;
        const user = request.user;
        if (!message?.trim())
            return reply.code(400).send({ error: 'Message required' });
        if (!config?.provider)
            return reply.code(400).send({ error: 'AI config required' });
        const convId = conversationId || `${user.userId}-${deviceId || 'global'}`;
        const deviceRef = deviceId || 'global';
        const history = await loadConversation(convId);
        const userMsg = { role: 'user', content: message, timestamp: new Date() };
        history.push(userMsg);
        try {
            const provider = (0, ai_engine_1.createAIProvider)(config);
            const response = await provider.chat(history, ai_engine_1.SYSTEM_PROMPT_AR);
            const assistantMsg = { role: 'assistant', content: response, timestamp: new Date() };
            history.push(assistantMsg);
            if (history.length > 100)
                history.splice(0, history.length - 100);
            await saveConversation(convId, deviceRef, user.userId, history);
            return reply.send({
                reply: response,
                conversationId: convId,
                messageCount: history.length
            });
        }
        catch (err) {
            const error = err;
            history.pop();
            return reply.code(500).send({ error: `AI error: ${error.message}` });
        }
    });
    // Get conversation history
    fastify.get('/history', async (request) => {
        const user = request.user;
        const convId = request.query.conversationId || `${user.userId}-${request.query.deviceId || 'global'}`;
        const messages = await loadConversation(convId);
        return { messages, conversationId: convId };
    });
    // List all conversations for user
    fastify.get('/conversations', async (request) => {
        const user = request.user;
        const db = (0, database_1.getDb)();
        const result = await db.execute({
            sql: `SELECT id, device_id, created_at, updated_at, 
               json_extract(messages, '$[#-1].content') as last_message
            FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 20`,
            args: [user.userId]
        });
        return result.rows;
    });
    // Delete conversation
    fastify.delete('/history', async (request) => {
        const user = request.user;
        const convId = request.query.conversationId || `${user.userId}-${request.query.deviceId || 'global'}`;
        try {
            const db = (0, database_1.getDb)();
            await db.execute({ sql: 'DELETE FROM ai_conversations WHERE id = ?', args: [convId] });
        }
        catch { }
        return { ok: true };
    });
}
//# sourceMappingURL=ai.js.map