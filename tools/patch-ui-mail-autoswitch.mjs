import fs from 'node:fs'

const petHtmlPath = process.argv[2]
const chatPath = process.argv[3]
const mainPath = process.argv[4]

// ---------------- 1) 桌宠：把「信封」挪到左下方，别挡对话框 ----------------
let pet = fs.readFileSync(petHtmlPath, 'utf8')
if (!pet.includes('dshp-mail')) {
  pet = pet.replace(
    '</head>',
    `  <style>
    /* 桌面版调整：工作简报「信封」移到舞台左下角，避免压住头顶的对话框 */
    .dshp-mail {
      left: 2px !important;
      right: auto !important;
      bottom: 10px !important;
      transform: none !important;
      width: 28px !important;
      height: 23px !important;
      opacity: .92;
    }
    .dshp-mail:hover { transform: translateY(-2px) !important; opacity: 1; }
    .dshp-mail svg { width: 26px; height: 21px; }
  </style>
</head>`,
  )
  fs.writeFileSync(petHtmlPath, pet, 'utf8')
  console.log('pet.html: 信封移到左下角')
}

// ---------------- 2) 聊天窗：左侧栏滚动条 + 分割线 ----------------
let chat = fs.readFileSync(chatPath, 'utf8')
const beforeChat = chat

chat = chat.replace(
  `  aside {
    width: 236px; flex: none; display: flex; flex-direction: column; gap: 12px;
    background: linear-gradient(180deg, #0f1728, #0b1220);
    border-right: 1px solid var(--line); padding: 20px 16px; overflow-y: auto;
  }`,
  `  aside {
    width: 236px; flex: none; display: flex; flex-direction: column; gap: 12px;
    background: linear-gradient(180deg, #0f1728, #0b1220);
    padding: 20px 16px 20px; overflow-y: auto; overflow-x: hidden;
    scrollbar-width: thin; scrollbar-color: #232c46 transparent;
    box-shadow: inset -1px 0 0 rgba(126,152,255,.07), 12px 0 28px rgba(3,7,18,.35);
  }
  aside::-webkit-scrollbar { width: 8px; }
  aside::-webkit-scrollbar-track { background: transparent; }
  aside::-webkit-scrollbar-thumb {
    background: #232c46; border-radius: 999px;
    border: 2px solid transparent; background-clip: padding-box;
  }
  aside::-webkit-scrollbar-thumb:hover { background: #33415f; background-clip: padding-box; }`,
)

if (chat === beforeChat) console.error('chat.html 未变（aside 选择器可能已改）')
else { fs.writeFileSync(chatPath, chat, 'utf8'); console.log('chat.html: 侧栏滚动条') }

// ---------------- 3) main：ComfyUI 在跑就自动切 1.5B ----------------
let m = fs.readFileSync(mainPath, 'utf8')
const beforeMain = m

if (!m.includes('function startModelAutoSwitch')) {
  m = m.replace(
    '// ---------- 设置窗口 ----------',
    `// ---------- 自动切换聊天模型（绘图占用显存时降级） ----------
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

// ---------- 设置窗口 ----------`,
  )
  m = m.replace(
    "      startIdleWork()",
    "      startIdleWork()\n      startModelAutoSwitch()",
  )
}

if (m === beforeMain) { console.error('main.js 未变'); process.exit(1) }
fs.writeFileSync(mainPath, m, 'utf8')
console.log('main.js: 模型自动切换')
