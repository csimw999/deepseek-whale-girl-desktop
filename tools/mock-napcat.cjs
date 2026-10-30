// 本地假 NapCat：接收 /send_private_msg、/send_group_msg，把内容写进 data/qq-mock.log
// 仅用于自测 QQ 桥，不参与发布
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const logFile = path.join(root, 'data', 'qq-mock.log')

const server = http.createServer((req, res) => {
  let raw = ''
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', retcode: 0 }))
    if (req.method !== 'POST') return
    let body = raw
    try { body = JSON.stringify(JSON.parse(raw)) } catch {}
    const line = new Date().toISOString() + ' ' + req.url + ' ' + body
    fs.appendFileSync(logFile, line + '\n', 'utf8')
    console.log(line)
  })
})

server.listen(3000, '127.0.0.1', () => console.log('mock napcat on 127.0.0.1:3000'))
