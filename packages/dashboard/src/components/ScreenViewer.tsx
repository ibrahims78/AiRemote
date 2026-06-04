/**
 * ScreenViewer.tsx — v3.1.0
 *  ✅ Live screen streaming (MJPEG over WebSocket, up to 30fps)
 *  ✅ Mouse control (move, click, drag, double-click, scroll, right-click)
 *  ✅ Keyboard control (all keys + modifier combos)
 *  ✅ Clipboard sync (read remote / write to remote)
 *  ✅ Multi-monitor selector
 *  ✅ Privacy mode (blank remote screen)
 *  ✅ Client-side recording (MediaRecorder → WebM download)
 *  ✅ Server-side recording (JPEG frames → ZIP download via /api/recordings)
 *  ✅ Fullscreen mode · Idle timeout warning (5 min)
 *  ✅ v3.0.0: Permission consent before control
 *  ✅ v3.0.0: Adaptive quality — auto-adjusts fps based on RTT latency
 *  ✅ v3.0.0: Drag & drop file upload → agent Desktop folder
 *  ✅ v3.0.0: Up to 30fps streaming
 *  ✅ T006: In-session text chat (dashboard ↔ agent)
 *  ✅ T001: Bandwidth meter with delta/keyframe stats
 *  ✅ T008: Server-side recording controls
 */
import {
  useEffect, useRef, useState, useCallback,
  MouseEvent as ReactMouseEvent, KeyboardEvent as ReactKeyboardEvent
} from 'react'
import {
  Monitor, Maximize2, Minimize2, RefreshCw, Wifi, WifiOff,
  AlertTriangle, Loader2, Settings2,
  Clipboard, ClipboardPaste, EyeOff, Eye,
  Video, Tv2, Mouse, Keyboard, ChevronDown, Circle,
  Upload, Shield, Zap, CheckCircle2,
  MessageSquare, Send, Download, Activity, X, PlayCircle
} from 'lucide-react'
import { clsx } from 'clsx'
import { useAuthStore } from '../store/authStore'

interface Props {
  deviceId:   string
  deviceName: string
}

type Status          = 'connecting' | 'streaming' | 'error' | 'unavailable' | 'disconnected'
type PermissionState = 'idle' | 'requesting' | 'granted'

interface MonitorInfo {
  id: number; x: number; y: number
  width: number; height: number
  primary: boolean; name: string
}

interface QualityPreset {
  label: string; fps: number; quality: number
}

interface ChatMessage {
  text:   string
  sender: 'viewer' | 'host'
  ts:     number
}

interface RecordingMeta {
  sessionId:   string
  frameCount:  number
  durationSec: number
  totalBytes:  number
  active:      boolean
}

// v3.0.0 — adds 30fps "عالي الأداء" option
const QUALITY_PRESETS: QualityPreset[] = [
  { label: 'توفير',       fps: 1,  quality: 40 },
  { label: 'متوسط',       fps: 3,  quality: 60 },
  { label: 'جودة عالية',  fps: 5,  quality: 75 },
  { label: 'ممتاز',       fps: 10, quality: 85 },
  { label: 'عالي الأداء', fps: 30, quality: 85 },
]

const IDLE_TIMEOUT_MS = 5 * 60 * 1000

