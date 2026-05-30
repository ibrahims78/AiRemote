import { getDb } from './database'
import type { InValue } from '@libsql/client'

export interface AuditEntry {
  userId: string
  userEmail: string
  deviceId?: string
  action: string
  details?: Record<string, unknown>
  ipAddress?: string
  statusCode?: number
}

export type AuditAction =
  | 'login_success' | 'login_failed' | 'logout' | 'setup_completed'
  | 'device_created' | 'device_deleted' | 'device_renamed'
  | 'exec_command' | 'ssh_connect' | 'ssh_disconnect'
  | 'sftp_upload' | 'sftp_download' | 'sftp_delete' | 'sftp_mkdir' | 'sftp_rename'
  | 'user_created' | 'user_deleted' | 'user_updated'
  | 'ai_chat' | 'settings_updated'
  | 'totp_enabled' | 'totp_disabled'
  | 'credential_saved' | 'credential_deleted'
  | 'bulk_exec' | 'alert_created' | 'alert_deleted'

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    const db = getDb()
    await db.execute({
      sql: `INSERT INTO audit_log
              (user_id, user_email, device_id, action, details, ip_address, status_code)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        entry.userId,
        entry.userEmail,
        entry.deviceId ?? null,
        entry.action,
        entry.details ? JSON.stringify(entry.details) : null,
        entry.ipAddress ?? null,
        entry.statusCode ?? null
      ]
    })
  } catch (e) {
    console.error('[audit] failed to write entry:', e)
  }
}

export async function getAuditLog(filters: {
  userId?: string
  deviceId?: string
  action?: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}): Promise<{ entries: unknown[]; total: number }> {
  const db = getDb()
  const conditions: string[] = []
  const args: InValue[] = []

  if (filters.userId)   { conditions.push('user_id = ?');     args.push(filters.userId) }
  if (filters.deviceId) { conditions.push('device_id = ?');   args.push(filters.deviceId) }
  if (filters.action)   { conditions.push('action = ?');      args.push(filters.action) }
  if (filters.fromDate) { conditions.push('created_at >= ?'); args.push(filters.fromDate) }
  if (filters.toDate)   { conditions.push('created_at <= ?'); args.push(filters.toDate) }

  const where  = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const limit  = filters.limit  ?? 50
  const offset = filters.offset ?? 0

  const [dataRes, countRes] = await Promise.all([
    db.execute({
      sql: `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      args: [...args, limit, offset]
    }),
    db.execute({ sql: `SELECT COUNT(*) as total FROM audit_log ${where}`, args })
  ])

  const total = (countRes.rows[0] as unknown as { total: number }).total
  return { entries: dataRes.rows, total }
}
