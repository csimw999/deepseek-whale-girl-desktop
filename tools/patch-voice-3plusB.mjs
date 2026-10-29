import fs from 'node:fs'

const mainPath = process.argv[2]
const petHtmlPath = process.argv[3]
const voiceHtmlPath = process.argv[4]
const preloadVoicePath = process.argv[5]
const settingsPath = process.argv[6]

// ---------------- 1) pet.html：音频引用 + 打断 ----------------
let pet = fs.readFileSync(petHtmlPath, 'utf8')
if (!pet.includes('__petStopAudio')) {
  pet = pet.replace(
    `  window.__petPlayFile = function (url) {
    try { const audio = new Audio(url); audio.volume = 0.8; audio.play().catch(() => {}) } catch (e) { }
  }`,
    `  let currentAudio = null
  window.__petStopAudio = function () {
    try { if (currentAudio) { currentAudio.pause(); currentAudio.currentTime = 0; currentAudio = null } } catch (e) { }
  }
  window.__petPlayFile = function (url) {
    try {
      window.__petStopAudio()
      currentAudio = new Audio(url)
      currentAudio.volume = 0.8
      currentAudio.play().catch(() => {})
    } catch (e) { }
  }`,
  )
  pet = pet.replace(
    `    const audio = new Audio('/dsh-pet/voice/' + file)
    audio.volume = 0.75
    audio.play().catch(() => {})`,
    `    window.__petStopAudio()
    const audio = new Audio('/dsh-pet/voice/' + file)
    audio.volume = 0.75
    currentAudio = audio
    audio.play().catch(() => {})`,
  )
  fs.writeFileSync(petHtmlPath, pet, 'utf8')
  console.log('pet.html: 打断能力')
}

// ---------------- 2) voice.html：常聆听 + VAD ----------------
let voice = fs.readFileSync(voiceHtmlPath, 'utf8')
if (!voice.includes('alwaysMode')) {
  voice = voice.replace(
    "  let recording = false",
    `  let recording = false
  let alwaysMode = false
  let speechStartedAt = 0
  let silenceSince = 0
  let utterance = []`,
  )
  voice = voice.replace(
    `    node.onaudioprocess = event => {
      if (!recording) return
      const input = event.inputBuffer.getChannelData(0)
      chunks.push(new Float32Array(input))
    }`,
    `    const VAD_THRESHOLD = 0.012      // 说话音量门限
    const SILENCE_MS = 700          // 静音多久算说完
    const MIN_SPEECH_MS = 500       // 太短的忽略

    node.onaudioprocess = event => {
      if (!recording) return
      const input = event.inputBuffer.getChannelData(0)
      const copy = new Float32Array(input)
      if (!alwaysMode) { chunks.push(copy); return }

      // 常聆听：按块检测，静音够久就把这一段当成一句话送出去
      let sum = 0
      for (let i = 0; i < copy.length; i++) sum += copy[i] * copy[i]
      const rms = Math.sqrt(sum / copy.length)
      const now = performance.now()
      if (rms > VAD_THRESHOLD) {
        if (!speechStartedAt) speechStartedAt = now
        silenceSince = 0
        utterance.push(copy)
      } else if (speechStartedAt) {
        utterance.push(copy)
        if (!silenceSince) silenceSince = now
        const spokeMs = now - speechStartedAt
        const silentMs = now - silenceSince
        if (silentMs > SILENCE_MS) {
          if (spokeMs > MIN_SPEECH_MS) flush(sampleRate)
          utterance = []
          speechStartedAt = 0
          silenceSince = 0
        }
      }
    }`,
  )
  voice = voice.replace(
    "  function stop() {",
    `  function flush(rate) {
    const total = utterance.reduce((sum, part) => sum + part.length, 0)
    if (total === 0) return
    const merged = new Float32Array(total)
    let offset = 0
    for (const part of utterance) { merged.set(part, offset); offset += part.length }
    const converted = downsample(merged, rate || sampleRate, 16000)
    const pcm = new Int16Array(converted.length)
    for (let i = 0; i < converted.length; i++) {
      const sample = Math.max(-1, Math.min(1, converted[i]))
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }
    window.voiceBridge && window.voiceBridge.pcm(pcm.buffer, 16000, total / (rate || sampleRate))
    setStatus('常聆听：已发送一段')
  }

  function stop() {`,
  )
  voice = voice.replace(
    "  function downsample(buffer, fromRate, toRate) {",
    `  function setAlways(next) {
    alwaysMode = next === true
    if (alwaysMode) {
      if (!recording) begin()
      setStatus('常聆听已开启')
    } else {
      setStatus(recording ? '录音中…' : '常聆听已关闭')
      if (!recording) return
    }
  }

  function downsample(buffer, fromRate, toRate) {`,
  )
  voice = voice.replace(
    `  if (window.voiceBridge && typeof window.voiceBridge.onRecord === 'function') {
    window.voiceBridge.onRecord(() => { if (recording) stop(); else begin() })
  }`,
    `  if (window.voiceBridge && typeof window.voiceBridge.onRecord === 'function') {
    window.voiceBridge.onRecord(() => { if (recording) stop(); else begin() })
  }
  if (window.voiceBridge && typeof window.voiceBridge.onAlways === 'function') {
    window.voiceBridge.onAlways(next => setAlways(next))
  }`,
  )
  fs.writeFileSync(voiceHtmlPath, voice, 'utf8')
  console.log('voice.html: 常聆听 + VAD')
}

