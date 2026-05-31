import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { clsx } from 'clsx'
import { Wifi, WifiOff, X, Maximize2, Minimize2, RotateCcw, ChevronDown } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

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
      theme: {
        background:          '#0a0f1e',
        foreground:          '#e2e8f0',
        cursor:              '#38bdf8',
        selectionBackground: '#1e3a5f',
        black:   '#1a1f35', red:     '#f87171', green:  '#4ade80', yellow:  '#fbbf24',
        blue:    '#38bdf8', magenta: '#c084fc', cyan:   '#22d3ee', white:   '#e2e8f0',
        brightBlack:   '#374151', brightRed:     '#fca5a5', brightGreen:  '#86efac',
        brightYellow:  '#fcd34d', brightBlue:    '#7dd3fc', brightMagenta:'#d8b4fe',
        brightCyan:    '#67e8f9', brightWhite:   '#f8fafc'
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: 'block',
      scrollback: 8000, allowTransparency: true, convertEol: true
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
      term.dispose()
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

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

  return (
    <div className={clsx(
      'flex flex-col bg-[#0a0f1e] rounded-xl overflow-hidden border border-slate-700/50',
      fullscreen ? 'fixed inset-4 z-50' : 'h-full'
    )}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-navy-800 border-b border-slate-700/50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/70" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <div className="w-3 h-3 rounded-full bg-green-500/70" />
          </div>
          <span className="text-xs text-slate-400 font-mono ml-2">
            Direct Shell — {deviceName || deviceId.slice(0, 12)}
          </span>
          <span className="text-[10px] bg-brand-blue/10 text-brand-blue px-1.5 py-0.5 rounded font-mono">
            PTY
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Shell selector */}
          <div className="relative">
            <button
              onClick={() => setShellOpen(o => !o)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-navy-900/60 px-2 py-1 rounded border border-slate-700/50 transition-colors"
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
            'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
            status === 'connected'  ? 'bg-emerald-400/10 text-emerald-400' :
            status === 'connecting' ? 'bg-yellow-400/10 text-yellow-400'   :
            status === 'error'      ? 'bg-red-400/10 text-red-400'         :
                                     'bg-slate-700/50 text-slate-500'
          )}>
            {status === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
            {status === 'idle' ? 'غير متصل' : status === 'connecting' ? 'يتصل...' :
             status === 'connected' ? 'متصل' : status === 'error' ? 'خطأ' : 'منتهي'}
          </span>

          {(status === 'error' || status === 'closed') && (
            <button onClick={retry} title="إعادة المحاولة"
              className="p-1 text-slate-500 hover:text-brand-blue transition-colors">
              <RotateCcw size={13} />
            </button>
          )}

          <button onClick={() => setFullscreen(f => !f)}
            className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>

          {status === 'connected' && (
            <button onClick={disconnect} className="p-1 text-slate-500 hover:text-red-400 transition-colors" title="قطع الاتصال">
              <X size={13} />
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {status === 'error' && errorMsg && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center justify-between gap-3 flex-shrink-0">
          <span>{errorMsg}</span>
          <button onClick={retry} className="text-xs text-brand-blue hover:underline whitespace-nowrap">
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* Terminal canvas */}
      <div ref={termRef} className="flex-1 p-2 overflow-hidden" style={{ minHeight: 0 }} />
    </div>
  )
}
