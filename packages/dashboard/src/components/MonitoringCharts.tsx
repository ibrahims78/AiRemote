import { useEffect, useState, useCallback } from 'react'
import {
  AreaChart, Area,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'
import type { TooltipProps } from 'recharts'
import type { ValueType, NameType } from 'recharts/types/component/DefaultTooltipContent'
import { Cpu, MemoryStick, HardDrive, Network, ArrowUp, ArrowDown, Activity } from 'lucide-react'
import { clsx } from 'clsx'
import type { DeviceStats } from '@airemote/shared'

interface HistoryPoint {
  time: string
  cpu: number
  ram: number
  netUp: number
  netDown: number
}

interface Props {
  deviceId: string
  stats: DeviceStats | undefined
}

function fmtKbps(kbps: number | undefined): string {
  const v = kbps ?? 0
  if (v === 0)     return '0 B/s'
  if (v < 1)       return `${Math.round(v * 1024)} B/s`
  if (v < 1024)    return `${v.toFixed(v < 10 ? 2 : 1)} KB/s`
  return `${(v / 1024).toFixed(2)} MB/s`
}

// Module-level history store so it persists across re-renders
const historyMap = new Map<string, HistoryPoint[]>()

function getOrCreateHistory(deviceId: string): HistoryPoint[] {
  if (!historyMap.has(deviceId)) historyMap.set(deviceId, [])
  return historyMap.get(deviceId)!
}

function StatCard({ icon: Icon, label, value, unit, colorClass, subLabel }: {
  icon: React.ElementType
  label: string
  value: number
  unit: string
  colorClass: string
  textClass: string
  subLabel?: string
}) {
  const pct = unit === '%' ? value : undefined
  const isHigh = pct !== undefined && pct > 85
  const barColor = isHigh ? 'bg-red-400' : pct !== undefined && pct > 70 ? 'bg-orange-400' : colorClass

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', colorClass + '/15')}>
            <Icon size={14} className={colorClass.replace('bg-', 'text-')} />
          </div>
          <span className="text-sm text-slate-300">{label}</span>
        </div>
        <div className="text-right">
          <span className={clsx('text-xl font-bold font-mono', isHigh ? 'text-red-400' : 'text-white')}>
            {typeof value === 'number' ? value.toFixed(1) : '0.0'}
          </span>
          <span className="text-xs text-slate-500 ml-0.5">{unit}</span>
        </div>
      </div>
      {pct !== undefined && (
        <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-700', barColor)}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {subLabel && <p className="text-xs text-slate-500 mt-1.5">{subLabel}</p>}
    </div>
  )
}

const CustomTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy-800 border border-slate-700/50 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1.5 font-mono">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color ?? '#38bdf8' }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-mono">{Number(p.value).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

const NetTooltip = ({ active, payload, label }: TooltipProps<ValueType, NameType>) => {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-navy-800 border border-slate-700/50 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1.5 font-mono">{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color ?? '#38bdf8' }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-white font-mono">{fmtKbps(Number(p.value))}</span>
        </div>
      ))}
    </div>
  )
}

export function MonitoringCharts({ deviceId, stats }: Props) {
  const [history, setHistory] = useState<HistoryPoint[]>(() => [...getOrCreateHistory(deviceId)])

  const updateHistory = useCallback((newStats: DeviceStats) => {
    const arr = getOrCreateHistory(deviceId)
    const now = new Date()
    const point: HistoryPoint = {
      time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
      cpu: newStats.cpuPercent,
      ram: newStats.ramPercent,
      netUp: newStats.networkUpKbps,
      netDown: newStats.networkDownKbps
    }
    arr.push(point)
    if (arr.length > 60) arr.shift()
    setHistory([...arr])
  }, [deviceId])

  useEffect(() => {
    if (stats) updateHistory(stats)
  }, [stats, updateHistory])

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
        <div className="text-center">
          <Activity size={24} className="mx-auto mb-2 text-slate-600 animate-pulse" />
          في انتظار بيانات المراقبة...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Cpu} label="المعالج"
          value={stats.cpuPercent} unit="%" colorClass="bg-brand-blue" textClass="text-brand-blue"
        />
        <StatCard
          icon={MemoryStick} label="الذاكرة"
          value={stats.ramPercent} unit="%" colorClass="bg-brand-teal" textClass="text-brand-teal"
          subLabel={`${((stats.ramUsedMb ?? 0) / 1024).toFixed(1)} / ${((stats.ramTotalMb ?? 0) / 1024).toFixed(1)} GB`}
        />
        <StatCard
          icon={HardDrive} label="القرص"
          value={stats.diskPercent} unit="%" colorClass="bg-purple-400" textClass="text-purple-400"
          subLabel={`${(stats.diskUsedGb ?? 0).toFixed(1)} / ${(stats.diskTotalGb ?? 0).toFixed(1)} GB`}
        />
        <div className="glass rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange-400/15 flex items-center justify-center">
              <Network size={14} className="text-orange-400" />
            </div>
            <span className="text-sm text-slate-300">الشبكة</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <ArrowUp size={10} className="text-emerald-400" /> رفع
              </div>
              <span className="text-xs font-mono text-white">{fmtKbps(stats.networkUpKbps)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-slate-400">
                <ArrowDown size={10} className="text-brand-blue" /> تنزيل
              </div>
              <span className="text-xs font-mono text-white">{fmtKbps(stats.networkDownKbps)}</span>
            </div>
          </div>
        </div>
      </div>

      {history.length > 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="glass rounded-xl p-4">
            <h4 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
              <Cpu size={11} className="text-brand-blue" /> CPU & RAM (%)
            </h4>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={history} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id={`cpuGrad-${deviceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id={`ramGrad-${deviceId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.35}/>
                    <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#475569' }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cpu" name="CPU" stroke="#38bdf8" fill={`url(#cpuGrad-${deviceId})`} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="ram" name="RAM" stroke="#2dd4bf" fill={`url(#ramGrad-${deviceId})`} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="glass rounded-xl p-4">
            <h4 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5">
              <Network size={11} className="text-orange-400" /> الشبكة
            </h4>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={history} margin={{ top: 2, right: 2, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#475569' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#475569' }} tickFormatter={v => fmtKbps(v)} width={42} />
                <Tooltip content={<NetTooltip />} />
                <Line type="monotone" dataKey="netUp" name="رفع" stroke="#4ade80" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="netDown" name="تنزيل" stroke="#38bdf8" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}
