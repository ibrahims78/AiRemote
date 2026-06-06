'use strict'
/**
 * preload.js — Secure IPC bridge between Electron main process and renderer
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  // ── Server ──────────────────────────────────────────────────────────────
  server: {
    start:  ()  => ipcRenderer.invoke('server:start'),
    stop:   ()  => ipcRenderer.invoke('server:stop'),
    status: ()  => ipcRenderer.invoke('server:status'),
    openDashboard: () => ipcRenderer.invoke('server:openDashboard'),
  },

  // ── Tunnel ──────────────────────────────────────────────────────────────
  tunnel: {
    start:  ()  => ipcRenderer.invoke('tunnel:start'),
    stop:   ()  => ipcRenderer.invoke('tunnel:stop'),
    status: ()  => ipcRenderer.invoke('tunnel:status'),
  },

  // ── Devices ─────────────────────────────────────────────────────────────
  devices: {
    list:   ()  => ipcRenderer.invoke('devices:list'),
  },

  // ── Logs ────────────────────────────────────────────────────────────────
  logs: {
    recent:  (n)    => ipcRenderer.invoke('logs:recent', n),
    export:  (dest) => ipcRenderer.invoke('logs:export', dest),
  },

  // ── Settings ────────────────────────────────────────────────────────────
  settings: {
    get:  ()      => ipcRenderer.invoke('settings:get'),
    set:  (data)  => ipcRenderer.invoke('settings:set', data),
  },

  // ── Backup ──────────────────────────────────────────────────────────────
  backup: {
    export:   (dest) => ipcRenderer.invoke('backup:export', dest),
    import:   (src)  => ipcRenderer.invoke('backup:import', src),
    schedule: (cfg)  => ipcRenderer.invoke('backup:schedule', cfg),
  },

  // ── System ──────────────────────────────────────────────────────────────
  system: {
    getLocalIp:   ()     => ipcRenderer.invoke('system:getLocalIp'),
    openBrowser:  (url)  => ipcRenderer.invoke('system:openBrowser', url),
    openFolder:   (path) => ipcRenderer.invoke('system:openFolder', path),
    pickFile:     ()     => ipcRenderer.invoke('system:pickFile'),
    pickFolder:   ()     => ipcRenderer.invoke('system:pickFolder'),
    version:      ()     => ipcRenderer.invoke('system:version'),
  },

  // ── Events from main → renderer ─────────────────────────────────────────
  on: (channel, cb) => {
    const allowed = ['server:status', 'tunnel:url', 'tunnel:stopped', 'device:connected', 'device:disconnected', 'log:entry']
    if (!allowed.includes(channel)) return
    const sub = (_event, ...args) => cb(...args)
    ipcRenderer.on(channel, sub)
    return () => ipcRenderer.removeListener(channel, sub)
  },
})
