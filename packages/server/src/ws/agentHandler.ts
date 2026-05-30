import type { WebSocket } from 'ws'
import { deviceRegistry } from './registry'
import { getDeviceByToken, updateDeviceStatus, updateDeviceInfo, updateDeviceSeen } from '../db/devices'
import type { WSMessage, AgentRegisterPayload, AgentHeartbeatPayload, AgentCommandResultPayload } from '@airemote/shared'

const pendingCommands = new Map<string, {
  resolve: (result: AgentCommandResultPayload) => void
  timeout: NodeJS.Timeout
}>()

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
        socket.send(JSON.stringify({ type: 'server:error', payload: { message: 'Invalid device token' }, timestamp: Date.now() }))
        socket.close()
        return null
      }

      deviceRegistry.registerDevice(device.id, socket, payload.stats)
      await updateDeviceStatus(device.id, 'online', payload.tunnelLayer)
      await updateDeviceInfo(device.id, payload.info)

      socket.send(JSON.stringify({ type: 'server:registered', payload: { deviceId: device.id, message: 'Connected successfully' }, timestamp: Date.now() }))
      deviceRegistry.broadcastDeviceStatus(device.id, 'online')
      console.log(`✅ Agent registered: ${device.name} (${device.id}) from ${clientIp}`)
      return { deviceId: device.id }
    }

    case 'agent:heartbeat': {
      const payload = message.payload as AgentHeartbeatPayload
      await updateDeviceSeen(payload.deviceId)
      deviceRegistry.updateDeviceStats(payload.deviceId, payload.stats)
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

    default:
      return null
  }
}

export function sendCommandToAgent(deviceId: string, commandId: string, command: string, timeoutMs = 30000): Promise<AgentCommandResultPayload> {
  return new Promise((resolve, reject) => {
    const sent = deviceRegistry.sendToDevice(deviceId, {
      type: 'server:command',
      payload: { commandId, type: 'shell', command },
      timestamp: Date.now()
    })
    if (!sent) { reject(new Error('Device not online')); return }
    const timeout = setTimeout(() => { pendingCommands.delete(commandId); reject(new Error('Command timeout')) }, timeoutMs)
    pendingCommands.set(commandId, { resolve, timeout })
  })
}
