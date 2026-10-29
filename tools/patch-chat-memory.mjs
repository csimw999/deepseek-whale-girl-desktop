import fs from 'node:fs'

const mainPath = process.argv[2]
const chatHtmlPath = process.argv[3]
const preloadChatPath = process.argv[4]

let src = fs.readFileSync(mainPath, 'utf8')
const before = src

// ---------- 1) 角色卡 / 记忆 / 模型选择 ----------
const block = `
// ---------- 角色卡 / 长期记忆 / 模型选择 ----------
const CHARACTER_DIR = path.join(DATA_DIR, 'characters')
const CHAT_MODEL_CANDIDATES = ['qwen2.5:7b', 'qwen2.5:3b', 'qwen2.5:1.5b']
let chatModel = 'qwen2.5:1.5b'

const DEFAULT_CHARACTER = {
  id: 'yexi',
  name: '鲸鱼娘',
  tagline: '住在你桌面上的鲸鱼娘\\n爱撒娇，也爱看你干活',
  avatar: '🐋',
  card: [
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
  ].join('\\n'),
  greeting: '*趴在桌角探头看你* 忙完这一段啦？我这儿还有半块布丁哦～',
}

function ensureCharacters() {
  try {
    fs.mkdirSync(CHARACTER_DIR, { recursive: true })
    const files = fs.readdirSync(CHARACTER_DIR).filter(name => name.endsWith('.json'))
    if (!files.length) {
      fs.writeFileSync(path.join(CHARACTER_DIR, 'yexi.json'), JSON.stringify(DEFAULT_CHARACTER, null, 2), 'utf8')
    }
  } catch (error) { log('characters init failed: ' + String(error)) }
}

function listCharacters() {
  ensureCharacters()
  const result = []
  try {
    for (const name of fs.readdirSync(CHARACTER_DIR)) {
      if (!name.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CHARACTER_DIR, name), 'utf8'))
        if (data && data.id && data.name) result.push({ id: data.id, name: data.name, tagline: data.tagline || '', avatar: data.avatar || '🐋' })
      } catch {}
    }
  } catch {}
  return result.length ? result : [{ id: 'yexi', name: '鲸鱼娘', tagline: '', avatar: '🐋' }]
}

function readCharacter(id) {
  ensureCharacters()
  try {
    return JSON.parse(fs.readFileSync(path.join(CHARACTER_DIR, (id || 'yexi') + '.json'), 'utf8'))
  } catch { return DEFAULT_CHARACTER }
}

function chatFile(id) { return path.join(DATA_DIR, 'chat-' + (id || 'yexi') + '.json') }
function memoryFile(id) { return path.join(DATA_DIR, 'memory-' + (id || 'yexi') + '.json') }

function loadMemory(id) {
  try { return JSON.parse(fs.readFileSync(memoryFile(id), 'utf8')).facts || [] } catch { return [] }
}

function saveMemory(id, facts) {
  try { fs.writeFileSync(memoryFile(id), JSON.stringify({ facts: facts.slice(-24) }, null, 2), 'utf8') } catch {}
}

/** 把最近若干轮对话压成几条关于用户的长期记忆（本地模型，不花 token） */
function updateMemory(id) {
  const character = readCharacter(id)
  const history = loadChatHistory(id)
  if (history.length < 8) return
  const slice = history.slice(-16).map(item => (item.role === 'user' ? '用户：' : character.name + '：') + item.content).join('\\n')
  const body = JSON.stringify({
    model: chatModel,
    stream: false,
    messages: [
      { role: 'system', content: '你是一个记忆整理助手。请从对话里提炼关于"用户"的稳定事实与偏好（例如在做什么项目、作息、喜欢什么、讨厌什么）。只输出 3-6 条短句，每行一条，不要编号，不要解释。没有就输出空。' },
      { role: 'user', content: slice },
    ],
    options: { temperature: 0.3, num_predict: 160 },
  })
  const url = new URL('http://127.0.0.1:11434/api/chat')
  const req = require('node:http').request({
    hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 60000,
  }, res => {
    let raw = ''
    res.on('data', chunk => { raw += chunk })
    res.on('end', () => {
      try {
        const data = JSON.parse(raw)
        const text = String((data.message && data.message.content) || '').trim()
        const facts = text.split(/\\n+/).map(line => line.replace(/^[-*\\d.、\\s]+/, '').trim()).filter(line => line.length >= 4 && line.length <= 80)
        if (facts.length) {
          const merged = [...loadMemory(id), ...facts]
          saveMemory(id, Array.from(new Set(merged)).slice(-24))
          log('memory updated: ' + facts.length + ' facts')
        }
      } catch {}
    })
  })
  req.on('error', () => {})
  req.write(body)
  req.end()
}

function buildSystemPrompt(id) {
  const character = readCharacter(id)
  const memory = loadMemory(id)
  const memoryBlock = memory.length ? '\\n\\n【你记得关于他的事】\\n' + memory.map(line => '- ' + line).join('\\n') : ''
  return character.card + memoryBlock
}

/** 选一个本地实际存在的最强模型 */
function pickChatModel() {
  return new Promise(resolve => {
    const url = new URL('http://127.0.0.1:11434/api/tags')
    const req = require('node:http').request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 5000 }, res => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        try {
          const names = (JSON.parse(raw).models || []).map(item => item.name)
          const found = CHAT_MODEL_CANDIDATES.find(name => names.includes(name))
          resolve(found || 'qwen2.5:1.5b')
        } catch { resolve('qwen2.5:1.5b') }
      })
    })
    req.on('error', () => resolve('qwen2.5:1.5b'))
    req.on('timeout', () => { req.destroy(); resolve('qwen2.5:1.5b') })
    req.end()
  })
}
`

