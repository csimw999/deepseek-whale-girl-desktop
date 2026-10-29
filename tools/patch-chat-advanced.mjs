import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
let changes = 0
const apply = (from, to, label) => {
  if (!src.includes(from)) { console.log('skip: ' + label); return }
  src = src.replace(from, to)
  changes++
  console.log('ok: ' + label)
}

// 1) 支持「重生成」：允许没有新文本的请求
apply(
  `  const text = String((payload && payload.text) || '').trim()
  if (!text) return`,
  `  const text = String((payload && payload.text) || '').trim()
  if (!text && !(payload && payload.regenerate)) return`,
  'regenerate guard',
)

// 2) 重生成时弹掉最后一条 assistant；正常时压入用户消息并广播
apply(
  `  const options = (payload && payload.options) || {}
  loadChatHistory()
  chatHistory.push({ role: 'user', content: text })`,
  `  const options = (payload && payload.options) || {}
  loadChatHistory()
  if (payload && payload.regenerate) {
    while (chatHistory.length && chatHistory[chatHistory.length - 1].role === 'assistant') chatHistory.pop()
    if (!chatHistory.length) return
  } else {
    chatHistory.push({ role: 'user', content: text })
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)
  }`,
  'history push',
)

// 3) 去掉重复的广播（之前加过一行）
apply(
  `  chatHistory.push({ role: 'user', content: text })
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)`,
  `  chatHistory.push({ role: 'user', content: text })
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)`,
  'dedupe user broadcast',
)

// 4) 系统提示：角色卡 + 作者备注 + 世界书命中 + 长期记忆
apply(
  `function buildSystemPrompt(id) {
  const character = readCharacter(id)
  const memory = loadMemory(id)
  const memoryBlock = memory.length ? '\\n\\n【你记得关于他的事】\\n' + memory.map(line => '- ' + line).join('\\n') : ''
  return character.card + memoryBlock
}`,
  `function loadWorldbook(id) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'worldbook-' + (id || 'yexi') + '.json'), 'utf8')).entries || [] } catch { return [] }
}

function saveWorldbook(id, entries) {
  try { fs.writeFileSync(path.join(DATA_DIR, 'worldbook-' + (id || 'yexi') + '.json'), JSON.stringify({ entries }, null, 2), 'utf8') } catch {}
}

/** 关键词命中：取最近一条用户消息去匹配世界书的 keys */
function matchWorldbook(id, lastUserText) {
  if (!lastUserText) return []
  const text = String(lastUserText)
  return loadWorldbook(id).filter(entry => {
    const keys = String(entry.keys || '').split(/[,，、|]/).map(k => k.trim()).filter(Boolean)
    return keys.some(key => text.includes(key))
  })
}

function buildSystemPrompt(id) {
  const character = readCharacter(id)
  const memory = loadMemory(id)
  const parts = [character.card]

  if (character.authorNote && String(character.authorNote).trim()) {
    parts.push('\\n\\n【本轮特别备注】\\n' + String(character.authorNote).trim())
  }

  const lastUser = [...loadChatHistory(id)].reverse().find(item => item.role === 'user')
  const hits = matchWorldbook(id, lastUser && lastUser.content)
  if (hits.length) {
    parts.push('\\n\\n【相关设定】\\n' + hits.map(entry => '- ' + entry.content).join('\\n'))
  }

  if (memory.length) {
    parts.push('\\n\\n【你记得关于他的事】\\n' + memory.map(line => '- ' + line).join('\\n'))
  }

  return parts.join('')
}`,
  'system prompt + worldbook',
)

// 5) 新 IPC：重生成走 chat:send(regenerate)；编辑；备注；世界书；新建角色；history 返回角色
apply(
  `ipcMain.handle('chat:history', () => loadChatHistory())`,
  `ipcMain.handle('chat:history', () => ({ character: readCharacter(chatCharacterId), messages: loadChatHistory() }))
ipcMain.handle('chat:edit', (_event, payload) => {
  const index = Number((payload && payload.index) || 0)
  const content = String((payload && payload.content) || '')
  loadChatHistory()
  if (index >= 0 && index < chatHistory.length) {
    chatHistory = chatHistory.slice(0, index + 1)
    chatHistory[index] = { ...chatHistory[index], content }
    saveChatHistory()
  }
  return { messages: chatHistory }
})
ipcMain.handle('chat:note', (_event, text) => {
  const character = readCharacter(chatCharacterId)
  const next = { ...character, authorNote: String(text || '') }
  try { fs.writeFileSync(path.join(CHARACTER_DIR, chatCharacterId + '.json'), JSON.stringify(next, null, 2), 'utf8') } catch (error) { log('note save failed: ' + String(error)) }
  return true
})
ipcMain.handle('chat:worldbook', () => loadWorldbook(chatCharacterId))
ipcMain.handle('chat:worldbook-save', (_event, entries) => {
  saveWorldbook(chatCharacterId, Array.isArray(entries) ? entries : [])
  log('worldbook saved: ' + (Array.isArray(entries) ? entries.length : 0) + ' entries')
  return true
})
ipcMain.handle('chat:character-save', (_event, payload) => {
  ensureCharacters()
  const data = payload || {}
  const id = String(data.name || 'char').toLowerCase().replace(/[^a-z0-9\\u4e00-\\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || ('char-' + Date.now())
  const card = {
    id,
    name: String(data.name || '新角色'),
    tagline: String(data.tagline || ''),
    avatar: String(data.avatar || '🐋').slice(0, 4),
    card: String(data.card || ''),
    greeting: String(data.greeting || ''),
    authorNote: '',
  }
  try { fs.writeFileSync(path.join(CHARACTER_DIR, id + '.json'), JSON.stringify(card, null, 2), 'utf8') } catch (error) { log('character save failed: ' + String(error)) }
  chatCharacterId = id
  shellPrefs = { ...shellPrefs, chatCharacter: id }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  chatHistory = []
  log('character created: ' + id)
  return { list: listCharacters(), current: id, character: card }
})`,
  'new ipc',
)

// 6) set-character 返回角色信息
apply(
  `  loadChatHistory(chatCharacterId)
  const character = readCharacter(chatCharacterId)
  log('chat character -> ' + chatCharacterId)
  return { id: chatCharacterId, name: character.name, greeting: character.greeting || '', messages: chatHistory }`,
  `  loadChatHistory(chatCharacterId)
  const character = readCharacter(chatCharacterId)
  log('chat character -> ' + chatCharacterId)
  return { character, greeting: character.greeting || '', messages: chatHistory }`,
  'set-character return',
)

if (!changes) { console.error('nothing changed'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('--- main.js 更新 ' + changes + ' 处 ---')
