import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

// 1) 删掉 createLive2DPreview（它没有 preload → 页面拿不到 petShell → 拖拽/穿透/菜单全失效）
const start = src.indexOf('function createLive2DPreview() {')
if (start >= 0) {
  // 函数体内没有嵌套的同名大括号层级问题：按顶层 } 结束
  let depth = 0
  let i = src.indexOf('{', start)
  let end = -1
  for (; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i + 1; break }
    }
  }
  if (end > 0) {
    // 连同前面的注释块一起删掉
    let from = start
    while (from > 0 && src[from - 1] !== '\n') from--
    src = src.slice(0, from) + src.slice(end)
    // 去掉尾部多余空行
    src = src.replace(/\n{3,}/g, '\n\n')
  }
}

// 2) --live2d 不再另开窗口，只把默认形态设为 live2d
src = src.replace(
  `    if (LIVE2D_PREVIEW) {
      log('=== live2d mode ===')
      createLive2DPreview()
      return
    }`,
  `    if (LIVE2D_PREVIEW) {
      log('=== live2d mode (force form) ===')
      shellPrefs = { ...shellPrefs, form: 'live2d' }
    }`,
)

if (src === before) { console.error('nothing changed'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('removed createLive2DPreview; --live2d now just forces form')
