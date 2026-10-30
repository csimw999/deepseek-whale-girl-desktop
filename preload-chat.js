'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/** 聊天窗口的窄桥。 */
contextBridge.exposeInMainWorld('chatApi', {
  send: (text, options) => ipcRenderer.send('chat:send', { text, options }),
  regenerate: () => ipcRenderer.send('chat:send', { regenerate: true, options: { tts: false } }),
  edit: (index, content) => ipcRenderer.invoke('chat:edit', { index, content }),
  clear: () => ipcRenderer.invoke('chat:clear'),
  history: () => ipcRenderer.invoke('chat:history'),
  pickAvatar: () => ipcRenderer.invoke('chat:pick-avatar'),
  characters: () => ipcRenderer.invoke('chat:characters'),
  setCharacter: id => ipcRenderer.invoke('chat:set-character', id),
  saveCharacter: payload => ipcRenderer.invoke('chat:character-save', payload),
  models: () => ipcRenderer.invoke('chat:models'),
  setModel: model => ipcRenderer.invoke('chat:set-model', model),
  memory: () => ipcRenderer.invoke('chat:memory'),
  memoryList: () => ipcRenderer.invoke('chat:memory-list'),
  memoryAdd: text => ipcRenderer.invoke('chat:memory-add', text),
  memoryRemove: index => ipcRenderer.invoke('chat:memory-remove', index),
  exportChat: () => ipcRenderer.invoke('chat:export'),
  importChat: () => ipcRenderer.invoke('chat:import'),
  saveNote: text => ipcRenderer.invoke('chat:note', text),
  worldbook: () => ipcRenderer.invoke('chat:worldbook'),
  saveWorldbook: entries => ipcRenderer.invoke('chat:worldbook-save', entries),
  toDshTask: () => ipcRenderer.invoke('chat:to-dsh-task'),
  handoff: () => ipcRenderer.invoke('chat:handoff'),
  onUser: callback => ipcRenderer.on('chat:user', (_event, text) => callback(text)),
  onChunk: callback => ipcRenderer.on('chat:chunk', (_event, text) => callback(text)),
  onDone: callback => ipcRenderer.on('chat:done', (_event, text) => callback(text)),
  onInfo: callback => ipcRenderer.on('chat:info', (_event, info) => callback(info)),
})