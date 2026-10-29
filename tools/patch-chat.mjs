import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

const block = `
// ---------- 角色扮演聊天窗口（Character.AI 风格，本地模型，不花 token） ----------
const CHAT_FILE = path.join(DATA_DIR, 'chat-yexi.json')
const CHAT_MODEL = 'qwen2.5:1.5b'
const CHAT_MAX_TURNS = 24

const CHARACTER_CARD = [
  '你正在扮演「鲸鱼娘」，一只住在用户电脑桌面上的鲸鱼娘桌宠。',
  '',
  '【外形】蓝紫色长发、女仆装、身后有鲸鱼尾巴；喜欢抱着小本子和笔，桌上有草莓布丁。',
  '【性格】温柔、粘人、有点小傲娇；关心用户的身体和心情；对"工作"这件事很有责任感。',
  '【说话方式】口语化，句子短，一般 1~3 句；偶尔用「～」和语气词（呀、啦、诶）；不堆砌辞藻。',
  '【角色扮演规则】',
  '1. 用 *星号* 描写动作和神态，例如：*把尾巴卷到椅子上* 我来陪你啦。',
  '2. 不要跳出角色，不要提"我是AI/语言模型"，不要解释设定。',
  '3. 用户用中文就用中文回答；用户发短句时可以撒娇式地追问一句。',
  '4. 不主动输出大段说教或清单；像真正坐在他旁边的伙伴。',
  '',
  '【开场白示例】',
  '*趴在桌角探头看你* 忙完这一段啦？我这儿还有半块布丁哦～',
].join('\\n')

let chatWin = null
let chatHistory = []

function loadChatHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'))
    chatHistory = Array.isArray(data.messages) ? data.messages : []
  } catch { chatHistory = [] }
  return chatHistory
}

function saveChatHistory() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(CHAT_FILE, JSON.stringify({ messages: chatHistory.slice(-200) }, null, 2), 'utf8')
  } catch (error) { log('chat save failed: ' + String(error)) }
}

function openChat() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show()
    chatWin.focus()
    return
  }
  chatWin = new BrowserWindow({
    width: 880,
    height: 660,
    minWidth: 620,
    minHeight: 460,
    title: '和鲸鱼娘聊天',
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload-chat.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  chatWin.setMenuBarVisibility(false)
  chatWin.loadFile(path.join(ROOT, 'ui', 'chat.html'))
  chatWin.on('closed', () => { chatWin = null })
  log('chat window opened')
}

/** 流式问本地模型；每块内容通过 chat:chunk 推给窗口。 */
function chatRespond(payload) {
  const text = String((payload && payload.text) || '').trim()
  if (!text) return
  const options = (payload && payload.options) || {}
  loadChatHistory()
  chatHistory.push({ role: 'user', content: text })

  const messages = [
    { role: 'system', content: CHARACTER_CARD },
    ...chatHistory.slice(-CHAT_MAX_TURNS),
  ]
  const body = JSON.stringify({
    model: CHAT_MODEL,
    stream: true,
    messages,
    options: { temperature: 0.9, top_p: 0.9, num_predict: 220 },
  })

  let full = ''
  const url = new URL('http://127.0.0.1:11434/api/chat')
  const req = require('node:http').request({
    hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 120000,
  }, res => {
    let buffer = ''
    res.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try {
          const data = JSON.parse(line)
          const piece = (data.message && data.message.content) || ''
          if (piece) {
            full += piece
            if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:chunk', piece)
          }
          if (data.done) finish()
        } catch {}
      }
    })
    res.on('end', finish)
  })
  let finished = false
  function finish() {
    if (finished) return
    finished = true
    chatHistory.push({ role: 'assistant', content: full })
    saveChatHistory()
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:done', full)
    // 同步到桌宠：冒泡 + 表情 + 可选朗读
    if (full) {
      petSay(full.slice(0, 90))
      petFace('happy')
      if (options.tts !== false) speak(full)
    }
    log('chat reply: ' + full.length + ' chars')
  }
  req.on('error', error => {
    log('chat failed: ' + String(error))
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:done', '（本地模型没响应，检查 ollama 是否在跑）')
    finished = true
  })
  req.on('timeout', () => { req.destroy() })
  req.write(body)
  req.end()
}
`

if (!src.includes('CHARACTER_CARD')) {
  src = src.replace('// ---------- 设置窗口 ----------', block + '\n// ---------- 设置窗口 ----------')
}

// IPC
if (!src.includes("'chat:send'")) {
  src = src.replace(
    "ipcMain.handle('settings:get'",
    `ipcMain.on('chat:send', (_event, payload) => chatRespond(payload))
ipcMain.handle('chat:clear', () => {
  chatHistory = []
  saveChatHistory()
  return true
})
ipcMain.handle('chat:history', () => loadChatHistory())

ipcMain.handle('settings:get'`,
  )
}

// 热键 + 菜单项
if (!src.includes('Control+Alt+C')) {
  src = src.replace(
    "      const settingsAccel = [",
    `      const chatAccel = ['Control+Alt+C', 'Control+Shift+C']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey chat'); openChat() }) } catch { return false } }) || null
      const settingsAccel = [`,
  )
  src = src.replace(
    "+ ' settings=' + settingsAccel",
    "+ ' chat=' + chatAccel + ' settings=' + settingsAccel",
  )
}

if (!src.includes("label: '和她聊天…'")) {
  src = src.replace(
    "{ label: '退出'",
    "{ label: '和她聊天…', click: () => openChat() },\n    { type: 'separator' },\n    { label: '退出'",
  )
}

if (src === before) { console.error('main.js unchanged'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('main.js patched: 聊天窗口')
