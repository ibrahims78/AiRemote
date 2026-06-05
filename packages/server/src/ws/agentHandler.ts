import type { WebSocket } from 'ws'
import { v4 as uuidv4 } from 'uuid'
import { deviceRegistry } from './registry'
import { getDeviceByToken, updateDeviceStatus, updateDeviceInfo, updateDeviceSeen } from '../db/devices'
import type {
  WSMessage, AgentRegisterPayload, AgentHeartbeatPayload, AgentCommandResultPayload
} from '@airemote/shared'
import { getDb } from '../db/database'
import { evaluateAlerts, fireDeviceOfflineAlert, fireDeviceOnlineAlert } from '../services/alertEngine'
import { isRecording, addFrame } from '../services/recording'

const pendingCommands = new Map<string, {
  resolve: (result: AgentCommandResultPayload) => void
  timeout: NodeJS.Timeout
}>()

const pendingFsOps = new Map<string, {
  resolve: (data: unknown) => void
  reject:  (err: Error) => void
  timeout: NodeJS.Timeout
}>()

const pendingFsChunks = new Map<string, {
  chunks:   Map<number, Buffer>
  received: number
  resolve:  (buf: Buffer) => void
  reject:   (err: Error) => void
  timeout:  NodeJS.Timeout
}>()

const heartbeatCount = new Map<string, number>()
const SAVE_EVERY_N = 3

// ── Binary screen frame handler (v3.1+ agents) ────────────────────────────
// Packet layout (from agent): [0x01][sessionId:36B][width:4B][height:4B][seq:4B][flags:1B][JPEG...]
// Forwarded to dashboard as:  [width:4B][height:4B][seq:4B][flags:1B][JPEG...]
export async function handleAgentBinaryFrame(socket: WebSocket, buf: Buffer): Promise<void> {
  if (buf.length < 50) return
  if (buf[0] !== 0x01) return

  const sessionId = buf.slice(1, 37).toString('utf8').replace(/\0/g, '')
  const width     = buf.readUInt32BE(37)
  const height    = buf.readUInt32BE(41)
  const seq       = buf.readUInt32BE(45)
  const flags     = buf[49]
  const jpegData  = buf.slice(50)

  deviceRegistry.clearScreenConnectTimeout(sessionId)
  const session = deviceRegistry.getScreenSession(sessionId)
  if (!session) return

  const fc = ((session as Record<string, unknown>)._frameCount =
    (((session as Record<string, unknown>)._frameCount as number) ?? 0) + 1) as number
  if (fc === 1 || fc % 200 === 0) {
    console.log(`📸 [bin] session=${sessionId.slice(0, 8)} viewers=${deviceRegistry.getScreenViewerCount(sessionId)} frames=${fc} size=${jpegData.length >> 10}KB`)
  }

  try {
    if (isRecording(sessionId)) addFrame(sessionId, jpegData, width, height, seq)
  } catch {}

  // No server-side throttle — the agent already respects the requested FPS via
  // its own setInterval guard.  A second throttle here only introduces jitter.
  const hdr = Buffer.allocUnsafe(13)
  hdr.writeUInt32BE(width,  0)
  hdr.writeUInt32BE(height, 4)
  hdr.writeUInt32BE(seq,    8)
  hdr[12] = flags
  deviceRegistry.sendToScreenViewers(sessionId, Buffer.concat([hdr, jpegData]))
}