// ---------------- 3) preload-voice：常聆听开关 ----------------
let pv = fs.readFileSync(preloadVoicePath, 'utf8')
if (!pv.includes('onAlways')) {
  pv = pv.replace(
    "  onRecord: callback => { ipcRenderer.on('voice:record', () => callback()) },",
    "  onRecord: callback => { ipcRenderer.on('voice:record', () => callback()) },\n  onAlways: callback => { ipcRenderer.on('voice:always', (_event, on) => callback(on === true)) },",
  )
  fs.writeFileSync(preloadVoicePath, pv, 'utf8')
  console.log('preload-voice.js: 常聆听')
}

// ---------------- 4) main.js ----------------
let src = fs.readFileSync(mainPath, 'utf8')
const before = src

// 4a) 热词纠错
if (!src.includes('function fixAsr')) {
  src = src.replace(
    'function transcribe(wavPath) {',
    `// 识别后的热词纠错：模型经常把「鲸鱼娘」听成「金于娘」
const ASR_FIXES = [
  [/金于娘|金鱼娘|鲸于娘|京鱼娘|近于娘/g, '鲸鱼娘'],
  [/叶夕|叶希|夜汐|叶西|页西/g, '叶汐'],
  [/D\\s?S\\s?H/g, 'DSH'],
  [/deep\\s?seek/gi, 'DeepSeek'],
]

function fixAsr(text) {
  let out = String(text || '')
  for (const [pattern, replacement] of ASR_FIXES) out = out.replace(pattern, replacement)
  return out
}

function transcribe(wavPath) {`,
  )
  src = src.replace(
    "const text = await transcribe(wavPath)",
    "const text = fixAsr(await transcribe(wavPath))",
  )
}

// 4b) 常聆听开关 + 打断
if (!src.includes('toggleAlwaysListen')) {
  src = src.replace(
    'function toggleVoiceCapture() {',
    `let alwaysListen = false

function toggleAlwaysListen() {
  alwaysListen = !alwaysListen
  const w = ensureVoiceWindow()
  const send = () => { try { w.webContents.send('voice:always', alwaysListen) } catch {} }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(send, 300))
  else send()
  log('always listen -> ' + alwaysListen)
  petSay(alwaysListen ? '常聆听已开启，直接说话就行' : '常聆听已关闭')
}

function stopSpeaking() {
  if (!win || win.isDestroyed()) return
  win.webContents.executeJavaScript('window.__petStopAudio && window.__petStopAudio()').catch(() => {})
}

function toggleVoiceCapture() {`,
  )
  src = src.replace(
    "  log('voice capture toggled')",
    "  stopSpeaking()\n  log('voice capture toggled')",
  )
}

// 4c) B 方向：让她对 DSH 说话（剪贴板注入 + 自动粘贴回车）
if (!src.includes('function sayToDsh')) {
  src = src.replace(
    'function handleVoicePcm(payload) {',
    `// B 方向：桌宠 → DSH。DSH 的 HTTP 接口要内部鉴权（试过 Bearer 401），
// 所以改用「剪贴板 + 窗口注入」：找到 DSH 窗口 → 粘贴 → 回车。
function sayToDsh(text) {
  return new Promise(resolve => {
    const { clipboard } = require('electron')
    const { execFile } = require('node:child_process')
    clipboard.writeText(String(text || ''))
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Text;',
      'using System.Runtime.InteropServices;',
      'public class W {',
      '  [DllImport("user32.dll")] public static extern IntPtr FindWindow(string c, string n);',
      '  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);',
      '  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int c);',
      '  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);',
      '  public delegate bool EnumProc(IntPtr h, IntPtr p);',
      '}',
      '"@',
      '$target = [IntPtr]::Zero',
      '$cb = [W+EnumProc]{ param($h,$p) $sb = New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText($h,$sb,512); if ([W]::IsWindowVisible($h) -and $sb.ToString() -match "DeepSeek Harness|DSH") { $script:target = $h; return $false }; return $true }',
      '[void][W]::EnumWindows($cb, [IntPtr]::Zero)',
      'if ($target -ne [IntPtr]::Zero) { [void][W]::SetForegroundWindow($target); Start-Sleep -Milliseconds 250; [System.Windows.Forms.SendKeys]::SendWait("^v"); Start-Sleep -Milliseconds 150; [System.Windows.Forms.SendKeys]::SendWait("{ENTER}"); Write-Output "sent" } else { Write-Output "window-not-found" }',
    ].join('\\n')
    execFile('powershell', ['-NoProfile', '-STA', '-Command', script], { timeout: 8000, windowsHide: true }, (error, stdout) => {
      const ok = String(stdout || '').includes('sent')
      log('say -> dsh: ' + (ok ? 'ok' : 'window-not-found') + (error ? ' err=' + error.message : ''))
      resolve(ok)
    })
  })
}

function handleVoicePcm(payload) {`,
  )
}

