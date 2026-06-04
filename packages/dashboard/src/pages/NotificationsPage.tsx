import { useState, useEffect, useCallback } from 'react'
import {
  Bell, BellOff, CheckCheck, Trash2, RefreshCw,
  Cpu, HardDrive, MemoryStick, Wifi, WifiOff, AlertTriangle
} from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'
import { formatRelativeLang } from '../lib/i18n'
import { useUIStore } from '../store/uiStore'

interface Notification {
  id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  device_id: string | null
  read: number
  created_at: string
}

interface AlertRule {
  id: string
  type: string
  device_id: string | null
  threshold: number | null
  cooldown_min: number
  channel: string
  webhook_url: string | null
  enabled: number
}

const SEVERITY_STYLES: Record<string, string> = {
  info:     'border-l-brand-blue   bg-brand-blue/5',
  warning:  'border-l-yellow-400   bg-yellow-400/5',
  critical: 'border-l-red-400      bg-red-400/5',
}

const SEVERITY_ICON_COLOR: Record<string, string> = {
  info:     'text-brand-blue',
  warning:  'text-yellow-400',
  critical: 'text-red-400',
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  cpu_high:       Cpu,
  ram_high:       MemoryStick,
  disk_high:      HardDrive,
  device_offline: WifiOff,
  device_online:  Wifi,
}

const ALERT_TYPE_LABELS_AR: Record<string, string> = {
  device_offline: 'جهاز ينقطع',
  device_online:  'جهاز يتصل',
  cpu_high:       'المعالج مرتفع',
  ram_high:       'الذاكرة مرتفعة',
  disk_high:      'القرص يمتلئ',
}

const ALERT_TYPE_LABELS_EN: Record<string, string> = {
  device_offline: 'Device Offline',
  device_online:  'Device Online',
  cpu_high:       'CPU High',
  ram_high:       'RAM High',
  disk_high:      'Disk Full',
}

