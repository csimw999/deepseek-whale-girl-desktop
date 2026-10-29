'use strict'

const { contextBridge, ipcRenderer } = require('electron')

/**
 * 渲染端外壳桥：只暴露桌面版真正需要的几件事
 * （宿主状态存取、鼠标穿透开关、托盘命令）。宠物逻辑全在插件代码里。
 */
contextBridge.exposeInMainWorld('petShell', {
  /** 取宠物定义列表 + 已保存的宿主状态。 */
  bootstrap: () => ipcRenderer.invoke('shell:bootstrap'),
  /** 保存宿主状态（位置/大小/可见性/亲密度等）。 */
  save: state => ipcRenderer.invoke('shell:save', state),
  /** 切换整屏浮层的鼠标穿透。 */
  setInteractive: on => ipcRenderer.send('shell:interactive', on === true),
  /** 托盘 / 自检发来的命令。 */
  onCommand: callback => {
    ipcRenderer.on('shell:command', (_event, command) => callback(command))
  },
  /** 主进程轮询到的系统光标位置（窗口内坐标），作为穿透判定的兜底。 */
  onCursor: callback => {
    ipcRenderer.on('shell:cursor', (_event, point) => callback(point))
  },
  /** 自检结果回传。 */
  report: data => ipcRenderer.send('shell:report', data),
  /** 双击宠物：隐藏 / 召唤。 */
  toggle: () => ipcRenderer.send('shell:toggle'),
  /** 打开聊天窗口。 */
  openChat: () => ipcRenderer.send('shell:open-chat'),
  /** 右键宠物：让主进程在光标处弹出菜单（显示/隐藏、大小、形象、退出）。 */
  menu: () => ipcRenderer.send('shell:menu'),
  /**
   * DSH 真实活动相位（主进程读 data/activity.json 后推过来）。
   * 取值与插件 state.ts 一致：idle / thinking / tool / review / done / failed / waiting。
   */
  onActivity: callback => {
    ipcRenderer.on('shell:activity', (_event, phase) => callback(phase))
  },
})
