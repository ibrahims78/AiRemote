import { useState, useEffect } from 'react'
import { History, Terminal, Monitor, FolderOpen, Bot, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'

interface SessionWithDevice {
  id: string
  deviceId: string
  deviceName: string
  userId: string
  type: string
  startedAt: string
  endedAt?: string
  durationSec?: number
  ipAddress?: string
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:  { label: 'SSH Terminal', icon: Terminal,   color: 'text-brand-blue',   bg: 'bg-brand-blue/10'  },
  sftp: { label: 'نقل ملفات',    icon: FolderOpen,  color: 'text-brand-teal',   bg: 'bg-brand-teal/10'  },
  ai:   { label: 'AI Chat',      icon: Bot,          color: 'text-yellow-400',   bg: 'bg-yellow-400/10'  },
  vnc:  { label: 'VNC',          icon: Monitor,      color: 'text-purple-400',   bg: 'bg-purple-400/10'  },
  rdp:  { label: 'RDP',          icon: Monitor,      color: 'text-orange-400',   bg: 'bg-orange-400/10'  },
}

function formatDuration(sec?: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}ث`
  if (sec < 3600) return `${Math.floor(sec / 60)}د ${sec % 60}ث`
  return `${Math.floor(sec / 3600)}س ${Math.floor((sec % 3600) / 60)}د`
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionWithDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')

  async function load() {
    setLoading(true)
    try {
      const res = await api.get('/api/sessions')
      setSessions(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? sessions : sessions.filter(s => s.type === filter)
  const types = [...new Set(sessions.map(s => s.type))]

  const active = sessions.filter(s => !s.endedAt).length
  const total = sessions.length

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">سجل الجلسات</h2>
          <p className="text-slate-400 text-sm mt-1">كل جلسات الوصول والتحكم</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 text-slate-400 hover:text-white text-sm px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">إجمالي الجلسات</p>
          <p className="text-2xl font-bold text-white">{total}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">جلسات نشطة</p>
          <p className={clsx('text-2xl font-bold', active > 0 ? 'text-emerald-400' : 'text-slate-400')}>{active}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <p className="text-xs text-slate-500 mb-1">منتهية</p>
          <p className="text-2xl font-bold text-slate-400">{total - active}</p>
        </div>
      </div>

      {types.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={clsx('text-xs px-3 py-1.5 rounded-lg border transition-colors', filter === 'all' ? 'bg-brand-blue/15 border-brand-blue/40 text-brand-blue' : 'border-slate-700/50 text-slate-400 hover:border-slate-500')}
          >
            الكل
          </button>
          {types.map(t => {
            const cfg = typeConfig[t] || typeConfig.ssh
            const Icon = cfg.icon
            return (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={clsx('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors',
                  filter === t ? `${cfg.bg} border-current ${cfg.color}` : 'border-slate-700/50 text-slate-400 hover:border-slate-500'
                )}
              >
                <Icon size={11} />
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          جاري التحميل...
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">النوع</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">الجهاز</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">بدأت</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">المدة</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">العنوان</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-12">
                    <History size={28} className="mx-auto mb-2 text-slate-600" />
                    لا توجد جلسات مسجلة
                  </td>
                </tr>
              )}
              {filtered.map(s => {
                const cfg = typeConfig[s.type] || typeConfig.ssh
                const Icon = cfg.icon
                return (
                  <tr key={s.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center', cfg.bg)}>
                          <Icon size={11} className={cfg.color} />
                        </div>
                        <span className="text-slate-300 text-xs">{cfg.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-xs font-medium text-slate-200">{s.deviceName}</div>
                        <div className="text-[10px] text-slate-600 font-mono">{s.deviceId.slice(0, 8)}...</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{new Date(s.startedAt).toLocaleString('ar')}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 font-mono">{formatDuration(s.durationSec)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 font-mono">{s.ipAddress || '—'}</td>
                    <td className="px-4 py-3">
                      {s.endedAt ? (
                        <span className="text-xs text-slate-500 bg-slate-700/40 px-2 py-0.5 rounded-full">منتهية</span>
                      ) : (
                        <span className="text-xs text-emerald-400 flex items-center gap-1 w-fit">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                          نشطة
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