export async function handleAgentMessage(
  socket: WebSocket,
  message: WSMessage,
  clientIp: string
): Promise<{ deviceId: string } | null> {
  switch (message.type) {

    case 'agent:register': {
      const payload = message.payload as AgentRegisterPayload
      const device  = await getDeviceByToken(payload.token)

      if (!device) {
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { message: 'Invalid device token' },
          timestamp: Date.now()
        }))
        socket.close()
        return null
      }

      const caps = {
        pty:           true,
        sshAvailable:  payload.sshInfo?.available ?? payload.capabilities?.sshAvailable ?? false,
        sshPort:       payload.sshInfo?.port      ?? payload.capabilities?.sshPort,
        sshUsername:   payload.sshInfo?.username  ?? payload.capabilities?.sshUsername,
        shell:         payload.capabilities?.shell,
        screenControl: payload.capabilities?.screenControl ?? false,
        clipboard:     payload.capabilities?.clipboard     ?? false,
        multiMonitor:  payload.capabilities?.multiMonitor  ?? false,
        monitors:      payload.capabilities?.monitors      ?? [],
        docker:        payload.capabilities?.docker        ?? false
      }

      deviceRegistry.registerDevice(device.id, socket, payload.stats, caps)
      await updateDeviceStatus(device.id, 'online', payload.tunnelLayer)
      await updateDeviceInfo(device.id, payload.info)

      socket.send(JSON.stringify({
        type: 'server:registered',
        payload: { deviceId: device.id, message: 'Connected successfully' },
        timestamp: Date.now()
      }))

      deviceRegistry.broadcastDeviceStatus(device.id, 'online', payload.tunnelLayer, caps, payload.info)
      fireDeviceOnlineAlert(device.id).catch(() => {})

      console.log(`✅ Agent registered: ${device.name} (${device.id}) v${payload.info?.agentVersion || '?'} from ${clientIp}`)
      return { deviceId: device.id }
    }

    case 'agent:heartbeat': {
      const payload = message.payload as AgentHeartbeatPayload

      const registeredId = deviceRegistry.getDeviceIdBySocket(socket)
      if (!registeredId || registeredId !== payload.deviceId) {
        socket.send(JSON.stringify({
          type: 'server:error',
          payload: { message: 'Heartbeat rejected: device mismatch' }
        }))
        return null
      }

      await updateDeviceSeen(payload.deviceId)
      deviceRegistry.updateDeviceStats(payload.deviceId, payload.stats)

      if (payload.capabilities) {
        deviceRegistry.updateDeviceCapabilities(payload.deviceId, payload.capabilities)
      }

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

    case 'agent:fs_result': {
      const p = message.payload as { opId: string; data?: unknown; error?: string }
      const pending = pendingFsOps.get(p.opId)
      if (pending) {
        clearTimeout(pending.timeout)
        pendingFsOps.delete(p.opId)
        if (p.error) pending.reject(new Error(p.error))
        else pending.resolve(p.data)
      }
      if (p.error) {
        const pc = pendingFsChunks.get(p.opId)
        if (pc) {
          clearTimeout(pc.timeout)
          pendingFsChunks.delete(p.opId)
          pc.reject(new Error(p.error))
        }
      }
      return null
    }

    case 'agent:fs_chunk': {
      const p = message.payload as { opId: string; seq: number; data: string; done: boolean; total: number }
      const pc = pendingFsChunks.get(p.opId)
      if (!pc) return null
      pc.chunks.set(p.seq, Buffer.from(p.data, 'base64'))
      pc.received++
      if (p.done) {
        clearTimeout(pc.timeout)
        pendingFsChunks.delete(p.opId)
        const parts: Buffer[] = []
        for (let i = 0; i < p.total; i++) {
          const c = pc.chunks.get(i)
          if (c) parts.push(c)
        }
        pc.resolve(Buffer.concat(parts))
      }
      return null
    }

    case 'agent:ssh_info': {
      const p = message.payload as {
        deviceId: string
        sshHost?: string
        sshPort?: number
        sshUsername?: string
        sshAuthType?: string
      }
      const registeredId = deviceRegistry.getDeviceIdBySocket(socket)
      const targetId = p.deviceId || registeredId
      if (targetId) {
        deviceRegistry.updateDeviceCapabilities(targetId, {
          sshAvailable: !!(p.sshHost || p.sshUsername),
          sshPort:      p.sshPort,
          sshUsername:  p.sshUsername
        })
        const caps = deviceRegistry.getDeviceCapabilities(targetId)
        deviceRegistry.broadcastDeviceStatus(targetId, 'online', undefined, caps)
      }
      return null
    }

    case 'agent:ssh_opened': {
      const { sessionId } = message.payload as { sessionId: string }
      deviceRegistry.clearSshConnectTimeout(sessionId)
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
      deviceRegistry.clearSshConnectTimeout(sessionId)
      const session = deviceRegistry.getSshSession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'ssh:error', payload: { message: errMsg } }))
      }
      deviceRegistry.removeSshSession(sessionId)
      return null
    }

    case 'agent:pty_opened': {
      const { sessionId } = message.payload as { sessionId: string }
      deviceRegistry.clearPtyConnectTimeout(sessionId)
      const session = deviceRegistry.getPtySession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({
          type: 'pty:connected',
          payload: { sessionId, message: 'Shell ready' }
        }))
      }
      return null
    }

    case 'agent:pty_data': {
      const { sessionId, data } = message.payload as { sessionId: string; data: string }
      const session = deviceRegistry.getPtySession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'pty:data', payload: { data } }))
      }
      return null
    }

    case 'agent:pty_closed': {
      const { sessionId } = message.payload as { sessionId: string }
      deviceRegistry.clearPtyConnectTimeout(sessionId)
      const session = deviceRegistry.getPtySession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'pty:closed', payload: {} }))
      }
      deviceRegistry.removePtySession(sessionId)
      return null
    }

    case 'agent:pty_error': {
      const { sessionId, message: errMsg } = message.payload as { sessionId: string; message: string }
      deviceRegistry.clearPtyConnectTimeout(sessionId)
      const session = deviceRegistry.getPtySession(sessionId)
      if (session?.dashboardSocket.readyState === 1) {
        session.dashboardSocket.send(JSON.stringify({ type: 'pty:error', payload: { message: errMsg } }))
      }
      deviceRegistry.removePtySession(sessionId)
      return null
    }

    // ── Screen frame (agent → server → ALL viewers) ───────────────────────
    case 'agent:screen_frame': {
      const p = message.payload as {
        sessionId: string
        data:      string
        width:     number
        height:    number
        seq:       number
        keyframe?: boolean
        quality?:  number
        deltaRegion?: { x: number; y: number; w: number; h: number }
      }
      deviceRegistry.clearScreenConnectTimeout(p.sessionId)
      const session = deviceRegistry.getScreenSession(p.sessionId)
      if (session) {
        const fc = ((session as any)._frameCount = ((session as any)._frameCount ?? 0) + 1) as number
        if (fc === 1 || fc % 200 === 0) {
          console.log(`📸 [screen] session=${p.sessionId.slice(0,8)} viewers=${session.dashboardSockets.size} frames=${fc} delta=${!!p.deltaRegion}`)
        }

        try {
          if (isRecording(p.sessionId)) {
            addFrame(p.sessionId, Buffer.from(p.data, 'base64'), p.width, p.height, p.seq)
          }
        } catch {}

        // No server-side throttle (agent already limits FPS via setInterval guard)
        {
          deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
            type:    'screen:frame',
            payload: {
              data:        p.data,
              width:       p.width,
              height:      p.height,
              seq:         p.seq,
              keyframe:    p.keyframe,
              quality:     p.quality,
              deltaRegion: p.deltaRegion
            }
          }))
        }
      }
      return null
    }

    case 'agent:screen_closed': {
      const { sessionId } = message.payload as { sessionId: string }
      deviceRegistry.clearScreenConnectTimeout(sessionId)
      deviceRegistry.sendToScreenViewers(sessionId, JSON.stringify({ type: 'screen:closed', payload: {} }))
      deviceRegistry.removeScreenSession(sessionId)
      return null
    }

    case 'agent:screen_error': {
      const { sessionId, message: errMsg } = message.payload as { sessionId: string; message: string }
      deviceRegistry.clearScreenConnectTimeout(sessionId)
      deviceRegistry.sendToScreenViewers(sessionId, JSON.stringify({ type: 'screen:error', payload: { message: errMsg } }))
      deviceRegistry.closeAllScreenViewers(sessionId)
      deviceRegistry.removeScreenSession(sessionId)
      return null
    }

    case 'agent:screen_unavailable': {
      const { sessionId, message: errMsg } = message.payload as { sessionId: string; message: string }
      deviceRegistry.clearScreenConnectTimeout(sessionId)
      deviceRegistry.sendToScreenViewers(sessionId, JSON.stringify({
        type: 'screen:unavailable',
        payload: { message: errMsg }
      }))
      deviceRegistry.closeAllScreenViewers(sessionId)
      deviceRegistry.removeScreenSession(sessionId)
      return null
    }

    case 'agent:screen_monitors': {
      const p = message.payload as { sessionId: string; monitors: unknown[] }
      deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
        type:    'screen:monitors',
        payload: { monitors: p.monitors }
      }))
      return null
    }

    case 'agent:screen_clipboard': {
      const p = message.payload as { sessionId: string; text: string }
      deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
        type:    'screen:clipboard',
        payload: { text: p.text }
      }))
      return null
    }

    case 'agent:screen_chat': {
      const p = message.payload as { sessionId: string; text: string; sender: string; ts: number }
      deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
        type:    'screen:chat',
        payload: { text: p.text, sender: p.sender || 'host', ts: p.ts || Date.now() }
      }))
      return null
    }

    case 'agent:screen_control_granted': {
      const p = message.payload as { sessionId: string; requestId: string }
      deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
        type:    'screen:control_granted',
        payload: { requestId: p.requestId }
      }))
      return null
    }

    case 'agent:screen_control_denied': {
      const p = message.payload as { sessionId: string; requestId: string }
      deviceRegistry.sendToScreenViewers(p.sessionId, JSON.stringify({
        type:    'screen:control_denied',
        payload: { requestId: p.requestId }
      }))
      return null
    }

    default:
      return null
  }
}

