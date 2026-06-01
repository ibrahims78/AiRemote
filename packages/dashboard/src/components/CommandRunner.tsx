import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Terminal, Play, RotateCcw, ChevronRight, Clock,
  CheckCircle2, XCircle, AlertCircle, Copy, ChevronDown, ChevronUp, Loader2
} from 'lucide-react'
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
  collapsed?: boolean
}

interface Props {
  deviceId: string
  deviceName: string
  platform?: 'windows' | 'linux' | 'macos'
}

const QUICK_LINUX = [
  { label: 'المعالج',   cmd: 'top -bn1 | head -20' },
  { label: 'الذاكرة',  cmd: 'free -h' },
  { label: 'القرص',    cmd: 'df -h' },
  { label: 'الشبكة',   cmd: 'ss -tulpn' },
  { label: 'العمليات', cmd: 'ps aux --sort=-%cpu | head -15' },
  { label: 'السجلات',  cmd: 'journalctl -n 50 --no-pager' },
  { label: 'Uptime',   cmd: 'uptime && uname -a' },
  { label: 'IP',       cmd: 'ip addr show' },
]

const QUICK_WINDOWS = [
  { label: 'المعالج',   cmd: 'wmic cpu get name,loadpercentage /format:list' },
  { label: 'الذاكرة',  cmd: 'wmic OS get FreePhysicalMemory,TotalVisibleMemorySize /format:list' },
  { label: 'القرص',    cmd: 'wmic logicaldisk get caption,size,freespace /format:list' },
  { label: 'الشبكة',   cmd: 'netstat -an' },
  { label: 'العمليات', cmd: 'tasklist /v' },
  { label: 'السجلات',  cmd: 'wevtutil qe System /c:20 /f:text /rd:true' },
  { label: 'Uptime',   cmd: 'net statistics workstation' },
  { label: 'IP',       cmd: 'ipconfig' },
]