if (!src.includes('function buildSystemPrompt')) {
  src = src.replace('let chatWin = null', block + '\nlet chatWin = null')
}

// ---------- 2) 让 chatRespond / history / clear 支持角色 ----------
src = src.replace(
  `function loadChatHistory() {
  try {
    const data = JSON.parse(fs.readFileSync(CHAT_FILE, 'utf8'))
    chatHistory = Array.isArray(data.messages) ? data.messages : []
  } catch { chatHistory = [] }
  return chatHistory
}`,
  `let chatCharacterId = 'yexi'

function loadChatHistory(id) {
  const target = id || chatCharacterId
  try {
    const data = JSON.parse(fs.readFileSync(chatFile(target), 'utf8'))
    chatHistory = Array.isArray(data.messages) ? data.messages : []
  } catch { chatHistory = [] }
  return chatHistory
}`,
)

src = src.replace(
  `    fs.writeFileSync(CHAT_FILE, JSON.stringify({ messages: chatHistory.slice(-200) }, null, 2), 'utf8')`,
  `    fs.writeFileSync(chatFile(chatCharacterId), JSON.stringify({ messages: chatHistory.slice(-200) }, null, 2), 'utf8')`,
)

src = src.replace(
  `  const messages = [
    { role: 'system', content: CHARACTER_CARD },
    ...chatHistory.slice(-CHAT_MAX_TURNS),
  ]`,
  `  const messages = [
    { role: 'system', content: buildSystemPrompt(chatCharacterId) },
    ...chatHistory.slice(-CHAT_MAX_TURNS),
  ]`,
)

src = src.replace(
  `    model: CHAT_MODEL,
    stream: true,`,
  `    model: chatModel,
    stream: true,`,
)

src = src.replace(
  `    if (full) {
      petSay(full.slice(0, 90))`,
  `    if (chatHistory.length % 16 === 0) updateMemory(chatCharacterId)
    if (full) {
      petSay(full.slice(0, 90))`,
)

// ---------- 3) 新 IPC：角色 / 模型 ----------
if (!src.includes("'chat:characters'")) {
  src = src.replace(
    "ipcMain.handle('chat:clear'",
    `ipcMain.handle('chat:characters', () => ({ list: listCharacters(), current: chatCharacterId }))
ipcMain.handle('chat:set-character', (_event, id) => {
  chatCharacterId = String(id || 'yexi')
  shellPrefs = { ...shellPrefs, chatCharacter: chatCharacterId }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  loadChatHistory(chatCharacterId)
  const character = readCharacter(chatCharacterId)
  log('chat character -> ' + chatCharacterId)
  return { id: chatCharacterId, name: character.name, greeting: character.greeting || '', messages: chatHistory }
})
ipcMain.handle('chat:set-model', (_event, model) => {
  chatModel = String(model || chatModel)
  shellPrefs = { ...shellPrefs, chatModel }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  log('chat model -> ' + chatModel)
  return chatModel
})
ipcMain.handle('chat:models', async () => ({ current: chatModel, candidates: CHAT_MODEL_CANDIDATES }))
ipcMain.handle('chat:memory', () => loadMemory(chatCharacterId))

ipcMain.handle('chat:clear'`,
  )
}

