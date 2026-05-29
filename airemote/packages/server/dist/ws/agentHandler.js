"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAgentMessage = handleAgentMessage;
exports.sendCommandToAgent = sendCommandToAgent;
const registry_1 = require("./registry");
const devices_1 = require("../db/devices");
const pendingCommands = new Map();
async function handleAgentMessage(socket, message, clientIp) {
    switch (message.type) {
        case 'agent:register': {
            const payload = message.payload;
            const device = await (0, devices_1.getDeviceByToken)(payload.token);
            if (!device) {
                socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid device token' }, timestamp: Date.now() }));
                socket.close();
                return null;
            }
            registry_1.deviceRegistry.registerDevice(device.id, socket, payload.stats);
            await (0, devices_1.updateDeviceStatus)(device.id, 'online', payload.tunnelLayer);
            await (0, devices_1.updateDeviceInfo)(device.id, payload.info);
            socket.send(JSON.stringify({ type: 'server:registered', payload: { deviceId: device.id, message: 'Connected successfully' }, timestamp: Date.now() }));
            registry_1.deviceRegistry.broadcastDeviceStatus(device.id, 'online');
            console.log(`✅ Agent registered: ${device.name} (${device.id}) from ${clientIp}`);
            return { deviceId: device.id };
        }
        case 'agent:heartbeat': {
            const payload = message.payload;
            await (0, devices_1.updateDeviceSeen)(payload.deviceId);
            registry_1.deviceRegistry.updateDeviceStats(payload.deviceId, payload.stats);
            return { deviceId: payload.deviceId };
        }
        case 'agent:command_result': {
            const payload = message.payload;
            const pending = pendingCommands.get(payload.commandId);
            if (pending) {
                clearTimeout(pending.timeout);
                pending.resolve(payload);
                pendingCommands.delete(payload.commandId);
            }
            return null;
        }
        default:
            return null;
    }
}
function sendCommandToAgent(deviceId, commandId, command, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const sent = registry_1.deviceRegistry.sendToDevice(deviceId, {
            type: 'server:command',
            payload: { commandId, type: 'shell', command },
            timestamp: Date.now()
        });
        if (!sent) {
            reject(new Error('Device not online'));
            return;
        }
        const timeout = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('Command timeout')); }, timeoutMs);
        pendingCommands.set(commandId, { resolve, timeout });
    });
}
//# sourceMappingURL=agentHandler.js.map