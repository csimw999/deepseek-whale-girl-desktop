/**
 * 生成「模型一键包」：whale-girl-models-1.5b.zip
 *
 * 包含：
 *   - SenseVoice 语音识别（int8 版 228 MB）
 *   - sherpa-onnx CLI
 *   - ollama qwen2.5:1.5b 的 manifests + blobs（导入即用，不用重新下载）
 *   - 安装模型.bat（一键导入 + 检查 ollama）
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const root = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const version = pkg.version
const outName = `whale-girl-models-1.5b`
const stage = path.join(root, 'dist', outName)
const payload = path.join(stage, 'payload')

const ASR_NAME = 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17'
const CLI_NAME = 'sherpa-onnx-v1.13.8-win-x64-shared-MD-Release'
const OLLAMA_MODEL = 'qwen2.5'
const OLLAMA_TAG = '1.5b'

function rmrf(t) {
  if (fs.existsSync(t)) fs.rmSync(t, { recursive: true, force: true })
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return false
  fs.mkdirSync(dest, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.endsWith('.asar')) continue
    const s = path.join(src, e.name)
    const d = path.join(dest, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else if (e.isFile()) fs.copyFileSync(s, d)
  }
  return true
}

console.log('清理…')
rmrf(stage)
fs.mkdirSync(payload, { recursive: true })

// 1) SenseVoice（只要 int8，894 MB 的 fp32 不要）
const asrSrc = path.join(root, 'voice-models', ASR_NAME)
const asrDst = path.join(payload, 'voice-models', ASR_NAME)
fs.mkdirSync(asrDst, { recursive: true })
let asrBytes = 0
for (const name of ['model.int8.onnx', 'tokens.txt', 'LICENSE', 'README.md']) {
  const s = path.join(asrSrc, name)
  if (fs.existsSync(s)) {
    fs.copyFileSync(s, path.join(asrDst, name))
    asrBytes += fs.statSync(s).size
  }
}
console.log('  SenseVoice:', (asrBytes / 1024 / 1024).toFixed(1), 'MB')

// 2) sherpa-onnx CLI
const cliSrc = path.join(root, 'tools', 'sherpa', CLI_NAME)
const cliDst = path.join(payload, 'tools', 'sherpa', CLI_NAME)
if (copyDir(cliSrc, cliDst)) {
  let n = 0
  const walk = d => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else n += fs.statSync(p).size
    }
  }
  walk(cliDst)
  console.log('  sherpa CLI:', (n / 1024 / 1024).toFixed(1), 'MB')
} else {
  console.warn('  ⚠ 找不到 sherpa CLI，跳过')
}

// 3) ollama 模型（manifest + 它引用的 blobs）
const ollamaHome = process.env.OLLAMA_MODELS || path.join(os.homedir(), '.ollama', 'models')
const manifestRel = path.join('manifests', 'registry.ollama.ai', 'library', OLLAMA_MODEL, OLLAMA_TAG)
const manifestSrc = path.join(ollamaHome, manifestRel)
let ollamaBytes = 0
if (fs.existsSync(manifestSrc)) {
  const manifest = JSON.parse(fs.readFileSync(manifestSrc, 'utf8'))
  const manifestDst = path.join(payload, 'ollama', manifestRel)
  fs.mkdirSync(path.dirname(manifestDst), { recursive: true })
  fs.copyFileSync(manifestSrc, manifestDst)
  const blobsDst = path.join(payload, 'ollama', 'blobs')
  fs.mkdirSync(blobsDst, { recursive: true })
  const digests = new Set()
  for (const layer of manifest.layers || []) digests.add(layer.digest)
  if (manifest.config && manifest.config.digest) digests.add(manifest.config.digest)
  for (const digest of digests) {
    const file = 'sha256-' + String(digest).replace(/^sha256:/, '')
    const s = path.join(ollamaHome, 'blobs', file)
    if (fs.existsSync(s)) {
      fs.copyFileSync(s, path.join(blobsDst, file))
      ollamaBytes += fs.statSync(s).size
    } else {
      console.warn('  ⚠ 缺 blob:', file)
    }
  }
  console.log('  ollama ' + OLLAMA_MODEL + ':' + OLLAMA_TAG + ':', (ollamaBytes / 1024 / 1024).toFixed(1), 'MB')
} else {
  console.warn('  ⚠ 本机没有 ollama 的 qwen2.5:1.5b，跳过（先 ollama pull qwen2.5:1.5b）')
}

// 4) 安装脚本
const bat = `@echo off\r
chcp 65001 >nul\r
setlocal enabledelayedexpansion\r
cd /d "%~dp0"\r
echo ============================================\r
echo   鲸鱼娘 · 模型一键安装\r
echo ============================================\r
echo.\r
\r
if not exist "payload" (\r
  echo [错误] 找不到 payload 目录。请把模型包解压到「鲸鱼娘」程序目录后再运行本脚本。\r
  pause\r
  exit /b 1\r
)\r
\r
if not exist "resources\\app" (\r
  echo [错误] 当前目录不像鲸鱼娘程序目录（缺少 resources\\app）。\r
  echo        请把压缩包解压到有「鲸鱼娘.exe」的那个目录里。\r
  pause\r
  exit /b 1\r
)\r
\r
echo [1/4] 安装语音识别模型（SenseVoice）…\r
if exist "payload\\voice-models" (\r
  xcopy "payload\\voice-models" "resources\\app\\voice-models\\" /E /I /Y /Q >nul\r
  echo       完成\r
) else (\r
  echo       跳过（包里没有）\r
)\r
\r
echo [2/4] 安装语音识别程序（sherpa-onnx）…\r
if exist "payload\\tools\\sherpa" (\r
  xcopy "payload\\tools\\sherpa" "resources\\app\\tools\\sherpa\\" /E /I /Y /Q >nul\r
  echo       完成\r
) else (\r
  echo       跳过（包里没有）\r
)\r
\r
echo [3/4] 导入聊天模型（qwen2.5:1.5b）…\r
if exist "payload\\ollama" (\r
  if not exist "%USERPROFILE%\\.ollama\\models" mkdir "%USERPROFILE%\\.ollama\\models"\r
  xcopy "payload\\ollama\\manifests" "%USERPROFILE%\\.ollama\\models\\manifests\\" /E /I /Y /Q >nul\r
  xcopy "payload\\ollama\\blobs" "%USERPROFILE%\\.ollama\\models\\blobs\\" /E /I /Y /Q >nul\r
  echo       已写入 %USERPROFILE%\\.ollama\\models\r
) else (\r
  echo       跳过（包里没有，可稍后 ollama pull qwen2.5:1.5b）\r
)\r
\r
echo [4/4] 检查 ollama…\r
where ollama >nul 2>nul\r
if errorlevel 1 (\r
  echo       [提示] 没检测到 ollama。\r
  echo       请先安装：winget install --id Ollama.Ollama\r
  echo       或到 https://ollama.com/download 下载安装包。\r
  echo       装好后重新运行本脚本，或手动启动一次 ollama 让模型生效。\r
) else (\r
  echo       检测到 ollama，模型列表：\r
  ollama list\r
)\r
\r
echo.\r
echo 安装完成！双击「启动鲸鱼娘.bat」开始使用。\r
echo 如果聊天没反应，先打开一次 ollama（托盘图标）再试。\r
pause\r
`
fs.writeFileSync(path.join(stage, '安装模型.bat'), bat, 'utf8')

fs.writeFileSync(
  path.join(stage, 'README.txt'),
  `鲸鱼娘桌面版 ${version} · 模型一键包\r
\r
用法：\r
  1. 先解压程序本体（whale-girl-${version}-win32-x64.zip）\r
  2. 把这个包解压到同一个目录（和「鲸鱼娘.exe」同级）\r
  3. 双击「安装模型.bat」\r
\r
包含：\r
  - SenseVoice 语音识别（int8）：${(asrBytes / 1024 / 1024).toFixed(0)} MB\r
  - sherpa-onnx 推理程序\r
  - qwen2.5:1.5b 聊天模型（直接导入 ollama，不用重新下载）\r
\r
需要另装：\r
  - ollama（本地模型运行时）：https://ollama.com/download\r
    或 winget install --id Ollama.Ollama\r
\r
想要更像人的回复：装完后再执行 ollama pull qwen2.5:7b（4.7 GB）\r
`,
  'utf8',
)

// 体积统计
let total = 0
const walk = d => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else total += fs.statSync(p).size
  }
}
walk(stage)
console.log('模型包体积:', (total / 1024 / 1024).toFixed(1), 'MB')

console.log('压缩…')
const { spawnSync } = require('node:child_process')
const zipPath = path.join(root, 'dist', outName + '.zip')
rmrf(zipPath)
const psCommand =
  'Add-Type -AssemblyName System.IO.Compression.FileSystem; ' +
  "[System.IO.Compression.ZipFile]::CreateFromDirectory('" +
  stage +
  "', '" +
  zipPath +
  "', [System.IO.Compression.CompressionLevel]::Optimal, $false)"
const res = spawnSync('powershell', ['-NoProfile', '-Command', psCommand], { stdio: 'inherit' },
)
if (res.status === 0 && fs.existsSync(zipPath)) {
  console.log('zip:', zipPath, (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1), 'MB')
}
