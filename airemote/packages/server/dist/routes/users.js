"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = userRoutes;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const auth_1 = require("../middleware/auth");
const users_1 = require("../db/users");
const database_1 = require("../db/database");
async function userRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAdmin);
    fastify.get('/', async () => (0, users_1.getAllUsers)());
    fastify.post('/', async (request, reply) => {
        const { email, name, password, role } = request.body;
        if (!email || !name || !password)
            return reply.code(400).send({ error: 'email, name, and password required' });
        if (password.length < 8)
            return reply.code(400).send({ error: 'Password must be at least 8 characters' });
        const user = await (0, users_1.createUser)(email, name, password, role || 'viewer');
        return reply.code(201).send(user);
    });
    fastify.patch('/:id', async (request, reply) => {
        const { name, role, password } = request.body;
        const { id } = request.params;
        if (password !== undefined) {
            if (password.length < 8)
                return reply.code(400).send({ error: 'Password must be at least 8 characters' });
            const db = (0, database_1.getDb)();
            const hash = await bcryptjs_1.default.hash(password, 12);
            const now = new Date().toISOString();
            await db.execute({
                sql: 'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
                args: [hash, now, id]
            });
        }
        const user = await (0, users_1.updateUser)(id, { name, role });
        if (!user)
            return reply.code(404).send({ error: 'User not found' });
        return user;
    });
    fastify.delete('/:id', async (request, reply) => {
        await (0, users_1.deleteUser)(request.params.id);
        return reply.code(204).send();
    });
}
//# sourceMappingURL=users.js.map