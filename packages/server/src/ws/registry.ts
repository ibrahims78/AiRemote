import type { WebSocket } from 'ws'
import type { DeviceStats, AgentCapabilities } from '@airemote/shared'

interface ConnectedDevice {
  deviceId: string
  socket: WebSocket
  stats?: DeviceStats
  connectedAt: Date
  capabilities: AgentCapabilities
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
  connectTimeout?: NodeJS.Timeout
}

interface PtySession {
  dashboardSocket: WebSocket
  deviceId: string
  userId?: string
  startedAt: number
  connectTimeout?: NodeJS.Timeout
}

interface ScreenSession {
  dashboardSocket: WebSocket
  deviceId: string
  userId?: string
  startedAt: number
  connectTimeout?: NodeJS.Timeout
  frameThrottle?: () => boolean
}

class DeviceRegistry {
  private devices        = new Map<string, ConnectedDevice>()
  private clients        = new Map<WebSocket, ConnectedClient>()
  private sshSessions    = new Map<string, SshTunnelSession>()
  private ptySessions    = new Map<string, PtySession>()
  private screenSessions = new Map<string, ScreenSession>()

  // ── Device management ────────────────────────────────────────────────────

  registerDevice(deviceId: string, socket: WebSocket, _stats?: DeviceStats, capabilities?: Partial<AgentCapabilities>): void {
    // Do NOT store registration stats — they always have network=0 (first baseline call).
    // Stats will be populated exclusively from heartbeats, ensuring dashboard never shows
    // misleading "0 B/s" from the initial registration payload.
    this.devices.set(deviceId, {
      deviceId,
      socket,
      stats: undefined,
      connectedAt: new Date(),
      capabilities: {
        pty:          true,
        sshAvailable: capabilities?.sshAvailable ?? false,
        sshPort:      capabilities?.sshPort,
        sshUsername:  capabilities?.sshUsername,
        shell:        capabilities?.shell,
        ...capabilities
      }
    })
  }

  updateDeviceCapabilities(deviceId: string, caps: Partial<AgentCapabilities>): void {
    const dev = this.devices.get(deviceId)
    if (dev) dev.capabilities = { ...dev.capabilities, ...caps }
  }

  disconnectDevice(deviceId: string): void {
    // Notify and close all screen sessions watching this device
    for (const [sessionId, session] of this.screenSessions) {
      if (session.deviceId === deviceId) {
        if (session.connectTimeout) clearTimeout(session.connectTimeout)
        try {
          if (session.dashboardSocket.readyState === 1) {
            session.dashboardSocket.send(JSON.stringify({
              type:    'screen:error',
              payload: { message: 'الجهاز انقطع اتصاله / Device disconnected' }
            }))
            session.dashboardSocket.close()
          }
        } catch {}
        this.screenSessions.delete(sessionId)
      }
    }
    this.devices.delete(deviceId)
    this.broadcastDeviceStatus(deviceId, 'offline')
  }

  getDevice(deviceId: string): ConnectedDevice | undefined {
    return this.devices.get(deviceId)
  }

  isDeviceOnline(deviceId: string): boolean {
    const dev = this.devices.get(deviceId)
    if (!dev) return false
    // Treat a socket that is not OPEN as offline so callers don't try to send to zombies.
    // The dead entry will be purged on the next sendToDevice call.
    return dev.socket.readyState === 1
  }

  getDeviceCapabilities(deviceId: string): AgentCapabilities {
    return this.devices.get(deviceId)?.capabilities ?? { pty: false, sshAvailable: false }
  }

  getOnlineDeviceIds(): string[] {
    return Array.from(this.devices.keys())
  }

  getAllDeviceStats(): Array<{ deviceId: string; stats: DeviceStats }> {
    const result: Array<{ deviceId: string; stats: DeviceStats }> = []
    for (const [deviceId, entry] of this.devices) {
      if (entry.stats) result.push({ deviceId, stats: entry.stats })
    }
    return result
  }

  updateDeviceStats(deviceId: string, stats: DeviceStats): void {
    const device = this.devices.get(deviceId)
    if (device) {
      device.stats = stats
      this.broadcastStatsUpdate(deviceId, stats)
    }
  }

  // ── Client management ────────────────────────────────────────────────────

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

  // ── Messaging ────────────────────────────────────────────────────────────

  sendToDevice(deviceId: string, message: object): boolean {
    const device = this.devices.get(deviceId)
    if (!device) return false
    if (device.socket.readyState !== 1) {
      // Socket is dead — purge the zombie so subsequent isDeviceOnline calls return false
      this.disconnectDevice(deviceId)
      return false
    }
    try {
      device.socket.send(JSON.stringify(message))
      return true
    } catch {
      // Send failed (EPIPE / ECONNRESET) — treat as disconnected
      this.disconnectDevice(deviceId)
      return false
    }
  }

