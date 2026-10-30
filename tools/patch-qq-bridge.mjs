import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const mainPath = path.join(root, 'main.js')
const preloadPath = path.join(root, 'preload-settings.js')

let raw = fs.readFileSync(mainPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
let s = raw.replace(/\r\n/g, '\n')

const anchor = '// WELCOME_DIAG: 首次引导 + 诊断面板'
if (!s.includes(anchor)) {
  console.error('找不到 WELCOME_DIAG 锚点')
  process.exit(1)
}

const block = [
  '// QQ_BRIDGE: OneBot 11 HTTP 上报 → 本地模型 → 回复',
  "const { createBridge } = require(path.join(ROOT, 'lib', 'qq-bridge.js'))",
  '',
  'let qqBridge = null',
  'let qqHistory = []',
  '',
  'function qqConfig() {',
  '  const cfg = shellPrefs.qq || {}',
  '  return {',
  "    enabled: cfg.enabled === true,",
  '    port: Number(cfg.port) || 3002,',
  "    apiBase: String(cfg.apiBase || 'http://127.0.0.1:3000'),",
  "    token: String(cfg.token || ''),",
  "    users: String(cfg.users || ''),",
  "    groups: String(cfg.groups || ''),",
  '  }',
  '}',
  '',
  'function buildQqPrompt(id, userText) {',
  '  const character = readCharacter(id)',
  '  const memory = loadMemory(id)',
  '  const parts = [character.card]',
  "  parts.push('\\n\\n【场景】你正在 QQ 上和主人聊天。回复要短（1-2 句），像发消息一样自然，不要用 markdown。')",
  '  if (character.authorNote && String(character.authorNote).trim()) {',
  "    parts.push('\\n\\n【本轮特别备注】\\n' + String(character.authorNote).trim())",
  '  }',
  '  const hits = matchWorldbook(id, userText)',
  '  if (hits.length) {',
  "    parts.push('\\n\\n【相关设定】\\n' + hits.map(entry => '- ' + entry.content).join('\\n'))",
  '  }',
  '  if (memory.length) {',
  "    parts.push('\\n\\n【你记得关于他的事】\\n' + memory.map(line => '- ' + line).join('\\n'))",
  '  }',
  "  return parts.join('')",
  '}',
  '',
  'function askOllamaMessages(messages) {',
  '  return new Promise(resolve => {',
  '    const body = JSON.stringify({',
  '      model: chatModel || OLLAMA_MODEL,',
  '      stream: false,',
  '      messages,',
  '      options: { temperature: 0.85, num_predict: 220 },',
  '    })',
  "    const url = new URL('http://127.0.0.1:11434/api/chat')",
  '    const request = require("node:http").request({',
  '      hostname: url.hostname, port: url.port, path: url.pathname, method: "POST",',
  "      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },",
  '      timeout: 90000,',
  '    }, response => {',
  "      let text = ''",
  "      response.on('data', chunk => { text += chunk })",
  "      response.on('end', () => {",
  '        try {',
  '          const data = JSON.parse(text)',
  "          resolve(String((data.message && data.message.content) || '').trim())",
  "        } catch { resolve('') }",
  '      })',
  '    })',
  "    request.on('error', error => { log('qq ollama failed: ' + String(error)); resolve('') })",
  "    request.on('timeout', () => { request.destroy(); resolve('') })",
  '    request.write(body)',
  '    request.end()',
  '  })',
  '}',
  '',
  'async function qqReply(text, meta) {',
  '  const prompt = buildQqPrompt(chatCharacterId, text)',
  '  const messages = [{ role: "system", content: prompt }, ...qqHistory.slice(-10), { role: "user", content: text }]',
  '  const reply = await askOllamaMessages(messages)',
  '  if (!reply) return ""',
  '  qqHistory.push({ role: "user", content: text }, { role: "assistant", content: reply })',
  '  if (qqHistory.length > 20) qqHistory = qqHistory.slice(-20)',
  '  log("qq reply for " + meta.type + " " + meta.userId + ": " + reply.slice(0, 40))',
  '  return reply',
  '}',
  '',
  'function startQqBridge() {',
  '  try {',
  '    const cfg = qqConfig()',
  '    if (!cfg.enabled) return',
  '    if (!qqBridge) {',
  '      qqBridge = createBridge({',
  '        log,',
  '        getConfig: qqConfig,',
  '        onMessage: qqReply,',
  '      })',
  '    }',
  '    qqBridge.stop()',
  '    qqBridge.start()',
  '  } catch (error) {',
  '    log("qq bridge start failed: " + String(error))',
  '  }',
  '}',
  '',
  "ipcMain.handle('qq:state', () => ({ config: qqConfig(), status: qqBridge ? qqBridge.status() : { listening: false } }))",
  "ipcMain.handle('qq:save', (_event, patch) => {",
  '  const next = { ...qqConfig(), ...(patch || {}) }',
  '  next.enabled = next.enabled === true',
  '  next.port = Number(next.port) || 3002',
  '  shellPrefs = { ...shellPrefs, qq: next }',
  '  try { writeJson(SHELL_FILE, shellPrefs) } catch {}',
  '  if (next.enabled) startQqBridge()',
  '  else if (qqBridge) qqBridge.stop()',
  '  return { ok: true, config: qqConfig(), status: qqBridge ? qqBridge.status() : { listening: false } }',
  '})',
  "ipcMain.handle('qq:test', async (_event, userId) => {",
  '  if (!qqBridge) return { ok: false, reason: "桥没启动（先打开开关）" }',
  '  try {',
  "    return await qqBridge.sendTest(userId, '测试消息：鲸鱼娘的 QQ 桥已连通 ✅')",
  '  } catch (error) {',
  '    return { ok: false, reason: String(error) }',
  '  }',
  '})',
  '',
  anchor,
]

s = s.replace(anchor, block.join('\n'))

// 启动时按配置拉起桥
s = s.replace(
  '  setTimeout(() => {',
  '  setTimeout(() => { try { startQqBridge() } catch (error) { log("qq start failed: " + String(error)) } }, 4000)\n  setTimeout(() => {',
)

fs.writeFileSync(mainPath, s.replace(/\n/g, eol), 'utf8')
console.log('main.js: QQ 桥已接入')

// preload
let pre = fs.readFileSync(preloadPath, 'utf8')
if (!pre.includes('qqState')) {
  pre = pre.replace(
    "  openWelcome: () => ipcRenderer.invoke('settings:open-welcome'),",
    `  openWelcome: () => ipcRenderer.invoke('settings:open-welcome'),
  qqState: () => ipcRenderer.invoke('qq:state'),
  qqSave: patch => ipcRenderer.invoke('qq:save', patch),
  qqTest: userId => ipcRenderer.invoke('qq:test', userId),`,
  )
  fs.writeFileSync(preloadPath, pre, 'utf8')
  console.log('preload-settings: QQ 三个方法')
}
