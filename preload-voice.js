'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/** 语音窗口的窄桥：只在页面和主进程之间搬音频数据。 */
contextBridge.exposeInMainWorld('voiceBridge', {
  ready: () => ipcRenderer.send('voice:ready'),
  failed: reason => ipcRenderer.send('voice:failed', reason),
  pcm: (buffer, sampleRate, seconds) => ipcRenderer.send('voice:pcm', { buffer, sampleRate, seconds }),
  onRecord: callback => { ipcRenderer.on('voice:record', () => callback()) },
  onAlways: callback => { ipcRenderer.on('voice:always', (_event, on) => callback(on === true)) },
})
