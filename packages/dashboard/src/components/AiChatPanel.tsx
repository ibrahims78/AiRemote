import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bot, Send, Trash2, User, Loader, ChevronDown, Key, Zap,
  Copy, Play, Check, Terminal, AlertCircle, Wifi, WifiOff,
  Sparkles, Settings2, Square
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  error?: boolean
  streaming?: boolean
  execResult?: { command: string; stdout: string; stderr: string; exitCode: number }
}

interface AIConfig {
  provider: 'openai' | 'gemini' | 'ollama'
  model: string
  apiKey?: string
  baseUrl?: string
}

interface DeviceStatsMini {
  cpuPercent?: number
  ramPercent?: number
  diskPercent?: number
}

const PROVIDERS = [
  { value: 'openai',  label: 'OpenAI GPT-4o',   models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'gemini',  label: 'Google Gemini',    models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'] },
  { value: 'ollama',  label: 'Ollama (محلي)',    models: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2'] }
]

const CONFIG_KEY = 'airemote-ai-config'

function loadSavedConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { provider: 'openai', model: 'gpt-4o', apiKey: '', baseUrl: '' }
}

function getAuthToken(): string {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return ''
    const auth = JSON.parse(stored)
    return auth?.state?.token || ''
  } catch { return '' }
}

function buildSuggestions(stats: DeviceStatsMini | null, isAr: boolean): string[] {
  if (!stats) return []
  const s: string[] = []
  if ((stats.cpuPercent ?? 0) > 75)  s.push(isAr ? 'أظهر العمليات التي تستهلك أعلى CPU' : 'Show top CPU-consuming processes')
  if ((stats.ramPercent ?? 0) > 80)  s.push(isAr ? 'فحص استخدام الذاكرة بالتفصيل'       : 'Check memory usage in detail')
  if ((stats.diskPercent ?? 0) > 85) s.push(isAr ? 'اعرض أكبر الملفات لتحرير مساحة القرص' : 'Show largest files to free disk space')
  return s.slice(0, 3)
}

const QUICK_PROMPTS_AR = [
  'ما هي مواصفات هذا الجهاز؟',
  'ما هي حالة الخادم حالياً؟',
  'تحقق من استخدام الذاكرة والمعالج',
  'اعرض آخر 20 سطر من السجلات',
  'أظهر العمليات التي تستهلك أعلى CPU',
]

const QUICK_PROMPTS_EN = [
  'What are the specs of this device?',
  'What is the current server status?',
  'Check memory and CPU usage',
  'Show last 20 lines of logs',
  'Show top CPU-consuming processes',
]

interface ContentPart {
  type: 'text' | 'code'
  content: string
  lang?: string
}

function parseContent(text: string): ContentPart[] {
  const parts: ContentPart[] = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push({ type: 'text', content: text.slice(last, m.index) })
    parts.push({ type: 'code', lang: m[1] || 'bash', content: m[2].trim() })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', content: text.slice(last) })
  return parts.length > 0 ? parts : [{ type: 'text', content: text }]
}

