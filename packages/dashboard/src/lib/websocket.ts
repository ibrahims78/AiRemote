import { useDeviceStore } from '../store/deviceStore'
import type { DeviceStatus, TunnelLayer } from '@airemote/shared'

type WsMessage = { type: string; payload: unknown; timestamp?: number }
type MessageCallback = (msg: WsMessage) => void

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 2000
let currentUserId:  string | null = null
let currentToken:   string | null = null
let extraCallback:  MessageCallback | null = null

export function connectWebSocket(userId: string, token: string, onMessage?: MessageCallback) {
  if (ws?.readyState === WebSocket.OPEN) {
    // Still update the callback in case it changed
    extraCallback = onMessage ?? null
    return
  }

  currentUserId = userId
  currentToken  = token
  extraCallback = onMessage ?? null

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl    = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    reconnectDelay = 2000
    ws!.send(JSON.stringify({
      type: 'client:subscribe',
      payload: { userId, deviceIds: [] },
      timestamp: Date.now()
    }))
  }

  ws.onmessage = (event) => {
    try {
      const msg: WsMessage = JSON.parse(event.data)
      const { updateDeviceStatus, updateDeviceStats, updateDeviceInfo } = useDeviceStore.getState()

      switch (msg.type) {
        case 'broadcast:device_update': {
          const p = msg.payload as { deviceId: string; status: string; tunnelLayer?: string; info?: unknown }
          updateDeviceStatus(p.deviceId, p.status as DeviceStatus, p.tunnelLayer as TunnelLayer | undefined)
          if (p.info) updateDeviceInfo(p.deviceId, p.info as Parameters<typeof updateDeviceInfo>[1])
          break
        }
        case 'broadcast:stats_update':
          updateDeviceStats(
            (msg.payload as { deviceId: string }).deviceId,
            (msg.payload as { stats: unknown }).stats as Parameters<typeof updateDeviceStats>[1]
          )
          break
        default:
          break
      }

      // Forward every message to the optional caller callback
      extraCallback?.(msg)
    } catch {}
  }

  ws.onclose = () => { scheduleReconnect() }
  ws.onerror = () => { ws?.close() }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000)
    if (currentUserId && currentToken) connectWebSocket(currentUserId, currentToken, extraCallback ?? undefined)
  }, reconnectDelay)
}

export function sendWsMessage(message: object) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

export function disconnectWebSocket() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  ws?.close()
  ws = null
  currentUserId = null
  currentToken  = null
  extraCallback = null
}

export function getWsState(): 'connected' | 'connecting' | 'disconnected' {
  if (!ws) return 'disconnected'
  if (ws.readyState === WebSocket.OPEN)       return 'connected'
  if (ws.readyState === WebSocket.CONNECTING) return 'connecting'
  return 'disconnected'
}
