import { useState } from 'react'
import { Zap, Eye, EyeOff, Check } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

const REQUIREMENTS = [
  { label: '8 أحرف على الأقل', test: (p: string) => p.length >= 8 },
  { label: 'حرف كبير', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'رقم', test: (p: string) => /[0-9]/.test(p) },
]

export function SetupPage({ onComplete }: { onComplete: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { setAuth } = useAuthStore()
  const navigate = useNavigate()

  const passwordMet = REQUIREMENTS.filter(r => r.test(form.password)).length
  const passwordStrong = passwordMet === REQUIREMENTS.length

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm) { setError('كلمتا المرور غير متطابقتين'); return }
    if (form.password.length < 8) { setError('كلمة المرور يجب أن تكون 8 أحرف على الأقل'); return }

    setLoading(true)
    setError('')
    try {
      const res = await api.post('/api/auth/setup', {
        name: form.name, email: form.email, password: form.password
      })
      setAuth(res.data.token, res.data.user, res.data.refreshToken)
      onComplete()
      navigate('/')
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || 'حدث خطأ، يرجى المحاولة مجدداً')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-navy-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-blue to-brand-teal flex items-center justify-center mx-auto mb-4 shadow-lg shadow-brand-blue/20">
            <Zap size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">مرحباً بك في AiRemote</h1>
          <p className="text-slate-400 mt-2 text-sm">إعداد الحساب الأول — أنت ستكون المسؤول</p>
        </div>

        <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">الاسم</label>
            <input
              type="text" required
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              placeholder="إبراهيم"
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">البريد الإلكتروني</label>
            <input
              type="email" required
              value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              placeholder="admin@example.com"
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors"
              dir="ltr"
              autoComplete="email"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">كلمة المرور</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'} required
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="8 أحرف على الأقل"
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors pr-10"
                autoComplete="new-password"
              />
              <button type="button" onClick={() => setShowPass(p => !p)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {form.password && (
              <div className="mt-2 space-y-1">
                {REQUIREMENTS.map(r => (
                  <div key={r.label} className="flex items-center gap-1.5 text-xs">
                    <Check size={10} className={r.test(form.password) ? 'text-emerald-400' : 'text-slate-600'} />
                    <span className={r.test(form.password) ? 'text-emerald-400' : 'text-slate-500'}>{r.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">تأكيد كلمة المرور</label>
            <input
              type="password" required
              value={form.confirm}
              onChange={e => setForm(p => ({ ...p, confirm: e.target.value }))}
              placeholder="أعد كتابة كلمة المرور"
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue transition-colors"
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !passwordStrong}
            className="w-full bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {loading ? 'جاري الإعداد...' : 'إنشاء الحساب والبدء'}
          </button>
        </form>
      </div>
    </div>
  )
}
