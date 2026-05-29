"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceRoutes = deviceRoutes;
const uuid_1 = require("uuid");
const auth_1 = require("../middleware/auth");
const devices_1 = require("../db/devices");
const registry_1 = require("../ws/registry");
const agentHandler_1 = require("../ws/agentHandler");
async function deviceRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAuth);
    fastify.get('/', async (request) => {
        const user = request.user;
        const devices = user.role === 'admin' ? await (0, devices_1.getAllDevices)() : await (0, devices_1.getDevicesByOwner)(user.userId);
        return devices.map(d => ({ ...d, online: registry_1.deviceRegistry.isDeviceOnline(d.id) }));
    });
    fastify.post('/', async (request, reply) => {
        const user = request.user;
        const { name } = request.body;
        if (!name?.trim())
            return reply.code(400).send({ error: 'Device name required' });
        const device = await (0, devices_1.createDevice)(name.trim(), user.userId);
        return reply.code(201).send(device);
    });
    fastify.get('/:id', async (request, reply) => {
        const user = request.user;
        const device = await (0, devices_1.getDeviceById)(request.params.id);
        if (!device)
            return reply.code(404).send({ error: 'Device not found' });
        if (user.role !== 'admin' && device.ownerId !== user.userId)
            return reply.code(403).send({ error: 'Forbidden' });
        return { ...device, online: registry_1.deviceRegistry.isDeviceOnline(device.id) };
    });
    fastify.patch('/:id', async (request, reply) => {
        const user = request.user;
        const device = await (0, devices_1.getDeviceById)(request.params.id);
        if (!device)
            return reply.code(404).send({ error: 'Device not found' });
        if (user.role !== 'admin' && device.ownerId !== user.userId)
            return reply.code(403).send({ error: 'Forbidden' });
        await (0, devices_1.renameDevice)(device.id, request.body.name);
        return (0, devices_1.getDeviceById)(device.id);
    });
    fastify.delete('/:id', { preHandler: auth_1.requireAdmin }, async (request, reply) => {
        const device = await (0, devices_1.getDeviceById)(request.params.id);
        if (!device)
            return reply.code(404).send({ error: 'Device not found' });
        await (0, devices_1.deleteDevice)(device.id);
        return reply.code(204).send();
    });
    // Execute a command on a device via the Agent WebSocket (no SSH needed)
    fastify.post('/:id/exec', async (request, reply) => {
        const user = request.user;
        const { id } = request.params;
        const { command, timeoutMs = 30000 } = request.body;
        if (!command?.trim())
            return reply.code(400).send({ error: 'Command required' });
        const device = await (0, devices_1.getDeviceById)(id);
        if (!device)
            return reply.code(404).send({ error: 'Device not found' });
        if (user.role !== 'admin' && device.ownerId !== user.userId)
            return reply.code(403).send({ error: 'Forbidden' });
        if (!registry_1.deviceRegistry.isDeviceOnline(id)) {
            return reply.code(503).send({ error: 'Device is offline' });
        }
        const commandId = (0, uuid_1.v4)();
        try {
            const result = await (0, agentHandler_1.sendCommandToAgent)(id, commandId, command.trim(), Math.min(timeoutMs, 120000));
            return reply.send({
                ok: true,
                commandId,
                command: command.trim(),
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                duration: result.duration
            });
        }
        catch (err) {
            const e = err;
            return reply.code(504).send({ error: e.message || 'Command execution failed' });
        }
    });
    // Get live stats for a device
    fastify.get('/:id/stats', async (request, reply) => {
        const user = request.user;
        const device = await (0, devices_1.getDeviceById)(request.params.id);
        if (!device)
            return reply.code(404).send({ error: 'Device not found' });
        if (user.role !== 'admin' && device.ownerId !== user.userId)
            return reply.code(403).send({ error: 'Forbidden' });
        const regDevice = registry_1.deviceRegistry.getDevice(request.params.id);
        return {
            online: !!regDevice,
            stats: regDevice?.stats || null,
            connectedAt: regDevice?.connectedAt || null
        };
    });
}
//# sourceMappingURL=devices.js.map