// 启动时选模型 + 恢复角色
src = src.replace(
  "      startActivityWatcher()",
  `      ensureCharacters()
      chatCharacterId = shellPrefs.chatCharacter || 'yexi'
      pickChatModel().then(found => {
        chatModel = shellPrefs.chatModel || found
        log('chat model ready: ' + chatModel)
      })
      startActivityWatcher()`,
)

if (src === before) { console.error('main.js unchanged'); process.exit(1) }
fs.writeFileSync(mainPath, src, 'utf8')
console.log('main.js: 角色卡 + 记忆 + 模型选择')

// ---------- 4) preload-chat ----------
let pre = fs.readFileSync(preloadChatPath, 'utf8')
if (!pre.includes('setCharacter')) {
  pre = pre.replace(
    '  clear: () => ipcRenderer.invoke(\'chat:clear\'),',
    `  clear: () => ipcRenderer.invoke('chat:clear'),
  characters: () => ipcRenderer.invoke('chat:characters'),
  setCharacter: id => ipcRenderer.invoke('chat:set-character', id),
  models: () => ipcRenderer.invoke('chat:models'),
  setModel: model => ipcRenderer.invoke('chat:set-model', model),
  memory: () => ipcRenderer.invoke('chat:memory'),`,
  )
  fs.writeFileSync(preloadChatPath, pre, 'utf8')
  console.log('preload-chat: 角色/模型接口')
}

// ---------- 5) chat.html：角色选择 + 模型选择 ----------
let html = fs.readFileSync(chatHtmlPath, 'utf8')
if (!html.includes('charSel')) {
  html = html.replace(
    `    <div class="stat"><span>本地模型</span><b id="modelName">qwen2.5:1.5b</b></div>`,
    `    <div class="stat"><span>角色</span>
      <select id="charSel" style="background:#151f38;color:#cfd9f5;border:1px solid rgba(126,152,255,.28);border-radius:6px;font:inherit"></select>
    </div>
    <div class="stat"><span>本地模型</span>
      <select id="modelSel" style="background:#151f38;color:#cfd9f5;border:1px solid rgba(126,152,255,.28);border-radius:6px;font:inherit"></select>
    </div>`,
  )
  html = html.replace(
    "  input.focus()\n</script>",
    `  // 角色 / 模型选择
  const charSel = document.getElementById('charSel')
  const modelSel = document.getElementById('modelSel')

  api.characters().then(info => {
    charSel.innerHTML = ''
    for (const item of info.list) {
      const option = document.createElement('option')
      option.value = item.id
      option.textContent = item.name
      if (item.id === info.current) option.selected = true
      charSel.append(option)
    }
  })
  api.models().then(info => {
    modelSel.innerHTML = ''
    for (const name of info.candidates) {
      const option = document.createElement('option')
      option.value = name
      option.textContent = name
      if (name === info.current) option.selected = true
      modelSel.append(option)
    }
    document.getElementById('modelName').textContent = info.current
  })

  charSel.onchange = async () => {
    const data = await api.setCharacter(charSel.value)
    log.innerHTML = ''
    for (const item of data.messages || []) bubble(item.role === 'user' ? 'user' : 'assistant', item.content)
    if (!(data.messages || []).length && data.greeting) bubble('assistant', data.greeting)
    document.querySelector('.name').textContent = data.name
    turnCount = 0
    document.getElementById('turnCount').textContent = '0'
  }

  modelSel.onchange = async () => {
    await api.setModel(modelSel.value)
    document.getElementById('modelName').textContent = modelSel.value
  }

  input.focus()
</script>`,
  )
  fs.writeFileSync(chatHtmlPath, html, 'utf8')
  console.log('chat.html: 角色/模型选择')
}
