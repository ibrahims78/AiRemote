"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.requireAdmin = requireAdmin;
async function requireAuth(request, reply) {
    try {
        await request.jwtVerify();
    }
    catch {
        reply.code(401).send({ error: 'Unauthorized' });
    }
}
async function requireAdmin(request, reply) {
    try {
        await request.jwtVerify();
        const payload = request.user;
        if (payload.role !== 'admin') {
            reply.code(403).send({ error: 'Forbidden — Admin required' });
        }
    }
    catch {
        reply.code(401).send({ error: 'Unauthorized' });
    }
}
//# sourceMappingURL=auth.js.map