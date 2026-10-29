import fs from 'node:fs'

const mainPath = process.argv[2]
const petJsPath = process.argv[3]
const petHtmlPath = process.argv[4]
const settingsPath = process.argv[5]

// ---------- 1) pet.js：暴露 setFace（原文件没导出表情接口） ----------
let petJs = fs.readFileSync(petJsPath, 'utf8')
if (!petJs.includes('setFace:')) {
  petJs = petJs.replace(
    '    playAction: (key) => playAction(key),',
    `    /** [桌面版补丁] 外部指定表情：cry / sad / happy / excited / smug / playful / sleepy … */
    setFace: (mood) => { try { setBase(mood, IDLE_PROPS) } catch (error) { console.warn('[鲸鱼娘] setFace failed', mood, error) } },
    playAction: (key) => playAction(key),`,
  )
  fs.writeFileSync(petJsPath, petJs, 'utf8')
  console.log('pet.js: setFace 导出')
}

// ---------- 2) main.js ----------
let src = fs.readFileSync(mainPath, 'utf8')
const before = src

// 2a) 语音目录也要能被 /dsh-pet/voice/* 访问
src = src.replace(
  "      const rel = pathname === '/' ? 'pet.html' : pathname.replace(/^\\/dsh-pet\\/?/, '').replace(/^\\/+/, '')\n      const file = path.resolve(rootDir, rel)",
  `      let rel = pathname === '/' ? 'pet.html' : pathname.replace(/^\\/dsh-pet\\/?/, '').replace(/^\\/+/, '')
      let baseDir = rootDir
      if (pathname.startsWith('/dsh-pet/voice/')) {
        baseDir = path.join(ROOT, 'assets', 'voice')
        rel = pathname.replace('/dsh-pet/voice/', '')
      }
      const file = path.resolve(baseDir, rel)`,
)
src = src.replace(
  '      if (!file.startsWith(rootDir)) { res.writeHead(403); res.end(\'forbidden\'); return }',
  '      if (!file.startsWith(rootDir) && !file.startsWith(path.join(ROOT, \'assets\', \'voice\'))) { res.writeHead(403); res.end(\'forbidden\'); return }',
)

// 2b) 表情 + 语音的统一入口
if (!src.includes('function petFace')) {
  src = src.replace(
    '// ---------- 任务看板联动 ----------',
    `// ---------- 表情 / 语音 ----------
const FACE_OF_PHASE = {
  thinking: 'listening',
  tool: 'smug',
  review: 'playful',
  done: 'happy',
  failed: 'cry',
  idle: 'happy',
}

function petFace(mood) {
  if (!mood || !win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'window.DSHPet && window.DSHPet.setFace && window.DSHPet.setFace(' + JSON.stringify(mood) + ')',
  ).catch(() => {})
}

function petVoice(kind) {
  if (shellPrefs.voice === false || !win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'window.__petPlayVoice && window.__petPlayVoice(' + JSON.stringify(kind) + ')',
  ).catch(() => {})
}

/** 相位变化时的表情/语音反应（节流，避免刷屏） */
function reactToPhase(phase) {
  const now = Date.now()
  if (phase === 'done') {
    petFace('happy')
    petVoice('done')
    return
  }
  if (phase === 'failed') {
    petFace('cry')
    petVoice('fail')
    return
  }
  if (now - (global.__faceAt || 0) < 4000) return
  const mood = FACE_OF_PHASE[phase]
  if (!mood) return
  global.__faceAt = now
  petFace(mood)
}

// ---------- 任务看板联动 ----------`,
  )
}

// 2c) 相位变化时调用
src = src.replace(
  `    win.webContents.send('shell:activity', phase)
    log('activity -> ' + phase)`,
  `    win.webContents.send('shell:activity', phase)
    log('activity -> ' + phase)
    try { reactToPhase(phase) } catch {}`,
)

// 2d) 工具名中文标签（气泡细节用）
if (!src.includes('TOOL_LABEL')) {
  src = src.replace(
    'function petFace(mood) {',
    `const TOOL_LABEL = {
  pwsh: '运行命令', read: '读文件', write: '写文件', edit: '改文件', grep: '搜索', glob: '找文件',
  web_fetch: '上网查', read_page: '读网页', web_search: '搜索', image: '看图', task: '派任务',
  glob_repo: '找文件', patch: '改文件', todo_write: '整理待办',
}

function petFace(mood) {`,
  )
}
src = src.replace(
  "        if (event.t === 'tool-result') {",
  "        if (event.t === 'tool-call' && event.name && !event.label) event.label = TOOL_LABEL[event.name] || event.name\n        if (event.t === 'tool-result') {",
)

