import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import { clsx } from 'clsx'
import { useToastStore } from '../store/toastStore'
import type { Toast } from '../store/toastStore'

const ICONS = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-400/20' },
  error:   { icon: XCircle,      color: 'text-red-400',     bg: 'bg-red-400/10 border-red-400/20' },
  warning: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-400/10 border-orange-400/20' },
  info:    { icon: Info,          color: 'text-brand-blue', bg: 'bg-brand-blue/10 border-brand-blue/20' },
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [visible, setVisible] = useState(false)
  const cfg = ICONS[toast.type]
  const Icon = cfg.icon

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      className={clsx(
        'flex items-start gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-sm transition-all duration-300',
        cfg.bg,
        visible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-8'
      )}
      style={{ minWidth: '260px', maxWidth: '360px' }}
    >
      <Icon size={16} className={clsx('flex-shrink-0 mt-0.5', cfg.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200">{toast.title}</p>
        {toast.message && <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{toast.message}</p>}
      </div>
      <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5">
        <X size={13} />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  return (
    <div className="fixed bottom-5 left-5 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onClose={() => removeToast(t.id)} />
        </div>
      ))}
    </div>
  )
}
