import { useDeviceStore } from '../store/deviceStore'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectDelay = 2000
let currentUserId: string | null = null
let currentToken: string | null = null

export function connectWebSocket(userId: string, token: string) {
  if (ws?.readyState === WebSocket.OPEN) return

  currentUserId = userId
  currentToken = token

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}/ws`

  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    reconnectDelay = 2000
    // Subscribe with empty deviceIds — server broadcasts all stats to all clients
    ws!.send(JSON.stringify({
      type: 'client:subscribe',
      payload: { userId, deviceIds: [] },
      timestamp: Date.now()
    }))
  }

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data)
      const { updateDeviceStatus, updateDeviceStats } = useDeviceStore.getState()

      switch (msg.type) {
        case 'broadcast:device_update':
          updateDeviceStatus(msg.payload.deviceId, msg.payload.status, msg.payload.tunnelLayer)
          break
        case 'broadcast:stats_update':
          updateDeviceStats(msg.payload.deviceId, msg.payload.stats)
          break
      }
    } catch {}
  }

  ws.onclose = () => {
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => {
    reconnectDelay = Math.min(reconnectDelay * 1.5, 30000)
    if (currentUserId && currentToken) connectWebSocket(currentUserId, currentToken)
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
  currentToken = null
}

export function getWsState(): 'connected' | 'connecting' | 'disconnected' {
  if (!ws) return 'disconnected'
  if (ws.readyState === WebSocket.OPEN) return 'connected'
  if (ws.readyState === WebSocket.CONNECTING) return 'connecting'
  return 'disconnected'
}
