export type DeviceStatus = 'online' | 'offline' | 'connecting' | 'error'

export type TunnelLayer = 'relay' | 'cloudflare' | 'ngrok' | 'bore' | 'lan'

export interface DeviceInfo {
  id: string
  name: string
  hostname: string
  platform: 'windows' | 'linux' | 'macos'
  arch: string
  osVersion: string
  ipLocal: string
  ipPublic?: string
  agentVersion: string
}

export interface DeviceStats {
  cpuPercent: number
  ramPercent: number
  ramUsedMb: number
  ramTotalMb: number
  diskPercent: number
  diskUsedGb: number
  diskTotalGb: number
  networkUpKbps: number
  networkDownKbps: number
  uptime: number
}

export interface Device {
  id: string
  name: string
  token: string
  ownerId: string
  info?: DeviceInfo
  stats?: DeviceStats
  status: DeviceStatus
  tunnelLayer?: TunnelLayer
  tunnelAddress?: string
  lastSeen?: Date
  createdAt: Date
  updatedAt: Date
}

export interface DeviceRow {
  id: string
  name: string
  token: string
  owner_id: string
  info: string | null
  status: DeviceStatus
  tunnel_layer: TunnelLayer | null
  tunnel_address: string | null
  last_seen: string | null
  created_at: string
  updated_at: string
}
