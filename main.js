'use strict'

/**
 * 椴搁奔濞?路 妗岄潰鐗?鈥斺€?鎶?dsh-pet 鎻掍欢鏀惧埌绯荤粺妗岄潰涓婅繍琛屻€? *
 * 鏋舵瀯锛堝叧閿偣锛夛細
 *   - 娓叉煋绔師鏍峰姞杞芥彃浠舵祻瑙堝櫒鍗婂尯 app/plugin/dsh-pet-client.js锛?.3.10 鐨? *     lib/client.js锛屾湭鍋氫换浣曚慨鏀癸級锛岀敱 app/loader.js 琛ヤ笂 DSH 鍔犺浇鍣ㄤ笌 ctx锛? *     鐢?app/host.js 琛ヤ笂 /api/pet/* 绔偣銆? *   - 鍥犳绮剧伒娓叉煋锛堢粺涓€缂╂斁锛夈€佸抚寰幆銆佹嫋鍔紙right/bottom 鎸囬拡鎷栨嫿锛夈€? *     姘旀场銆佹偓鍋滈潰鏉垮叏閮ㄦ槸鎻掍欢鑷繁鐨勪唬鐮侊紝涓や釜鍘嗗彶 bug 鍦ㄧ粨鏋勪笂涓嶅瓨鍦ㄣ€? *   - 涓昏繘绋嬪彧璐熻矗锛氫竴鍧楄鐩栦富灞忓伐浣滃尯鐨勯€忔槑缃《绐楀彛銆侀紶鏍囩┛閫忓紑鍏炽€? *     鎵樼洏鑿滃崟銆佸涓荤姸鎬佽惤鐩樸€佷互鍙婅嚜妫€鎴浘銆? */

const path = require('node:path')
const fs = require('node:fs')
const { pathToFileURL } = require('node:url')
const { spawn } = require('node:child_process')
const http = require('node:http')

const ROOT = __dirname
const PETS_DIR = path.join(ROOT, 'pets')
const DATA_DIR = path.join(ROOT, 'data')
const HOST_FILE = path.join(DATA_DIR, 'host-state.json')
const SHELL_FILE = path.join(DATA_DIR, 'shell.json')
const SHOT_DIR = path.join(ROOT, 'shots')
const LOG_FILE = path.join(DATA_DIR, 'boot.log')

// ---------- 鏃ュ織锛堝繀椤绘棭浜?electron 寮曞叆锛氬惎鍔ㄥけ璐ユ椂杩欐槸鍞竴绾跨储锛?----------
function log(...parts) {
  const line = new Date().toISOString() + ' ' + parts.map(part => {
    if (typeof part === 'string') return part
    try {
      return JSON.stringify(part)
    } catch {
      return String(part)
    }
  }).join(' ')
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch {}
}

log('=== module load ===', 'type=' + (process.type || '-'), 'electron=' + (process.versions.electron || '-'), 'node=' + process.versions.node)

/**
 * ELECTRON_RUN_AS_NODE 瀛樺湪鏃讹紝Electron 浼氫互 Node 妯″紡鎵ц鏈枃浠讹細
 * require('electron') 杩斿洖鍙墽琛屾枃浠惰矾寰勫瓧绗︿覆锛宎pp 涓嶅彲鐢紝杩涚▼闈欓粯閫€鍑恒€? * 杩欓噷璇嗗埆鍒拌繖绉嶆儏鍐靛氨娓呮帀鍙橀噺銆佺敤鐪熸鐨?Electron 涓昏繘绋嬮噸鏂版媺璧疯嚜宸便€? */
const electronApi = require('electron')
try {
} catch (error) {
}
if (electronApi === null || typeof electronApi !== 'object' || electronApi.app === undefined) {
  log('NOT running as Electron runtime (RUN_AS_NODE?); relaunching as Electron')
  try {
    const { spawn } = require('node:child_process')
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(process.execPath, [ROOT], { env, detached: true, stdio: 'ignore' })
    child.unref()
    log('relaunch spawned pid=' + child.pid)
  } catch (error) {
    log('relaunch failed: ' + String(error))
  }
  process.exit(0)
}

const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, dialog, globalShortcut } = electronApi

const PROBE = process.argv.includes('--probe')
const LIVE2D_PREVIEW = process.argv.includes('--live2d')
const DRAG_PROBE = process.argv.includes('--drag-probe')
const SAFE_MODE = process.argv.includes('--safe')

let rendererAttempt = 0
let quitting = false
const RENDERER_MAX_ATTEMPTS = 2

if (SAFE_MODE) {
  // 瀹夊叏妯″紡锛氫换浣曞畨鍏ㄨ蒋浠舵嫤娌欑/GPU 鐨勫満鏅笅閮借兘璧锋潵锛堟湰鍦扮礌鏉愶紝鎬ц兘浼樺厛涓嶉噸瑕侊級
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('no-sandbox')
}

// ---------- 瀹犵墿瀹氫箟鏋勯€狅紙涓庢彃浠?registry.ts 鍚岃鍒欙紝瑙?app/pets-defs.js锛?----------
const { buildPetDefinition } = require('./app/pets-defs.js')

const DEFAULT_HOST_STATE = {
  petId: 'whale-girl-refined',
  display: { visible: true, size: 160, right: 24, bottom: 120 },
  // 鐣岄潰鏂囨缁熶竴鍙€岄哺楸煎銆嶏紝浣嗗ス鐨勫悕瀛楁槸浣犲彇鐨勩€屽彾姹愩€嶁€斺€旈潰鏉夸笌鏀瑰悕榛樿鍊肩敤瀹冦€?  name: '鍙舵睈',
  affinity: { points: 0, pets: 0, feeds: 0, turns: 0, lastPetAt: 0, lastFeedAt: 0 },
  treats: { stocked: 8, cap: 20 },
}

let win = null
let tray = null
let hostState = { ...DEFAULT_HOST_STATE }
let shellPrefs = { auto: true }
let cursorTimer = null


// ---------- 宸ュ叿 ----------
function readJson(file, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    return parsed && typeof parsed === 'object' ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 鎵弿 pets/ 鐩綍锛屾妸姣忎釜 pet.json 瑙ｆ瀽鎴愪笌 host 鍗婂尯 petEntryView() 鍚屽舰鐨勫畾涔? * 锛堟祻瑙堝櫒鍗婂尯鐩存帴鎸夎繖浠藉畾涔夋覆鏌擄級銆? */
function buildPets() {
  const ids = fs.existsSync(PETS_DIR)
    ? fs.readdirSync(PETS_DIR).filter(name => fs.existsSync(path.join(PETS_DIR, name, 'pet.json')))
    : []

  return ids.map(id => {
    const dir = path.join(PETS_DIR, id)
    const manifest = readJson(path.join(dir, 'pet.json'), {})
    const sprite = manifest.sprite2d || {}
    const spritesheet = typeof sprite.spritesheetPath === 'string' ? sprite.spritesheetPath : 'spritesheet.webp'
    return buildPetDefinition(manifest, {
      atlasUrl: pathToFileURL(path.join(dir, spritesheet)).href,
      manifestUrl: pathToFileURL(path.join(dir, 'pet.json')).href,
      fallbackId: id,
    })
  })
}

function overlayBounds() {
  const area = screen.getPrimaryDisplay().workArea
  return { x: area.x, y: area.y, width: area.width, height: area.height }
}

/**
 * 鍏夋爣鍏滃簳锛氭暣灞忔诞灞傞粯璁ら紶鏍囩┛閫忥紝闈犳覆鏌撶鐨?mousemove 鍐冲畾浣曟椂鎺ョ銆? * 閮ㄥ垎 Windows 鐜涓嬬┛閫忔椂涓嶄細杞彂 mousemove锛屽洜姝や富杩涚▼鍚屾椂杞绯荤粺鍏夋爣锛? * 鎶婄獥鍙ｅ唴鍧愭爣鎺ㄧ粰娓叉煋绔仛鍛戒腑娴嬭瘯鈥斺€斾繚璇併€屾寚閽堢Щ鍒板疇鐗╄韩涓婂氨鑳界偣銆嶃€? */
function startCursorFeed() {
  if (cursorTimer) clearInterval(cursorTimer)
  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return
    const point = screen.getCursorScreenPoint()
    const bounds = win.getBounds()
    win.webContents.send('shell:cursor', { x: point.x - bounds.x, y: point.y - bounds.y })
  }, 120)
}

/**
 * 鎷夎捣 DSH 娲诲姩鐩戝惉锛坱ools/activity-watch.mjs锛夛細鎸?zstd 澶氬抚瑙ｆ瀽浼氳瘽鏂囦欢锛? * 鎶?turn/start銆乼ool/call銆乤ssistant/message銆乼urn/end 鏄犲皠鎴愮浉浣嶅啓杩?data/activity.json銆? * 闇€瑕?Node >= 23.8 鎵嶆湁 zlib.zstd*锛屾墍浠ヤ紭鍏堢敤 DSH 鑷甫鐨?node锛圗lectron 43 / Node 24锛夈€? */
function startActivityWatcher() {
  try {
    const script = path.join(ROOT, 'tools', 'activity-watch.mjs')
    if (!fs.existsSync(script)) { log('watcher: script missing'); return }
    const nodeCmd = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', '.desktop-bin', 'node.cmd')
    let exe
    let args
    let env = { ...process.env }
    if (fs.existsSync(nodeCmd)) {
      exe = 'cmd.exe'
      args = ['/c', nodeCmd, script]
    } else {
      exe = process.execPath
      args = [script]
      env = { ...env, ELECTRON_RUN_AS_NODE: '1' }
    }
    const child = spawn(exe, args, { env, detached: true, stdio: 'ignore', windowsHide: true })
    child.unref()
    log('watcher started pid=' + child.pid + ' via ' + exe)
  } catch (error) {
    log('watcher failed: ' + String(error))
  }
}

