"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsRoutes = settingsRoutes;
const auth_1 = require("../middleware/auth");
const database_1 = require("../db/database");
async function settingsRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAuth);
    // Get settings for current user
    fastify.get('/', async (request) => {
        const user = request.user;
        const db = (0, database_1.getDb)();
        const result = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [`user:${user.userId}`]
        });
        const row = result.rows[0];
        if (!row)
            return { aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' };
        try {
            return JSON.parse(row.value);
        }
        catch {
            return {};
        }
    });
    // Save settings for current user
    fastify.put('/', async (request, reply) => {
        const user = request.user;
        const db = (0, database_1.getDb)();
        const now = new Date().toISOString();
        const valueJson = JSON.stringify(request.body);
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            args: [`user:${user.userId}`, valueJson, now]
        });
        return reply.send({ ok: true });
    });
    // Get global system settings (admin only)
    fastify.get('/system', async (request, reply) => {
        const user = request.user;
        if (user.role !== 'admin')
            return reply.code(403).send({ error: 'Admin required' });
        const db = (0, database_1.getDb)();
        const result = await db.execute({ sql: 'SELECT key, value, updated_at FROM settings WHERE key NOT LIKE ?', args: ['user:%'] });
        const out = {};
        for (const row of result.rows) {
            try {
                out[row.key] = JSON.parse(row.value);
            }
            catch {
                out[row.key] = row.value;
            }
        }
        return out;
    });
}
//# sourceMappingURL=settings.js.map