import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { clsx } from 'clsx'
import {
  Wifi, WifiOff, X, Maximize2, Minimize2, RotateCcw,
  Terminal as TermIcon, AlertTriangle, CheckCircle2
} from 'lucide-react'
import { useUIStore } from '../store/uiStore'
import '@xterm/xterm/css/xterm.css'

interface SSHConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

interface Props {
  config: SSHConfig | null
  deviceId?: string
  onClose?: () => void
}

// ── xterm themes ────────────────────────────────────────────────────────────
const DARK_THEME = {
  background:          '#0d1117',
  foreground:          '#e6edf3',
  cursor:              '#58a6ff',
  cursorAccent:        '#0d1117',
  selectionBackground: '#264f78',
  selectionForeground: '#ffffff',
  black:   '#21262d', red:     '#ff7b72', green:  '#3fb950', yellow:  '#d29922',
  blue:    '#58a6ff', magenta: '#bc8cff', cyan:   '#39c5cf', white:   '#b1bac4',
  brightBlack:   '#6e7681', brightRed:     '#ffa198', brightGreen:  '#56d364',
  brightYellow:  '#e3b341', brightBlue:    '#79c0ff', brightMagenta:'#d2a8ff',
  brightCyan:    '#56d4dd', brightWhite:   '#f0f6fc'
}

const LIGHT_THEME = {
  background:          '#ffffff',
  foreground:          '#1f2328',
  cursor:              '#0969da',
  cursorAccent:        '#ffffff',
  selectionBackground: '#add6ff',
  selectionForeground: '#000000',
  black:   '#24292f', red:     '#cf222e', green:  '#116329', yellow:  '#4d2d00',
  blue:    '#0550ae', magenta: '#8250df', cyan:   '#0e7490', white:   '#6e7781',
  brightBlack:   '#57606a', brightRed:     '#a40e26', brightGreen:  '#1a7f37',
  brightYellow:  '#633c01', brightBlue:    '#0969da', brightMagenta:'#6639ba',
  brightCyan:    '#1d7a8a', brightWhite:   '#24292f'
}

function getFreshToken(): string {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return ''
    return JSON.parse(stored)?.state?.token || ''
  } catch { return '' }
}