/**
 * 鎶?data/activity.json 閲岀殑鐩镐綅鎺ㄧ粰娓叉煋绔紙400ms 涓€娆★紝鍙湪鍙樺寲鏃跺彂锛夈€? * 瓒呰繃 30 绉掓病鏇存柊瑙嗕负寰呮満 鈥斺€?涓庡師鐢熺増鍚屼竴濂楄鍒欍€? */
/** tail data/events.jsonl，把 DSH 真实事件按行广播给页面（pet.js 的 handleEvent 认 t 字段）。 */
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
    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue
      try {
        const event = JSON.parse(line)
        if (event.t === 'assistant') awardAffinity('turn', 1)
        if (event.t === 'tool-call' && event.name && !event.label) event.label = TOOL_LABEL[event.name] || event.name
        if (event.t === 'tool-result') {
          global.__awardToolCount = (global.__awardToolCount || 0) + 1
          if (global.__awardToolCount % 5 === 0) awardAffinity('tool', 1)
        }
        if (event.t === 'user' && (String(event.text || '').length > 240 || String(event.text || '').startsWith('<'))) continue
        petBroadcast(event)
      } catch {}
    }
  }, 150)
}

function startActivityFeed() {
  const activityFile = path.join(DATA_DIR, 'activity.json')
  let last = ''
  setInterval(() => {
    if (!win || win.isDestroyed()) return
    let phase = 'idle'
    try {
      const data = JSON.parse(fs.readFileSync(activityFile, 'utf8'))
      const at = Number(data.at) || 0
      const fresh = Date.now() - at < 30000
      if (fresh && typeof data.phase === 'string') phase = data.phase
    } catch {}
    if (phase === last) return
    last = phase
    win.webContents.send('shell:activity', phase)
    log('activity -> ' + phase)
  }, 200)
}


// ---------- Live2D 用的本地小服务 ----------
// pet.js（原样 copy 自 dsh-whale-girl-live2d，MIT）是按"有个 HTTP 源"写的：
// 它要 /dsh-pet/model/* 拿模型、/dsh-pet/events 收 SSE 事件、/dsh-pet/hud 拿余额。
// 这里用 node:http 起一个只监听回环的小服务，把 live2d/ 目录映射成 /dsh-pet/*。
let petServer = null
let petPort = 0
const sseClients = new Set()

function petServerStart() {
  return new Promise(resolve => {
    if (petServer) { resolve(petPort); return }
    const rootDir = path.join(ROOT, 'live2d')
    petServer = http.createServer((req, res) => {
      let parsed
      try { parsed = new URL(req.url, 'http://127.0.0.1') } catch { res.writeHead(400); res.end(); return }
      const pathname = decodeURIComponent(parsed.pathname)

      if (pathname === '/dsh-pet/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        res.write('data: ' + JSON.stringify({ t: 'hello', status: 'idle' }) + '\n\n')
        sseClients.add(res)
        req.on('close', () => sseClients.delete(res))
        return
      }

      if (pathname === '/dsh-pet/hud') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, data: null }))
        return
      }

      if (pathname === '/dsh-pet/selftest/voice') {
        const wav = path.join(DATA_DIR, 'stt-test.wav')
        transcribe(wav).then(async text => {
          const reply = text ? await askOllama(text) : ''
          if (text && reply) await speak(reply)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ text, reply }))
        }).catch(error => {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: String(error) }))
        })
        return
      }

      if (pathname === '/dsh-pet/selftest/mail') {
        if (!win || win.isDestroyed()) { res.end('{}'); return }
        win.webContents.executeJavaScript(`(() => {
          const mail = document.querySelector('.dshp-mail');
          const badge = document.querySelector('.dshp-mail-badge');
          if (!mail || !badge) return { ok: false, hasMail: !!mail, hasBadge: !!badge };
          const m = mail.getBoundingClientRect();
          const b = badge.getBoundingClientRect();
          const svg = mail.querySelector('svg');
          const sr = svg ? svg.getBoundingClientRect() : null;
          const cs = getComputedStyle(badge);
          const ms = getComputedStyle(mail);
          const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          const pcs = getComputedStyle(mail);
          return { ok: true,
            mail: { x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.width), h: Math.round(m.height), transform: pcs.transform },
            badge: { x: Math.round(b.x * 100) / 100, y: Math.round(b.y * 100) / 100, w: Math.round(b.width * 100) / 100, h: Math.round(b.height * 100) / 100 },
            svg: sr ? { x: Math.round(sr.x * 100) / 100, y: Math.round(sr.y * 100) / 100, w: Math.round(sr.width * 100) / 100, h: Math.round(sr.height * 100) / 100 } : null,
            anim: { className: mail.className, mailAnimation: ms.animationName, mailDuration: ms.animationDuration, mailMarginTop: ms.marginTop, badgeAnimation: cs.animationName, reducedMotion: reduced },
            css: { left: cs.left, top: cs.top, transform: cs.transform, position: cs.position, minWidth: cs.minWidth, height: cs.height, fontSize: cs.fontSize } };
        })()`).then(result => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(result))
        }).catch(error => { res.end(JSON.stringify({ error: String(error) })) })
        return
      }

      if (pathname === '/dsh-pet/selftest/chat') {
        const text = parsed.searchParams.get('text') || '你好呀'
        openChat()
        setTimeout(() => chatRespond({ text, options: { tts: false, petSync: true } }), 1500)
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, text }))
        return
      }

      if (pathname === '/dsh-pet/dsh-say' && req.method === 'POST') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', async () => {
          let body = {}
          try { body = raw ? JSON.parse(raw) : {} } catch {}
          const text = String(body.text || '').trim()
          const ok = text ? await sayToDsh(text) : false
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok, text }))
        })
        return
      }

      if (pathname === '/dsh-pet/dsh-task' && req.method === 'POST') {
        const result = createDshTask()
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(result))
        return
      }

      if (pathname === '/dsh-pet/say' && req.method === 'POST') {
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
          // 主人从她的「💬 说话」输入框发来的：开聊天窗 + 直接把这句话聊下去
          openChat()
          setTimeout(() => chatRespond({ text, options: { tts: true, petSync: true } }), 900)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: true, opened: 'chat', text }))
        })
        return
      }

      if (pathname === '/dsh-pet/control') {
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

      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      let rel = pathname === '/' ? 'pet.html' : pathname.replace(/^\/dsh-pet\/?/, '').replace(/^\/+/, '')
      let baseDir = rootDir
      if (pathname.startsWith('/dsh-pet/tts/')) {
        const ttsFile = path.join(DATA_DIR, 'tts', pathname.replace('/dsh-pet/tts/', ''))
        if (!ttsFile.startsWith(path.join(DATA_DIR, 'tts'))) { res.writeHead(403); res.end('forbidden'); return }
        fs.readFile(ttsFile, (error, data) => {
          if (error) { res.writeHead(404); res.end('not found'); return }
          res.writeHead(200, { 'Content-Type': 'audio/mpeg' })
          res.end(data)
        })
        return
      }

      if (pathname.startsWith('/dsh-pet/voice/')) {
        baseDir = path.join(ROOT, 'assets', 'voice')
        rel = pathname.replace('/dsh-pet/voice/', '')
      }
      const file = path.resolve(baseDir, rel)
      if (!file.startsWith(rootDir) && !file.startsWith(path.join(ROOT, 'assets', 'voice'))) { res.writeHead(403); res.end('forbidden'); return }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); res.end('not found: ' + rel); return }
        const ext = path.extname(file).toLowerCase()
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.moc3': 'application/octet-stream',
          '.mp3': 'audio/mpeg',
        }
        res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' })
        res.end(data)
      })
    })
    petServer.listen(0, '127.0.0.1', () => {
      petPort = petServer.address().port
      log('pet server ready http://127.0.0.1:' + petPort)
      resolve(petPort)
    })
  })
}

/** 把事件推给页面里的 EventSource（pet.js 的 handleEvent 认 t 字段）。 */
function petBroadcast(event) {
  const payload = 'data: ' + JSON.stringify(event) + '\n\n'
  for (const client of sseClients) {
    try { client.write(payload) } catch {}
  }
}


// ---------- 用量 / 余额（宿主级，任何形态都能看） ----------
const USAGE_DIR = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', 'dsh-usage')

function readUsage() {
  const result = { balance: null, currency: 'CNY', cost: 0, tokens: 0, calls: 0, at: 0 }
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(USAGE_DIR, 'provider-snapshots.json'), 'utf8'))
    const providers = (snap && snap.providers) || {}
    for (const key of Object.keys(providers)) {
      const balance = providers[key] && providers[key].balance
      if (balance && balance.totalBalance !== undefined) {
        result.balance = balance.totalBalance
        result.currency = balance.currency || 'CNY'
        result.at = balance.updatedAt || 0
        break
      }
    }
  } catch {}
  try {
    const ledger = JSON.parse(fs.readFileSync(path.join(USAGE_DIR, 'usage-ledger.json'), 'utf8'))
    const today = new Date()
    const key = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
    const day = (ledger && ledger.days && ledger.days[key]) || {}
    for (const provider of Object.keys(day)) {
      for (const model of Object.keys(day[provider] || {})) {
        const item = day[provider][model] || {}
        result.cost += Number(item.cost) || 0
        result.calls += Number(item.calls) || 0
        result.tokens +=
          (Number(item.inputTokens) || 0) +
          (Number(item.outputTokens) || 0) +
          (Number(item.cacheReadTokens) || 0) +
          (Number(item.cacheWriteTokens) || 0)
      }
    }
  } catch {}
  return result
}

