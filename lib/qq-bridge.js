'use strict'

/**
 * QQ 桥：OneBot 11 HTTP 上报 → 本地模型 → HTTP 回复
 *
 * 数据流：
 *   NapCat --POST http://127.0.0.1:<port>/--> 本模块
 *   本模块 --POST http://<apiBase>/send_private_msg--> NapCat --下发--> QQ
 *
 * 只回白名单里的私聊号 / 群（群消息还必须 @ 她）。
 */

const http = require('node:http')

function parseList(value) {
  return String(value || '')
    .split(/[,，\s]+/)
    .map(item => item.trim())
    .filter(Boolean)
}

function extractText(event) {
  const segments = Array.isArray(event.message) ? event.message : []
  const texts = []
  for (const seg of segments) {
    if (!seg || typeof seg !== 'object') continue
    if (seg.type === 'text' && seg.data && typeof seg.data.text === 'string') texts.push(seg.data.text)
  }
  if (texts.length) return texts.join('').trim()
  if (typeof event.raw_message === 'string') return event.raw_message.trim()
  return ''
}

function mentionsSelf(event) {
  const selfId = String(event.self_id || '')
  if (!selfId) return false
  const segments = Array.isArray(event.message) ? event.message : []
  return segments.some(seg => seg && seg.type === 'at' && seg.data && String(seg.data.qq) === selfId)
}

function postJson(url, body, token) {
  return new Promise((resolve, reject) => {
    let target
    try {
      target = new URL(url)
    } catch (error) {
      reject(new Error('apiBase 不是合法地址: ' + url))
      return
    }
    const payload = JSON.stringify(body)
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    if (token) headers.Authorization = 'Bearer ' + token
    const request = http.request(
      { hostname: target.hostname, port: target.port || 80, path: target.pathname, method: 'POST', headers, timeout: 8000 },
      response => {
        let raw = ''
        response.on('data', chunk => { raw += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body: raw }))
      },
    )
    request.on('error', reject)
    request.on('timeout', () => { request.destroy(); reject(new Error('请求 NapCat 超时')) })
    request.write(payload)
    request.end()
  })
}

function createBridge(options) {
  const log = options.log || (() => {})
  const onMessage = options.onMessage
  let server = null
  let listening = false
  const seen = new Set()
  let lastEventAt = 0
  let lastError = ''
  let handled = 0

  function remember(id) {
    seen.add(id)
    if (seen.size > 200) {
      const first = seen.values().next().value
      seen.delete(first)
    }
  }

  async function handleEvent(event) {
    if (!event || event.post_type !== 'message') return
    if (event.message_type !== 'private' && event.message_type !== 'group') return

    const selfId = String(event.self_id || '')
    const senderId = String((event.sender && event.sender.user_id) || event.user_id || '')
    if (selfId && senderId === selfId) return

    const messageId = String(event.message_id || '')
    if (messageId) {
      if (seen.has(messageId)) return
      remember(messageId)
    }

    const cfg = options.getConfig()
    const users = parseList(cfg.users)
    const groups = parseList(cfg.groups)

    if (event.message_type === 'private') {
      if (!users.includes(senderId)) {
        log('qq: 私聊 ' + senderId + ' 不在白名单，忽略')
        return
      }
    } else {
      const groupId = String(event.group_id || '')
      if (!groups.includes(groupId)) {
        log('qq: 群 ' + groupId + ' 不在白名单，忽略')
        return
      }
      if (!mentionsSelf(event)) return
    }

    const text = extractText(event)
    if (!text) return
    if (text.length > 300) {
      log('qq: 消息过长，忽略')
      return
    }

    handled += 1
    lastEventAt = Date.now()
    log('qq: ' + (event.message_type === 'group' ? '群' : '私聊') + ' ' + senderId + ' -> ' + text.slice(0, 40))

    let reply = ''
    try {
      reply = await onMessage(text, {
        type: event.message_type,
        userId: senderId,
        groupId: String(event.group_id || ''),
        nickname: (event.sender && event.sender.nickname) || '',
      })
    } catch (error) {
      lastError = String(error && error.message ? error.message : error)
      log('qq: 生成回复失败 ' + lastError)
      return
    }
    if (!reply) return

    const apiBase = String(cfg.apiBase || 'http://127.0.0.1:3000').replace(/\/+$/, '')
    const endpoint = event.message_type === 'group' ? '/send_group_msg' : '/send_private_msg'
    const body = event.message_type === 'group'
      ? { group_id: Number(event.group_id), message: reply }
      : { user_id: Number(senderId), message: reply }

    try {
      const result = await postJson(apiBase + endpoint, body, cfg.token)
      if (result.status >= 400) {
        lastError = 'NapCat 返回 ' + result.status
        log('qq: 回复失败 ' + result.status + ' ' + String(result.body || '').slice(0, 120))
      } else {
        lastError = ''
        log('qq: 已回复 ' + senderId)
      }
    } catch (error) {
      lastError = String(error && error.message ? error.message : error)
      log('qq: 回复失败 ' + lastError)
    }
  }

  function start() {
    if (listening) return { ok: true, already: true }
    const cfg = options.getConfig()
    const port = Number(cfg.port) || 3002
    server = http.createServer((req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405); res.end('POST only'); return
      }
      let raw = ''
      req.on('data', chunk => { raw += chunk })
      req.on('end', () => {
        res.writeHead(204)
        res.end()
        let payload = null
        try { payload = JSON.parse(raw) } catch { return }
        const events = Array.isArray(payload) ? payload : [payload]
        for (const event of events) {
          handleEvent(event).catch(error => log('qq: 处理异常 ' + String(error)))
        }
      })
    })
    server.on('error', error => {
      lastError = '监听 ' + port + ' 失败：' + String(error.message || error)
      log('qq: ' + lastError)
      listening = false
    })
    server.listen(port, '127.0.0.1', () => {
      listening = true
      log('qq: 桥已启动，监听 127.0.0.1:' + port)
    })
    return { ok: true, port }
  }

  function stop() {
    if (server) {
      try { server.close() } catch {}
      server = null
    }
    listening = false
    return { ok: true }
  }

  function status() {
    return { listening, handled, lastEventAt, lastError }
  }

  async function sendTest(userId, text) {
    const cfg = options.getConfig()
    const apiBase = String(cfg.apiBase || 'http://127.0.0.1:3000').replace(/\/+$/, '')
    const result = await postJson(apiBase + '/send_private_msg', { user_id: Number(userId), message: text }, cfg.token)
    return { ok: result.status < 400, status: result.status, body: String(result.body || '').slice(0, 200) }
  }

  return { start, stop, status, sendTest }
}

module.exports = { createBridge, parseList, extractText, mentionsSelf }
