import { useState, useEffect } from 'react'
import { History, Terminal, Monitor, FolderOpen, Bot, RefreshCw, Circle } from 'lucide-react'
import { api } from '../lib/api'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'

interface SessionWithDevice {
  id: string; deviceId: string; deviceName: string; userId: string
  type: string; startedAt: string; endedAt?: string; durationSec?: number; ipAddress?: string
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  ssh:  { label: 'SSH Terminal', icon: Terminal,  color: 'text-brand-blue',  bg: 'bg-brand-blue/10'  },
  sftp: { label: 'SFTP',        icon: FolderOpen, color: 'text-brand-teal',  bg: 'bg-brand-teal/10'  },
  ai:   { label: 'AI Chat',     icon: Bot,         color: 'text-yellow-400',  bg: 'bg-yellow-400/10'  },
  vnc:  { label: 'VNC',         icon: Monitor,     color: 'text-purple-400',  bg: 'bg-purple-400/10'  },
  rdp:  { label: 'RDP',         icon: Monitor,     color: 'text-orange-400',  bg: 'bg-orange-400/10'  },
}

function formatDuration(sec?: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionWithDevice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const T = useT()

  async function load() {
    setLoading(true)
    try { const res = await api.get('/api/sessions'); setSessions(res.data) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const active = sessions.filter(s => !s.endedAt).length
  const types = [...new Set(sessions.map(s => s.type))]

  const filtered =
    filter === 'all'    ? sessions :
    filter === 'active' ? sessions.filter(s => !s.endedAt) :
    filter === 'ended'  ? sessions.filter(s => s.endedAt) :
    sessions.filter(s => s.type === filter)

  const FILTERS = [
    { key: 'all',    label: T('all_sessions'),    count: sessions.length },
    { key: 'active', label: T('active_sessions'), count: active },
    { key: 'ended',  label: T('ended_sessions'),  count: sessions.length - active },
    ...types.map(t => ({ key: t, label: typeConfig[t]?.label || t.toUpperCase(), count: sessions.filter(s => s.type === t).length }))
  ]

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{T('sessions_title')}</h2>
          <p className="text-slate-400 text-sm mt-1">{T('sessions_subtitle')}</p>
        </div>
        <button
          onClick={load} disabled={loading}
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-white bg-slate-700/30 hover:bg-slate-700/50 border border-slate-600/30 px-3 py-2 rounded-lg transition-all disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          {T('refresh')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="glass rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">{sessions.length}</div>
          <div className="text-xs text-slate-500 mt-1">{T('all_sessions')}</div>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <div className={clsx('text-2xl font-bold', active > 0 ? 'text-emerald-400' : 'text-slate-400')}>{active}</div>
          <div className="text-xs text-slate-500 mt-1">{T('active_sessions')}</div>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-slate-400">{sessions.length - active}</div>
          <div className="text-xs text-slate-500 mt-1">{T('ended_sessions')}</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.key} onClick={() => setFilter(f.key)}
            className={clsx(
              'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all border',
              filter === f.key
                ? 'bg-brand-blue/15 text-brand-blue border-brand-blue/30'
                : 'bg-slate-700/30 text-slate-400 hover:text-slate-200 border-transparent hover:border-slate-600/30'
            )}
          >
            {f.label}
            <span className={clsx('text-[10px] px-1.5 py-0.5 rounded-full', filter === f.key ? 'bg-brand-blue/20' : 'bg-slate-700/60')}>{f.count}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          {T('loading')}
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <History size={32} className="mx-auto mb-3 text-slate-700" />
              <p className="text-slate-500 text-sm">{T('no_sessions_yet')}</p>
            </div>
          )}
          {filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[550px]">
                <thead>
                  <tr className="border-b border-slate-700/50">
                    {[T('session_type'), T('session_device'), T('session_start'), T('session_duration'), 'IP', ''].map((h, i) => (
                      <th key={i} className="text-xs text-slate-500 font-medium px-4 py-3 text-start">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s, i) => {
                    const tc = typeConfig[s.type] || { label: s.type.toUpperCase(), icon: Monitor, color: 'text-slate-400', bg: 'bg-slate-700/40' }
                    const Icon = tc.icon
                    const isActive = !s.endedAt
                    return (
                      <tr key={s.id} className={clsx('border-b border-slate-700/30 hover:bg-slate-700/15 transition-colors', i === filtered.length - 1 && 'border-b-0')}>
                        <td className="px-4 py-3">
                          <div className={clsx('inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-medium', tc.bg, tc.color)}>
                            <Icon size={11} /> {tc.label}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-300 font-medium text-xs">{s.deviceName}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap" dir="ltr">
                          {new Date(s.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                              <Circle size={6} className="fill-current animate-pulse" /> {T('session_active')}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-500 font-mono">{formatDuration(s.durationSec)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 font-mono" dir="ltr">{s.ipAddress || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={clsx('text-[10px] px-2 py-0.5 rounded-full', isActive ? 'bg-emerald-400/10 text-emerald-400' : 'bg-slate-700/40 text-slate-500')}>
                            {isActive ? '●' : '○'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