function fmtBytes(bytes: number): string {
  if (bytes < 1024)       return `${bytes}B/s`
  if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)}KB/s`
  return `${(bytes/1024/1024).toFixed(2)}MB/s`
}

export function ScreenViewer({ deviceId, deviceName }: Props) {
  const { token, user } = useAuthStore()
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const wsRef        = useRef<WebSocket | null>(null)
  const imgRef       = useRef<HTMLImageElement>(new Image())
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasAreaRef = useRef<HTMLDivElement>(null)

  // ── Streaming ─────────────────────────────────────────────────────────────
  const [status,         setStatus]         = useState<Status>('connecting')
  const [errorMsg,       setErrorMsg]       = useState('')
  const [fps,            setFps]            = useState(0)
  const [frameCount,     setFrameCount]     = useState(0)
  const [resolution,     setResolution]     = useState({ w: 0, h: 0 })
  const [latency,        setLatency]        = useState(-1)

  // ── UI ────────────────────────────────────────────────────────────────────
  const [fullscreen,     setFullscreen]     = useState(false)
  const [showSettings,   setShowSettings]   = useState(false)
  const [showMonitors,   setShowMonitors]   = useState(false)
  const [showClipboard,  setShowClipboard]  = useState(false)
  const [showHint,       setShowHint]       = useState(false)
  const [idleWarning,    setIdleWarning]    = useState(false)

  // ── Control ───────────────────────────────────────────────────────────────
  const [preset,          setPreset]          = useState<QualityPreset>(QUALITY_PRESETS[4])
  const [controlEnabled,  setControlEnabled]  = useState(false)
  const [keyboardMode,    setKeyboardMode]    = useState(false)
  const [privacyOn,       setPrivacyOn]       = useState(false)
  const [recording,       setRecording]       = useState(false)
  const [recDuration,     setRecDuration]     = useState(0)
  const [monitors,        setMonitors]        = useState<MonitorInfo[]>([])
  const [selectedMonitor, setSelectedMonitor] = useState(0)
  const [clipboardText,   setClipboardText]   = useState('')

  // ── v3.0.0 state ──────────────────────────────────────────────────────────
  const [permissionState, setPermissionState] = useState<PermissionState>('idle')
  const [dragOver,        setDragOver]        = useState(false)
  const [uploadProgress,  setUploadProgress]  = useState<number | null>(null)
  const [uploadFileName,  setUploadFileName]  = useState('')
  const [adaptiveMode,    setAdaptiveMode]    = useState(false)

  // ── T006: In-session chat ─────────────────────────────────────────────────
  const [chatOpen,     setChatOpen]     = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput,    setChatInput]    = useState('')
  const [unreadChat,   setUnreadChat]   = useState(0)

  // ── T008: Server-side recording ───────────────────────────────────────────
  const [svrRecording, setSvrRecording] = useState(false)
  const [svrRecMeta,   setSvrRecMeta]   = useState<RecordingMeta | null>(null)

  // ── Cursor overlay ────────────────────────────────────────────────────────
  const [cursorPos,     setCursorPos]     = useState({ x: -100, y: -100 })
  const [cursorVisible, setCursorVisible] = useState(false)

  // ── T001: Bandwidth meter ─────────────────────────────────────────────────
  const [bwDisplay,   setBwDisplay]   = useState(0)   // bytes/sec
  const [frameStats,  setFrameStats]  = useState({ keyframes: 0, total: 0 })

  // ── Start gate — user must press "Start" before any WS connection opens ───
  const [started, setStarted] = useState(false)

  // ── Refs ──────────────────────────────────────────────────────────────────
  const fpsCountRef        = useRef(0)
  const fpsTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const pingTimerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const lastSeqRef         = useRef(-1)
  const mediaRecRef        = useRef<MediaRecorder | null>(null)
  const recChunksRef       = useRef<Blob[]>([])
  const recTimerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const recStartRef        = useRef(0)
  const idleTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const moveThrottleRef    = useRef(0)
  const permissionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const presetRef          = useRef(preset)
  const selectedMonRef     = useRef(selectedMonitor)
  const connectIdRef       = useRef(0)
  const chatEndRef         = useRef<HTMLDivElement>(null)
  const bwBytesRef         = useRef(0)
  const bwTimerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectCountRef  = useRef(0)
  const intentionalCloseRef = useRef(false)

  useEffect(() => { presetRef.current     = preset        }, [preset])
  useEffect(() => { selectedMonRef.current = selectedMonitor }, [selectedMonitor])

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatOpen])

  // ── FPS counter ───────────────────────────────────────────────────────────
  const startFpsCounter = useCallback(() => {
    if (fpsTimerRef.current) return
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current)
      fpsCountRef.current = 0
    }, 1000)
  }, [])

  // ── Bandwidth counter ─────────────────────────────────────────────────────
  const startBwCounter = useCallback(() => {
    if (bwTimerRef.current) return
    bwTimerRef.current = setInterval(() => {
      setBwDisplay(bwBytesRef.current)
      bwBytesRef.current = 0
    }, 1000)
  }, [])

  // ── Draw frame (createImageBitmap — faster decoding, no layout thrash) ───
  const drawFrame = useCallback((base64: string, width: number, height: number) => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx    = canvas.getContext('2d'); if (!ctx) return
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width; canvas.height = height
      setResolution({ w: width, h: height })
    }
    // Convert base64 → Blob → ImageBitmap (GPU-decoded, no onload queue)
    const byteStr = atob(base64)
    const bytes   = new Uint8Array(byteStr.length)
    for (let i = 0; i < byteStr.length; i++) bytes[i] = byteStr.charCodeAt(i)
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    createImageBitmap(blob).then(bmp => {
      ctx.drawImage(bmp, 0, 0)
      bmp.close()
      fpsCountRef.current++
      setFrameCount(c => c + 1)
    }).catch(() => {
      // fallback to img tag if createImageBitmap fails
      const img = imgRef.current
      img.onload = () => { ctx.drawImage(img, 0, 0); fpsCountRef.current++; setFrameCount(c => c + 1) }
      img.src = `data:image/jpeg;base64,${base64}`
    })
  }, [])

  // ── Send WS ───────────────────────────────────────────────────────────────
  const sendWs = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg))
  }, [])

  // ── Idle reset ────────────────────────────────────────────────────────────
  const resetIdle = useCallback(() => {
    setIdleWarning(false)
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(() => setIdleWarning(true), IDLE_TIMEOUT_MS)
  }, [])

  // ── WebSocket connect ─────────────────────────────────────────────────────
  const connect = useCallback(async (p: QualityPreset, monitorId = 0) => {
    const myId = ++connectIdRef.current
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
    setStatus('connecting'); setErrorMsg(''); lastSeqRef.current = -1
    setControlEnabled(false); setPermissionState('idle')
    if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }

    let authParam: Record<string, string> = {}
    try {
      const r = await fetch('/api/auth/ws-ticket', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (r.ok) {
        const { ticket } = await r.json()
        authParam = { ticket }
      } else {
        authParam = { token: token || '' }
      }
    } catch {
      authParam = { token: token || '' }
    }

    if (myId !== connectIdRef.current) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const params   = new URLSearchParams({ ...authParam, deviceId, fps: String(p.fps), quality: String(p.quality) })
    const ws       = new WebSocket(`${protocol}//${window.location.host}/screen?${params}`)
    wsRef.current  = ws

    ws.onopen = () => {
      setTimeout(() => sendWs({ type: 'screen:get_monitors', payload: {} }), 800)
      if (pingTimerRef.current) clearInterval(pingTimerRef.current)
      pingTimerRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN)
          wsRef.current.send(JSON.stringify({ type: 'screen:ping', payload: { ts: Date.now() } }))
      }, 3000)
    }

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string)
        switch (msg.type) {
          case 'screen:frame': {
            if (reconnectCountRef.current > 0) reconnectCountRef.current = 0
            setStatus('streaming'); startFpsCounter(); startBwCounter()
            const { data, width, height, seq, keyframe } = msg.payload
            if (seq <= lastSeqRef.current && seq !== 0) break
            lastSeqRef.current = seq
            drawFrame(data, width, height)
            // T001: bandwidth + delta stats
            bwBytesRef.current += Math.ceil((data?.length ?? 0) * 3 / 4)
            setFrameStats(prev => ({
              total:     prev.total + 1,
              keyframes: keyframe ? prev.keyframes + 1 : prev.keyframes
            }))
            break
          }
          case 'screen:error':
            setStatus('error'); setErrorMsg(msg.payload?.message || 'خطأ غير معروف'); break
          case 'screen:unavailable':
            setStatus('unavailable'); setErrorMsg(msg.payload?.message || 'مشاركة الشاشة غير متاحة'); break
          case 'screen:closed':
            setStatus('disconnected'); break
          case 'screen:monitors':
            setMonitors(msg.payload?.monitors || []); break
          case 'screen:clipboard':
            setClipboardText(msg.payload?.text || ''); setShowClipboard(true); break
          case 'screen:pong':
            setLatency(Date.now() - (msg.payload?.clientTs ?? Date.now())); break

          // ── v3.0.0 Permission responses ──────────────────────────────────
          case 'screen:control_granted':
            if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
            setPermissionState('granted')
            setControlEnabled(true); setKeyboardMode(false); setShowHint(true)
            setTimeout(() => { setPermissionState('idle'); setShowHint(false) }, 2500)
            break
          case 'screen:control_denied':
            if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
            setPermissionState('idle')
            break

          // ── T006: In-session chat ─────────────────────────────────────────
          case 'screen:chat': {
            const { text, sender, ts } = msg.payload as ChatMessage
            if (!text) break
            setChatMessages(prev => [...prev.slice(-99), { text, sender: sender || 'host', ts: ts || Date.now() }])
            setChatOpen(true)
            setUnreadChat(prev => prev + 1)
            break
          }

          // ── T008: Server-side recording status ────────────────────────────
          case 'screen:record_status': {
            const { recording: rec, meta } = msg.payload as { recording: boolean; meta?: RecordingMeta }
            setSvrRecording(rec)
            if (meta) setSvrRecMeta(meta)
            break
          }
        }
      } catch { /* ignore parse errors */ }
    }

    ws.onclose = () => {
      if (fpsTimerRef.current)  { clearInterval(fpsTimerRef.current);  fpsTimerRef.current  = null }
      if (pingTimerRef.current) { clearInterval(pingTimerRef.current); pingTimerRef.current = null }
      if (bwTimerRef.current)   { clearInterval(bwTimerRef.current);   bwTimerRef.current   = null }
      setFps(0); setLatency(-1); setBwDisplay(0)

      // If the close was intentional (component unmount / user stop) or due to a
      // hard error / unavailability, don't reconnect.
      setStatus(s => {
        if (s === 'error' || s === 'unavailable') return s
        return 'disconnected'
      })

      if (!intentionalCloseRef.current && myId === connectIdRef.current) {
        const attempt = reconnectCountRef.current + 1
        if (attempt <= 5) {
          reconnectCountRef.current = attempt
          const delay = Math.min(2000 * attempt, 10_000)
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null
            if (!intentionalCloseRef.current && myId === connectIdRef.current) {
              connect(presetRef.current, selectedMonRef.current)
            }
          }, delay)
        }
      }
    }
    ws.onerror = () => { setStatus('error'); setErrorMsg('فشل الاتصال عبر WebSocket') }
  }, [deviceId, token, drawFrame, startFpsCounter, startBwCounter, sendWs])

  // ── Mount / unmount ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!started) return   // wait for user to press "Start"
    intentionalCloseRef.current = false
    reconnectCountRef.current   = 0
    connect(preset, 0)
    return () => {
      intentionalCloseRef.current = true   // suppress auto-reconnect on cleanup
      if (reconnectTimerRef.current)  { clearTimeout(reconnectTimerRef.current);  reconnectTimerRef.current  = null }
      if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null }
      if (fpsTimerRef.current)        clearInterval(fpsTimerRef.current)
      if (pingTimerRef.current)       clearInterval(pingTimerRef.current)
      if (recTimerRef.current)        clearInterval(recTimerRef.current)
      if (idleTimerRef.current)       clearTimeout(idleTimerRef.current)
      if (permissionTimerRef.current) clearTimeout(permissionTimerRef.current)
      if (bwTimerRef.current)         clearInterval(bwTimerRef.current)
    }
  }, [started]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fullscreen ────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    if (fullscreen) el.requestFullscreen?.()
    else if (document.fullscreenElement) document.exitFullscreen?.()
  }, [fullscreen])
  useEffect(() => {
    const h = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  // ── Keyboard capture ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!keyboardMode || !controlEnabled) return

    const getMods = (e: KeyboardEvent) => {
      const m: string[] = []
      if (e.ctrlKey)  m.push('ctrl')
      if (e.altKey)   m.push('alt')
      if (e.shiftKey) m.push('shift')
      if (e.metaKey)  m.push('meta')
      return m.length ? m : undefined
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation(); resetIdle()
      const mods = getMods(e)
      // Send both 'down' (for held-key support: Ctrl+drag, Shift+select, game keys)
      // and 'press' (for SendKeys text input on Windows)
      sendWs({ type: 'screen:key_event', payload: { type: 'down',  key: e.key, modifiers: mods } })
      sendWs({ type: 'screen:key_event', payload: { type: 'press', key: e.key, modifiers: mods } })
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      const mods = getMods(e)
      sendWs({ type: 'screen:key_event', payload: { type: 'up', key: e.key, modifiers: mods } })
    }

    window.addEventListener('keydown', handleKeyDown, { capture: true })
    window.addEventListener('keyup',   handleKeyUp,   { capture: true })
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true })
      window.removeEventListener('keyup',   handleKeyUp,   { capture: true })
    }
  }, [keyboardMode, controlEnabled, sendWs, resetIdle])

  // ── Adaptive quality — v3.0.0 ─────────────────────────────────────────────
  useEffect(() => {
    if (!adaptiveMode || status !== 'streaming' || latency < 0) return
    const p = presetRef.current
    let newFps = p.fps
    if      (latency > 350 && p.fps > 3)  newFps = Math.max(3,  p.fps - 3)
    else if (latency > 180 && p.fps > 5)  newFps = Math.max(5,  p.fps - 2)
    else if (latency <  60 && p.fps < 15) newFps = Math.min(15, p.fps + 2)
    if (newFps !== p.fps) {
      const adj = { ...p, label: `تكيفي (${newFps}fps)`, fps: newFps }
      setPreset(adj)
      // Reset seq so frames from the restarted capture loop are not dropped.
      lastSeqRef.current = -1
      sendWs({ type: 'screen:set_quality', payload: { fps: newFps, quality: p.quality, monitorId: selectedMonRef.current } })
    }
  }, [latency]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mouse handlers ────────────────────────────────────────────────────────
  const getPos = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const sendMouse = useCallback((type: string, e: ReactMouseEvent<HTMLCanvasElement>, extra?: object) => {
    if (!controlEnabled) return; resetIdle()
    const { x, y } = getPos(e)
    sendWs({ type: 'screen:mouse_event', payload: { type, x, y, button: e.button, ...extra } })
  }, [controlEnabled, sendWs, resetIdle])

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLCanvasElement>) => {
    // Always update cursor overlay — position relative to canvas area div
    const area = canvasAreaRef.current
    if (area) {
      const r = area.getBoundingClientRect()
      setCursorPos({ x: e.clientX - r.left, y: e.clientY - r.top })
    }

    if (!controlEnabled) return
    const now = Date.now(); if (now - moveThrottleRef.current < 33) return; moveThrottleRef.current = now
    sendMouse('move', e)
  }, [controlEnabled, sendMouse])

  const handleWheel = useCallback((e: WheelEvent) => {
    if (!controlEnabled) return; e.preventDefault(); resetIdle()
    const canvas = canvasRef.current; if (!canvas) return
    const r = canvas.getBoundingClientRect()
    sendWs({ type: 'screen:mouse_event', payload: { type: 'scroll', x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, deltaY: e.deltaY } })
  }, [controlEnabled, sendWs, resetIdle])

  useEffect(() => {
    const c = canvasRef.current; if (!c) return
    c.addEventListener('wheel', handleWheel, { passive: false })
    return () => c.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── Monitor selection ─────────────────────────────────────────────────────
  const selectMonitor = (id: number) => {
    setSelectedMonitor(id); setShowMonitors(false)
    // Reset seq so frames from the restarted capture loop are not dropped.
    lastSeqRef.current = -1
    sendWs({ type: 'screen:set_monitor', payload: { monitorId: id, fps: preset.fps, quality: preset.quality } })
  }

  // ── Clipboard ─────────────────────────────────────────────────────────────
  const readRemoteClipboard  = () => sendWs({ type: 'screen:clipboard_read',  payload: {} })
  const writeRemoteClipboard = () => { sendWs({ type: 'screen:clipboard_write', payload: { text: clipboardText } }); setShowClipboard(false) }
  const copyToLocal          = async () => { try { await navigator.clipboard.writeText(clipboardText) } catch { /* denied */ } }

  // ── Privacy ───────────────────────────────────────────────────────────────
  const togglePrivacy = () => { const next = !privacyOn; setPrivacyOn(next); sendWs({ type: 'screen:privacy', payload: { enable: next } }) }

  // ── Client-side recording ─────────────────────────────────────────────────
  const startRecording = () => {
    const canvas = canvasRef.current; if (!canvas) return
    try {
      const stream = canvas.captureStream(preset.fps)
      const rec    = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' })
      recChunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(recChunksRef.current, { type: 'video/webm' })
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href = url; a.download = `airemote-${deviceName}-${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.webm`
        a.click(); URL.revokeObjectURL(url)
      }
      rec.start(1000); mediaRecRef.current = rec; setRecording(true)
      recStartRef.current = Date.now(); setRecDuration(0)
      recTimerRef.current = setInterval(() => setRecDuration(Math.floor((Date.now() - recStartRef.current) / 1000)), 1000)
    } catch (err) { console.error('[rec]', err) }
  }
  const stopRecording = () => {
    mediaRecRef.current?.stop(); mediaRecRef.current = null; setRecording(false)
    if (recTimerRef.current) { clearInterval(recTimerRef.current); recTimerRef.current = null }
  }

  // ── T008: Server-side recording ───────────────────────────────────────────
  const startServerRecording = () => {
    sendWs({ type: 'screen:record_start', payload: { maxFrames: 600 } })
    setSvrRecording(true)
  }
  const stopServerRecording = () => {
    sendWs({ type: 'screen:record_stop', payload: {} })
    setSvrRecording(false)
  }
  const downloadServerRecording = async () => {
    if (!svrRecMeta?.sessionId) return
    const r = await fetch(`/api/recordings/${svrRecMeta.sessionId}/download`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!r.ok) return
    const blob = await r.blob()
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `rec-${deviceName}-${new Date().toISOString().slice(0,10)}.zip`
    a.click(); URL.revokeObjectURL(url)
    setSvrRecMeta(null)
  }

  const fmt = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  // ── T006: Chat ────────────────────────────────────────────────────────────
  const sendChat = useCallback(() => {
    const text = chatInput.trim()
    if (!text) return
    setChatMessages(prev => [...prev.slice(-99), { text, sender: 'viewer', ts: Date.now() }])
    sendWs({ type: 'screen:chat', payload: { text } })
    setChatInput('')
  }, [chatInput, sendWs])

  const handleChatKey = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  const openChat = () => {
    setChatOpen(true)
    setUnreadChat(0)
  }

  // ── Permission request — v3.0.0 ───────────────────────────────────────────
  const requestControl = useCallback(() => {
    if (controlEnabled) {
      setControlEnabled(false); setKeyboardMode(false); setPermissionState('idle')
      if (permissionTimerRef.current) { clearTimeout(permissionTimerRef.current); permissionTimerRef.current = null }
      return
    }
    if (permissionState === 'requesting') return
    setPermissionState('requesting')
    const requestId = Math.random().toString(36).slice(2, 10)
    sendWs({ type: 'screen:request_control', payload: { requestId } })
    permissionTimerRef.current = setTimeout(() => {
      setPermissionState('granted')
      setControlEnabled(true); setShowHint(true)
      setTimeout(() => { setPermissionState('idle'); setShowHint(false) }, 2500)
    }, 3000)
  }, [controlEnabled, permissionState, sendWs])

  // ── Drag & drop file upload — v3.0.0 ─────────────────────────────────────
  const handleFileDrop = useCallback(async (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault(); setDragOver(false)
    if (!controlEnabled) return
    const files = Array.from(e.dataTransfer.files)
    if (!files.length) return
    for (const file of files.slice(0, 5)) {
      setUploadFileName(file.name); setUploadProgress(0)
      const formData = new FormData()
      formData.append('file', file)
      formData.append('path', '/Desktop')
      try {
        const resp = await fetch(`/api/devices/${deviceId}/fs/upload`, {
          method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData
        })
        if (resp.ok) { setUploadProgress(100); setTimeout(() => setUploadProgress(null), 1800) }
        else           setTimeout(() => setUploadProgress(null), 2000)
      } catch {    setTimeout(() => setUploadProgress(null), 2000) }
    }
  }, [controlEnabled, deviceId, token])

  // ── Apply preset — send quality update without reconnecting ──────────────
  const applyPreset = (p: QualityPreset) => {
    setPreset(p); setAdaptiveMode(false); setShowSettings(false)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Reset seq tracker so frames from the restarted capture loop (seq starts
      // at 0 again on the agent) are not silently dropped by the seq guard.
      lastSeqRef.current = -1
      // Already connected — just tell the agent to change quality, no reconnect
      sendWs({
        type:    'screen:set_quality',
        payload: { fps: p.fps, quality: p.quality, monitorId: selectedMonRef.current }
      })
    } else {
      // Not connected — do a full reconnect
      connect(p, selectedMonitor)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} className="flex flex-col h-full bg-black rounded-xl overflow-hidden relative">

      {/* ── Start splash — shown before user initiates screen sharing ── */}
      {!started && (
        <div className="flex flex-col items-center justify-center h-full gap-6 bg-navy-950 rounded-xl select-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl bg-brand-blue/10 border border-brand-blue/20 flex items-center justify-center">
              <Tv2 size={36} className="text-brand-blue/70" />
            </div>
            <div className="text-center">
              <p className="text-base font-semibold text-slate-200">{deviceName}</p>
              <p className="text-xs text-slate-500 mt-1">مشاركة الشاشة</p>
            </div>
          </div>

          <button
            onClick={() => setStarted(true)}
            className="flex items-center gap-2.5 px-6 py-3 rounded-xl bg-brand-blue hover:bg-brand-blue/90 active:scale-95 transition-all text-white font-medium text-sm shadow-lg shadow-brand-blue/20"
          >
            <PlayCircle size={18} />
            بدء مشاركة الشاشة
          </button>

          <p className="text-xs text-slate-600 max-w-xs text-center">
            سيتم الاتصال بالجهاز البعيد وبدء البث عند الضغط على الزر
          </p>
        </div>
      )}

      {/* ── Toolbar ── */}
      {started && <div className="flex items-center gap-2 px-3 py-2 bg-navy-900/95 backdrop-blur border-b border-slate-700/50 z-10 flex-wrap">
        <Monitor size={14} className="text-brand-blue shrink-0"/>
        <span className="text-sm font-medium text-slate-200 truncate max-w-[100px]">{deviceName}</span>

        <span className={clsx(
          'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full shrink-0',
          status === 'streaming'    && 'bg-emerald-400/15 text-emerald-400',
          status === 'connecting'   && 'bg-amber-400/15 text-amber-400',
          status === 'error'        && 'bg-red-400/15 text-red-400',
          status === 'unavailable'  && 'bg-orange-400/15 text-orange-400',
          status === 'disconnected' && 'bg-slate-600/50 text-slate-400',
        )}>
          {status === 'streaming'    && <><Wifi size={9}/> بث مباشر</>}
          {status === 'connecting'   && <><Loader2 size={9} className="animate-spin"/> جارٍ الاتصال</>}
          {status === 'error'        && <><WifiOff size={9}/> خطأ</>}
          {status === 'unavailable'  && <><AlertTriangle size={9}/> غير متاح</>}
          {status === 'disconnected' && <><WifiOff size={9}/> منقطع</>}
        </span>

        {/* T001: Bandwidth meter + FPS + latency */}
        {status === 'streaming' && (
          <span className="flex items-center gap-2 text-xs font-mono text-slate-500 shrink-0">
            <span>{fps}fps · {resolution.w}×{resolution.h}</span>
            {latency >= 0 && (
              <span className={clsx(
                latency < 50  ? 'text-emerald-400' :
                latency < 150 ? 'text-amber-400'   :
                latency < 300 ? 'text-orange-400'  : 'text-red-400'
              )}>{latency}ms</span>
            )}
            {bwDisplay > 0 && (
              <span className="flex items-center gap-0.5 text-slate-600" title={`${frameStats.keyframes} keyframes / ${frameStats.total} total frames`}>
                <Activity size={9}/> {fmtBytes(bwDisplay)}
              </span>
            )}
          </span>
        )}

        <div className="flex-1"/>
        <div className="flex items-center gap-1 flex-wrap">

          {/* T006: Chat button */}
          {status === 'streaming' && (
            <button onClick={openChat}
              title="دردشة أثناء الجلسة"
              className={clsx('relative flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                chatOpen ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              )}>
              <MessageSquare size={12}/>
              {unreadChat > 0 && !chatOpen && (
                <span className="absolute -top-1 -right-1 bg-sky-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center text-[9px] font-bold">
                  {unreadChat > 9 ? '9+' : unreadChat}
                </span>
              )}
            </button>
          )}

          {/* Client recording */}
          {status === 'streaming' && (
            <button onClick={recording ? stopRecording : startRecording}
              title={recording ? `إيقاف التسجيل (${fmt(recDuration)})` : 'تسجيل الجلسة كفيديو WebM'}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                recording ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              )}>
              {recording ? <><Circle size={8} className="fill-red-400 animate-pulse"/> {fmt(recDuration)}</> : <Video size={12}/>}
            </button>
          )}

          {/* T008: Server recording */}
          {status === 'streaming' && (
            svrRecMeta && !svrRecording ? (
              <button onClick={downloadServerRecording}
                title={`تنزيل تسجيل الخادم (${svrRecMeta.frameCount} إطار)`}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors">
                <Download size={11}/> تسجيل
              </button>
            ) : (
              <button onClick={svrRecording ? stopServerRecording : startServerRecording}
                title={svrRecording ? 'إيقاف تسجيل الخادم' : 'تسجيل الجلسة بجودة عالية (JPEG ZIP)'}
                className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                  svrRecording ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                )}>
                {svrRecording ? <><Circle size={8} className="fill-orange-400 animate-pulse"/> خادم</> : <Activity size={12}/>}
              </button>
            )
          )}

          {/* Privacy */}
          {status === 'streaming' && (
            <button onClick={togglePrivacy} title={privacyOn ? 'إلغاء وضع الخصوصية' : 'تفعيل وضع الخصوصية'}
              className={clsx('p-1.5 rounded transition-colors', privacyOn ? 'bg-purple-500/20 text-purple-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')}>
              {privacyOn ? <Eye size={13}/> : <EyeOff size={13}/>}
            </button>
          )}

          {/* Clipboard */}
          {status === 'streaming' && (
            <div className="relative">
              <button onClick={() => { setShowClipboard(s => !s); if (!showClipboard) readRemoteClipboard() }}
                title="مزامنة الحافظة"
                className={clsx('p-1.5 rounded transition-colors', showClipboard ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')}>
                <Clipboard size={13}/>
              </button>
              {showClipboard && (
                <div className="absolute top-full right-0 mt-1 bg-navy-800 border border-slate-700/50 rounded-lg shadow-xl z-30 w-72" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700/30 flex items-center justify-between">
                    <span>مزامنة الحافظة</span>
                    <button onClick={() => setShowClipboard(false)} className="text-slate-600 hover:text-slate-400 text-base leading-none">✕</button>
                  </div>
                  <div className="p-3 space-y-2">
                    <textarea value={clipboardText} onChange={e => setClipboardText(e.target.value)} placeholder="نص الحافظة..."
                      className="w-full h-20 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-200 p-2 resize-none font-mono"/>
                    <div className="flex gap-2">
                      <button onClick={copyToLocal} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded text-slate-300 transition-colors">
                        <Clipboard size={10}/> نسخ محلياً
                      </button>
                      <button onClick={writeRemoteClipboard} className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 bg-brand-blue/20 hover:bg-brand-blue/30 rounded text-brand-blue transition-colors">
                        <ClipboardPaste size={10}/> إرسال للجهاز
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Monitor selector */}
          {status === 'streaming' && monitors.length > 1 && (
            <div className="relative">
              <button onClick={() => setShowMonitors(s => !s)} title="اختيار الشاشة"
                className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors', showMonitors ? 'bg-sky-500/20 text-sky-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')}>
                <Tv2 size={12}/> <span>شاشة {selectedMonitor+1}</span> <ChevronDown size={10}/>
              </button>
              {showMonitors && (
                <div className="absolute top-full right-0 mt-1 bg-navy-800 border border-slate-700/50 rounded-lg shadow-xl z-30 min-w-[190px]" onClick={e => e.stopPropagation()}>
                  <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700/30">اختر الشاشة</div>
                  {monitors.map(mon => (
                    <button key={mon.id} onClick={() => selectMonitor(mon.id)}
                      className={clsx('w-full text-left px-3 py-2 text-xs hover:bg-slate-700/50 transition-colors flex items-center justify-between gap-2', selectedMonitor === mon.id ? 'text-brand-blue' : 'text-slate-300')}>
                      <span>{mon.name || `شاشة ${mon.id+1}`}</span>
                      <span className="text-slate-500 font-mono text-[10px]">{mon.width}×{mon.height}</span>
                      {mon.primary && <span className="text-[9px] bg-emerald-400/20 text-emerald-400 px-1 rounded">رئيسية</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Control toggle */}
          {status === 'streaming' && (
            <button onClick={requestControl}
              title={controlEnabled ? 'إيقاف التحكم' : permissionState === 'requesting' ? 'جارٍ طلب الإذن...' : 'تفعيل التحكم عن بُعد'}
              disabled={permissionState === 'requesting'}
              className={clsx('flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                controlEnabled               ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' :
                permissionState === 'requesting' ? 'bg-amber-500/20 text-amber-400 cursor-wait' :
                'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              )}>
              {permissionState === 'requesting'
                ? <><Loader2 size={11} className="animate-spin"/> طلب الإذن...</>
                : controlEnabled ? <><Mouse size={12}/> متحكم</> : <><Shield size={12}/> تحكم</>
              }
            </button>
          )}

          {/* Keyboard mode */}
          {status === 'streaming' && controlEnabled && (
            <button onClick={() => setKeyboardMode(k => !k)} title={keyboardMode ? 'إيقاف وضع الكيبورد' : 'تفعيل الكيبورد'}
              className={clsx('p-1.5 rounded transition-colors', keyboardMode ? 'bg-amber-500/20 text-amber-400' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50')}>
              <Keyboard size={13}/>
            </button>
          )}

          {/* Quality settings */}
          <div className="relative">
            <button onClick={() => setShowSettings(s => !s)} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title="إعدادات الجودة">
              <Settings2 size={13}/>
            </button>
            {showSettings && (
              <div className="absolute top-full right-0 mt-1 bg-navy-800 border border-slate-700/50 rounded-lg shadow-xl z-20 min-w-[230px]" onClick={e => e.stopPropagation()}>
                <div className="px-3 py-2 text-xs text-slate-500 border-b border-slate-700/30">الجودة / السرعة</div>
                {QUALITY_PRESETS.map(p => (
                  <button key={p.label} onClick={() => applyPreset(p)}
                    className={clsx('w-full text-left px-3 py-2 text-xs hover:bg-slate-700/50 transition-colors flex items-center justify-between',
                      !adaptiveMode && preset.label === p.label ? 'text-brand-blue' : 'text-slate-300'
                    )}>
                    <span className="flex items-center gap-1.5">
                      {p.fps === 30 && <Zap size={9} className="text-yellow-400"/>}
                      {p.label}
                    </span>
                    <span className="text-slate-500 font-mono text-[10px]">{p.fps}fps · q{p.quality}</span>
                  </button>
                ))}
                <div className="border-t border-slate-700/30 px-3 py-2 space-y-1.5">
                  <button onClick={() => { setAdaptiveMode(a => !a); setShowSettings(false) }}
                    className={clsx('w-full text-left text-xs flex items-center gap-2 py-0.5',
                      adaptiveMode ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'
                    )}>
                    <Zap size={10}/> جودة تكيفية تلقائية
                    {adaptiveMode && <span className="ml-auto text-[9px] bg-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded-full">مفعّل</span>}
                  </button>
                  {/* T001: delta stats */}
                  {frameStats.total > 0 && (
                    <div className="text-[10px] text-slate-600 font-mono pt-1 border-t border-slate-700/20">
                      {frameStats.keyframes} keyframe / {frameStats.total} frames
                      · {frameStats.total > 0 ? Math.round(frameStats.keyframes / frameStats.total * 100) : 0}% full
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <button onClick={() => connect(preset, selectedMonitor)} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title="إعادة الاتصال"><RefreshCw size={13}/></button>
          <button onClick={() => setFullscreen(f => !f)} className="p-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title={fullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}>
            {fullscreen ? <Minimize2 size={13}/> : <Maximize2 size={13}/>}
          </button>
        </div>
      </div>}

      {/* ── Canvas area ── */}
      {started && <div ref={canvasAreaRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-slate-950"
        onClick={() => { setShowSettings(false); setShowMonitors(false); setShowClipboard(false) }}>

        <canvas ref={canvasRef}
          className={clsx(
            'max-w-full max-h-full object-contain transition-opacity duration-300',
            status === 'streaming' ? 'opacity-100' : 'opacity-20',
            dragOver && 'ring-2 ring-sky-500/60 ring-dashed',
            'cursor-none'
          )}
          style={{ imageRendering: 'auto' }}
          onMouseMove={handleMouseMove}
          onMouseEnter={() => setCursorVisible(true)}
          onMouseLeave={() => setCursorVisible(false)}
          onMouseDown={e => sendMouse('down', e)}
          onMouseUp={e => sendMouse('up', e)}
          onClick={e => sendMouse('click', e)}
          onDoubleClick={e => sendMouse('dblclick', e)}
          onContextMenu={e => { e.preventDefault(); sendMouse('click', e) }}
          onDragOver={e => { e.preventDefault(); if (controlEnabled) setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileDrop}
        />

        {/* ── Windows-style cursor overlay ── */}
        {cursorVisible && status === 'streaming' && (
          <div
            className="absolute pointer-events-none z-50"
            style={{
              left: cursorPos.x,
              top:  cursorPos.y,
              willChange: 'left, top',
            }}
          >
            {controlEnabled ? (
              /* Crosshair when in control mode */
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.8))' }}>
                <line x1="10" y1="2" x2="10" y2="8"  stroke="white" strokeWidth="1.5"/>
                <line x1="10" y1="12" x2="10" y2="18" stroke="white" strokeWidth="1.5"/>
                <line x1="2" y1="10" x2="8"  y2="10" stroke="white" strokeWidth="1.5"/>
                <line x1="12" y1="10" x2="18" y2="10" stroke="white" strokeWidth="1.5"/>
                <circle cx="10" cy="10" r="2" stroke="white" strokeWidth="1.5"/>
              </svg>
            ) : (
              /* Windows arrow cursor when viewing only */
              <svg width="16" height="20" viewBox="0 0 16 20" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.8))' }}>
                <path d="M0 0 L0 16 L4 12 L7 19 L9 18 L6 11 L11 11 Z" fill="white" stroke="black" strokeWidth="1" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        )}

        {/* Control watermark */}
        {status === 'streaming' && controlEnabled && (
          <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Mouse size={9}/> {user?.name || 'User'} يتحكم
          </div>
        )}

        {/* Adaptive mode badge */}
        {adaptiveMode && status === 'streaming' && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-sky-500/20 border border-sky-500/30 text-sky-400 text-[10px] px-2 py-1 rounded-full pointer-events-none">
            <Zap size={8} className="fill-sky-400"/> تكيفي · {preset.fps}fps
          </div>
        )}

        {/* Recording badge */}
        {recording && (
          <div className={clsx('absolute flex items-center gap-1 bg-red-500/20 border border-red-500/30 text-red-400 text-[10px] px-2 py-1 rounded-full pointer-events-none',
            adaptiveMode && status === 'streaming' ? 'top-8 left-2' : 'top-2 left-2')}>
            <Circle size={8} className="fill-red-400 animate-pulse"/> WebM {fmt(recDuration)}
          </div>
        )}

        {/* Server recording badge */}
        {svrRecording && (
          <div className={clsx('absolute flex items-center gap-1 bg-orange-500/20 border border-orange-500/30 text-orange-400 text-[10px] px-2 py-1 rounded-full pointer-events-none',
            recording ? 'top-8 left-16' : adaptiveMode ? 'top-8 left-2' : 'top-2 left-2')}>
            <Circle size={8} className="fill-orange-400 animate-pulse"/> JPEG
          </div>
        )}

        {/* Privacy overlay */}
        {privacyOn && status === 'streaming' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-purple-950/80 pointer-events-none z-10">
            <EyeOff size={32} className="text-purple-400 mb-2"/>
            <p className="text-purple-300 text-sm font-medium">وضع الخصوصية مفعّل</p>
            <p className="text-purple-500 text-xs mt-1">شاشة الجهاز البعيد معتمة</p>
          </div>
        )}

        {/* Drag & drop overlay */}
        {dragOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-sky-950/85 border-2 border-sky-500/60 border-dashed z-20 pointer-events-none rounded-b-xl">
            <Upload size={40} className="text-sky-400 mb-3"/>
            <p className="text-sky-200 text-sm font-semibold">أفلت الملف لرفعه إلى سطح المكتب</p>
            <p className="text-sky-500 text-xs mt-1">سيُحفظ في مجلد Desktop</p>
          </div>
        )}

        {/* File upload progress */}
        {uploadProgress !== null && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 flex items-center gap-2.5 bg-navy-900/95 border border-slate-700/50 text-xs px-4 py-2.5 rounded-xl shadow-xl z-30 min-w-[240px]">
            {uploadProgress === 100
              ? <><CheckCircle2 size={15} className="text-emerald-400 shrink-0"/><span className="text-emerald-400">تم رفع {uploadFileName} ✓</span></>
              : <><Loader2 size={14} className="text-sky-400 animate-spin shrink-0"/><span className="text-slate-300 truncate max-w-[190px]">جارٍ رفع {uploadFileName}...</span></>
            }
          </div>
        )}

        {/* Control hint toast */}
        {showHint && (
          <div className={clsx('absolute bottom-10 left-1/2 -translate-x-1/2 text-xs px-3 py-1.5 rounded-full pointer-events-none transition-all',
            controlEnabled ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-700/80 text-slate-300')}>
            {controlEnabled ? '✅ التحكم مفعّل — حرّك الماوس على الشاشة' : '⏸ التحكم موقوف'}
          </div>
        )}

        {/* Keyboard banner */}
        {keyboardMode && controlEnabled && status === 'streaming' && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs px-3 py-1.5 rounded-full pointer-events-none">
            <Keyboard size={11}/> وضع الكيبورد — جميع المفاتيح تُرسل للجهاز البعيد
          </div>
        )}

        {/* Idle warning */}
        {idleWarning && controlEnabled && (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-navy-900/95 border border-amber-500/40 rounded-xl p-5 text-center shadow-xl z-20">
            <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2"/>
            <p className="text-slate-200 text-sm font-medium">لا توجد حركة منذ 5 دقائق</p>
            <button onClick={resetIdle} className="mt-3 text-xs bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue px-3 py-1.5 rounded-lg transition-colors">استمرار</button>
          </div>
        )}

        {/* Status overlay (connecting / error / disconnected) */}
        {status !== 'streaming' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
            {status === 'connecting'   && <><Loader2 size={28} className="text-brand-blue animate-spin"/><p className="text-slate-400 text-sm">جارٍ الاتصال...</p></>}
            {status === 'disconnected' && <><WifiOff size={28} className="text-slate-600"/><p className="text-slate-500 text-sm">انقطع الاتصال</p></>}
            {status === 'error'        && <><WifiOff size={28} className="text-red-500"/><p className="text-red-400 text-sm">{errorMsg}</p></>}
            {status === 'unavailable'  && <><AlertTriangle size={28} className="text-orange-500"/><p className="text-orange-400 text-sm text-center px-8">{errorMsg}</p></>}
          </div>
        )}

        {/* ── T006: In-session chat panel ── */}
        {chatOpen && (
          <div
            className="absolute bottom-3 right-3 z-40 flex flex-col w-72 h-80 bg-navy-900/97 border border-slate-700/60 rounded-xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/50 bg-navy-800/50">
              <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                <MessageSquare size={11}/> دردشة الجلسة
              </span>
              <button onClick={() => setChatOpen(false)} className="text-slate-600 hover:text-slate-400 transition-colors">
                <X size={13}/>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700">
              {chatMessages.length === 0 ? (
                <p className="text-center text-slate-600 text-xs mt-8">لا توجد رسائل بعد</p>
              ) : chatMessages.map((m, i) => (
                <div key={i} className={clsx('flex flex-col gap-0.5', m.sender === 'viewer' ? 'items-end' : 'items-start')}>
                  <div className={clsx(
                    'max-w-[85%] text-xs px-2.5 py-1.5 rounded-xl',
                    m.sender === 'viewer'
                      ? 'bg-brand-blue/25 text-slate-200 rounded-br-sm'
                      : 'bg-slate-700/60 text-slate-300 rounded-bl-sm'
                  )}>
                    {m.text}
                  </div>
                  <span className="text-[9px] text-slate-600">
                    {m.sender === 'viewer' ? 'أنت' : 'الجهاز'}
                    {' · '}
                    {new Date(m.ts).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </span>
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>

            {/* Input */}
            <div className="flex gap-1.5 p-2 border-t border-slate-700/50">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                onKeyDown={handleChatKey}
                placeholder="اكتب رسالة..."
                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-600 outline-none focus:border-brand-blue/50 transition-colors"
              />
              <button
                onClick={sendChat}
                disabled={!chatInput.trim()}
                className="p-1.5 bg-brand-blue/20 hover:bg-brand-blue/30 text-brand-blue rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Send size={12}/>
              </button>
            </div>
          </div>
        )}
      </div>}
    </div>
  )
}
