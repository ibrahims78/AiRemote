"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDevice = createDevice;
exports.getDeviceById = getDeviceById;
exports.getDeviceByToken = getDeviceByToken;
exports.getDevicesByOwner = getDevicesByOwner;
exports.getAllDevices = getAllDevices;
exports.updateDeviceStatus = updateDeviceStatus;
exports.updateDeviceInfo = updateDeviceInfo;
exports.updateDeviceSeen = updateDeviceSeen;
exports.deleteDevice = deleteDevice;
exports.renameDevice = renameDevice;
const uuid_1 = require("uuid");
const database_1 = require("./database");
function rowToDevice(row) {
    return {
        id: row.id,
        name: row.name,
        token: row.token,
        ownerId: row.owner_id,
        info: row.info ? JSON.parse(row.info) : undefined,
        status: row.status,
        tunnelLayer: row.tunnel_layer || undefined,
        tunnelAddress: row.tunnel_address || undefined,
        lastSeen: row.last_seen ? new Date(row.last_seen) : undefined,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
    };
}
async function createDevice(name, ownerId) {
    const db = (0, database_1.getDb)();
    const id = (0, uuid_1.v4)();
    const token = (0, uuid_1.v4)() + '-' + (0, uuid_1.v4)();
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO devices (id, name, token, owner_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'offline', ?, ?)`,
        args: [id, name, token, ownerId, now, now]
    });
    return (await getDeviceById(id));
}
async function getDeviceById(id) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM devices WHERE id = ?', args: [id] });
    const row = result.rows[0];
    if (!row)
        return null;
    return rowToDevice(row);
}
async function getDeviceByToken(token) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM devices WHERE token = ?', args: [token] });
    const row = result.rows[0];
    if (!row)
        return null;
    return rowToDevice(row);
}
async function getDevicesByOwner(ownerId) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM devices WHERE owner_id = ? ORDER BY name', args: [ownerId] });
    return result.rows.map(rowToDevice);
}
async function getAllDevices() {
    const db = (0, database_1.getDb)();
    const result = await db.execute('SELECT * FROM devices ORDER BY name');
    return result.rows.map(rowToDevice);
}
async function updateDeviceStatus(id, status, tunnelLayer, tunnelAddress) {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString();
    await db.execute({
        sql: 'UPDATE devices SET status = ?, tunnel_layer = ?, tunnel_address = ?, last_seen = ?, updated_at = ? WHERE id = ?',
        args: [status, tunnelLayer || null, tunnelAddress || null, now, now, id]
    });
}
async function updateDeviceInfo(id, info) {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString();
    await db.execute({ sql: 'UPDATE devices SET info = ?, updated_at = ? WHERE id = ?', args: [JSON.stringify(info), now, id] });
}
async function updateDeviceSeen(id) {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString();
    await db.execute({ sql: 'UPDATE devices SET last_seen = ?, updated_at = ? WHERE id = ?', args: [now, now, id] });
}
async function deleteDevice(id) {
    const db = (0, database_1.getDb)();
    await db.execute({ sql: 'DELETE FROM devices WHERE id = ?', args: [id] });
}
async function renameDevice(id, name) {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString();
    await db.execute({ sql: 'UPDATE devices SET name = ?, updated_at = ? WHERE id = ?', args: [name, now, id] });
}
//# sourceMappingURL=devices.js.map