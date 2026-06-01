import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { clsx } from 'clsx'
import { Wifi, WifiOff, X, Maximize2, Minimize2, RotateCcw, ChevronDown, AlertTriangle } from 'lucide-react'
import { useUIStore } from '../store/uiStore'
import '@xterm/xterm/css/xterm.css'

const DARK_THEME = {
  background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff',
  cursorAccent: '#0d1117', selectionBackground: '#264f78', selectionForeground: '#ffffff',
  black: '#21262d', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
  blue: '#58a6ff', magenta: '#bc8cff', cyan: '#39c5cf', white: '#b1bac4',
  brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364',
  brightYellow: '#e3b341', brightBlue: '#79c0ff', brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd', brightWhite: '#f0f6fc'
}

const LIGHT_THEME = {
  background: '#ffffff', foreground: '#1f2328', cursor: '#0969da',
  cursorAccent: '#ffffff', selectionBackground: '#add6ff', selectionForeground: '#000000',
  black: '#24292f', red: '#cf222e', green: '#116329', yellow: '#4d2d00',
  blue: '#0550ae', magenta: '#8250df', cyan: '#0e7490', white: '#6e7781',
  brightBlack: '#57606a', brightRed: '#a40e26', brightGreen: '#1a7f37',
  brightYellow: '#633c01', brightBlue: '#0969da', brightMagenta: '#6639ba',
  brightCyan: '#1d7a8a', brightWhite: '#24292f'
}

interface Props {
  deviceId: string
  deviceName?: string
  onClose?: () => void
}

type Status = 'idle' | 'connecting' | 'connected' | 'error' | 'closed'
type ShellHint = 'auto' | 'powershell' | 'cmd' | 'bash' | 'sh' | 'zsh'

const SHELLS: { value: ShellHint; label: string }[] = [
  { value: 'auto',       label: 'Auto' },
  { value: 'powershell', label: 'PowerShell' },
  { value: 'cmd',        label: 'CMD' },
  { value: 'bash',       label: 'Bash' },
  { value: 'sh',         label: 'sh' },
  { value: 'zsh',        label: 'Zsh' }
]

function getFreshToken(): string {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return ''
    return JSON.parse(stored)?.state?.token || ''
  } catch { return '' }
}