// 4d) /dsh-pet/say 真正实现
src = src.replace(
  `      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true }))
        return
      }`,
  `      if (pathname === '/dsh-pet/say' && req.method === 'POST') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', async () => {
          let body = {}
          try { body = raw ? JSON.parse(raw) : {} } catch {}
          const text = String(body.text || body.message || '').trim()
          if (!text) {
            res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' })
            res.end(JSON.stringify({ ok: false, reason: 'empty' }))
            return
          }
          const ok = await sayToDsh(text)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok, text }))
        })
        return
      }

      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true }))
        return
      }`,
)

// 4e) 语音里说"跟 DSH 说 …"就转发
src = src.replace(
    `    petFace('listening')
    const reply = await askOllama(text)`,
    `    petFace('listening')
    const forward = text.match(/^(跟|告诉|对)\\s*DSH\\s*(说|讲)?[:：]?\\s*(.+)$/i)
    if (forward) {
      const content = forward[3].trim()
      const ok = await sayToDsh(content)
      petSay(ok ? '已经转达给 DSH 啦' : '没找到 DSH 窗口…')
      return
    }
    const reply = await askOllama(text)`,
)

// 4f) 常聆听热键
if (!src.includes("'Control+Alt+L'")) {
  src = src.replace(
    "      const settingsAccel = [",
    `      const listenAccel = ['Control+Alt+L', 'Control+Shift+L']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey always-listen'); toggleAlwaysListen() }) } catch { return false } }) || null
      const settingsAccel = [`,
  )
  src = src.replace(
    "+ ' voice=' + voiceAccel)",
    "+ ' voice=' + voiceAccel + ' listen=' + listenAccel)",
  )
}

if (src === before) { console.error('main.js 未变'); process.exit(1) }
fs.writeFileSync(mainPath, src, 'utf8')
console.log('main.js patched: 热词/打断/常聆听/DSH 注入')

// ---------------- 5) settings：常聆听开关 ----------------
let settings = fs.readFileSync(settingsPath, 'utf8')
if (!settings.includes('listenBtn')) {
  settings = settings.replace(
    `  <div class="row">
    <label>用量</label>`,
    `  <div class="row">
    <label>常聆听</label>
    <button id="listenBtn">—</button>
    <span style="color:#7f8db3;font-size:12px">Ctrl+Alt+L</span>
  </div>

  <div class="row">
    <label>用量</label>`,
  )
  settings = settings.replace(
    "    const auto = document.getElementById('autoStart')",
    `    const listenBtn = document.getElementById('listenBtn')
    listenBtn.textContent = state.alwaysListen ? '已开启' : '未开启'
    listenBtn.className = state.alwaysListen ? 'on' : ''
    listenBtn.onclick = () => api.toggleListen().then(next => { state = next; render() })
    const auto = document.getElementById('autoStart')`,
  )
  fs.writeFileSync(settingsPath, settings, 'utf8')
  console.log('settings.html: 常聆听开关')
}

let ps = fs.readFileSync(settingsPath.replace(/ui[\\/]settings\.html$/, 'preload-settings.js'), 'utf8')
if (!ps.includes('toggleListen')) {
  ps = ps.replace(
    '  setVoice:',
    "  toggleListen: () => ipcRenderer.invoke('settings:listen'),\n  setVoice:",
  )
  fs.writeFileSync(settingsPath.replace(/ui[\\/]settings\.html$/, 'preload-settings.js'), ps, 'utf8')
  console.log('preload-settings.js: toggleListen')
}

// main: settings:listen + state
let main2 = fs.readFileSync(mainPath, 'utf8')
if (!main2.includes("'settings:listen'")) {
  main2 = main2.replace(
    "ipcMain.handle('settings:voice'",
    `ipcMain.handle('settings:listen', () => {
  toggleAlwaysListen()
  return settingsState()
})
ipcMain.handle('settings:voice'`,
  )
  main2 = main2.replace(
    `    voice: shellPrefs.voice !== false,`,
    `    voice: shellPrefs.voice !== false,
    alwaysListen,`,
  )
  fs.writeFileSync(mainPath, main2, 'utf8')
  console.log('main.js: settings:listen')
}
