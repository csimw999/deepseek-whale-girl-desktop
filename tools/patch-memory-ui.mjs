import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2]
const chatPath = path.join(root, 'ui', 'chat.html')
let html = fs.readFileSync(chatPath, 'utf8')
const before = html

const anchor = "  el('worldBtn').onclick = async () => {"
if (!html.includes(anchor)) {
  console.error('找不到 worldBtn 锚点')
  process.exit(1)
}

const block = [
  '  // ---- 长期记忆管理 ----',
  '  function renderMemory(list) {',
  "    const box = el('memoryList')",
  '    box.innerHTML = \'\'',
  '    if (!list.length) {',
  "      box.innerHTML = '<div class=\"note\" style=\"margin-bottom:8px\">还没有记忆。多聊几次，她会自己总结；也可以在下面手动加。</div>'",
  '      return',
  '    }',
  '    list.forEach((text, index) => {',
  "      const row = document.createElement('div')",
  "      row.style.cssText = 'display:flex;gap:8px;align-items:flex-start;padding:8px 10px;border-radius:10px;background:#141c31;margin-bottom:6px'",
  "      const span = document.createElement('div')",
  "      span.style.cssText = 'flex:1;color:#cfe0ff;font-size:13px;line-height:1.5'",
  '      span.textContent = text',
  "      const del = document.createElement('button')",
  "      del.className = 'btn ghost'",
  "      del.style.cssText = 'padding:2px 8px;font-size:12px'",
  "      del.textContent = '删'",
  '      del.onclick = async () => {',
  '        const result = await api.memoryRemove(index)',
  '        if (result && result.ok) {',
  '          renderMemory(result.list || [])',
  "          el('memChip').textContent = '记忆 ' + (result.list || []).length",
  '        }',
  '      }',
  '      row.append(span, del)',
  '      box.append(row)',
  '    })',
  '  }',
  '',
  "  el('memChip').onclick = async () => {",
  "    el('memoryModal').classList.add('on')",
  '    const list = await api.memoryList()',
  '    renderMemory(list || [])',
  '  }',
  "  el('memoryClose').onclick = () => el('memoryModal').classList.remove('on')",
  "  el('memoryAdd').onclick = async () => {",
  "    const input = el('memoryInput')",
  '    const text = (input.value || \'\').trim()',
  '    if (!text) return',
  '    const result = await api.memoryAdd(text)',
  '    if (result && result.ok) {',
  "      input.value = ''",
  '      renderMemory(result.list || [])',
  "      el('memChip').textContent = '记忆 ' + (result.list || []).length",
  '    }',
  '  }',
  '',
  '  // ---- 导出 / 导入对话 ----',
  "  el('exportBtn').onclick = async () => {",
  '    const result = await api.exportChat()',
  '    if (result && result.ok) {',
  "      el('noticeBar').textContent = '已导出：' + result.file",
  "      el('noticeBar').classList.add('on')",
  '      setTimeout(() => el(\'noticeBar\').classList.remove(\'on\'), 3200)',
  '    } else if (result && result.reason === \'empty\') {',
  "      el('noticeBar').textContent = '还没有对话可以导出'",
  "      el('noticeBar').classList.add('on')",
  '      setTimeout(() => el(\'noticeBar\').classList.remove(\'on\'), 2200)',
  '    }',
  '  }',
  "  el('importBtn').onclick = async () => {",
  '    const result = await api.importChat()',
  '    if (result && result.ok) {',
  "      el('noticeBar').textContent = '已导入 ' + result.count + ' 条，正在刷新…'",
  "      el('noticeBar').classList.add('on')",
  '      setTimeout(() => location.reload(), 900)',
  '    } else if (result && result.reason === \'bad-format\') {',
  "      el('noticeBar').textContent = '这个 JSON 里没有可用的 messages'",
  "      el('noticeBar').classList.add('on')",
  '      setTimeout(() => el(\'noticeBar\').classList.remove(\'on\'), 2600)',
  '    }',
  '  }',
  '',
  anchor,
]

html = html.replace(anchor, block.join('\n'))
if (html === before) {
  console.error('替换失败')
  process.exit(1)
}
fs.writeFileSync(chatPath, html, 'utf8')
console.log('chat.html 交互逻辑已加（' + block.length + ' 行）')
