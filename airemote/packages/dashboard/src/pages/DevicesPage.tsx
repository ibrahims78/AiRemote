import { useState, useEffect } from 'react'
import { Monitor, Plus, Copy, Trash2, Check, X, ExternalLink, Terminal, BookOpen } from 'lucide-react'
import { useDeviceStore } from '../store/deviceStore'
import { clsx } from 'clsx'
import { Link } from 'react-router-dom'
import type { Device } from '@airemote/shared'
import { useT } from '../lib/i18n'

function AgentInstallModal({ device, onClose }: { device: Device; onClose: () => void }) {
  const t = useT()
  const [copied, setCopied] = useState<string | null>(null)
  const serverUrl = window.location.origin

  const scripts = {
    linux: `# Install AiRemote Agent on Linux/macOS
curl -fsSL ${serverUrl}/agent-install.sh | bash -s -- \\
  --token "${device.token}" \\
  --server "${serverUrl}"

# Or manually:
npm install -g @airemote/agent
airemote-agent start \\
  --token "${device.token}" \\
  --server "${serverUrl}"`,

    docker: `# Run Agent in Docker
docker run -d \\
  --name airemote-agent \\
  --restart unless-stopped \\
  -e AIREMOTE_TOKEN="${device.token}" \\
  -e AIREMOTE_SERVER="${serverUrl}" \\
  ghcr.io/airemote/agent:latest`,

    env: `# .env file for Agent
AIREMOTE_TOKEN=${device.token}
AIREMOTE_SERVER=${serverUrl}
AIREMOTE_LOG_LEVEL=info`
  }

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 2500)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="glass rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-blue/15 flex items-center justify-center">
              <BookOpen size={16} className="text-brand-blue" />
            </div>
            <div>
              <h3 className="font-semibold text-white">Agent — {device.name}</h3>
              <p className="text-xs text-slate-400 mt-0.5">{t('tab_terminal')}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Token */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-brand-blue text-white text-xs flex items-center justify-center font-bold">1</div>
              <span className="text-sm font-medium text-slate-200">Token</span>
            </div>
            <div className="flex items-center gap-2 bg-navy-900 rounded-lg p-3 border border-slate-700/50">
              <code className="text-xs font-mono text-brand-teal flex-1 break-all">{device.token}</code>
              <button
                onClick={() => copy('token', device.token)}
                className="text-slate-400 hover:text-white p-1.5 transition-colors flex-shrink-0"
              >
                {copied === 'token' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-orange-400/80 mt-1.5 flex items-center gap-1">
              ⚠️ {t('device_name')} Token — {t('last_seen')}
            </p>
          </div>

          {/* Linux/macOS */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-brand-blue text-white text-xs flex items-center justify-center font-bold">2</div>
              <span className="text-sm font-medium text-slate-200">Linux / macOS</span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto border border-slate-700/50 leading-relaxed">
                {scripts.linux}
              </pre>
              <button
                onClick={() => copy('linux', scripts.linux)}
                className="absolute top-2 end-2 p-1.5 text-slate-500 hover:text-white bg-navy-800 rounded-md transition-colors"
              >
                {copied === 'linux' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Docker */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs text-slate-500 ms-7">Docker:</span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto border border-slate-700/50 leading-relaxed">
                {scripts.docker}
              </pre>
              <button
                onClick={() => copy('docker', scripts.docker)}
                className="absolute top-2 end-2 p-1.5 text-slate-500 hover:text-white bg-navy-800 rounded-md transition-colors"
              >
                {copied === 'docker' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* Env file */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-5 h-5 rounded-full bg-brand-blue text-white text-xs flex items-center justify-center font-bold">3</div>
              <span className="text-sm font-medium text-slate-200"><code className="text-brand-teal">.env</code></span>
            </div>
            <div className="relative">
              <pre className="bg-[#0a0f1e] rounded-lg p-3 text-xs font-mono text-slate-300 overflow-x-auto border border-slate-700/50">
                {scripts.env}
              </pre>
              <button
                onClick={() => copy('env', scripts.env)}
                className="absolute top-2 end-2 p-1.5 text-slate-500 hover:text-white bg-navy-800 rounded-md transition-colors"
              >
                {copied === 'env' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
              </button>
            </div>
          </div>

          <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-4 text-xs text-slate-400 space-y-1">
            <p className="text-brand-blue font-medium mb-2">{t('device_online')} ✓</p>
            <p>• {t('tab_commands')}: {t('execute')}</p>
            <p>• SSH Terminal: {t('connect')}</p>
          </div>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function DevicesPage() {
  const t = useT()
  const { devices, loading, fetchDevices, addDevice, deleteDevice } = useDeviceStore()
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [installDevice, setInstallDevice] = useState<Device | null>(null)

  useEffect(() => { fetchDevices() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    try {
      const device = await addDevice(newName.trim())
      setNewName('')
      setShowAdd(false)
      setInstallDevice(device)
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`${t('device_delete_confirm')} "${name}"?`)) return
    await deleteDevice(id)
  }

  const online = devices.filter(d => d.status === 'online').length

  return (
    <div className="p-6">
      {installDevice && (
        <AgentInstallModal device={installDevice} onClose={() => setInstallDevice(null)} />
      )}

      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">{t('devices_title')}</h2>
          <p className="text-slate-400 text-sm mt-1">
            {devices.length} {t('devices')} · <span className="text-emerald-400">{online} {t('online')}</span>
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus size={15} />
          {t('add_device_btn')}
        </button>
      </div>

      {showAdd && (
        <div className="glass rounded-xl p-4 mb-4 animate-fade-in">
          <h3 className="font-medium text-slate-200 mb-3">{t('add_device')}</h3>
          <form onSubmit={handleAdd} className="flex gap-3">
            <input
              autoFocus type="text" value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('device_name')}
              className="flex-1 bg-navy-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-brand-blue"
            />
            <button type="submit" disabled={adding} className="bg-brand-blue hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
              {adding ? '...' : t('add')}
            </button>
            <button type="button" onClick={() => setShowAdd(false)} className="text-slate-500 hover:text-slate-300 px-2">
              <X size={16} />
            </button>
          </form>
        </div>
      )}

      {loading && (
        <div className="text-center text-slate-500 py-12">
          <div className="w-5 h-5 border-2 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          {t('loading')}
        </div>
      )}

      {!loading && (
        <div className="glass rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-start text-xs text-slate-500 font-medium px-4 py-3">{t('devices')}</th>
                <th className="text-start text-xs text-slate-500 font-medium px-4 py-3">{t('platform')}</th>
                <th className="text-start text-xs text-slate-500 font-medium px-4 py-3">{t('stat_connected')}</th>
                <th className="text-start text-xs text-slate-500 font-medium px-4 py-3">{t('hostname')}</th>
                <th className="text-start text-xs text-slate-500 font-medium px-4 py-3">{t('last_seen')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-slate-500 py-14">
                    <Monitor size={32} className="mx-auto mb-3 text-slate-700" />
                    <p className="text-slate-400 mb-1">{t('no_devices_yet')}</p>
                    <p className="text-xs text-slate-600 mb-4">{t('no_devices_desc')}</p>
                    <button
                      onClick={() => setShowAdd(true)}
                      className="inline-flex items-center gap-2 bg-brand-blue hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      <Plus size={14} /> {t('add_device_btn')}
                    </button>
                  </td>
                </tr>
              )}
              {devices.map(d => (
                <tr key={d.id} className="border-b border-slate-700/30 hover:bg-slate-700/20 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center', d.status === 'online' ? 'bg-brand-blue/15' : 'bg-slate-700/50')}>
                        <Monitor size={13} className={d.status === 'online' ? 'text-brand-blue' : 'text-slate-500'} />
                      </div>
                      <div>
                        <div className="font-medium text-slate-100">{d.name}</div>
                        <div className="text-xs text-slate-600 font-mono">{d.id.slice(0, 8)}...</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {d.info?.platform || '—'} {d.info?.arch || ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx(
                      'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full',
                      d.status === 'online' ? 'bg-emerald-400/10 text-emerald-400' : 'bg-slate-700/50 text-slate-500'
                    )}>
                      <span className={clsx('w-1.5 h-1.5 rounded-full', d.status === 'online' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
                      {d.status === 'online' ? t('online') : t('offline')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">{d.tunnelLayer || 'relay'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {d.lastSeen ? new Date(d.lastSeen).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setInstallDevice(d)}
                        className="p-1.5 text-slate-600 hover:text-brand-teal transition-colors rounded"
                        title="Agent"
                      >
                        <Terminal size={13} />
                      </button>
                      <Link
                        to={`/devices/${d.id}`}
                        className="p-1.5 text-slate-600 hover:text-brand-blue transition-colors rounded"
                        title={t('tab_overview')}
                      >
                        <ExternalLink size={13} />
                      </Link>
                      <button
                        onClick={() => handleDelete(d.id, d.name)}
                        className="p-1.5 text-slate-600 hover:text-red-400 transition-colors rounded"
                        title={t('delete')}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