  broadcastDeviceStatus(deviceId: string, status: string, tunnelLayer?: string, capabilities?: AgentCapabilities, info?: unknown): void {
    const msg = JSON.stringify({
      type: 'broadcast:device_update',
      payload: { deviceId, status, tunnelLayer, capabilities, info },
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

  // ── SSH Tunnel Session Management ────────────────────────────────────────

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
    if (s?.connectTimeout) clearTimeout(s.connectTimeout)
    this.sshSessions.delete(sessionId)
    return s
  }

  setSshConnectTimeout(sessionId: string, timer: NodeJS.Timeout): void {
    const s = this.sshSessions.get(sessionId)
    if (s) s.connectTimeout = timer
  }

  clearSshConnectTimeout(sessionId: string): void {
    const s = this.sshSessions.get(sessionId)
    if (s?.connectTimeout) {
      clearTimeout(s.connectTimeout)
      s.connectTimeout = undefined
    }
  }

  getSessionIdByDashboardSocket(socket: WebSocket): string | undefined {
    for (const [sessionId, s] of this.sshSessions) {
      if (s.dashboardSocket === socket) return sessionId
    }
    return undefined
  }

  // ── PTY Session Management ───────────────────────────────────────────────

  addPtySession(
    sessionId: string,
    dashboardSocket: WebSocket,
    deviceId: string,
    userId?: string
  ): void {
    this.ptySessions.set(sessionId, {
      dashboardSocket,
      deviceId,
      userId,
      startedAt: Date.now()
    })
  }

  getPtySession(sessionId: string): PtySession | undefined {
    return this.ptySessions.get(sessionId)
  }

  removePtySession(sessionId: string): PtySession | undefined {
    const s = this.ptySessions.get(sessionId)
    if (s?.connectTimeout) clearTimeout(s.connectTimeout)
    this.ptySessions.delete(sessionId)
    return s
  }

  setPtyConnectTimeout(sessionId: string, timer: NodeJS.Timeout): void {
    const s = this.ptySessions.get(sessionId)
    if (s) s.connectTimeout = timer
  }

  clearPtyConnectTimeout(sessionId: string): void {
    const s = this.ptySessions.get(sessionId)
    if (s?.connectTimeout) {
      clearTimeout(s.connectTimeout)
      s.connectTimeout = undefined
    }
  }

  getPtySessionIdByDashboardSocket(socket: WebSocket): string | undefined {
    for (const [sessionId, s] of this.ptySessions) {
      if (s.dashboardSocket === socket) return sessionId
    }
    return undefined
  }

  // ── Screen Session Management ────────────────────────────────────────────

  addScreenSession(sessionId: string, dashboardSocket: WebSocket, deviceId: string, userId?: string): void {
    this.screenSessions.set(sessionId, {
      dashboardSocket, deviceId, userId, startedAt: Date.now()
    })
  }

  getScreenSession(sessionId: string): ScreenSession | undefined {
    return this.screenSessions.get(sessionId)
  }

  removeScreenSession(sessionId: string): ScreenSession | undefined {
    const s = this.screenSessions.get(sessionId)
    if (s?.connectTimeout) clearTimeout(s.connectTimeout)
    this.screenSessions.delete(sessionId)
    return s
  }

  setScreenConnectTimeout(sessionId: string, timer: NodeJS.Timeout): void {
    const s = this.screenSessions.get(sessionId)
    if (s) s.connectTimeout = timer
  }

  clearScreenConnectTimeout(sessionId: string): void {
    const s = this.screenSessions.get(sessionId)
    if (s?.connectTimeout) { clearTimeout(s.connectTimeout); s.connectTimeout = undefined }
  }

  setScreenFrameThrottle(sessionId: string, fn: () => boolean): void {
    const s = this.screenSessions.get(sessionId)
    if (s) s.frameThrottle = fn
  }

  /** Returns all active screen sessions watching a given device */
  getScreenSessionsForDevice(deviceId: string): Array<{ sessionId: string; session: ScreenSession }> {
    const result: Array<{ sessionId: string; session: ScreenSession }> = []
    for (const [sessionId, session] of this.screenSessions) {
      if (session.deviceId === deviceId) result.push({ sessionId, session })
    }
    return result
  }

  getScreenSessionIdByDashboardSocket(socket: WebSocket): string | undefined {
    for (const [sessionId, s] of this.screenSessions) {
      if (s.dashboardSocket === socket) return sessionId
    }
    return undefined
  }

  getStats() {
    return {
      onlineDevices:    this.devices.size,
      connectedClients: this.clients.size,
      sshSessions:      this.sshSessions.size,
      ptySessions:      this.ptySessions.size,
      screenSessions:   this.screenSessions.size
    }
  }

  // ── Zombie sweeper ────────────────────────────────────────────────────────
  // Returns deviceIds that were found dead and removed from the registry.
  // Caller is responsible for updating the DB and firing alerts.
  sweepZombieDevices(): string[] {
    const swept: string[] = []
    for (const [deviceId, dev] of this.devices) {
      if (dev.socket.readyState !== 1 /* WebSocket.OPEN */) {
        swept.push(deviceId)
        this.disconnectDevice(deviceId)
      }
    }
    return swept
  }
}

export const deviceRegistry = new DeviceRegistry()
