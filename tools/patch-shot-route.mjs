import fs from 'node:fs'

const mainPath = process.argv[2]
let s = fs.readFileSync(mainPath, 'utf8')
const before = s

if (!s.includes('/dsh-pet/selftest/shot')) {
  s = s.replace(
    "      if (pathname === '/dsh-pet/selftest/mail') {",
    `      if (pathname === '/dsh-pet/selftest/shot') {
        const target = String(query.get('target') || 'pet')
        const dir = path.join(__dirname, 'docs', 'shots')
        try { fs.mkdirSync(dir, { recursive: true }) } catch {}
        const pickWindow = target === 'chat' ? chatWin : target === 'settings' ? settingsWin : win
        if (!pickWindow || pickWindow.isDestroyed()) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: 'window not available', target }))
          return
        }
        pickWindow.webContents.capturePage().then(image => {
          const file = path.join(dir, target + '.png')
          fs.writeFileSync(file, image.toPNG())
          const { width, height } = image.getSize()
          log('shot saved: ' + file + ' ' + width + 'x' + height)
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ ok: true, file, width, height }))
        }).catch(error => {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ ok: false, error: String(error) }))
        })
        return
      }

      if (pathname === '/dsh-pet/selftest/mail') {`,
  )
  fs.writeFileSync(mainPath, s, 'utf8')
  console.log('shot 端点已加')
} else {
  console.log('已存在')
}

if (s === before && !s.includes('/dsh-pet/selftest/shot')) {
  console.error('未匹配插入点')
  process.exit(1)
}
