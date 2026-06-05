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

// Multi-viewer: a single agent capture loop can be watched by multiple dashboard
// sockets simultaneously.  All frames are fanned-out to every socket in the Set.
interface ScreenSession {
  dashboardSockets: Set<WebSocket>
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

  // deviceId → agentSessionId — tracks the ONE active capture loop per device
  private deviceScreenSessions = new Map<string, string>()

  // ── Device management ────────────────────────────────────────────────────

  registerDevice(deviceId: string, socket: WebSocket, _stats?: DeviceStats, capabilities?: Partial<AgentCapabilities>): void {
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
        for (const ws of session.dashboardSockets) {
          try {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify({
                type:    'screen:error',
                payload: { message: 'الجهاز انقطع اتصاله / Device disconnected' }
              }))
              ws.close()
            }
          } catch {}
        }
        this.screenSessions.delete(sessionId)
      }
    }
    this.deviceScreenSessions.delete(deviceId)
    this.devices.delete(deviceId)
    this.broadcastDeviceStatus(deviceId, 'offline')
  }

  getDevice(deviceId: string): ConnectedDevice | undefined {
    return this.devices.get(deviceId)
  }

  isDeviceOnline(deviceId: string): boolean {
    const dev = this.devices.get(deviceId)
    if (!dev) return false
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
      this.disconnectDevice(deviceId)
      return false
    }
    try {
      device.socket.send(JSON.stringify(message))
      return true
    } catch {
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

  // ── Screen Session Management (Multi-viewer) ─────────────────────────────

  /**
   * Add a dashboard viewer for a device.
   *
   * If the device already has an active capture session, the viewer's socket
   * is joined to the existing session (agent keeps the same capture loop).
   * Returns { agentSessionId, isNew } where:
   *   - agentSessionId: the sessionId the agent uses (may be pre-existing)
   *   - isNew: true only when a new agent capture loop must be started
   */
  addScreenSession(
    newSessionId: string,
    dashboardSocket: WebSocket,
    deviceId: string,
    userId?: string
  ): { agentSessionId: string; isNew: boolean } {
    const existingId = this.deviceScreenSessions.get(deviceId)
    const existing   = existingId ? this.screenSessions.get(existingId) : undefined

    if (existing && existing.dashboardSockets.size > 0) {
      existing.dashboardSockets.add(dashboardSocket)
      return { agentSessionId: existingId, isNew: false }
    }

    this.screenSessions.set(newSessionId, {
      dashboardSockets: new Set([dashboardSocket]),
      deviceId,
      userId,
      startedAt: Date.now()
    })
    this.deviceScreenSessions.set(deviceId, newSessionId)
    return { agentSessionId: newSessionId, isNew: true }
  }

  getScreenSession(sessionId: string): ScreenSession | undefined {
    return this.screenSessions.get(sessionId)
  }

  /**
   * Get the active agentSessionId for a device (if any).
   * Used by screenHandler to determine if a new capture loop is needed.
   */
  getActiveScreenSessionForDevice(deviceId: string): string | undefined {
    return this.deviceScreenSessions.get(deviceId)
  }

  /**
   * Remove a single viewer from a session.
   * Returns true if this was the LAST viewer (caller should stop the agent loop).
   */
  removeViewerFromScreenSession(agentSessionId: string, socket: WebSocket): boolean {
    const session = this.screenSessions.get(agentSessionId)
    if (!session) return true
    session.dashboardSockets.delete(socket)
    return session.dashboardSockets.size === 0
  }

  removeScreenSession(sessionId: string): ScreenSession | undefined {
    const s = this.screenSessions.get(sessionId)
    if (s?.connectTimeout) clearTimeout(s.connectTimeout)
    this.screenSessions.delete(sessionId)
    this.deviceScreenSessions.delete(s?.deviceId ?? '')
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

  /**
   * Fan-out a message to every dashboard viewer watching sessionId.
   * data may be a JSON string or a binary Buffer.
   */
  sendToScreenViewers(sessionId: string, data: string | Buffer): void {
    const session = this.screenSessions.get(sessionId)
    if (!session) return
    for (const ws of session.dashboardSockets) {
      if (ws.readyState === 1) {
        try { ws.send(data) } catch {}
      }
    }
  }

  /** Close all viewer sockets for a session (e.g. on agent disconnect or admin stop). */
  closeAllScreenViewers(sessionId: string, msg?: object): void {
    const session = this.screenSessions.get(sessionId)
    if (!session) return
    const json = msg ? JSON.stringify(msg) : undefined
    for (const ws of session.dashboardSockets) {
      try {
        if (ws.readyState === 1) {
          if (json) ws.send(json)
          ws.close()
        }
      } catch {}
    }
  }

  /** Number of viewers currently watching sessionId */
  getScreenViewerCount(sessionId: string): number {
    return this.screenSessions.get(sessionId)?.dashboardSockets.size ?? 0
  }

  /** Returns all active screen sessions watching a given device */
  getScreenSessionsForDevice(deviceId: string): Array<{ sessionId: string; viewerCount: number; startedAt: number }> {
    const result: Array<{ sessionId: string; viewerCount: number; startedAt: number }> = []
    for (const [sessionId, session] of this.screenSessions) {
      if (session.deviceId === deviceId) {
        result.push({ sessionId, viewerCount: session.dashboardSockets.size, startedAt: session.startedAt })
      }
    }
    return result
  }

  getScreenSessionIdByDashboardSocket(socket: WebSocket): string | undefined {
    for (const [sessionId, s] of this.screenSessions) {
      if (s.dashboardSockets.has(socket)) return sessionId
    }
    return undefined
  }

  /** Returns a snapshot of every currently active screen session */
  getAllActiveScreenSessions(): Array<{ sessionId: string; deviceId: string; userId?: string; startedAt: number; viewerCount: number }> {
    const result: Array<{ sessionId: string; deviceId: string; userId?: string; startedAt: number; viewerCount: number }> = []
    for (const [sessionId, s] of this.screenSessions) {
      result.push({
        sessionId,
        deviceId:    s.deviceId,
        userId:      s.userId,
        startedAt:   s.startedAt,
        viewerCount: s.dashboardSockets.size
      })
    }
    return result
  }

  /**
   * Force-stop a screen session from the server side (admin action).
   * Closes all viewer sockets, tells agent to stop, removes session.
   */
  forceStopScreenSession(sessionId: string): { deviceId: string; startedAt: number } | undefined {
    const session = this.screenSessions.get(sessionId)
    if (!session) return undefined

    this.closeAllScreenViewers(sessionId, {
      type:    'screen:closed',
      payload: { reason: 'stopped_by_server' }
    })

    this.sendToDevice(session.deviceId, {
      type:      'server:screen_stop',
      payload:   { sessionId },
      timestamp: Date.now()
    })

    this.removeScreenSession(sessionId)
    return { deviceId: session.deviceId, startedAt: session.startedAt }
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
  sweepZombieDevices(): string[] {
    const swept: string[] = []
    for (const [deviceId, dev] of this.devices) {
      if (dev.socket.readyState !== 1) {
        swept.push(deviceId)
        this.disconnectDevice(deviceId)
      }
    }
    return swept
  }
}

export const deviceRegistry = new DeviceRegistry()
