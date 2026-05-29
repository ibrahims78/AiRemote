'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('airemote', {
  // Agent control
  startAgent:    (cfg)  => ipcRenderer.send('start-agent', cfg),
  stopAgent:     ()     => ipcRenderer.send('stop-agent'),
  minimizeWin:   ()     => ipcRenderer.send('minimize-win'),
  hideWin:       ()     => ipcRenderer.send('hide-win'),
  closeApp:      ()     => ipcRenderer.send('close-app'),
  saveConfig:    (cfg)  => ipcRenderer.send('save-config', cfg),

  // SSH
  saveSshConfig: (cfg)  => ipcRenderer.send('save-ssh-config', cfg),
  testSshPort:   (cfg)  => ipcRenderer.invoke('test-ssh-port', cfg),

  // Queries
  getState:      ()     => ipcRenderer.invoke('get-state'),
  getStatsNow:   ()     => ipcRenderer.invoke('get-stats-now'),
  getDeviceInfo: ()     => ipcRenderer.invoke('get-device-info'),

  // Events
  onInit:        (fn)   => ipcRenderer.on('init',  (_, d) => fn(d)),
  onState:       (fn)   => ipcRenderer.on('state', (_, d) => fn(d)),
  onLog:         (fn)   => ipcRenderer.on('log',   (_, d) => fn(d)),
  onStats:       (fn)   => ipcRenderer.on('stats', (_, d) => fn(d)),
})