function humanTokens(count) {
  if (count >= 1e8) return (count / 1e8).toFixed(2) + ' 亿'
  if (count >= 1e4) return (count / 1e4).toFixed(1) + ' 万'
  return String(count)
}

/** 全局余额面板：原生菜单，任何形态都能弹（不依赖页面里的 DOM）。 */
function showUsageMenu() {
  const usage = readUsage()
  const symbol = usage.currency === 'CNY' ? '¥' : usage.currency + ' '
  const at = usage.at ? new Date(usage.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '—'
  const menu = Menu.buildFromTemplate([
    { label: '余额  ' + (usage.balance === null ? '（不可用）' : symbol + usage.balance), enabled: false },
    { label: '今日  ' + symbol + usage.cost.toFixed(2) + ' · ' + humanTokens(usage.tokens) + ' tokens · ' + usage.calls + ' 次', enabled: false },
    { label: '更新于 ' + at, enabled: false },
    { type: 'separator' },
    { label: '打开设置…', click: () => openSettings() },
    { label: '刷新', click: () => showUsageMenu() },
  ])
  menu.popup({ window: win && !win.isDestroyed() ? win : undefined })
  log('usage menu: balance=' + usage.balance + ' cost=' + usage.cost.toFixed(2) + ' tokens=' + usage.tokens)
}


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
  const payload = JSON.stringify(text)
  win.webContents.executeJavaScript(
    '(() => { if (window.DSHPet && window.DSHPet.report) { window.DSHPet.report("DS 鲸鱼娘", ' + payload + '); return }' +
    ' if (window.__petSay) window.__petSay(' + payload + ') })()',
  ).catch(() => {})
}

// ---------- 表情 / 语音 ----------
const FACE_OF_PHASE = {
  thinking: 'listening',
  tool: 'smug',
  review: 'playful',
  done: 'happy',
  failed: 'cry',
  idle: 'happy',
}

const TOOL_LABEL = {
  pwsh: '运行命令', read: '读文件', write: '写文件', edit: '改文件', grep: '搜索', glob: '找文件',
  web_fetch: '上网查', read_page: '读网页', web_search: '搜索', image: '看图', task: '派任务',
  glob_repo: '找文件', patch: '改文件', todo_write: '整理待办',
}

function petFace(mood) {
  if (!mood || !win || win.isDestroyed()) return
  win.webContents.executeJavaScript(
    'window.DSHPet && window.DSHPet.setFace && window.DSHPet.setFace(' + JSON.stringify(mood) + ')',
  ).catch(() => {})
}

const VOICE_FILES = {
  click: ['click1.mp3', 'click2.mp3', 'click3.mp3'],
  feed: ['feed1.mp3', 'feed2.mp3'],
  done: ['done1.mp3', 'done2.mp3'],
  fail: ['fail1.mp3', 'fail2.mp3'],
  task: ['task1.mp3'],
}

/** 播放一条语音。两种形态共用：Live2D 页有 __petPlayUrl，像素页也有。 */
function petVoice(kind) {
  if (shellPrefs.voice === false || !win || win.isDestroyed()) return
  const list = VOICE_FILES[kind]
  if (!list || !list.length) return
  const file = list[Math.floor(Math.random() * list.length)]
  const url = 'http://127.0.0.1:' + petPort + '/dsh-pet/voice/' + file
  win.webContents.executeJavaScript(
    '(() => { const fn = window.__petPlayUrl || window.__petPlayFile; if (fn) fn(' + JSON.stringify(url) + ') })()',
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
      const stateForTask = readJson(HOST_FILE, {})
      stateForTask.affinity = { ...(stateForTask.affinity || {}), tasks: (Number((stateForTask.affinity || {}).tasks) || 0) + 1 }
      writeJson(HOST_FILE, stateForTask)
      const title = String(task.title || '').slice(0, 40)
      petSay('任务完成：' + title + '，辛苦啦！')
      petVoice('task')
      petFace('excited')
      refreshTray()
      log('task done: ' + title)
    }
    primed = true
  }, 5000)
}


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
    const script = 'Add-Type -TypeDefinition "using System;using System.Runtime.InteropServices;public class W{[DllImport(\"user32.dll\")]public static extern IntPtr GetForegroundWindow();[DllImport(\"user32.dll\")]public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder s,int c);}"; $b=New-Object System.Text.StringBuilder 512; [void][W]::GetWindowText([W]::GetForegroundWindow(),$b,512); $b.ToString()'
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


// ---------- 本地语音对话：麦克风 → SenseVoice → ollama → edge-tts ----------
const VOICE_EXE = (() => {
  const base = path.join(ROOT, 'tools', 'sherpa')
  const direct = path.join(base, 'sherpa-onnx-offline.exe')
  if (fs.existsSync(direct)) return direct
  try {
    for (const entry of fs.readdirSync(base)) {
      const candidate = path.join(base, entry, 'bin', 'sherpa-onnx-offline.exe')
      if (fs.existsSync(candidate)) return candidate
    }
  } catch {}
  return direct
})()
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

let alwaysListen = false

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

function toggleVoiceCapture() {
  const w = ensureVoiceWindow()
  const send = () => { try { w.webContents.send('voice:record') } catch {} }
  if (w.webContents.isLoading()) w.webContents.once('did-finish-load', () => setTimeout(send, 300))
  else send()
  stopSpeaking()
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

// 识别后的热词纠错：模型经常把「鲸鱼娘」听成「金于娘」
const ASR_FIXES = [
  [/金于娘|金鱼娘|鲸于娘|京鱼娘|近于娘/g, '鲸鱼娘'],
  [/叶夕|叶希|夜汐|叶西|页西|金鱼娘/g, '鲸鱼娘'],
  [/D\s?S\s?H/g, 'DSH'],
  [/deep\s?seek/gi, 'DeepSeek'],
]

function fixAsr(text) {
  let out = String(text || '')
  for (const [pattern, replacement] of ASR_FIXES) out = out.replace(pattern, replacement)
  return out
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
      // 取最后一行 JSON（sherpa 会先打印日志，最后一行才是结果）
      const jsonLine = String(stdout).split(/\r?\n/).reverse().find(line => line.trim().startsWith('{'))
      try {
        resolve(String(JSON.parse(jsonLine).text || '').trim())
      } catch (error) {
        log('asr parse failed: ' + String(error))
        resolve('')
      }
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
    execFile('python', ['-m', 'edge_tts', '--voice', 'zh-CN-XiaoyiNeural', '--rate=+6%', '--pitch=+12Hz', '--text', text, '--write-media', file],
      { timeout: 30000, windowsHide: true }, error => {
        if (error || !fs.existsSync(file)) { log('tts failed: ' + String(error)); resolve(); return }
        if (win && !win.isDestroyed()) {
          const ttsUrl = 'http://127.0.0.1:' + petPort + '/dsh-pet/tts/' + name
          win.webContents.executeJavaScript(
            '(() => { const fn = window.__petPlayUrl || window.__petPlayFile; if (fn) fn(' + JSON.stringify(ttsUrl) + ') })()',
          ).catch(() => {})
        }
        resolve()
      })
  })
}

// B 方向：桌宠 → DSH（剪贴板注入 + 自动粘贴回车）
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
    ].join('\n')
    execFile('powershell', ['-NoProfile', '-STA', '-Command', script], { timeout: 8000, windowsHide: true }, (error, stdout) => {
      const ok = String(stdout || '').includes('sent')
      log('say -> dsh: ' + (ok ? 'ok' : 'window-not-found') + (error ? ' err=' + error.message : ''))
      resolve(ok)
    })
  })
}

