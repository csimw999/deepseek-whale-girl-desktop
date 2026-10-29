import fs from 'node:fs'

const mainPath = process.argv[2]
const settingsPath = process.argv[3]
const petHtmlPath = process.argv[4]
const preloadPath = process.argv[5]

// ---------------- main.js ----------------
let src = fs.readFileSync(mainPath, 'utf8')
const before = src

const block = `
// ---------- 亲密度 / 小鱼干（宿主级，两种形态共用 data/host-state.json） ----------
const RANK_STEPS = [
  { min: 0, name: '幼鲸' }, { min: 25, name: '伙伴' }, { min: 50, name: '挚友' },
  { min: 80, name: '深海羁绊' }, { min: 200, name: '心有灵犀' }, { min: 500, name: '传说羁绊' },
  { min: 2000, name: '神话羁绊' }, { min: 10000, name: '永恒之契' }, { min: 100000, name: '鲸生共渡' },
]

function affinityState() {
  const state = readJson(HOST_FILE, {})
  const affinity = { points: 0, pets: 0, feeds: 0, turns: 0, lastPetAt: 0, lastFeedAt: 0, ...(state.affinity || {}) }
  const treats = { stocked: 8, cap: 20, ...(state.treats || {}) }
  let index = 0
  for (let i = 0; i < RANK_STEPS.length; i++) if (affinity.points >= RANK_STEPS[i].min) index = i
  const next = RANK_STEPS[index + 1]
  return {
    points: affinity.points,
    rank: RANK_STEPS[index].name,
    next: next ? next.name : null,
    nextAt: next ? next.min : null,
    pets: affinity.pets,
    feeds: affinity.feeds,
    turns: affinity.turns,
    stocked: treats.stocked,
    cap: treats.cap,
  }
}

function updateAffinity(patch, treatsPatch) {
  const state = readJson(HOST_FILE, {})
  state.affinity = { points: 0, pets: 0, feeds: 0, turns: 0, ...(state.affinity || {}), ...(patch || {}) }
  state.treats = { stocked: 8, cap: 20, ...(state.treats || {}), ...(treatsPatch || {}) }
  writeJson(HOST_FILE, state)
  hostState = state
  return affinityState()
}

function awardAffinity(kind, amount) {
  const state = readJson(HOST_FILE, {})
  const affinity = { points: 0, pets: 0, feeds: 0, turns: 0, ...(state.affinity || {}) }
  affinity.points += amount
  if (kind === 'turn') affinity.turns += 1
  if (kind === 'pet') affinity.pets += 1
  if (kind === 'feed') affinity.feeds += 1
  const next = updateAffinity(affinity, null)
  log('affinity +' + amount + ' (' + kind + ') -> ' + next.points + ' 点 · ' + next.rank)
  return next
}

/** 让她在页面上演一下（Live2D 才有；像素形态忽略） */
function petPlay(action) {
  if (!win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'window.DSHPet && window.DSHPet.playAction && window.DSHPet.playAction(' + JSON.stringify(action) + ')',
  ).catch(() => {})
}

function petSay(text) {
  if (!win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'window.DSHPet && window.DSHPet.report && window.DSHPet.report("DS 鲸鱼娘", ' + JSON.stringify(text) + ')',
  ).catch(() => {})
}

// ---------- 任务看板联动 ----------
function startTaskWatch() {
  const file = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', 'task-board', 'ledger-v2.json')
  const seen = new Set()
  let primed = false
  setInterval(() => {
    let data
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return }
    const tasks = Array.isArray(data.tasks) ? data.tasks : []
    for (const task of tasks) {
      if (!task || task.status !== 'done') continue
      if (seen.has(task.id)) continue
      seen.add(task.id)
      if (!primed) continue // 首次运行只做基线，不补发历史完成
      awardAffinity('task', 2)
      const title = String(task.title || '').slice(0, 40)
      petSay('任务完成：' + title + '，辛苦啦！')
      refreshTray()
      log('task done: ' + title)
    }
    primed = true
  }, 5000)
}
`

if (!src.includes('function affinityState')) {
  src = src.replace('// ---------- 设置窗口 ----------', block + '\n// ---------- 设置窗口 ----------')
}

// 事件触发的加分：assistant（回合结束）与 tool-result（每 5 次）
if (!src.includes('awardToolCount')) {
  src = src.replace(
    `        const event = JSON.parse(line)`,
    `        const event = JSON.parse(line)
        if (event.t === 'assistant') awardAffinity('turn', 1)
        if (event.t === 'tool-result') {
          global.__awardToolCount = (global.__awardToolCount || 0) + 1
          if (global.__awardToolCount % 5 === 0) awardAffinity('tool', 1)
        }`,
  )
}

// settingsState 带上亲密度
src = src.replace(
  `    autoStart: readAutoStart(),
    petId: hostState.petId,
  }`,
  `    autoStart: readAutoStart(),
    petId: hostState.petId,
    affinity: affinityState(),
  }`,
)

