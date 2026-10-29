'use strict'

/**
 * WebView2 外壳：把插件页面需要的 window.petShell 桥接到宿主进程（C#），
 * 并把「在页面里挪精灵」改成「挪整个窗口」。
 *
 * Electron 版用的是 preload 暴露的 petShell；这里用 chrome.webview.postMessage。
 * 页面其余部分（插件 lib/client.js、host.js、loader.js）完全不用改。
 */
;(function () {
  const webview = window.chrome && window.chrome.webview
  if (!webview || window.petShell) return

  let seq = 0
  const pending = new Map()
  let commandHandler = null

  webview.addEventListener('message', event => {
    const message = event.data
    if (!message || typeof message !== 'object') return
    if (message.__rpc === 'reply' && pending.has(message.id)) {
      const resolve = pending.get(message.id)
      pending.delete(message.id)
      resolve(message.result)
      return
    }
    if (message.__rpc === 'command' && typeof commandHandler === 'function') {
      commandHandler(message.payload)
    }
  })

  function rpc(op, payload) {
    return new Promise(resolve => {
      const id = ++seq
      pending.set(id, resolve)
      webview.postMessage({ id, op, payload })
    })
  }

  window.petShell = {
    bootstrap: () => rpc('bootstrap'),
    save: state => rpc('save', state),
    // WebView2 的窗口没有逐像素 alpha 命中测试，穿透只能整体取舍，这里空实现
    setInteractive: () => {},
    onCommand: callback => { commandHandler = callback },
    report: data => rpc('report', data),
    menu: () => rpc('menu'),
    dragStart: () => rpc('dragStart'),
    dragEnd: () => rpc('dragEnd'),
    hide: () => rpc('hide'),
    setBounds: rects => rpc('setBounds', rects),
    quit: () => rpc('quit'),
  }
  window.__petShellKind = 'webview2'

  // ---- 把插件的页内拖动换成窗口拖动 -------------------------------------------------
  // 插件在 pointerdown 时开始拖精灵（改 right/bottom）。这里在捕获阶段拦下指针事件，
  // 改为通知宿主移动窗口；click 是独立事件，仍然交给插件处理（点一下照样摸一摸）。
  let dragging = false
  let startX = 0
  let startY = 0
  let moved = false

  function petRoot() {
    return document.querySelector('[data-dsh-pet-root]')
  }

  document.addEventListener('pointerdown', event => {
    const root = petRoot()
    if (!root || !root.contains(event.target)) return
    if (event.button !== 0) return
    event.stopPropagation()
    dragging = true
    moved = false
    startX = event.screenX
    startY = event.screenY
    window.petShell.dragStart()
  }, true)

  document.addEventListener('pointermove', event => {
    if (!dragging) return
    if (!moved && (Math.abs(event.screenX - startX) > 4 || Math.abs(event.screenY - startY) > 4)) moved = true
    event.stopPropagation()
  }, true)

  document.addEventListener('pointerup', event => {
    if (!dragging) return
    dragging = false
    event.stopPropagation()
    window.petShell.dragEnd()
  }, true)

  document.addEventListener('contextmenu', event => {
    const root = petRoot()
    if (!root || !root.contains(event.target)) return
    event.preventDefault()
    window.petShell.menu()
  }, true)

  document.addEventListener('dblclick', event => {
    const root = petRoot()
    if (!root || !root.contains(event.target)) return
    event.preventDefault()
    window.petShell.hide()
  }, true)

  // 拖过以后浏览器还会补一个 click，插件会误以为"被摸了"；这里吞掉这一次
  document.addEventListener('click', event => {
    if (!moved) return
    const root = petRoot()
    if (root && root.contains(event.target)) {
      moved = false
      event.stopPropagation()
      event.preventDefault()
    }
  }, true)

  // ---- 动态窗口区域 --------------------------------------------------------------
  // WebView2 所在窗口只能整块矩形接收点击，所以把「宠物/气泡/面板实际占的地方」报给宿主，
  // 宿主据此设置窗口 Region：不在这些矩形里的像素对鼠标等于"不存在"，点击会落到桌面。
  function visibleRects() {
    const root = petRoot()
    if (!root) return []
    const rects = []
    const selector = '[class*="sprite"],[class*="bubble"],[class*="panel"],[class*="dock"],[class*="stage"],[class*="wrap"]'
    const nodes = root.querySelectorAll(selector)
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i]
      const style = window.getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      if (Number(style.opacity) === 0) continue
      const rect = el.getBoundingClientRect()
      if (rect.width < 6 || rect.height < 6) continue
      if (rect.bottom < 0 || rect.right < 0) continue
      rects.push([rect.left, rect.top, rect.width, rect.height])
    }
    if (rects.length === 0) {
      const rect = root.getBoundingClientRect()
      rects.push([rect.left, rect.top, rect.width, rect.height])
    }
    return rects
  }

  let lastSignature = ''
  function reportBounds() {
    const rects = visibleRects()
    const signature = JSON.stringify(rects.map(r => r.map(Math.round)))
    if (signature === lastSignature) return
    lastSignature = signature
    window.petShell.setBounds(rects)
  }
  setInterval(reportBounds, 200)
  reportBounds()
})()
