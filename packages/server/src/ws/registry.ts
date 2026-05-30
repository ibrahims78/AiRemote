import type { WebSocket } from 'ws'
import type { DeviceStats } from '@airemote/shared'

interface ConnectedDevice {
  deviceId: string
  socket: WebSocket
  stats?: DeviceStats
  connectedAt: Date
}

interface ConnectedClient {
  userId: string
  socket: WebSocket
  subscribedDevices: Set<string>
}

interface SshTunnelSession {
  dashboardSocket: WebSocket
  deviceId: string
  userId?: string
  userEmail?: string
  startedAt: number
}

class DeviceRegistry {
  private devices = new Map<string, ConnectedDevice>()
  private clients = new Map<WebSocket, ConnectedClient>()
  private sshSessions = new Map<string, SshTunnelSession>()

  registerDevice(deviceId: string, socket: WebSocket, stats?: DeviceStats): void {
    this.devices.set(deviceId, { deviceId, socket, stats, connectedAt: new Date() })
  }

  disconnectDevice(deviceId: string): void {
    this.devices.delete(deviceId)
    this.broadcastDeviceStatus(deviceId, 'offline')
  }

  getDevice(deviceId: string): ConnectedDevice | undefined {
    return this.devices.get(deviceId)
  }

  isDeviceOnline(deviceId: string): boolean {
    return this.devices.has(deviceId)
  }

  getOnlineDeviceIds(): string[] {
    return Array.from(this.devices.keys())
  }

  updateDeviceStats(deviceId: string, stats: DeviceStats): void {
    const device = this.devices.get(deviceId)
    if (device) {
      device.stats = stats
      this.broadcastStatsUpdate(deviceId, stats)
    }
  }

  addClient(userId: string, socket: WebSocket): void {
    this.clients.set(socket, { userId, socket, subscribedDevices: new Set() })
  }

  removeClient(socket: WebSocket): void {
    this.clients.delete(socket)
  }

  subscribeClientToDevice(socket: WebSocket, deviceId: string): void {
    const client = this.clients.get(socket)
    if (client) client.subscribedDevices.add(deviceId)
  }

  subscribeClientToAll(socket: WebSocket): void {
    const client = this.clients.get(socket)
    if (client) {
      for (const deviceId of this.devices.keys()) {
        client.subscribedDevices.add(deviceId)
      }
    }
  }

  sendToDevice(deviceId: string, message: object): boolean {
    const device = this.devices.get(deviceId)
    if (!device || device.socket.readyState !== 1) return false
    try {
      device.socket.send(JSON.stringify(message))
      return true
    } catch {
      return false
    }
  }

  broadcastDeviceStatus(deviceId: string, status: string, tunnelLayer?: string): void {
    const msg = JSON.stringify({
      type: 'broadcast:device_update',
      payload: { deviceId, status, tunnelLayer },
      timestamp: Date.now()
    })
    for (const [, client] of this.clients) {
      if (client.socket.readyState === 1) {
        try { client.socket.send(msg) } catch {}
      }
    }
  }

  broadcastStatsUpdate(deviceId: string, stats: DeviceStats): void {
    const msg = JSON.stringify({
      type: 'broadcast:stats_update',
      payload: { deviceId, stats },
      timestamp: Date.now()
    })
    for (const [, client] of this.clients) {
      if (client.socket.readyState === 1) {
        try { client.socket.send(msg) } catch {}
      }
    }
  }

  broadcastNotification(userId: string, notification: object): void {
    const msg = JSON.stringify({
      type: 'broadcast:notification',
      payload: notification,
      timestamp: Date.now()
    })
    for (const [, client] of this.clients) {
      if (client.userId === userId && client.socket.readyState === 1) {
        try { client.socket.send(msg) } catch {}
      }
    }
  }

  getDeviceIdBySocket(socket: WebSocket): string | undefined {
    for (const [deviceId, entry] of this.devices) {
      if (entry.socket === socket) return deviceId
    }
    return undefined
  }

  // ── SSH Tunnel Session Management ─────────────────────────────────────────

  addSshSession(
    sessionId: string,
    dashboardSocket: WebSocket,
    deviceId: string,
    userId?: string,
    userEmail?: string
  ): void {
    this.sshSessions.set(sessionId, {
      dashboardSocket,
      deviceId,
      userId,
      userEmail,
      startedAt: Date.now()
    })
  }

  getSshSession(sessionId: string): SshTunnelSession | undefined {
    return this.sshSessions.get(sessionId)
  }

  removeSshSession(sessionId: string): SshTunnelSession | undefined {
    const s = this.sshSessions.get(sessionId)
    this.sshSessions.delete(sessionId)
    return s
  }

  getSessionIdByDashboardSocket(socket: WebSocket): string | undefined {
    for (const [sessionId, s] of this.sshSessions) {
      if (s.dashboardSocket === socket) return sessionId
    }
    return undefined
  }

  getStats() {
    return {
      onlineDevices: this.devices.size,
      connectedClients: this.clients.size
    }
  }
}

export const deviceRegistry = new DeviceRegistry()
