/**
 * 手搓绿色版（portable）：
 *   dist/鲸鱼娘-<version>-win32-x64/
 *     ├ 鲸鱼娘.exe              （由 electron.exe 改名而来）
 *     ├ 启动鲸鱼娘.bat
 *     ├ *.dll / locales / resources ...
 *     └ resources/app/          （我们的代码与素材，明文目录，方便排查）
 *
 * 不依赖 electron-builder 的 asar / NSIS，绕开本机的路径与证书问题。
 */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const outName = `whale-girl-${version}-win32-x64`
const outDir = path.join(root, 'dist', outName)

const COPY = [
  'main.js',
  'preload.js',
  'preload-chat.js',
  'preload-settings.js',
  'preload-voice.js',
  'package.json',
  'LICENSE',
  'CREDITS.md',
  'live2d',
  'app',
  'ui',
  'voice',
  'assets',
  'pets',
  'tools/activity-watch.mjs',
]

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name.endsWith('.asar')) continue
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.name.endsWith('.asar')) continue
    if (entry.isDirectory()) copyDir(s, d)
    else if (entry.isFile()) fs.copyFileSync(s, d)
  }
}

function rmrf(target) {
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true })
}

console.log('清理旧产物…')
rmrf(outDir)
rmrf(path.join(root, 'dist', outName + '.zip'))

console.log('复制 Electron 运行时…')
const electronDist = path.join(root, 'node_modules', 'electron', 'dist')
if (!fs.existsSync(path.join(electronDist, 'electron.exe'))) {
  console.error('找不到 node_modules/electron/dist/electron.exe，先 npm install')
  process.exit(1)
}
copyDir(electronDist, outDir)

const exeSrc = path.join(outDir, 'electron.exe')
const exeDst = path.join(outDir, '鲸鱼娘.exe')
if (fs.existsSync(exeSrc)) fs.renameSync(exeSrc, exeDst)

console.log('复制应用文件…')
const appDir = path.join(outDir, 'resources', 'app')
fs.mkdirSync(appDir, { recursive: true })
for (const item of COPY) {
  const src = path.join(root, item)
  if (!fs.existsSync(src)) {
    console.warn('  跳过（不存在）:', item)
    continue
  }
  const dest = path.join(appDir, item)
  const stat = fs.statSync(src)
  if (stat.isDirectory()) copyDir(src, dest)
  else {
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(src, dest)
  }
}

// 清掉 Electron 自带的默认应用，免得体积/混淆
rmrf(path.join(outDir, 'resources', 'default_app.asar'))

console.log('写启动器…')
const bat = `@echo off\r
chcp 65001 >nul\r
cd /d "%~dp0"\r
set ELECTRON_RUN_AS_NODE=\r
start "" "%~dp0鲸鱼娘.exe" --no-sandbox\r
`
fs.writeFileSync(path.join(outDir, '启动鲸鱼娘.bat'), bat, 'utf8')

fs.writeFileSync(
  path.join(outDir, 'README.txt'),
  `鲸鱼娘桌面版 ${version}（绿色版）\r
\r
双击「启动鲸鱼娘.bat」即可运行，不需要安装 Node。\r
\r
聊天用的本地模型需要你自己准备（ollama pull qwen2.5:7b 或 1.5b）。\r
没有 ollama 时她仍然会出场，只是不能聊天。\r
\r
数据目录：%APPDATA%\\WhaleGirlDesktop\\data\r
热键：Ctrl+Shift+C 聊天 / Ctrl+Alt+V 说话 / Ctrl+Alt+B 余额 / Ctrl+Shift+S 设置\r
\r
许可：代码 MIT；Live2D 美术 CC BY-NC-SA 4.0（见 CREDITS.md），禁止商用。\r
`,
  'utf8',
)

// 体积统计
let total = 0
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p)
    else total += fs.statSync(p).size
  }
}
walk(outDir)
console.log('打包完成:', outDir)
console.log('体积:', (total / 1024 / 1024).toFixed(1), 'MB')

// 打 zip
console.log('压缩…')
try {
  const { spawnSync } = require('node:child_process')
  const zipPath = path.join(root, 'dist', outName + '.zip')
  const res = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', `Compress-Archive -Path "${outDir}" -DestinationPath "${zipPath}" -Force`],
    { stdio: 'inherit' },
  )
  if (res.status === 0) console.log('zip:', zipPath, (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1), 'MB')
} catch (error) {
  console.warn('zip 失败（可手动压缩）:', String(error))
}
