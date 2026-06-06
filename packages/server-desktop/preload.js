'use strict'
/**
 * preload.js — Secure IPC bridge between Electron main process and renderer
 * Injected into both the splash screen (renderer/index.html) and
 * the React Dashboard (http://localhost:PORT).
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  // ── Server ──────────────────────────────────────────────────────────────
  server: {
    start:         ()  => ipcRenderer.invoke('server:start'),
    stop:          ()  => ipcRenderer.invoke('server:stop'),
    restart:       ()  => ipcRenderer.invoke('server:restart'),
    status:        ()  => ipcRenderer.invoke('server:status'),
    openDashboard: ()  => ipcRenderer.invoke('server:openDashboard'),
  },

  // ── Tunnel ──────────────────────────────────────────────────────────────
  tunnel: {
    start:  ()  => ipcRenderer.invoke('tunnel:start'),
    stop:   ()  => ipcRenderer.invoke('tunnel:stop'),
    status: ()  => ipcRenderer.invoke('tunnel:status'),
  },

  // ── Devices ─────────────────────────────────────────────────────────────
  devices: {
    list: () => ipcRenderer.invoke('devices:list'),
  },

  // ── Logs ────────────────────────────────────────────────────────────────
  logs: {
    recent: (n)    => ipcRenderer.invoke('logs:recent', n),
    export: (dest) => ipcRenderer.invoke('logs:export', dest),
  },

  // ── Settings ────────────────────────────────────────────────────────────
  settings: {
    get: ()     => ipcRenderer.invoke('settings:get'),
    set: (data) => ipcRenderer.invoke('settings:set', data),
  },

  // ── Desktop extras (for React Dashboard detection) ───────────────────────
  desktop: {
    isDesktop:    true,
    version:      '3.2.0',
    status:       ()      => ipcRenderer.invoke('desktop:status'),
    startTunnel:  ()      => ipcRenderer.invoke('tunnel:start'),
    stopTunnel:   ()      => ipcRenderer.invoke('tunnel:stop'),
    startServer:  ()      => ipcRenderer.invoke('server:start'),
    stopServer:   ()      => ipcRenderer.invoke('server:stop'),
    restartServer: ()     => ipcRenderer.invoke('server:restart'),
    getLogs:      (n)     => ipcRenderer.invoke('logs:recent', n),
    backup:       (dest)  => ipcRenderer.invoke('backup:export', dest),
    getSettings:  ()      => ipcRenderer.invoke('settings:get'),
    setSettings:  (data)  => ipcRenderer.invoke('settings:set', data),
    openDataDir:  (p)     => ipcRenderer.invoke('system:openFolder', p),
  },

  // ── Backup ──────────────────────────────────────────────────────────────
  backup: {
    export:   (dest) => ipcRenderer.invoke('backup:export', dest),
    import:   (src)  => ipcRenderer.invoke('backup:import', src),
    schedule: (cfg)  => ipcRenderer.invoke('backup:schedule', cfg),
  },

  // ── System ──────────────────────────────────────────────────────────────
  system: {
    getLocalIp:  ()    => ipcRenderer.invoke('system:getLocalIp'),
    openBrowser: (url) => ipcRenderer.invoke('system:openBrowser', url),
    openFolder:  (p)   => ipcRenderer.invoke('system:openFolder', p),
    pickFile:    ()    => ipcRenderer.invoke('system:pickFile'),
    pickFolder:  ()    => ipcRenderer.invoke('system:pickFolder'),
    version:     ()    => ipcRenderer.invoke('system:version'),
  },

  // ── Events: main → renderer ──────────────────────────────────────────────
  on: (channel, cb) => {
    const ALLOWED = [
      'server:status', 'tunnel:url', 'tunnel:stopped',
      'device:connected', 'device:disconnected', 'log:entry',
    ]
    if (!ALLOWED.includes(channel)) return () => {}
    const sub = (_e, ...args) => cb(...args)
    ipcRenderer.on(channel, sub)
    return () => ipcRenderer.removeListener(channel, sub)
  },
})
