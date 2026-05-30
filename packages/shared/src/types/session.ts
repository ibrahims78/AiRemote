export type SessionType = 'ssh' | 'vnc' | 'rdp' | 'sftp' | 'ai'

export interface Session {
  id: string
  deviceId: string
  userId: string
  type: SessionType
  startedAt: Date
  endedAt?: Date
  durationSec?: number
  ipAddress?: string
}

export interface SessionRow {
  id: string
  device_id: string
  user_id: string
  type: SessionType
  started_at: string
  ended_at: string | null
  duration_sec: number | null
  ip_address: string | null
}
