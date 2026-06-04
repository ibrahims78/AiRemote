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

// ── Webhook format detection ──────────────────────────────────────────────────

type WebhookPlatform = 'slack' | 'discord' | 'telegram' | 'generic'

function detectPlatform(url: string): WebhookPlatform {
  if (url.includes('hooks.slack.com')) return 'slack'
  if (url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks')) return 'discord'
  if (url.includes('api.telegram.org/bot')) return 'telegram'
  return 'generic'
}

function buildSlackPayload(emoji: string, title: string, message: string, severity: string, deviceId: string): unknown {
  const color = severity === 'critical' ? '#e53e3e' : severity === 'warning' ? '#dd6b20' : '#38a169'
  return {
    text: `${emoji} *${title}*`,
    attachments: [{
      color,
      text:    message,
      footer:  `AiRemote · Device: ${deviceId}`,
      ts:      Math.floor(Date.now() / 1000),
      fields: [
        { title: 'Device',   value: deviceId,  short: true },
        { title: 'Severity', value: severity,  short: true }
      ]
    }]
  }
}

function buildDiscordPayload(emoji: string, title: string, message: string, severity: string, deviceId: string): unknown {
  const color = severity === 'critical' ? 0xe53e3e : severity === 'warning' ? 0xdd6b20 : 0x38a169
  return {
    content: `${emoji} **${title}**`,
    embeds: [{
      title,
      description: message,
      color,
      timestamp:   new Date().toISOString(),
      footer:      { text: `AiRemote · Device: ${deviceId}` },
      fields: [
        { name: 'Device',   value: deviceId, inline: true },
        { name: 'Severity', value: severity, inline: true }
      ]
    }]
  }
}

function buildTelegramPayload(url: string, emoji: string, title: string, message: string): unknown {
  // Extract chat_id from URL query param if present: ...sendMessage?chat_id=XYZ
  const chatIdMatch = url.match(/[?&]chat_id=([^&]+)/)
  const chatId      = chatIdMatch ? chatIdMatch[1] : null
  if (!chatId) return null   // can't send without chat_id

  const text = `${emoji} *${escapeMarkdownV2(title)}*\n${escapeMarkdownV2(message)}`
  return { chat_id: chatId, text, parse_mode: 'MarkdownV2' }
}

function buildGenericPayload(emoji: string, title: string, message: string, severity: string, deviceId: string): unknown {
  return {
    text:      `${emoji} ${title}`,
    title,
    message,
    severity,
    deviceId,
    timestamp: new Date().toISOString()
  }
}

function escapeMarkdownV2(text: string): string {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1')
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

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

  // Webhook dispatch with platform-aware formatting
  if (rule.channel === 'webhook' && rule.webhook_url) {
    const emoji    = severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : '🟢'
    const platform = detectPlatform(rule.webhook_url)
    let body: unknown

    switch (platform) {
      case 'slack':
        body = buildSlackPayload(emoji, title, message, severity, deviceId)
        break
      case 'discord':
        body = buildDiscordPayload(emoji, title, message, severity, deviceId)
        break
      case 'telegram': {
        const tgBody = buildTelegramPayload(rule.webhook_url, emoji, title, message)
        if (!tgBody) break
        // Telegram uses a different URL (sendMessage endpoint) — clean URL of chat_id param
        const baseUrl = rule.webhook_url.split('?')[0]
        fetch(baseUrl, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(tgBody)
        }).catch(() => {})
        return
      }
      default:
        body = buildGenericPayload(emoji, title, message, severity, deviceId)
    }

    if (body) {
      fetch(rule.webhook_url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body)
      }).catch(() => {})
    }
  }
}
