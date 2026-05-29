"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRoutes = sessionRoutes;
const auth_1 = require("../middleware/auth");
const database_1 = require("../db/database");
const sessions_1 = require("../db/sessions");
async function enrichSessionsWithDeviceNames(sessions) {
    if (sessions.length === 0)
        return [];
    const db = (0, database_1.getDb)();
    const deviceIds = [...new Set(sessions.map(s => s.deviceId))];
    const placeholders = deviceIds.map(() => '?').join(',');
    const result = await db.execute({
        sql: `SELECT id, name FROM devices WHERE id IN (${placeholders})`,
        args: deviceIds
    });
    const nameMap = new Map();
    for (const row of result.rows) {
        nameMap.set(row.id, row.name);
    }
    return sessions.map(s => ({
        ...s,
        deviceName: nameMap.get(s.deviceId) || s.deviceId.slice(0, 8)
    }));
}
async function sessionRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAuth);
    fastify.get('/', async (request) => {
        const user = request.user;
        const sessions = user.role === 'admin' ? await (0, sessions_1.getAllSessions)(200) : await (0, sessions_1.getSessionsByUser)(user.userId);
        return enrichSessionsWithDeviceNames(sessions);
    });
    fastify.get('/device/:deviceId', async (request) => {
        const sessions = await (0, sessions_1.getSessionsByDevice)(request.params.deviceId);
        return enrichSessionsWithDeviceNames(sessions);
    });
}
//# sourceMappingURL=sessions.js.map