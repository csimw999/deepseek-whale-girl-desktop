'use strict'

/**
 * 桌面浮层的命中测试：整块窗口是透明的，默认让鼠标穿透；
 * 只有当指针真的落在插件渲染的宠物 DOM 上时，才把这一小块变成可交互，
 * 其余区域继续穿透到下面的窗口。拖动期间保持可交互，避免丢失指针捕获。
 */

;(function () {
  const root = () => document.querySelector('[data-dsh-pet-root]')
  let interactive = false
  let dragging = false
  let last = { x: -1, y: -1 }

  function overPet(x, y) {
    const node = root()
    if (!node) return false
    const hit = document.elementFromPoint(x, y)
    if (hit && node.contains(hit)) return true
    // 3px 容差：贴边移动时不至于反复切换
    for (const offset of [[-3, 0], [3, 0], [0, -3], [0, 3]]) {
      const probe = document.elementFromPoint(x + offset[0], y + offset[1])
      if (probe && node.contains(probe)) return true
    }
    return false
  }

  function setInteractive(next) {
    if (next === interactive) return
    interactive = next
    window.petShell.setInteractive(next)
  }

  window.addEventListener('mousemove', event => {
    last = { x: event.clientX, y: event.clientY }
    if (dragging) return
    setInteractive(overPet(event.clientX, event.clientY))
  }, true)

  // 兜底：主进程轮询系统光标（部分环境穿透时不转发 mousemove）。
  if (typeof window.petShell.onCursor === 'function') {
    window.petShell.onCursor(point => {
      if (dragging || !point) return
      last = { x: point.x, y: point.y }
      setInteractive(overPet(point.x, point.y))
    })
  }

  window.addEventListener('pointerdown', event => {
    last = { x: event.clientX, y: event.clientY }
    const node = root()
    if (node && event.target instanceof Node && node.contains(event.target)) {
      dragging = true
      setInteractive(true)
    }
  }, true)

  function releasePointer(event) {
    if (event && typeof event.clientX === 'number') last = { x: event.clientX, y: event.clientY }
    if (!dragging) return
    dragging = false
    setInteractive(overPet(last.x, last.y))
  }

  window.addEventListener('pointerup', releasePointer, true)
  window.addEventListener('pointercancel', releasePointer, true)

  // 右键宠物 → 宿主弹出菜单（显示/隐藏、大小、形象、让她自己动、退出）
  window.addEventListener('contextmenu', event => {
    const node = root()
    if (!node || !(event.target instanceof Node) || !node.contains(event.target)) return
    event.preventDefault()
    event.stopPropagation()
    if (typeof window.petShell.menu === 'function') window.petShell.menu()
  }, true)
  window.addEventListener('blur', () => {
    dragging = false
    setInteractive(false)
  })
  window.addEventListener('mouseleave', () => {
    if (dragging) return
    setInteractive(false)
  })

  // 安全网：指针没动但宠物 DOM 变了（隐藏/换形象）时，别让整屏窗口卡住桌面。
  setInterval(() => {
    if (!interactive || dragging) return
    if (!overPet(last.x, last.y)) setInteractive(false)
  }, 400)

  // 托盘命令：改大小 / 换形象 / 显示隐藏 / 开关自动活动，全部走宿主的 set-* 路径。
  window.petShell.onCommand(command => {
    if (!command || typeof command !== 'object') return
    const host = window.__host
    if (!host) return
    if (command.type === 'visible') host.setVisible(command.visible === true)
    else if (command.type === 'display') host.setDisplay(command.patch || {})
    else if (command.type === 'pet') host.setPet(command.petId)
    else if (command.type === 'auto') host.setAuto(command.value !== false)
  })

  // 失败回传：10 秒后插件还没跑起来，就把错误交给主进程落盘并退出，避免留下空浮层。
  setTimeout(() => {
    if (window.__petReady === true) return
    window.petShell.report({
      stage: 'plugin-mount',
      ready: false,
      errors: window.__petErrors || [],
      hasRoot: document.querySelector('[data-dsh-pet-root]') !== null,
    })
  }, 10000)

  // 自检用：读出精灵元素的几何与当前动画，供截图取证。
  window.__petProbe = function () {
    const node = root()
    const sprite = node
      ? Array.from(node.querySelectorAll('div')).find(el => el.style && el.style.backgroundImage) || null
      : null
    const view = window.__host && window.__host.view ? window.__host.view() : null
    const rect = sprite ? sprite.getBoundingClientRect() : null
    return {
      petId: view ? view.pet.id : null,
      size: view ? view.display.size : null,
      phase: view ? view.phase : null,
      animation: view ? view.animation : null,
      window: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      element: sprite ? { width: sprite.style.width, height: sprite.style.height } : null,
      backgroundSize: sprite ? sprite.style.backgroundSize : null,
      backgroundPosition: sprite ? sprite.style.backgroundPosition : null,
      interactive: interactive,
      ready: window.__petReady === true,
    }
  }
})()
