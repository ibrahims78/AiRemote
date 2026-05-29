import { useEffect, useState } from 'react'
import {
  Monitor, Wifi, WifiOff, AlertCircle, Activity, Cpu,
  HardDrive, MemoryStick, Plus, History, TrendingUp, Circle
} from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import type { Device } from '@airemote/shared'

interface Session {
  id: string; deviceId: string; deviceName?: string
  type: string; startedAt: string; endedAt?: string; durationSec?: number
}

function StatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="w-full bg-slate-700/50 rounded-full h-1 overflow-hidden">
      <div className={clsx('h-full rounded-full transition-all duration-700', color)} style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  )
}

function DeviceCard({ device }: { device: Device }) {
  const { statsMap } = useDeviceStore()
  const T = useT()
  const stats = statsMap[device.id]
  const isOnline = device.status === 'online'

  return (
    <Link
      to={`/devices/${device.id}`}
      className={clsx(
        'block glass glass-hover rounded-xl p-4 cursor-pointer transition-all animate-fade-in group',
        isOnline ? 'hover:border-emerald-500/20' : ''
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', isOnline ? 'bg-brand-blue/15' : 'bg-slate-700/50')}>
            <Monitor size={16} className={isOnline ? 'text-brand-blue' : 'text-slate-500'} />
          </div>
          <div>
            <h3 className="font-medium text-sm text-slate-100 group-hover:text-white transition-colors">{device.name}</h3>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{device.info?.hostname || device.id.slice(0, 8)}</p>
          </div>
        </div>
        <span className={clsx(
          'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0',
          isOnline ? 'text-emerald-400 bg-emerald-400/10' : 'text-slate-500 bg-slate-500/10'
        )}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
          {isOnline ? T('device_online') : T('device_offline')}
        </span>
      </div>

      {isOnline && stats && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { label: 'CPU', value: stats.cpuPercent, color: stats.cpuPercent > 80 ? 'bg-red-400' : 'bg-brand-blue', icon: Cpu },
            { label: 'RAM', value: stats.ramPercent, color: stats.ramPercent > 85 ? 'bg-orange-400' : 'bg-brand-teal', icon: MemoryStick },
            { label: 'Disk', value: stats.diskPercent, color: stats.diskPercent > 90 ? 'bg-red-400' : 'bg-purple-400', icon: HardDrive },
          ].map(item => {
            const Icon = item.icon
            return (
              <div key={item.label}>
                <div className="text-xs text-slate-500 mb-1 flex items-center justify-center gap-1">
                  <Icon size={10} /> {item.label}
                </div>
                <div className="text-sm font-mono font-semibold text-slate-200">{item.value}%</div>
                <StatBar value={item.value} color={item.color} />
              </div>
            )
          })}
        </div>
      )}

      {isOnline && !stats && (
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Activity size={11} className="animate-pulse" />
          {T('fetching_data')}
        </div>
      )}

      {!isOnline && device.lastSeen && (
        <p className="text-xs text-slate-600 mt-1">
          {T('last_seen')}: {new Date(device.lastSeen).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
    </Link>
  )
}

const SESSION_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ssh:  { label: 'SSH',  color: 'text-brand-blue bg-brand-blue/10' },
  sftp: { label: 'SFTP', color: 'text-brand-teal bg-brand-teal/10' },
  ai:   { label: 'AI',   color: 'text-purple-400 bg-purple-400/10' },
  vnc:  { label: 'VNC',  color: 'text-orange-400 bg-orange-400/10' },
  rdp:  { label: 'RDP',  color: 'text-yellow-400 bg-yellow-400/10' },
}

function formatDuration(sec?: number) {
  if (!sec) return '—'
  const m = Math.floor(sec / 60), s = sec % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export function OverviewPage() {
  const { devices, loading, fetchDevices, statsMap } = useDeviceStore()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const T = useT()

  const online  = devices.filter(d => d.status === 'online').length
  const offline = devices.filter(d => d.status !== 'online').length
  const alerts  = devices.filter(d => {
    const s = statsMap[d.id]
    return s && (s.cpuPercent > 85 || s.ramPercent > 85 || s.diskPercent > 90)
  }).length

  const onlineDevices = devices.filter(d => d.status === 'online')
  const avgCpu = onlineDevices.length > 0
    ? Math.round(onlineDevices.reduce((sum, d) => sum + (statsMap[d.id]?.cpuPercent || 0), 0) / onlineDevices.length) : 0
  const avgRam = onlineDevices.length > 0
    ? Math.round(onlineDevices.reduce((sum, d) => sum + (statsMap[d.id]?.ramPercent || 0), 0) / onlineDevices.length) : 0

  useEffect(() => {
    fetchDevices()
    api.get('/api/sessions?limit=8')
      .then(r => setSessions(r.data || []))
      .catch(() => {})
      .finally(() => setSessionsLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">{T('overview_title')}</h2>
        <p className="text-slate-400 text-sm mt-1">{T('overview_subtitle')}</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Wifi size={14} className="text-emerald-400" />
            <span className="text-xs text-slate-400">{T('stat_connected')}</span>
          </div>
          <div className="text-3xl font-bold text-emerald-400">{online}</div>
          <p className="text-xs text-slate-600 mt-1">{T('of')} {devices.length}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <WifiOff size={14} className="text-slate-500" />
            <span className="text-xs text-slate-400">{T('stat_offline')}</span>
          </div>
          <div className="text-3xl font-bold text-slate-400">{offline}</div>
          <p className="text-xs text-slate-600 mt-1">{T('inactive_device')}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={14} className="text-orange-400" />
            <span className="text-xs text-slate-400">{T('stat_alerts')}</span>
          </div>
          <div className="text-3xl font-bold text-orange-400">{alerts}</div>
          <p className="text-xs text-slate-600 mt-1">{T('high_resources')}</p>
        </div>
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-brand-blue" />
            <span className="text-xs text-slate-400">{T('stat_avg_cpu')}</span>
          </div>
          <div className="text-3xl font-bold text-brand-blue">{avgCpu}%</div>
          <div className="mt-2">
            <StatBar value={avgCpu} color={avgCpu > 80 ? 'bg-red-400' : 'bg-brand-blue'} />
            <p className="text-xs text-slate-600 mt-1">RAM: {avgRam}%</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Devices */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Monitor size={14} className="text-brand-blue" />
              {T('devices')}
            </h3>
            <Link to="/devices" className="text-xs text-brand-blue hover:text-blue-400 transition-colors">{T('view_all')}</Link>
          </div>

          {loading && (
            <div className="text-center py-12 text-slate-500">
              <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
              {T('loading')}
            </div>
          )}

          {!loading && devices.length === 0 && (
            <div className="glass rounded-xl text-center py-14">
              <Monitor size={36} className="text-slate-700 mx-auto mb-3" />
              <h3 className="text-slate-300 font-medium mb-1">{T('no_devices_yet')}</h3>
              <p className="text-slate-500 text-sm mb-4">{T('no_devices_desc')}</p>
              <Link
                to="/devices"
                className="inline-flex items-center gap-2 bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors shadow-lg shadow-brand-blue/20"
              >
                <Plus size={14} />
                {T('add_device')}
              </Link>
            </div>
          )}

          {!loading && devices.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {devices.map(device => <DeviceCard key={device.id} device={device} />)}
            </div>
          )}
        </div>

        {/* Recent sessions */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <History size={14} className="text-brand-teal" />
              {T('recent_sessions')}
            </h3>
            <Link to="/sessions" className="text-xs text-brand-blue hover:text-blue-400 transition-colors">{T('view_all')}</Link>
          </div>

          <div className="glass rounded-xl overflow-hidden">
            {sessionsLoading && (
              <div className="flex justify-center py-8">
                <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!sessionsLoading && sessions.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-600">{T('no_sessions_yet')}</div>
            )}
            {!sessionsLoading && sessions.map((s, i) => {
              const tc = SESSION_TYPE_LABELS[s.type] || { label: s.type.toUpperCase(), color: 'text-slate-400 bg-slate-700/50' }
              const isActive = !s.endedAt
              return (
                <div key={s.id} className={clsx('flex items-center gap-3 px-4 py-2.5', i < sessions.length - 1 && 'border-b border-slate-700/30')}>
                  <Circle size={7} className={clsx('fill-current flex-shrink-0', isActive ? 'text-emerald-400' : 'text-slate-600')} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{s.deviceName || s.deviceId?.slice(0, 8)}</p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(s.startedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={clsx('text-[10px] px-1.5 py-0.5 rounded font-medium', tc.color)}>{tc.label}</span>
                    <span className="text-[10px] text-slate-600 font-mono">
                      {isActive ? <span className="text-emerald-400">{T('session_active')}</span> : formatDuration(s.durationSec)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
