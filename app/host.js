'use strict'

/**
 * 桌面版的「假 DSH 宿主」：只补插件浏览器半区请求的 /api/pet/* 端点。
 *
 * 插件通过普通 fetch 拉 /api/pet/pets（宠物定义）、/api/pet/state（状态快照）
 * 以及若干 set-* 端点。DSH 里这些端点由 dsh-pet 的 host 半区实现；桌面版没有
 * DSH 运行时，因此这里按插件源码里的数据契约（service.ts 的 PetStateView、
 * registry.ts 的 PetDefinition、affinity.ts 的 PetAffinityView）返回等价数据，
 * 台词池直接取插件 remarks.ts 的内置文案。
 */

;(function () {
  // ---------- 台词池：逐条取自插件 src/remarks.ts 的 BUILTIN_REMARKS ----------
  const REMARKS = {
    pet: [
      '咕噜咕噜～被摸摸好舒服！',
      '再摸摸这里，痒痒的～',
      '头顶温度刚刚好，安心～',
      '被摸到耳朵啦，扑通扑通！',
      '你的手掌好温暖，舍不得你走～',
      '呼噜呼噜～就靠在这里不走了！',
      '今天的摸头也收货成功！',
      '蹭蹭你的手心，这是回礼～',
      '多摸摸我，亲密度会涨哦！',
      '闭眼享受中，请勿打扰～',
      '头再低一点，够不着了～',
      '呼噜呼噜，声音都冒出来了',
      '这手感，比小鱼干还上瘾',
      '摸到第三下，满意',
      '耳朵后面，别漏了……啊，舒服',
      '被摸得尾巴都卷起来了',
    ],
    petCooldown: [
      '摸过头啦，让鲸鱼娘歇口气～',
      '羽毛都快被摸秃啦，缓一缓～',
      '呼……先让我喘口气嘛！',
      '再摸就要睡着了哦～',
      '稍微休息一下，待会儿再摸～',
      '头顶要冒烟啦，停一停！',
      '我知道你喜欢我，但也要节制呀～',
      '歇一歇，摸摸的手感会更好哦～',
      '咕……等我回个蓝～',
      '让我先消化一下刚才的爱！',
      '痒痒的，先让我缓一下……',
      '再摸就掉线了，真的',
      '库存的呼噜声用完了',
      '手歇会儿，我也要补个蓝',
      '舒服归舒服，得缓缓呀',
      '再摸下去，我就要融化了',
    ],
    feed: [
      '呜哇！小鱼干好好吃！',
      '咔嚓咔嚓，美味到尾巴打结～',
      '这条小鱼干是刚晒好的，好香！',
      '谢谢你，胃里暖暖的～',
      '囤粮 +1，今天也有好好被爱！',
      '好吃到想转圈圈～',
      '小鱼干最好吃了，再来亿条！',
      '饱餐一顿，马上满血复活～',
      '这个味道，是幸福的味道！',
      '吃完了还不忘舔舔爪子～',
      '这小鱼干，是今天的顶配',
      '一口下去，精神头全回来了',
      '脆！香！就是这个味儿',
      '边吃边摇尾巴，形象不要了',
      '好吃到眼睛都眯起来了',
      '这块鱼干我记住了，懂我的',
    ],
    feedCooldown: [
      '吃饱啦，晚点再喂～',
      '肚子圆滚滚的，装不下啦～',
      '再喂就要变成球啦！',
      '让我慢慢消化这份心意～',
      '小鱼干的香气还没散呢～',
      '呼……满足得动不了了～',
      '先散步一圈再吃下一顿！',
      '肚皮已经鼓鼓的啦～',
      '好吃是好吃，可也得节制呀～',
      '等我饿了会告诉你哦～',
      '胃说它满了，脑子说还能吃',
      '这条得留着慢慢品',
      '先消消食，待会儿再战',
      '塞不下了，真塞不下了',
      '闻着香，可惜没地方放了',
      '嗝……这顿值了',
    ],
    noTreats: [
      '没有小鱼干了，多陪我工作一会儿吧～',
      '粮仓空空，陪我完成几轮任务就会有小鱼干啦～',
      '小鱼干在路上啦，先一起加油工作！',
      '嘴巴寂寞了……快去完成一轮任务！',
      '陪我多工作一会儿，鱼干自动到账～',
      '现在喂我也只会饿着肚子说谢谢哦～',
      '粮仓见底啦，用几轮任务换一条鱼干吧～',
      '饿着肚子等你完成下一轮任务～',
      '小鱼干藏在你的工作里，去找找看！',
      '先工作后干饭，我们的约定哦～',
      '粮仓见底，全靠感情撑着了',
      '饿是真饿，活也是真得干',
      '画饼充饥……不对，画鱼干充饥',
      '没鱼干的日子，靠意志力过',
      '下一轮任务，我闻到了鱼干味',
      '先记账上，欠我两条，记住啦',
    ],
  }

  const rankCursors = { pet: 0, petCooldown: 0, feed: 0, feedCooldown: 0, noTreats: 0 }
  function pick(kind) {
    const pool = REMARKS[kind]
    const line = pool[rankCursors[kind] % pool.length]
    rankCursors[kind] += 1
    return line
  }

  // ---------- 与插件 state.ts 相同的相位到动画映射 ----------
  const PHASE_ANIMATION = {
    idle: 'idle',
    thinking: 'running',
    tool: 'running-right',
    review: 'review',
    waiting: 'waiting',
    done: 'jumping',
    failed: 'failed',
  }
  const CELEBRATE_MS = 2400
  const FAILURE_MS = 2400

  // ---------- 与插件 affinity.ts 相同的等级阶梯与冷却 ----------
  const RANKS = [
    { min: 0, name: '幼鲸', emoji: '*' },
    { min: 25, name: '伙伴', emoji: '**' },
    { min: 50, name: '挚友', emoji: '***' },
    { min: 80, name: '深海羁绊', emoji: '****' },
    { min: 200, name: '心有灵犀', emoji: '*****' },
    { min: 500, name: '传说羁绊', emoji: '******' },
    { min: 2000, name: '神话羁绊', emoji: '*******' },
    { min: 10000, name: '永恒之契', emoji: '********' },
    { min: 100000, name: '鲸生共渡', emoji: '*********' },
  ]
  const PET_COOLDOWN_MS = 10_000
  const FEED_COOLDOWN_MS = 30_000
  const PET_REWARD = 1
  const FEED_REWARD = 5

  // ---------- 宿主状态 ----------
  let pets = []
  let host = null
  let phase = 'idle'
  let doneAt = 0
  let failedAt = 0
  let auto = true
  let autoTimer = null

  const ready = new Promise(resolve => {
    window.petShell.bootstrap().then(boot => {
      pets = boot.pets || []
      host = boot.state || {}
      host.display = host.display || { visible: true, size: 160, right: 24, bottom: 120 }
      host.affinity = host.affinity || { points: 0, pets: 0, feeds: 0, turns: 0, lastPetAt: 0, lastFeedAt: 0 }
      host.treats = host.treats || { stocked: 8, cap: 20 }
      if (!pets.some(entry => entry.id === host.petId)) host.petId = pets[0] && pets[0].id
      resolve()
      // 托盘里关掉「让她自己动」后，重启也保持安静
      if (boot.prefs && boot.prefs.auto === false) stopAuto()
      else startAuto()
    }, error => {
      console.error('[pet-desktop] bootstrap 失败:', error)
      resolve()
    })
  })

  function currentDefinition() {
    return pets.find(entry => entry.id === host.petId) || pets[0]
  }

  function currentAnimation() {
    let animation = PHASE_ANIMATION[phase] || 'idle'
    if (phase === 'done' && Date.now() - doneAt >= CELEBRATE_MS) animation = 'idle'
    if (phase === 'failed' && Date.now() - failedAt >= FAILURE_MS) animation = 'idle'
    return animation
  }

  function affinityView() {
    const points = host.affinity.points
    let rank = RANKS[0]
    for (const entry of RANKS) if (points >= entry.min) rank = entry
    const now = Date.now()
    return {
      points,
      rank: rank.name,
      rankEmoji: rank.emoji,
      pets: host.affinity.pets,
      feeds: host.affinity.feeds,
      turns: host.affinity.turns,
      petCooldown: now - host.affinity.lastPetAt < PET_COOLDOWN_MS,
      feedCooldown: now - host.affinity.lastFeedAt < FEED_COOLDOWN_MS,
    }
  }

  function stateView() {
    const definition = currentDefinition()
    if (!definition) return null
    return {
      animation: currentAnimation(),
      phase,
      sessionActive: true,
      affinity: affinityView(),
      display: {
        visible: host.display.visible !== false,
        size: host.display.size,
        right: host.display.right,
        bottom: host.display.bottom,
      },
      pet: {
        id: definition.id,
        displayName: definition.displayName,
        description: definition.description || '',
      },
      name: host.name || definition.displayName,
      treats: { stocked: host.treats.stocked, cap: host.treats.cap },
    }
  }

  function persist() {
    window.petShell.save({
      petId: host.petId,
      display: host.display,
      name: host.name,
      affinity: host.affinity,
      treats: host.treats,
    })
  }

  function setPhase(next) {
    if (phase === next) return
    phase = next
    try { console.log('[pet] phase=' + next + ' anim=' + (PHASE_ANIMATION[next] || 'idle')) } catch {}
    if (next === 'done') doneAt = Date.now()
    if (next === 'failed') failedAt = Date.now()
    window.__petNotifySessions()
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async function runBout() {
    if (!auto) return
    setPhase('thinking')
    await sleep(2600 + Math.random() * 3200)
    if (!auto) return
    setPhase('tool')
    await sleep(1800 + Math.random() * 2400)
    if (!auto) return
    setPhase('review')
    await sleep(1600 + Math.random() * 1800)
    if (!auto) return
    setPhase('done')
    await sleep(CELEBRATE_MS)
    if (!auto) return
    setPhase('idle')
    scheduleBout(12000 + Math.random() * 16000)
  }

  function scheduleBout(delay) {
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = setTimeout(runBout, delay)
  }

  function startAuto() {
    auto = true
    setPhase('idle')
    scheduleBout(6000 + Math.random() * 4000)
  }

  function stopAuto() {
    auto = false
    if (autoTimer) clearTimeout(autoTimer)
    autoTimer = null
  }

  // ---------- 真实 DSH 活动接入 ----------
  // 主进程轮询 data/activity.json（由 tools/activity-watch.mjs 解析会话流事件写成），
  // 一收到真实相位就停掉上面那套假的随机活动，之后完全由 DSH 的状态驱动动作。
  window.__petSetPhase = setPhase
  if (window.petShell && typeof window.petShell.onActivity === 'function') {
    window.petShell.onActivity(next => {
      if (typeof next !== 'string') return
      if (auto) stopAuto()
      setPhase(next)
    })
  }

  // ---------- /api/pet/* 端点 ----------
  function json(data, status) {
    return new Response(JSON.stringify(data), {
      status: status === undefined ? 200 : status,
      headers: { 'content-type': 'application/json' },
    })
  }

  async function handle(url, init) {
    await ready
    const parsed = new URL(url, 'http://pet.local')
    const path = parsed.pathname
    const body = init && typeof init.body === 'string' ? safeJson(init.body) : {}

    if (path === '/api/pet/pets') return json(pets)
    if (path === '/api/pet/diagnostics') return json({ diagnostics: [] })
    if (path === '/api/pet/state') return json(stateView())

    // 插件客户端会调 /api/pet/gameplay/*（动作按钮、切换模式、打工、购买…）。
    // 这些在真宿主里由 dsh-pet 服务实现；桌面版没有，所以在这里补一个兼容层，
    // 否则按钮画得出来、点了没反应（表现为「很多动作点不动」）。
    if (path === '/api/pet/gameplay') {
      return json({
        ok: true,
        mode: 'idle',
        bars: [],
        actions: [],
        shop: [],
        wallet: { treats: host.treats.stocked, points: host.affinity.points },
      })
    }
    if (path.startsWith('/api/pet/gameplay/')) {
      const action = path.slice('/api/pet/gameplay/'.length)
      if (action === 'buy') {
        const item = body.item || body.id || null
        return json({ ok: true, accepted: false, reason: 'shop-empty', item })
      }
      if (action === 'work-tick') return json({ ok: true, gained: 0, treats: host.treats.stocked })
      if (action === 'mode') return json({ ok: true, mode: body.mode || 'idle' })
      // touch / action / 其它：给一个通用的接受响应，至少不会 404
      return json({ ok: true, accepted: true, reaction: pick('pet'), action })
    }

    if (path === '/api/pet/interact') {
      const kind = body.kind
      const now = Date.now()
      if (kind === 'pet') {
        if (now - host.affinity.lastPetAt < PET_COOLDOWN_MS) {
          return json({ reaction: pick('petCooldown'), accepted: false, reason: 'cooldown' })
        }
        host.affinity.lastPetAt = now
        host.affinity.pets += 1
        host.affinity.points += PET_REWARD
        persist()
        return json({ reaction: pick('pet'), accepted: true })
      }
      if (kind === 'feed') {
        if (host.treats.stocked <= 0) {
          return json({ reaction: pick('noTreats'), accepted: false, reason: 'no-treat' })
        }
        if (now - host.affinity.lastFeedAt < FEED_COOLDOWN_MS) {
          return json({ reaction: pick('feedCooldown'), accepted: false, reason: 'cooldown' })
        }
        host.treats.stocked -= 1
        host.affinity.lastFeedAt = now
        host.affinity.feeds += 1
        host.affinity.points += FEED_REWARD
        persist()
        return json({ reaction: pick('feed'), accepted: true })
      }
      return json({ reaction: pick('pet'), accepted: false }, 200)
    }

    if (path === '/api/pet/set-config') {
      if (typeof body.size === 'number') host.display.size = Math.max(32, Math.min(512, body.size))
      if (typeof body.right === 'number') host.display.right = Math.max(0, body.right)
      if (typeof body.bottom === 'number') host.display.bottom = Math.max(0, body.bottom)
      if (typeof body.visible === 'boolean') host.display.visible = body.visible
      persist()
      return json({ ok: true })
    }
    if (path === '/api/pet/set-visible') {
      if (typeof body.visible === 'boolean') host.display.visible = body.visible
      persist()
      return json({ ok: true })
    }
    if (path === '/api/pet/set-name') {
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 24) : ''
      if (name !== '') host.name = name
      persist()
      return json({ ok: true })
    }
    if (path === '/api/pet/set-pet') {
      if (pets.some(entry => entry.id === body.petId)) {
        host.petId = body.petId
        persist()
      }
      return json({ ok: true })
    }
    if (path.startsWith('/api/pet/gameplay/')) return json({ ok: true })

    return json({ error: 'not-found' }, 404)
  }

  function safeJson(text) {
    try {
      return JSON.parse(text)
    } catch {
      return {}
    }
  }

  // 拦截插件对 /api/pet/* 的 fetch；其它地址（如每日心跳）返回 404，避免联网。
  const nativeFetch = window.fetch.bind(window)
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input && input.url ? input.url : ''
    if (url.startsWith('/api/pet/')) return handle(url, init)
    if (url.startsWith('http://pet.local/api/pet/')) return handle(url, init)
    return Promise.resolve(new Response('{}', { status: 404 }))
  }

  // 桌面控制（托盘、自检）用的宿主接口
  window.__host = {
    ready,
    state() {
      return host
    },
    view() {
      return stateView()
    },
    definition() {
      return currentDefinition()
    },
    setPhase(next) {
      setPhase(next)
    },
    setAuto(value) {
      if (value) startAuto()
      else {
        stopAuto()
        setPhase('idle')
      }
    },
    setPet(petId) {
      if (pets.some(entry => entry.id === petId)) {
        host.petId = petId
        persist()
        window.__petNotifySessions()
      }
    },
    setDisplay(patch) {
      Object.assign(host.display, patch)
      persist()
      window.__petNotifySessions()
    },
    setVisible(visible) {
      host.display.visible = visible
      persist()
      window.__petNotifySessions()
    },
    notify() {
      window.__petNotifySessions()
    },
    fetchNative: nativeFetch,
  }
})()
