import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

const block = `
// ---------- 本地语音对话：麦克风 → SenseVoice → ollama → edge-tts ----------
const VOICE_EXE = path.join(ROOT, 'tools', 'sherpa', 'sherpa-onnx-offline.exe')
const ASR_DIR = path.join(ROOT, 'voice-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
const TTS_DIR = path.join(DATA_DIR, 'tts')
const OLLAMA_URL = 'http://127.0.0.1:11434/api/chat'
const OLLAMA_MODEL = 'qwen2.5:1.5b'
const PERSONA = [
  '你是「鲸鱼娘」，一只住在用户桌面上的鲸鱼娘桌宠。',
  '说话口语化、温柔、简短（一般 1-2 句、20 字以内），偶尔带一点可爱的小表情词。',
  '你在陪用户用电脑，可以关心他累不累、提醒喝水休息，不要长篇大论，不要说自己是 AI 助手。',
].join('')

let voiceWin = null
const voiceHistory = []

function ensureVoiceWindow() {
  if (voiceWin && !voiceWin.isDestroyed()) return voiceWin
  voiceWin = new BrowserWindow({
    width: 360,
    height: 140,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload-voice.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  try {
    voiceWin.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(permission === 'media' || permission === 'audioCapture')
    })
  } catch {}
  voiceWin.loadFile(path.join(ROOT, 'voice', 'voice.html'))
  voiceWin.on('closed', () => { voiceWin = null })
  log('voice window created')
  return voiceWin
}

function toggleVoiceCapture() {
  const w = ensureVoiceWindow()
  const send = () => { try { w.webContents.send('voice:record') } catch {} }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(send, 300))
  else send()
  log('voice capture toggled')
}

/** Float32 → 16bit PCM 的 WAV 文件头 */
function writeWav(file, pcmBuffer, sampleRate) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcmBuffer.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcmBuffer.length, 40)
  fs.writeFileSync(file, Buffer.concat([header, pcmBuffer]))
}

function transcribe(wavPath) {
  return new Promise(resolve => {
    if (!fs.existsSync(VOICE_EXE)) { log('asr: exe missing'); resolve(''); return }
    const { execFile } = require('node:child_process')
    execFile(VOICE_EXE, [
      '--sense-voice-model=' + path.join(ASR_DIR, 'model.int8.onnx'),
      '--tokens=' + path.join(ASR_DIR, 'tokens.txt'),
      '--sense-voice-use-itn=1',
      wavPath,
    ], { timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      if (error) { log('asr failed: ' + String(error)); resolve(''); return }
      const match = String(stdout).match(/"text"\s*:\s*"([^"]*)"/)
      resolve(match ? match[1].trim() : '')
    })
  })
}

function askOllama(text) {
  return new Promise(resolve => {
    const body = JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: PERSONA },
        ...voiceHistory.slice(-6),
        { role: 'user', content: text },
      ],
      options: { temperature: 0.8, num_predict: 120 },
    })
    const url = new URL(OLLAMA_URL)
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
          resolve(String((data.message && data.message.content) || '').trim())
        } catch { resolve('') }
      })
    })
    req.on('error', error => { log('ollama failed: ' + String(error)); resolve('') })
    req.on('timeout', () => { req.destroy(); resolve('') })
    req.write(body)
    req.end()
  })
}

function speak(text) {
  return new Promise(resolve => {
    try { fs.mkdirSync(TTS_DIR, { recursive: true }) } catch {}
    const name = 'tts-' + Date.now() + '.mp3'
    const file = path.join(TTS_DIR, name)
    const { execFile } = require('node:child_process')
    execFile('python', ['-m', 'edge_tts', '--voice', 'zh-CN-XiaoxiaoNeural', '--rate=+6%', '--text', text, '--write-media', file],
      { timeout: 30000, windowsHide: true }, error => {
        if (error || !fs.existsSync(file)) { log('tts failed: ' + String(error)); resolve(); return }
        if (win && !win.isDestroyed()) {
          win.webContents.executeJavaScript(
            'window.__petPlayFile && window.__petPlayFile(' + JSON.stringify('/dsh-pet/tts/' + name) + ')',
          ).catch(() => {})
        }
        resolve()
      })
  })
}

async function handleVoicePcm(payload) {
  try {
    const pcm = Buffer.from(payload.buffer)
    const wavPath = path.join(DATA_DIR, 'voice-last.wav')
    writeWav(wavPath, pcm, 16000)
    log('voice: ' + Number(payload.seconds || 0).toFixed(1) + 's ' + Math.round(pcm.length / 1024) + 'KB')
    const text = await transcribe(wavPath)
    log('asr -> ' + JSON.stringify(text))
    if (!text) { petSay('没听清，再说一次？'); return }
    petFace('listening')
    const reply = await askOllama(text)
    log('llm -> ' + JSON.stringify(reply.slice(0, 80)))
    if (!reply) { petSay('我这边模型没回话…'); return }
    voiceHistory.push({ role: 'user', content: text }, { role: 'assistant', content: reply })
    if (voiceHistory.length > 12) voiceHistory.splice(0, voiceHistory.length - 12)
    petSay(reply)
    petFace('happy')
    await speak(reply)
  } catch (error) {
    log('voice pipeline failed: ' + String(error))
  }
}
`

if (!src.includes('handleVoicePcm')) {
  src = src.replace('// ---------- 设置窗口 ----------', block + '\n// ---------- 设置窗口 ----------')
}

// TTS 文件路由：/dsh-pet/tts/*
src = src.replace(
  `      if (pathname.startsWith('/dsh-pet/voice/')) {`,
  `      if (pathname.startsWith('/dsh-pet/tts/')) {
        const ttsFile = path.join(DATA_DIR, 'tts', pathname.replace('/dsh-pet/tts/', ''))
        if (!ttsFile.startsWith(path.join(DATA_DIR, 'tts'))) { res.writeHead(403); res.end('forbidden'); return }
        fs.readFile(ttsFile, (error, data) => {
          if (error) { res.writeHead(404); res.end('not found'); return }
          res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
          res.end(data)
        })
        return
      }

      if (pathname.startsWith('/dsh-pet/voice/')) {`,
)

// IPC + 热键
if (!src.includes("'voice:pcm'")) {
  src = src.replace(
    "ipcMain.on('shell:toggle'",
    `ipcMain.on('voice:pcm', (_event, payload) => { handleVoicePcm(payload || {}) })
ipcMain.on('voice:ready', () => log('voice page ready'))
ipcMain.on('voice:failed', (_event, reason) => log('voice page failed: ' + reason))

ipcMain.on('shell:toggle'`,
  )
}

if (!src.includes("'Control+Alt+V'")) {
  src = src.replace(
    "      const settingsAccel = [",
    `      const voiceAccel = ['Control+Alt+V', 'Control+Shift+V']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey voice'); toggleVoiceCapture() }) } catch { return false } }) || null
      const settingsAccel = [`,
  )
  src = src.replace(
    "+ ' settings=' + settingsAccel)",
    "+ ' settings=' + settingsAccel + ' voice=' + voiceAccel)",
  )
}

if (src === before) { console.error('main.js unchanged'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('main.js patched: voice pipeline')
