import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Monitor, Terminal, Activity, FolderOpen, ArrowLeft,
  Wifi, WifiOff, Cpu, MemoryStick, HardDrive, Clock,
  Globe, Server, Bot, Command, KeyRound, Loader2
} from 'lucide-react'
import { clsx } from 'clsx'
import { useDeviceStore } from '../store/deviceStore'
import { SSHTerminal } from '../components/SSHTerminal'
import { PTYTerminal } from '../components/PTYTerminal'
import { MonitoringCharts } from '../components/MonitoringCharts'
import { FileManager } from '../components/FileManager'
import { AiChatPanel } from '../components/AiChatPanel'
import { CommandRunner } from '../components/CommandRunner'
import { ErrorBoundary } from '../components/ErrorBoundary'
import type { Device } from '@airemote/shared'
import { useT } from '../lib/i18n'
import { api } from '../lib/api'

type Tab = 'overview' | 'terminal' | 'monitor' | 'files' | 'ai' | 'commands'

interface SSHConfig {
  host: string
  port: number
  username: string
  password?: string
  privateKey?: string
}

interface SavedCredential {
  id: string
  label: string
  ssh_host: string
  ssh_port: number
  ssh_username: string
  secret_type: string
  last_used: string | null
}

const SSH_CFG_KEY = 'airemote-ssh-cfg'
const SSH_SESSION_KEY = 'airemote-ssh-session'

function loadSavedSSHConfig(deviceId: string): SSHConfig | null {
  try {
    const session = sessionStorage.getItem(`${SSH_SESSION_KEY}-${deviceId}`)
    if (session) return JSON.parse(session)
    const d = localStorage.getItem(`${SSH_CFG_KEY}-${deviceId}`)
    return d ? JSON.parse(d) : null
  } catch { return null }
}

function saveSSHConfig(deviceId: string, cfg: SSHConfig) {
  try {
    sessionStorage.setItem(`${SSH_SESSION_KEY}-${deviceId}`, JSON.stringify(cfg))
    localStorage.setItem(`${SSH_CFG_KEY}-${deviceId}`, JSON.stringify({ ...cfg, password: undefined, privateKey: undefined }))
  } catch {}
}

