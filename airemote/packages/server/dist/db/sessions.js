"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSession = createSession;
exports.endSession = endSession;
exports.getSessionById = getSessionById;
exports.getSessionsByDevice = getSessionsByDevice;
exports.getSessionsByUser = getSessionsByUser;
exports.getAllSessions = getAllSessions;
const uuid_1 = require("uuid");
const database_1 = require("./database");
function rowToSession(row) {
    return {
        id: row.id,
        deviceId: row.device_id,
        userId: row.user_id,
        type: row.type,
        startedAt: new Date(row.started_at),
        endedAt: row.ended_at ? new Date(row.ended_at) : undefined,
        durationSec: row.duration_sec || undefined,
        ipAddress: row.ip_address || undefined
    };
}
async function createSession(deviceId, userId, type, ipAddress) {
    const db = (0, database_1.getDb)();
    const id = (0, uuid_1.v4)();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO sessions (id, device_id, user_id, type, started_at, ip_address) VALUES (?, ?, ?, ?, ?, ?)`,
        args: [id, deviceId, userId, type, now, ipAddress || null]
    });
    return (await getSessionById(id));
}
async function endSession(id) {
    const db = (0, database_1.getDb)();
    const session = await getSessionById(id);
    if (!session)
        return;
    const now = new Date();
    const durationSec = Math.floor((now.getTime() - session.startedAt.getTime()) / 1000);
    await db.execute({ sql: `UPDATE sessions SET ended_at = ?, duration_sec = ? WHERE id = ?`, args: [now.toISOString(), durationSec, id] });
}
async function getSessionById(id) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM sessions WHERE id = ?', args: [id] });
    const row = result.rows[0];
    if (!row)
        return null;
    return rowToSession(row);
}
async function getSessionsByDevice(deviceId, limit = 50) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: `SELECT * FROM sessions WHERE device_id = ? ORDER BY started_at DESC LIMIT ?`, args: [deviceId, limit] });
    return result.rows.map(rowToSession);
}
async function getSessionsByUser(userId, limit = 50) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT ?`, args: [userId, limit] });
    return result.rows.map(rowToSession);
}
async function getAllSessions(limit = 100) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: `SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?`, args: [limit] });
    return result.rows.map(rowToSession);
}
//# sourceMappingURL=sessions.js.map