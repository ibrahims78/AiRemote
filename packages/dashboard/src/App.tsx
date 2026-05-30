import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import { useUIStore } from './store/uiStore'
import { SetupPage } from './pages/SetupPage'
import { LoginPage } from './pages/LoginPage'
import { DashboardLayout } from './layouts/DashboardLayout'
import { OverviewPage } from './pages/OverviewPage'
import { DevicesPage } from './pages/DevicesPage'
import { DeviceWorkspacePage } from './pages/DeviceWorkspacePage'
import { AiPage } from './pages/AiPage'
import { SessionsPage } from './pages/SessionsPage'
import { UsersPage } from './pages/UsersPage'
import { SettingsPage } from './pages/SettingsPage'
import { AuditPage } from './pages/AuditPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { useEffect, useState } from 'react'
import { api } from './lib/api'
import { applyTheme, applyLang } from './store/uiStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)
  const { theme, lang } = useUIStore()

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => { applyLang(lang) }, [lang])

  useEffect(() => {
    api.get('/api/auth/setup-status')
      .then(r => setSetupRequired(r.data.setupRequired))
      .catch(() => setSetupRequired(false))
  }, [])

  if (setupRequired === null) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center shadow-lg shadow-brand-blue/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </div>
          <div className="flex items-center gap-2.5 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
            <span>Loading AiRemote...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {setupRequired  && <Route path="/setup" element={<SetupPage onComplete={() => setSetupRequired(false)} />} />}
        {setupRequired  && <Route path="*" element={<Navigate to="/setup" replace />} />}
        {!setupRequired && (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index                             element={<OverviewPage />} />
              <Route path="devices"                   element={<DevicesPage />} />
              <Route path="devices/:deviceId"         element={<DeviceWorkspacePage />} />
              <Route path="ai"                        element={<AiPage />} />
              <Route path="sessions"                  element={<SessionsPage />} />
              <Route path="notifications"             element={<NotificationsPage />} />
              <Route path="audit"                     element={<AuditPage />} />
              <Route path="users"                     element={<UsersPage />} />
              <Route path="settings"                  element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}
