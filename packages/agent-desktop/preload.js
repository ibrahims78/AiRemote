'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  startAgent:    (cfg) => ipcRenderer.send('start-agent', cfg),
  stopAgent:     ()    => ipcRenderer.send('stop-agent'),
  minimizeWin:   ()    => ipcRenderer.send('minimize-win'),
  hideWin:       ()    => ipcRenderer.send('hide-win'),
  closeApp:      ()    => ipcRenderer.send('close-app'),
  saveConfig:    (cfg) => ipcRenderer.send('save-config', cfg),

  getState:      ()    => ipcRenderer.invoke('get-state'),
  getStatsNow:   ()    => ipcRenderer.invoke('get-stats-now'),
  getDeviceInfo: ()    => ipcRenderer.invoke('get-device-info'),

  onInit:        (fn)  => ipcRenderer.on('init',        (_, d) => fn(d)),
  onState:       (fn)  => ipcRenderer.on('state',       (_, d) => fn(d)),
  onLog:         (fn)  => ipcRenderer.on('log',         (_, d) => fn(d)),
  onStats:       (fn)  => ipcRenderer.on('stats',       (_, d) => fn(d)),
  onPublicIp:    (fn)  => ipcRenderer.on('public-ip',   (_, d) => fn(d)),
  sendChat:         (data) => ipcRenderer.send('send-chat', data),

  onScreenChat:     (fn) => ipcRenderer.on('screen-chat',     (_, d) => fn(d)),
  onScreenSessions: (fn) => ipcRenderer.on('screen-sessions', (_, d) => fn(d)),
  onScreenPrivacy:  (fn) => ipcRenderer.on('screen-privacy',  (_, d) => fn(d)),
})