function ConnectionForm({ device, onConnect, savedCredentials, onUseCredential }: {
  device: Device
  onConnect: (cfg: SSHConfig) => void
  savedCredentials: SavedCredential[]
  onUseCredential: (credId: string) => void
}) {
  const t = useT()
  const saved = loadSavedSSHConfig(device.id)
  const [host, setHost] = useState(saved?.host || 'localhost')
  const [port, setPort] = useState(saved?.port || 22)
  const [username, setUsername] = useState(saved?.username || 'root')
  const [password, setPassword] = useState(saved?.password || '')
  const [authMethod, setAuthMethod] = useState<'password' | 'key'>(saved?.privateKey ? 'key' : 'password')
  const [privateKey, setPrivateKey] = useState('')
  const [usingCred, setUsingCred] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const cfg: SSHConfig = {
      host, port, username,
      password: authMethod === 'password' ? password : undefined,
      privateKey: authMethod === 'key' ? btoa(privateKey) : undefined
    }
    saveSSHConfig(device.id, cfg)
    onConnect(cfg)
  }

  async function handleUseCred(credId: string) {
    setUsingCred(credId)
    try {
      await onUseCredential(credId)
    } finally {
      setUsingCred(null)
    }
  }

  return (
    <div className="space-y-4 max-w-md">
      {/* Saved server credentials — quick connect */}
      {savedCredentials.length > 0 && (
        <div className="glass rounded-xl p-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <KeyRound size={12} className="text-brand-teal" />
            الاتصال السريع — إعدادات محفوظة
          </h3>
          <div className="space-y-2">
            {savedCredentials.map(cred => (
              <button
                key={cred.id}
                onClick={() => handleUseCred(cred.id)}
                disabled={usingCred === cred.id}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-navy-900 border border-slate-700/60 hover:border-brand-blue/50 rounded-lg transition-colors group"
              >
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-200 group-hover:text-white">{cred.label}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {cred.ssh_username}@{cred.ssh_host}:{cred.ssh_port}
                  </p>
                </div>
                {usingCred === cred.id
                  ? <Loader2 size={14} className="text-brand-blue animate-spin" />
                  : <Terminal size={14} className="text-slate-600 group-hover:text-brand-blue transition-colors" />
                }
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Manual form */}
      <form onSubmit={handleSubmit} className="glass rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
          <Server size={14} className="text-brand-blue" />
          {savedCredentials.length > 0 ? 'اتصال يدوي' : t('ssh_config_title')}
        </h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="text-xs text-slate-400 block mb-1">{t('ip_local')} / {t('hostname')}</label>
              <input
                type="text" value={host} onChange={e => setHost(e.target.value)}
                placeholder="192.168.1.100" required
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Port</label>
              <input
                type="number" value={port} onChange={e => setPort(Number(e.target.value))}
                min={1} max={65535}
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-blue"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Username</label>
            <input
              type="text" value={username} onChange={e => setUsername(e.target.value)} required
              className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-blue"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Auth</label>
            <div className="flex gap-2">
              {(['password', 'key'] as const).map(m => (
                <button
                  key={m} type="button" onClick={() => setAuthMethod(m)}
                  className={clsx('flex-1 text-xs py-1.5 rounded-lg border transition-colors',
                    authMethod === m ? 'bg-brand-blue/15 border-brand-blue/40 text-brand-blue' : 'bg-navy-900 border-slate-600 text-slate-400 hover:border-slate-500'
                  )}
                >
                  {m === 'password' ? t('password') : 'Private Key'}
                </button>
              ))}
            </div>
          </div>
          {authMethod === 'password' ? (
            <div>
              <label className="text-xs text-slate-400 block mb-1">{t('password')}</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-brand-blue"
              />
            </div>
          ) : (
            <div>
              <label className="text-xs text-slate-400 block mb-1">Private Key (PEM)</label>
              <textarea
                value={privateKey} onChange={e => setPrivateKey(e.target.value)} rows={4}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                className="w-full bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue resize-none"
              />
            </div>
          )}
          <button type="submit" className="w-full bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {t('connect')}
          </button>
        </div>
      </form>
    </div>
  )
}

function DeviceInfoPanel({ device }: { device: Device }) {
  const t = useT()
  const { statsMap } = useDeviceStore()
  const stats = statsMap[device.id]

  const uptime = stats?.uptime
    ? `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`
    : '—'

  const infoRows = [
    { label: t('hostname'),  value: device.info?.hostname || '—', icon: Server },
    { label: t('platform'),  value: device.info ? `${device.info.platform} ${device.info.osVersion}` : '—', icon: Monitor },
    { label: 'Arch',         value: device.info?.arch || '—', icon: Cpu },
    { label: t('ip_local'),  value: device.info?.ipLocal || '—', icon: Globe },
    { label: t('ip_public'), value: device.info?.ipPublic || '—', icon: Globe },
    { label: 'Tunnel',       value: device.tunnelLayer || '—', icon: Wifi },
    { label: t('uptime'),    value: uptime, icon: Clock },
  ]

  return (
    <div className="space-y-4">
      <div className="glass rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700/50">
          <h3 className="text-sm font-medium text-slate-200">{t('device_info')}</h3>
        </div>
        <div className="divide-y divide-slate-700/30">
          {infoRows.map(({ label, value, icon: Icon }) => (
            <div key={label} className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Icon size={12} className="text-slate-600" />
                {label}
              </div>
              <span className="text-xs font-mono text-slate-200">{value}</span>
            </div>
          ))}
        </div>
      </div>

      {stats && (
        <div className="glass rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700/50">
            <h3 className="text-sm font-medium text-slate-200">{t('tab_monitor')}</h3>
          </div>
          <div className="p-4 grid grid-cols-3 gap-4">
            {[
              { label: 'CPU', value: stats.cpuPercent, stroke: '#38bdf8' },
              { label: 'RAM', value: stats.ramPercent, stroke: '#2dd4bf' },
              { label: 'Disk', value: stats.diskPercent, stroke: '#c084fc' }
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className="relative w-14 h-14 mx-auto mb-2">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.9" fill="none"
                      stroke={item.stroke} strokeWidth="3"
                      strokeDasharray={`${item.value} 100`} strokeLinecap="round"
                      className="transition-all duration-500"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{item.value}%</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function DeviceWorkspacePage() {
  const t = useT()
  const { deviceId } = useParams<{ deviceId: string }>()
  const { devices, statsMap, fetchDevices } = useDeviceStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [sshConfig, setSshConfig] = useState<SSHConfig | null>(null)
  const [showConnForm, setShowConnForm] = useState(false)
  const [savedCredentials, setSavedCredentials] = useState<SavedCredential[]>([])
  const [autoConnecting, setAutoConnecting] = useState(false)

  const device = devices.find(d => d.id === deviceId)
  const stats = deviceId ? statsMap[deviceId] : undefined

  useEffect(() => {
    if (devices.length === 0) fetchDevices()
  }, [])

  // Fetch saved credentials from server whenever deviceId changes
  useEffect(() => {
    if (!deviceId) return
    api.get<SavedCredential[]>(`/api/credentials?deviceId=${deviceId}`)
      .then(res => setSavedCredentials(res.data))
      .catch(() => setSavedCredentials([]))
  }, [deviceId])

  // Auto-connect: if there's exactly one saved credential, connect automatically
  const tryAutoConnect = useCallback(async () => {
    if (!deviceId) return false
    // First check session storage for full credentials
    const local = loadSavedSSHConfig(deviceId)
    if (local?.password || local?.privateKey) {
      setSshConfig(local)
      setShowConnForm(false)
      return true
    }
    // Then try server credentials — auto-connect if only one saved
    try {
      const res = await api.get<SavedCredential[]>(`/api/credentials?deviceId=${deviceId}`)
      const creds = res.data
      setSavedCredentials(creds)
      if (creds.length === 1) {
        setAutoConnecting(true)
        const use = await api.post<SSHConfig>(`/api/credentials/${creds[0].id}/use`)
        const cfg: SSHConfig = {
          host: use.data.host || (use.data as unknown as { sshHost: string }).sshHost,
          port: use.data.port || (use.data as unknown as { sshPort: number }).sshPort || 22,
          username: use.data.username || (use.data as unknown as { sshUsername: string }).sshUsername,
          password: (use.data as unknown as { password?: string }).password,
          privateKey: (use.data as unknown as { privateKey?: string }).privateKey,
        }
        saveSSHConfig(deviceId, cfg)
        setSshConfig(cfg)
        setShowConnForm(false)
        setAutoConnecting(false)
        return true
      } else if (creds.length > 1) {
        setShowConnForm(true)
        return true
      }
    } catch {}
    return false
  }, [deviceId])

  useEffect(() => {
    if (tab !== 'files') return
    ;(async () => {
      const connected = await tryAutoConnect()
      if (!connected) setShowConnForm(true)
    })()
  }, [tab])

  // Handle using a specific saved credential
  const handleUseCredential = useCallback(async (credId: string) => {
    if (!deviceId) return
    const res = await api.post<Record<string, unknown>>(`/api/credentials/${credId}/use`)
    const d = res.data
    const cfg: SSHConfig = {
      host: (d.sshHost as string) || 'localhost',
      port: (d.sshPort as number) || 22,
      username: (d.sshUsername as string) || 'root',
      password: d.password as string | undefined,
      privateKey: d.privateKey as string | undefined,
    }
    saveSSHConfig(deviceId, cfg)
    setSshConfig(cfg)
    setShowConnForm(false)
  }, [deviceId])

  if (!device) {
    return (
      <div className="p-6 text-center">
        <Monitor size={32} className="text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">{t('no_devices_yet')}</p>
        <Link to="/devices" className="text-brand-blue text-sm hover:underline mt-2 inline-block">
          {t('back_to_devices')}
        </Link>
      </div>
    )
  }

  const isOnline = device.status === 'online'

  const tabs: { id: Tab; label: string; icon: React.ElementType; disabled?: boolean }[] = [
    { id: 'overview',  label: t('tab_overview'),  icon: Server },
    { id: 'commands',  label: t('tab_commands'),  icon: Command,    disabled: !isOnline },
    { id: 'terminal',  label: t('tab_terminal'),  icon: Terminal,   disabled: !isOnline },
    { id: 'monitor',   label: t('tab_monitor'),   icon: Activity },
    { id: 'files',     label: t('tab_files'),     icon: FolderOpen, disabled: !isOnline },
    { id: 'ai',        label: t('tab_ai'),        icon: Bot },
  ]

  function handleConnect(cfg: SSHConfig) {
    setSshConfig(cfg)
    setShowConnForm(false)
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-0 border-b border-slate-700/50 bg-navy-900">
        <div className="flex items-center gap-3 mb-4">
          <Link to="/devices" className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors rounded-lg hover:bg-slate-700/40">
            <ArrowLeft size={16} />
          </Link>
          <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center', isOnline ? 'bg-brand-blue/15' : 'bg-slate-700/50')}>
            <Monitor size={14} className={isOnline ? 'text-brand-blue' : 'text-slate-500'} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white leading-none">{device.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{device.info?.hostname || device.id.slice(0, 12)}</p>
          </div>
          <span className={clsx(
            'inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ms-auto',
            isOnline ? 'bg-emerald-400/10 text-emerald-400' : 'bg-slate-700/50 text-slate-400'
          )}>
            {isOnline ? <Wifi size={10} /> : <WifiOff size={10} />}
            {isOnline ? t('device_online') : t('device_offline')}
          </span>
          {stats && (
            <div className="hidden lg:flex items-center gap-3 text-xs text-slate-400 border-s border-slate-700/50 ps-4 ms-2">
              <span className="flex items-center gap-1"><Cpu size={10} className="text-brand-blue" /><span className="font-mono text-slate-200">{stats.cpuPercent}%</span></span>
              <span className="flex items-center gap-1"><MemoryStick size={10} className="text-brand-teal" /><span className="font-mono text-slate-200">{stats.ramPercent}%</span></span>
              <span className="flex items-center gap-1"><HardDrive size={10} className="text-purple-400" /><span className="font-mono text-slate-200">{stats.diskPercent}%</span></span>
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {tabs.map(tb => (
            <button
              key={tb.id}
              onClick={() => !tb.disabled && setTab(tb.id)}
              disabled={tb.disabled}
              className={clsx(
                'flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-all',
                tab === tb.id ? 'border-brand-blue text-brand-blue font-medium' :
                tb.disabled ? 'border-transparent text-slate-600 cursor-not-allowed' :
                'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <tb.icon size={14} />
              {tb.label}
              {tb.disabled && !isOnline && <span className="text-[10px] bg-slate-700/50 text-slate-500 px-1.5 py-0.5 rounded">{t('offline')}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className={clsx('flex-1 min-h-0', tab === 'ai' || tab === 'terminal' || tab === 'commands' ? 'overflow-hidden' : 'overflow-auto p-5')}>
        <ErrorBoundary>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 p-5">
            <div className="lg:col-span-1">
              <DeviceInfoPanel device={device} />
            </div>
            <div className="lg:col-span-2">
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-medium text-slate-200 mb-4 flex items-center gap-2">
                  <Activity size={14} className="text-brand-blue" />
                  {t('tab_monitor')}
                </h3>
                <MonitoringCharts deviceId={device.id} stats={stats} />
              </div>
            </div>
          </div>
        )}

        {tab === 'commands' && deviceId && (
          <div className="h-full p-5">
            <CommandRunner deviceId={deviceId} deviceName={device.name} />
          </div>
        )}

        {tab === 'terminal' && deviceId && (
          <div className="h-full p-5">
            <PTYTerminal deviceId={deviceId} deviceName={device.name} />
          </div>
        )}

        {tab === 'monitor' && (
          <div className="space-y-5 p-5">
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-medium text-slate-200 mb-4">{t('tab_monitor')} — {device.name}</h3>
              <MonitoringCharts deviceId={device.id} stats={stats} />
            </div>
          </div>
        )}

        {tab === 'files' && (
          <div className="flex flex-col gap-4 h-full p-5" style={{ minHeight: '500px' }}>
            {autoConnecting && (
              <div className="flex items-center gap-3 text-sm text-slate-400 glass rounded-xl px-4 py-3 max-w-md">
                <Loader2 size={14} className="text-brand-blue animate-spin flex-shrink-0" />
                جاري الاتصال التلقائي...
              </div>
            )}
            {showConnForm && !autoConnecting && (
              <ConnectionForm
                device={device}
                onConnect={handleConnect}
                savedCredentials={savedCredentials}
                onUseCredential={handleUseCredential}
              />
            )}
            {!showConnForm && !autoConnecting && sshConfig && (
              <div className="flex-1 glass rounded-xl overflow-hidden" style={{ minHeight: '450px' }}>
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50">
                  <h3 className="text-sm font-medium text-slate-200 flex items-center gap-2">
                    <FolderOpen size={14} className="text-brand-teal" />
                    SFTP — {sshConfig.username}@{sshConfig.host}
                  </h3>
                  <button
                    onClick={() => { setSshConfig(null); setShowConnForm(true) }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    {t('disconnect')}
                  </button>
                </div>
                <div style={{ height: 'calc(100% - 49px)' }}>
                  <FileManager config={sshConfig} />
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'ai' && deviceId && (
          <div className="h-full">
            <AiChatPanel deviceId={deviceId} />
          </div>
        )}

        </ErrorBoundary>
      </div>
    </div>
  )
}
