'use strict'
/**
 * tunnel.js — Cloudflare Tunnel management
 * Spawns the bundled cloudflared.exe to create a public WSS URL
 * without any port forwarding or Cloudflare account needed.
 */
const { spawn }   = require('child_process')
const path        = require('path')
const fs          = require('fs')
const EventEmitter = require('events')

const emitter = new EventEmitter()
let proc      = null
let _url      = null
let _running  = false

/** Find cloudflared binary (bundled as extraResource) */
function getCloudflaredPath() {
  // In packaged Electron app: resources/cloudflared.exe
  if (process.resourcesPath) {
    const packed = path.join(process.resourcesPath, 'cloudflared.exe')
    if (fs.existsSync(packed)) return packed
  }
  // In development: packages/server-desktop/bin/cloudflared.exe
  const dev = path.join(__dirname, 'bin', 'cloudflared.exe')
  if (fs.existsSync(dev)) return dev
  // Fallback: PATH
  return 'cloudflared'
}

/**
 * Start Cloudflare Tunnel on the given port.
 * Emits 'url' when the tunnel is ready, 'error' on failure, 'stopped' on exit.
 */
function startTunnel(port, logger) {
  if (_running) return
  _running = true
  _url     = null

  const bin  = getCloudflaredPath()
  const args = ['tunnel', '--url', `http://localhost:${port}`, '--no-autoupdate']

  logger?.info('tunnel', `Starting Cloudflare Tunnel on port ${port}...`)
  logger?.info('tunnel', `Using: ${bin}`)

  proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })

  const onData = (chunk) => {
    const text = chunk.toString()
    // cloudflared prints the URL on stderr
    const match = text.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/i)
    if (match && !_url) {
      _url = match[0].replace('https://', 'wss://')
      logger?.info('tunnel', `✅ Tunnel active: ${_url}`)
      emitter.emit('url', _url)
    }
    // Log non-trivial output
    for (const line of text.split('\n')) {
      const t = line.trim()
      if (t && !t.includes('INF') && !t.includes('level=info')) continue
      if (t.includes('error') || t.includes('ERR')) {
        logger?.warn('tunnel', t)
      }
    }
  }

  proc.stdout?.on('data', onData)
  proc.stderr?.on('data', onData)

  proc.on('close', (code) => {
    _running = false
    _url     = null
    proc     = null
    logger?.warn('tunnel', `Cloudflare Tunnel stopped (code=${code})`)
    emitter.emit('stopped', code)
  })

  proc.on('error', (err) => {
    _running = false
    _url     = null
    logger?.error('tunnel', `Failed to start: ${err.message}`)
    emitter.emit('error', err)
  })
}

/** Stop the running tunnel */
function stopTunnel(logger) {
  if (!proc) return
  logger?.info('tunnel', 'Stopping Cloudflare Tunnel...')
  try { proc.kill('SIGTERM') } catch {}
  setTimeout(() => { try { proc?.kill('SIGKILL') } catch {} }, 3000)
  _running = false
  _url     = null
  proc     = null
}

function getUrl()     { return _url }
function isRunning()  { return _running }

module.exports = { startTunnel, stopTunnel, getUrl, isRunning, emitter }
