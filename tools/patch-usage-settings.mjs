import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

const block = `
// ---------- 用量 / 余额（宿主级，任何形态都能看） ----------
const USAGE_DIR = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', 'dsh-usage')

function readUsage() {
  const result = { balance: null, currency: 'CNY', cost: 0, tokens: 0, calls: 0, at: 0 }
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(USAGE_DIR, 'provider-snapshots.json'), 'utf8'))
    const providers = (snap && snap.providers) || {}
    for (const key of Object.keys(providers)) {
      const balance = providers[key] && providers[key].balance
      if (balance && balance.totalBalance !== undefined) {
        result.balance = balance.totalBalance
        result.currency = balance.currency || 'CNY'
        result.at = balance.updatedAt || 0
        break
      }
    }
  } catch {}
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(USAGE_DIR, 'usage-ledger.json'), 'utf8'))
    const today = new Date()
    const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
    const day = (ledger && ledger.days && ledger.days[key]) || {}
    for (const provider of Object.keys(day)) {
      for (const model of Object.keys(day[provider] || {})) {
        const item = day[provider][model] || {}
        result.cost += Number(item.cost) || 0
        result.calls += Number(item.calls) || 0
        result.tokens +=
          (Number(item.inputTokens) || 0) +
          (Number(item.outputTokens) || 0) +
          (Number(item.cacheReadTokens) || 0) +
          (Number(item.cacheWriteTokens) || 0)
      }
    }
  } catch {}
  return result
}

function humanTokens(count) {
  if (count >= 1e8) return (count / 1e8).toFixed(2) + ' 亿'
  if (count >= 1e4) return (count / 1e4).toFixed(1) + ' 万'
  return String(count)
}

/** 全局余额面板：原生菜单，任何形态都能弹（不依赖页面里的 DOM）。 */
function showUsageMenu() {
  const usage = readUsage()
  const symbol = usage.currency === 'CNY' ? '¥' : usage.currency + ' '
  const at = usage.at ? new Date(usage.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'
  const menu = Menu.buildFromTemplate([
    { label: '余额  ' + (usage.balance === null ? '（不可用）' : symbol + usage.balance), enabled: false },
    { label: '今日  ' + symbol + usage.cost.toFixed(2) + ' · ' + humanTokens(usage.tokens) + ' tokens · ' + usage.calls + ' 次', enabled: false },
    { label: '更新于 ' + at, enabled: false },
    { type: 'separator' },
    { label: '打开设置…', click: () => openSettings() },
    { label: '刷新', click: () => showUsageMenu() },
  ])
  menu.popup({ window: win && !win.isDestroyed() ? win : undefined })
  log('usage menu: balance=' + usage.balance + ' cost=' + usage.cost.toFixed(2) + ' tokens=' + usage.tokens)
}

// ---------- 设置窗口 ----------
let settingsWin = null

function autoStartCommand() {
  return '"' + process.execPath + '" "' + ROOT + '" --no-sandbox --user-data-dir="' + path.join(DATA_DIR, 'userdata') + '"'
}

function readAutoStart() {
  try {
    const { execFileSync } = require('node:child_process')
    execFileSync('reg', ['query', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', 'WhaleGirlDesktop'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function writeAutoStart(on) {
  try {
    const { execFileSync } = require('node:child_process')
    if (on) {
      execFileSync('reg', ['add', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', 'WhaleGirlDesktop', '/t', 'REG_SZ', '/d', autoStartCommand(), '/f'], { stdio: 'pipe' })
    } else {
      execFileSync('reg', ['delete', 'HKCU\\\\Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run', '/v', 'WhaleGirlDesktop', '/f'], { stdio: 'pipe' })
    }
    return true
  } catch (error) {
    log('autostart failed: ' + String(error))
    return false
  }
}

function settingsState() {
  return {
    size: hostState.display.size,
    form: shellPrefs.form || 'live2d',
    autoStart: readAutoStart(),
    petId: hostState.petId,
  }
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 470,
    resizable: false,
    frame: true,
    title: '鲸鱼娘 · 设置',
    backgroundColor: '#12182a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(path.join(ROOT, 'ui', 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
  log('settings window opened')
}
`

if (!src.includes('function showUsageMenu')) {
  src = src.replace('function createLive2DPreview', block + '\nfunction createLive2DPreview')
  // createLive2DPreview 已被删掉，退回到锚点：插在 loadForm 之前
  if (src === before) {
    src = before.replace('/** 切换渲染形态', block + '\n/** 切换渲染形态')
  }
}
if (!src.includes('function showUsageMenu')) {
  src = src.replace('function loadForm(form) {', block + '\nfunction loadForm(form) {')
}

// Ctrl+Alt+B 改为全局余额面板（不再依赖 Live2D 页面）
src = src.replace(
  `              win.webContents.executeJavaScript(
                "window.DSHPet && window.DSHPet.hud && window.DSHPet.hud.show({ flash: true })",
              ).catch(() => {})`,
  '              showUsageMenu()',
)

// 设置窗口的 IPC + 热键
if (!src.includes('settings:get')) {
  src = src.replace(
    "ipcMain.on('shell:interactive'",
    `ipcMain.handle('settings:get', () => settingsState())
ipcMain.handle('settings:size', (_event, size) => {
  const value = Number(size) || 160
  hostState.display = { ...hostState.display, size: value }
  writeJson(HOST_FILE, hostState)
  sendCommand({ type: 'display', patch: { size: value } })
  refreshTray()
  return settingsState()
})
ipcMain.handle('settings:form', (_event, form) => {
  loadForm(form === 'pixel' ? 'pixel' : 'live2d')
  refreshTray()
  return settingsState()
})
ipcMain.handle('settings:autostart', (_event, on) => {
  writeAutoStart(on === true)
  return settingsState()
})
ipcMain.on('settings:usage', () => showUsageMenu())
ipcMain.on('settings:quit', () => app.quit())
ipcMain.on('settings:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close() })

ipcMain.on('shell:interactive'`,
  )

  src = src.replace(
    "      const hudAccel = [",
    `      const settingsAccel = ['Control+Alt+S', 'Control+Shift+S']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey settings'); openSettings() }) } catch { return false } }) || null
      const hudAccel = [`,
  )
  src = src.replace(
    "+ ' hud=' + hudAccel)",
    "+ ' hud=' + hudAccel + ' settings=' + settingsAccel)",
  )
}

if (src === before) { console.error('nothing changed'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('main.js patched: usage menu + settings window')