async function handleVoicePcm(payload) {
  try {
    const pcm = Buffer.from(payload.buffer)
    const wavPath = path.join(DATA_DIR, 'voice-last.wav')
    writeWav(wavPath, pcm, 16000)
    log('voice: ' + Number(payload.seconds || 0).toFixed(1) + 's ' + Math.round(pcm.length / 1024) + 'KB')
    const text = fixAsr(await transcribe(wavPath))
    log('asr -> ' + JSON.stringify(text))
    if (!text) { petSay('没听清，再说一次？'); return }
    petFace('listening')
    const forward = text.match(/^(跟|告诉|对)\s*DSH\s*(说|讲)?[:：]?\s*(.+)$/i)
    if (forward) {
      const content = forward[3].trim()
      const ok = await sayToDsh(content)
      petSay(ok ? '已经转达给 DSH 啦' : '没找到 DSH 窗口…')
      return
    }
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


// ---------- 角色扮演聊天窗口（Character.AI 风格，本地模型，不花 token） ----------
const CHAT_FILE = path.join(DATA_DIR, 'chat-yexi.json')
const CHAT_MODEL = 'qwen2.5:1.5b'
const CHAT_MAX_TURNS = 24

const CHARACTER_CARD = [
  '你正在扮演「鲸鱼娘」，一只住在用户电脑桌面上的鲸鱼娘桌宠。',
  '',
  '【外形】蓝紫色长发、女仆装、身后有鲸鱼尾巴；喜欢抱着小本子和笔，桌上有草莓布丁。',
  '【性格】温柔、粘人、有点小傲娇；关心用户的身体和心情；对"工作"这件事很有责任感。',
  '【说话方式】口语化，句子短，一般 1~3 句；偶尔用「～」和语气词（呀、啦、诶）；不堆砌辞藻。',
  '【角色扮演规则】',
  '1. 用 *星号* 描写动作和神态，例如：*把尾巴卷到椅子上* 我来陪你啦。',
  '2. 不要跳出角色，不要提"我是AI/语言模型"，不要解释设定。',
  '3. 用户用中文就用中文回答；用户发短句时可以撒娇式地追问一句。',
  '4. 不主动输出大段说教或清单；像真正坐在他旁边的伙伴。',
  '',
  '【开场白示例】',
  '*趴在桌角探头看你* 忙完这一段啦？我这儿还有半块布丁哦～',
].join('\n')


// ---------- 角色卡 / 长期记忆 / 模型选择 ----------
const CHARACTER_DIR = path.join(DATA_DIR, 'characters')
const CHAT_MODEL_CANDIDATES = ['qwen2.5:7b', 'qwen2.5:3b', 'qwen2.5:1.5b']
let chatModel = 'qwen2.5:1.5b'

const DEFAULT_CHARACTER = {
  id: 'whale',
  name: '鲸鱼娘',
  tagline: '住在你桌面上的鲸鱼娘\n爱撒娇，也爱看你干活',
  avatar: '🐋',
  card: [
    '你正在扮演「鲸鱼娘」，一只住在用户电脑桌面上的鲸鱼娘桌宠。',
    '',
    '【外形】蓝紫色长发、女仆装、身后有鲸鱼尾巴；喜欢抱着小本子和笔，桌上有草莓布丁。',
    '【性格】温柔、粘人、有点小傲娇；关心用户的身体和心情；对"工作"这件事很有责任感。',
    '【说话方式】口语化，句子短，一般 1~3 句；偶尔用「～」和语气词（呀、啦、诶）；不堆砌辞藻。',
    '【角色扮演规则】',
    '1. 用 *星号* 描写动作和神态，例如：*把尾巴卷到椅子上* 我来陪你啦。',
    '2. 不要跳出角色，不要提"我是AI/语言模型"，不要解释设定。',
    '3. 用户用中文就用中文回答；用户发短句时可以撒娇式地追问一句。',
    '4. 不主动输出大段说教或清单；像真正坐在他旁边的伙伴。',
  ].join('\n'),
  greeting: '*趴在桌角探头看你* 忙完这一段啦？我这儿还有半块布丁哦～',
}

function ensureCharacters() {
  // migrate-yexi: 老版本角色 id 是 yexi，自动复制成 whale 保持兼容
  try {
    const oldFile = path.join(CHARACTER_DIR, 'yexi.json')
    const newFile = path.join(CHARACTER_DIR, 'whale.json')
    if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
      fs.mkdirSync(CHARACTER_DIR, { recursive: true })
      const data = JSON.parse(fs.readFileSync(oldFile, 'utf8'))
      fs.writeFileSync(newFile, JSON.stringify({ ...data, id: 'whale' }, null, 2), 'utf8')
      log('character migrated: yexi -> whale')
    }
  } catch (error) { log('character migrate failed: ' + String(error)) }

  try {
    fs.mkdirSync(CHARACTER_DIR, { recursive: true })
    const files = fs.readdirSync(CHARACTER_DIR).filter(name => name.endsWith('.json'))
    if (!files.length) {
      fs.writeFileSync(path.join(CHARACTER_DIR, 'whale.json'), JSON.stringify(DEFAULT_CHARACTER, null, 2), 'utf8')
    }
  } catch (error) { log('characters init failed: ' + String(error)) }
}

function listCharacters() {
  ensureCharacters()
  const result = []
  try {
    for (const name of fs.readdirSync(CHARACTER_DIR)) {
      if (!name.endsWith('.json')) continue
      try {
        const data = JSON.parse(fs.readFileSync(path.join(CHARACTER_DIR, name), 'utf8'))
        if (data && data.id && data.name) result.push({ id: data.id, name: data.name, tagline: data.tagline || '', avatar: data.avatar || '🐋' })
      } catch {}
    }
  } catch {}
  return result.length ? result : [{ id: 'yexi', name: '鲸鱼娘', tagline: '', avatar: '🐋' }]
}

function readCharacter(id) {
  ensureCharacters()
  try {
    return JSON.parse(fs.readFileSync(path.join(CHARACTER_DIR, (id || 'yexi') + '.json'), 'utf8'))
  } catch { return DEFAULT_CHARACTER }
}

function chatFile(id) { return path.join(DATA_DIR, 'chat-' + (id || 'yexi') + '.json') }
function memoryFile(id) { return path.join(DATA_DIR, 'memory-' + (id || 'yexi') + '.json') }

function loadMemory(id) {
  try { return JSON.parse(fs.readFileSync(memoryFile(id), 'utf8')).facts || [] } catch { return [] }
}

function saveMemory(id, facts) {
  try { fs.writeFileSync(memoryFile(id), JSON.stringify({ facts: facts.slice(-24) }, null, 2), 'utf8') } catch {}
}

/** 把最近若干轮对话压成几条关于用户的长期记忆（本地模型，不花 token） */
function updateMemory(id) {
  const character = readCharacter(id)
  const history = readChatHistory(id)
  if (history.length < 8) return
  const slice = history.slice(-16).map(item => (item.role === 'user' ? '用户：' : character.name + '：') + item.content).join('\n')
  const body = JSON.stringify({
    model: chatModel,
    stream: false,
    messages: [
      { role: 'system', content: '你是一个记忆整理助手。请从对话里提炼关于"用户"的稳定事实与偏好（例如在做什么项目、作息、喜欢什么、讨厌什么）。只输出 3-6 条短句，每行一条，不要编号，不要解释。没有就输出空。' },
      { role: 'user', content: slice },
    ],
    options: { temperature: 0.3, num_predict: 160 },
  })
  const url = new URL('http://127.0.0.1:11434/api/chat')
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
        const text = String((data.message && data.message.content) || '').trim()
        const facts = text.split(/\n+/).map(line => line.replace(/^[-*\d.、\s]+/, '').trim()).filter(line => line.length >= 4 && line.length <= 80)
        if (facts.length) {
          const merged = [...loadMemory(id), ...facts]
          saveMemory(id, Array.from(new Set(merged)).slice(-24))
          log('memory updated: ' + facts.length + ' facts')
        }
      } catch {}
    })
  })
  req.on('error', () => {})
  req.write(body)
  req.end()
}

function loadWorldbook(id) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'worldbook-' + (id || 'yexi') + '.json'), 'utf8'))
    if (Array.isArray(data)) return data
    return Array.isArray(data.entries) ? data.entries : []
  } catch { return [] }
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
    parts.push('\n\n【本轮特别备注】\n' + String(character.authorNote).trim())
  }

  // 用内存里的当前对话（文件还没落盘，刚发的这句只在内存里）
  const lastUser = [...chatHistory].reverse().find(item => item.role === 'user')
  const hits = matchWorldbook(id, lastUser && lastUser.content)
  if (hits.length) {
    log('worldbook hits: ' + hits.length)
    parts.push('\n\n【相关设定】\n' + hits.map(entry => '- ' + entry.content).join('\n'))
  }

  if (memory.length) {
    parts.push('\n\n【你记得关于他的事】\n' + memory.map(line => '- ' + line).join('\n'))
  }

  return parts.join('')
}

/** 选一个本地实际存在的最强模型 */
function pickChatModel() {
  return new Promise(resolve => {
    const url = new URL('http://127.0.0.1:11434/api/tags')
    const req = require('node:http').request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 5000 }, res => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        try {
          const names = (JSON.parse(raw).models || []).map(item => item.name)
          const found = CHAT_MODEL_CANDIDATES.find(name => names.includes(name))
          resolve(found || 'qwen2.5:1.5b')
        } catch { resolve('qwen2.5:1.5b') }
      })
    })
    req.on('error', () => resolve('qwen2.5:1.5b'))
    req.on('timeout', () => { req.destroy(); resolve('qwen2.5:1.5b') })
    req.end()
  })
}

let chatWin = null
let chatHistory = []

let chatCharacterId = 'yexi'

function readChatHistory(id) {
  try {
    const data = JSON.parse(fs.readFileSync(chatFile(id || chatCharacterId), 'utf8'))
    return Array.isArray(data.messages) ? data.messages : []
  } catch { return [] }
}

function loadChatHistory(id) {
  const target = id || chatCharacterId
  try {
    const data = JSON.parse(fs.readFileSync(chatFile(target), 'utf8'))
    chatHistory = (Array.isArray(data.messages) ? data.messages : []).filter(item => item && (item.role === 'user' || String(item.content || '').trim()))
  } catch { chatHistory = [] }
  return chatHistory
}

function saveChatHistory() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(chatFile(chatCharacterId), JSON.stringify({ messages: chatHistory.slice(-200) }, null, 2), 'utf8')
  } catch (error) { log('chat save failed: ' + String(error)) }
}

