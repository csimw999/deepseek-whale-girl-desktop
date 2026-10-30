import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const mainPath = path.join(root, 'main.js')

let raw = fs.readFileSync(mainPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
let s = raw.replace(/\r\n/g, '\n')

const anchor = "ipcMain.handle('chat:memory', () => loadMemory(chatCharacterId)"
if (!s.includes(anchor)) {
  console.error('找不到插入锚点')
  process.exit(1)
}

// 逐行构造，避免模板里的转义被展开
const lines = [
  '// MEMORY_EDIT_EXPORT: 记忆增删查 + 对话导出/导入',
  "ipcMain.handle('chat:memory-list', () => loadMemory(chatCharacterId))",
  "ipcMain.handle('chat:memory-add', (_event, text) => {",
  "  const value = String(text || '').trim()",
  '  if (!value) return { ok: false }',
  '  const list = loadMemory(chatCharacterId)',
  '  list.push(value)',
  '  while (list.length > 60) list.shift()',
  "  fs.writeFileSync(memoryFile(chatCharacterId), JSON.stringify(list, null, 2), 'utf8')",
  '  return { ok: true, list }',
  '})',
  "ipcMain.handle('chat:memory-remove', (_event, index) => {",
  '  const list = loadMemory(chatCharacterId)',
  '  const i = Number(index)',
  '  if (Number.isInteger(i) && i >= 0 && i < list.length) list.splice(i, 1)',
  "  fs.writeFileSync(memoryFile(chatCharacterId), JSON.stringify(list, null, 2), 'utf8')",
  '  return { ok: true, list }',
  '})',
  "ipcMain.handle('chat:export', async () => {",
  '  const character = readCharacter(chatCharacterId)',
  '  const history = readChatHistory(chatCharacterId)',
  "  if (!history.length) return { ok: false, reason: 'empty' }",
  "  const stamp = new Date().toISOString().slice(0, 10)",
  "  const defaultName = character.name + '-chat-' + stamp",
  '  const result = await dialog.showSaveDialog(chatWin || undefined, {',
  "    title: '导出对话',",
  "    defaultPath: defaultName + '.md',",
  '    filters: [',
  "      { name: 'Markdown', extensions: ['md'] },",
  "      { name: 'JSON（可再导入）', extensions: ['json'] },",
  '    ],',
  '  })',
  "  if (result.canceled || !result.filePath) return { ok: false, reason: 'canceled' }",
  '  const target = result.filePath',
  "  if (target.toLowerCase().endsWith('.json')) {",
  '    const payload = { character: { name: character.name, tagline: character.tagline }, exportedAt: new Date().toISOString(), messages: history }',
  "    fs.writeFileSync(target, JSON.stringify(payload, null, 2), 'utf8')",
  '  } else {',
  "    const out = []",
  "    out.push('# 和 ' + character.name + ' 的对话')",
  "    out.push('')",
  "    out.push('导出时间：' + new Date().toLocaleString('zh-CN'))",
  "    out.push('')",
  '    for (const item of history) {',
  "      const who = item.role === 'user' ? '我' : character.name",
  "      out.push('**' + who + '**：' + String(item.content || '').trim())",
  "      out.push('')",
  '    }',
  "    fs.writeFileSync(target, out.join(String.fromCharCode(10)), 'utf8')",
  '  }',
  "  log('chat exported: ' + target)",
  '  return { ok: true, file: target }',
  '})',
  "ipcMain.handle('chat:import', async () => {",
  '  const result = await dialog.showOpenDialog(chatWin || undefined, {',
  "    title: '导入对话（JSON）',",
  "    properties: ['openFile'],",
  "    filters: [{ name: 'JSON', extensions: ['json'] }],",
  '  })',
  "  if (result.canceled || !result.filePaths.length) return { ok: false, reason: 'canceled' }",
  '  try {',
  "    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'))",
  '    const messages = Array.isArray(data) ? data : data.messages',
  "    if (!Array.isArray(messages) || !messages.length) return { ok: false, reason: 'bad-format' }",
  '    const clean = messages',
  "      .filter(item => item && (item.role === 'user' || item.role === 'assistant'))",
  "      .map(item => ({ role: item.role, content: String(item.content || '') }))",
  "    const file = path.join(DATA_DIR, 'chat-' + chatCharacterId + '.json')",
  "    try { fs.copyFileSync(file, file + '.bak-' + Date.now()) } catch {}",
  "    fs.writeFileSync(file, JSON.stringify({ messages: clean }, null, 2), 'utf8')",
  "    log('chat imported: ' + clean.length + ' messages')",
  '    return { ok: true, count: clean.length }',
  '  } catch (error) {',
  '    return { ok: false, reason: String(error) }',
  '  }',
  '})',
  anchor,
]

s = s.replace(anchor, lines.join('\n'))
fs.writeFileSync(mainPath, s.replace(/\n/g, eol), 'utf8')
console.log('main.js 补丁写入，共 ' + lines.length + ' 行')
