import { useEffect, useState, useCallback, useRef } from 'react'
import { Download, Terminal, Package, Loader, CheckCircle, AlertCircle, Hammer, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'

function getStoredToken(): string | null {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return null
    return JSON.parse(stored)?.state?.token ?? null
  } catch { return null }
}

// ── Types ──────────────────────────────────────────────────────────────────
type BuildStatus = 'idle' | 'building' | 'done' | 'error'

interface Release {
  id:           string
  label_ar:     string
  label_en:     string
  desc_ar:      string
  desc_en:      string
  badge_ar:     string | null
  badge_en:     string | null
  filename:     string
  platform:     'windows' | 'linux' | 'any'
  size_hint:    string
  size_bytes:   number
  available:    boolean
  buildable:    boolean
  build_status: BuildStatus
  version:      string
  download_url: string
  build_url:    string | null
  status_url:   string | null
}

interface BuildState {
  status:     BuildStatus
  log:        string[]
  available:  boolean
}

interface Props { isAr: boolean }

// ── Icons ──────────────────────────────────────────────────────────────────
function WinIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.557L10.5 4.5v7.5H3V5.557zM11.5 4.357L21 3v9H11.5V4.357zM3 12.5h7.5V20L3 18.443V12.5zM11.5 12.5H21v9l-9.5-1.357V12.5z"/>
    </svg>
  )
}

function LinuxIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.5 2C9.46 2 7 4.46 7 7.5c0 1.74.81 3.29 2.08 4.32L8.5 13H7l-1.5 3h1l.5 1h10l.5-1h1L17 13h-1.5l-.58-1.18A5.44 5.44 0 0 0 17 7.5C17 4.46 14.54 2 11.5 2zm0 2a3.5 3.5 0 0 1 3.5 3.5A3.5 3.5 0 0 1 11.5 11 3.5 3.5 0 0 1 8 7.5 3.5 3.5 0 0 1 11.5 4zM9.5 19l.5 1h3l.5-1H9.5z"/>
    </svg>
  )
}

function PlatformIcon({ platform, size = 15 }: { platform: string; size?: number }) {
  if (platform === 'windows') return <WinIcon size={size} />
  if (platform === 'linux')   return <LinuxIcon size={size} />
  return <Terminal size={size} />
}

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024)        return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const BUILD_STATUS_POLL_MS = 2500