export function sendFsRequest(
  deviceId: string,
  op: string,
  path: string,
  extra: Record<string, unknown> = {},
  timeoutMs = 10000
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const opId = uuidv4()

    const device = deviceRegistry.getDevice(deviceId)
    if (!device || device.socket.readyState !== 1) {
      reject(new Error('الجهاز غير متصل أو الاتصال منقطع'))
      return
    }

    const sent = deviceRegistry.sendToDevice(deviceId, {
      type: 'server:fs_request',
      payload: { opId, op, path, ...extra },
      timestamp: Date.now()
    })
    if (!sent) { reject(new Error('الجهاز غير متصل')); return }

    const timeout = setTimeout(() => {
      pendingFsOps.delete(opId)
      reject(new Error('انتهت مهلة الاتصال بالأيجنت — تأكد من أن الأيجنت يعمل ومتصل'))
    }, timeoutMs)
    pendingFsOps.set(opId, { resolve, reject, timeout })
  })
}

export async function sendFsWriteChunked(
  deviceId:  string,
  filePath:  string,
  data:      Buffer,
  timeoutMs  = 300000
): Promise<void> {
  const CHUNK_SIZE = 512 * 1024
  const total      = Math.ceil(data.length / CHUNK_SIZE) || 1
  const opId       = uuidv4()

  const device = deviceRegistry.getDevice(deviceId)
  if (!device || device.socket.readyState !== 1) {
    throw new Error('الجهاز غير متصل أو الاتصال منقطع')
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFsOps.delete(opId)
      reject(new Error('انتهت مهلة رفع الملف — الملف كبير أو الاتصال بطيء'))
    }, timeoutMs)
    pendingFsOps.set(opId, { resolve: () => resolve(), reject, timeout })

    const sendChunk = (i: number) => {
      const start  = i * CHUNK_SIZE
      const chunk  = data.subarray(start, start + CHUNK_SIZE)
      const isLast = i === total - 1

      const sent = deviceRegistry.sendToDevice(deviceId, {
        type: 'server:fs_write_chunk',
        payload: {
          opId, path: filePath,
          data:   chunk.toString('base64'),
          seq:    i,
          isLast, total
        },
        timestamp: Date.now()
      })
      if (!sent) { reject(new Error('الجهاز انقطع أثناء رفع الملف')); return }
      if (!isLast) sendChunk(i + 1)
    }

    sendChunk(0)
  })
}

