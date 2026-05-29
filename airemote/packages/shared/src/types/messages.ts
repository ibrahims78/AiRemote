import type { DeviceInfo, DeviceStats, DeviceStatus, TunnelLayer } from './device'

export type WSMessageType =
  | 'agent:register'
  | 'agent:heartbeat'
  | 'agent:stats'
  | 'agent:status'
  | 'agent:command_result'
  | 'server:registered'
  | 'server:command'
  | 'server:error'
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
