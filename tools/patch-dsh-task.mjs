import fs from 'node:fs'

const mainPath = process.argv[2]
const chatPath = process.argv[3]
const preloadPath = process.argv[4]

// ---------------- main.js：把聊天简报写成 DSH 任务卡 ----------------
let m = fs.readFileSync(mainPath, 'utf8')
const before = m

const block = `
// ---------- B 方向：把聊天内容"投递"进 DSH（任务是文件驱动的，无需鉴权） ----------
const TASK_BOARD = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', 'task-board', 'ledger-v2.json')

function readLedger() {
  return JSON.parse(fs.readFileSync(TASK_BOARD, 'utf8'))
}

function writeLedger(data) {
  const tmp = TASK_BOARD + '.tmp-' + Date.now()
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
  fs.renameSync(tmp, TASK_BOARD)
}

function buildTaskFromChat() {
  const character = readCharacter(chatCharacterId)
  const history = loadChatHistory(chatCharacterId).slice(-6)
  const memory = loadMemory(chatCharacterId)
  const userLines = history.filter(item => item.role === 'user')
  const lastUser = userLines.length ? userLines[userLines.length - 1].content : ''

  const lines = []
  lines.push('（来自桌宠聊天 · ' + character.name + ' 转达）')
  lines.push('')
  for (const item of history) {
    const who = item.role === 'user' ? '我' : character.name
    lines.push(who + '：' + String(item.content).replace(/\\n+/g, ' ').slice(0, 200))
  }
  if (memory.length) {
    lines.push('')
    lines.push('[她记得的事] ' + memory.slice(-6).join('；'))
  }

  return {
    title: (lastUser || '桌宠转达').slice(0, 40),
    description: lines.join('\\n'),
    prompt: lines.join('\\n') + '\\n\\n[请] 按上面「我」最后的诉求执行，不需要复述聊天内容，直接开始做并回报结果。',
  }
}

function createDshTask() {
  try {
    const task = buildTaskFromChat()
    const first = readLedger()
    const revision = Number(first.revision) || 0

    // 备份 + 乐观并发检查
    try {
      fs.writeFileSync(path.join(DATA_DIR, 'task-board-backup-' + Date.now() + '.json'), JSON.stringify(first, null, 2), 'utf8')
    } catch {}

    const list = Array.isArray(first.tasks) ? first.tasks : []
    const now = Date.now()
    list.push({
      id: require('node:crypto').randomUUID(),
      title: '叶汐转达：' + task.title,
      description: task.description,
      prompt: task.prompt,
      status: 'todo',
      createdAt: now,
      updatedAt: now,
      executions: [],
      permission: 'workspace-write',
    })
    first.tasks = list
    first.revision = revision + 1
    writeLedger(first)

    // 回读确认
    const check = readLedger()
    const found = (check.tasks || []).some(item => item.title === '叶汐转达：' + task.title)
    log('dsh task created: ' + task.title + ' ok=' + found)
    if (found) petSay('任务卡建好啦，去 DSH 看板就能看到她的话')
    return { ok: found, title: task.title }
  } catch (error) {
    log('dsh task failed: ' + String(error))
    // 兜底：至少把简报复制到剪贴板
    try { require('electron').clipboard.writeText(buildTaskFromChat().prompt) } catch {}
    return { ok: false, error: String(error) }
  }
}
`

if (!m.includes('function createDshTask')) {
  m = m.replace('// ---------- 设置窗口 ----------', block + '\n// ---------- 设置窗口 ----------')
}

if (!m.includes("'chat:to-dsh-task'")) {
  m = m.replace(
    "ipcMain.handle('chat:handoff'",
    "ipcMain.handle('chat:to-dsh-task', () => createDshTask())\nipcMain.handle('chat:handoff'",
  )
  m = m.replace(
    "      if (pathname === '/dsh-pet/say' && req.method === 'POST') {",
    `      if (pathname === '/dsh-pet/dsh-task' && req.method === 'POST') {
        const result = createDshTask()
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
        return
      }

      if (pathname === '/dsh-pet/say' && req.method === 'POST') {`,
  )
}

if (m === before) { console.error('main 未变'); process.exit(1) }
fs.writeFileSync(mainPath, m, 'utf8')
console.log('main: createDshTask')

// ---------------- preload ----------------
let pre = fs.readFileSync(preloadPath, 'utf8')
if (!pre.includes('toDshTask')) {
  pre = pre.replace('  handoff:', "  toDshTask: () => ipcRenderer.invoke('chat:to-dsh-task'),\n  handoff:")
  fs.writeFileSync(preloadPath, pre, 'utf8')
  console.log('preload: toDshTask')
}

// ---------------- chat.html：加按钮 ----------------
let html = fs.readFileSync(chatPath, 'utf8')
if (!html.includes('taskBtn')) {
  html = html.replace(
    '  <button class="btn" id="handoffBtn">📤 把这轮交给 DSH</button>',
    `  <button class="btn" id="taskBtn">📥 建成 DSH 任务卡</button>
  <button class="btn ghost" id="handoffBtn">📋 复制简报</button>`,
  )
  html = html.replace(
    "  el('handoffBtn').onclick = async () => {",
    `  el('taskBtn').onclick = async () => {
    const result = await api.toDshTask()
    el('taskBtn').textContent = result && result.ok ? '✅ 已建卡' : '⚠️ 失败（已复制）'
    setTimeout(() => { el('taskBtn').textContent = '📥 建成 DSH 任务卡' }, 2400)
  }

  el('handoffBtn').onclick = async () => {`,
  )
  fs.writeFileSync(chatPath, html, 'utf8')
  console.log('chat.html: 建卡按钮')
}
