import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Monitor, History, Users, Settings, LogOut,
  Wifi, WifiOff, Zap, Bot, Circle, Command
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useDeviceStore } from '../store/deviceStore'
import { connectWebSocket, disconnectWebSocket, getWsState } from '../lib/websocket'
import { api } from '../lib/api'
import { toast } from '../store/toastStore'
import { ToastContainer } from '../components/ToastContainer'
import { clsx } from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'نظرة عامة', end: true },
  { to: '/devices', icon: Monitor, label: 'الأجهزة' },
  { to: '/ai', icon: Bot, label: 'AI Assistant' },
  { to: '/sessions', icon: History, label: 'سجل الجلسات' },
  { to: '/users', icon: Users, label: 'المستخدمون' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
]

export function DashboardLayout() {
  const { user, token, logout } = useAuthStore()
  const { devices, fetchDevices } = useDeviceStore()
  const navigate = useNavigate()
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const prevOnlineIds = useRef<Set<string>>(new Set())

  const onlineCount = devices.filter(d => d.status === 'online').length

  // Watch for device status changes and show toasts
  useEffect(() => {
    const currentOnline = new Set(devices.filter(d => d.status === 'online').map(d => d.id))

    devices.forEach(d => {
      const wasOnline = prevOnlineIds.current.has(d.id)
      const isNowOnline = currentOnline.has(d.id)
      if (!wasOnline && isNowOnline) {
        toast.success(`${d.name} متصل`, d.info?.hostname || d.info?.ipLocal || '')
      } else if (wasOnline && !isNowOnline && prevOnlineIds.current.size > 0) {
        toast.warning(`${d.name} انقطع الاتصال`)
      }
    })

    prevOnlineIds.current = currentOnline
  }, [devices])

  useEffect(() => {
    fetchDevices()
    if (user && token) {
      connectWebSocket(user.id, token)
      const interval = setInterval(() => setWsStatus(getWsState()), 2000)
      return () => { clearInterval(interval); disconnectWebSocket() }
    }
  }, [user, token])

  async function handleLogout() {
    const stored = localStorage.getItem('airemote-auth')
    const refreshToken = stored ? JSON.parse(stored)?.state?.refreshToken : undefined
    try { await api.post('/api/auth/logout', { refreshToken }) } catch {}
    disconnectWebSocket()
    logout()
    navigate('/login')
  }

  const wsColor =
    wsStatus === 'connected' ? 'text-emerald-400' :
    wsStatus === 'connecting' ? 'text-yellow-400 animate-pulse' :
    'text-slate-600'

  const wsLabel =
    wsStatus === 'connected' ? 'WebSocket متصل' :
    wsStatus === 'connecting' ? 'جاري الاتصال...' :
    'WebSocket منقطع'

  return (
    <div className="flex h-screen bg-navy-900 overflow-hidden">
      <aside className="w-60 flex-shrink-0 flex flex-col bg-navy-800 border-r border-slate-700/50">
        {/* Logo */}
        <div className="p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center shadow-sm shadow-brand-blue/30">
              <Zap size={16} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm leading-none">AiRemote</h1>
              <p className="text-[10px] text-slate-500 mt-0.5">Remote Access + AI</p>
            </div>
          </div>
        </div>

        {/* Live status */}
        <div className="px-3 py-2 border-b border-slate-700/50">
          <div className="flex items-center gap-2 px-2 py-2 rounded-lg bg-navy-900/60">
            {onlineCount > 0 ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-slate-500" />}
            <span className="text-xs text-slate-400 flex-1">
              <span className={onlineCount > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>{onlineCount}</span>
              /{devices.length} جهاز متصل
            </span>
            <span title={wsLabel}>
              <Circle size={7} className={clsx('fill-current', wsColor)} />
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to} to={to} end={end}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                  isActive
                    ? 'bg-brand-blue/15 text-brand-blue font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={isActive ? 'text-brand-blue' : ''} />
                  {label}
                  {to === '/devices' && onlineCount > 0 && (
                    <span className="mr-auto text-[10px] bg-emerald-400/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">
                      {onlineCount}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Version */}
        <div className="px-4 py-2 border-t border-slate-700/50">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-700">
            <Command size={9} />
            AiRemote v1.0.0
          </div>
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-slate-700/50">
          <div className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-700/20 transition-colors group">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500">
                {user?.role === 'admin' ? 'مسؤول' : user?.role === 'manager' ? 'مدير' : 'مشاهد'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded opacity-0 group-hover:opacity-100"
              title="تسجيل الخروج"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      <ToastContainer />
    </div>
  )
}
