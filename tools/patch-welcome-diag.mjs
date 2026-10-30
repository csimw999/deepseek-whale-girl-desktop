import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const mainPath = path.join(root, 'main.js')
const preloadPath = path.join(root, 'preload-settings.js')

let raw = fs.readFileSync(mainPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
let s = raw.replace(/\r\n/g, '\n')

const anchor = "ipcMain.handle('settings:download-model'"
if (!s.includes(anchor)) {
  console.error('找不到 settings:download-model 锚点')
  process.exit(1)
}

const block = [
  '',
  '// WELCOME_DIAG: 首次引导 + 诊断面板',
  'let welcomeWin = null',
  '',
  'function asrReady() {',
  "  const model = path.join(ROOT, 'voice-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17', 'model.int8.onnx')",
  "  const cli = path.join(ROOT, 'tools', 'sherpa', 'sherpa-onnx-v1.13.8-win-x64-shared-MD-Release', 'bin', 'sherpa-onnx-offline.exe')",
  '  return fs.existsSync(model) && fs.existsSync(cli)',
  '}',
  '',
  'function openWelcome() {',
  '  try {',
  '    if (welcomeWin && !welcomeWin.isDestroyed()) { welcomeWin.show(); welcomeWin.focus(); return }',
  '    welcomeWin = new BrowserWindow({',
  '      width: 560,',
  '      height: 640,',
  '      resizable: true,',
  '      frame: true,',
  '      title: "欢迎使用鲸鱼娘",',
  '      backgroundColor: "#101728",',
  "      webPreferences: { preload: path.join(ROOT, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },",
  '    })',
  "    welcomeWin.loadFile(path.join(ROOT, 'ui', 'welcome.html'))",
  "    welcomeWin.on('closed', () => { welcomeWin = null })",
  "    log('welcome window opened')",
  '  } catch (error) {',
  "    log('openWelcome failed: ' + String(error))",
  '  }',
  '}',
  '',
  "ipcMain.handle('welcome:state', async () => {",
  '  const character = readCharacter(chatCharacterId)',
  '  const models = await listOllamaModels()',
  '  return {',
  '    name: hostState.name || "鲸鱼娘",',
  '    characterName: character.name,',
  '    models,',
  '    ollamaReachable: models.length > 0,',
  '    asrReady: asrReady(),',
  '  }',
  '})',
  '',
  "ipcMain.handle('welcome:rename', (_event, name) => {",
  '  const value = String(name || "").trim() || "鲸鱼娘"',
  '  hostState = { ...hostState, name: value }',
  '  try { writeJson(HOST_FILE, hostState) } catch {}',
  '  try {',
  '    const character = readCharacter(chatCharacterId)',
  '    const payload = { ...character, name: value }',
  '    fs.writeFileSync(path.join(CHARACTER_DIR, chatCharacterId + ".json"), JSON.stringify(payload, null, 2), "utf8")',
  '  } catch {}',
  '  petSay("好，以后叫我 " + value + " 吧")',
  '  return { ok: true, name: value }',
  '})',
  '',
  "ipcMain.handle('welcome:finish', (_event, withPet) => {",
  '  shellPrefs = { ...shellPrefs, onboarded: true }',
  '  try { writeJson(SHELL_FILE, shellPrefs) } catch {}',
  '  if (welcomeWin && !welcomeWin.isDestroyed()) welcomeWin.close()',
  '  if (withPet !== false) { petFace("happy"); petSay("我出场啦，有事就叫我～") }',
  '  return { ok: true }',
  '})',
  '',
  'function diagnostics() {',
  '  return {',
  '    version: app.getVersion(),',
  '    packaged: IS_PACKAGED,',
  '    portable: PORTABLE_MODE,',
  '    electron: process.versions.electron,',
  '    node: process.versions.node,',
  '    chrome: process.versions.chrome,',
  '    platform: process.platform + " " + process.arch,',
  '    windows: require("node:os").release(),',
  '    home: HOME_DIR,',
  '    dataDir: DATA_DIR,',
  '    logFile: LOG_FILE,',
  '    character: chatCharacterId,',
  '    chatModel: chatModel,',
  '    asrReady: asrReady(),',
  '    voice: shellPrefs.voice !== false,',
  '    onboarded: shellPrefs.onboarded === true,',
  '    freeMemMB: Math.round(require("node:os").freemem() / 1048576),',
  '  }',
  '}',
  '',
  "ipcMain.handle('settings:diagnostics', async () => {",
  '  const info = diagnostics()',
  '  const models = await listOllamaModels()',
  '  return { ...info, models, ollamaReachable: models.length > 0 }',
  '})',
  '',
  "ipcMain.handle('settings:copy-diagnostics', async () => {",
  '  const info = diagnostics()',
  '  const models = await listOllamaModels()',
  '  const lines = [',
  '    "鲸鱼娘桌面版 诊断信息",',
  '    "版本: " + info.version + (info.packaged ? " (打包)" : " (源码)") + (info.portable ? " · 便携模式" : ""),',
  '    "Electron/Node/Chrome: " + info.electron + " / " + info.node + " / " + info.chrome,',
  '    "系统: " + info.platform + " · " + info.windows,',
  '    "数据目录: " + info.dataDir,',
  '    "日志: " + info.logFile,',
  '    "角色: " + info.character + " · 模型: " + info.chatModel,',
  '    "ollama: " + (models.length ? "已连接（" + models.join(", ") + "）" : "未连接"),',
  '    "语音识别: " + (info.asrReady ? "就绪" : "缺模型"),',
  '    "引导完成: " + (info.onboarded ? "是" : "否"),',
  '    "可用内存: " + info.freeMemMB + " MB",',
  '  ]',
  '  clipboard.writeText(lines.join(String.fromCharCode(10)))',
  '  return { ok: true, text: lines.join(String.fromCharCode(10)) }',
  '})',
  '',
  "ipcMain.handle('settings:open-path', (_event, which) => {",
  '  try {',
  '    if (which === "log") {',
  '      if (fs.existsSync(LOG_FILE)) shell.showItemInFolder(LOG_FILE)',
  '      else shell.openPath(DATA_DIR)',
  '      return { ok: true }',
  '    }',
  '    shell.openPath(DATA_DIR)',
  '    return { ok: true }',
  '  } catch (error) {',
  '    return { ok: false, reason: String(error) }',
  '  }',
  '})',
  '',
  "ipcMain.handle('settings:open-welcome', () => { openWelcome(); return { ok: true } })",
  '',
  anchor,
]

s = s.replace(anchor, block.join('\n'))

// 首次启动：没引导过就开引导窗口（替代直接弹下载框）
s = s.replace(
  '  setTimeout(() => { try { ensureChatModel(true) } catch (error) { log("ensure model failed: " + String(error)) } }, 25000)',
  '  setTimeout(() => {\n    try {\n      if (shellPrefs.onboarded === true) ensureChatModel(true)\n      else openWelcome()\n    } catch (error) { log("startup prompt failed: " + String(error)) }\n  }, 6000)',
)

fs.writeFileSync(mainPath, s.replace(/\n/g, eol), 'utf8')
console.log('main.js: 引导窗口 + 诊断 IPC 已加')

// preload-settings
let pre = fs.readFileSync(preloadPath, 'utf8')
if (!pre.includes('welcomeState')) {
  pre = pre.replace(
    "  close: () => ipcRenderer.send('settings:close'),",
    `  close: () => ipcRenderer.send('settings:close'),
  welcomeState: () => ipcRenderer.invoke('welcome:state'),
  rename: name => ipcRenderer.invoke('welcome:rename', name),
  finishWelcome: withPet => ipcRenderer.invoke('welcome:finish', withPet),
  downloadModel: name => ipcRenderer.invoke('settings:download-model', name),
  diagnostics: () => ipcRenderer.invoke('settings:diagnostics'),
  copyDiagnostics: () => ipcRenderer.invoke('settings:copy-diagnostics'),
  openPath: which => ipcRenderer.invoke('settings:open-path', which),
  openWelcome: () => ipcRenderer.invoke('settings:open-welcome'),`,
  )
  fs.writeFileSync(preloadPath, pre, 'utf8')
  console.log('preload-settings: 8 个新方法')
}
