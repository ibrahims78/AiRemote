import { useState, useEffect } from 'react'
import {
  Settings, Server, Bot, Bell, Save, Check, Eye, EyeOff,
  RefreshCw, Info, Sun, Moon, Globe, Copy, Wifi, WifiOff, Loader
} from 'lucide-react'
import { api } from '../lib/api'
import { useUIStore } from '../store/uiStore'
import { useT } from '../lib/i18n'
import { toast } from '../store/toastStore'
import { clsx } from 'clsx'

interface AISettings {
  aiProvider: 'openai' | 'gemini' | 'ollama'
  aiModel: string
  aiApiKey: string
  ollamaUrl: string
}

const MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  ollama: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2']
}

type ValidateState = 'idle' | 'loading' | 'ok' | 'error'

export function SettingsPage() {
  const [ai, setAi] = useState<AISettings>({ aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [copied, setCopied] = useState(false)
  const [validateState, setValidateState] = useState<ValidateState>('idle')
  const [validateMsg, setValidateMsg] = useState('')
  const { theme, toggleTheme, lang, toggleLang } = useUIStore()
  const T = useT()
  const isAr = lang === 'ar'

  useEffect(() => {
    api.get('/api/settings').then(res => {
      const d = res.data
      setAi({
        aiProvider: d.aiProvider || 'openai',
        aiModel: d.aiModel || 'gpt-4o',
        aiApiKey: d.aiApiKey || '',
        ollamaUrl: d.ollamaUrl || ''
      })
      setTelegramToken(d.telegramToken || '')
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      await api.put('/api/settings', { ...ai, telegramToken })
      setSaved(true)
      setValidateState('idle')
      toast.success(T('toast_settings_saved'))
      setTimeout(() => setSaved(false), 2500)
    } catch {
      toast.error(T('save_failed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleValidate() {
    setValidateState('loading')
    setValidateMsg('')
    try {
      const config = {
        provider: ai.aiProvider,
        model: ai.aiModel,
        apiKey: ai.aiApiKey || undefined,
        baseUrl: ai.ollamaUrl || undefined,
      }
      const res = await api.post('/api/ai/validate', { config })
      setValidateState('ok')
      setValidateMsg(isAr ? `الاتصال ناجح ✓` : `Connection successful ✓`)
      toast.success(isAr ? 'مفتاح API يعمل بشكل صحيح' : 'API key is valid and working')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      const msg = err.response?.data?.error || 'Connection failed'
      setValidateState('error')
      setValidateMsg(msg)
    }
  }

  const wsUrl = window.location.origin.replace(/^https?:\/\//, m => m === 'https://' ? 'wss://' : 'ws://') + '/ws'

  function copyServerUrl() {
    navigator.clipboard.writeText(window.location.origin)
    setCopied(true)
    toast.success(T('toast_copy_done'), window.location.origin)
    setTimeout(() => setCopied(false), 2000)
  }

  const [copiedWs, setCopiedWs] = useState(false)
  function copyWsUrl() {
    navigator.clipboard.writeText(wsUrl)
    setCopiedWs(true)
    toast.success(isAr ? 'تم نسخ عنوان الـ WebSocket' : 'WebSocket URL copied', wsUrl)
    setTimeout(() => setCopiedWs(false), 2000)
  }

  const availableModels = MODELS[ai.aiProvider] || []

  const Section = ({ icon: Icon, color, title, children }: { icon: React.ElementType; color: string; title: string; children: React.ReactNode }) => (
    <div className="glass rounded-xl overflow-hidden">
      <div className={clsx('flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-700/40', color)}>
        <Icon size={15} />
        <h3 className="font-semibold text-sm text-slate-200">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{T('settings_title')}</h2>
          <p className="text-slate-400 text-sm mt-1">{T('settings_subtitle')}</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all flex-shrink-0',
            saved ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
            'bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg shadow-brand-blue/15'
          )}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? T('saving') : saved ? T('saved') : T('save_settings')}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          {T('loading')}
        </div>
      ) : (
        <div className="grid gap-4 max-w-2xl">

          {/* Appearance & Language */}
          <Section icon={Globe} color="text-brand-teal" title={T('appearance')}>
            <div className="grid grid-cols-2 gap-3">
              {/* Theme */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">{isAr ? 'الثيم' : 'Theme'}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => theme !== 'dark' && toggleTheme()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      theme === 'dark'
                        ? 'bg-slate-700/50 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    <Moon size={13} /> {T('theme_dark')}
                  </button>
                  <button
                    onClick={() => theme !== 'light' && toggleTheme()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      theme === 'light'
                        ? 'bg-amber-400/10 border-amber-400/40 text-amber-400'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    <Sun size={13} /> {T('theme_light')}
                  </button>
                </div>
              </div>
              {/* Language */}
              <div>
                <label className="block text-xs text-slate-500 mb-2">{isAr ? 'اللغة' : 'Language'}</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => lang !== 'ar' && toggleLang()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      lang === 'ar'
                        ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    {T('lang_ar')}
                  </button>
                  <button
                    onClick={() => lang !== 'en' && toggleLang()}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium border transition-all',
                      lang === 'en'
                        ? 'bg-brand-blue/10 border-brand-blue/40 text-brand-blue'
                        : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    )}
                  >
                    {T('lang_en')}
                  </button>
                </div>
              </div>
            </div>
          </Section>

          {/* Server Info */}
          <Section icon={Server} color="text-brand-blue" title={T('server_info')}>
            <div className="space-y-3">
              {/* HTTP URL */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">{T('server_address')}</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly value={window.location.origin}
                    className="flex-1 bg-navy-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                    dir="ltr"
                  />
                  <button
                    onClick={copyServerUrl}
                    className={clsx(
                      'p-2 border rounded-lg transition-colors flex-shrink-0',
                      copied ? 'text-emerald-400 border-emerald-500/30 bg-emerald-400/10' : 'text-slate-500 hover:text-white bg-navy-900 border-slate-700'
                    )}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>

              {/* WebSocket URL — for Desktop Agent */}
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">
                  {isAr ? 'عنوان WebSocket — للـ Agent على Windows' : 'WebSocket URL — for Windows Agent'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly value={wsUrl}
                    className="flex-1 bg-navy-900 border border-brand-teal/40 rounded-lg px-3 py-2 text-sm text-brand-teal font-mono"
                    dir="ltr"
                  />
                  <button
                    onClick={copyWsUrl}
                    className={clsx(
                      'p-2 border rounded-lg transition-colors flex-shrink-0',
                      copiedWs ? 'text-emerald-400 border-emerald-500/30 bg-emerald-400/10' : 'text-brand-teal border-brand-teal/30 hover:bg-brand-teal/10 bg-navy-900'
                    )}
                  >
                    {copiedWs ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <p className="text-xs text-brand-teal/60 mt-1.5 flex items-center gap-1.5">
                  <Info size={11} />
                  {isAr
                    ? 'انسخ هذا العنوان وضعه في حقل "Server URL" في تطبيق AiRemote Agent على Windows'
                    : 'Copy this URL and paste it into the "Server URL" field in the Windows AiRemote Agent app'}
                </p>
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg p-3">
                <Info size={13} className="text-brand-blue flex-shrink-0 mt-0.5" />
                <span>{T('server_address_hint')}</span>
              </div>
            </div>
          </Section>

          {/* AI Settings */}
          <Section icon={Bot} color="text-brand-teal" title={T('ai_settings')}>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{T('ai_provider')}</label>
                  <select
                    value={ai.aiProvider}
                    onChange={e => {
                      const prov = e.target.value as AISettings['aiProvider']
                      setAi(p => ({ ...p, aiProvider: prov, aiModel: MODELS[prov]?.[0] || '' }))
                      setValidateState('idle')
                    }}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-teal"
                    dir="ltr"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="ollama">{isAr ? 'Ollama (محلي)' : 'Ollama (Local)'}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">{T('ai_model')}</label>
                  <select
                    value={ai.aiModel}
                    onChange={e => { setAi(p => ({ ...p, aiModel: e.target.value })); setValidateState('idle') }}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-teal"
                    dir="ltr"
                  >
                    {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>

              {ai.aiProvider !== 'ollama' ? (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">
                    {ai.aiProvider === 'openai' ? 'OpenAI API Key' : 'Gemini API Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={ai.aiApiKey}
                      onChange={e => { setAi(p => ({ ...p, aiApiKey: e.target.value })); setValidateState('idle') }}
                      placeholder={ai.aiProvider === 'openai' ? 'sk-...' : 'AI...'}
                      className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono pr-10"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => setShowKey(s => !s)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">Ollama URL</label>
                  <input
                    type="text"
                    value={ai.ollamaUrl}
                    onChange={e => { setAi(p => ({ ...p, ollamaUrl: e.target.value })); setValidateState('idle') }}
                    placeholder="http://localhost:11434"
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                    dir="ltr"
                  />
                </div>
              )}

              {/* Validate button */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleValidate}
                  disabled={validateState === 'loading' || (ai.aiProvider !== 'ollama' && !ai.aiApiKey.trim())}
                  className={clsx(
                    'flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed',
                    validateState === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : validateState === 'error'
                        ? 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'bg-slate-700/30 border-slate-600 text-slate-300 hover:border-brand-teal hover:text-brand-teal'
                  )}
                >
                  {validateState === 'loading' ? (
                    <><Loader size={12} className="animate-spin" /> {isAr ? 'جاري الاختبار...' : 'Testing...'}</>
                  ) : validateState === 'ok' ? (
                    <><Wifi size={12} /> {isAr ? 'الاتصال ناجح' : 'Connected'}</>
                  ) : validateState === 'error' ? (
                    <><WifiOff size={12} /> {isAr ? 'فشل الاتصال' : 'Failed'}</>
                  ) : (
                    <><Wifi size={12} /> {isAr ? 'اختبار الاتصال' : 'Test Connection'}</>
                  )}
                </button>
                {validateMsg && validateState !== 'loading' && (
                  <p className={clsx('text-xs', validateState === 'ok' ? 'text-emerald-400' : 'text-red-400')}>
                    {validateMsg}
                  </p>
                )}
              </div>
            </div>
          </Section>

          {/* Notifications */}
          <Section icon={Bell} color="text-yellow-400" title={T('notifications')}>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">{T('telegram_token')}</label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={e => setTelegramToken(e.target.value)}
                  placeholder="1234567890:ABCdefGHI..."
                  className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-yellow-400 font-mono"
                  dir="ltr"
                />
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg p-3">
                <Info size={13} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <span>{T('telegram_hint')}</span>
              </div>
            </div>
          </Section>

          {/* Version info */}
          <div className="text-center text-xs text-slate-700 py-2">
            AiRemote v1.0.0 — Open Source | <span className="text-slate-600">MIT License</span>
          </div>
        </div>
      )}
    </div>
  )
}