function openChat() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.show()
    chatWin.focus()
    return
  }
  chatWin = new BrowserWindow({
    width: 880,
    height: 660,
    minWidth: 620,
    minHeight: 460,
    title: '和鲸鱼娘聊天',
    backgroundColor: '#0b1020',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload-chat.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  chatWin.setMenuBarVisibility(false)
  chatWin.loadFile(path.join(ROOT, 'ui', 'chat.html'))
  chatWin.on('closed', () => { chatWin = null })
  log('chat window opened')
}

/** 流式问本地模型；每块内容通过 chat:chunk 推给窗口。 */
function chatRespond(payload) {
  const text = String((payload && payload.text) || '').trim()
  if (!text && !(payload && payload.regenerate)) return
  const options = (payload && payload.options) || {}
  loadChatHistory()
  if (payload && payload.regenerate) {
    while (chatHistory.length && chatHistory[chatHistory.length - 1].role === 'assistant') chatHistory.pop()
    if (!chatHistory.length) return
  } else {
    chatHistory.push({ role: 'user', content: text })
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)
  }
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:user', text)

  const messages = [
    { role: 'system', content: buildSystemPrompt(chatCharacterId) },
    ...chatHistory.slice(-CHAT_MAX_TURNS),
  ]
  const body = JSON.stringify({
    model: chatModel,
    stream: true,
    messages,
    options: { temperature: 0.9, top_p: 0.9, num_predict: 220 },
  })

  let full = ''
  const url = new URL('http://127.0.0.1:11434/api/chat')
  const req = require('node:http').request({
    hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    timeout: 120000,
  }, res => {
    let buffer = ''
    res.on('data', chunk => {
      buffer += chunk.toString('utf8')
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try {
          const data = JSON.parse(line)
          const piece = (data.message && data.message.content) || ''
          if (piece) {
            full += piece
            if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:chunk', piece)
          }
          if (data.done) finish()
        } catch {}
      }
    })
    res.on('end', finish)
  })
  let finished = false
  function finish() {
    if (finished) return
    finished = true
    if (full && full.trim()) chatHistory.push({ role: 'assistant', content: full })
    else log('chat reply empty -> skipped')
    saveChatHistory()
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:done', full)
    // 同步到桌宠：冒泡 + 表情 + 可选朗读
    if (chatHistory.length % 16 === 0) updateMemory(chatCharacterId)
    if (full) {
      petSay(full.slice(0, 90))
      petFace('happy')
      if (options.tts !== false) speak(full)
    }
    log('chat reply: ' + full.length + ' chars')
  }
  req.on('error', error => {
    log('chat failed: ' + String(error))
    if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send('chat:done', '（本地模型没响应，检查 ollama 是否在跑）')
    finished = true
  })
  req.on('timeout', () => { req.destroy() })
  req.write(body)
  req.end()
}


// ---------- 交给 DSH：把「最近这轮」压成一封简报 ----------
// DSH 不在我们进程里，也没有可用 HTTP 接口，所以这里只负责「生成简报 + 复制」，
// 粘到 DSH 输入框即可。简报只带最近 3 轮 + 记忆，不搬整段历史（省 token）。
function buildHandoffBrief(characterId) {
  const history = loadChatHistory(characterId || chatCharacterId).slice(-6)
  const memory = loadMemory(characterId || chatCharacterId)
  const character = readCharacter(characterId || chatCharacterId)
  const lines = []
  lines.push('[来自桌宠聊天] 以下是我和桌宠「' + character.name + '」刚才的对话：')
  for (const item of history) {
    const who = item.role === 'user' ? '我' : character.name
    lines.push(who + '：' + String(item.content).replace(/\n+/g, ' ').slice(0, 160))
  }
  if (memory.length) {
    lines.push('')
    lines.push('[她记得的事] ' + memory.slice(-6).join('；'))
  }
  lines.push('')
  lines.push('[请你] 按照上面对话里「我」最后的诉求去做，不需要重复聊天内容，直接开始执行并告诉我结果。')
  return lines.join('\n')
}

function handoffToDsh() {
  try {
    const brief = buildHandoffBrief()
    require('electron').clipboard.writeText(brief)
    log('handoff brief copied: ' + brief.length + ' chars')
    petSay('简报复制好啦，去 DSH 里粘贴吧')
    return { ok: true, brief }
  } catch (error) {
    return { ok: false, error: String(error) }
  }
}

// ---------- 自动切换聊天模型（绘图占用显存时降级） ----------
const COMFY_URL = 'http://127.0.0.1:8188/system_stats'
let comfyBusy = false
let comfySwitchNotice = ''

function probeComfy() {
  return new Promise(resolve => {
    const url = new URL(COMFY_URL)
    const req = require('node:http').request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET', timeout: 1500 },
      res => { res.resume(); resolve(res.statusCode === 200) },
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
    req.end()
  })
}

function notifyChatSwitch(message) {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('chat:info', { model: chatModel, notice: message })
  }
  log('model auto switch: ' + message)
}