export function PTYTerminal({ deviceId, deviceName, onClose }: Props) {
  const theme = useUIStore(s => s.theme)

  const termRef       = useRef<HTMLDivElement>(null)
  const termInstance  = useRef<Terminal | null>(null)
  const fitAddon      = useRef<FitAddon | null>(null)
  const wsRef         = useRef<WebSocket | null>(null)
  const connectingRef = useRef(false)
  const dataDisposableRef   = useRef<{ dispose(): void } | null>(null)
  const resizeDisposableRef = useRef<{ dispose(): void } | null>(null)

  const [status,     setStatus]     = useState<Status>('idle')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [fullscreen, setFullscreen] = useState(false)
  const [shell,      setShell]      = useState<ShellHint>('auto')
  const [shellOpen,  setShellOpen]  = useState(false)

  // ── Setup xterm ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!termRef.current) return

    const term = new Terminal({
      theme:       theme === 'light' ? LIGHT_THEME : DARK_THEME,
      fontFamily:  '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      fontSize: 13, lineHeight: 1.45, cursorBlink: true, cursorStyle: 'block',
      scrollback: 8000, allowTransparency: true, convertEol: true,
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

    term.writeln('\x1b[1;36m  AiRemote Direct Shell\x1b[0m\x1b[90m  (PTY v1.2.0)\x1b[0m')
    term.writeln('\x1b[90m  ──────────────────────────────────────────────────────\x1b[0m')
    term.writeln('\x1b[90m  جلسة Shell مباشرة عبر الوكيل — لا تحتاج بيانات SSH\x1b[0m\r\n')

    const ro = new ResizeObserver(() => { try { fit.fit() } catch {} })
    ro.observe(termRef.current!)

    return () => {
      ro.disconnect()
      dataDisposableRef.current?.dispose()
      resizeDisposableRef.current?.dispose()
      term.dispose()
      wsRef.current?.close()
      wsRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Dynamic theme update ──────────────────────────────────────────────
  useEffect(() => {
    termInstance.current?.options.theme && (
      termInstance.current.options.theme = theme === 'light' ? LIGHT_THEME : DARK_THEME
    )
  }, [theme])

  // ── Connect ───────────────────────────────────────────────────────────
  const connect = useCallback((shellHint: ShellHint = 'auto') => {
    if (!termInstance.current) return
    if (connectingRef.current) return
    connectingRef.current = true

    // Tear down any existing connection
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }

    // Detach old listeners
    dataDisposableRef.current?.dispose();   dataDisposableRef.current   = null
    resizeDisposableRef.current?.dispose(); resizeDisposableRef.current = null

    const term = termInstance.current
    setStatus('connecting')
    setErrorMsg('')
    term.writeln(`\x1b[33m  يتصل بـ ${deviceName || deviceId}...\x1b[0m`)

    const token    = getFreshToken()
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const tokenQ   = token ? `?token=${encodeURIComponent(token)}` : ''
    const ws       = new WebSocket(`${protocol}//${window.location.host}/pty${tokenQ}`)
    wsRef.current  = ws

    ws.onopen = () => {
      connectingRef.current = false
      const dim = fitAddon.current?.proposeDimensions()
      ws.send(JSON.stringify({
        type: 'pty:connect',
        payload: {
          deviceId,
          shell:  shellHint,
          rows: dim?.rows || 24,
          cols: dim?.cols || 80
        }
      }))
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)

        if (msg.type === 'pty:connected') {
          setStatus('connected')
          term.writeln('\x1b[32m  ✓ Shell جاهز!\x1b[0m\r\n')

          // Keyboard → server
          dataDisposableRef.current = term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'pty:data', payload: { data: btoa(unescape(encodeURIComponent(data))) } }))
          })

          // Resize → server
          resizeDisposableRef.current = term.onResize(({ rows, cols }) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'pty:resize', payload: { rows, cols } }))
          })

          fitAddon.current?.fit()
        }

        else if (msg.type === 'pty:data') {
          try {
            term.write(Uint8Array.from(atob(msg.payload.data), c => c.charCodeAt(0)))
          } catch {
            term.write(msg.payload.data)
          }
        }

        else if (msg.type === 'pty:error') {
          setStatus('error')
          const err: string = msg.payload?.message || 'Unknown error'
          setErrorMsg(err)
          connectingRef.current = false
          term.writeln('\r\n\x1b[31m  ✗ ' + err + '\x1b[0m')
          if (err.includes('offline') || err.includes('not online')) {
            term.writeln('\x1b[33m  ⚠ الجهاز غير متصل — شغّل الوكيل أولاً\x1b[0m')
          } else if (err.includes('1.2.0')) {
            term.writeln('\x1b[33m  ⚠ هذه الميزة تتطلب الوكيل v1.2.0 أو أحدث\x1b[0m')
          }
        }

        else if (msg.type === 'pty:closed') {
          setStatus('closed')
          term.writeln('\r\n\x1b[90m  ─── انتهت الجلسة ───\x1b[0m')
        }

      } catch {}
    }

    ws.onclose = (ev) => {
      connectingRef.current = false
      if (ev.code === 1006 && status !== 'connected') {
        setStatus('error')
        setErrorMsg('انتهت صلاحية الجلسة — أعد تسجيل الدخول')
        term.writeln('\r\n\x1b[31m  ✗ انتهت صلاحية الجلسة\x1b[0m')
      } else if (status === 'connected') {
        setStatus('closed')
        term.writeln('\r\n\x1b[90m  ─── انقطع الاتصال ───\x1b[0m')
      }
    }

    ws.onerror = () => { connectingRef.current = false }
  }, [deviceId, deviceName])

  // Auto-connect on mount
  useEffect(() => {
    const t = setTimeout(() => connect(shell), 300)
    return () => clearTimeout(t)
  }, [])

  function disconnect() {
    wsRef.current?.send(JSON.stringify({ type: 'pty:disconnect', payload: {} }))
    wsRef.current?.close()
    setStatus('closed')
  }

  function retry() {
    connectingRef.current = false
    connect(shell)
  }

  function changeShell(s: ShellHint) {
    setShell(s)
    setShellOpen(false)
    connectingRef.current = false
    termInstance.current?.writeln('\r\n\x1b[33m  ─── تغيير Shell إلى ' + s + ' ───\x1b[0m')
    connect(s)
  }

  const isLight = theme === 'light'

  const statusBadge = {
    idle:       { icon: <WifiOff size={10} />, label: 'Disconnected', cls: 'text-slate-500 bg-slate-700/40 border-slate-700/50' },
    connecting: { icon: <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse" />, label: 'Connecting…', cls: 'text-yellow-400 bg-yellow-400/10 border-yellow-500/25' },
    connected:  { icon: <Wifi size={10} />, label: 'Connected', cls: 'text-emerald-400 bg-emerald-400/10 border-emerald-500/25' },
    error:      { icon: <AlertTriangle size={10} />, label: 'Error', cls: 'text-red-400 bg-red-400/10 border-red-500/25' },
    closed:     { icon: <WifiOff size={10} />, label: 'Closed', cls: 'text-slate-500 bg-slate-700/40 border-slate-700/50' },
  }[status]

  return (
    <div className={clsx(
      'flex flex-col rounded-xl overflow-hidden border border-slate-700/50 transition-colors',
      isLight ? 'bg-white' : 'bg-[#0d1117]',
      fullscreen ? 'fixed inset-4 z-50 shadow-2xl' : 'h-full'
    )}>
      {/* ── Title bar ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-navy-800 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400/75"    />
            <div className="w-3 h-3 rounded-full bg-yellow-400/75" />
            <div className="w-3 h-3 rounded-full bg-green-400/75"  />
          </div>
          <span className="text-xs text-slate-300 font-mono truncate max-w-[180px]" dir="ltr">
            {deviceName || deviceId.slice(0, 12)} — Shell
          </span>
          <span className="text-[10px] bg-brand-blue/15 text-brand-blue px-1.5 py-0.5 rounded font-mono border border-brand-blue/20">
            PTY
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Shell selector */}
          <div className="relative">
            <button
              onClick={() => setShellOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-navy-900/60 px-2 py-1 rounded border border-slate-700/50 hover:border-slate-600 transition-colors"
            >
              <span className="font-mono">{shell}</span>
              <ChevronDown size={10} />
            </button>
            {shellOpen && (
              <div className="absolute right-0 top-full mt-1 bg-navy-900 border border-slate-700/50 rounded-lg shadow-xl z-20 min-w-[110px] py-1">
                {SHELLS.map(s => (
                  <button
                    key={s.value}
                    onClick={() => changeShell(s.value)}
                    className={clsx(
                      'w-full text-left px-3 py-1.5 text-xs transition-colors',
                      shell === s.value ? 'text-brand-blue bg-brand-blue/10' : 'text-slate-300 hover:bg-slate-700/40'
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status badge */}
          <span className={clsx(
            'inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border font-medium',
            statusBadge.cls
          )}>
            {statusBadge.icon}
            {statusBadge.label}
          </span>

          {(status === 'error' || status === 'closed') && (
            <button onClick={retry} title="Retry"
              className="p-1.5 text-slate-500 hover:text-sky-400 hover:bg-sky-400/10 rounded-md transition-colors">
              <RotateCcw size={12} />
            </button>
          )}

          <button onClick={() => setFullscreen(f => !f)}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-700/40 rounded-md transition-colors">
            {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
          </button>

          {status === 'connected' && (
            <button onClick={disconnect}
              className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md transition-colors" title="Disconnect">
              <X size={12} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose}
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
          <button onClick={retry} className="text-xs text-sky-400 hover:underline whitespace-nowrap flex-shrink-0">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ── Terminal canvas ─────────────────────────────────────────────────
          dir="ltr" is required — xterm.js uses a canvas element and is
          inherently LTR. Without this, RTL page direction breaks backspace
          and all keyboard input on Arabic/RTL pages.
      ─────────────────────────────────────────────────────────────────────── */}
      <div
        ref={termRef}
        dir="ltr"
        className={clsx('flex-1 overflow-hidden', isLight ? 'p-2 bg-white' : 'p-2 bg-[#0d1117]')}
        style={{ minHeight: 0 }}
      />
    </div>
  )
}