export function SSHTerminal({ config, deviceId, onClose }: Props) {
  const theme = useUIStore(s => s.theme)

  const termRef             = useRef<HTMLDivElement>(null)
  const termInstance        = useRef<Terminal | null>(null)
  const fitAddon            = useRef<FitAddon | null>(null)
  const wsRef               = useRef<WebSocket | null>(null)
  const connectingRef       = useRef(false)
  const configRef           = useRef<SSHConfig | null>(null)
  const dataDisposableRef   = useRef<{ dispose(): void } | null>(null)
  const resizeDisposableRef = useRef<{ dispose(): void } | null>(null)

  const [status,     setStatus]     = useState<'idle'|'connecting'|'connected'|'error'|'closed'>('idle')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  // ── Init xterm ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return

    const term = new Terminal({
      theme:        theme === 'light' ? LIGHT_THEME : DARK_THEME,
      fontFamily:   '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      fontSize:     13,
      lineHeight:   1.45,
      cursorBlink:  true,
      cursorStyle:  'block',
      scrollback:   8000,
      allowTransparency: true,
      convertEol:   true,
      rightClickSelectsWord: true,
    })

    const fit      = new FitAddon()
    const webLinks = new WebLinksAddon()
    term.loadAddon(fit)
    term.loadAddon(webLinks)
    term.open(termRef.current)
    fit.fit()

    termInstance.current = term
    fitAddon.current     = fit

    term.writeln('\x1b[1;34m  AiRemote SSH Terminal\x1b[0m')
    term.writeln('\x1b[2m  ────────────────────────────────\x1b[0m')

    const ro = new ResizeObserver(() => { try { fit.fit() } catch {} })
    ro.observe(termRef.current)

    return () => {
      ro.disconnect()
      dataDisposableRef.current?.dispose()
      resizeDisposableRef.current?.dispose()
      term.dispose()
      wsRef.current?.close()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Dynamic theme update (no re-mount) ───────────────────────────────────
  useEffect(() => {
    termInstance.current?.options.theme && (
      termInstance.current.options.theme = theme === 'light' ? LIGHT_THEME : DARK_THEME
    )
  }, [theme])

  // ── Connect ───────────────────────────────────────────────────────────────
  const connect = useCallback((cfg: SSHConfig) => {
    if (!termInstance.current) return
    if (connectingRef.current) return
    connectingRef.current = true

    dataDisposableRef.current?.dispose();   dataDisposableRef.current   = null
    resizeDisposableRef.current?.dispose(); resizeDisposableRef.current = null

    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }

    const term = termInstance.current
    setStatus('connecting')
    setErrorMsg('')
    term.writeln('\x1b[33m  → Connecting to ' + cfg.host + ':' + cfg.port + '...\x1b[0m')

    const token    = getFreshToken()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl    = `${protocol}//${window.location.host}/ssh${token ? `?token=${encodeURIComponent(token)}` : ''}`
    const ws       = new WebSocket(wsUrl)
    wsRef.current  = ws

    ws.onopen = () => {
      connectingRef.current = false
      const dim = fitAddon.current?.proposeDimensions()
      ws.send(JSON.stringify({
        type: 'ssh:connect',
        payload: { ...cfg, deviceId, rows: dim?.rows || 24, cols: dim?.cols || 80 }
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'ssh:connected') {
          setStatus('connected')
          term.writeln('\x1b[32m  ✓ Connected successfully!\x1b[0m\r\n')

          dataDisposableRef.current = term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'ssh:data', payload: { data: btoa(unescape(encodeURIComponent(data))) } }))
          })

          resizeDisposableRef.current = term.onResize(({ rows, cols }) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'ssh:resize', payload: { rows, cols } }))
          })

          fitAddon.current?.fit()
        }

        else if (msg.type === 'ssh:data') {
          term.write(Uint8Array.from(atob(msg.payload.data), c => c.charCodeAt(0)))
        }

        else if (msg.type === 'ssh:error') {
          setStatus('error')
          const errMsg: string = msg.payload.message || ''
          setErrorMsg(errMsg)
          term.writeln('\r\n\x1b[31m  ✗ Error: ' + errMsg + '\x1b[0m')
          if (errMsg.includes('offline') || errMsg.includes('not online'))
            term.writeln('\x1b[33m  ⚠ Agent offline — restart it and retry\x1b[0m')
          else if (errMsg.toLowerCase().includes('auth'))
            term.writeln('\x1b[33m  ⚠ Auth failed — check username/password\x1b[0m\r\n    Enable password auth: sudo nano /etc/ssh/sshd_config\r\n    PasswordAuthentication yes  →  sudo systemctl restart sshd\x1b[0m')
          else if (errMsg.toLowerCase().includes('refused') || errMsg.toLowerCase().includes('connect'))
            term.writeln('\x1b[33m  ⚠ Connection refused — verify SSH is running:\r\n      sudo systemctl status sshd\x1b[0m')
        }

        else if (msg.type === 'ssh:closed') {
          setStatus('closed')
          term.writeln('\r\n\x1b[2m  ─ Session ended ─\x1b[0m')
        }

      } catch {}
    }

    ws.onclose = (ev) => {
      connectingRef.current = false
      if (ev.code === 1006 && status !== 'connected') {
        setStatus('error')
        setErrorMsg('Session expired — please log in again')
        term.writeln('\r\n\x1b[31m  ✗ Session expired — log in again\x1b[0m')
      } else if (status === 'connected') {
        setStatus('closed')
        term.writeln('\r\n\x1b[2m  ─ Connection closed ─\x1b[0m')
      }
    }

    ws.onerror = () => { connectingRef.current = false }
  }, [deviceId])

  useEffect(() => {
    if (!config) return
    const prev = configRef.current
    const same = prev &&
      prev.host     === config.host     &&
      prev.port     === config.port     &&
      prev.username === config.username &&
      prev.password === config.password &&
      prev.privateKey === config.privateKey
    if (same) return
    configRef.current = config
    connect(config)
  }, [config, connect])

  function disconnect() {
    wsRef.current?.send(JSON.stringify({ type: 'ssh:disconnect', payload: {} }))
    wsRef.current?.close()
    setStatus('closed')
  }

  function retry() {
    if (configRef.current) { connectingRef.current = false; connect(configRef.current) }
  }

  // ── Status badge ──────────────────────────────────────────────────────────
  const statusBadge = {
    idle:       { icon: <WifiOff size={10} />, label: 'Disconnected', cls: 'text-slate-500 bg-slate-700/40 border-slate-700/50' },
    connecting: { icon: <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />, label: 'Connecting…', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/25' },
    connected:  { icon: <Wifi size={10} />, label: 'Connected',    cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/25' },
    error:      { icon: <AlertTriangle size={10} />, label: 'Error', cls: 'text-red-400 bg-red-400/10 border-red-500/25' },
    closed:     { icon: <WifiOff size={10} />, label: 'Closed',     cls: 'text-slate-500 bg-slate-700/40 border-slate-700/50' },
  }[status]

  const isLight = theme === 'light'

  return (
    <div className={clsx(
      'flex flex-col rounded-xl overflow-hidden border border-slate-700/50 transition-colors',
      isLight ? 'bg-white' : 'bg-[#0d1117]',
      fullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'h-full'
    )}>

      {/* ── Title bar ──────────────────────────────────────────────────────── */}
      <div className={clsx(
        'flex items-center justify-between px-4 py-2.5 border-b border-slate-700/50 flex-shrink-0',
        'bg-navy-800'
      )}>
        <div className="flex items-center gap-2.5">
          {/* Traffic lights */}
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/75"    />
            <div className="w-3 h-3 rounded-full bg-yellow-400/75" />
            <div className="w-3 h-3 rounded-full bg-green-400/75"  />
          </div>
          <TermIcon size={12} className="text-brand-teal opacity-80" />
          <span className="text-xs text-slate-300 font-mono truncate max-w-[220px]" dir="ltr">
            {config ? `${config.username}@${config.host}:${config.port}` : 'SSH Terminal'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Status badge */}
          <span className={clsx(
            'inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium',
            statusBadge.cls
          )}>
            {statusBadge.icon}
            {statusBadge.label}
          </span>

          {/* Action buttons */}
          {(status === 'error' || status === 'closed') && (
            <button onClick={retry} title="Retry"
              className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-400/10 rounded-md transition-colors">
              <RotateCcw size={12} />
            </button>
          )}
          {status === 'connected' && (
            <button onClick={disconnect} title="Disconnect"
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors">
              <CheckCircle2 size={12} className="text-emerald-400" />
            </button>
          )}
          <button onClick={() => setFullscreen(f => !f)} title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 rounded-md transition-colors">
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>
          {onClose && (
            <button onClick={onClose} title="Close"
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Error banner ─────────────────────────────────────────────────── */}
      {status === 'error' && errorMsg && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-500/10 border-b border-red-500/20 flex-shrink-0">
          <span className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={12} className="flex-shrink-0" />
            {errorMsg}
          </span>
          <button onClick={retry}
            className="text-xs text-sky-400 hover:text-sky-300 hover:underline whitespace-nowrap flex-shrink-0">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Terminal canvas ─────────────────────────────────────────────────
          IMPORTANT: dir="ltr" is required — xterm.js uses a <canvas> element
          and is inherently LTR. Without this, RTL page direction breaks cursor
          positioning, backspace, and all keyboard input on Arabic/RTL pages.
      ─────────────────────────────────────────────────────────────────────── */}
      <div
        ref={termRef}
        dir="ltr"
        className={clsx(
          'flex-1 overflow-hidden',
          isLight ? 'p-2 bg-white' : 'p-2 bg-[#0d1117]'
        )}
        style={{ minHeight: 0 }}
      />
    </div>
  )
}