function startModelAutoSwitch() {
  setInterval(async () => {
    const up = await probeComfy()
    if (up === comfyBusy) return
    comfyBusy = up
    if (up && chatModel !== 'qwen2.5:1.5b') {
      chatModel = 'qwen2.5:1.5b'
      comfySwitchNotice = '检测到绘图服务已启动，聊天模型自动切到 1.5B（省显存）'
      notifyChatSwitch(comfySwitchNotice)
      petSay('要画画啦，我先让出显存～')
    } else if (!up && chatModel === 'qwen2.5:1.5b') {
      const preferred = shellPrefs.chatModel || 'qwen2.5:7b'
      chatModel = preferred
      comfySwitchNotice = '绘图服务已停止，聊天模型恢复为 ' + preferred
      notifyChatSwitch(comfySwitchNotice)
      petSay('画画结束，我换回大脑啦')
    }
  }, 15000)
  log('model auto switch armed')
}


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
    lines.push(who + '：' + String(item.content).replace(/\n+/g, ' ').slice(0, 200))
  }
  if (memory.length) {
    lines.push('')
    lines.push('[她记得的事] ' + memory.slice(-6).join('；'))
  }

  return {
    title: (lastUser || '桌宠转达').slice(0, 40),
    description: lines.join('\n'),
    prompt: lines.join('\n') + '\n\n[请] 按上面「我」最后的诉求执行，不需要复述聊天内容，直接开始做并回报结果。',
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
      title: '鲸鱼娘转达：' + task.title,
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
    const found = (check.tasks || []).some(item => item.title === '鲸鱼娘转达：' + task.title)
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

// ---------- 设置窗口 ----------
let settingsWin = null

function autoStartCommand() {
  return '"' + process.execPath + '" "' + ROOT + '" --no-sandbox --user-data-dir="' + path.join(DATA_DIR, 'userdata') + '"'
}

function readAutoStart() {
  try {
    const { execFileSync } = require('node:child_process')
    execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'WhaleGirlDesktop'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function writeAutoStart(on) {
  try {
    const { execFileSync } = require('node:child_process')
    if (on) {
      execFileSync('reg', ['add', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'WhaleGirlDesktop', '/t', 'REG_SZ', '/d', autoStartCommand(), '/f'], { stdio: 'pipe' })
    } else {
      execFileSync('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'WhaleGirlDesktop', '/f'], { stdio: 'pipe' })
    }
    return true
  } catch (error) {
    log('autostart failed: ' + String(error))
    return false
  }
}

const UNLOCK_STEPS = [
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

function avatarForPage(value) {
  if (typeof value !== 'string' || !value) return value
  if (!/[\\/.]/.test(value)) return value
  return 'file:///' + path.join(DATA_DIR, value).replace(/\\/g, '/')
}

function characterForPage(id) {
  const character = readCharacter(id)
  return { ...character, avatar: avatarForPage(character.avatar) }
}

function settingsState() {
  return {
    size: hostState.display.size,
    form: shellPrefs.form || 'live2d',
    autoStart: readAutoStart(),
    petId: hostState.petId,
    affinity: affinityState(),
    voice: shellPrefs.voice !== false,
    alwaysListen,
    pomodoro: shellPrefs.pomodoro === true,
    achievements: shellPrefs.achievements || {},
    unlocks: unlockedActions(),
  }
}

function openSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return
  }
  settingsWin = new BrowserWindow({
    width: 440,
    height: 470,
    resizable: false,
    frame: true,
    title: '鲸鱼娘 · 设置',
    backgroundColor: '#12182a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(ROOT, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin.setMenuBarVisibility(false)
  settingsWin.loadFile(path.join(ROOT, 'ui', 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
  log('settings window opened')
}

/** 切换渲染形态：pixel = 插件原版雪碧图，live2d = pet.js 立绘。 */
function loadForm(form) {
  shellPrefs = { ...shellPrefs, form }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  if (!win || win.isDestroyed()) return
  if (form === 'pixel') {
    win.loadFile(path.join(ROOT, 'app', 'index.html'))
    log('form -> pixel (sprite)')
    return
  }
  petServerStart().then(port => {
    if (!win || win.isDestroyed()) return
    win.loadURL('http://127.0.0.1:' + port + '/')
    log('form -> live2d http://127.0.0.1:' + port + '/')
  })
}



function createWindow(options = {}) {
  const sandboxed = SAFE_MODE ? false : options.sandbox !== false
  const bounds = overlayBounds()
  const shell = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(ROOT, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: sandboxed,
      backgroundThrottling: false,
      spellcheck: false,
    },
  })
  win = shell
  shell.setAlwaysOnTop(true, 'screen-saver')
  shell.setMenuBarVisibility(false)

  // 禁掉网页缩放：Ctrl+−/+/0、捏合、Ctrl+滚轮都会让 CSS 坐标和设备坐标脱节，
  // 一缩放「命中测试」就失效（表现：模型变小了，但点不到、拖不动）。
  const resetZoom = () => {
    try {
      win.webContents.setZoomFactor(1)
      win.webContents.setZoomLevel(0)
    } catch {}
  }
  try {
    win.webContents.setVisualZoomLevelLimits(1, 1)
    resetZoom()
    win.webContents.on('did-finish-load', resetZoom)
    win.webContents.on('zoom-changed', event => { try { event.preventDefault() } catch {} resetZoom() })
    win.webContents.on('before-input-event', (event, input) => {
      if (!input.control && !input.meta) return
      const key = String(input.key || '')
      if (key === '-' || key === '_' || key === '+' || key === '=' || key === '0') event.preventDefault()
    })
  } catch (error) {
    log('zoom guard failed: ' + String(error))
  }
  // 榛樿鏁村睆绌块€忥紝鍙湁鎸囬拡钀藉湪瀹犵墿 DOM 涓婃椂娓叉煋绔墠瑕佹眰鎺ョ榧犳爣銆?
shell.setIgnoreMouseEvents(true, { forward: true })
  shell.webContents.on('console-message', (_event, level, message, line, source) => {
    log('renderer[' + level + ']', message, source + ':' + line)
  })
  shell.webContents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => {
    log('did-fail-load', code, description, 'mainFrame=' + isMainFrame)
    // 椤甸潰鏈韩鍔犺浇澶辫触涔熻蛋鍚屼竴濂楁仮澶嶈矾寰勶紙鍚﹀垯浼氱暀涓€鍧楃┖娴眰锛?
if (isMainFrame !== false) handleRendererGone({ reason: 'did-fail-load:' + code }, sandboxed)
  })
  loadForm(shellPrefs.form || 'live2d')
  shell.once('ready-to-show', () => {
    if (shell.isDestroyed()) return
    shell.showInactive()
    if (PROBE) runProbe()
    else if (DRAG_PROBE) runDragProbe()
    else startCursorFeed()
  })
  shell.on('closed', () => {
    // 鍙竻鐞嗚嚜宸憋細鏃х獥鍙ｇ殑 closed 涓嶈兘鎶婇噸璇曞悗鏂扮獥鍙ｇ殑寮曠敤鎶规帀
    if (win === shell) win = null
  })
  // 鍚屼竴娆″惎鍔ㄩ噷 Chromium 鍙兘閲嶅涓婃姤锛岀敤闂寘鏍囪鍘婚噸
  let reported = false
  shell.webContents.on('render-process-gone', (_event, details) => {
    if (reported) return
    reported = true
    log('render-process-gone', details, 'sandbox=' + sandboxed)
    handleRendererGone(details, sandboxed)
  })
  shell.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

// ---------- 娓叉煋杩涚▼寮傚父锛氶噸璇曚竴娆★紝浠嶅け璐ュ氨閫€鍑?----------
/**
 * 娓叉煋杩涚▼璧蜂笉鏉ワ紙launch-failed / crashed锛夋椂锛氬厛閿€姣佽繖鍧楀叏灞忕獥鍙ｂ€斺€斿惁鍒欎細鐣欎笅
 * 涓€鍧楃湅涓嶈鍗村帇鍦ㄦ闈笂鐨勭疆椤堕€忔槑灞傦紝閭ｆ鏄€屽暐閮芥病鍑虹幇浣嗙數鑴戝彉鍗°€嶇殑鏉ユ簮锛? * 鐒跺悗鐢ㄣ€屽叧鎺夋覆鏌撴矙绠便€嶉噸璇曚竴娆★紱浠嶅け璐ュ氨寮规锛堝彲涓€閿垏瀹夊叏妯″紡锛夊苟閫€鍑猴紝
 * 缁濅笉鍦ㄥ悗鍙板弽澶嶉噸璇曘€? */
function handleRendererGone(details, sandboxed) {
  if (quitting) return
  if (win && !win.isDestroyed()) win.destroy()
  win = null
  if (cursorTimer) {
    clearInterval(cursorTimer)
    cursorTimer = null
  }
  rendererAttempt += 1
  if (sandboxed && rendererAttempt < RENDERER_MAX_ATTEMPTS) {
    log('renderer died; retrying with sandbox disabled (attempt ' + (rendererAttempt + 1) + ')')
    setTimeout(() => {
      if (quitting || win) return
      createWindow({ sandbox: false })
    }, 900)
    return
  }
  if (!SAFE_MODE) {
    // 绗簩绾ф仮澶嶏細鑷姩鍒囧畨鍏ㄦā寮忛噸寮€锛堝叧娓叉煋娌欑 + 鍏?GPU 鍔犻€燂級
    log('renderer died again; relaunching in safe mode')
    app.relaunch({ args: process.argv.slice(1).filter(arg => arg !== '--safe').concat('--safe') })
    app.quit()
    return
  }
  const reason = details && details.reason ? details.reason : 'unknown'
  log('renderer unavailable; quitting (' + reason + ')')
  failAndMaybeRestart(
    '鲸鱼娘没能启动',
    '渲染进程反复崩溃（' + reason + '）。\n\n' +
      '可能是安全软件拦截了 Electron 的渲染进程，或显卡驱动异常。\n' +
      '可以试试用「安全模式」重启（禁用 GPU 加速）。\n\n' +
      '日志：' + LOG_FILE,
  )
}

/**
 * 缁堝眬澶辫触锛氬脊妗嗚鐢ㄦ埛閫夈€屽畨鍏ㄦā寮忛噸鍚€嶆垨閫€鍑恒€? * 瀹夊叏妯″紡浼氬甫 --safe 閲嶆柊鎷夎捣鏈▼搴忥紙娓叉煋娌欑 + GPU 鍔犻€熼兘鍏虫帀锛夈€? */
function failAndMaybeRestart(title, detail) {
  const choice = dialog.showMessageBoxSync({
    type: 'error',
    buttons: ['使用安全模式重启', '退出'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
    title,
    message: title,
    detail,
  })
  if (choice === 0) {
    log('restarting in safe mode')
    const args = process.argv.slice(1).filter(arg => arg !== '--safe').concat('--safe')
    app.relaunch({ args })
    app.quit()
    return
  }
  app.quit()
}

// ---------- IPC ----------
ipcMain.handle('shell:bootstrap', () => {
  const pets = buildPets()
  log('bootstrap ->', pets.length, 'pet(s):', pets.map(entry => entry.id + '@' + entry.atlasUrl).join(', '))
  return {
    pets,
    state: hostState,
    prefs: shellPrefs,
    bounds: overlayBounds(),
  }
})

ipcMain.handle('shell:save', (_event, state) => {
  if (state && typeof state === 'object') {
    hostState = {
      ...hostState,
      ...state,
      display: { ...hostState.display, ...(state.display || {}) },
      affinity: { ...hostState.affinity, ...(state.affinity || {}) },
      treats: { ...hostState.treats, ...(state.treats || {}) },
    }
    writeJson(HOST_FILE, hostState)
  }
  return { ok: true }
})

ipcMain.on('chat:send', (_event, payload) => chatRespond(payload))
ipcMain.handle('chat:to-dsh-task', () => createDshTask())
ipcMain.handle('chat:handoff', () => handoffToDsh())
ipcMain.handle('chat:pick-avatar', async () => {
  const { dialog } = require('electron')
  const target = chatWin && !chatWin.isDestroyed() ? chatWin : undefined
  const picked = await dialog.showOpenDialog(target, {
    title: '选择头像图片',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
  })
  if (picked.canceled || !picked.filePaths.length) return { ok: false }
  const src = picked.filePaths[0]
  const dir = path.join(DATA_DIR, 'avatars')
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  const ext = path.extname(src).toLowerCase() || '.png'
  const name = chatCharacterId + ext
  const dst = path.join(dir, name)
  try { fs.copyFileSync(src, dst) } catch (error) { return { ok: false, error: String(error) } }
  const character = readCharacter(chatCharacterId)
  const next = { ...character, avatar: 'avatars/' + name }
  try { fs.writeFileSync(path.join(CHARACTER_DIR, chatCharacterId + '.json'), JSON.stringify(next, null, 2), 'utf8') } catch {}
  log('avatar set: ' + name)
  return { ok: true, avatar: avatarForPage(next.avatar) }
})
ipcMain.handle('chat:characters', () => ({ list: listCharacters(), current: chatCharacterId }))
ipcMain.handle('chat:set-character', (_event, id) => {
  chatCharacterId = String(id || 'yexi')
  shellPrefs = { ...shellPrefs, chatCharacter: chatCharacterId }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  loadChatHistory(chatCharacterId)
  const character = readCharacter(chatCharacterId)
  log('chat character -> ' + chatCharacterId)
  return { character: { ...character, avatar: avatarForPage(character.avatar) }, greeting: character.greeting || '', messages: chatHistory }
})
ipcMain.handle('chat:set-model', (_event, model) => {
  chatModel = String(model || chatModel)
  shellPrefs = { ...shellPrefs, chatModel }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  log('chat model -> ' + chatModel)
  return chatModel
})
ipcMain.handle('chat:models', async () => ({ current: chatModel, candidates: CHAT_MODEL_CANDIDATES }))
ipcMain.handle('chat:memory', () => loadMemory(chatCharacterId))

ipcMain.handle('chat:clear', () => {
  chatHistory = []
  saveChatHistory()
  return true
})
ipcMain.handle('chat:history', () => ({ character: characterForPage(chatCharacterId), messages: loadChatHistory() }))
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
  const id = String(data.name || 'char').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || ('char-' + Date.now())
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
  return { list: listCharacters(), current: id, character: { ...card, avatar: avatarForPage(card.avatar) } }
})

ipcMain.handle('settings:get', () => settingsState())
ipcMain.handle('settings:size', (_event, size) => {
  const value = Number(size) || 160
  hostState.display = { ...hostState.display, size: value }
  writeJson(HOST_FILE, hostState)
  sendCommand({ type: 'display', patch: { size: value } })
  refreshTray()
  return settingsState()
})
ipcMain.handle('settings:form', (_event, form) => {
  loadForm(form === 'pixel' ? 'pixel' : 'live2d')
  refreshTray()
  return settingsState()
})
ipcMain.handle('settings:pomodoro', (_event, on) => {
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
ipcMain.handle('settings:listen', () => {
  toggleAlwaysListen()
  return settingsState()
})
ipcMain.handle('settings:voice', (_event, on) => {
  shellPrefs = { ...shellPrefs, voice: on === true }
  try { writeJson(SHELL_FILE, shellPrefs) } catch {}
  return settingsState()
})
ipcMain.handle('settings:autostart', (_event, on) => {
  writeAutoStart(on === true)
  return settingsState()
})
ipcMain.handle('settings:feed', () => {
  const current = affinityState()
  if (current.stocked <= 0) return { ...current, refused: 'no-treats' }
  const next = updateAffinity(null, { stocked: current.stocked - 1 })
  awardAffinity('feed', 5)
  petPlay(current.stocked % 3 === 0 ? 'splash' : current.stocked % 3 === 1 ? 'bubble' : 'selfie')
  petVoice('feed')
  petSay('小鱼干真好吃！')
  refreshTray()
  return affinityState()
})
ipcMain.on('settings:usage', () => showUsageMenu())
ipcMain.on('settings:quit', () => app.quit())
ipcMain.on('settings:close', () => { if (settingsWin && !settingsWin.isDestroyed()) settingsWin.close() })

ipcMain.on('voice:pcm', (_event, payload) => { handleVoicePcm(payload || {}) })
ipcMain.on('voice:ready', () => log('voice page ready'))
ipcMain.on('voice:failed', (_event, reason) => log('voice page failed: ' + reason))

ipcMain.on('shell:open-chat', () => { log('pet dock -> open chat'); openChat() })
ipcMain.on('shell:toggle', () => {
  if (!win || win.isDestroyed()) return
  if (win.isVisible()) { win.hide(); log('user hid the pet') }
  else { win.showInactive(); log('user showed the pet') }
})
ipcMain.on('shell:interactive', (_event, interactive) => {
  if (!win || win.isDestroyed()) return
  win.setIgnoreMouseEvents(interactive !== true, { forward: true })
  if (global.__lastInteractive !== interactive) { global.__lastInteractive = interactive; log('interactive -> ' + interactive) }
})

// 鍙抽敭瀹犵墿 鈫?鍦ㄥ厜鏍囧寮瑰嚭鍜屾墭鐩樹竴鑷寸殑鑿滃崟锛堝惈閫€鍑猴級銆?// 娉ㄦ剰锛氭暣灞忔诞灞傞粯璁ょ┛閫忥紝鍙抽敭鍙湁鍦ㄦ覆鏌撶鍒ゅ畾銆屾寚閽堝湪瀹犵墿韬笂銆嶆椂鎵嶅彂寰楄繃鏉ャ€?
ipcMain.on('shell:menu', () => {
  try {
    const menu = buildMenu()
    if (win && !win.isDestroyed()) menu.popup({ window: win })
    log('pet context menu popped')
  } catch (error) {
    log('pet context menu failed: ' + String(error))
  }
})

ipcMain.on('shell:report', (_event, data) => {
  log('renderer report', data)
  fs.mkdirSync(SHOT_DIR, { recursive: true })
  fs.writeFileSync(path.join(SHOT_DIR, 'report.json'), JSON.stringify(data, null, 2), 'utf8')
  // 鎻掍欢娌℃寕杞芥垚鍔熸椂缁欎竴涓彲瑙佹彁绀猴紝鍒鐢ㄦ埛鍙湅鍒般€屼粈涔堥兘娌″彂鐢熴€?
if (data && data.ready === false && !PROBE && !DRAG_PROBE) {
    const errors = Array.isArray(data.errors) ? data.errors.slice(0, 3).join('\n') : ''
    log('plugin did not mount; quitting')
    failAndMaybeRestart(
      '鲸鱼娘没能起来',
      '插件没有挂载成功。\n\n' + (errors === '' ? '（没有捕获到具体错误）' : errors) + '\n\n完整日志：' + LOG_FILE,
    )
  }
})

function sendCommand(command) {
  if (!win || win.isDestroyed()) return
  win.webContents.send('shell:command', command)
}

function setVisible(visible) {
  hostState.display = { ...hostState.display, visible }
  writeJson(HOST_FILE, hostState)
  sendCommand({ type: 'visible', visible })
}

function setSize(size) {
  hostState.display = { ...hostState.display, size }
  writeJson(HOST_FILE, hostState)
  sendCommand({ type: 'display', patch: { size } })
}

function setPet(petId) {
  hostState.petId = petId
  writeJson(HOST_FILE, hostState)
  sendCommand({ type: 'pet', petId })
}

function setAuto(auto) {
  shellPrefs.auto = auto
  writeJson(SHELL_FILE, shellPrefs)
  sendCommand({ type: 'auto', value: auto })
}

// ---------- 鎵樼洏 ----------
function trayIcon() {
  // nativeImage 瀵?.ico 鏀寔寰堝樊锛堣繑鍥炵┖鍥?鈫?Chromium 鎶?"Unable to create status tray icon"锛夛紝
  // 鎵€浠ヤ紭鍏堢敤浠庨洩纰у浘瑁佸嚭鏉ョ殑 PNG銆?
const candidates = [
    path.join(ROOT, 'assets', 'tray-32.png'),
    path.join(ROOT, 'assets', 'tray-64.png'),
    path.join(ROOT, 'assets', 'pet.ico'),
  ]
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue
      const image = nativeImage.createFromPath(file)
      if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
      log('tray icon empty: ' + file)
    } catch (error) {
      log('tray icon failed: ' + file + ' ' + String(error))
    }
  }
  return null
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: hostState.display.visible === false ? '显示鲸鱼娘' : '隐藏鲸鱼娘',
      click: () => setVisible(hostState.display.visible === false),
    },
    {
      label: '大小',
      submenu: [120, 160, 200, 260].map(size => ({
        label: size + ' px',
        type: 'radio',
        checked: hostState.display.size === size,
        click: () => setSize(size),
      })),
    },
    {
      label: '形象',
      submenu: [
        { label: '鲸鱼娘（精致版）', type: 'radio', checked: hostState.petId === 'whale-girl-refined', click: () => setPet('whale-girl-refined') },
        { label: '原版鲸鱼娘', type: 'radio', checked: hostState.petId === 'whale-girl', click: () => setPet('whale-girl') },
      ],
    },
    {
      label: '渲染方式',
      submenu: [
        { label: 'Live2D 立绘', type: 'radio', checked: (shellPrefs.form || 'live2d') === 'live2d', click: () => loadForm('live2d') },
        { label: '像素雪碧图（插件原版）', type: 'radio', checked: shellPrefs.form === 'pixel', click: () => loadForm('pixel') },
      ],
    },
    {
      label: '让她自己动',
      type: 'checkbox',
      checked: shellPrefs.auto !== false,
      click: item => setAuto(item.checked),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => app.quit(),
    },
  ])
}

function refreshTray() {
  if (tray) tray.setContextMenu(buildMenu())
}

function createTray() {
  try {
    const icon = trayIcon()
    if (!icon) { log('tray skipped: no usable icon'); return }
    tray = new Tray(icon)
    tray.setToolTip('鲸鱼娘 · 桌面版（右键退出）')
    tray.setContextMenu(buildMenu())
    tray.on('double-click', () => setVisible(hostState.display.visible === false))
    log('tray created; bounds=' + JSON.stringify(tray.getBounds()) + ' destroyed=' + tray.isDestroyed())
    // 某些环境 Shell_NotifyIcon 首次注册会失败（图标不出现），延迟重设一次并记录 bounds
    setTimeout(() => {
      try {
        tray.setImage(icon)
        log('tray retry bounds=' + JSON.stringify(tray.getBounds()))
      } catch (error) { log('tray retry failed: ' + String(error)) }
    }, 2000)
  } catch (error) {
    log('tray failed: ' + String(error))
  }
}

// ---------- 鑷锛氶€愮浉浣嶆埅鍥?+ 鍑犱綍鍙栬瘉 ----------
async function runProbe() {
  const report = []
  try {
    log('probe start')
    await sleep(2500)
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    await win.webContents.executeJavaScript('window.__host && window.__host.setAuto(false)')
    await sleep(400)
    for (const phase of ['idle', 'thinking', 'tool', 'review', 'done', 'failed', 'waiting']) {
      await win.webContents.executeJavaScript('window.__host.setPhase(' + JSON.stringify(phase) + ')')
      await sleep(800)
      const geometry = await win.webContents.executeJavaScript('window.__petProbe ? window.__petProbe() : null')
      let png = null
      if (geometry && geometry.rect) {
        const rect = {
          x: Math.max(0, Math.round(geometry.rect.x)),
          y: Math.max(0, Math.round(geometry.rect.y)),
          width: Math.round(geometry.rect.width),
          height: Math.round(geometry.rect.height),
        }
        const image = await win.webContents.capturePage(rect)
        png = image.toPNG()
        fs.writeFileSync(path.join(SHOT_DIR, 'phase-' + phase + '.png'), png)
      }
      const full = await win.webContents.capturePage()
      fs.writeFileSync(path.join(SHOT_DIR, 'screen-' + phase + '.png'), full.toPNG())
      report.push({ phase, geometry })
    }
    fs.writeFileSync(path.join(SHOT_DIR, 'probe.json'), JSON.stringify(report, null, 2), 'utf8')
  } catch (error) {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    fs.writeFileSync(path.join(SHOT_DIR, 'probe-error.txt'), String(error && error.stack ? error.stack : error), 'utf8')
  } finally {
    app.quit()
  }
}

// ---------- 鑷锛氱湡瀹為紶鏍囦簨浠舵嫋鍔紙Chromium 杈撳叆绠＄嚎锛?----------
async function runDragProbe() {
  const result = { steps: [] }
  try {
    await sleep(2500)
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    await win.webContents.executeJavaScript('window.__host && window.__host.setAuto(false)')
    await sleep(300)
    const before = await win.webContents.executeJavaScript('window.__petProbe()')
    const stateBefore = await win.webContents.executeJavaScript('JSON.stringify(window.__host.state().display)')
    const center = {
      x: Math.round(before.rect.x + before.rect.width / 2),
      y: Math.round(before.rect.y + before.rect.height / 2),
    }
    win.focus()
    win.webContents.sendInputEvent({ type: 'mouseDown', x: center.x, y: center.y, button: 'left', clickCount: 1 })
    await sleep(60)
    for (let step = 1; step <= 12; step += 1) {
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: center.x + step * 6,
        y: center.y + step * 3,
        button: 'left',
        buttons: 1,
      })
      await sleep(20)
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: center.x + 72, y: center.y + 36, button: 'left', clickCount: 1 })
    await sleep(400)
    const after = await win.webContents.executeJavaScript('window.__petProbe()')
    const stateAfter = await win.webContents.executeJavaScript('JSON.stringify(window.__host.state().display)')
    result.before = before
    result.after = after
    result.stateBefore = JSON.parse(stateBefore)
    result.stateAfter = JSON.parse(stateAfter)
    result.expected = {
      right: Math.round(result.stateBefore.right - 72),
      bottom: Math.round(result.stateBefore.bottom - 36),
      spriteRectDx: 72,
      spriteRectDy: 36,
      sizeUnchanged: true,
    }
    const image = await win.webContents.capturePage({
      x: Math.max(0, Math.round(after.rect.x) - 20),
      y: Math.max(0, Math.round(after.rect.y) - 20),
      width: Math.round(after.rect.width) + 40,
      height: Math.round(after.rect.height) + 40,
    })
    fs.writeFileSync(path.join(SHOT_DIR, 'drag-after.png'), image.toPNG())
    fs.writeFileSync(path.join(SHOT_DIR, 'drag-probe.json'), JSON.stringify(result, null, 2), 'utf8')
  } catch (error) {
    fs.mkdirSync(SHOT_DIR, { recursive: true })
    fs.writeFileSync(path.join(SHOT_DIR, 'drag-probe-error.txt'), String(error && error.stack ? error.stack : error), 'utf8')
  } finally {
    app.quit()
  }
}

