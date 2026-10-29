import fs from 'node:fs'

const p = process.argv[2]
let src = fs.readFileSync(p, 'utf8')
const before = src

// 1) 加 loadForm：按形态装载页面（像素雪碧图 / Live2D）
if (!src.includes('function loadForm')) {
  src = src.replace(
    'function createLive2DPreview() {',
    `/** 切换渲染形态：pixel = 插件原版雪碧图，live2d = pet.js 立绘。 */
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

function createLive2DPreview() {`,
  )
}

// 2) 窗口初建时按已保存的形态装载，而不是写死雪碧图
src = src.replace(
  "  shell.loadFile(path.join(ROOT, 'app', 'index.html'))",
  "  loadForm(shellPrefs.form || 'live2d')",
)

// 3) 菜单加「渲染方式」
if (!src.includes('渲染方式')) {
  src = src.replace(
    `    {
      label: '让她自己动',`,
    `    {
      label: '渲染方式',
      submenu: [
        { label: 'Live2D 立绘', type: 'radio', checked: (shellPrefs.form || 'live2d') === 'live2d', click: () => loadForm('live2d') },
        { label: '像素雪碧图（插件原版）', type: 'radio', checked: shellPrefs.form === 'pixel', click: () => loadForm('pixel') },
      ],
    },
    {
      label: '让她自己动',`,
  )
}

if (src === before) { console.error('nothing changed'); process.exit(1) }
fs.writeFileSync(p, src, 'utf8')
console.log('patched: loadForm + menu')
