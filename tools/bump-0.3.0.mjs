import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const pkgPath = path.join(root, 'package.json')
const readmePath = path.join(root, 'README.md')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
pkg.version = '0.3.0'
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

let s = fs.readFileSync(readmePath, 'utf8')
s = s.split('0.2.3').join('0.3.0')

// 能力表补一行
s = s.replace(
  '| 角色扮演聊天 | 独立聊天窗，带历史、记忆、世界书、作者注、重答 / 编辑 / 多方案 |',
  '| 角色扮演聊天 | 独立聊天窗，带历史、记忆、世界书、作者注、重答 / 编辑 / 多方案 |\n| 记忆与导出 | 长期记忆可查看 / 删除 / 手动补；对话可导出 Markdown 或 JSON，也能导入回来 |',
)

// 更新记录加一行
s = s.replace(
  '| **v0.3.0** |',
  '| **v0.3.0（本次）** |',
)
s = s.replace(
  '| 版本 | 变化 |\n| --- | --- |',
  `| 版本 | 变化 |
| --- | --- |
| **v0.3.0** | 长期记忆可编辑（查看 / 删除 / 手动补）；对话导出 Markdown/JSON 并可导入；GitHub Actions 自动检查与发版 |`,
)

// 去掉重复的旧 v0.3.0 行（如果替换产生了两个）
const lines = s.split('\n')
const seen = new Set()
const dedup = []
for (const line of lines) {
  const m = line.match(/^\| \*?\*?v(\d+\.\d+\.\d+)/)
  if (m) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
  }
  dedup.push(line)
}
s = dedup.join('\n')

fs.writeFileSync(readmePath, s, 'utf8')
console.log('version -> 0.3.0，README 已同步')