// ── Main Component ─────────────────────────────────────────────────────────
export function AgentDownloads({ isAr }: Props) {
  const [releases,    setReleases]    = useState<Release[]>([])
  const [loading,     setLoading]     = useState(true)
  const [version,     setVersion]     = useState('3.1.0')
  const [downloading] = useState<string | null>(null)
  const [buildStates, setBuildStates] = useState<Record<string, BuildState>>({})
  const [expanded,    setExpanded]    = useState<Record<string, boolean>>({})
  const pollRef = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  // ── Fetch release list ──────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    try {
      const r = await api.get('/api/downloads/list')
      setReleases(r.data.releases)
      setVersion(r.data.version)
      // Sync any "building" statuses from server
      r.data.releases.forEach((rel: Release) => {
        if (rel.build_status === 'building') {
          startPolling(rel)
        }
      })
    } catch {}
  }, [])

  useEffect(() => {
    fetchList().finally(() => setLoading(false))
    return () => { Object.values(pollRef.current).forEach(clearInterval) }
  }, [fetchList])

  // ── Polling for build status ────────────────────────────────────────────
  function startPolling(release: Release) {
    if (!release.status_url || pollRef.current[release.id]) return
    pollRef.current[release.id] = setInterval(async () => {
      try {
        const r = await api.get(release.status_url!)
        const s: BuildState = r.data
        setBuildStates(prev => ({ ...prev, [release.id]: s }))
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(pollRef.current[release.id])
          delete pollRef.current[release.id]
          if (s.status === 'done') {
            // Refresh the release list so "available" updates
            await fetchList()
          }
        }
      } catch {}
    }, BUILD_STATUS_POLL_MS)
  }

  // ── Trigger build ───────────────────────────────────────────────────────
  async function handleBuild(release: Release) {
    if (!release.build_url) return
    const cur = buildStates[release.id]
    if (cur?.status === 'building') return

    setBuildStates(prev => ({ ...prev, [release.id]: { status: 'building', log: [], available: false } }))
    setExpanded(prev => ({ ...prev, [release.id]: true }))

    try {
      await api.post(release.build_url)
      startPolling(release)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      setBuildStates(prev => ({
        ...prev,
        [release.id]: {
          status: 'error',
          log: [`❌ ${err.response?.data?.error ?? 'Build request failed'}`],
          available: false,
        },
      }))
    }
  }

  // ── Download file — use a direct anchor so the browser handles the transfer
  // natively (shows OS download progress bar, no memory buffering).
  function handleDownload(release: Release) {
    const isAvail = buildStates[release.id]?.available ?? release.available
    if (!isAvail) return

    const token = getStoredToken()
    const url   = token
      ? `${release.download_url}?token=${encodeURIComponent(token)}`
      : release.download_url

    const a      = document.createElement('a')
    a.href        = url
    a.download    = release.filename
    a.target      = '_blank'
    a.rel         = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  // ── Sort: windows GUI first, then headless, then linux, then script ─────
  const ORDER = ['win-gui', 'win-exe', 'linux-bin', 'script-js', 'script-pkg']
  const sorted = [...releases].sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id))

  // ── Platform colors ─────────────────────────────────────────────────────
  const platformColors = {
    windows: 'bg-blue-500/10 text-blue-400',
    linux:   'bg-yellow-500/10 text-yellow-400',
    any:     'bg-emerald-500/10 text-emerald-400',
  }

  return (
    <div className="space-y-2.5">

      {/* Header row */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-slate-500">
          {isAr ? `نسخ الـ Agent — الإصدار v${version}` : `Agent builds — release v${version}`}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
            v{version}
          </span>
          <button
            onClick={fetchList}
            className="p-1 text-slate-600 hover:text-slate-300 transition-colors"
            title={isAr ? 'تحديث' : 'Refresh'}
          >
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
          <Loader size={13} className="animate-spin" />
          {isAr ? 'جاري التحميل...' : 'Loading...'}
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(release => {
            const bs      = buildStates[release.id]
            const bStatus = bs?.status ?? release.build_status ?? 'idle'
            const isBuilding = bStatus === 'building'
            const isExpanded = expanded[release.id]
            const buildLog   = bs?.log ?? []
            const isAvail    = bs?.available ?? release.available

            return (
              <div key={release.id} className={clsx(
                'rounded-xl border transition-all overflow-hidden',
                isAvail
                  ? 'border-slate-700/60 bg-navy-900/60'
                  : isBuilding
                    ? 'border-brand-blue/30 bg-brand-blue/5'
                    : 'border-slate-800/40 bg-slate-800/5'
              )}>
                {/* Main row */}
                <div className="flex items-center gap-3 px-4 py-3">

                  {/* Platform icon */}
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                    platformColors[release.platform] ?? platformColors.any
                  )}>
                    <PlatformIcon platform={release.platform} size={15} />
                  </div>

                  {/* Label + description */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={clsx(
                        'text-sm font-semibold truncate',
                        isAvail ? 'text-slate-100' : 'text-slate-400'
                      )}>
                        {isAr ? release.label_ar : release.label_en}
                      </span>

                      {/* Badge */}
                      {(isAr ? release.badge_ar : release.badge_en) && (
                        <span className={clsx(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-md border flex-shrink-0',
                          release.platform === 'windows' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                          release.platform === 'linux'   ? 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400' :
                                                           'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        )}>
                          {isAr ? release.badge_ar : release.badge_en}
                        </span>
                      )}

                      {/* Status icon */}
                      {isAvail && <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />}
                      {!isAvail && bStatus === 'error' && <AlertCircle size={12} className="text-red-400 flex-shrink-0" />}
                      {isBuilding && <Loader size={12} className="text-brand-blue animate-spin flex-shrink-0" />}
                    </div>

                    <p className="text-xs text-slate-500 mt-0.5 truncate">
                      {isAr ? release.desc_ar : release.desc_en}
                    </p>

                    {/* Build progress bar */}
                    {isBuilding && (
                      <div className="mt-1.5 h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-brand-blue rounded-full animate-pulse" style={{ width: '60%' }} />
                      </div>
                    )}
                  </div>

                  {/* Size */}
                  <span className="text-xs text-slate-600 font-mono flex-shrink-0 hidden sm:block">
                    {isAvail && release.size_bytes > 0
                      ? formatBytes(release.size_bytes)
                      : release.size_hint}
                  </span>

                  {/* Action buttons */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">

                    {/* Log toggle (when buildable and has logs) */}
                    {release.buildable && (buildLog.length > 0 || bStatus !== 'idle') && (
                      <button
                        onClick={() => setExpanded(p => ({ ...p, [release.id]: !isExpanded }))}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 transition-all"
                        title={isAr ? 'سجل البناء' : 'Build log'}
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    )}

                    {/* Build button — only shown when not available */}
                    {!isAvail && release.buildable && (
                      <button
                        onClick={() => handleBuild(release)}
                        disabled={isBuilding}
                        className={clsx(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                          isBuilding
                            ? 'bg-brand-blue/10 border border-brand-blue/30 text-brand-blue cursor-not-allowed'
                            : bStatus === 'error'
                              ? 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20'
                              : 'bg-slate-700/40 border border-slate-600 text-slate-300 hover:border-brand-blue hover:text-brand-blue'
                        )}
                      >
                        {isBuilding
                          ? <><Loader size={12} className="animate-spin" /> {isAr ? 'جاري البناء...' : 'Building...'}</>
                          : bStatus === 'error'
                            ? <><Hammer size={12} /> {isAr ? 'إعادة البناء' : 'Retry Build'}</>
                            : <><Hammer size={12} /> {isAr ? 'بناء الآن' : 'Build Now'}</>
                        }
                      </button>
                    )}

                    {/* Download button */}
                    <button
                      onClick={() => handleDownload(release)}
                      disabled={!isAvail || downloading === release.id}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                        isAvail
                          ? 'bg-brand-blue hover:bg-blue-500 text-white shadow-sm shadow-brand-blue/20 disabled:opacity-50'
                          : 'bg-slate-800/60 border border-slate-700/40 text-slate-600 cursor-not-allowed'
                      )}
                    >
                      {downloading === release.id
                        ? <Loader size={12} className="animate-spin" />
                        : <Download size={12} />}
                      {isAr
                        ? (isAvail ? 'تنزيل' : 'غير متاح')
                        : (isAvail ? 'Download' : 'N/A')}
                    </button>
                  </div>
                </div>

                {/* Build log panel */}
                {isExpanded && (buildLog.length > 0 || bStatus !== 'idle') && (
                  <div className="border-t border-slate-800/60 bg-slate-900/60 px-4 py-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
                        {isAr ? 'سجل البناء' : 'Build Log'}
                      </span>
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded font-medium',
                        bStatus === 'building' ? 'bg-brand-blue/15 text-brand-blue' :
                        bStatus === 'done'     ? 'bg-emerald-500/15 text-emerald-400' :
                        bStatus === 'error'    ? 'bg-red-500/15 text-red-400' :
                                                  'bg-slate-700/40 text-slate-500'
                      )}>
                        {bStatus === 'building' ? (isAr ? 'قيد التنفيذ' : 'Running') :
                         bStatus === 'done'     ? (isAr ? 'اكتمل' : 'Done') :
                         bStatus === 'error'    ? (isAr ? 'فشل' : 'Failed') : '—'}
                      </span>
                    </div>
                    <pre className="text-[10px] font-mono text-slate-400 max-h-40 overflow-y-auto whitespace-pre-wrap leading-relaxed bg-slate-950/60 rounded-lg p-2.5 border border-slate-800/40">
                      {buildLog.length > 0
                        ? buildLog.slice(-80).join('\n')
                        : (isAr ? 'جاري التهيئة...' : 'Initializing...')}
                    </pre>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer note */}
      <p className="text-xs text-slate-700 pt-1">
        {isAr
          ? '💡 GUI: تطبيق سطح المكتب مع System Tray. CLI: سطر أوامر بدون واجهة. Script: يحتاج Node.js 18+'
          : '💡 GUI: full desktop app with System Tray. CLI: headless terminal. Script: requires Node.js 18+'}
      </p>
    </div>
  )
}
