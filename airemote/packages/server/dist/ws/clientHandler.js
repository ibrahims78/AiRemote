"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleClientMessage = handleClientMessage;
const registry_1 = require("./registry");
const devices_1 = require("../db/devices");
function handleClientMessage(socket, message, _request) {
    switch (message.type) {
        case 'client:subscribe': {
            const { userId, deviceIds } = message.payload;
            registry_1.deviceRegistry.addClient(userId, socket);
            if (Array.isArray(deviceIds) && deviceIds.length > 0) {
                for (const deviceId of deviceIds) {
                    registry_1.deviceRegistry.subscribeClientToDevice(socket, deviceId);
                }
            }
            // Stats are broadcast to all clients regardless — no explicit subscription needed
            const onlineDeviceIds = registry_1.deviceRegistry.getOnlineDeviceIds();
            socket.send(JSON.stringify({
                type: 'server:registered',
                payload: { message: 'Subscribed', onlineDevices: onlineDeviceIds },
                timestamp: Date.now()
            }));
            break;
        }
        case 'client:command': {
            const { deviceId, commandId, command } = message.payload;
            // getDeviceById is async — fire and forget with proper handling
            (0, devices_1.getDeviceById)(deviceId).then(device => {
                if (!device) {
                    socket.send(JSON.stringify({
                        type: 'server:error',
                        payload: { commandId, message: 'Device not found' },
                        timestamp: Date.now()
                    }));
                    return;
                }
                const sent = registry_1.deviceRegistry.sendToDevice(deviceId, {
                    type: 'server:command',
                    payload: { commandId, type: 'shell', command },
                    timestamp: Date.now()
                });
                if (!sent) {
                    socket.send(JSON.stringify({
                        type: 'server:error',
                        payload: { commandId, message: 'Device offline' },
                        timestamp: Date.now()
                    }));
                }
            }).catch(err => {
                console.error('client:command error:', err);
                socket.send(JSON.stringify({
                    type: 'server:error',
                    payload: { commandId, message: 'Internal error' },
                    timestamp: Date.now()
                }));
            });
            break;
        }
        default:
            break;
    }
}
//# sourceMappingURL=clientHandler.js.map