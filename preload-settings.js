'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/** 设置窗口用的窄桥：只暴露它需要的几个动作。 */
contextBridge.exposeInMainWorld('settingsApi', {
  getState: () => ipcRenderer.invoke('settings:get'),
  setSize: size => ipcRenderer.invoke('settings:size', size),
  setForm: form => ipcRenderer.invoke('settings:form', form),
  setPomodoro: on => ipcRenderer.invoke('settings:pomodoro', on === true),
  playUnlock: action => ipcRenderer.invoke('settings:unlock', action),
  toggleListen: () => ipcRenderer.invoke('settings:listen'),
  setVoice: on => ipcRenderer.invoke('settings:voice', on === true),
  setAutoStart: on => ipcRenderer.invoke('settings:autostart', on === true),
  feed: () => ipcRenderer.invoke('settings:feed'),
  showUsage: () => ipcRenderer.send('settings:usage'),
  quit: () => ipcRenderer.send('settings:quit'),
  close: () => ipcRenderer.send('settings:close'),
  welcomeState: () => ipcRenderer.invoke('welcome:state'),
  rename: name => ipcRenderer.invoke('welcome:rename', name),
  finishWelcome: withPet => ipcRenderer.invoke('welcome:finish', withPet),
  downloadModel: name => ipcRenderer.invoke('settings:download-model', name),
  diagnostics: () => ipcRenderer.invoke('settings:diagnostics'),
  copyDiagnostics: () => ipcRenderer.invoke('settings:copy-diagnostics'),
  openPath: which => ipcRenderer.invoke('settings:open-path', which),
  openWelcome: () => ipcRenderer.invoke('settings:open-welcome'),
  qqState: () => ipcRenderer.invoke('qq:state'),
  qqSave: patch => ipcRenderer.invoke('qq:save', patch),
  qqTest: userId => ipcRenderer.invoke('qq:test', userId),
})
