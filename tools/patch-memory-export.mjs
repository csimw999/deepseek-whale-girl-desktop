import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const mainPath = path.join(root, 'main.js')
const chatPath = path.join(root, 'ui', 'chat.html')
const preloadPath = path.join(root, 'preload-chat.js')

const norm = s => s.replace(/\r\n/g, '\n')
const restore = (s, eol) => s.replace(/\n/g, eol)

// ---------------- main.js ----------------
let raw = fs.readFileSync(mainPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
let s = norm(raw)
const before = s

if (!s.includes('// MEMORY_EDIT_EXPORT')) {
  s = s.replace(
    "ipcMain.handle('chat:memory', () => loadMemory(chatCharacterId)",
    `// MEMORY_EDIT_EXPORT: 记忆的增删查 + 对话导出/导入
ipcMain.handle('chat:memory-list', () => loadMemory(chatCharacterId))
ipcMain.handle('chat:memory-add', (_event, text) => {
  const value = String(text || '').trim()
  if (!value) return { ok: false }
  const list = loadMemory(chatCharacterId)
  list.push(value)
  while (list.length > 60) list.shift()
  fs.writeFileSync(memoryFile(chatCharacterId), JSON.stringify(list, null, 2), 'utf8')
  return { ok: true, list }
})
ipcMain.handle('chat:memory-remove', (_event, index) => {
  const list = loadMemory(chatCharacterId)
  const i = Number(index)
  if (Number.isInteger(i) && i >= 0 && i < list.length) list.splice(i, 1)
  fs.writeFileSync(memoryFile(chatCharacterId), JSON.stringify(list, null, 2), 'utf8')
  return { ok: true, list }
})
ipcMain.handle('chat:export', async () => {
  const character = readCharacter(chatCharacterId)
  const history = readChatHistory(chatCharacterId)
  if (!history.length) return { ok: false, reason: 'empty' }
  const stamp = new Date().toISOString().slice(0, 10)
  const defaultName = character.name + '-对话-' + stamp
  const result = await dialog.showSaveDialog(chatWin || undefined, {
    title: '导出对话',
    defaultPath: defaultName + '.md',
    filters: [
      { name: 'Markdown', extensions: ['md'] },
      { name: 'JSON（可再导入）', extensions: ['json'] },
    ],
  })
  if (result.canceled || !result.filePath) return { ok: false, reason: 'canceled' }
  const target = result.filePath
  if (target.toLowerCase().endsWith('.json')) {
    const payload = { character: { name: character.name, tagline: character.tagline }, exportedAt: new Date().toISOString(), messages: history }
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8')
  } else {
    const lines = ['# 和 ' + character.name + ' 的对话', '', '导出时间：' + new Date().toLocaleString('zh-CN'), '']
    for (const item of history) {
      const who = item.role === 'user' ? '我' : character.name
      lines.push('**' + who + '**：' + String(item.content || '').trim())
      lines.push('')
    }
    fs.writeFileSync(target, lines.join('\n'), 'utf8')
  }
  log('chat exported: ' + target)
  return { ok: true, file: target }
})
ipcMain.handle('chat:import', async () => {
  const result = await dialog.showOpenDialog(chatWin || undefined, {
    title: '导入对话（JSON）',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, reason: 'canceled' }
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))
    const messages = Array.isArray(data) ? data : data.messages
    if (!Array.isArray(messages) || !messages.length) return { ok: false, reason: 'bad-format' }
    const clean = messages
      .filter(item => item && (item.role === 'user' || item.role === 'assistant'))
      .map(item => ({ role: item.role, content: String(item.content || '') }))
    const file = path.join(DATA_DIR, 'chat-' + chatCharacterId + '.json')
    try { fs.copyFileSync(file, file + '.bak-' + Date.now()) } catch {}
    fs.writeFileSync(file, JSON.stringify({ messages: clean }, null, 2), 'utf8')
    log('chat imported: ' + clean.length + ' messages')
    return { ok: true, count: clean.length }
  } catch (error) {
    return { ok: false, reason: String(error) }
  }
})
ipcMain.handle('chat:memory', () => loadMemory(chatCharacterId)`,
  )
}

if (s === before) {
  console.error('main.js 未匹配到插入点')
  process.exit(1)
}
fs.writeFileSync(mainPath, restore(s, eol), 'utf8')
console.log('main.js: 记忆增删 + 导出/导入')

// ---------------- preload ----------------
let pre = fs.readFileSync(preloadPath, 'utf8')
if (!pre.includes('memoryList')) {
  pre = pre.replace(
    "  memory: () => ipcRenderer.invoke('chat:memory'),",
    `  memory: () => ipcRenderer.invoke('chat:memory'),
  memoryList: () => ipcRenderer.invoke('chat:memory-list'),
  memoryAdd: text => ipcRenderer.invoke('chat:memory-add', text),
  memoryRemove: index => ipcRenderer.invoke('chat:memory-remove', index),
  exportChat: () => ipcRenderer.invoke('chat:export'),
  importChat: () => ipcRenderer.invoke('chat:import'),`,
  )
  fs.writeFileSync(preloadPath, pre, 'utf8')
  console.log('preload: 5 个新方法')
}

// ---------------- chat.html ----------------
let html = fs.readFileSync(chatPath, 'utf8')
if (!html.includes('memoryModal')) {
  // 1) 记忆 chip 可点击
  html = html.replace(
    '<span class="chip" id="memChip"',
    '<span class="chip" id="memChip" style="cursor:pointer" data-tip="点击管理长期记忆"',
  )

  // 2) 侧栏加导出/导入按钮（放在「清空对话」前）
  html = html.replace(
    /(<button class="btn ghost" id="clearBtn">)/,
    `<button class="btn ghost" id="exportBtn">📤 导出对话</button>
    <button class="btn ghost" id="importBtn">📥 导入对话</button>
    $1`,
  )

  // 3) 记忆弹层（复用 worldModal 的样式）
  html = html.replace(
    '<div class="modal" id="worldModal">',
    `<div class="modal" id="memoryModal">
  <div class="card">
    <h3>长期记忆</h3>
    <p class="sub">她自动记住的关于你的事。记错的可以删掉，也可以手动补一条。</p>
    <div id="memoryList"></div>
    <div style="display:flex;gap:8px;margin-top:10px">
      <input id="memoryInput" placeholder="手动记一条，例如：他喜欢草莓布丁" style="flex:1;padding:10px 12px;border-radius:10px;border:1px solid #2c3a63;background:#141c31;color:#e8edfa" />
      <button class="btn" id="memoryAdd">添加</button>
    </div>
    <div class="actions">
      <button class="btn on" id="memoryClose">完成</button>
    </div>
  </div>
</div>

<div class="modal" id="worldModal">`,
  )

  fs.writeFileSync(chatPath, html, 'utf8')
  console.log('chat.html: chip + 按钮 + 弹层')
}
