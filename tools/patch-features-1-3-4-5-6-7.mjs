import fs from 'node:fs'

const mainPath = process.argv[2]
const settingsPath = process.argv[3]
const preloadSettingsPath = process.argv[4]

// ---------------- main.js ----------------
let src = fs.readFileSync(mainPath, 'utf8')
const before = src

// ---- 1) agent → 桌宠：/dsh-pet/control ----
const controlBlock = `
// ---------- agent 指挥桌宠（A 方向：agent → 桌宠） ----------
// POST /dsh-pet/control  { action?: 'paw'|'love'|'heartbeat'|'doubleV'|'omurice'|..., face?: 'happy'|'cry'|..., text?: '...' }
// GET  /dsh-pet/control?action=wave&text=...
// 和 B 方向（桌宠 → DSH，/dsh-pet/say）区分开：这个只让她做动作，不碰 DSH 会话。
function handlePetControl(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const action = typeof body.action === 'string' ? body.action : null
  const face = typeof body.face === 'string' ? body.face : null
  const text = typeof body.text === 'string' ? body.text : null
  if (action) petPlay(action)
  if (face) petFace(face)
  if (text) petSay(text)
  log('agent control: action=' + action + ' face=' + face + ' text=' + (text ? text.slice(0, 30) : null))
  return { ok: true, action, face }
}

`

// ---- 2) 番茄钟 + 挂机 + 成就 + 前台窗口 ----
const extraBlock = `
// ---------- 番茄钟 ----------
let pomodoroTimer = null
let pomodoroState = { phase: 'work', until: 0 }

function pomodoroMinutes() {
  return { work: 25, rest: 5 }
}

function pomodoroTick() {
  if (shellPrefs.pomodoro !== true) return
  const now = Date.now()
  if (now < pomodoroState.until) return
  const minutes = pomodoroMinutes()
  if (pomodoroState.phase === 'work') {
    pomodoroState = { phase: 'rest', until: now + minutes.rest * 60000 }
    petSay('已经专注 25 分钟啦，起来动一动？')
    petFace('sleepy')
    petVoice('click')
    log('pomodoro -> rest')
  } else {
    pomodoroState = { phase: 'work', until: now + minutes.work * 60000 }
    petSay('休息好啦，我们继续？')
    petFace('happy')
    petVoice('click')
    log('pomodoro -> work')
  }
}

function startPomodoro() {
  if (pomodoroTimer) return
  pomodoroState = { phase: 'work', until: Date.now() + pomodoroMinutes().work * 60000 }
  pomodoroTimer = setInterval(pomodoroTick, 20000)
  log('pomodoro started')
}

function stopPomodoro() {
  if (pomodoroTimer) clearInterval(pomodoroTimer)
  pomodoroTimer = null
  log('pomodoro stopped')
}

// ---------- 挂机打工：在线每 30 分钟 +1 条小鱼干（上限 20） ----------
function startIdleWork() {
  setInterval(() => {
    const state = readJson(HOST_FILE, {})
    const treats = { stocked: 8, cap: 20, ...(state.treats || {}) }
    const last = Number(treats.lastIdleAt) || Date.now()
    if (Date.now() - last < 30 * 60000) return
    if (treats.stocked >= treats.cap) { treats.lastIdleAt = Date.now(); updateAffinity(null, treats); return }
    treats.stocked += 1
    treats.lastIdleAt = Date.now()
    updateAffinity(null, treats)
    petSay('陪你工作了一会儿，攒到一条小鱼干！')
    petFace('happy')
    log('idle work: +1 treat -> ' + treats.stocked)
  }, 60000)
}

// ---------- 成就 ----------
const ACHIEVEMENTS = [
  { id: 'first-feed', label: '第一次喂食', when: s => s.feeds >= 1 },
  { id: 'rank-partner', label: '亲密度到「伙伴」', when: s => s.points >= 25 },
  { id: 'rank-friend', label: '亲密度到「挚友」', when: s => s.points >= 50 },
  { id: 'ten-turns', label: '陪了 10 轮对话', when: s => s.turns >= 10 },
  { id: 'task-three', label: '完成 3 个任务', when: s => (s.tasks || 0) >= 3 },
  { id: 'voice-on', label: '打开语音', when: () => shellPrefs.voice !== false },
]

function checkAchievements() {
  const state = readJson(HOST_FILE, {})
  const unlocked = { ...(shellPrefs.achievements || {}) }
  const affinity = affinityState()
  const stats = { ...affinity, tasks: Number((state.affinity || {}).tasks) || 0 }
  let changed = false
  for (const item of ACHIEVEMENTS) {
    if (unlocked[item.id]) continue
    let hit = false
    try { hit = item.when(stats) } catch {}
    if (!hit) continue
    unlocked[item.id] = { at: Date.now(), label: item.label }
    changed = true
    petSay('成就解锁：' + item.label)
    petVoice('task')
    log('achievement unlocked: ' + item.id)
  }
  if (changed) {
    shellPrefs = { ...shellPrefs, achievements: unlocked }
    try { writeJson(SHELL_FILE, shellPrefs) } catch {}
    if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.reload()
  }
}

// ---------- 前台窗口感知（她偶尔评论你在干什么） ----------
const APP_COMMENTS = [
  { match: /Visual Studio Code|Cursor|Sublime/i, line: '在写代码呀，我不打扰你～' },
  { match: /Excel|WPS|表格/i, line: '表格做得好认真，加油！' },
  { match: /Chrome|Edge|Firefox|浏览器/i, line: '又在查资料吗？' },
  { match: /DeepSeek Harness|DSH/i, line: '你在跟我说话吗？' },
]
let lastFrontTitle = ''
let lastFrontCommentAt = 0

function startFrontWindowWatch() {
  const { execFile } = require('node:child_process')
  setInterval(() => {
    const script = 'Add-Type -TypeDefinition "using System;using System.Runtime.InteropServices;public class W{[DllImport(\\"user32.dll\\")]public static extern IntPtr GetForegroundWindow();[DllImport(\\"user32.dll\\")]public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int c);}"; $b=New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText([W]::GetForegroundWindow(),$b,512); $b.ToString()'
    execFile('powershell', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 4000 }, (error, stdout) => {
      if (error) return
      const title = String(stdout || '').trim()
      if (!title || title === lastFrontTitle) return
      lastFrontTitle = title
      if (Date.now() - lastFrontCommentAt < 5 * 60000) return
      const hit = APP_COMMENTS.find(item => item.match.test(title))
      if (!hit) return
      lastFrontCommentAt = Date.now()
      petSay(hit.line)
      log('front window: ' + title.slice(0, 40))
    })
  }, 60000)
}

`

