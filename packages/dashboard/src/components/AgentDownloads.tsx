import { useEffect, useState } from 'react'
import { Download, Monitor, Terminal, Package, Loader, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '../lib/api'
import { clsx } from 'clsx'

interface Release {
  id: string
  label_ar: string
  label_en: string
  desc_ar: string
  desc_en: string
  filename: string
  platform: string
  icon: string
  size_hint: string
  size_bytes: number
  available: boolean
  version: string
  download_url: string
}

interface Props {
  isAr: boolean
}

function PlatformIcon({ platform, size = 16 }: { platform: string; size?: number }) {
  if (platform === 'windows') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 5.557L10.5 4.5v7.5H3V5.557zM11.5 4.357L21 3v9H11.5V4.357zM3 12.5h7.5V20L3 18.443V12.5zM11.5 12.5H21v9l-9.5-1.357V12.5z"/>
    </svg>
  )
  if (platform === 'linux') return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.5 2C9.46 2 7 4.46 7 7.5c0 1.74.81 3.29 2.08 4.32L8.5 13H7l-1.5 3h1l.5 1h10l.5-1h1L17 13h-1.5l-.58-1.18A5.44 5.44 0 0 0 17 7.5C17 4.46 14.54 2 11.5 2zm0 2a3.5 3.5 0 0 1 3.5 3.5A3.5 3.5 0 0 1 11.5 11 3.5 3.5 0 0 1 8 7.5 3.5 3.5 0 0 1 11.5 4zM9.5 19l.5 1h3l.5-1H9.5z"/>
    </svg>
  )
  if (platform === 'any') return <Terminal size={size} />
  return <Package size={size} />
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function AgentDownloads({ isAr }: Props) {
  const [releases, setReleases] = useState<Release[]>([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState<string | null>(null)
  const [version, setVersion] = useState('1.4.0')

  useEffect(() => {
    api.get('/api/downloads/list')
      .then(r => { setReleases(r.data.releases); setVersion(r.data.version) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleDownload(release: Release) {
    if (!release.available || downloading) return
    setDownloading(release.id)
    try {
      const res = await api.get(release.download_url, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = release.filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
    } finally {
      setDownloading(null)
    }
  }

  const platformOrder = ['windows', 'linux', 'any']
  const sorted = [...releases].sort((a, b) =>
    platformOrder.indexOf(a.platform) - platformOrder.indexOf(b.platform)
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          {isAr
            ? `نسخ الـ Agent المتاحة للتنزيل — الإصدار v${version}`
            : `Available Agent builds — release v${version}`}
        </p>
        <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-brand-blue/10 text-brand-blue border border-brand-blue/20">
          v{version}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-xs py-4">
          <Loader size={13} className="animate-spin" />
          {isAr ? 'جاري التحميل...' : 'Loading...'}
        </div>
      ) : (
        <div className="grid gap-2">
          {sorted.map(release => (
            <div
              key={release.id}
              className={clsx(
                'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
                release.available
                  ? 'border-slate-700/60 bg-navy-900/60 hover:border-slate-600'
                  : 'border-slate-800/40 bg-slate-800/10 opacity-60'
              )}
            >
              {/* Platform icon */}
              <div className={clsx(
                'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
                release.platform === 'windows' ? 'bg-blue-500/10 text-blue-400' :
                release.platform === 'linux'   ? 'bg-yellow-500/10 text-yellow-400' :
                                                  'bg-emerald-500/10 text-emerald-400'
              )}>
                <PlatformIcon platform={release.platform} size={16} />
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-200 truncate">
                    {isAr ? release.label_ar : release.label_en}
                  </span>
                  {release.available ? (
                    <CheckCircle size={12} className="text-emerald-400 flex-shrink-0" />
                  ) : (
                    <AlertCircle size={12} className="text-slate-600 flex-shrink-0" />
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-0.5 truncate">
                  {isAr ? release.desc_ar : release.desc_en}
                </p>
              </div>

              {/* Size */}
              <span className="text-xs text-slate-600 font-mono flex-shrink-0 hidden sm:block">
                {release.size_bytes > 0 ? formatBytes(release.size_bytes) : release.size_hint}
              </span>

              {/* Download button */}
              <button
                onClick={() => handleDownload(release)}
                disabled={!release.available || downloading === release.id}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0',
                  release.available
                    ? 'bg-brand-blue hover:bg-blue-500 text-white shadow-sm shadow-brand-blue/20 disabled:opacity-50'
                    : 'bg-slate-700/30 text-slate-600 cursor-not-allowed'
                )}
              >
                {downloading === release.id
                  ? <Loader size={12} className="animate-spin" />
                  : <Download size={12} />}
                {isAr
                  ? (release.available ? 'تنزيل' : 'غير متاح')
                  : (release.available ? 'Download' : 'N/A')}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      <p className="text-xs text-slate-700 pt-1">
        {isAr
          ? '💡 الـ EXE و Binary جاهزان للتشغيل مباشرة. Script يتطلب Node.js 18+'
          : '💡 EXE & Binary run without Node.js. Script requires Node.js 18+'}
      </p>
    </div>
  )
}
