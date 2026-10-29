// DSH 活动联动：把 DSH 的实时会话事件转成桌宠的相位（thinking/tool/review/done/idle），
// 写进 data\activity.json，由 PetDesktop.exe 轮询消费。
//
// DSH 的会话文件是「多帧拼接的 zstd」：每次 flush 追加一个独立的 zstd frame，
// 所以不能整体解压，必须按 magic（28 B5 2F FD）逐帧解压。这里按文件偏移增量扫描，
// 只处理新追加的帧。
//
// 数据源：%APPDATA%\dsh-desktop\harness\sessions\<workspace>\<session>\session.v4.jsonl.zstd
// 事件：turn/start、step/start、tool/call、tool/result、assistant/message、step/end、turn/end
//
// 用法：node tools/activity-watch.mjs [--once]

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')))
const OUT = path.join(ROOT, 'data', 'activity.json')
const LOG = path.join(ROOT, 'data', 'activity.log')
const SESSIONS = path.join(process.env.APPDATA || '', 'dsh-desktop', 'harness', 'sessions')
const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const POLL_MS = 300
const IDLE_MS = 25000

/** 事件类型 → 相位。 */
const PHASE_OF = {
  'turn/start': 'thinking',
  'step/start': 'thinking',
  'tool/call': 'tool',
  'tool/result': 'thinking',
  'assistant/message': 'review',
  'step/end': 'review',
  'turn/end': 'done',
}

// 单实例：主进程可能被多次拉起（托盘重启、诊断脚本），这里用 pid 文件挡掉重复的监听，
// 否则两个 watcher 会互相覆盖 activity.json，相位看起来在乱跳。
const PID_FILE = path.join(ROOT, 'data', 'activity-watch.pid')
const EVENTS_FILE = path.join(ROOT, 'data', 'events.jsonl')

/** 把 DSH 事件写成 pet.js 认识的事件流（t 字段），供桌面版 SSE 转发。 */
function emitPetEvent(event) {
  try {
    fs.appendFileSync(EVENTS_FILE, JSON.stringify({ ...event, at: Date.now() }) + '\n')
  } catch {}
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter(part => part && part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text)
    .join('')
    .trim()
}
function otherInstanceAlive() {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8'))
    if (!pid || pid === process.pid) return false
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
if (otherInstanceAlive() && !process.argv.includes('--once')) {
  log('another watcher is alive, exit')
  process.exit(0)
}
try {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true })
  fs.writeFileSync(PID_FILE, String(process.pid))
  process.on('exit', () => { try { fs.unlinkSync(PID_FILE) } catch {} })
} catch {}

let currentFile = null
let offset = 0
let phase = 'idle'
let lastEventAt = 0
let pending = Buffer.alloc(0)
let lastLoggedPhase = ''

function log(message) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true })
    fs.appendFileSync(LOG, new Date().toISOString() + ' ' + message + '\n')
  } catch {}
}

function newestSession() {
  let best = null
  const walk = dir => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.jsonl.zstd')) {
        try {
          const stat = fs.statSync(full)
          if (!best || stat.mtimeMs > best.mtimeMs) best = { file: full, mtimeMs: stat.mtimeMs, size: stat.size }
        } catch {}
      }
    }
  }
  walk(SESSIONS)
  return best
}

function writeActivity() {
  const now = Date.now()
  const effective = now - lastEventAt > IDLE_MS ? 'idle' : phase
  if (effective !== lastLoggedPhase) {
    log('phase -> ' + effective)
    lastLoggedPhase = effective
  }
  try {
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, JSON.stringify({ phase: effective, at: now, raw: phase }), 'utf8')
  } catch {}
}

