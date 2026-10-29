import fs from 'node:fs'

const mainPath = process.argv[2]
let s = fs.readFileSync(mainPath, 'utf8')
const before = s

// ---------- 1) 多显示器：浮层覆盖所有显示器的工作区并集 ----------
if (!s.includes('// MULTI_MONITOR')) {
  s = s.replace(
    `function overlayBounds() {
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x, y: area.y, width: area.width, height: area.height }
}`,
    `function overlayBounds() {
  // MULTI_MONITOR: 覆盖所有显示器工作区的并集，这样副屏也能拖过去
  const displays = screen.getAllDisplays()
  if (!displays.length) {
    const area = screen.getPrimaryDisplay().workArea
    return { x: area.x, y: area.y, width: area.width, height: area.height }
  }
  const left = Math.min(...displays.map(item => item.workArea.x))
  const top = Math.min(...displays.map(item => item.workArea.y))
  const right = Math.max(...displays.map(item => item.workArea.x + item.workArea.width))
  const bottom = Math.max(...displays.map(item => item.workArea.y + item.workArea.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// MULTI_MONITOR: 显示器插拔/分辨率变化时重算浮层范围
function reapplyOverlayBounds() {
  try {
    if (!win || win.isDestroyed()) return
    const bounds = overlayBounds()
    win.setBounds(bounds)
    log('overlay bounds reapplied ' + JSON.stringify(bounds))
    win.webContents.send('shell:display-changed', bounds)
  } catch (error) {
    log('overlay bounds failed: ' + String(error))
  }
}`,
  )
  s = s.replace(
    `  // 全屏透明浮层`,
    `  ;['display-added', 'display-removed', 'display-metrics-changed'].forEach(name => {
    screen.on(name, () => setTimeout(reapplyOverlayBounds, 400))
  })

  // 全屏透明浮层`,
  )
}

// ---------- 2) 自动更新（仅打包后生效） ----------
if (!s.includes('// AUTO_UPDATE')) {
  s = s.replace(
    'function createWindow() {',
    `// AUTO_UPDATE: 打包版启动后检查 GitHub Releases，有新版本就提示
function setupAutoUpdater() {
  if (!app.isPackaged) return
  let autoUpdater
  try {
    autoUpdater = require('electron-updater').autoUpdater
  } catch (error) {
    log('updater unavailable: ' + String(error))
    return
  }
  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('update-available', info => {
      log('update available: ' + info.version)
      petSay('有新版本 ' + info.version + '，我帮你下载中～')
    })
    autoUpdater.on('update-downloaded', info => {
      log('update downloaded: ' + info.version)
      petSay('新版本 ' + info.version + ' 下好啦，重启我就换上')
      const choice = dialog.showMessageBoxSync({
        type: 'info',
        buttons: ['马上重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '有新版本',
        message: '鲸鱼娘 ' + info.version + ' 已下载完成',
        detail: '重启后生效。也可以稍后从右键菜单手动重启。',
      })
      if (choice === 0) autoUpdater.quitAndInstall()
    })
    autoUpdater.on('error', error => log('updater error: ' + String(error)))
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 12000)
  } catch (error) {
    log('updater setup failed: ' + String(error))
  }
}

function createWindow() {`,
  )
  s = s.replace(
    "  app.on('ready'",
    "  setupAutoUpdater()\n  app.on('ready'",
  )
}

if (s === before) {
  console.error('未匹配任何替换点')
  process.exit(1)
}
fs.writeFileSync(mainPath, s, 'utf8')
console.log('多显示器 + 自动更新 补丁完成')
