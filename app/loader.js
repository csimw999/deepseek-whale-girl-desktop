'use strict'

/**
 * DSH 模块加载器与插件上下文的桌面版外壳。
 *
 * 这里不实现任何宠物逻辑：只把 @linxin666/dsh-pet 浏览器半区 apply(ctx)
 * 所需的服务补齐（store 引擎 / locale / slots / settingsScope / sessions /
 * effect），让插件编译产物（app/plugin/dsh-pet-client.js，原样拷贝）自己跑起来。
 *
 * 渲染、动画、拖动、气泡、悬停面板全部由插件代码完成。
 */
;(function () {
  const cjs = window.__CJS__
  if (!cjs) throw new Error('vendor.js 未加载：缺少 window.__CJS__')

  // ------------------------------------------------------------------
  // store 引擎：对应 @deepseek-ai/dsh-client 的 createSnapshotStore / defineStore
  // ------------------------------------------------------------------
  function shallowEqual(a, b) {
    if (a === b) return true
    if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    for (const key of ka) if (a[key] !== b[key]) return false
    return true
  }

  function createSnapshotStore(initial) {
    let value = initial
    const listeners = new Set()
    return {
      getSnapshot() {
        return value
      },
      set(next) {
        if (next === value) return
        value = next
        for (const listener of Array.from(listeners)) listener()
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      },
    }
  }

  function defineStore(definition) {
    return {
      create() {
        let state = definition.init()
        let snapshot = state
        const listeners = new Set()
        const emit = () => {
          snapshot = state
          for (const listener of Array.from(listeners)) listener()
        }
        const actions = {}
        for (const name of Object.keys(definition.actions || {})) {
          const run = definition.actions[name]
          actions[name] = (...args) => {
            const draft = { ...state }
            const outcome = run(draft, ...args)
            state = outcome !== null && typeof outcome === 'object' ? outcome : draft
            emit()
            return outcome
          }
        }
        const store = {
          actions,
          getSnapshot: () => snapshot,
          subscribe(listener) {
            listeners.add(listener)
            return () => {
              listeners.delete(listener)
            }
          },
        }
        store.state = { getSnapshot: store.getSnapshot, subscribe: store.subscribe }
        return store
      },
    }
  }

  const engine = { createSnapshotStore, defineStore, shallowEqual }
  cjs.define('@deepseek-ai/dsh-client-store', function (module) {
    module.exports = engine
  })
  cjs.define('@deepseek-ai/dsh-client-runtime/client', function (module) {
    module.exports = engine
  })

  // ------------------------------------------------------------------
  // locale：命名空间字典 + {name} 占位符插值
  // ------------------------------------------------------------------
  const dictionaries = new Map()

  function translate(namespace, key, params) {
    const dict = dictionaries.get(namespace) || {}
    let text = dict[key]
    if (typeof text !== 'string') text = dict[namespace + '.' + key]
    if (typeof text !== 'string') text = key
    if (params !== undefined && params !== null) {
      for (const name of Object.keys(params)) {
        text = text.split('{' + name + '}').join(String(params[name]))
      }
    }
    return text
  }

  const locale = {
    register(namespace, dicts) {
      const dict = dicts && (dicts.zh || dicts.en)
      if (dict) dictionaries.set(namespace, dict)
      return () => dictionaries.delete(namespace)
    },
    bind(namespace) {
      return (key, params) => translate(namespace, key, params)
    },
  }

  // ------------------------------------------------------------------
  // settingsScope：插件用 enabled 开关决定是否挂载桌面宠物 UI
  // ------------------------------------------------------------------
  const settingsStore = { status: 'ready', value: { enabled: true } }
  const settingsListeners = new Set()
  const settingsScope = {
    getSnapshot() {
      return settingsStore
    },
    subscribe(listener) {
      settingsListeners.add(listener)
      return () => {
        settingsListeners.delete(listener)
      }
    },
    bind() {
      return settingsScope
    },
    setEnabled(enabled) {
      settingsStore.value = { ...settingsStore.value, enabled }
      for (const listener of Array.from(settingsListeners)) listener()
    },
  }

  // ------------------------------------------------------------------
  // slots：桌面版没有 DSH 设置界面，注册即空转；宠物本身由插件直接挂到 body
  // ------------------------------------------------------------------
  const slots = {
    inject(_name, factory) {
      try {
        const dispose = factory()
        return typeof dispose === 'function' ? dispose : () => {}
      } catch (error) {
        console.warn('[pet-desktop] slots.inject 失败:', error)
        return () => {}
      }
    },
    register() {
      return () => {}
    },
  }

  // ------------------------------------------------------------------
  // sessions：桌面版没有 DSH 会话，用一个空列表占位；notify() 可触发插件重新拉取状态
  // ------------------------------------------------------------------
  const sessionView = { current: undefined, byId: {} }
  const sessionListeners = new Set()
  const sessions = {
    list: {
      getSnapshot() {
        return sessionView
      },
      subscribe(listener) {
        sessionListeners.add(listener)
        return () => {
          sessionListeners.delete(listener)
        }
      },
    },
    open() {},
  }
  window.__petNotifySessions = () => {
    for (const listener of Array.from(sessionListeners)) {
      try {
        listener()
      } catch (error) {
        console.warn('[pet-desktop] session listener 失败:', error)
      }
    }
  }

  // ------------------------------------------------------------------
  // effect：插件用它登记清理函数
  // ------------------------------------------------------------------
  const disposers = []
  function effect(fn, label) {
    try {
      const dispose = fn()
      if (typeof dispose === 'function') disposers.push(dispose)
    } catch (error) {
      console.warn('[pet-desktop] effect 失败 (' + String(label) + '):', error)
    }
    return () => {}
  }

  const ctx = {
    effect,
    locale,
    slots,
    sessions,
    settingsScope,
    connection: {},
    remote: {},
    get() {
      return undefined
    },
  }

  // ------------------------------------------------------------------
  // 运行插件：factory(require) 得到 { apply, inject }，再喂给它 ctx
  // ------------------------------------------------------------------
  window.__petContext = ctx
  window.__petPlugin = null
  for (const deferred of window.__DEFERRED__) {
    try {
      const api = deferred.factory(cjs.require)
      window.__petPlugin = api
      if (typeof api.apply === 'function') api.apply(ctx)
      else console.warn('[pet-desktop] 插件模块没有 apply:', deferred.id)
    } catch (error) {
      console.error('[pet-desktop] 插件 apply 抛错:', error)
    }
  }
  window.__petReady = true
})()
