import { useState, useRef, useEffect, useCallback } from 'react'
import { Bot, Send, Trash2, User, Loader, ChevronDown, Key, Zap, Copy, Play, Check, Terminal, AlertCircle } from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'

interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  error?: boolean
  execResult?: { command: string; stdout: string; stderr: string; exitCode: number }
}

interface AIConfig {
  provider: 'openai' | 'gemini' | 'ollama'
  model: string
  apiKey?: string
  baseUrl?: string
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI GPT-4o', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { value: 'gemini', label: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'] },
  { value: 'ollama', label: 'Ollama (محلي)', models: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2'] }
]

const CONFIG_KEY = 'airemote-ai-config'

function loadSavedConfig(): AIConfig {
  try {
    const stored = localStorage.getItem(CONFIG_KEY)
    if (stored) return JSON.parse(stored)
  } catch {}
  return { provider: 'openai', model: 'gpt-4o', apiKey: '', baseUrl: '' }
}

const QUICK_PROMPTS = [
  'ما هي حالة الخادم؟',
  'تحقق من استخدام الذاكرة',
  'اعرض آخر 20 سطر من السجلات',
  'أظهر العمليات التي تستهلك أعلى CPU',
  'تحقق من مساحة القرص المتاحة',
]

// Parse message content into text and code blocks
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

