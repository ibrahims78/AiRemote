import type { DeviceInfo, DeviceStats, DeviceStatus, TunnelLayer } from './device'

export type WSMessageType =
  | 'agent:register'
  | 'agent:heartbeat'
  | 'agent:stats'
  | 'agent:status'
  | 'agent:command_result'
  | 'agent:ssh_opened'
  | 'agent:ssh_data'
  | 'agent:ssh_closed'
  | 'agent:ssh_error'
  | 'agent:ssh_info'
  | 'agent:pty_opened'
  | 'agent:pty_data'
  | 'agent:pty_closed'
  | 'agent:pty_error'
  // ── Screen sharing (v1.6.0) ──────────────────────────────────────────────
  | 'agent:screen_frame'
  | 'agent:screen_closed'
  | 'agent:screen_error'
  | 'agent:screen_unavailable'
  // ── Remote control (v2.0.0) ──────────────────────────────────────────────
  | 'agent:screen_monitors'
  | 'agent:screen_clipboard'
  | 'agent:screen_control_ack'
  | 'agent:screen_control_granted'
  | 'agent:screen_control_denied'
  | 'server:screen_control_request'
  | 'server:registered'
  | 'server:command'
  | 'server:error'
  | 'server:ssh_open'
  | 'server:ssh_data'
  | 'server:ssh_resize'
  | 'server:ssh_close'
  | 'server:pty_open'
  | 'server:pty_data'
  | 'server:pty_resize'
  | 'server:pty_close'
  | 'server:fs_request'
  | 'server:screen_start'
  | 'server:screen_stop'
  // ── Remote control — server → agent (v2.0.0) ─────────────────────────────
  | 'server:screen_mouse'
  | 'server:screen_key'
  | 'server:screen_clipboard_read'
  | 'server:screen_clipboard_write'
  | 'server:screen_get_monitors'
  | 'server:screen_set_monitor'
  | 'server:screen_privacy'
  | 'agent:fs_result'
  | 'agent:fs_chunk'
  | 'client:subscribe'
  | 'client:command'
  | 'client:ai_chat'
  | 'broadcast:device_update'
  | 'broadcast:stats_update'
  | 'broadcast:notification'
  | 'screen:ping'
  | 'screen:pong'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
  timestamp: number
}

// ── Remote Control Types (v2.0.0) ────────────────────────────────────────────

export interface RemoteMouseEvent {
  sessionId: string
  type: 'move' | 'down' | 'up' | 'click' | 'dblclick' | 'scroll'
  x: number
  y: number
  button?: 0 | 1 | 2
  deltaY?: number
}

export interface RemoteKeyEvent {
  sessionId: string
  type: 'down' | 'up' | 'press'
  key: string
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[]
}

export interface MonitorInfo {
  id: number
  x: number
  y: number
  width: number
  height: number
  primary: boolean
  name: string
}

export interface AgentCapabilities {
  pty: boolean
  sshAvailable: boolean
  sshPort?: number
  sshUsername?: string
  shell?: string
  screenControl?: boolean
  clipboard?: boolean
  multiMonitor?: boolean
  monitors?: MonitorInfo[]
}

export interface AgentRegisterPayload {
  token: string
  info: DeviceInfo
  stats: DeviceStats
  tunnelLayer: TunnelLayer
  capabilities?: AgentCapabilities
  sshInfo?: {
    available: boolean
    host?: string
    port?: number
    username?: string
  }
}

export interface AgentHeartbeatPayload {
  deviceId: string
  stats: DeviceStats
  tunnelLayer: TunnelLayer
  timestamp: number
  capabilities?: AgentCapabilities
}

export interface ServerCommandPayload {
  commandId: string
  type: 'shell' | 'sftp_list' | 'sftp_download' | 'sftp_upload'
  command?: string
  path?: string
  data?: string
}

export interface AgentCommandResultPayload {
  commandId: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
}

export interface BroadcastDeviceUpdatePayload {
  deviceId: string
  status: DeviceStatus
  tunnelLayer?: TunnelLayer
  info?: DeviceInfo
  capabilities?: AgentCapabilities
}

export interface BroadcastStatsUpdatePayload {
  deviceId: string
  stats: DeviceStats
}

export interface ServerSshOpenPayload {
  sessionId: string
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
  rows?: number
  cols?: number
}

export interface SshDataPayload {
  sessionId: string
  data: string
}

export interface SshResizePayload {
  sessionId: string
  rows: number
  cols: number
}

export interface SshClosePayload {
  sessionId: string
}

export interface ServerPtyOpenPayload {
  sessionId: string
  rows?: number
  cols?: number
  shell?: 'cmd' | 'powershell' | 'bash' | 'sh' | 'zsh' | 'auto'
}

export interface PtyDataPayload {
  sessionId: string
  data: string
}

export interface PtyResizePayload {
  sessionId: string
  rows: number
  cols: number
}
