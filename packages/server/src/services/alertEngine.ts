import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../db/database'
import type { DeviceStats } from '@airemote/shared'

interface AlertRule {
  id: string; user_id: string; device_id: string | null; type: string
  threshold: number | null; cooldown_min: number; channel: string
  webhook_url: string | null; enabled: number
}

// Cooldown map: `${ruleId}-${deviceId}` → last triggered ms
const lastTriggered = new Map<string, number>()

export async function evaluateAlerts(deviceId: string, stats: DeviceStats): Promise<void> {
  try {
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT * FROM alert_rules WHERE enabled = 1 AND (device_id = ? OR device_id IS NULL)`,
      args: [deviceId]
    })
    const rules = result.rows as unknown as AlertRule[]
    for (const rule of rules) {
      await processRule(rule, deviceId, stats)
    }
  } catch (e) {
    // Never crash the heartbeat handler
  }
}

export async function fireDeviceOfflineAlert(deviceId: string): Promise<void> {
  try {
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT * FROM alert_rules WHERE enabled = 1 AND type = 'device_offline' AND (device_id = ? OR device_id IS NULL)`,
      args: [deviceId]
    })
    const rules = result.rows as unknown as AlertRule[]
    for (const rule of rules) {
      await dispatchAlert(rule, deviceId, 'device_offline',
        `جهاز انقطع`, `الجهاز ${deviceId} قطع اتصاله بالسيرفر`, 'critical')
    }
  } catch {}
}

export async function fireDeviceOnlineAlert(deviceId: string): Promise<void> {
  try {
    const db = getDb()
    const result = await db.execute({
      sql: `SELECT * FROM alert_rules WHERE enabled = 1 AND type = 'device_online' AND (device_id = ? OR device_id IS NULL)`,
      args: [deviceId]
    })
    const rules = result.rows as unknown as AlertRule[]
    for (const rule of rules) {
      await dispatchAlert(rule, deviceId, 'device_online',
        `جهاز متصل`, `الجهاز ${deviceId} اتصل بالسيرفر`, 'info')
    }
  } catch {}
}

async function processRule(rule: AlertRule, deviceId: string, stats: DeviceStats): Promise<void> {
  let triggered = false
  let title = ''
  let message = ''
  let severity: 'info' | 'warning' | 'critical' = 'warning'

  switch (rule.type) {
    case 'cpu_high': {
      const thr = rule.threshold ?? 90
      if (stats.cpuPercent >= thr) {
        triggered = true
        title    = `تحذير: المعالج مرتفع`
        message  = `استخدام المعالج على الجهاز وصل إلى ${stats.cpuPercent}% (الحد: ${thr}%)`
        severity = stats.cpuPercent >= 95 ? 'critical' : 'warning'
      }
      break
    }
    case 'ram_high': {
      const thr = rule.threshold ?? 90
      if (stats.ramPercent >= thr) {
        triggered = true
        title    = `تحذير: الذاكرة مرتفعة`
        message  = `استخدام الذاكرة وصل إلى ${stats.ramPercent}% (الحد: ${thr}%)`
        severity = 'warning'
      }
      break
    }
    case 'disk_high': {
      const thr = rule.threshold ?? 85
      if (stats.diskPercent >= thr) {
        triggered = true
        title    = `تحذير: القرص يمتلئ`
        message  = `استخدام القرص وصل إلى ${stats.diskPercent}% — ${stats.diskUsedGb.toFixed(1)}/${stats.diskTotalGb.toFixed(1)} GB`
        severity = stats.diskPercent >= 95 ? 'critical' : 'warning'
      }
      break
    }
  }

  if (!triggered) return

  const cooldownKey = `${rule.id}-${deviceId}`
  const last = lastTriggered.get(cooldownKey) ?? 0
  const cooldownMs = (rule.cooldown_min ?? 30) * 60 * 1000
  if (Date.now() - last < cooldownMs) return

  lastTriggered.set(cooldownKey, Date.now())
  await dispatchAlert(rule, deviceId, rule.type, title, message, severity)
}

async function dispatchAlert(
  rule: AlertRule, deviceId: string, type: string,
  title: string, message: string, severity: string
): Promise<void> {
  const db    = getDb()
  const notifId = uuidv4()
  const now   = new Date().toISOString()

  await db.execute({
    sql: `INSERT INTO notifications (id, user_id, rule_id, device_id, type, title, message, severity, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [notifId, rule.user_id, rule.id, deviceId, type, title, message, severity, now]
  })

  // Lazy import to avoid circular dep with registry
  const { deviceRegistry } = await import('../ws/registry')
  deviceRegistry.broadcastNotification(rule.user_id, {
    id: notifId, type, title, message, severity, deviceId, createdAt: now
  })

  // Webhook
  if (rule.channel === 'webhook' && rule.webhook_url) {
    const emoji = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🟢'
    fetch(rule.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `${emoji} *${title}*\n${message}`,
        attachments: [{ color: severity === 'critical' ? 'danger' : 'warning', text: message }]
      })
    }).catch(() => {})
  }
}
