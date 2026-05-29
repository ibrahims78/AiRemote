"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildServer = buildServer;
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const jwt_1 = __importDefault(require("@fastify/jwt"));
const cookie_1 = __importDefault(require("@fastify/cookie"));
const multipart_1 = __importDefault(require("@fastify/multipart"));
const database_1 = require("./db/database");
const auth_1 = require("./routes/auth");
const devices_1 = require("./routes/devices");
const sessions_1 = require("./routes/sessions");
const users_1 = require("./routes/users");
const sftp_1 = require("./routes/sftp");
const ai_1 = require("./routes/ai");
const settings_1 = require("./routes/settings");
const handler_1 = require("./ws/handler");
const sshHandler_1 = require("./ws/sshHandler");
async function buildServer() {
    const app = (0, fastify_1.default)({
        logger: {
            level: process.env.LOG_LEVEL || 'info',
            transport: process.env.NODE_ENV !== 'production'
                ? { target: 'pino-pretty', options: { colorize: true } }
                : undefined
        }
    });
    await (0, database_1.initDatabase)();
    await app.register(cors_1.default, {
        origin: process.env.DASHBOARD_URL || true,
        credentials: true
    });
    await app.register(cookie_1.default);
    await app.register(multipart_1.default, {
        limits: {
            fileSize: 500 * 1024 * 1024, // 500 MB
            files: 1
        }
    });
    await app.register(jwt_1.default, {
        secret: process.env.JWT_SECRET || 'airemote-dev-secret-change-in-production',
        sign: { expiresIn: '15m' }
    });
    await app.register(websocket_1.default);
    app.get('/health', async () => ({
        status: 'ok',
        version: '1.0.0',
        time: new Date().toISOString()
    }));
    await app.register(auth_1.authRoutes, { prefix: '/api/auth' });
    await app.register(devices_1.deviceRoutes, { prefix: '/api/devices' });
    await app.register(sessions_1.sessionRoutes, { prefix: '/api/sessions' });
    await app.register(users_1.userRoutes, { prefix: '/api/users' });
    await app.register(sftp_1.sftpRoutes, { prefix: '/api/sftp' });
    await app.register(ai_1.aiRoutes, { prefix: '/api/ai' });
    await app.register(settings_1.settingsRoutes, { prefix: '/api/settings' });
    await app.register(async function (fastify) {
        fastify.get('/ws', { websocket: true }, handler_1.wsHandler);
        fastify.get('/ssh', { websocket: true }, sshHandler_1.handleSshWebSocket);
    });
    return app;
}
//# sourceMappingURL=app.js.map