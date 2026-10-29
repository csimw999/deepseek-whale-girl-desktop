import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

if (!src.includes('startPetServer')) {
  src = src.replace(
    "const { spawn } = require('node:child_process')",
    "const { spawn } = require('node:child_process')\nconst http = require('node:http')",
  )

  const server = `
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
        res.write('data: ' + JSON.stringify({ t: 'hello', status: 'idle' }) + '\\n\\n')
        sseClients.add(res)
        req.on('close', () => sseClients.delete(res))
        return
      }

      if (pathname === '/dsh-pet/hud') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true, data: null }))
        return
      }

      if (req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ ok: true }))
        return
      }

      const rel = pathname === '/' ? 'pet.html' : pathname.replace(/^\\/dsh-pet\\/?/, '')
      const file = path.resolve(rootDir, rel)
      if (!file.startsWith(rootDir)) { res.writeHead(403); res.end('forbidden'); return }
      fs.readFile(file, (error, data) => {
        if (error) { res.writeHead(404); res.end('not found: ' + rel); return }
        const ext = path.extname(file).toLowerCase()
        const types = {
          '.html': 'text/html; charset=utf-8',
          '.js': 'text/javascript; charset=utf-8',
          '.json': 'application/json; charset=utf-8',
          '.png': 'image/png',
          '.moc3': 'application/octet-stream',
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
  const payload = 'data: ' + JSON.stringify(event) + '\\n\\n'
  for (const client of sseClients) {
    try { client.write(payload) } catch {}
  }
}

`
  src = src.replace('function createLive2DPreview() {', server + 'function createLive2DPreview() {')

  // 预览窗口改成加载本地服务
  src = src.replace(
    "  preview.loadFile(path.join(ROOT, 'live2d', 'index.html'))",
    "  petServerStart().then(port => {\n    if (preview.isDestroyed()) return\n    preview.loadURL('http://127.0.0.1:' + port + '/')\n    log('live2d preview -> http://127.0.0.1:' + port + '/')\n  })",
  )

  // 预览窗口：整屏透明浮层，让 pet.js 自己把宠物放在右下角
  src = src.replace(
    `  const preview = new BrowserWindow({
    width: 380,
    height: 460,
    frame: false,`,
    `  const bounds = overlayBounds()
  const preview = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    skipTaskbar: true,`,
  )
  src = src.replace(
    `  win = preview
  preview.webContents.on('console-message'`,
    `  win = preview
  preview.setAlwaysOnTop(true, 'screen-saver')
  preview.setIgnoreMouseEvents(false)
  preview.webContents.on('console-message'`,
  )

  // 相位 -> pet.js 事件（先做粗粒度映射，下一轮再接完整事件流）
  src = src.replace(
    `    win.webContents.send('shell:activity', phase)
    log('activity -> ' + phase)`,
    `    win.webContents.send('shell:activity', phase)
    log('activity -> ' + phase)
    if (LIVE2D_PREVIEW) {
      const map = {
        thinking: { t: 'step-start', step: 1 },
        tool: { t: 'tool-call', name: 'tool' },
        review: { t: 'delta', text: '' },
        done: { t: 'assistant', text: '' },
        failed: { t: 'tool-result', error: true },
      }
      if (phase === 'idle') petBroadcast({ t: 'hello', status: 'idle' })
      else if (map[phase]) petBroadcast(map[phase])
    }`,
  )
}

if (src === before) {
  console.error('nothing changed')
  process.exit(1)
}

fs.writeFileSync(p, src, 'utf8')
console.log('patched main.js')
