"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRoutes = authRoutes;
const uuid_1 = require("uuid");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const database_1 = require("../db/database");
const users_1 = require("../db/users");
async function authRoutes(fastify) {
    // Login
    fastify.post('/login', async (request, reply) => {
        const { email, password } = request.body;
        if (!email || !password)
            return reply.code(400).send({ error: 'Email and password required' });
        const user = await (0, users_1.findUserByEmail)(email);
        if (!user)
            return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' });
        const valid = await (0, users_1.verifyPassword)(password, user.passwordHash);
        if (!valid)
            return reply.code(401).send({ error: 'بيانات الدخول غير صحيحة' });
        const token = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role });
        const refreshToken = (0, uuid_1.v4)();
        const refreshHash = await bcryptjs_1.default.hash(refreshToken, 10);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const db = (0, database_1.getDb)();
        await db.execute({
            sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
            args: [(0, uuid_1.v4)(), user.id, refreshHash, expiresAt]
        });
        const { passwordHash, ...safeUser } = user;
        return reply.send({ token, refreshToken, user: safeUser });
    });
    // Refresh access token using refresh token
    fastify.post('/refresh', async (request, reply) => {
        const { refreshToken } = request.body;
        if (!refreshToken)
            return reply.code(400).send({ error: 'Refresh token required' });
        const db = (0, database_1.getDb)();
        const result = await db.execute({
            sql: `SELECT * FROM refresh_tokens WHERE expires_at > ? ORDER BY created_at DESC LIMIT 50`,
            args: [new Date().toISOString()]
        });
        let matchedRow = null;
        for (const row of result.rows) {
            const match = await bcryptjs_1.default.compare(refreshToken, row.token_hash);
            if (match) {
                matchedRow = row;
                break;
            }
        }
        if (!matchedRow)
            return reply.code(401).send({ error: 'Invalid or expired refresh token' });
        // Rotate refresh token
        await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [matchedRow.id] });
        const user = await (0, users_1.findUserById)(matchedRow.user_id);
        if (!user)
            return reply.code(404).send({ error: 'User not found' });
        const newToken = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role });
        const newRefreshToken = (0, uuid_1.v4)();
        const newRefreshHash = await bcryptjs_1.default.hash(newRefreshToken, 10);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        await db.execute({
            sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
            args: [(0, uuid_1.v4)(), user.id, newRefreshHash, expiresAt]
        });
        return reply.send({ token: newToken, refreshToken: newRefreshToken, user });
    });
    // Setup initial admin account
    fastify.post('/setup', async (request, reply) => {
        const count = await (0, users_1.countUsers)();
        if (count > 0)
            return reply.code(400).send({ error: 'Setup already completed' });
        const body = request.body;
        if (!body.email || !body.name || !body.password) {
            return reply.code(400).send({ error: 'email, name, and password required' });
        }
        if (body.password.length < 8)
            return reply.code(400).send({ error: 'Password must be at least 8 characters' });
        const user = await (0, users_1.createUser)(body.email, body.name, body.password, 'admin');
        const token = fastify.jwt.sign({ userId: user.id, email: user.email, role: user.role });
        const refreshToken = (0, uuid_1.v4)();
        const refreshHash = await bcryptjs_1.default.hash(refreshToken, 10);
        const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        const db = (0, database_1.getDb)();
        await db.execute({
            sql: `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
            args: [(0, uuid_1.v4)(), user.id, refreshHash, expiresAt]
        });
        return reply.code(201).send({ token, refreshToken, user });
    });
    // Setup status
    fastify.get('/setup-status', async () => {
        const count = await (0, users_1.countUsers)();
        return { setupRequired: count === 0 };
    });
    // Get current user
    fastify.get('/me', {
        preHandler: async (req, rep) => {
            try {
                await req.jwtVerify();
            }
            catch {
                rep.code(401).send({ error: 'Unauthorized' });
            }
        }
    }, async (request, reply) => {
        const payload = request.user;
        const user = await (0, users_1.findUserById)(payload.userId);
        if (!user)
            return reply.code(404).send({ error: 'User not found' });
        return reply.send({ user });
    });
    // Logout — invalidate refresh token
    fastify.post('/logout', async (request) => {
        const { refreshToken } = request.body || {};
        if (refreshToken) {
            try {
                const db = (0, database_1.getDb)();
                const result = await db.execute({
                    sql: `SELECT * FROM refresh_tokens WHERE expires_at > ? LIMIT 50`,
                    args: [new Date().toISOString()]
                });
                for (const row of result.rows) {
                    const match = await bcryptjs_1.default.compare(refreshToken, row.token_hash);
                    if (match) {
                        await db.execute({ sql: 'DELETE FROM refresh_tokens WHERE id = ?', args: [row.id] });
                        break;
                    }
                }
            }
            catch { }
        }
        return { ok: true };
    });
}
//# sourceMappingURL=auth.js.map