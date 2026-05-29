'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  // Actions
  startAgent:   ()    => ipcRenderer.send('start-agent'),
  stopAgent:    ()    => ipcRenderer.send('stop-agent'),
  minimizeWin:  ()    => ipcRenderer.send('minimize-win'),
  hideWin:      ()    => ipcRenderer.send('hide-win'),
  closeApp:     ()    => ipcRenderer.send('close-app'),
  saveConfig:   (cfg) => ipcRenderer.send('save-config', cfg),

  // Queries
  getState:     ()    => ipcRenderer.invoke('get-state'),
  getStatsNow:  ()    => ipcRenderer.invoke('get-stats-now'),

  // Events
  onInit:       (fn)  => ipcRenderer.on('init',  (_, d) => fn(d)),
  onState:      (fn)  => ipcRenderer.on('state', (_, d) => fn(d)),
  onLog:        (fn)  => ipcRenderer.on('log',   (_, d) => fn(d)),
})