if (!src.includes('handlePetControl')) {
  src = src.replace('// ---------- 设置窗口 ----------', controlBlock + extraBlock + '// ---------- 设置窗口 ----------')
}

// /dsh-pet/control 路由（放在 POST 通用分支之前）
src = src.replace(
  `      if (req.method === 'POST') {`,
  `      if (pathname === '/dsh-pet/control') {
        let body = {}
        if (req.method === 'POST') {
          let raw = ''
          req.on('data', chunk => { raw += chunk })
          req.on('end', () => {
            try { body = raw ? JSON.parse(raw) : {} } catch {}
            const result = handlePetControl(body)
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify(result))
          })
          return
        }
        const query = parsed.searchParams
        const result = handlePetControl({
          action: query.get('action'),
          face: query.get('face'),
          text: query.get('text'),
        })
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
        return
      }

      if (req.method === 'POST') {`,
)

// 启动新增的定时器/监听
src = src.replace(
  "      startTaskWatch()",
  `      startTaskWatch()
      startIdleWork()
      startFrontWindowWatch()
      if (shellPrefs.pomodoro === true) startPomodoro()
      setInterval(checkAchievements, 30000)
      checkAchievements()`,
)

// 任务计数（成就用）
src = src.replace(
  "      awardAffinity('task', 2)",
  `      awardAffinity('task', 2)
      const stateForTask = readJson(HOST_FILE, {})
      stateForTask.affinity = { ...(stateForTask.affinity || {}), tasks: (Number((stateForTask.affinity || {}).tasks) || 0) + 1 }
      writeJson(HOST_FILE, stateForTask)`,
)

// 设置项：番茄钟 / 成就 / 解锁
src = src.replace(
  `    voice: shellPrefs.voice !== false,
  }`,
  `    voice: shellPrefs.voice !== false,
    pomodoro: shellPrefs.pomodoro === true,
    achievements: shellPrefs.achievements || {},
    unlocks: unlockedActions(),
  }`,
)

