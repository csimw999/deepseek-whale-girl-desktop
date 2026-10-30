import fs from 'node:fs'

const mainPath = process.argv[2]
let raw = fs.readFileSync(mainPath, 'utf8')
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
let s = raw.replace(/\r\n/g, '\n')

if (s.includes('// MODEL_DOWNLOADER')) {
  console.log('已存在，跳过')
  process.exit(0)
}

const block = `
// MODEL_DOWNLOADER: 在程序里下载模型（避开 GitHub 单附件 2 GiB 限制）
function listOllamaModels() {
  return new Promise(resolve => {
    const req = require('node:http').request(
      { hostname: '127.0.0.1', port: 11434, path: '/api/tags', method: 'GET', timeout: 4000 },
      res => {
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          try {
            resolve((JSON.parse(raw).models || []).map(item => String(item.name || '')))
          } catch { resolve([]) }
        })
      },
    )
    req.on('error', () => resolve([]))
    req.on('timeout', () => { req.destroy(); resolve([]) })
    req.end()
  })
}

function pullOllamaModel(name, onProgress) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({ name, stream: true })
    const req = require('node:http').request(
      {
        hostname: '127.0.0.1',
        port: 11434,
        path: '/api/pull',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      res => {
        let buffer = ''
        res.on('data', chunk => {
          buffer += chunk.toString('utf8')
          let index
          while ((index = buffer.indexOf('\\n')) >= 0) {
            const line = buffer.slice(0, index).trim()
            buffer = buffer.slice(index + 1)
            if (!line) continue
            try { onProgress(JSON.parse(line)) } catch (error) {}
          }
        })
        res.on('end', () => resolve())
      },
    )
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

async function downloadChatModel(name) {
  const pretty = name
  petSay('开始下载 ' + pretty + '，我去泡个澡～')
  let lastTick = 0
  try {
    await pullOllamaModel(name, info => {
      const total = Number(info.total) || 0
      const done = Number(info.completed) || 0
      if (total > 0) {
        const percent = Math.floor((done / total) * 100)
        if (percent >= lastTick + 10) {
          lastTick = Math.floor(percent / 10) * 10
          petSay('下载 ' + pretty + '：' + lastTick + '%')
        }
      }
    })
    petFace('happy')
    petSay(pretty + ' 装好了！现在可以聊天啦')
    return { ok: true, name }
  } catch (error) {
    log('model pull failed: ' + String(error))
    petSay('下载失败了…检查一下 ollama 有没有开？')
    return { ok: false, error: String(error) }
  }
}

async function ensureChatModel(interactive) {
  const installed = await listOllamaModels()
  const hasChat = installed.some(name => CHAT_MODEL_CANDIDATES.includes(name))
  if (hasChat) return { ok: true, installed: true }

  if (!interactive) return { ok: true, installed: false }

  const choice = dialog.showMessageBoxSync({
    type: 'question',
    buttons: ['下载 1.5B（1 GB，快）', '下载 7B（4.7 GB，更像人）', '稍后再说'],
    defaultId: 0,
    cancelId: 2,
    title: '还没有聊天模型',
    message: '她是能出场的，但要聊天需要先装一个本地模型。',
    detail:
      '模型会从 ollama 官方源下载（不是从 GitHub），支持断点续传。\\n' +
      '1.5B 约 1 GB，日常够用；7B 约 4.7 GB，说话更像人。\\n\\n' +
      '如果还没装 ollama，先执行：winget install --id Ollama.Ollama',
  })

  if (choice === 2) return { ok: true, installed: false }
  const target = choice === 1 ? 'qwen2.5:7b' : 'qwen2.5:1.5b'
  return downloadChatModel(target)
}
`

s = s.replace('// ---------- 设置窗口 ----------', block + '\n// ---------- 设置窗口 ----------')

// 托盘/右键菜单加一项
s = s.replace(
  "    { label: '让她自己动', type: 'checkbox', checked: shellPrefs.auto !== false, click: toggleAuto },",
  "    { label: '让她自己动', type: 'checkbox', checked: shellPrefs.auto !== false, click: toggleAuto },\n    { label: '下载聊天模型…', click: () => ensureChatModel(true) },",
)

// 启动后检查（延迟 25 秒，避免抢启动资源）
s = s.replace(
  '  setupAutoUpdater()',
  '  setupAutoUpdater()\n  setTimeout(() => { try { ensureChatModel(true) } catch (error) { log("ensure model failed: " + String(error)) } }, 25000)',
)

// HTTP 端点，方便自动化测试
s = s.replace(
  "      if (pathname === '/dsh-pet/selftest/reload') {",
  `      if (pathname === '/dsh-pet/model' && req.method === 'POST') {
        let raw = ''
        req.on('data', chunk => { raw += chunk })
        req.on('end', async () => {
          let body = {}
          try { body = raw ? JSON.parse(raw) : {} } catch {}
          const name = String(body.name || 'qwen2.5:1.5b')
          const result = await downloadChatModel(name)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify(result))
        })
        return
      }

      if (pathname === '/dsh-pet/model' && req.method === 'GET') {
        listOllamaModels().then(names => {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ models: names }))
        })
        return
      }

      if (pathname === '/dsh-pet/selftest/reload') {`,
)

fs.writeFileSync(mainPath, s.replace(/\n/g, eol), 'utf8')
console.log('MODEL_DOWNLOADER 已加入')
