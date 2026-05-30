import { useState, useRef, useEffect } from 'react'
import { Terminal, Play, RotateCcw, ChevronRight, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'

interface CommandResult {
  id: string
  command: string
  stdout: string
  stderr: string
  exitCode: number
  duration: number
  timestamp: Date
  status: 'running' | 'success' | 'error' | 'timeout'
}

interface Props {
  deviceId: string
  deviceName: string
}

const QUICK_COMMANDS = [
  { label: 'المعالج', cmd: 'top -bn1 | head -20' },
  { label: 'الذاكرة', cmd: 'free -h' },
  { label: 'القرص', cmd: 'df -h' },
  { label: 'الشبكة', cmd: 'ss -tulpn' },
  { label: 'العمليات', cmd: 'ps aux --sort=-%cpu | head -15' },
  { label: 'السجلات', cmd: 'journalctl -n 50 --no-pager' },
  { label: 'uptime', cmd: 'uptime && uname -a' },
  { label: 'IP', cmd: 'ip addr show' },
]

export function CommandRunner({ deviceId, deviceName }: Props) {
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<CommandResult[]>([])
  const [running, setRunning] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const cmdHistory = history.map(h => h.command).reverse()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  async function execute(cmd: string) {
    const command = cmd.trim()
    if (!command || running) return

    const id = Date.now().toString()
    const entry: CommandResult = {
      id, command,
      stdout: '', stderr: '',
      exitCode: -1, duration: 0,
      timestamp: new Date(),
      status: 'running'
    }

    setHistory(prev => [...prev, entry])
    setRunning(true)
    setInput('')
    setHistIdx(-1)

    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command, timeoutMs: 60000 })
      const d = res.data
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        stdout: d.stdout || '',
        stderr: d.stderr || '',
        exitCode: d.exitCode,
        duration: d.duration,
        status: d.exitCode === 0 ? 'success' : 'error'
      } : h))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      const msg = err.response?.data?.error || err.message || 'فشل التنفيذ'
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, stderr: msg, exitCode: -1, status: 'timeout'
      } : h))
    } finally {
      setRunning(false)
      inputRef.current?.focus()
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') { execute(input); return }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const newIdx = Math.min(histIdx + 1, cmdHistory.length - 1)
      setHistIdx(newIdx)
      setInput(cmdHistory[newIdx] || '')
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const newIdx = Math.max(histIdx - 1, -1)
      setHistIdx(newIdx)
      setInput(newIdx === -1 ? '' : cmdHistory[newIdx])
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0f1e] rounded-xl border border-slate-700/50 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/60" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/60" />
            <div className="w-3 h-3 rounded-full bg-green-500/60" />
          </div>
          <Terminal size={12} className="text-brand-teal ml-1.5" />
          <span className="text-xs text-slate-400 font-mono">{deviceName} — Agent Commands</span>
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            className="text-xs text-slate-600 hover:text-slate-400 flex items-center gap-1 transition-colors"
          >
            <RotateCcw size={11} /> مسح
          </button>
        )}
      </div>

      {/* Quick commands */}
      <div className="flex gap-1.5 px-4 py-2 border-b border-slate-700/30 flex-shrink-0 overflow-x-auto">
        {QUICK_COMMANDS.map(q => (
          <button
            key={q.cmd}
            onClick={() => execute(q.cmd)}
            disabled={running}
            className="flex-shrink-0 text-xs px-2.5 py-1 rounded-md bg-slate-700/40 hover:bg-slate-700/70 text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-600 transition-all disabled:opacity-40"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-600 gap-2">
            <Terminal size={28} />
            <p>اكتب أمراً أدناه أو اختر من الاختصارات</p>
            <p className="text-[10px] text-slate-700">الأوامر تُنفَّذ عبر Agent — بدون SSH</p>
          </div>
        )}

        {history.map(entry => (
          <div key={entry.id} className="space-y-1">
            {/* Command header */}
            <div className="flex items-center gap-2 text-slate-400">
              <ChevronRight size={12} className="text-brand-teal flex-shrink-0" />
              <span className="text-brand-teal">{entry.command}</span>
              <span className="text-slate-700 ml-auto flex items-center gap-1">
                <Clock size={9} />
                {entry.timestamp.toLocaleTimeString('ar')}
              </span>
            </div>

            {/* Status + output */}
            {entry.status === 'running' ? (
              <div className="text-slate-600 pl-5 flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 border border-brand-teal border-t-transparent rounded-full animate-spin" />
                جاري التنفيذ...
              </div>
            ) : (
              <>
                <div className={clsx(
                  'flex items-center gap-1.5 pl-5 text-[10px]',
                  entry.status === 'success' ? 'text-emerald-500' :
                  entry.status === 'error' ? 'text-red-400' : 'text-orange-400'
                )}>
                  {entry.status === 'success' ? <CheckCircle2 size={10} /> :
                   entry.status === 'timeout' ? <AlertCircle size={10} /> : <XCircle size={10} />}
                  Exit: {entry.exitCode} · {entry.duration}ms
                </div>

                {entry.stdout && (
                  <pre className={clsx(
                    'pl-5 text-slate-300 whitespace-pre-wrap break-all leading-relaxed',
                    entry.stdout.split('\n').length > 20 && 'max-h-64 overflow-y-auto'
                  )}>
                    {entry.stdout}
                  </pre>
                )}
                {entry.stderr && (
                  <pre className="pl-5 text-red-400/80 whitespace-pre-wrap break-all leading-relaxed">
                    {entry.stderr}
                  </pre>
                )}
              </>
            )}
            <div className="border-b border-slate-700/20 mt-1" />
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-brand-teal text-xs font-mono flex-shrink-0">$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={running}
            placeholder="أدخل الأمر هنا... (↑↓ للتاريخ)"
            className="flex-1 bg-transparent text-slate-100 text-xs font-mono placeholder-slate-700 focus:outline-none"
            dir="ltr"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button
            onClick={() => execute(input)}
            disabled={!input.trim() || running}
            className="p-1.5 bg-brand-teal/15 hover:bg-brand-teal/25 text-brand-teal disabled:opacity-30 rounded-lg transition-colors flex-shrink-0"
          >
            {running
              ? <div className="w-3.5 h-3.5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
              : <Play size={13} />
            }
          </button>
        </div>
      </div>
    </div>
  )
}
