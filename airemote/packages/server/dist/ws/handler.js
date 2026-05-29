"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsHandler = wsHandler;
const registry_1 = require("./registry");
const agentHandler_1 = require("./agentHandler");
const clientHandler_1 = require("./clientHandler");
const devices_1 = require("../db/devices");
function wsHandler(socket, request) {
    const clientIp = request.ip;
    let connectionType = 'unknown';
    let connectionId = null;
    console.log(`🔌 New WebSocket connection from ${clientIp}`);
    socket.on('message', (raw) => {
        try {
            const message = JSON.parse(raw.toString());
            if (!message.type || message.payload === undefined) {
                socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid message format' } }));
                return;
            }
            if (message.type.startsWith('agent:')) {
                if (connectionType === 'unknown')
                    connectionType = 'agent';
                (0, agentHandler_1.handleAgentMessage)(socket, message, clientIp).then(result => {
                    if (result?.deviceId)
                        connectionId = result.deviceId;
                }).catch(err => console.error('Agent message error:', err));
            }
            else if (message.type.startsWith('client:')) {
                if (connectionType === 'unknown')
                    connectionType = 'client';
                (0, clientHandler_1.handleClientMessage)(socket, message, request);
            }
        }
        catch {
            socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Parse error' } }));
        }
    });
    socket.on('close', () => {
        if (connectionType === 'agent' && connectionId) {
            registry_1.deviceRegistry.disconnectDevice(connectionId);
            (0, devices_1.updateDeviceStatus)(connectionId, 'offline').catch(() => { });
            console.log(`📴 Agent disconnected: ${connectionId}`);
        }
        else if (connectionType === 'client' && connectionId) {
            registry_1.deviceRegistry.removeClient(connectionId, socket);
        }
    });
    socket.on('error', (err) => { console.error(`WebSocket error:`, err.message); });
}
//# sourceMappingURL=handler.js.map