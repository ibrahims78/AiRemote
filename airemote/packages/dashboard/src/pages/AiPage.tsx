import { useState } from 'react'
import { useDeviceStore } from '../store/deviceStore'
import { AiChatPanel } from '../components/AiChatPanel'
import { Bot, Cpu, MemoryStick, Monitor, Wifi, Circle } from 'lucide-react'
import { clsx } from 'clsx'

export function AiPage() {
  const { devices, statsMap } = useDeviceStore()
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined)

  const onlineDevices = devices.filter(d => d.status === 'online')
  const selectedDevice = selectedDeviceId ? devices.find(d => d.id === selectedDeviceId) : undefined

  return (
    <div className="flex h-full">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-6 py-4 border-b border-slate-700/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-teal to-brand-blue flex items-center justify-center shadow-sm shadow-brand-teal/20">
              <Bot size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AI Assistant</h2>
              <p className="text-xs text-slate-400">
                {selectedDevice ? (
                  <span className="text-brand-teal">سياق: <span className="font-medium">{selectedDevice.name}</span></span>
                ) : (
                  'مساعد إدارة الأنظمة — اختر جهازاً لتنفيذ أوامر مباشرة'
                )}
              </p>
            </div>
            {selectedDeviceId && (
              <button
                onClick={() => setSelectedDeviceId(undefined)}
                className="mr-auto text-xs text-slate-500 hover:text-slate-300 bg-slate-700/40 hover:bg-slate-700/60 px-3 py-1.5 rounded-lg transition-colors"
              >
                إلغاء تحديد الجهاز
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <AiChatPanel deviceId={selectedDeviceId} key={selectedDeviceId || 'global'} />
        </div>
      </div>

      {/* Devices sidebar */}
      <div className="w-64 flex-shrink-0 border-r border-slate-700/50 bg-navy-800/50 flex flex-col">
        <div className="px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">الأجهزة المتصلة</h3>
          {onlineDevices.length > 0 && (
            <p className="text-[10px] text-slate-600 mt-0.5">اختر جهازاً لتنفيذ الأوامر</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {/* Global option */}
          <button
            onClick={() => setSelectedDeviceId(undefined)}
            className={clsx(
              'w-full text-right p-2.5 rounded-lg border transition-all',
              !selectedDeviceId
                ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue'
                : 'border-transparent hover:border-slate-700/50 hover:bg-slate-700/20 text-slate-400'
            )}
          >
            <div className="flex items-center gap-2">
              <Bot size={12} className={!selectedDeviceId ? 'text-brand-blue' : 'text-slate-500'} />
              <span className="text-xs font-medium">عام (بدون جهاز)</span>
            </div>
          </button>

          {onlineDevices.length === 0 && (
            <div className="text-center py-6">
              <Monitor size={24} className="text-slate-700 mx-auto mb-2" />
              <p className="text-xs text-slate-600">لا توجد أجهزة متصلة</p>
            </div>
          )}

          {onlineDevices.map(d => {
            const stats = statsMap[d.id]
            const isSelected = selectedDeviceId === d.id
            return (
              <button
                key={d.id}
                onClick={() => setSelectedDeviceId(d.id)}
                className={clsx(
                  'w-full text-right p-3 rounded-lg border transition-all',
                  isSelected
                    ? 'bg-brand-teal/10 border-brand-teal/30'
                    : 'border-transparent hover:border-slate-700/50 hover:bg-slate-700/20'
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', isSelected ? 'bg-brand-teal/20' : 'bg-slate-700/60')}>
                    <Monitor size={11} className={isSelected ? 'text-brand-teal' : 'text-slate-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={clsx('text-xs font-medium truncate', isSelected ? 'text-brand-teal' : 'text-slate-200')}>{d.name}</p>
                    <div className="flex items-center gap-1">
                      <Circle size={5} className="text-emerald-400 fill-current" />
                      <span className="text-[10px] text-emerald-400">متصل</span>
                      {isSelected && (
                        <span className="text-[10px] text-brand-teal mr-1">✓ محدد</span>
                      )}
                    </div>
                  </div>
                </div>
                {stats && (
                  <div className="grid grid-cols-3 gap-1 text-center">
                    {[
                      { label: 'CPU', value: stats.cpuPercent, icon: Cpu, color: '#38bdf8' },
                      { label: 'RAM', value: stats.ramPercent, icon: MemoryStick, color: '#2dd4bf' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="text-[10px] font-mono font-bold text-white">{item.value}%</div>
                        <div className="text-[10px] text-slate-500">{item.label}</div>
                        <div className="w-full bg-slate-700/50 rounded-full h-1 mt-0.5">
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(item.value, 100)}%`, background: item.color }} />
                        </div>
                      </div>
                    ))}
                    <div>
                      <div className="text-[10px] font-mono font-bold text-white">{stats.diskPercent}%</div>
                      <div className="text-[10px] text-slate-500">Disk</div>
                      <div className="w-full bg-slate-700/50 rounded-full h-1 mt-0.5">
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(stats.diskPercent, 100)}%`, background: stats.diskPercent > 85 ? '#fb923c' : '#c084fc' }} />
                      </div>
                    </div>
                  </div>
                )}
                {!stats && (
                  <div className="flex items-center gap-1 text-[10px] text-slate-600">
                    <Wifi size={9} />
                    في انتظار البيانات...
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
