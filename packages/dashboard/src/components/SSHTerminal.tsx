import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { clsx } from 'clsx'
import { Wifi, WifiOff, X, Maximize2, Minimize2, RotateCcw } from 'lucide-react'
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

function getFreshToken(): string {
  try {
    const stored = localStorage.getItem('airemote-auth')
    if (!stored) return ''
    return JSON.parse(stored)?.state?.token || ''
  } catch { return '' }
}

export function SSHTerminal({ config, deviceId, onClose }: Props) {
  const termRef        = useRef<HTMLDivElement>(null)
  const termInstance   = useRef<Terminal | null>(null)
  const fitAddon       = useRef<FitAddon | null>(null)
  const wsRef          = useRef<WebSocket | null>(null)
  const connectingRef  = useRef(false)
  const configRef      = useRef<SSHConfig | null>(null)

  const [status,    setStatus]    = useState<'idle' | 'connecting' | 'connected' | 'error' | 'closed'>('idle')
  const [errorMsg,  setErrorMsg]  = useState('')
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!termRef.current) return

    const term = new Terminal({
      theme: {
        background: '#0a0f1e', foreground: '#e2e8f0', cursor: '#38bdf8',
        selectionBackground: '#1e3a5f',
        black: '#1a1f35', red: '#f87171', green: '#4ade80', yellow: '#fbbf24',
        blue: '#38bdf8', magenta: '#c084fc', cyan: '#22d3ee', white: '#e2e8f0',
        brightBlack: '#374151', brightRed: '#fca5a5', brightGreen: '#86efac',
        brightYellow: '#fcd34d', brightBlue: '#7dd3fc', brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9', brightWhite: '#f8fafc'
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, cursorStyle: 'block',
      scrollback: 5000, allowTransparency: true
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
    term.writeln('\x1b[90m  ─────────────────────\x1b[0m')

    const ro = new ResizeObserver(() => { try { fit.fit() } catch {} })
    ro.observe(termRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      wsRef.current?.close()
    }
  }, [])

  const connect = useCallback((cfg: SSHConfig) => {
    if (!termInstance.current) return

    // Prevent duplicate simultaneous connections
    if (connectingRef.current) return
    connectingRef.current = true

    // Close any existing connection first
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }

    const term = termInstance.current
    setStatus('connecting')
    setErrorMsg('')
    term.writeln('\x1b[33m  جاري الاتصال بـ ' + cfg.host + ':' + cfg.port + '...\x1b[0m')

    // Always get the freshest token directly from localStorage
    const token = getFreshToken()
    const protocol   = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const tokenParam = token ? `?token=${encodeURIComponent(token)}` : ''
    const ws = new WebSocket(`${protocol}//${window.location.host}/ssh${tokenParam}`)
    wsRef.current = ws

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
          term.writeln('\x1b[32m  ✓ متصل بنجاح!\x1b[0m\r\n')
          term.onData((data) => {
            if (ws.readyState === WebSocket.OPEN)
              ws.send(JSON.stringify({ type: 'ssh:data', payload: { data: btoa(data) } }))
          })
          term.onResize(({ rows, cols }) => {
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
          term.writeln('\r\n\x1b[31m  ✗ خطأ: ' + errMsg + '\x1b[0m')

          if (errMsg.includes('offline') || errMsg.includes('not online')) {
            term.writeln('\x1b[33m  ⚠ الوكيل غير متصل — أعد تشغيله ثم حاول مجدداً\x1b[0m')
          } else if (errMsg.toLowerCase().includes('auth')) {
            term.writeln('\x1b[33m  ⚠ فشل التحقق — تحقق من اسم المستخدم وكلمة المرور\x1b[0m')
            term.writeln('    لتفعيل كلمة المرور: sudo nano /etc/ssh/sshd_config')
            term.writeln('    PasswordAuthentication yes → ثم: sudo systemctl restart sshd\x1b[0m')
          } else if (errMsg.toLowerCase().includes('refused') || errMsg.toLowerCase().includes('connect')) {
            term.writeln('\x1b[33m  ⚠ تعذر الاتصال — تأكد أن SSH مثبت وعامل:')
            term.writeln('      sudo systemctl status sshd\x1b[0m')
          }
        }

        else if (msg.type === 'ssh:closed') {
          setStatus('closed')
          term.writeln('\r\n\x1b[90m  ─ انتهت الجلسة ─\x1b[0m')
        }

      } catch {}
    }

    ws.onclose = (ev) => {
      connectingRef.current = false
      // Code 1006 = abnormal closure (usually means server rejected the upgrade — expired token etc.)
      if (ev.code === 1006 && status !== 'connected') {
        setStatus('error')
        setErrorMsg('انتهت صلاحية الجلسة — أعد تسجيل الدخول')
        term.writeln('\r\n\x1b[31m  ✗ انتهت صلاحية الجلسة — أعد تسجيل الدخول أو أعد المحاولة\x1b[0m')
      } else if (status === 'connected') {
        setStatus('closed')
        term.writeln('\r\n\x1b[90m  ─ انقطع الاتصال ─\x1b[0m')
      }
    }

    ws.onerror = () => {
      connectingRef.current = false
      // onerror usually fires together with onclose for network-level issues
      // The onclose handler provides the better message, so just log here
    }
  }, [deviceId])

  // Connect whenever config changes — but only if config is different from last attempt
  useEffect(() => {
    if (!config) return
    const prev = configRef.current
    const same = prev &&
      prev.host === config.host &&
      prev.port === config.port &&
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
    if (configRef.current) {
      connectingRef.current = false
      connect(configRef.current)
    }
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
            {config ? `${config.username}@${config.host}` : 'SSH Terminal'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={clsx(
            'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
            status === 'connected'  ? 'bg-emerald-400/10 text-emerald-400' :
            status === 'connecting' ? 'bg-yellow-400/10 text-yellow-400' :
            status === 'error'      ? 'bg-red-400/10 text-red-400' :
                                     'bg-slate-700/50 text-slate-500'
          )}>
            {status === 'connected' ? <Wifi size={10} /> : <WifiOff size={10} />}
            {status === 'idle'       ? 'غير متصل' :
             status === 'connecting' ? 'يتصل...'  :
             status === 'connected'  ? 'متصل'     :
             status === 'error'      ? 'خطأ'      : 'منتهي'}
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
            <button onClick={disconnect} className="p-1 text-slate-500 hover:text-red-400 transition-colors">
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

      {status === 'error' && errorMsg && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-xs text-red-400 flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button onClick={retry}
            className="text-xs text-brand-blue hover:underline whitespace-nowrap">
            إعادة المحاولة
          </button>
        </div>
      )}

      <div ref={termRef} className="flex-1 p-2 overflow-hidden" style={{ minHeight: 0 }} />
    </div>
  )
}
