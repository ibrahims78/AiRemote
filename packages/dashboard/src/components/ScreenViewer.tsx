import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Monitor, Maximize2, Minimize2, RefreshCw, Wifi, WifiOff,
  AlertTriangle, Loader2, Settings2, X
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'

interface Props {
  deviceId: string
  deviceName: string
}

type Status = 'connecting' | 'streaming' | 'error' | 'unavailable' | 'disconnected'

interface QualityPreset {
  label: string
  fps: number
  quality: number
}

const QUALITY_PRESETS: QualityPreset[] = [
  { label: 'أداء عالي', fps: 1,  quality: 40 },
  { label: 'متوسط',    fps: 3,  quality: 60 },
  { label: 'جودة عالية', fps: 5,  quality: 75 },
  { label: 'ممتاز',    fps: 10, quality: 85 },
]

export function ScreenViewer({ deviceId, deviceName }: Props) {
  const { token } = useAuthStore()
  const canvasRef   = useRef<HTMLCanvasElement>(null)
  const wsRef       = useRef<WebSocket | null>(null)
  const imgRef      = useRef<HTMLImageElement>(new Image())
  const containerRef = useRef<HTMLDivElement>(null)

  const [status,       setStatus]       = useState<Status>('connecting')
  const [errorMsg,     setErrorMsg]     = useState('')
  const [fps,          setFps]          = useState(0)
  const [frameCount,   setFrameCount]   = useState(0)
  const [fullscreen,   setFullscreen]   = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [preset,       setPreset]       = useState<QualityPreset>(QUALITY_PRESETS[2])
  const [resolution,   setResolution]   = useState({ w: 0, h: 0 })

  const fpsCountRef  = useRef(0)
  const fpsTimerRef  = useRef<NodeJS.Timeout | null>(null)
  const lastSeqRef   = useRef(-1)

  // ── FPS counter ──────────────────────────────────────────────────────────
  const startFpsCounter = useCallback(() => {
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
    }, 1000)
  }, [])

  // ── Draw frame on canvas ──────────────────────────────────────────────────
  const drawFrame = useCallback((base64: string, width: number, height: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Resize canvas if dimensions changed
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width  = width
      canvas.height = height
      setResolution({ w: width, h: height })
    }

    const img = imgRef.current
    img.onload = () => {
      ctx.drawImage(img, 0, 0)
      fpsCountRef.current++
      setFrameCount(c => c + 1)
    }
    img.src = `data:image/jpeg;base64,${base64}`
  }, [])

  // ── Connect WS ────────────────────────────────────────────────────────────
  const connect = useCallback((p: QualityPreset) => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    setStatus('connecting')
    setErrorMsg('')
    lastSeqRef.current = -1

    const protocol  = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params = new URLSearchParams({
      token:    token || '',
      deviceId,
      fps:      String(p.fps),
      quality:  String(p.quality)
    })
    const url = `${protocol}//${window.location.host}/screen?${params.toString()}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      console.log('[screen] WS connected')
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)

        if (msg.type === 'screen:frame') {
          if (status !== 'streaming') setStatus('streaming')
          startFpsCounter()
          const { data, width, height, seq } = msg.payload
          // Drop out-of-order frames
          if (seq <= lastSeqRef.current && seq !== 0) return
          lastSeqRef.current = seq
          drawFrame(data, width, height)

        } else if (msg.type === 'screen:error') {
          setStatus('error')
          setErrorMsg(msg.payload.message || 'Unknown error')

        } else if (msg.type === 'screen:unavailable') {
          setStatus('unavailable')
          setErrorMsg(msg.payload.message || 'Screen capture unavailable on this device')

        } else if (msg.type === 'screen:closed') {
          setStatus('disconnected')
        }
      } catch {}
    }

    ws.onclose = () => {
      if (status !== 'error' && status !== 'unavailable') {
        setStatus('disconnected')
      }
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current)
      setFps(0)
    }

    ws.onerror = () => {
      setStatus('error')
      setErrorMsg('WebSocket connection failed')
    }
  }, [deviceId, token, drawFrame, startFpsCounter, status])

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    connect(preset)
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current)
    }
  }, [])

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (fullscreen) {
      el.requestFullscreen?.()
    } else {
      if (document.fullscreenElement) document.exitFullscreen?.()
    }
  }, [fullscreen])

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Apply new quality preset ──────────────────────────────────────────────
  const applyPreset = (p: QualityPreset) => {
    setPreset(p)
    setShowSettings(false)
    connect(p)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-black rounded-xl overflow-hidden relative">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-navy-900/90 backdrop-blur border-b border-slate-700/50 z-10">
        <Monitor size={14} className="text-brand-blue" />
        <span className="text-sm font-medium text-slate-200">{deviceName}</span>

        {/* Status badge */}
        <span className={clsx(
          'inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full ms-auto',
          status === 'streaming'    && 'bg-emerald-400/15 text-emerald-400',
          status === 'connecting'   && 'bg-amber-400/15 text-amber-400',
          status === 'error'        && 'bg-red-400/15 text-red-400',
          status === 'unavailable'  && 'bg-orange-400/15 text-orange-400',
          status === 'disconnected' && 'bg-slate-600/50 text-slate-400',
        )}>
          {status === 'streaming'    && <><Wifi size={10} /> بث مباشر</>}
          {status === 'connecting'   && <><Loader2 size={10} className="animate-spin" /> جارٍ الاتصال...</>}
          {status === 'error'        && <><WifiOff size={10} /> خطأ</>}
          {status === 'unavailable'  && <><AlertTriangle size={10} /> غير متاح</>}
          {status === 'disconnected' && <><WifiOff size={10} /> منقطع</>}
        </span>

        {/* FPS */}
        {status === 'streaming' && (
          <span className="text-xs font-mono text-slate-400">
            {fps} fps · {resolution.w}×{resolution.h}
          </span>
        )}

        {/* Controls */}
        <div className="flex items-center gap-1">
          {/* Quality settings */}
          <div className="relative">
            <button
              onClick={() => setShowSettings(s => !s)}
              className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
              title="إعدادات الجودة"
            >
              <Settings2 size={14} />
            </button>
            {showSettings && (
              <div className="absolute top-full right-0 mt-1 bg-navy-800 border border-slate-700/50 rounded-lg shadow-xl z-20 min-w-[160px]">
                <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700/30">الجودة / السرعة</div>
                {QUALITY_PRESETS.map(p => (
                  <button
                    key={p.label}
                    onClick={() => applyPreset(p)}
                    className={clsx(
                      'w-full text-left px-3 py-2 text-xs hover:bg-slate-700/50 transition-colors flex items-center justify-between',
                      preset.label === p.label ? 'text-brand-blue' : 'text-slate-300'
                    )}
                  >
                    <span>{p.label}</span>
                    <span className="text-slate-500 font-mono">{p.fps}fps · q{p.quality}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reconnect */}
          <button
            onClick={() => connect(preset)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title="إعادة الاتصال"
          >
            <RefreshCw size={14} />
          </button>

          {/* Fullscreen */}
          <button
            onClick={() => setFullscreen(f => !f)}
            className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
          >
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* ── Canvas / Overlay ── */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden bg-slate-950">

        {/* Live canvas */}
        <canvas
          ref={canvasRef}
          className={clsx(
            'max-w-full max-h-full object-contain transition-opacity duration-300',
            status === 'streaming' ? 'opacity-100' : 'opacity-20'
          )}
          style={{ imageRendering: 'auto' }}
        />

        {/* Overlay for non-streaming states */}
        {status !== 'streaming' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center px-8">
            {status === 'connecting' && (
              <>
                <Loader2 size={40} className="text-brand-blue animate-spin" />
                <p className="text-slate-300 font-medium">جارٍ الاتصال بشاشة الجهاز...</p>
                <p className="text-slate-500 text-sm">{deviceName}</p>
              </>
            )}
            {status === 'error' && (
              <>
                <div className="w-14 h-14 rounded-full bg-red-400/10 flex items-center justify-center">
                  <AlertTriangle size={28} className="text-red-400" />
                </div>
                <p className="text-slate-200 font-medium">فشل الاتصال</p>
                <p className="text-slate-400 text-sm max-w-xs">{errorMsg}</p>
                <button
                  onClick={() => connect(preset)}
                  className="btn-primary text-sm px-4 py-2"
                >
                  <RefreshCw size={14} />
                  إعادة المحاولة
                </button>
              </>
            )}
            {status === 'unavailable' && (
              <>
                <div className="w-14 h-14 rounded-full bg-orange-400/10 flex items-center justify-center">
                  <Monitor size={28} className="text-orange-400" />
                </div>
                <p className="text-slate-200 font-medium">مشاركة الشاشة غير متاحة</p>
                <p className="text-slate-400 text-sm max-w-sm">{errorMsg}</p>
                <div className="text-xs text-slate-600 bg-slate-800/50 rounded-lg p-3 text-left max-w-sm font-mono">
                  <p className="text-slate-500 mb-1"># Linux — ثبّت أحد الأدوات:</p>
                  <p>sudo apt install scrot</p>
                  <p className="text-slate-500 mt-1"># أو:</p>
                  <p>sudo apt install imagemagick</p>
                </div>
              </>
            )}
            {status === 'disconnected' && (
              <>
                <div className="w-14 h-14 rounded-full bg-slate-700/50 flex items-center justify-center">
                  <WifiOff size={28} className="text-slate-500" />
                </div>
                <p className="text-slate-300 font-medium">انتهت جلسة المشاركة</p>
                <button
                  onClick={() => connect(preset)}
                  className="btn-primary text-sm px-4 py-2"
                >
                  <RefreshCw size={14} />
                  إعادة الاتصال
                </button>
              </>
            )}
          </div>
        )}

        {/* Frame counter (debug) — small badge bottom-left */}
        {status === 'streaming' && (
          <div className="absolute bottom-2 left-2 text-[10px] text-slate-600 font-mono bg-black/30 px-1.5 py-0.5 rounded">
            frame #{frameCount}
          </div>
        )}
      </div>
    </div>
  )
}
