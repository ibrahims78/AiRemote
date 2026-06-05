'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('chatWin', {
  sendChat:   (data) => ipcRenderer.send('send-chat', data),
  closeWin:   ()     => ipcRenderer.send('close-chat-win'),
  minimizeWin:()     => ipcRenderer.send('minimize-chat-win'),

  onInit:       (fn) => ipcRenderer.on('chat-init',    (_, d) => fn(d)),
  onScreenChat: (fn) => ipcRenderer.on('screen-chat',  (_, d) => fn(d)),
})