// ── CodeBlock ──────────────────────────────────────────────────────────────
function CodeBlock({ code, lang, deviceId, isLight, autoExecEnabled }: {
  code: string
  lang: string
  deviceId?: string
  isLight: boolean
  autoExecEnabled?: boolean
}) {
  const [copied,    setCopied]    = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result,    setResult]    = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null)
  const [showResult, setShowResult] = useState(true)
  const autoExeced = useRef(false)

  const isExecutable = ['bash', 'sh', 'shell', 'zsh', ''].includes(lang.toLowerCase())

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function execute() {
    if (!deviceId || executing) return
    setExecuting(true)
    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command: code, timeoutMs: 60000 })
      setResult({ stdout: res.data.stdout || '', stderr: res.data.stderr || '', exitCode: res.data.exitCode ?? 0 })
      setShowResult(true)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setResult({ stdout: '', stderr: err.response?.data?.error || 'Execution failed', exitCode: 1 })
      setShowResult(true)
    } finally {
      setExecuting(false)
    }
  }

  // Auto-execute when enabled (only once per block)
  useEffect(() => {
    if (autoExecEnabled && isExecutable && deviceId && !autoExeced.current && !result) {
      autoExeced.current = true
      execute()
    }
  }, [autoExecEnabled])

  const headerCls = clsx(
    'flex items-center justify-between px-3 py-1.5 text-[11px] font-mono border-b',
    isLight ? 'bg-slate-100 border-slate-200 text-slate-500' : 'bg-[#161b22] border-slate-700/60 text-slate-500'
  )

  return (
    <div className={clsx(
      'rounded-xl overflow-hidden border text-[12px] my-1.5',
      isLight ? 'border-slate-200' : 'border-slate-700/60'
    )}>
      {/* Header */}
      <div className={headerCls}>
        <div className="flex items-center gap-1.5">
          <Terminal size={10} />
          <span>{lang || 'bash'}</span>
          {autoExecEnabled && isExecutable && (
            <span className="text-amber-500 flex items-center gap-1">
              <Zap size={8} /> auto
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={copy} title="نسخ"
            className={clsx('p-1 rounded transition-colors', isLight ? 'hover:bg-slate-200' : 'hover:bg-slate-700/50')}>
            {copied ? <Check size={10} className="text-emerald-500" /> : <Copy size={10} />}
          </button>
          {isExecutable && deviceId && (
            <button onClick={execute} disabled={executing}
              title="تنفيذ على الجهاز البعيد"
              className={clsx(
                'flex items-center gap-1 px-2 py-0.5 rounded transition-colors text-[10px] disabled:opacity-50',
                isLight
                  ? 'bg-teal-100 text-teal-700 hover:bg-teal-200'
                  : 'bg-brand-teal/15 text-brand-teal hover:bg-brand-teal/25'
              )}>
              {executing
                ? <><Loader size={9} className="animate-spin" /> جاري...</>
                : <><Play size={9} /> تنفيذ</>}
            </button>
          )}
        </div>
      </div>

      {/* Code */}
      <pre className={clsx(
        'px-4 py-3 font-mono overflow-x-auto whitespace-pre leading-relaxed',
        isLight ? 'text-slate-700 bg-slate-50' : 'text-slate-200 bg-[#0d1117]'
      )}>
        {code}
      </pre>

      {/* Result */}
      {result && (
        <div className={clsx('border-t', isLight ? 'border-slate-200' : 'border-slate-700/50')}>
          <div className={clsx(
            'flex items-center justify-between px-3 py-1.5',
            result.exitCode === 0
              ? isLight ? 'bg-emerald-50 text-emerald-700' : 'bg-emerald-500/8 text-emerald-400'
              : isLight ? 'bg-red-50 text-red-600'         : 'bg-red-500/8 text-red-400'
          )}>
            <div className="flex items-center gap-1.5">
              {result.exitCode === 0 ? <Check size={10} /> : <AlertCircle size={10} />}
              <span className="font-mono">exit {result.exitCode}</span>
            </div>
            <button onClick={() => setShowResult(v => !v)} className="opacity-60 hover:opacity-100 transition-opacity">
              <ChevronDown size={11} className={clsx('transition-transform', showResult ? '' : '-rotate-90')} />
            </button>
          </div>
          {showResult && (result.stdout || result.stderr) && (
            <pre className={clsx(
              'px-3 py-2 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto max-h-48',
              isLight ? 'bg-slate-50 text-slate-600' : 'bg-[#0d1117] text-slate-300'
            )}>
              {result.stdout && <span className={isLight ? 'text-slate-700' : 'text-slate-200'}>{result.stdout.slice(0, 2000)}{result.stdout.length > 2000 ? '\n…' : ''}</span>}
              {result.stderr && <span className={isLight ? 'text-red-600' : 'text-red-400'}>{result.stderr}</span>}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────────────────────
interface Props {
  deviceId?: string
  conversationId?: string
}

export function AiChatPanel({ deviceId, conversationId }: Props) {
  const isLight = useUIStore(s => s.theme === 'light')
  const isAr    = useUIStore(s => s.lang === 'ar')

  const [messages,       setMessages]       = useState<Message[]>([])
  const [input,          setInput]          = useState('')
  const [loading,        setLoading]        = useState(false)
  const [showConfig,     setShowConfig]     = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [config,         setConfig]         = useState<AIConfig>(loadSavedConfig)
  const [validating,     setValidating]     = useState(false)
  const [validateOk,     setValidateOk]     = useState<boolean | null>(null)
  const [autoExec,       setAutoExec]       = useState(() => localStorage.getItem('airemote-ai-autoexec') === 'true')
  const [suggestions,    setSuggestions]    = useState<string[]>([])

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const scrollBoxRef    = useRef<HTMLDivElement>(null)
  const inputRef        = useRef<HTMLTextAreaElement>(null)
  const userScrolled    = useRef(false)
  const abortRef        = useRef<AbortController | null>(null)

  // ── Load AI config from server (sync on mount) ─────────────────────────
  useEffect(() => {
    api.get('/api/settings').then(res => {
      const d = res.data
      const local = loadSavedConfig()
      const hasLocal = !!localStorage.getItem(CONFIG_KEY)

      if (d.aiProvider && (d.aiApiKey || d.aiProvider === 'ollama')) {
        const serverCfg: AIConfig = {
          provider: d.aiProvider,
          model:    d.aiModel || (d.aiProvider === 'gemini' ? 'gemini-2.5-flash' : d.aiProvider === 'ollama' ? 'llama3' : 'gpt-4o'),
          apiKey:   d.aiApiKey || '',
          baseUrl:  d.ollamaUrl || '',
        }
        const needsUpdate = !hasLocal
          || local.provider !== serverCfg.provider
          || (!local.apiKey && serverCfg.apiKey)
        if (needsUpdate) {
          setConfig(serverCfg)
          localStorage.setItem(CONFIG_KEY, JSON.stringify(serverCfg))
        }
      }
    }).catch(() => {})
  }, [])

  // ── Auto-resize textarea ───────────────────────────────────────────────
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px'
    }
  }, [input])

  // ── Smart scroll ───────────────────────────────────────────────────────
  useEffect(() => {
    const box = scrollBoxRef.current
    if (!box) return
    const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150
    if (!userScrolled.current && (!isNearBottom || loading)) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  useEffect(() => {
    const box = scrollBoxRef.current
    if (!box) return
    const onScroll = () => {
      const isNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80
      userScrolled.current = !isNearBottom
    }
    box.addEventListener('scroll', onScroll, { passive: true })
    return () => box.removeEventListener('scroll', onScroll)
  }, [])

  // ── Load conversation history ──────────────────────────────────────────
  useEffect(() => {
    setLoadingHistory(true)
    setMessages([])
    setSuggestions([])
    userScrolled.current = false
    const params = new URLSearchParams()
    if (conversationId) params.set('conversationId', conversationId)
    if (deviceId)       params.set('deviceId', deviceId)

    api.get(`/api/ai/history?${params.toString()}`).then(res => {
      const msgs = res.data.messages || []
      setMessages(msgs.map((m: { role: string; content: string; timestamp: string }) => ({
        role: m.role, content: m.content, timestamp: new Date(m.timestamp)
      })))
    }).catch(() => {}).finally(() => setLoadingHistory(false))
  }, [deviceId, conversationId])

  // Cleanup abort on unmount
  useEffect(() => () => { abortRef.current?.abort() }, [])

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider)!

  const saveConfig = useCallback((cfg: AIConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    setConfig(cfg)
    setValidateOk(null)
    api.put('/api/settings', {
      aiProvider: cfg.provider, aiModel: cfg.model,
      aiApiKey: cfg.apiKey || '', ollamaUrl: cfg.baseUrl || '',
    }).catch(() => {})
  }, [])

  async function handleValidate() {
    setValidating(true)
    setValidateOk(null)
    try {
      await api.post('/api/ai/validate', { config: { provider: config.provider, model: config.model, apiKey: config.apiKey || undefined, baseUrl: config.baseUrl || undefined } })
      setValidateOk(true)
    } catch { setValidateOk(false) }
    finally { setValidating(false) }
  }

  // ── Streaming send ─────────────────────────────────────────────────────
  async function handleSend(text?: string) {
    const msg = (text || input).trim()
    if (!msg || loading) return
    if (suggestions.length) setSuggestions([])
    userScrolled.current = false

    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date() }])
    setInput('')
    setLoading(true)

    // Placeholder streaming message
    setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date(), streaming: true }])

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const token = getAuthToken()
      const res = await fetch('/api/ai/chat/stream', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          message: msg, deviceId, conversationId,
          config: { provider: config.provider, model: config.model, apiKey: config.apiKey || undefined, baseUrl: config.baseUrl || undefined }
        }),
        signal: ctrl.signal
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: isAr ? 'فشل الاتصال' : 'Connection failed' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf  = ''
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.chunk) {
              full += data.chunk
              const content = full
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { ...next[next.length - 1], content }
                return next
              })
            }
            if (data.error) throw new Error(data.error)
            if (data.done) {
              setMessages(prev => {
                const next = [...prev]
                next[next.length - 1] = { ...next[next.length - 1], streaming: false }
                return next
              })
              if (data.stats) setSuggestions(buildSuggestions(data.stats, isAr))
            }
          } catch (parseErr) {
            if ((parseErr as Error).name !== 'SyntaxError') throw parseErr
          }
        }
      }
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return
      const err = e as Error
      setMessages(prev => {
        const next = [...prev]
        const lastIdx = next.length - 1
        if (next[lastIdx]?.streaming !== undefined) {
          next[lastIdx] = {
            role: 'assistant', content: err.message || 'حدث خطأ في الاتصال بالذكاء الاصطناعي',
            timestamp: new Date(), error: true, streaming: false
          }
        } else {
          next.push({ role: 'assistant', content: err.message || 'حدث خطأ', timestamp: new Date(), error: true })
        }
        return next
      })
    } finally {
      setLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  function stopStreaming() {
    abortRef.current?.abort()
    setMessages(prev => {
      const next = [...prev]
      if (next[next.length - 1]?.streaming) {
        next[next.length - 1] = { ...next[next.length - 1], streaming: false }
      }
      return next
    })
    setLoading(false)
  }

  async function clearHistory() {
    if (!confirm('هل تريد مسح المحادثة بالكامل؟')) return
    try {
      const params = new URLSearchParams()
      if (conversationId) params.set('conversationId', conversationId)
      if (deviceId)       params.set('deviceId', deviceId)
      await api.delete(`/api/ai/history?${params.toString()}`)
      setMessages([])
      setSuggestions([])
    } catch {}
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function renderMessageContent(msg: Message, msgAutoExec = false) {
    const parts = parseContent(msg.content)
    return (
      <div className={clsx(
        'text-[13px] leading-relaxed',
        msg.error
          ? 'text-red-500'
          : isLight
            ? msg.role === 'user' ? 'text-white' : 'text-slate-800'
            : msg.role === 'user' ? 'text-white' : 'text-slate-200'
      )}>
        {parts.map((part, i) => {
          const isLastPart = i === parts.length - 1
          return part.type === 'code'
            ? <CodeBlock key={i} code={part.content} lang={part.lang || 'bash'} deviceId={deviceId} isLight={isLight} autoExecEnabled={msgAutoExec} />
            : <p key={i} className="whitespace-pre-wrap">
                {part.content}
                {msg.streaming && isLastPart && (
                  <span className={clsx(
                    'inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse',
                    isLight ? 'bg-teal-500' : 'bg-brand-teal'
                  )} />
                )}
              </p>
        })}
        {/* Cursor when content is empty (just started streaming) */}
        {msg.streaming && msg.content === '' && (
          <span className={clsx(
            'inline-block w-0.5 h-3.5 animate-pulse',
            isLight ? 'bg-teal-500' : 'bg-brand-teal'
          )} />
        )}
      </div>
    )
  }

  // ── Input field classes ────────────────────────────────────────────────
  const inputCls = clsx(
    'w-full border rounded-2xl px-4 py-3 text-sm resize-none overflow-hidden transition-all',
    'placeholder:text-slate-400 focus:outline-none',
    isLight
      ? 'bg-white border-slate-300 text-slate-800 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 shadow-sm'
      : 'bg-navy-900 border-slate-600 text-slate-100 focus:border-brand-teal focus:ring-2 focus:ring-brand-teal/15'
  )

  const cfgFieldCls = clsx(
    'w-full border rounded-xl px-3 py-2 text-xs transition-colors focus:outline-none',
    isLight
      ? 'bg-white border-slate-300 text-slate-700 focus:border-teal-500'
      : 'bg-navy-900 border-slate-600 text-slate-200 focus:border-brand-teal'
  )

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-3 border-b flex-shrink-0',
        isLight ? 'border-slate-200' : 'border-slate-700/50'
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-teal to-brand-blue flex items-center justify-center shadow-sm shadow-brand-teal/30">
            <Sparkles size={14} className="text-white" />
          </div>
          <div>
            <h3 className={clsx('text-sm font-semibold', isLight ? 'text-slate-800' : 'text-slate-100')}>
              AI Assistant
            </h3>
            <p className={clsx('text-[11px]', isLight ? 'text-slate-500' : 'text-slate-500')}>
              {selectedProvider?.label} · {config.model}
            </p>
          </div>
          {deviceId && (
            <span className="text-[10px] bg-brand-teal/10 text-brand-teal border border-brand-teal/25 px-2 py-0.5 rounded-full font-medium">
              سياق الجهاز ✓
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Auto-exec toggle (only when connected to a device) */}
          {deviceId && (
            <button
              onClick={() => {
                const v = !autoExec
                setAutoExec(v)
                localStorage.setItem('airemote-ai-autoexec', String(v))
              }}
              title={autoExec ? 'تنفيذ تلقائي: مفعّل — انقر للإيقاف' : 'تفعيل التنفيذ التلقائي للأوامر'}
              className={clsx(
                'p-1.5 rounded-lg transition-colors border text-[10px] flex items-center gap-1',
                autoExec
                  ? 'bg-amber-500/12 border-amber-500/30 text-amber-500'
                  : isLight
                    ? 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
              )}
            >
              <Zap size={13} />
              {autoExec && <span className="hidden sm:inline font-medium">Auto</span>}
            </button>
          )}
          <button
            onClick={() => setShowConfig(s => !s)}
            className={clsx(
              'p-1.5 rounded-lg transition-colors',
              showConfig
                ? 'bg-brand-blue/15 text-brand-blue'
                : isLight
                  ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40'
            )}
            title="إعدادات AI"
          >
            <Settings2 size={14} />
          </button>
          <button
            onClick={clearHistory}
            disabled={messages.length === 0}
            className={clsx(
              'p-1.5 rounded-lg transition-colors disabled:opacity-30',
              isLight ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-500 hover:text-red-400 hover:bg-red-400/10'
            )}
            title="مسح المحادثة"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* ── Config panel ────────────────────────────────────────────────── */}
      {showConfig && (
        <div className={clsx(
          'px-4 py-3.5 border-b space-y-3 flex-shrink-0',
          isLight ? 'bg-slate-50/80 border-slate-200' : 'bg-navy-900/60 border-slate-700/50'
        )}>
          <div className="flex items-center gap-2 mb-1">
            <Key size={12} className={isLight ? 'text-slate-400' : 'text-slate-500'} />
            <span className={clsx('text-xs font-medium', isLight ? 'text-slate-600' : 'text-slate-400')}>إعدادات النموذج</span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={clsx('text-[11px] block mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>المزود</label>
              <select
                value={config.provider}
                onChange={e => {
                  const p = PROVIDERS.find(x => x.value === e.target.value)!
                  saveConfig({ ...config, provider: e.target.value as AIConfig['provider'], model: p.models[0] })
                }}
                className={cfgFieldCls} dir="ltr"
              >
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={clsx('text-[11px] block mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>النموذج</label>
              <select
                value={config.model}
                onChange={e => saveConfig({ ...config, model: e.target.value })}
                className={cfgFieldCls} dir="ltr"
              >
                {selectedProvider?.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className={clsx('text-[11px] block mb-1', isLight ? 'text-slate-500' : 'text-slate-500')}>
              {config.provider === 'ollama' ? 'Ollama URL' : 'API Key'}
            </label>
            <input
              type="password"
              value={config.provider === 'ollama' ? (config.baseUrl || '') : (config.apiKey || '')}
              onChange={e => saveConfig(config.provider === 'ollama' ? { ...config, baseUrl: e.target.value } : { ...config, apiKey: e.target.value })}
              placeholder={config.provider === 'ollama' ? 'http://localhost:11434' : 'sk-...'}
              className={clsx(cfgFieldCls, 'font-mono')} dir="ltr"
            />
          </div>
          <div className="flex gap-2 pt-0.5">
            <button
              onClick={handleValidate}
              disabled={validating || (config.provider !== 'ollama' && !config.apiKey?.trim())}
              className={clsx(
                'flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-lg border transition-all disabled:opacity-40',
                validateOk === true  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' :
                validateOk === false ? 'bg-red-500/10 border-red-500/30 text-red-500' :
                isLight ? 'border-slate-300 text-slate-600 hover:border-teal-500 hover:text-teal-600'
                        : 'border-slate-600 text-slate-400 hover:border-brand-teal hover:text-brand-teal'
              )}
            >
              {validating  ? <><Loader size={10} className="animate-spin" /> جاري...</> :
               validateOk === true  ? <><Wifi size={10} /> ناجح</> :
               validateOk === false ? <><WifiOff size={10} /> فشل</> :
               <><Wifi size={10} /> اختبار</>}
            </button>
            <button
              onClick={() => setShowConfig(false)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg transition-colors',
                isLight
                  ? 'bg-teal-50 hover:bg-teal-100 text-teal-600 border border-teal-200'
                  : 'bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal border border-brand-teal/20'
              )}
            >
              <ChevronDown size={12} /> حفظ وإغلاق
            </button>
          </div>
        </div>
      )}

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        ref={scrollBoxRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
      >
        {loadingHistory && (
          <div className="flex justify-center py-8">
            <div className={clsx('w-5 h-5 border-2 border-t-transparent rounded-full animate-spin', isLight ? 'border-teal-500' : 'border-brand-teal')} />
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className={clsx(
              'w-16 h-16 rounded-2xl flex items-center justify-center mb-4 border',
              isLight
                ? 'bg-gradient-to-br from-teal-50 to-blue-50 border-slate-200'
                : 'bg-gradient-to-br from-brand-teal/15 to-brand-blue/15 border-slate-700/50'
            )}>
              <Bot size={28} className={isLight ? 'text-teal-500' : 'text-brand-teal'} />
            </div>
            <p className={clsx('text-sm font-semibold mb-1', isLight ? 'text-slate-700' : 'text-slate-200')}>{isAr ? 'مرحباً!' : 'Hello!'}</p>
            <p className={clsx('text-xs leading-relaxed max-w-[220px]', isLight ? 'text-slate-500' : 'text-slate-500')}>
              {deviceId
                ? (isAr ? 'أنا مساعدك لإدارة هذا الجهاز. يمكنني تنفيذ الأوامر مباشرة عليه.' : 'I can help manage this device and run commands directly on it.')
                : (isAr ? 'أنا مساعدك لإدارة الأنظمة. اسألني بالعربية أو الإنجليزية.' : 'Your AI assistant for system management. Ask me anything in Arabic or English.')}
            </p>
            <div className="mt-5 space-y-1.5 w-full max-w-[290px]">
              {(isAr ? QUICK_PROMPTS_AR : QUICK_PROMPTS_EN).map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className={clsx(
                    'w-full text-xs text-right px-3 py-2.5 rounded-xl border transition-all flex items-center gap-2',
                    isLight
                      ? 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:bg-teal-50 hover:text-teal-700 shadow-sm'
                      : 'bg-navy-800/80 border-slate-700/50 text-slate-400 hover:border-slate-600 hover:bg-slate-700/50 hover:text-slate-200'
                  )}
                >
                  <Zap size={10} className={clsx('flex-shrink-0', isLight ? 'text-teal-500' : 'text-brand-teal')} />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isLastMsg    = i === messages.length - 1
          const msgAutoExec  = autoExec && isLastMsg && msg.role === 'assistant' && !msg.streaming
          return (
            <div key={i} className={clsx('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
              {/* Avatar */}
              <div className={clsx(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border',
                msg.role === 'user'
                  ? 'bg-brand-blue/20 border-brand-blue/30'
                  : msg.error
                    ? 'bg-red-500/15 border-red-500/25'
                    : isLight
                      ? 'bg-teal-50 border-teal-200'
                      : 'bg-brand-teal/15 border-brand-teal/25'
              )}>
                {msg.role === 'user'
                  ? <User size={12} className="text-brand-blue" />
                  : <Bot size={12} className={msg.error ? 'text-red-400' : isLight ? 'text-teal-600' : 'text-brand-teal'} />
                }
              </div>

              {/* Bubble */}
              <div className={clsx(
                'max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm',
                msg.role === 'user'
                  ? 'bg-brand-blue text-white rounded-tr-sm'
                  : msg.error
                    ? isLight ? 'bg-red-50 border border-red-200 text-red-700 rounded-tl-sm' : 'bg-red-500/10 border border-red-500/20 rounded-tl-sm'
                    : isLight ? 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm' : 'bg-navy-800 border border-slate-700/50 rounded-tl-sm'
              )}>
                {renderMessageContent(msg, msgAutoExec)}
                <p className={clsx(
                  'text-[10px] mt-1.5 select-none',
                  msg.role === 'user'
                    ? 'text-blue-200'
                    : isLight ? 'text-slate-400' : 'text-slate-600'
                )}>
                  {msg.timestamp instanceof Date
                    ? msg.timestamp.toLocaleTimeString('ar')
                    : new Date(msg.timestamp).toLocaleTimeString('ar')}
                </p>
              </div>
            </div>
          )
        })}

        {/* Typing indicator (only while waiting for first chunk) */}
        {loading && messages[messages.length - 1]?.content === '' && messages[messages.length - 1]?.streaming && (
          <div className="flex gap-2.5">
            <div className={clsx(
              'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 border',
              isLight ? 'bg-teal-50 border-teal-200' : 'bg-brand-teal/15 border-brand-teal/25'
            )}>
              <Loader size={12} className={clsx('animate-spin', isLight ? 'text-teal-600' : 'text-brand-teal')} />
            </div>
            <div className={clsx(
              'rounded-2xl rounded-tl-sm px-4 py-3 border',
              isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-navy-800 border-slate-700/50'
            )}>
              <div className="flex gap-1.5 items-center h-4">
                {[0, 150, 300].map(d => (
                  <div key={d}
                    className={clsx('w-2 h-2 rounded-full animate-bounce', isLight ? 'bg-teal-400' : 'bg-brand-teal')}
                    style={{ animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Proactive suggestion chips */}
        {suggestions.length > 0 && !loading && (
          <div className="flex flex-wrap gap-1.5 pl-10 pr-2 pt-1">
            <span className={clsx('text-[10px] w-full mb-0.5', isLight ? 'text-slate-400' : 'text-slate-600')}>اقتراحات بناءً على حالة الجهاز:</span>
            {suggestions.map(s => (
              <button
                key={s}
                onClick={() => { setSuggestions([]); handleSend(s) }}
                className={clsx(
                  'text-[11px] px-3 py-1.5 rounded-full border transition-all flex items-center gap-1.5',
                  isLight
                    ? 'border-teal-200 text-teal-600 bg-teal-50 hover:bg-teal-100 hover:border-teal-300'
                    : 'border-brand-teal/30 text-brand-teal bg-brand-teal/8 hover:bg-brand-teal/15'
                )}
              >
                <Zap size={9} />
                {s}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────────────────── */}
      <div className={clsx(
        'p-3 border-t flex-shrink-0',
        isLight ? 'border-slate-200 bg-slate-50/50' : 'border-slate-700/50'
      )}>
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={deviceId
              ? 'اسأل AI عن الجهاز أو اطلب تنفيذ أمر… (Enter للإرسال)'
              : 'اكتب رسالتك… (Enter للإرسال، Shift+Enter لسطر جديد)'}
            rows={1}
            className={inputCls}
            style={{ minHeight: '44px', maxHeight: '128px' }}
          />
          {loading ? (
            <button
              onClick={stopStreaming}
              title="إيقاف الرد"
              className={clsx(
                'p-3 rounded-2xl transition-all flex-shrink-0',
                isLight
                  ? 'bg-red-100 hover:bg-red-200 text-red-500 border border-red-200'
                  : 'bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20'
              )}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              onClick={() => handleSend()}
              disabled={!input.trim()}
              className={clsx(
                'p-3 rounded-2xl transition-all flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
                isLight
                  ? 'bg-teal-500 hover:bg-teal-600 text-white shadow-sm shadow-teal-200'
                  : 'bg-brand-teal hover:bg-teal-400 text-white'
              )}
            >
              <Send size={15} />
            </button>
          )}
        </div>
        <p className={clsx('text-[10px] mt-1.5 text-center', isLight ? 'text-slate-400' : 'text-slate-600')}>
          Enter للإرسال · Shift+Enter لسطر جديد
          {autoExec && deviceId && <span className="text-amber-500 mr-2">· تنفيذ تلقائي مفعّل ⚡</span>}
        </p>
      </div>
    </div>
  )
}