function AlertRuleCard({ rule, onDelete, onToggle, T, lang }: {
  rule: AlertRule
  onDelete: (id: string) => void
  onToggle: (id: string, enabled: boolean) => void
  T: (key: Parameters<ReturnType<typeof useT>>[0]) => string
  lang: string
}) {
  const ALERT_TYPE_LABELS = lang === 'ar' ? ALERT_TYPE_LABELS_AR : ALERT_TYPE_LABELS_EN
  return (
    <div className={clsx('glass rounded-xl p-4 border border-slate-700/30', !rule.enabled && 'opacity-50')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center mt-0.5', rule.enabled ? 'bg-brand-blue/15' : 'bg-slate-700/30')}>
            <AlertTriangle size={14} className={rule.enabled ? 'text-brand-blue' : 'text-slate-500'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{ALERT_TYPE_LABELS[rule.type] || rule.type}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {rule.threshold != null ? `${T('notif_threshold_label')} ${rule.threshold}%` : '—'}
              {' · '}
              {T('notif_every_min')} {rule.cooldown_min} {T('notif_min')}
              {rule.device_id ? ` · ${rule.device_id.slice(0, 8)}…` : ` · ${T('notif_all_devices')}`}
            </p>
            {rule.channel === 'webhook' && rule.webhook_url && (
              <p className="text-[10px] text-brand-blue mt-1 truncate max-w-xs">{rule.webhook_url}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToggle(rule.id, !rule.enabled)}
            className={clsx(
              'relative w-9 h-5 rounded-full transition-colors',
              rule.enabled ? 'bg-brand-blue' : 'bg-slate-700'
            )}
          >
            <span className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all', rule.enabled ? 'left-4' : 'left-0.5')} />
          </button>
          <button onClick={() => onDelete(rule.id)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export function NotificationsPage() {
  const T    = useT()
  const lang = useUIStore(s => s.lang)

  const ALERT_TYPE_LABELS = lang === 'ar' ? ALERT_TYPE_LABELS_AR : ALERT_TYPE_LABELS_EN

  const [notifications, setNotifications] = useState<Notification[]>([])
  const [rules, setRules]                 = useState<AlertRule[]>([])
  const [unread, setUnread]               = useState(0)
  const [loading, setLoading]             = useState(false)
  const [tab, setTab]                     = useState<'notifications' | 'rules'>('notifications')
  const [showAddRule, setShowAddRule]     = useState(false)
  const [newRule, setNewRule]             = useState({
    type: 'cpu_high', threshold: 90, cooldownMin: 30, channel: 'in_app', webhookUrl: ''
  })

  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/alerts/notifications')
      setNotifications(res.data.notifications ?? [])
      setUnread(res.data.unread ?? 0)
    } catch {}
    finally { setLoading(false) }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      const res = await api.get('/api/alerts')
      setRules(res.data ?? [])
    } catch {}
  }, [])

  useEffect(() => { loadNotifications(); loadRules() }, [loadNotifications, loadRules])

  async function markAllRead() {
    await api.post('/api/alerts/notifications/read', { all: true })
    setNotifications(n => n.map(x => ({ ...x, read: 1 })))
    setUnread(0)
  }

  async function clearRead() {
    await api.delete('/api/alerts/notifications')
    setNotifications(n => n.filter(x => !x.read))
  }

  async function deleteRule(id: string) {
    await api.delete(`/api/alerts/${id}`)
    setRules(r => r.filter(x => x.id !== id))
  }

  async function toggleRule(id: string, enabled: boolean) {
    await api.patch(`/api/alerts/${id}`, { enabled })
    setRules(r => r.map(x => x.id === id ? { ...x, enabled: enabled ? 1 : 0 } : x))
  }

  async function addRule() {
    try {
      await api.post('/api/alerts', {
        type: newRule.type,
        threshold: ['cpu_high', 'ram_high', 'disk_high'].includes(newRule.type) ? newRule.threshold : undefined,
        cooldownMin: newRule.cooldownMin,
        channel: newRule.channel,
        webhookUrl: newRule.webhookUrl || undefined
      })
      setShowAddRule(false)
      loadRules()
    } catch {}
  }

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-yellow-400/15 flex items-center justify-center relative">
            <Bell size={16} className="text-yellow-400" />
            {unread > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">{T('notif_title')}</h1>
            <p className="text-xs text-slate-500">
              {unread > 0 ? `${unread} ${T('notif_unread')}` : T('notif_all_ok')}
            </p>
          </div>
        </div>
        <button
          onClick={() => { loadNotifications(); loadRules() }}
          className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-navy-800/60 rounded-xl p-1 w-fit">
        {(['notifications', 'rules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              tab === t ? 'bg-brand-blue/20 text-brand-blue' : 'text-slate-400 hover:text-slate-200'
            )}
          >
            {t === 'notifications'
              ? `${T('notif_tab_notifications')}${unread > 0 ? ` (${unread})` : ''}`
              : T('notif_tab_rules')}
          </button>
        ))}
      </div>

      {tab === 'notifications' && (
        <div className="space-y-3">
          {/* Actions */}
          {notifications.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-700/30 text-slate-400 hover:text-slate-200 rounded-lg transition-colors"
              >
                <CheckCheck size={12} /> {T('notif_mark_read')}
              </button>
              <button
                onClick={clearRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-400/10 text-red-400 hover:bg-red-400/20 rounded-lg transition-colors"
              >
                <Trash2 size={12} /> {T('notif_clear_read')}
              </button>
            </div>
          )}

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BellOff size={40} className="text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">{T('notif_no_notifications')}</p>
              <p className="text-slate-600 text-xs mt-1">{T('notif_no_notifications_hint')}</p>
            </div>
          ) : notifications.map(notif => {
            const Icon      = TYPE_ICONS[notif.type] ?? Bell
            const sevStyle  = SEVERITY_STYLES[notif.severity]  ?? SEVERITY_STYLES.info
            const iconColor = SEVERITY_ICON_COLOR[notif.severity] ?? 'text-brand-blue'
            return (
              <div key={notif.id} className={clsx(
                'glass rounded-xl p-4 border-l-2 transition-opacity',
                sevStyle,
                notif.read && 'opacity-60'
              )}>
                <div className="flex items-start gap-3">
                  <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', iconColor + '/15')}>
                    <Icon size={14} className={iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-white leading-snug">{notif.title}</p>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap flex-shrink-0">
                        {formatRelativeLang(notif.created_at, lang)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{notif.message}</p>
                    {notif.device_id && (
                      <p className="text-[10px] text-slate-600 mt-1 font-mono">{notif.device_id}</p>
                    )}
                  </div>
                  {!notif.read && (
                    <div className="w-2 h-2 rounded-full bg-brand-blue flex-shrink-0 mt-1" />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-3">
          {/* Add rule button */}
          <button
            onClick={() => setShowAddRule(!showAddRule)}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-brand-blue/15 text-brand-blue hover:bg-brand-blue/25 rounded-xl transition-colors"
          >
            {T('notif_add_rule')}
          </button>

          {/* Add rule form */}
          {showAddRule && (
            <div className="glass rounded-xl p-4 space-y-3 border border-brand-blue/20">
              <p className="text-sm font-medium text-white">{T('notif_new_rule')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{T('notif_rule_type')}</label>
                  <select
                    className="w-full bg-navy-900 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white"
                    value={newRule.type}
                    onChange={e => setNewRule(r => ({ ...r, type: e.target.value }))}
                  >
                    {Object.entries(ALERT_TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </div>
                {['cpu_high', 'ram_high', 'disk_high'].includes(newRule.type) && (
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">{T('notif_rule_threshold')}</label>
                    <input type="number" min={1} max={100}
                      className="w-full bg-navy-900 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white"
                      value={newRule.threshold}
                      onChange={e => setNewRule(r => ({ ...r, threshold: parseInt(e.target.value) || 90 }))}
                    />
                  </div>
                )}
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{T('notif_rule_cooldown')}</label>
                  <input type="number" min={1}
                    className="w-full bg-navy-900 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white"
                    value={newRule.cooldownMin}
                    onChange={e => setNewRule(r => ({ ...r, cooldownMin: parseInt(e.target.value) || 30 }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">{T('notif_rule_channel')}</label>
                  <select
                    className="w-full bg-navy-900 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white"
                    value={newRule.channel}
                    onChange={e => setNewRule(r => ({ ...r, channel: e.target.value }))}
                  >
                    <option value="in_app">{T('notif_channel_inapp')}</option>
                    <option value="webhook">Webhook (Slack/Discord)</option>
                  </select>
                </div>
                {newRule.channel === 'webhook' && (
                  <div className="col-span-2">
                    <label className="text-xs text-slate-500 mb-1 block">Webhook URL</label>
                    <input type="url"
                      className="w-full bg-navy-900 border border-slate-700/50 rounded-lg py-2 px-3 text-sm text-white font-mono"
                      placeholder="https://hooks.slack.com/..."
                      value={newRule.webhookUrl}
                      onChange={e => setNewRule(r => ({ ...r, webhookUrl: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={addRule}
                  className="flex-1 py-2 text-sm font-medium bg-brand-blue text-white rounded-lg hover:bg-brand-blue/90 transition-colors"
                >
                  {T('notif_save_rule')}
                </button>
                <button
                  onClick={() => setShowAddRule(false)}
                  className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 border border-slate-700/50 rounded-lg transition-colors"
                >
                  {T('cancel')}
                </button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <AlertTriangle size={40} className="text-slate-600 mb-3" />
              <p className="text-slate-500 text-sm">{T('notif_no_rules')}</p>
              <p className="text-slate-600 text-xs mt-1">{T('notif_no_rules_hint')}</p>
            </div>
          ) : rules.map(rule => (
            <AlertRuleCard key={rule.id} rule={rule} onDelete={deleteRule} onToggle={toggleRule} T={T} lang={lang} />
          ))}
        </div>
      )}
    </div>
  )
}