function CodeBlock({ code, lang, deviceId, onResult }: {
  code: string
  lang: string
  deviceId?: string
  onResult?: (result: Message['execResult']) => void
}) {
  const [copied, setCopied] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<{ stdout: string; stderr: string; exitCode: number } | null>(null)

  const isExecutable = ['bash', 'sh', 'shell', 'zsh', ''].includes(lang.toLowerCase())

  function copy() {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function execute() {
    if (!deviceId || executing) return
    setExecuting(true)
    setResult(null)
    try {
      const res = await api.post(`/api/devices/${deviceId}/exec`, { command: code, timeoutMs: 60000 })
      const r = { stdout: res.data.stdout, stderr: res.data.stderr, exitCode: res.data.exitCode }
      setResult(r)
      onResult?.({ command: code, ...r })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const msg = err.response?.data?.error || 'فشل التنفيذ'
      setResult({ stdout: '', stderr: msg, exitCode: -1 })
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-700/60 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-800/80">
        <div className="flex items-center gap-2">
          <Terminal size={11} className="text-slate-500" />
          <span className="text-[10px] text-slate-500 font-mono">{lang || 'bash'}</span>
        </div>
        <div className="flex items-center gap-1">
          {deviceId && isExecutable && (
            <button
              onClick={execute}
              disabled={executing}
              className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-brand-teal/15 hover:bg-brand-teal/25 text-brand-teal border border-brand-teal/30 transition-all disabled:opacity-50"
            >
              {executing
                ? <><div className="w-2.5 h-2.5 border border-brand-teal border-t-transparent rounded-full animate-spin" /> جاري...</>
                : <><Play size={9} /> تنفيذ</>
              }
            </button>
          )}
          <button onClick={copy} className="p-1 text-slate-600 hover:text-slate-300 transition-colors">
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
        </div>
      </div>
      <pre className="px-3 py-2.5 bg-[#0a0f1e] text-slate-200 text-[11px] font-mono overflow-x-auto whitespace-pre leading-relaxed">
        {code}
      </pre>
      {result && (
        <div className={clsx('px-3 py-2 text-[10px] font-mono border-t border-slate-700/50', result.exitCode === 0 ? 'bg-emerald-500/5 text-emerald-300' : 'bg-red-500/5 text-red-400')}>
          <div className="flex items-center gap-1.5 mb-1">
            {result.exitCode === 0
              ? <Check size={10} className="text-emerald-400" />
              : <AlertCircle size={10} className="text-red-400" />
            }
            <span>Exit: {result.exitCode}</span>
          </div>
          {result.stdout && <pre className="whitespace-pre-wrap text-slate-300">{result.stdout.slice(0, 1000)}{result.stdout.length > 1000 ? '\n...' : ''}</pre>}
          {result.stderr && <pre className="whitespace-pre-wrap text-red-400">{result.stderr}</pre>}
        </div>
      )}
    </div>
  )
}

interface Props {
  deviceId?: string
  conversationId?: string
}

export function AiChatPanel({ deviceId, conversationId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfig, setShowConfig] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [config, setConfig] = useState<AIConfig>(loadSavedConfig)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 128) + 'px'
    }
  }, [input])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    setLoadingHistory(true)
    setMessages([])
    const params = new URLSearchParams()
    if (conversationId) params.set('conversationId', conversationId)
    if (deviceId) params.set('deviceId', deviceId)

    api.get(`/api/ai/history?${params.toString()}`).then(res => {
      const msgs = res.data.messages || []
      setMessages(msgs.map((m: { role: string; content: string; timestamp: string }) => ({
        role: m.role, content: m.content, timestamp: new Date(m.timestamp)
      })))
    }).catch(() => {}).finally(() => setLoadingHistory(false))
  }, [deviceId, conversationId])

  const selectedProvider = PROVIDERS.find(p => p.value === config.provider)!

  const saveConfig = useCallback((cfg: AIConfig) => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
    setConfig(cfg)
  }, [])

  async function handleSend(text?: string) {
    const msg = (text || input).trim()
    if (!msg || loading) return

    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await api.post('/api/ai/chat', {
        message: msg,
        deviceId,
        conversationId,
        config: {
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey || undefined,
          baseUrl: config.baseUrl || undefined
        }
      })
      setMessages(prev => [...prev, {
        role: 'assistant', content: res.data.reply, timestamp: new Date()
      }])
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: err.response?.data?.error || 'حدث خطأ في الاتصال بالذكاء الاصطناعي',
        timestamp: new Date(), error: true
      }])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  async function clearHistory() {
    if (!confirm('هل تريد مسح المحادثة بالكامل؟')) return
    try {
      const params = new URLSearchParams()
      if (conversationId) params.set('conversationId', conversationId)
      if (deviceId) params.set('deviceId', deviceId)
      await api.delete(`/api/ai/history?${params.toString()}`)
      setMessages([])
    } catch {}
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  function renderMessageContent(msg: Message) {
    const parts = parseContent(msg.content)
    return (
      <div className={clsx('text-xs leading-relaxed', msg.error ? 'text-red-400' : 'text-slate-200')}>
        {parts.map((part, i) =>
          part.type === 'code'
            ? <CodeBlock key={i} code={part.content} lang={part.lang || 'bash'} deviceId={deviceId} />
            : <p key={i} className="whitespace-pre-wrap">{part.content}</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-teal to-brand-blue flex items-center justify-center">
            <Bot size={13} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-200">AI Assistant</h3>
            <p className="text-xs text-slate-500">{selectedProvider.label} · {config.model}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {deviceId && (
            <span className="text-[10px] bg-brand-teal/10 text-brand-teal border border-brand-teal/20 px-2 py-0.5 rounded-full">
              سياق الجهاز نشط
            </span>
          )}
          <button
            onClick={() => setShowConfig(s => !s)}
            className={clsx('p-1.5 transition-colors rounded-lg', showConfig ? 'bg-brand-blue/15 text-brand-blue' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/40')}
          >
            <Key size={13} />
          </button>
          <button
            onClick={clearHistory}
            disabled={messages.length === 0}
            className="p-1.5 text-slate-500 hover:text-red-400 disabled:opacity-30 transition-colors rounded-lg"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Config panel */}
      {showConfig && (
        <div className="px-4 py-3 bg-navy-900/70 border-b border-slate-700/50 space-y-2.5 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 block mb-1">المزود</label>
              <select
                value={config.provider}
                onChange={e => {
                  const p = PROVIDERS.find(x => x.value === e.target.value)!
                  saveConfig({ ...config, provider: e.target.value as AIConfig['provider'], model: p.models[0] })
                }}
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-teal"
                dir="ltr"
              >
                {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">النموذج</label>
              <select
                value={config.model}
                onChange={e => saveConfig({ ...config, model: e.target.value })}
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-brand-teal"
                dir="ltr"
              >
                {selectedProvider.models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">
              {config.provider === 'ollama' ? 'Ollama URL' : 'API Key'}
            </label>
            <input
              type="password"
              value={config.provider === 'ollama' ? (config.baseUrl || '') : (config.apiKey || '')}
              onChange={e => saveConfig(config.provider === 'ollama' ? { ...config, baseUrl: e.target.value } : { ...config, apiKey: e.target.value })}
              placeholder={config.provider === 'ollama' ? 'http://localhost:11434' : 'sk-...'}
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-2 py-1.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
              dir="ltr"
            />
          </div>
          <button
            onClick={() => setShowConfig(false)}
            className="w-full flex items-center justify-center gap-1.5 bg-brand-teal/15 hover:bg-brand-teal/25 text-brand-teal text-xs py-1.5 rounded-lg transition-colors"
          >
            <ChevronDown size={12} /> حفظ وإغلاق
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {loadingHistory && (
          <div className="flex justify-center py-4">
            <div className="w-4 h-4 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-teal/20 to-brand-blue/20 flex items-center justify-center mb-3 border border-slate-700/50">
              <Bot size={24} className="text-brand-teal" />
            </div>
            <p className="text-sm font-medium text-slate-300">مرحباً!</p>
            <p className="text-xs text-slate-500 mt-1 max-w-[220px] leading-relaxed">
              {deviceId ? 'أنا مساعدك لإدارة هذا الجهاز. يمكنني تنفيذ الأوامر مباشرة.' : 'أنا مساعدك لإدارة الأنظمة. اسألني بالعربية أو الإنجليزية.'}
            </p>
            <div className="mt-4 space-y-1.5 w-full max-w-[280px]">
              {QUICK_PROMPTS.map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="w-full text-xs text-slate-400 hover:text-slate-200 bg-navy-800/80 hover:bg-slate-700/50 border border-slate-700/50 hover:border-slate-600 px-3 py-2 rounded-lg text-right transition-all flex items-center gap-2"
                >
                  <Zap size={10} className="text-brand-teal flex-shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={clsx('flex gap-2.5', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
            <div className={clsx(
              'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
              msg.role === 'user' ? 'bg-brand-blue/20' : msg.error ? 'bg-red-500/15' : 'bg-brand-teal/20'
            )}>
              {msg.role === 'user'
                ? <User size={11} className="text-brand-blue" />
                : <Bot size={11} className={msg.error ? 'text-red-400' : 'text-brand-teal'} />
              }
            </div>
            <div className={clsx(
              'max-w-[90%] rounded-xl px-3 py-2',
              msg.role === 'user'
                ? 'bg-brand-blue/15 border border-brand-blue/20'
                : msg.error
                  ? 'bg-red-500/10 border border-red-500/20'
                  : 'bg-navy-800 border border-slate-700/50'
            )}>
              {renderMessageContent(msg)}
              <p className="text-slate-600 text-[10px] mt-1.5">
                {msg.timestamp.toLocaleTimeString('ar')}
              </p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-brand-teal/20 flex items-center justify-center flex-shrink-0">
              <Loader size={11} className="text-brand-teal animate-spin" />
            </div>
            <div className="bg-navy-800 border border-slate-700/50 rounded-xl px-3 py-2.5">
              <div className="flex gap-1 items-center h-4">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-bounce [animation-delay:0ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-bounce [animation-delay:150ms]" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-teal animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-slate-700/50 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={deviceId ? "اسأل AI عن الجهاز أو اطلب تنفيذ أمر... (Enter للإرسال)" : "اكتب رسالتك... (Enter للإرسال، Shift+Enter لسطر جديد)"}
            rows={1}
            className="flex-1 bg-navy-900 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-teal resize-none overflow-hidden transition-colors"
            style={{ minHeight: '38px', maxHeight: '128px' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="p-2.5 bg-brand-teal hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-all flex-shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}
