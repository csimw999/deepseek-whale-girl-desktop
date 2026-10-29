import fs from 'node:fs'

// ---------- 1) activity-watch.mjs：把 DSH 会话事件映射成 pet.js 事件，追加到 data/events.jsonl ----------
const watchPath = process.argv[2]
let w = fs.readFileSync(watchPath, 'utf8')
const beforeWatch = w

if (!w.includes('emitPetEvent')) {
  w = w.replace(
    'const PID_FILE = path.join(ROOT, \'data\', \'activity-watch.pid\')',
    `const PID_FILE = path.join(ROOT, 'data', 'activity-watch.pid')
const EVENTS_FILE = path.join(ROOT, 'data', 'events.jsonl')

/** 把 DSH 事件写成 pet.js 认识的事件流（t 字段），供桌面版 SSE 转发。 */
function emitPetEvent(event) {
  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify({ ...event, at: Date.now() }) + '\\n')
  } catch {}
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(part => part && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('')
    .trim()
}`,
  )

  w = w.replace(
    'function handleEvent(event) {',
    `function handleEvent(event) {
  switch (event.type) {
    case 'turn/start':
      emitPetEvent({ t: 'turn-start', turn: event.data && event.data.turn })
      break
    case 'step/start':
      emitPetEvent({ t: 'step-start', step: event.data && event.data.step })
      break
    case 'tool/call': {
      const data = event.data || {}
      let args = null
      try { args = data.arguments ? JSON.parse(data.arguments) : null } catch {}
      emitPetEvent({ t: 'tool-call', name: data.name || 'tool', label: data.name || 'tool', args })
      break
    }
    case 'tool/result': {
      const data = event.data || {}
      emitPetEvent({ t: 'tool-result', error: !!(data.error || data.isError) })
      break
    }
    case 'assistant/message': {
      const data = event.data || {}
      const message = data.message || {}
      const text = textOf(message.content)
      const reasoning = (message.content || [])
        .filter(part => part && part.type === 'reasoning' && typeof part.text === 'string')
        .map(part => part.text)
        .join('')
      if (text) emitPetEvent({ t: 'assistant', text })
      else if (reasoning) emitPetEvent({ t: 'delta', kind: 'reasoning', text: reasoning.slice(0, 400) })
      break
    }
    case 'user/message': {
      const data = event.data || {}
      const text = textOf(data.content)
      if (text) emitPetEvent({ t: 'user', text: text.slice(0, 300) })
      break
    }
    case 'turn/end':
      emitPetEvent({ t: 'hello', status: 'idle' })
      break
  }
`,
  )
  fs.writeFileSync(watchPath, w, 'utf8')
  console.log('activity-watch patched')
} else {
  console.log('activity-watch already patched')
}

// ---------- 2) main.js：tail events.jsonl 并广播；加 Ctrl+Alt+F 切形态 ----------
const mainPath = process.argv[3]
let m = fs.readFileSync(mainPath, 'utf8')
const beforeMain = m

if (!m.includes('startPetEventTail')) {
  m = m.replace(
    'function startActivityFeed() {',
    `/** tail data/events.jsonl，把 DSH 真实事件按行广播给页面（pet.js 的 handleEvent 认 t 字段）。 */
function startPetEventTail() {
  const eventsFile = path.join(DATA_DIR, 'events.jsonl')
  let offset = 0
  try { offset = fs.statSync(eventsFile).size } catch { offset = 0 }
  setInterval(() => {
    let size = 0
    try { size = fs.statSync(eventsFile).size } catch { return }
    if (size < offset) offset = 0
    if (size === offset) return
    let chunk = ''
    try {
      const fd = fs.openSync(eventsFile, 'r')
      const length = size - offset
      const buffer = Buffer.alloc(length)
      fs.readSync(fd, buffer, 0, length, offset)
      fs.closeSync(fd)
      chunk = buffer.toString('utf8')
    } catch { return }
    offset = size
    for (const line of chunk.split('\\n')) {
      if (!line.trim()) continue
      try { petBroadcast(JSON.parse(line)) } catch {}
    }
  }, 150)
}

function startActivityFeed() {`,
  )

  // 启动时开启 tail
  m = m.replace(
    "      startActivityWatcher()\n      startActivityFeed()",
    "      startActivityWatcher()\n      startActivityFeed()\n      startPetEventTail()",
  )
}

// 切形态热键
if (!m.includes("Control+Alt+F")) {
  m = m.replace(
    "      log('hotkeys: quit=' + quitOk + ' hide=' + hideOk)",
    `      const formOk = globalShortcut.register('Control+Alt+F', () => {
        const next = (shellPrefs.form || 'live2d') === 'live2d' ? 'pixel' : 'live2d'
        log('hotkey form -> ' + next)
        loadForm(next)
        refreshTray()
      })
      log('hotkeys: quit=' + quitOk + ' hide=' + hideOk + ' form=' + formOk)`,
  )
}

if (m === beforeMain) console.log('main.js unchanged')
else { fs.writeFileSync(mainPath, m, 'utf8'); console.log('main.js patched') }
