import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
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
import { useEffect, useState } from 'react'
import { api } from './lib/api'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null)

  useEffect(() => {
    api.get('/api/auth/setup-status')
      .then(r => setSetupRequired(r.data.setupRequired))
      .catch(() => setSetupRequired(false))
  }, [])

  if (setupRequired === null) {
    return (
      <div className="min-h-screen bg-navy-900 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-6 h-6 border-2 border-brand-blue border-t-transparent rounded-full animate-spin" />
          <span>Loading AiRemote...</span>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {setupRequired && <Route path="/setup" element={<SetupPage onComplete={() => setSetupRequired(false)} />} />}
        {setupRequired && <Route path="*" element={<Navigate to="/setup" replace />} />}
        {!setupRequired && (
          <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
              <Route index element={<OverviewPage />} />
              <Route path="devices" element={<DevicesPage />} />
              <Route path="devices/:deviceId" element={<DeviceWorkspacePage />} />
              <Route path="ai" element={<AiPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="users" element={<UsersPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  )
}
