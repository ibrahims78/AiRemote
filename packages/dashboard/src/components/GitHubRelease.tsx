import { useState, useEffect, useRef } from 'react'
import {
  Github, Upload, Check, RefreshCw, Eye, EyeOff,
  Wifi, WifiOff, ExternalLink, AlertCircle, X,
  ChevronDown, ChevronUp, Circle, CheckCircle2, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { api } from '../lib/api'
import { toast } from '../store/toastStore'

interface GithubConfig {
  configured: boolean
  owner?:    string
  repo?:     string
  tokenSet?: boolean
}

interface ReleaseFile {
  id:        string
  label:     string
  assetName: string
  exists:    boolean
  sizeMB:    string | null
}

interface PublishState {
  status:     'running' | 'done' | 'error'
  log:        string[]
  url?:       string
  startedAt?: string
  finishedAt?:string
}

interface Props { isAr: boolean }

export function GitHubRelease({ isAr }: Props) {
  const [config,      setConfig]      = useState<GithubConfig>({ configured: false })
  const [token,       setToken]       = useState('')
  const [owner,       setOwner]       = useState('')
  const [repo,        setRepo]        = useState('')
  const [showToken,   setShowToken]   = useState(false)
  const [savingCfg,   setSavingCfg]   = useState(false)
  const [testState,   setTestState]   = useState<'idle'|'loading'|'ok'|'error'>('idle')
  const [testMsg,     setTestMsg]     = useState('')
  const [releases,    setReleases]    = useState<ReleaseFile[]>([])
  const [publishing,  setPublishing]  = useState<Record<string, { publishId: string; state: PublishState }>>({})
  const [showLog,     setShowLog]     = useState<Record<string, boolean>>({})
  const [configOpen,  setConfigOpen]  = useState(false)
  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  useEffect(() => {
    loadConfig()
    loadReleases()
    return () => { Object.values(pollRef.current).forEach(clearInterval) }
  }, [])

  async function loadConfig() {
    try {
      const res  = await api.get('/api/github/config')
      const data = res.data as GithubConfig
      setConfig(data)
      if (data.owner) setOwner(data.owner)
      if (data.repo)  setRepo(data.repo)
      setConfigOpen(!data.configured)
    } catch {}
  }

  async function loadReleases() {
    try {
      const res = await api.get('/api/github/releases')
      setReleases(res.data as ReleaseFile[])
    } catch {}
  }

  async function saveConfig() {
    if (!owner.trim() || !repo.trim()) {
      toast.error(isAr ? 'owner و repo مطلوبان' : 'owner and repo are required')
      return
    }
    if (!token.trim() && !config.tokenSet) {
      toast.error(isAr ? 'Token مطلوب' : 'Token is required')
      return
    }
    setSavingCfg(true)
    try {
      await api.post('/api/github/config', {
        token: token.trim() || '__keep__',
        owner: owner.trim(),
        repo:  repo.trim(),
      })
      toast.success(isAr ? 'تم حفظ إعدادات GitHub' : 'GitHub config saved')
      setToken('')
      setTestState('idle')
      await loadConfig()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error || (isAr ? 'فشل الحفظ' : 'Save failed'))
    } finally {
      setSavingCfg(false)
    }
  }

  async function testConnection() {
    setTestState('loading')
    setTestMsg('')
    try {
      const res = await api.post('/api/github/test')
      const d   = res.data as { user: string; repo: string; private: boolean }
      setTestState('ok')
      setTestMsg(`${d.user} / ${d.repo}${d.private ? ' 🔒' : ''}`)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setTestState('error')
      setTestMsg(err.response?.data?.error || 'Connection failed')
    }
  }

  function startPublish(releaseId: string) {
    setPublishing(prev => ({
      ...prev,
      [releaseId]: { publishId: '', state: { status: 'running', log: [isAr ? 'جاري البدء...' : 'Starting...'] } }
    }))
    setShowLog(prev => ({ ...prev, [releaseId]: true }))

    api.post(`/api/github/publish/${releaseId}`)
      .then(res => {
        const { publishId } = res.data as { publishId: string }
        setPublishing(prev => ({
          ...prev,
          [releaseId]: { publishId, state: { status: 'running', log: [isAr ? 'جاري البدء...' : 'Starting...'] } }
        }))

        const interval = setInterval(async () => {
          try {
            const sr  = await api.get(`/api/github/publish/${publishId}/status`)
            const st  = sr.data as PublishState
            setPublishing(prev => ({ ...prev, [releaseId]: { publishId, state: st } }))
            if (st.status !== 'running') {
              clearInterval(interval)
              delete pollRef.current[releaseId]
              if (st.status === 'done') toast.success(isAr ? '✅ تم النشر على GitHub' : '✅ Published to GitHub')
              else                      toast.error(isAr ? 'فشل النشر على GitHub' : 'GitHub publish failed')
            }
          } catch {}
        }, 2000)

        pollRef.current[releaseId] = interval
      })
      .catch((e: unknown) => {
        const err = e as { response?: { data?: { error?: string } } }
        const msg = err.response?.data?.error || 'فشل'
        setPublishing(prev => ({ ...prev, [releaseId]: { publishId: '', state: { status: 'error', log: [msg] } } }))
        toast.error(msg)
      })
  }

  const statusIcon = (st?: PublishState) => {
    if (!st) return null
    if (st.status === 'running')
      return <Loader2 size={12} className="animate-spin text-brand-blue flex-shrink-0" />
    if (st.status === 'done')
      return <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
    return <AlertCircle size={12} className="text-red-400 flex-shrink-0" />
  }

  const allAvailable = releases.filter(r => r.exists)

  return (
    <div className="space-y-4">

      {/* ── Config Panel ─────────────────────────────────────────────── */}
      <div className="bg-navy-900 rounded-lg border border-slate-700/40 overflow-hidden">
        <button
          onClick={() => setConfigOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2.5">
            <Github size={14} className="text-slate-400" />
            <span className="text-sm font-medium text-slate-200">
              {isAr ? 'إعدادات الاتصال' : 'Connection Settings'}
            </span>
            {config.configured && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                {isAr ? 'مُهيَّأ' : 'Configured'}
              </span>
            )}
          </div>
          {configOpen ? <ChevronUp size={13} className="text-slate-500" /> : <ChevronDown size={13} className="text-slate-500" />}
        </button>

        {configOpen && (
          <div className="px-4 pb-4 space-y-3 border-t border-slate-700/40">
            <div className="pt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5">
                  {isAr ? 'اسم المستخدم / المنظمة' : 'Username / Organization'}
                </label>
                <input
                  type="text"
                  value={owner}
                  onChange={e => { setOwner(e.target.value); setTestState('idle') }}
                  placeholder="your-username"
                  dir="ltr"
                  className="w-full bg-navy-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1.5">
                  {isAr ? 'اسم الـ Repository' : 'Repository Name'}
                </label>
                <input
                  type="text"
                  value={repo}
                  onChange={e => { setRepo(e.target.value); setTestState('idle') }}
                  placeholder="airemote"
                  dir="ltr"
                  className="w-full bg-navy-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-slate-500 mb-1.5">
                GitHub Personal Access Token
                <span className="mr-1 text-slate-600">
                  {isAr ? '(صلاحية repo)' : '(repo scope required)'}
                </span>
              </label>
              <div className="relative">
                <input
                  type={showToken ? 'text' : 'password'}
                  value={token}
                  onChange={e => { setToken(e.target.value); setTestState('idle') }}
                  placeholder={config.tokenSet ? (isAr ? '●●●●● (محفوظ — اتركه فارغاً للإبقاء)' : '●●●●● (saved — leave blank to keep)') : 'ghp_...'}
                  dir="ltr"
                  className="w-full bg-navy-800 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-brand-teal font-mono pe-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(s => !s)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                >
                  {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={saveConfig}
                disabled={savingCfg}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white transition-colors"
              >
                {savingCfg ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                {isAr ? 'حفظ' : 'Save'}
              </button>

              <button
                onClick={testConnection}
                disabled={testState === 'loading' || !config.configured}
                className={clsx(
                  'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-40',
                  testState === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : testState === 'error'
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'border-slate-600 text-slate-300 hover:border-brand-teal hover:text-brand-teal'
                )}
              >
                {testState === 'loading' ? <RefreshCw size={11} className="animate-spin" />
                  : testState === 'ok'   ? <Wifi size={11} />
                  : testState === 'error'? <WifiOff size={11} />
                  : <Wifi size={11} />}
                {isAr ? 'اختبار الاتصال' : 'Test Connection'}
              </button>

              {testMsg && testState !== 'loading' && (
                <span className={clsx('text-[11px]', testState === 'ok' ? 'text-emerald-400' : 'text-red-400')}>
                  {testMsg}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Releases List ─────────────────────────────────────────────── */}
      {!config.configured && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-700/20 rounded-lg px-3 py-2.5">
          <AlertCircle size={12} className="text-yellow-400 flex-shrink-0" />
          {isAr ? 'أضف إعدادات GitHub أولاً لتتمكن من نشر الإصدارات' : 'Configure GitHub first to publish releases'}
        </div>
      )}

      {config.configured && (
        <div className="space-y-2">
          {/* Publish All button */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-slate-500">
              {isAr
                ? `${allAvailable.length} ملفات متاحة للنشر`
                : `${allAvailable.length} files available`}
            </span>
            {allAvailable.length > 1 && (
              <button
                onClick={() => startPublish('all')}
                disabled={Object.values(publishing).some(p => p?.state.status === 'running')}
                className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-brand-teal/10 hover:bg-brand-teal/20 text-brand-teal border border-brand-teal/30 disabled:opacity-40 transition-colors"
              >
                <Upload size={11} />
                {isAr ? 'نشر الكل على GitHub' : 'Publish All to GitHub'}
              </button>
            )}
          </div>

          {releases.map(rel => {
            const pub = publishing[rel.id]
            const isRunning = pub?.state.status === 'running'
            const isDone    = pub?.state.status === 'done'
            const isError   = pub?.state.status === 'error'
            const logsOpen  = showLog[rel.id]

            return (
              <div
                key={rel.id}
                className={clsx(
                  'border rounded-lg overflow-hidden transition-colors',
                  rel.exists ? 'border-slate-700/40' : 'border-slate-700/20 opacity-50',
                  isDone && 'border-emerald-500/20',
                  isError && 'border-red-500/20'
                )}
              >
                <div className="flex items-center gap-3 px-3 py-2.5 bg-navy-900">
                  {/* Status dot */}
                  <div className={clsx(
                    'w-1.5 h-1.5 rounded-full flex-shrink-0',
                    !rel.exists ? 'bg-slate-700' : isDone ? 'bg-emerald-400' : isError ? 'bg-red-400' : isRunning ? 'bg-brand-blue animate-pulse' : 'bg-slate-600'
                  )} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{rel.label}</p>
                    <p className="text-[10px] text-slate-600 font-mono truncate">{rel.assetName}</p>
                  </div>

                  {/* Size */}
                  {rel.sizeMB && (
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{rel.sizeMB} MB</span>
                  )}
                  {!rel.exists && (
                    <span className="text-[10px] text-slate-600 flex-shrink-0">
                      {isAr ? 'غير مبني' : 'Not built'}
                    </span>
                  )}

                  {/* Status icon */}
                  {statusIcon(pub?.state)}

                  {/* Done URL */}
                  {isDone && pub?.state.url && (
                    <a
                      href={pub.state.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-brand-teal hover:text-brand-teal/80 flex items-center gap-1 flex-shrink-0"
                    >
                      <ExternalLink size={10} />
                      GitHub
                    </a>
                  )}

                  {/* Publish button */}
                  {rel.exists && (
                    <button
                      onClick={() => startPublish(rel.id)}
                      disabled={isRunning}
                      className={clsx(
                        'flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded border transition-colors flex-shrink-0',
                        isRunning
                          ? 'border-brand-blue/30 text-brand-blue cursor-not-allowed'
                          : isDone
                            ? 'border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60'
                            : 'border-slate-600 text-slate-400 hover:border-brand-blue hover:text-brand-blue'
                      )}
                    >
                      {isRunning
                        ? <><Loader2 size={10} className="animate-spin" />{isAr ? 'جاري الرفع...' : 'Uploading...'}</>
                        : isDone
                          ? <><RefreshCw size={10} />{isAr ? 'إعادة النشر' : 'Re-publish'}</>
                          : <><Upload size={10} />{isAr ? 'نشر' : 'Publish'}</>}
                    </button>
                  )}

                  {/* Toggle log */}
                  {pub && pub.state.log.length > 0 && (
                    <button
                      onClick={() => setShowLog(prev => ({ ...prev, [rel.id]: !prev[rel.id] }))}
                      className="text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0"
                    >
                      {logsOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  )}
                </div>

                {/* Log panel */}
                {logsOpen && pub && pub.state.log.length > 0 && (
                  <div className="bg-navy-900/80 border-t border-slate-700/30 px-3 py-2 max-h-40 overflow-y-auto">
                    {pub.state.log.map((line, i) => (
                      <p key={i} className={clsx(
                        'text-[10px] font-mono py-0.5 leading-relaxed',
                        line.startsWith('❌') ? 'text-red-400' : line.startsWith('✅') || line.startsWith('🎉') ? 'text-emerald-400' : 'text-slate-500'
                      )}>
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
