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
  | 'agent:fs_result'
  | 'agent:fs_chunk'
  | 'client:subscribe'
  | 'client:command'
  | 'client:ai_chat'
  | 'broadcast:device_update'
  | 'broadcast:stats_update'

export interface WSMessage<T = unknown> {
  type: WSMessageType
  payload: T
  timestamp: number
}

export interface AgentCapabilities {
  pty: boolean
  sshAvailable: boolean
  sshPort?: number
  sshUsername?: string
  shell?: string
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
