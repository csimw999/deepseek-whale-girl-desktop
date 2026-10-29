const { execFile } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const root = path.join(__dirname, '..')
const base = path.join(root, 'tools', 'sherpa')
let exe = path.join(base, 'sherpa-onnx-offline.exe')
if (!fs.existsSync(exe)) {
  for (const entry of fs.readdirSync(base)) {
    const candidate = path.join(base, entry, 'bin', 'sherpa-onnx-offline.exe')
    if (fs.existsSync(candidate)) { exe = candidate; break }
  }
}
const asrDir = path.join(root, 'voice-models', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17')
console.log('exe:', exe)
execFile(exe, [
  '--sense-voice-model=' + path.join(asrDir, 'model.int8.onnx'),
  '--tokens=' + path.join(asrDir, 'tokens.txt'),
  '--sense-voice-use-itn=1',
  path.join(root, 'data', 'stt-test.wav'),
], { timeout: 30000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
  console.log('error:', error && error.message)
  console.log('stdout tail:', String(stdout).slice(-300))
  console.log('stderr tail:', String(stderr).slice(-300))
})