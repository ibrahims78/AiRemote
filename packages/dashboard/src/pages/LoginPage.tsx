import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Eye, EyeOff, Sun, Moon } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { clsx } from 'clsx'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const navigate = useNavigate()
  const T = useT()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/login', { email, password })
      setAuth(res.data.token, res.data.user, res.data.refreshToken)
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || T('invalid_credentials'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center shadow-sm shadow-brand-blue/30">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-bold text-white text-sm">AiRemote</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 rounded-lg transition-all"
            title={theme === 'dark' ? T('theme_light') : T('theme_dark')}
          >
            {theme === 'dark' ? <Moon size={15} /> : <Sun size={15} />}
          </button>
          <button
            onClick={toggleLang}
            className="px-2.5 py-1.5 text-xs font-mono font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-700/40 rounded-lg transition-all"
          >
            {lang === 'ar' ? 'EN' : 'ع'}
          </button>
        </div>
      </div>

      {/* Center content */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm animate-fade-in">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center mx-auto mb-5 shadow-xl shadow-brand-blue/20">
              <Zap size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">{T('login_title')}</h1>
            <p className="text-slate-400 text-sm">{T('login_subtitle')}</p>
          </div>

          {/* Form */}
          <div className="glass rounded-2xl p-6 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{T('email')}</label>
                <input
                  type="email" required autoComplete="email"
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="admin@airemote.io"
                  className="w-full bg-navy-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors"
                  dir="ltr"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{T('password')}</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    className={clsx(
                      'w-full bg-navy-900 border border-slate-600 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-brand-blue transition-colors',
                      lang === 'ar' ? 'pr-4 pl-10' : 'pl-4 pr-10'
                    )}
                  />
                  <button
                    type="button" onClick={() => setShowPass(p => !p)}
                    className={clsx(
                      'absolute top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors',
                      lang === 'ar' ? 'left-3' : 'right-3'
                    )}
                  >
                    {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-2.5 text-sm text-red-400 animate-fade-in">
                  {error}
                </div>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-blue/20 mt-2"
              >
                {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {loading ? T('logging_in') : T('login_btn')}
              </button>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-slate-700 mt-6">
            AiRemote v3.1.0 — Self-hosted Remote Access + AI
          </p>
        </div>
      </div>
    </div>
  )
}