function handleEvent(event) {
  switch (event.type) {
    case 'turn/start':
      emitPetEvent({ t: 'turn-start', turn: event.data && event.data.turn })
      break
    case 'step/start':
      emitPetEvent({ t: 'step-start', step: event.data && event.data.step })
      break
    case 'tool/call': {
      const data = event.data || {}
      let args = null
      try { args = data.arguments ? JSON.parse(data.arguments) : null } catch {}
      emitPetEvent({ t: 'tool-call', name: data.name || 'tool', label: data.name || 'tool', args })
      break
    }
    case 'tool/result': {
      const data = event.data || {}
      emitPetEvent({ t: 'tool-result', error: !!(data.error || data.isError) })
      break
    }
    case 'assistant/message': {
      const data = event.data || {}
      const message = data.message || {}
      const text = textOf(message.content)
      const reasoning = (message.content || [])
        .filter(part => part && part.type === 'reasoning' && typeof part.text === 'string')
        .map(part => part.text)
        .join('')
      if (text) emitPetEvent({ t: 'assistant', text })
      else if (reasoning) emitPetEvent({ t: 'delta', kind: 'reasoning', text: reasoning.slice(0, 400) })
      break
    }
    case 'user/message': {
      const data = event.data || {}
      const text = textOf(data.content)
      if (text) emitPetEvent({ t: 'user', text: text.slice(0, 300) })
      break
    }
    case 'turn/end':
      emitPetEvent({ t: 'hello', status: 'idle' })
      break
  }

  const phaseName = PHASE_OF[event.type]
  if (!phaseName) return
  if (event.type === 'turn/end') {
    lastEventAt = Date.now()
    // completed → 庆祝；被中断/出错 → 失败动作（DSH 的 turn/end 里带 data.reason.kind）
    const kind = event.data && event.data.reason && event.data.reason.kind
    phase = !kind || kind === 'completed' ? 'done' : 'failed'
    return
  }
  phase = phaseName
  lastEventAt = Date.now()
}

/** 增量处理新追加的字节：按 magic 切帧，逐帧解压。 */
function consume(file) {
  let stat
  try {
    stat = fs.statSync(file)
  } catch {
    return
  }
  if (stat.size < offset) {
    // 文件被重建/截断，重新来
    offset = 0
    pending = Buffer.alloc(0)
  }
  if (stat.size === offset) return

  let chunk
  try {
    const fd = fs.openSync(file, 'r')
    const length = stat.size - offset
    chunk = Buffer.alloc(length)
    fs.readSync(fd, chunk, 0, length, offset)
    fs.closeSync(fd)
  } catch {
    return
  }
  offset = stat.size

  let buffer = pending.length > 0 ? Buffer.concat([pending, chunk]) : chunk
  let cursor = 0
  while (true) {
    const start = buffer.indexOf(MAGIC, cursor)
    if (start < 0) break
    let decoded = null
    try {
      decoded = zlib.zstdDecompressSync(buffer.subarray(start))
    } catch {
      // 帧可能还没写完：保留这部分，下次再试
      break
    }
    // 帧的压缩长度未知，用「下一个 magic」来界定；找不到就先保留
    const next = buffer.indexOf(MAGIC, start + 4)
    if (next < 0) {
      cursor = start
      break
    }
    const text = decoded.toString('utf8')
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        handleEvent(JSON.parse(line))
      } catch {}
    }
    cursor = next
  }
  pending = cursor > 0 ? buffer.subarray(cursor) : buffer
  if (pending.length > 8 * 1024 * 1024) pending = Buffer.alloc(0)
}

function tick() {
  const session = newestSession()
  if (session && session.file !== currentFile) {
    currentFile = session.file
    offset = 0
    pending = Buffer.alloc(0)
    log('watch ' + path.basename(path.dirname(session.file)))
  }
  if (currentFile) consume(currentFile)
  writeActivity()
}

log('watcher start, sessions=' + SESSIONS)
if (process.argv.includes('--once')) {
  const session = newestSession()
  if (session) {
    currentFile = session.file
    consume(currentFile)
  }
  writeActivity()
  process.exit(0)
}

tick()
setInterval(tick, POLL_MS)
