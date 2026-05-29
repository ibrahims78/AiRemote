"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.findUserByEmail = findUserByEmail;
exports.findUserById = findUserById;
exports.getAllUsers = getAllUsers;
exports.createUser = createUser;
exports.verifyPassword = verifyPassword;
exports.countUsers = countUsers;
exports.updateUser = updateUser;
exports.deleteUser = deleteUser;
const uuid_1 = require("uuid");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("./database");
function rowToUser(row) {
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        role: row.role,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
    };
}
async function findUserByEmail(email) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
    const row = result.rows[0];
    if (!row)
        return null;
    return { ...rowToUser(row), passwordHash: row.password_hash };
}
async function findUserById(id) {
    const db = (0, database_1.getDb)();
    const result = await db.execute({ sql: 'SELECT * FROM users WHERE id = ?', args: [id] });
    const row = result.rows[0];
    if (!row)
        return null;
    return rowToUser(row);
}
async function getAllUsers() {
    const db = (0, database_1.getDb)();
    const result = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
    return result.rows.map(rowToUser);
}
async function createUser(email, name, password, role = 'viewer') {
    const db = (0, database_1.getDb)();
    const id = (0, uuid_1.v4)();
    const passwordHash = await bcryptjs_1.default.hash(password, 12);
    const now = new Date().toISOString();
    await db.execute({
        sql: `INSERT INTO users (id, email, name, role, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [id, email, name, role, passwordHash, now, now]
    });
    return (await findUserById(id));
}
async function verifyPassword(password, hash) {
    return bcryptjs_1.default.compare(password, hash);
}
async function countUsers() {
    const db = (0, database_1.getDb)();
    const result = await db.execute('SELECT COUNT(*) as count FROM users');
    const row = result.rows[0];
    return row.count;
}
async function updateUser(id, updates) {
    const db = (0, database_1.getDb)();
    const now = new Date().toISOString();
    if (updates.name !== undefined) {
        await db.execute({ sql: 'UPDATE users SET name = ?, updated_at = ? WHERE id = ?', args: [updates.name, now, id] });
    }
    if (updates.role !== undefined) {
        await db.execute({ sql: 'UPDATE users SET role = ?, updated_at = ? WHERE id = ?', args: [updates.role, now, id] });
    }
    return findUserById(id);
}
async function deleteUser(id) {
    const db = (0, database_1.getDb)();
    await db.execute({ sql: 'DELETE FROM users WHERE id = ?', args: [id] });
}
//# sourceMappingURL=users.js.map