export async function sendFsReadChunked(
  deviceId:  string,
  filePath:  string,
  timeoutMs  = 300000
): Promise<Buffer> {
  const opId = uuidv4()

  const device = deviceRegistry.getDevice(deviceId)
  if (!device || device.socket.readyState !== 1) {
    throw new Error('الجهاز غير متصل أو الاتصال منقطع')
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingFsChunks.delete(opId)
      reject(new Error('انتهت مهلة تنزيل الملف — الملف كبير أو الاتصال بطيء'))
    }, timeoutMs)

    pendingFsChunks.set(opId, {
      chunks: new Map(), received: 0, resolve, reject, timeout
    })

    const sent = deviceRegistry.sendToDevice(deviceId, {
      type: 'server:fs_request',
      payload: { opId, op: 'read_chunked', path: filePath },
      timestamp: Date.now()
    })
    if (!sent) {
      clearTimeout(timeout)
      pendingFsChunks.delete(opId)
      reject(new Error('الجهاز غير متصل'))
    }
  })
}

export async function sendCommand(
  deviceId:  string,
  command:   string,
  timeoutMs  = 30000
): Promise<AgentCommandResultPayload> {
  return new Promise((resolve, reject) => {
    const commandId = uuidv4()

    const sent = deviceRegistry.sendToDevice(deviceId, {
      type: 'server:command',
      payload: { commandId, type: 'shell', command },
      timestamp: Date.now()
    })
    if (!sent) { reject(new Error('الجهاز غير متصل')); return }

    const timeout = setTimeout(() => {
      pendingCommands.delete(commandId)
      reject(new Error('انتهت مهلة تنفيذ الأمر'))
    }, timeoutMs)

    pendingCommands.set(commandId, { resolve, timeout })
  })
}