// 新增 IPC：喂食 / 查询 / 双击隐藏
if (!src.includes("'settings:feed'")) {
  src = src.replace(
    "ipcMain.on('settings:usage'",
    `ipcMain.handle('settings:feed', () => {
  const current = affinityState()
  if (current.stocked <= 0) return { ...current, refused: 'no-treats' }
  const next = updateAffinity(null, { stocked: current.stocked - 1 })
  awardAffinity('feed', 5)
  petPlay(current.stocked % 3 === 0 ? 'splash' : current.stocked % 3 === 1 ? 'bubble' : 'selfie')
  petSay('小鱼干真好吃！')
  refreshTray()
  return affinityState()
})
ipcMain.on('settings:usage'`,
  )
}

if (!src.includes("'shell:toggle'")) {
  src = src.replace(
    "ipcMain.on('shell:interactive'",
    `ipcMain.on('shell:toggle', () => {
  if (!win || win.isDestroyed()) return
  if (win.isVisible()) { win.hide(); log('user hid the pet') }
  else { win.showInactive(); log('user showed the pet') }
})
ipcMain.on('shell:interactive'`,
  )
}

// 启动看板监听
src = src.replace(
  "      startPetEventTail()",
  "      startPetEventTail()\n      startTaskWatch()",
)

if (src === before) { console.error('main.js unchanged'); process.exit(1) }
fs.writeFileSync(mainPath, src, 'utf8')
console.log('main.js patched')

// ---------------- preload.js：双击隐藏用的 toggle ----------------
let preload = fs.readFileSync(preloadPath, 'utf8')
if (!preload.includes("shell:toggle")) {
  preload = preload.replace(
    '  /** 右键宠物',
    "  /** 双击宠物：隐藏 / 召唤。 */\n  toggle: () => ipcRenderer.send('shell:toggle'),\n  /** 右键宠物",
  )
  fs.writeFileSync(preloadPath, preload, 'utf8')
  console.log('preload.js patched')
}

// ---------------- pet.html：双击隐藏 ----------------
let petHtml = fs.readFileSync(petHtmlPath, 'utf8')
if (!petHtml.includes('dblclick')) {
  petHtml = petHtml.replace(
    '    // 右键归我们的应用菜单',
    `    // 双击她：隐藏 / 召唤（和 Ctrl+Alt+H 同一个动作）
    window.addEventListener('dblclick', event => {
      if (!overPet(event.clientX, event.clientY)) return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (typeof shell.toggle === 'function') shell.toggle()
    }, true)

    // 右键归我们的应用菜单`,
  )
  fs.writeFileSync(petHtmlPath, petHtml, 'utf8')
  console.log('pet.html patched')
}

// ---------------- settings.html：亲密度面板 + 喂食 ----------------
let settings = fs.readFileSync(settingsPath, 'utf8')
if (!settings.includes('affinityBox')) {
  settings = settings.replace(
    `  <div class="row">
    <label>用量</label>`,
    `  <div class="row">
    <label>亲密度</label>
    <span id="affinityBox" style="color:#b8c8ff">—</span>
  </div>

  <div class="row">
    <label>喂食</label>
    <button id="feed">喂一条小鱼干</button>
    <span id="treats" style="color:#7dd3fc">—</span>
  </div>

  <div class="row">
    <label>用量</label>`,
  )
  settings = settings.replace(
    `    const auto = document.getElementById('autoStart')`,
    `    const affinity = state.affinity || {}
    document.getElementById('affinityBox').textContent =
      (affinity.rank || '—') + ' · ' + (affinity.points || 0) + ' 点' +
      (affinity.next ? '（下一级 ' + affinity.next + ' @ ' + affinity.nextAt + '）' : '（已满级）')
    document.getElementById('treats').textContent =
      '小鱼干 x' + (affinity.stocked ?? 0) + ' / ' + (affinity.cap ?? 0)
    const auto = document.getElementById('autoStart')`,
  )
  settings = settings.replace(
    `  document.getElementById('usage').onclick = () => api.showUsage()`,
    `  document.getElementById('usage').onclick = () => api.showUsage()
  document.getElementById('feed').onclick = () => api.feed().then(next => {
    if (next.refused === 'no-treats') { document.getElementById('treats').textContent = '没有小鱼干了'; return }
    state = next; render()
  })`,
  )
  fs.writeFileSync(settingsPath, settings, 'utf8')
  console.log('settings.html patched')
}

// ---------------- preload-settings.js：feed ----------------
let preloadSettings = fs.readFileSync(petHtmlPath.replace('live2d/pet.html', 'preload-settings.js'), 'utf8')
if (!preloadSettings.includes('feed:')) {
  preloadSettings = preloadSettings.replace(
    '  showUsage:',
    "  feed: () => ipcRenderer.invoke('settings:feed'),\n  showUsage:",
  )
  fs.writeFileSync(petHtmlPath.replace('live2d/pet.html', 'preload-settings.js'), preloadSettings, 'utf8')
  console.log('preload-settings.js patched')
}
