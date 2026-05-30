import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, Monitor, History, Users, Settings, LogOut,
  Wifi, WifiOff, Zap, Bot, Circle, Sun, Moon, Menu, X, Command
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useDeviceStore } from '../store/deviceStore'
import { useUIStore } from '../store/uiStore'
import { connectWebSocket, disconnectWebSocket, getWsState } from '../lib/websocket'
import { api } from '../lib/api'
import { toast } from '../store/toastStore'
import { ToastContainer } from '../components/ToastContainer'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'

export function DashboardLayout() {
  const { user, token, logout } = useAuthStore()
  const { devices, fetchDevices } = useDeviceStore()
  const { theme, lang, toggleTheme, toggleLang, sidebarOpen, setSidebarOpen } = useUIStore()
  const navigate = useNavigate()
  const [wsStatus, setWsStatus] = useState<'connected' | 'connecting' | 'disconnected'>('disconnected')
  const prevOnlineIds = useRef<Set<string>>(new Set())
  const T = useT()

  const onlineCount = devices.filter(d => d.status === 'online').length
  const isRtl = lang === 'ar'

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: T('overview'), end: true },
    { to: '/devices', icon: Monitor, label: T('devices'), badge: onlineCount > 0 ? onlineCount : null },
    { to: '/ai', icon: Bot, label: T('ai_assistant') },
    { to: '/sessions', icon: History, label: T('sessions') },
    { to: '/users', icon: Users, label: T('users') },
    { to: '/settings', icon: Settings, label: T('settings') },
  ]

  useEffect(() => {
    const currentOnline = new Set(devices.filter(d => d.status === 'online').map(d => d.id))
    if (prevOnlineIds.current.size > 0) {
      devices.forEach(d => {
        const wasOnline = prevOnlineIds.current.has(d.id)
        const isNow = currentOnline.has(d.id)
        if (!wasOnline && isNow) toast.success(`${d.name} ${T('toast_device_connected')}`, d.info?.hostname || '')
        if (wasOnline && !isNow) toast.warning(`${d.name} ${T('toast_device_disconnected')}`)
      })
    }
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

  const wsColor = wsStatus === 'connected' ? 'text-emerald-400' : wsStatus === 'connecting' ? 'text-yellow-400 animate-pulse' : 'text-slate-600'
  const roleLabel = user?.role === 'admin' ? (isRtl ? 'مسؤول' : 'Admin') : user?.role === 'manager' ? (isRtl ? 'مدير' : 'Manager') : (isRtl ? 'مشاهد' : 'Viewer')

  // Mobile sidebar: slides from the logical start side (right in RTL, left in LTR)
  const mobileSidebarStyle: React.CSSProperties = {
    transform: sidebarOpen ? 'translateX(0)' : isRtl ? 'translateX(100%)' : 'translateX(-100%)',
    transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1), width 0.25s ease',
  }
  const desktopSidebarStyle: React.CSSProperties = {
    transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1)',
  }

  return (
    <div className="flex h-screen bg-navy-900 overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="lg:hidden sidebar-overlay" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — mobile: fixed from logical start; desktop: relative with width transition */}
      <aside
        className={clsx(
          'flex-shrink-0 flex flex-col bg-navy-800 border-slate-700/50 z-50',
          // Mobile: fixed + slide transform
          'fixed inset-y-0 lg:static',
          isRtl ? 'right-0 border-l' : 'left-0 border-r',
          // Desktop width
          sidebarOpen ? 'w-60' : 'w-60 lg:w-16',
        )}
        style={typeof window !== 'undefined' && window.innerWidth < 1024 ? mobileSidebarStyle : desktopSidebarStyle}
      >
        {/* Logo */}
        <div className="p-4 border-b border-slate-700/50 flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center shadow-sm shadow-brand-blue/30 flex-shrink-0">
            <Zap size={16} className="text-white" />
          </div>
          <div className={clsx('transition-all duration-200 overflow-hidden flex-1 min-w-0', sidebarOpen ? 'opacity-100' : 'opacity-0 w-0 lg:hidden')}>
            <h1 className="font-bold text-white text-sm leading-none whitespace-nowrap">AiRemote</h1>
            <p className="text-[10px] text-slate-500 mt-0.5 whitespace-nowrap">Remote Access + AI</p>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 hidden lg:block flex-shrink-0"
            title={sidebarOpen ? 'Collapse' : 'Expand'}
          >
            <Menu size={14} />
          </button>
          <button
            onClick={() => setSidebarOpen(false)}
            className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 lg:hidden flex-shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {/* WS + devices status */}
        <div className="px-3 py-2 border-b border-slate-700/50">
          <div className={clsx(
            'flex items-center gap-2 px-2 py-1.5 rounded-lg bg-navy-900/60',
            !sidebarOpen && 'lg:justify-center lg:px-1'
          )}>
            {onlineCount > 0
              ? <Wifi size={12} className="text-emerald-400 flex-shrink-0" />
              : <WifiOff size={12} className="text-slate-500 flex-shrink-0" />
            }
            <span className={clsx('text-xs text-slate-400 flex-1 whitespace-nowrap overflow-hidden', !sidebarOpen && 'lg:hidden')}>
              <span className={onlineCount > 0 ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>{onlineCount}</span>
              /{devices.length} {T('devices_online')}
            </span>
            <span title={wsStatus === 'connected' ? T('connected_ws') : T('disconnected_ws')} className="flex-shrink-0">
              <Circle size={7} className={clsx('fill-current', wsColor)} />
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label, end, badge }) => (
            <NavLink
              key={to} to={to} end={end}
              onClick={() => window.innerWidth < 1024 && setSidebarOpen(false)}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all relative',
                !sidebarOpen && 'lg:justify-center lg:px-0',
                isActive
                  ? 'bg-brand-blue/15 text-brand-blue font-medium'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={clsx('flex-shrink-0', isActive && 'text-brand-blue')} />
                  <span className={clsx('whitespace-nowrap flex-1', !sidebarOpen && 'lg:hidden')}>{label}</span>
                  {badge && sidebarOpen && (
                    <span className="text-[10px] bg-emerald-400/15 text-emerald-400 px-1.5 py-0.5 rounded-full font-medium">{badge}</span>
                  )}
                  {badge && !sidebarOpen && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-emerald-400 rounded-full hidden lg:block" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Theme + Lang toggles */}
        <div className={clsx('px-3 py-2 border-t border-slate-700/50 flex gap-1.5', !sidebarOpen && 'lg:flex-col lg:items-center')}>
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? T('theme_light') : T('theme_dark')}
            className={clsx(
              'flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium transition-all flex-1 justify-center',
              theme === 'light'
                ? 'bg-amber-400/15 text-amber-400 hover:bg-amber-400/22'
                : 'bg-slate-700/30 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
            )}
          >
            {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}
            {sidebarOpen && <span className="whitespace-nowrap">{theme === 'dark' ? T('theme_dark') : T('theme_light')}</span>}
          </button>
          <button
            onClick={toggleLang}
            title={lang === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium bg-slate-700/30 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-all flex-1 justify-center"
          >
            <span className="font-mono text-[11px] leading-none font-semibold">{lang === 'ar' ? 'EN' : 'ع'}</span>
            {sidebarOpen && <span className="whitespace-nowrap">{lang === 'ar' ? 'English' : 'العربية'}</span>}
          </button>
        </div>

        {/* Version */}
        {sidebarOpen && (
          <div className="px-4 py-1 flex items-center gap-1.5 text-[10px] text-slate-700">
            <Command size={8} /> v1.0.0
          </div>
        )}

        {/* User footer */}
        <div className="p-2 border-t border-slate-700/50">
          <div className={clsx(
            'flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-700/20 transition-colors group',
            !sidebarOpen && 'lg:justify-center'
          )}>
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-sm">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className={clsx('flex-1 min-w-0', !sidebarOpen && 'lg:hidden')}>
              <p className="text-xs font-medium text-slate-200 truncate">{user?.name}</p>
              <p className="text-[10px] text-slate-500">{roleLabel}</p>
            </div>
            <button
              onClick={handleLogout}
              title={T('logout')}
              className={clsx(
                'p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded',
                sidebarOpen ? 'opacity-0 group-hover:opacity-100' : 'lg:opacity-100'
              )}
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="flex-shrink-0 h-12 flex items-center gap-3 px-4 border-b border-slate-700/50 bg-navy-800/60 backdrop-blur-sm lg:hidden">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded-lg hover:bg-slate-700/40"
          >
            <Menu size={18} />
          </button>
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center flex-shrink-0">
            <Zap size={12} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">AiRemote</span>
          <div className="mr-auto flex items-center gap-1">
            <button onClick={toggleTheme} className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700/40">
              {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
            <button onClick={toggleLang} className="px-2 py-1.5 text-xs font-mono font-semibold text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700/40">
              {lang === 'ar' ? 'EN' : 'ع'}
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>

      <ToastContainer />
    </div>
  )
}
