import type { WebSocket } from 'ws'
import { deviceRegistry } from './registry'
import { getDeviceByToken, updateDeviceStatus, updateDeviceInfo, updateDeviceSeen } from '../db/devices'
import type {
  WSMessage, AgentRegisterPayload, AgentHeartbeatPayload, AgentCommandResultPayload
} from '@airemote/shared'
import { getDb } from '../db/database'
import { evaluateAlerts, fireDeviceOfflineAlert, fireDeviceOnlineAlert } from '../services/alertEngine'

const pendingCommands = new Map<string, {
  resolve: (result: AgentCommandResultPayload) => void
  timeout: NodeJS.Timeout
}>()

const heartbeatCount = new Map<string, number>()
const SAVE_EVERY_N = 3

export async function handleAgentMessage(
  socket: WebSocket,
  message: WSMessage,
  clientIp: string
): Promise<{ deviceId: string } | null> {
  switch (message.type) {
    case 'agent:register': {
      const payload = message.payload as AgentRegisterPayload
      const device = await getDeviceByToken(payload.token)

      if (!device) {
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { message: 'Invalid device token' },
          timestamp: Date.now()
        }))
        socket.close()
        return null
      }

      deviceRegistry.registerDevice(device.id, socket, payload.stats)
      await updateDeviceStatus(device.id, 'online', payload.tunnelLayer)
      await updateDeviceInfo(device.id, payload.info)

      socket.send(JSON.stringify({
        type: 'server:registered',
        payload: { deviceId: device.id, message: 'Connected successfully' },
        timestamp: Date.now()
      }))
      deviceRegistry.broadcastDeviceStatus(device.id, 'online')
      fireDeviceOnlineAlert(device.id).catch(() => {})

      console.log(`✅ Agent registered: ${device.name} (${device.id}) from ${clientIp}`)
      return { deviceId: device.id }
    }

    case 'agent:heartbeat': {
      const payload = message.payload as AgentHeartbeatPayload

      const registeredId = deviceRegistry.getDeviceIdBySocket(socket)
      if (!registeredId || registeredId !== payload.deviceId) {
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { message: 'Heartbeat rejected: device mismatch' },
          timestamp: Date.now()
        }))
        return null
      }

      await updateDeviceSeen(payload.deviceId)
      deviceRegistry.updateDeviceStats(payload.deviceId, payload.stats)

      const count = (heartbeatCount.get(payload.deviceId) ?? 0) + 1
      heartbeatCount.set(payload.deviceId, count)

      if (count % SAVE_EVERY_N === 0) {
        const db = getDb()
        db.execute({
          sql: `INSERT INTO device_stats_history
                  (device_id, cpu_percent, ram_percent, disk_percent,
                   net_up_kbps, net_down_kbps, uptime_sec, recorded_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            payload.deviceId,
            Math.round(payload.stats.cpuPercent),
            Math.round(payload.stats.ramPercent),
            Math.round(payload.stats.diskPercent),
            Math.round(payload.stats.networkUpKbps),
            Math.round(payload.stats.networkDownKbps),
            payload.stats.uptime,
            new Date().toISOString()
          ]
        }).catch(() => {})
      }

      evaluateAlerts(payload.deviceId, payload.stats).catch(() => {})
      return { deviceId: payload.deviceId }
    }

    case 'agent:command_result': {
      const payload = message.payload as AgentCommandResultPayload
      const pending = pendingCommands.get(payload.commandId)
      if (pending) {
        clearTimeout(pending.timeout)
        pending.resolve(payload)
        pendingCommands.delete(payload.commandId)
      }
      return null
    }

    // ── SSH Tunnel messages (agent → server → dashboard) ─────────────────────

    case 'agent:ssh_opened': {
      const { sessionId } = message.payload as { sessionId: string }
      const session = deviceRegistry.getSshSession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'ssh:connected', payload: { message: 'Connected' } }))
      }
      return null
    }

    case 'agent:ssh_data': {
      const { sessionId, data } = message.payload as { sessionId: string; data: string }
      const session = deviceRegistry.getSshSession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'ssh:data', payload: { data } }))
      }
      return null
    }

    case 'agent:ssh_closed': {
      const { sessionId } = message.payload as { sessionId: string }
      const session = deviceRegistry.getSshSession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'ssh:closed', payload: {} }))
      }
      deviceRegistry.removeSshSession(sessionId)
      return null
    }

    case 'agent:ssh_error': {
      const { sessionId, message: errMsg } = message.payload as { sessionId: string; message: string }
      const session = deviceRegistry.getSshSession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'ssh:error', payload: { message: errMsg } }))
      }
      deviceRegistry.removeSshSession(sessionId)
      return null
    }

    default:
      return null
  }
}

export function sendCommandToAgent(
  deviceId: string,
  commandId: string,
  command: string,
  timeoutMs = 30000
): Promise<AgentCommandResultPayload> {
  return new Promise((resolve, reject) => {
    const sent = deviceRegistry.sendToDevice(deviceId, {
      type: 'server:command',
      payload: { commandId, type: 'shell', command },
      timestamp: Date.now()
    })
    if (!sent) { reject(new Error('Device not online')); return }
    const timeout = setTimeout(() => {
      pendingCommands.delete(commandId)
      reject(new Error('Command timeout'))
    }, timeoutMs)
    pendingCommands.set(commandId, { resolve, timeout })
  })
}

export function cleanupDevice(deviceId: string): void {
  heartbeatCount.delete(deviceId)
  fireDeviceOfflineAlert(deviceId).catch(() => {})
}
