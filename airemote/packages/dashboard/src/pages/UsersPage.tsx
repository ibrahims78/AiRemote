import { useState, useEffect } from 'react'
import { Users, Plus, Trash2, X, Shield, Eye, Settings2, Check, ChevronDown, KeyRound } from 'lucide-react'
import { api } from '../lib/api'
import { toast } from '../store/toastStore'
import type { User, UserRole } from '@airemote/shared'
import { clsx } from 'clsx'

const ROLES: { value: UserRole; label: string; color: string; icon: React.ElementType; desc: string }[] = [
  { value: 'admin',   label: 'مسؤول',   color: 'text-red-400 bg-red-400/10 border-red-400/20',         icon: Shield,    desc: 'وصول كامل لكل الميزات والمستخدمين' },
  { value: 'manager', label: 'مدير',    color: 'text-brand-blue bg-brand-blue/10 border-brand-blue/20', icon: Settings2, desc: 'إدارة الأجهزة والجلسات' },
  { value: 'viewer',  label: 'مشاهد',   color: 'text-slate-400 bg-slate-700/50 border-slate-600/30',    icon: Eye,       desc: 'قراءة فقط' },
]

function RoleDropdown({ user, onUpdate }: { user: User; onUpdate: (updated: User) => void }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const current = ROLES.find(r => r.value === user.role)!
  const Icon = current.icon

  async function changeRole(role: UserRole) {
    if (role === user.role) { setOpen(false); return }
    setSaving(true)
    try {
      const res = await api.patch(`/api/users/${user.id}`, { role })
      onUpdate(res.data)
      toast.success('تم تغيير الصلاحية', `${user.name} → ${ROLES.find(r => r.value === role)?.label}`)
    } catch {
      toast.error('فشل تغيير الصلاحية')
    } finally {
      setSaving(false)
      setOpen(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        className={clsx(
          'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all disabled:opacity-60',
          current.color
        )}
      >
        {saving
          ? <div className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          : <Icon size={10} />
        }
        {current.label}
        <ChevronDown size={9} className={clsx('transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1.5 right-0 w-56 glass rounded-xl border border-slate-700/60 shadow-2xl z-20 overflow-hidden">
            {ROLES.map(r => {
              const RIcon = r.icon
              return (
                <button
                  key={r.value}
                  onClick={() => changeRole(r.value)}
                  className={clsx(
                    'w-full text-right flex items-start gap-2.5 px-3 py-2.5 hover:bg-slate-700/30 transition-colors',
                    r.value === user.role && 'bg-slate-700/20'
                  )}
                >
                  <div className={clsx('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 border', r.color)}>
                    <RIcon size={11} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-200">{r.label}</span>
                      {r.value === user.role && <Check size={10} className="text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5">{r.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function PasswordModal({ user, onClose }: { user: User; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { toast.error('كلمة المرور قصيرة', 'يجب أن تكون 8 أحرف على الأقل'); return }
    if (password !== confirm) { toast.error('كلمتا المرور لا تتطابقان'); return }
    setSaving(true)
    try {
      await api.patch(`/api/users/${user.id}`, { password })
      toast.success('تم تغيير كلمة المرور', user.name)
      onClose()
    } catch {
      toast.error('فشل تغيير كلمة المرور')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-blue/15 flex items-center justify-center">
              <KeyRound size={14} className="text-brand-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">تغيير كلمة المرور</h3>
              <p className="text-xs text-slate-400">{user.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">كلمة المرور الجديدة</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="8 أحرف على الأقل" required
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">تأكيد كلمة المرور</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="أعد الكتابة" required
              className={clsx(
                'w-full bg-navy-900 border rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors',
                confirm && password !== confirm ? 'border-red-500/60 focus:border-red-500' : 'border-slate-600 focus:border-brand-blue'
              )}
            />
            {confirm && password !== confirm && (
              <p className="text-xs text-red-400 mt-1">كلمتا المرور لا تتطابقان</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving || !password || password !== confirm}
              className="flex-1 bg-brand-blue hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium py-2 rounded-lg transition-colors"
            >
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button type="button" onClick={onClose} className="px-4 text-sm text-slate-400 hover:text-slate-200 border border-slate-600 rounded-lg transition-colors">
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as UserRole })
  const [adding, setAdding] = useState(false)
  const [pwModal, setPwModal] = useState<User | null>(null)

  useEffect(() => {
    api.get('/api/users')
      .then(r => setUsers(r.data))
      .catch(() => toast.error('فشل تحميل المستخدمين'))
      .finally(() => setLoading(false))
  }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (form.password.length < 8) { toast.error('كلمة المرور قصيرة', '8 أحرف على الأقل'); return }
    setAdding(true)
    try {
      const res = await api.post('/api/users', form)
      setUsers(p => [...p, res.data])
      setShowAdd(false)
      setForm({ name: '', email: '', password: '', role: 'viewer' })
      toast.success('تم إضافة المستخدم', form.name)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error('فشل إضافة المستخدم', err.response?.data?.error)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`حذف المستخدم "${name}"؟ هذا الإجراء لا يمكن التراجع عنه.`)) return
    try {
      await api.delete(`/api/users/${id}`)
      setUsers(p => p.filter(u => u.id !== id))
      toast.success('تم حذف المستخدم', name)
    } catch {
      toast.error('فشل حذف المستخدم')
    }
  }

  const adminCount = users.filter(u => u.role === 'admin').length
  const managerCount = users.filter(u => u.role === 'manager').length
  const viewerCount = users.filter(u => u.role === 'viewer').length

  return (
    <div className="p-6">
      {pwModal && <PasswordModal user={pwModal} onClose={() => setPwModal(null)} />}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">المستخدمون</h2>
          <p className="text-slate-400 text-sm mt-1">إدارة حسابات الوصول والصلاحيات</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} /> إضافة مستخدم
        </button>
      </div>

      {/* Stats */}
      {users.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'مسؤولون', count: adminCount, color: 'text-red-400', bg: 'bg-red-400/10', icon: Shield },
            { label: 'مديرون', count: managerCount, color: 'text-brand-blue', bg: 'bg-brand-blue/10', icon: Settings2 },
            { label: 'مشاهدون', count: viewerCount, color: 'text-slate-400', bg: 'bg-slate-700/50', icon: Eye },
          ].map(s => {
            const SIcon = s.icon
            return (
              <div key={s.label} className={clsx('glass rounded-xl p-3 flex items-center gap-3', s.bg)}>
                <SIcon size={18} className={s.color} />
                <div>
                  <div className={clsx('text-xl font-bold', s.color)}>{s.count}</div>
                  <div className="text-xs text-slate-500">{s.label}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && (
        <div className="glass rounded-xl p-4 mb-4 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-slate-200">مستخدم جديد</h3>
            <button onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300"><X size={15} /></button>
          </div>
          <form onSubmit={handleAdd} className="grid grid-cols-2 gap-3">
            <input
              required placeholder="الاسم الكامل"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
            <input
              required type="email" dir="ltr"
              placeholder="البريد الإلكتروني"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              className="bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
            <input
              required type="password"
              placeholder="كلمة المرور (8+ أحرف)"
              value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
              className="bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
            <select
              value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value as UserRole }))}
              className="bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-blue"
            >
              <option value="viewer">مشاهد</option>
              <option value="manager">مدير</option>
              <option value="admin">مسؤول</option>
            </select>
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={adding} className="bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors">
                {adding ? 'جاري الإضافة...' : 'إضافة'}
              </button>
              <button type="button" onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-200 text-sm px-4 py-2 rounded-lg border border-slate-600 transition-colors">
                إلغاء
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center text-slate-500 py-12">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          جاري التحميل...
        </div>
      ) : (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">المستخدم</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">الصلاحية</th>
                <th className="text-right text-xs text-slate-500 font-medium px-4 py-3">تاريخ الإنشاء</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center text-slate-500 py-12">
                    <Users size={28} className="mx-auto mb-2 text-slate-700" />
                    لا يوجد مستخدمون بعد
                  </td>
                </tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 group transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-purple to-brand-blue flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-slate-100">{u.name}</div>
                        <div className="text-xs text-slate-500" dir="ltr">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <RoleDropdown user={u} onUpdate={(updated) => setUsers(p => p.map(x => x.id === u.id ? updated : x))} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(u.createdAt).toLocaleDateString('ar')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setPwModal(u)}
                        className="p-1.5 text-slate-600 hover:text-brand-blue transition-colors rounded"
                        title="تغيير كلمة المرور"
                      >
                        <KeyRound size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded"
                        title="حذف المستخدم"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