// 2e) 看板任务完成 → 语音
src = src.replace(
  "      petSay('任务完成：' + title + '，辛苦啦！')",
  "      petSay('任务完成：' + title + '，辛苦啦！')\n      petVoice('task')\n      petFace('excited')",
)

// 2f) 喂食 → 语音
src = src.replace(
  "  petPlay(current.stocked % 3 === 0 ? 'splash' : current.stocked % 3 === 1 ? 'bubble' : 'selfie')",
  "  petPlay(current.stocked % 3 === 0 ? 'splash' : current.stocked % 3 === 1 ? 'bubble' : 'selfie')\n  petVoice('feed')",
)

// 2g) 设置项加语音开关
src = src.replace(
  `    affinity: affinityState(),
  }`,
  `    affinity: affinityState(),
    voice: shellPrefs.voice !== false,
  }`,
)
src = src.replace(
  "ipcMain.handle('settings:autostart'",
  `ipcMain.handle('settings:voice', (_event, on) => {
  shellPrefs = { ...shellPrefs, voice: on === true }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  return settingsState()
})
ipcMain.handle('settings:autostart'`,
)

if (src === before) console.error('main.js 未变')
else { fs.writeFileSync(mainPath, src, 'utf8'); console.log('main.js patched') }

// ---------- 3) pet.html：语音播放器 + 点击音 ----------
let html = fs.readFileSync(petHtmlPath, 'utf8')
if (!html.includes('__petPlayVoice')) {
  html = html.replace(
    "  window.__DSHPET_SHELL__ = false",
    `  window.__DSHPET_SHELL__ = false

  // 语音：edge-tts 预生成的自然女声（assets\\voice\\*.mp3），由宿主通过 /dsh-pet/voice/ 提供
  const VOICE_PACK = {
    click: ['click1.mp3', 'click2.mp3', 'click3.mp3'],
    feed: ['feed1.mp3', 'feed2.mp3'],
    done: ['done1.mp3', 'done2.mp3'],
    fail: ['fail1.mp3', 'fail2.mp3'],
    task: ['task1.mp3'],
  }
  let lastVoiceAt = 0
  window.__petPlayVoice = function (kind) {
    const list = VOICE_PACK[kind]
    if (!list || !list.length) return
    const now = Date.now()
    if (now - lastVoiceAt < 900) return // 别让语音叠在一起
    lastVoiceAt = now
    const file = list[Math.floor(Math.random() * list.length)]
    const audio = new Audio('/dsh-pet/voice/' + file)
    audio.volume = 0.75
    audio.play().catch(() => {})
  }`,
  )
  // 点她时来一句短音
  html = html.replace(
    "    window.addEventListener('pointerup', release, true)",
    `    window.addEventListener('pointerup', event => {
      const hit = event && typeof event.clientX === 'number' ? overPet(event.clientX, event.clientY) : false
      if (hit) window.__petPlayVoice && window.__petPlayVoice('click')
      release(event)
    }, true)`,
  )
  fs.writeFileSync(petHtmlPath, html, 'utf8')
  console.log('pet.html: 语音播放器 + 点击音')
}

// ---------- 4) 设置页：语音开关 ----------
let settings = fs.readFileSync(settingsPath, 'utf8')
if (!settings.includes('voiceBtn')) {
  settings = settings.replace(
    `  <div class="row">
    <label>用量</label>`,
    `  <div class="row">
    <label>语音</label>
    <button id="voiceBtn">检查中…</button>
  </div>

  <div class="row">
    <label>用量</label>`,
  )
  settings = settings.replace(
    "    const auto = document.getElementById('autoStart')",
    `    const voiceBtn = document.getElementById('voiceBtn')
    voiceBtn.textContent = state.voice === false ? '已关闭' : '已开启'
    voiceBtn.className = state.voice === false ? '' : 'on'
    voiceBtn.onclick = () => api.setVoice(state.voice === false).then(next => { state = next; render() })
    const auto = document.getElementById('autoStart')`,
  )
  fs.writeFileSync(settingsPath, settings, 'utf8')
  console.log('settings.html: 语音开关')
}

// ---------- 5) preload-settings：setVoice ----------
const preloadSettings = petHtmlPath.replace(/live2d[\\/]pet\.html$/, 'preload-settings.js')
let ps = fs.readFileSync(preloadSettings, 'utf8')
if (!ps.includes('setVoice')) {
  ps = ps.replace(
    '  setAutoStart:',
    "  setVoice: on => ipcRenderer.invoke('settings:voice', on === true),\n  setAutoStart:",
  )
  fs.writeFileSync(preloadSettings, ps, 'utf8')
  console.log('preload-settings.js: setVoice')
}
