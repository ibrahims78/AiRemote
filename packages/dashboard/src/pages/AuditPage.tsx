import { useState, useEffect, useCallback } from 'react'
import { Shield, Download, Filter, ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'
import { useT } from '../lib/i18n'

interface AuditEntry {
  id: number
  user_email: string
  device_id: string | null
  action: string
  details: string | null
  ip_address: string | null
  status_code: number | null
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login_success:    { label: 'تسجيل دخول',   color: 'text-emerald-400 bg-emerald-400/10' },
  login_failed:     { label: 'فشل دخول',      color: 'text-red-400    bg-red-400/10' },
  logout:           { label: 'خروج',           color: 'text-slate-400  bg-slate-400/10' },
  setup_completed:  { label: 'إعداد النظام',  color: 'text-brand-blue bg-brand-blue/10' },
  device_created:   { label: 'جهاز جديد',     color: 'text-brand-teal bg-brand-teal/10' },
  device_deleted:   { label: 'حذف جهاز',      color: 'text-red-400    bg-red-400/10' },
  device_renamed:   { label: 'تغيير اسم',     color: 'text-yellow-400 bg-yellow-400/10' },
  exec_command:     { label: 'تنفيذ أمر',      color: 'text-purple-400 bg-purple-400/10' },
  bulk_exec:        { label: 'أوامر جماعية',  color: 'text-purple-400 bg-purple-400/10' },
  ssh_connect:      { label: 'اتصال SSH',     color: 'text-brand-blue bg-brand-blue/10' },
  ssh_disconnect:   { label: 'قطع SSH',       color: 'text-slate-400  bg-slate-400/10' },
  sftp_upload:      { label: 'رفع ملف',       color: 'text-emerald-400 bg-emerald-400/10' },
  sftp_download:    { label: 'تنزيل ملف',     color: 'text-brand-blue bg-brand-blue/10' },
  sftp_delete:      { label: 'حذف ملف',       color: 'text-red-400    bg-red-400/10' },
  user_created:     { label: 'مستخدم جديد',   color: 'text-brand-teal bg-brand-teal/10' },
  user_deleted:     { label: 'حذف مستخدم',    color: 'text-red-400    bg-red-400/10' },
  user_updated:     { label: 'تعديل مستخدم',  color: 'text-yellow-400 bg-yellow-400/10' },
  ai_chat:          { label: 'محادثة AI',      color: 'text-pink-400   bg-pink-400/10' },
  settings_updated: { label: 'إعدادات',        color: 'text-yellow-400 bg-yellow-400/10' },
  totp_enabled:     { label: 'تفعيل 2FA',     color: 'text-emerald-400 bg-emerald-400/10' },
  totp_disabled:    { label: 'إيقاف 2FA',     color: 'text-orange-400 bg-orange-400/10' },
  credential_saved: { label: 'حفظ بيانات',    color: 'text-brand-teal bg-brand-teal/10' },
  credential_deleted:{ label: 'حذف بيانات',   color: 'text-red-400    bg-red-400/10' },
  alert_created:    { label: 'قاعدة تنبيه',   color: 'text-yellow-400 bg-yellow-400/10' },
  alert_deleted:    { label: 'حذف قاعدة',     color: 'text-red-400    bg-red-400/10' },
}

function formatRelative(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)    return 'الآن'
  if (diff < 3600)  return `منذ ${Math.floor(diff / 60)} د`
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`
  return new Date(dateStr).toLocaleDateString('ar-EG', { day: '2-digit', month: 'short' })
}

export function AuditPage() {
  const T = useT()
  const [entries, setEntries]     = useState<AuditEntry[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(1)
  const [loading, setLoading]     = useState(false)
  const [search, setSearch]       = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [expandedRow, setExpandedRow]   = useState<number | null>(null)

  const perPage = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page) })
      if (filterAction) params.set('action', filterAction)
      if (search) params.set('userId', search)
      const res = await api.get(`/api/audit?${params}`)
      setEntries(res.data.entries ?? [])
      setTotal(res.data.total ?? 0)
    } catch {}
    finally { setLoading(false) }
  }, [page, filterAction, search])

  useEffect(() => { load() }, [load])

  async function exportCsv() {
    const params = new URLSearchParams()
    if (filterAction) params.set('action', filterAction)
    const a = document.createElement('a')
    a.href = `/api/audit/export?${params}`
    a.download = 'audit-log.csv'
    a.click()
  }

  const totalPages = Math.ceil(total / perPage)
  const actions = Object.keys(ACTION_LABELS)

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-blue/15 flex items-center justify-center">
            <Shield size={16} className="text-brand-blue" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">سجل التدقيق</h1>
            <p className="text-xs text-slate-500">{total.toLocaleString('ar-EG')} سجل محفوظ</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors" title="تحديث">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportCsv} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-brand-blue/15 text-brand-blue hover:bg-brand-blue/25 rounded-lg transition-colors">
            <Download size={13} /> تصدير CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            className="w-full bg-navy-800 border border-slate-700/50 rounded-lg py-2 pr-8 pl-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-brand-blue/50"
            placeholder="بحث بالمستخدم..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="relative">
          <Filter size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <select
            className="bg-navy-800 border border-slate-700/50 rounded-lg py-2 pr-8 pl-3 text-sm text-white appearance-none focus:outline-none focus:border-brand-blue/50 min-w-36"
            value={filterAction}
            onChange={e => { setFilterAction(e.target.value); setPage(1) }}
          >
            <option value="">كل العمليات</option>
            {actions.map(a => (
              <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">الوقت</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">المستخدم</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">العملية</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3 hidden md:table-cell">الجهاز</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3 hidden lg:table-cell">IP</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3 hidden lg:table-cell">تفاصيل</th>
              </tr>
            </thead>
            <tbody>
              {loading && entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm">جارٍ التحميل...</td></tr>
              ) : entries.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-sm">لا توجد سجلات</td></tr>
              ) : entries.map(entry => {
                const action = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'text-slate-400 bg-slate-400/10' }
                let details: Record<string, unknown> = {}
                try { details = JSON.parse(entry.details || '{}') } catch {}
                const isExpanded = expandedRow === entry.id

                return (
                  <tr
                    key={entry.id}
                    className={clsx('border-b border-slate-700/20 hover:bg-slate-700/10 cursor-pointer transition-colors', isExpanded && 'bg-slate-700/10')}
                    onClick={() => setExpandedRow(isExpanded ? null : entry.id)}
                  >
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono whitespace-nowrap" title={entry.created_at}>
                      {formatRelative(entry.created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300 max-w-32 truncate">{entry.user_email}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap', action.color)}>
                        {action.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono max-w-28 truncate hidden md:table-cell">
                      {entry.device_id ? entry.device_id.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono hidden lg:table-cell">
                      {entry.ip_address || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-48 truncate hidden lg:table-cell">
                      {Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            صفحة {page} من {totalPages}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700/40 rounded-lg transition-colors"
            >
              <ChevronRight size={14} />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-700/40 rounded-lg transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
