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
  | 'server:registered'
  | 'server:command'
  | 'server:error'
  | 'server:ssh_open'
  | 'server:ssh_data'
  | 'server:ssh_resize'
  | 'server:ssh_close'
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

export interface AgentRegisterPayload {
  token: string
  info: DeviceInfo
  stats: DeviceStats
  tunnelLayer: TunnelLayer
}

export interface AgentHeartbeatPayload {
  deviceId: string
  stats: DeviceStats
  tunnelLayer: TunnelLayer
  timestamp: number
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