const LONG_OUTPUT_THRESHOLD = 25

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {})
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function CommandRunner({ deviceId, deviceName, platform }: Props) {
  const [input, setInput]   = useState('')
  const [history, setHistory] = useState<CommandResult[]>([])
  const [running, setRunning] = useState(false)
  const [histIdx, setHistIdx] = useState(-1)
  const [copied, setCopied]   = useState<string | null>(null)

  const inputRef   = useRef<HTMLInputElement>(null)
  const scrollRef  = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

  const isWindows = platform === 'windows'
  const QUICK_COMMANDS = isWindows ? QUICK_WINDOWS : QUICK_LINUX
  const cmdHistory = history.map(h => h.command).reverse()

  const handleScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distFromBottom < 120
  }, [])

  useEffect(() => {
    if (!isNearBottomRef.current) return
    const el = scrollRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    })
  }, [history])

  function toggleCollapse(id: string) {
    setHistory(prev => prev.map(h => h.id === id ? { ...h, collapsed: !h.collapsed } : h))
  }

  function handleCopy(id: string, text: string) {
    copyToClipboard(text)
    setCopied(id)
    setTimeout(() => setCopied(null), 1500)
  }

  async function execute(cmd: string) {
    const command = cmd.trim()
    if (!command || running) return

    const id = Date.now().toString()
    const entry: CommandResult = {
      id, command,
      stdout: '', stderr: '',
      exitCode: -1, duration: 0,
      timestamp: new Date(),
      status: 'running',
      collapsed: false,
    }

    isNearBottomRef.current = true
    setHistory(prev => [...prev, entry])
    setRunning(true)
    setInput('')
    setHistIdx(-1)

    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command, timeoutMs: 60000 })
      const d = res.data
      const lines = (d.stdout || '').split('\n').length
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h,
        stdout: d.stdout || '',
        stderr: d.stderr || '',
        exitCode: d.exitCode,
        duration: d.duration,
        status: d.exitCode === 0 ? 'success' : 'error',
        collapsed: lines > LONG_OUTPUT_THRESHOLD,
      } : h))
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; message?: string }
      const msg = err.response?.data?.error || err.message || 'فشل التنفيذ'
      setHistory(prev => prev.map(h => h.id === id ? {
        ...h, stderr: msg, exitCode: -1, status: 'timeout', collapsed: false,
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
    <div className="flex flex-col h-full bg-navy-900 rounded-xl border border-slate-700/50 overflow-hidden">

      {/* ── Title bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/70"   />
            <div className="w-3 h-3 rounded-full bg-yellow-400/70"/>
            <div className="w-3 h-3 rounded-full bg-green-400/70" />
          </div>
          <Terminal size={13} className="text-brand-teal opacity-80" />
          <span className="text-xs text-slate-300 font-mono">
            {deviceName}
          </span>
          {isWindows && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-400 border border-blue-500/25 font-mono leading-none">
              Windows
            </span>
          )}
        </div>
        {history.length > 0 && (
          <button
            onClick={() => setHistory([])}
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors py-1 px-2 rounded hover:bg-slate-700/40"
          >
            <RotateCcw size={11} />
            <span>مسح</span>
          </button>
        )}
      </div>

      {/* ── Quick commands ────────────────────────────────────── */}
      <div className="flex gap-1.5 px-3 py-2 border-b border-slate-700/30 flex-shrink-0 overflow-x-auto scrollbar-thin">
        {QUICK_COMMANDS.map(q => (
          <button
            key={q.cmd}
            onClick={() => execute(q.cmd)}
            disabled={running}
            title={q.cmd}
            className="flex-shrink-0 text-[11px] px-2.5 py-1 rounded-md bg-slate-700/30 hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed font-medium"
          >
            {q.label}
          </button>
        ))}
      </div>

      {/* ── Output area ───────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs"
      >
        {history.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 select-none">
            <div className="w-12 h-12 rounded-xl bg-slate-700/30 flex items-center justify-center border border-slate-700/50">
              <Terminal size={22} className="text-slate-500" />
            </div>
            <div>
              <p className="text-slate-400 text-sm font-sans">اكتب أمراً أو اختر من الاختصارات</p>
              <p className="text-slate-600 text-[11px] mt-1 font-sans">تُنفَّذ الأوامر مباشرةً عبر Agent · بدون SSH</p>
            </div>
          </div>
        )}

        {history.map((entry, idx) => {
          const outputLines = entry.stdout ? entry.stdout.split('\n').length : 0
          const isLong = outputLines > LONG_OUTPUT_THRESHOLD
          const showOutput = !entry.collapsed
          const outputText = [entry.stdout, entry.stderr].filter(Boolean).join('\n')

          return (
            <div
              key={entry.id}
              className={clsx(
                'rounded-lg border transition-colors',
                entry.status === 'running'
                  ? 'border-slate-700/40 bg-slate-700/10'
                  : entry.status === 'success'
                  ? 'border-slate-700/40 bg-slate-700/10'
                  : entry.status === 'error'
                  ? 'border-red-500/20 bg-red-500/5'
                  : 'border-orange-500/20 bg-orange-500/5'
              )}
            >
              {/* Command line */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/20">
                <ChevronRight size={11} className="text-brand-teal flex-shrink-0" />
                <span className="text-brand-teal flex-1 truncate" title={entry.command}>
                  {entry.command}
                </span>
                <span className="flex items-center gap-1 text-slate-600 text-[10px] flex-shrink-0 ml-2">
                  <Clock size={9} />
                  {entry.timestamp.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>

              {/* Status bar */}
              <div className="flex items-center justify-between px-3 py-1.5">
                {entry.status === 'running' ? (
                  <span className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Loader2 size={11} className="animate-spin text-brand-teal" />
                    جاري التنفيذ...
                  </span>
                ) : (
                  <span className={clsx(
                    'flex items-center gap-1.5 text-[11px] font-medium',
                    entry.status === 'success' ? 'text-emerald-500' :
                    entry.status === 'error'   ? 'text-red-400' : 'text-orange-400'
                  )}>
                    {entry.status === 'success' ? <CheckCircle2 size={11} /> :
                     entry.status === 'timeout' ? <AlertCircle size={11} /> : <XCircle size={11} />}
                    <span>
                      {entry.status === 'success' ? 'نجح' : entry.status === 'error' ? 'خطأ' : 'انتهت المهلة'}
                    </span>
                    <span className="text-slate-600 font-normal">·</span>
                    <span className="text-slate-500 font-normal">exit {entry.exitCode}</span>
                    <span className="text-slate-600 font-normal">·</span>
                    <span className="text-slate-500 font-normal">{formatDuration(entry.duration)}</span>
                  </span>
                )}

                {entry.status !== 'running' && outputText && (
                  <div className="flex items-center gap-1">
                    {isLong && (
                      <button
                        onClick={() => toggleCollapse(entry.id)}
                        className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 px-1.5 py-0.5 rounded hover:bg-slate-700/40 transition-colors"
                      >
                        {entry.collapsed
                          ? <><ChevronDown size={10} /><span>{outputLines} سطر</span></>
                          : <><ChevronUp size={10} /><span>طي</span></>
                        }
                      </button>
                    )}
                    <button
                      onClick={() => handleCopy(entry.id, outputText)}
                      className={clsx(
                        'flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded transition-colors',
                        copied === entry.id
                          ? 'text-emerald-400 bg-emerald-500/10'
                          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
                      )}
                    >
                      <Copy size={10} />
                      <span>{copied === entry.id ? 'تم' : 'نسخ'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Output */}
              {entry.status !== 'running' && showOutput && (entry.stdout || entry.stderr) && (
                <div className={clsx(
                  'mx-3 mb-3 rounded-md overflow-hidden border border-slate-700/30',
                  isLong && 'max-h-72 overflow-y-auto'
                )}>
                  {entry.stdout && (
                    <pre className="px-3 py-2.5 text-slate-300 whitespace-pre-wrap break-all leading-relaxed bg-slate-800/30 text-[11px]">
                      {entry.stdout}
                    </pre>
                  )}
                  {entry.stderr && (
                    <pre className={clsx(
                      'px-3 py-2.5 whitespace-pre-wrap break-all leading-relaxed text-[11px]',
                      entry.stdout ? 'border-t border-red-500/20' : '',
                      'text-red-400 bg-red-950/20'
                    )}>
                      {entry.stderr}
                    </pre>
                  )}
                </div>
              )}

              {entry.status !== 'running' && isLong && entry.collapsed && (
                <button
                  onClick={() => toggleCollapse(entry.id)}
                  className="w-full text-center text-[10px] text-slate-500 hover:text-slate-300 py-1.5 border-t border-slate-700/20 hover:bg-slate-700/20 transition-colors"
                >
                  عرض {outputLines} سطر ▾
                </button>
              )}
            </div>
          )
        })}

        {/* Invisible scroll anchor */}
        <div className="h-1" />
      </div>

      {/* ── Input bar ─────────────────────────────────────────── */}
      <div className="flex-shrink-0 border-t border-slate-700/50 bg-navy-800/60 px-3 py-2.5">
        <div className="flex items-center gap-2 bg-slate-700/20 hover:bg-slate-700/30 border border-slate-700/50 hover:border-slate-600/60 focus-within:border-brand-teal/50 focus-within:bg-slate-700/25 rounded-lg px-3 py-2 transition-all">
          <span className="text-brand-teal text-sm font-mono flex-shrink-0 select-none opacity-70">
            {isWindows ? '>' : '$'}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            disabled={running}
            placeholder={isWindows
              ? 'أدخل أمر Windows... (↑↓ للتاريخ)'
              : 'أدخل الأمر... (↑↓ للتاريخ)'}
            className="flex-1 bg-transparent text-slate-200 text-xs font-mono placeholder-slate-600 focus:outline-none min-w-0"
            dir="ltr"
            spellCheck={false}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <button
            onClick={() => execute(input)}
            disabled={!input.trim() || running}
            className={clsx(
              'flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-all',
              input.trim() && !running
                ? 'bg-brand-teal/20 hover:bg-brand-teal/35 text-brand-teal'
                : 'text-slate-600 cursor-not-allowed'
            )}
            title="تنفيذ (Enter)"
          >
            {running
              ? <Loader2 size={13} className="animate-spin text-brand-teal" />
              : <Play size={13} />
            }
          </button>
        </div>
        <p className="text-[10px] text-slate-700 mt-1.5 px-1 select-none">
          {running ? 'جاري التنفيذ — انتظر...' : 'Enter للتنفيذ · ↑↓ للتنقل في التاريخ'}
        </p>
      </div>
    </div>
  )
}