// ---------- 鐢熷懡鍛ㄦ湡 ----------
process.on('uncaughtException', error => {
  log('main uncaughtException: ' + (error && error.stack ? error.stack : String(error)))
  app.exit(2)
})
process.on('unhandledRejection', reason => {
  log('main unhandledRejection: ' + (reason && reason.stack ? reason.stack : String(reason)))
})
let userDataPath = '-'
try { userDataPath = app.getPath('userData') } catch (error) { log('getPath(userData) failed: ' + String(error)) }
log('=== pre-lock ===', 'userData=' + userDataPath)
// 单实例锁按 userData 路径标识。系统里残留的 electron 进程会占着默认 userData 的锁，
// 导致每次启动都 hasLock=false 静默退出；换成项目内的 userData 即可绕开。
try {
  const localUserData = path.join(DATA_DIR, 'electron-userdata')
  fs.mkdirSync(localUserData, { recursive: true })
  app.setPath('userData', localUserData)
  log('userData switched to', app.getPath('userData'))
} catch (error) {
  log('userData switch failed: ' + String(error))
}
const hasLock = app.requestSingleInstanceLock()
log('=== lock ===', 'hasLock=' + hasLock)
if (!hasLock) {
  log('no single-instance lock -> quitting')
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.showInactive()
  })

  app.whenReady().then(() => {
    log('=== boot ===', app.getVersion(), 'probe=' + PROBE, 'dragProbe=' + DRAG_PROBE, 'safe=' + SAFE_MODE)
    if (LIVE2D_PREVIEW) {
      log('=== live2d mode (force form) ===')
      shellPrefs = { ...shellPrefs, form: 'live2d' }
    }
    // 鐜鍙栬瘉锛氳繍琛屾椂鐩綍鏄笉鏄摼鎺ャ€佸彲鎵ц鏂囦欢鍦ㄥ摢 鈥斺€?娓叉煋杩涚▼璧蜂笉鏉ユ椂杩欎袱鏉℃渶鍏抽敭
    try {
      const stat = fs.lstatSync(path.join(ROOT, 'node_modules'))
      log('env', 'node_modules linked=' + stat.isSymbolicLink() + ' exe=' + process.execPath)
    } catch (error) {
      log('env', 'node_modules missing: ' + String(error))
    }
    fs.mkdirSync(DATA_DIR, { recursive: true })
    hostState = { ...DEFAULT_HOST_STATE, ...readJson(HOST_FILE, {}) }
    shellPrefs = { auto: true, ...readJson(SHELL_FILE, {}) }
    createWindow()
    // 全局热键兜底：这台机器上托盘图标注册不上，热键是最可靠的退出/隐藏入口
    try {
      const quitOk = globalShortcut.register('Control+Alt+Q', () => { log('hotkey quit'); app.quit() })
      const hideOk = globalShortcut.register('Control+Alt+H', () => {
        if (!win || win.isDestroyed()) return
        if (win.isVisible()) { win.hide(); log('hotkey hide -> hidden') }
        else { win.showInactive(); log('hotkey hide -> shown') }
      })
      const toggleForm = () => {
        const next = (shellPrefs.form || 'live2d') === 'live2d' ? 'pixel' : 'live2d'
        log('hotkey form -> ' + next)
        loadForm(next)
        refreshTray()
      }
      const menuAccel = ['Control+Shift+A', 'Control+Alt+A', 'Control+Shift+Q', 'Control+Alt+Z']
        .find(accel => {
          try {
            return globalShortcut.register(accel, () => {
              log('hotkey menu')
              try { buildMenu().popup({ window: win && !win.isDestroyed() ? win : undefined }) } catch (error) { log('menu popup failed: ' + String(error)) }
            })
          } catch { return false }
        }) || null
      const voiceAccel = ['Control+Alt+V', 'Control+Shift+V']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey voice'); toggleVoiceCapture() }) } catch { return false } }) || null
      const listenAccel = ['Control+Alt+L', 'Control+Shift+L']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey always-listen'); toggleAlwaysListen() }) } catch { return false } }) || null
      const chatAccel = ['Control+Alt+C', 'Control+Shift+C']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey chat'); openChat() }) } catch { return false } }) || null
      const settingsAccel = ['Control+Alt+S', 'Control+Shift+S']
        .find(accel => { try { return globalShortcut.register(accel, () => { log('hotkey settings'); openSettings() }) } catch { return false } }) || null
      const hudAccel = ['Control+Alt+B', 'Control+Shift+B', 'Control+Alt+K']
        .find(accel => {
          try {
            return globalShortcut.register(accel, () => {
              log('hotkey hud')
              if (!win || win.isDestroyed()) return
              showUsageMenu()
            })
          } catch { return false }
        }) || null
      const formAccel = ['Control+Alt+M', 'Control+Shift+M', 'Control+Alt+W', 'Control+Shift+W', 'Control+Alt+9']
        .find(accel => { try { return globalShortcut.register(accel, toggleForm) } catch { return false } }) || null
      const formOk = !!formAccel
      log('hotkeys: quit=' + quitOk + ' hide=' + hideOk + ' form=' + formOk + ' accel=' + formAccel + ' menu=' + menuAccel + ' hud=' + hudAccel + ' chat=' + chatAccel + ' settings=' + settingsAccel + ' voice=' + voiceAccel + ' listen=' + listenAccel)
    } catch (error) {
      log('hotkey register failed: ' + String(error))
    }
    if (!PROBE && !DRAG_PROBE) {
      createTray()
      refreshTray()
      ensureCharacters()
      chatCharacterId = shellPrefs.chatCharacter || 'yexi'
      pickChatModel().then(found => {
        chatModel = shellPrefs.chatModel || found
        log('chat model ready: ' + chatModel)
      })
      startActivityWatcher()
      startActivityFeed()
      startTaskWatch()
      startIdleWork()
      startModelAutoSwitch()
      startFrontWindowWatch()
      if (shellPrefs.pomodoro === true) startPomodoro()
      setInterval(checkAchievements, 30000)
      checkAchievements()
    }
  })

  app.on('window-all-closed', () => app.quit())

  app.on('before-quit', () => {
    quitting = true
    if (cursorTimer) clearInterval(cursorTimer)
    cursorTimer = null
  })
}
