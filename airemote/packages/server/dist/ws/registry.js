"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deviceRegistry = void 0;
class DeviceRegistry {
    constructor() {
        this.devices = new Map();
        this.clients = new Map();
    }
    registerDevice(deviceId, socket, stats) {
        this.devices.set(deviceId, { deviceId, socket, stats, connectedAt: new Date() });
    }
    disconnectDevice(deviceId) {
        this.devices.delete(deviceId);
        this.broadcastDeviceStatus(deviceId, 'offline');
    }
    getDevice(deviceId) {
        return this.devices.get(deviceId);
    }
    isDeviceOnline(deviceId) {
        return this.devices.has(deviceId);
    }
    getOnlineDeviceIds() {
        return Array.from(this.devices.keys());
    }
    updateDeviceStats(deviceId, stats) {
        const device = this.devices.get(deviceId);
        if (device) {
            device.stats = stats;
            // Broadcast to ALL connected clients (fix: not just subscribed ones, since clients subscribe to all)
            this.broadcastStatsUpdate(deviceId, stats);
        }
    }
    addClient(userId, socket) {
        this.clients.set(socket, { userId, socket, subscribedDevices: new Set() });
    }
    removeClient(userId, socket) {
        this.clients.delete(socket);
    }
    subscribeClientToDevice(socket, deviceId) {
        const client = this.clients.get(socket);
        if (client)
            client.subscribedDevices.add(deviceId);
    }
    subscribeClientToAll(socket) {
        const client = this.clients.get(socket);
        if (client) {
            for (const deviceId of this.devices.keys()) {
                client.subscribedDevices.add(deviceId);
            }
        }
    }
    sendToDevice(deviceId, message) {
        const device = this.devices.get(deviceId);
        if (!device || device.socket.readyState !== 1)
            return false;
        device.socket.send(JSON.stringify(message));
        return true;
    }
    broadcastDeviceStatus(deviceId, status, tunnelLayer) {
        const msg = JSON.stringify({
            type: 'broadcast:device_update',
            payload: { deviceId, status, tunnelLayer },
            timestamp: Date.now()
        });
        for (const [, client] of this.clients) {
            if (client.socket.readyState === 1) {
                client.socket.send(msg);
            }
        }
    }
    broadcastStatsUpdate(deviceId, stats) {
        const msg = JSON.stringify({
            type: 'broadcast:stats_update',
            payload: { deviceId, stats },
            timestamp: Date.now()
        });
        // Broadcast to ALL clients — every dashboard user needs live stats
        for (const [, client] of this.clients) {
            if (client.socket.readyState === 1) {
                client.socket.send(msg);
            }
        }
    }
    getStats() {
        return {
            onlineDevices: this.devices.size,
            connectedClients: this.clients.size
        };
    }
}
exports.deviceRegistry = new DeviceRegistry();
//# sourceMappingURL=registry.js.map