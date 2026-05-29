import { useState, useEffect } from 'react'
import { Settings, Server, Bot, Bell, Save, Check, Eye, EyeOff, RefreshCw, Info } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'

interface AISettings {
  aiProvider: 'openai' | 'gemini' | 'ollama'
  aiModel: string
  aiApiKey: string
  ollamaUrl: string
}

const MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
  ollama: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'qwen2']
}

export function SettingsPage() {
  const [ai, setAi] = useState<AISettings>({ aiProvider: 'openai', aiModel: 'gpt-4o', aiApiKey: '', ollamaUrl: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [telegramToken, setTelegramToken] = useState('')
  const [error, setError] = useState('')

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
    setError('')
    try {
      await api.put('/api/settings', { ...ai, telegramToken })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch {
      setError('فشل الحفظ. يرجى المحاولة مجدداً.')
    } finally {
      setSaving(false)
    }
  }

  const availableModels = MODELS[ai.aiProvider] || []

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">الإعدادات</h2>
          <p className="text-slate-400 text-sm mt-1">إعدادات النظام والتكاملات</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={clsx(
            'flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all',
            saved ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' :
            'bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white'
          )}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saving ? 'جاري الحفظ...' : saved ? 'تم الحفظ!' : 'حفظ الإعدادات'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          جاري التحميل...
        </div>
      ) : (
        <div className="grid gap-4 max-w-2xl">
          {/* Server Info */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Server size={16} className="text-brand-blue" />
              <h3 className="font-medium text-slate-200">معلومات الخادم</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">عنوان الخادم</label>
                <div className="flex items-center gap-2">
                  <input
                    disabled
                    value={window.location.origin}
                    className="flex-1 bg-navy-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-400 font-mono"
                    dir="ltr"
                    readOnly
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(window.location.origin)}
                    className="p-2 text-slate-500 hover:text-white bg-navy-900 border border-slate-700 rounded-lg transition-colors"
                    title="نسخ"
                  >
                    <Settings size={13} />
                  </button>
                </div>
              </div>
              <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg p-3">
                <Info size={13} className="text-brand-blue flex-shrink-0 mt-0.5" />
                <span>استخدم هذا العنوان في إعدادات الـ Agent على الأجهزة البعيدة.</span>
              </div>
            </div>
          </div>

          {/* AI Settings */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Bot size={16} className="text-brand-teal" />
              <h3 className="font-medium text-slate-200">إعدادات الذكاء الاصطناعي</h3>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">المزود</label>
                  <select
                    value={ai.aiProvider}
                    onChange={e => setAi(p => ({
                      ...p,
                      aiProvider: e.target.value as AISettings['aiProvider'],
                      aiModel: MODELS[e.target.value]?.[0] || ''
                    }))}
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-brand-teal"
                    dir="ltr"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Google Gemini</option>
                    <option value="ollama">Ollama (محلي)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1.5">النموذج</label>
                  <select
                    value={ai.aiModel}
                    onChange={e => setAi(p => ({ ...p, aiModel: e.target.value }))}
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
                      onChange={e => setAi(p => ({ ...p, aiApiKey: e.target.value }))}
                      placeholder={ai.aiProvider === 'openai' ? 'sk-...' : 'AI...'}
                      className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono pr-10"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(s => !s)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
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
                    onChange={e => setAi(p => ({ ...p, ollamaUrl: e.target.value }))}
                    placeholder="http://localhost:11434"
                    className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                    dir="ltr"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Notifications */}
          <div className="glass rounded-xl p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <Bell size={16} className="text-yellow-400" />
              <h3 className="font-medium text-slate-200">إشعارات Telegram</h3>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1.5">Telegram Bot Token</label>
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
                <span>احصل على token من @BotFather على Telegram لتلقي إشعارات عند اتصال/انقطاع الأجهزة.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