if (!src.includes('function unlockedActions')) {
  src = src.replace(
    'function settingsState() {',
    `const UNLOCK_STEPS = [
  { at: 25, action: 'paw', label: '招手' },
  { at: 50, action: 'love', label: '比心' },
  { at: 80, action: 'heartbeat', label: '心跳' },
  { at: 200, action: 'doubleV', label: '双手比耶' },
  { at: 500, action: 'omurice', label: '蛋包饭' },
]

function unlockedActions() {
  const points = affinityState().points
  return UNLOCK_STEPS.map(item => ({ ...item, unlocked: points >= item.at }))
}

function settingsState() {`,
  )
}

if (!src.includes("'settings:pomodoro'")) {
  src = src.replace(
    "ipcMain.handle('settings:voice'",
    `ipcMain.handle('settings:pomodoro', (_event, on) => {
  shellPrefs = { ...shellPrefs, pomodoro: on === true }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  if (on === true) startPomodoro()
  else stopPomodoro()
  return settingsState()
})
ipcMain.handle('settings:unlock', (_event, action) => {
  const item = unlockedActions().find(entry => entry.action === action)
  if (item && item.unlocked) {
    petPlay(action)
    log('manual unlock action: ' + action)
  }
  return settingsState()
})
ipcMain.handle('settings:voice'`,
  )
}

if (src === before) { console.error('main.js unchanged'); process.exit(1) }
fs.writeFileSync(mainPath, src, 'utf8')
console.log('main.js patched: control + pomodoro + idle + achievements + front window + unlocks')

// ---------------- settings.html ----------------
let settings = fs.readFileSync(settingsPath, 'utf8')
const beforeSettings = settings
if (!settings.includes('pomodoroBtn')) {
  settings = settings.replace(
    `  <div class="row">
    <label>用量</label>`,
    `  <div class="row">
    <label>番茄钟</label>
    <button id="pomodoroBtn">—</button>
    <span style="color:#7f8db3;font-size:12px">25 分钟专注 / 5 分钟休息</span>
  </div>

  <div class="row">
    <label>解锁动作</label>
    <span id="unlocks"></span>
  </div>

  <div class="row">
    <label>成就</label>
    <span id="achievements" style="color:#b8c8ff">—</span>
  </div>

  <div class="row">
    <label>用量</label>`,
  )
  settings = settings.replace(
    '    const auto = document.getElementById(\'autoStart\')',
    `    const pomodoroBtn = document.getElementById('pomodoroBtn')
    pomodoroBtn.textContent = state.pomodoro ? '运行中' : '未开启'
    pomodoroBtn.className = state.pomodoro ? 'on' : ''
    pomodoroBtn.onclick = () => api.setPomodoro(!state.pomodoro).then(next => { state = next; render() })

    const unlocks = document.getElementById('unlocks')
    unlocks.innerHTML = ''
    for (const item of state.unlocks || []) {
      const button = document.createElement('button')
      button.textContent = item.label + (item.unlocked ? '' : '（' + item.at + '点）')
      button.disabled = !item.unlocked
      button.style.marginRight = '6px'
      if (item.unlocked) button.onclick = () => api.playUnlock(item.action)
      unlocks.append(button)
    }

    const achievements = Object.values(state.achievements || {})
    document.getElementById('achievements').textContent =
      achievements.length ? achievements.map(item => item.label).join(' · ') : '还没解锁（喂食/对话/任务会解锁）'

    const auto = document.getElementById('autoStart')`,
  )
  fs.writeFileSync(settingsPath, settings, 'utf8')
  console.log('settings.html patched')
}

// ---------------- preload-settings.js ----------------
let ps = fs.readFileSync(preloadSettingsPath, 'utf8')
if (!ps.includes('setPomodoro')) {
  ps = ps.replace(
    '  setVoice:',
    "  setPomodoro: on => ipcRenderer.invoke('settings:pomodoro', on === true),\n  playUnlock: action => ipcRenderer.invoke('settings:unlock', action),\n  setVoice:",
  )
  fs.writeFileSync(preloadSettingsPath, ps, 'utf8')
  console.log('preload-settings.js patched')
}
