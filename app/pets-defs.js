'use strict'

/**
 * 宠物定义构造：把 pet.json 按 dsh-pet 插件 registry.ts 的 buildTracks() 规则
 * 解析成浏览器半区可直接渲染的 PetDefinition（与 host 半区 petEntryView() 同形）。
 *
 * 该文件同时被主进程（CJS require）和 Node 自检脚本使用。
 */

const DEFAULT_CELL = { width: 192, height: 208 }
const DEFAULT_COLUMNS = 8
const DEFAULT_FRAMES = [6, 8, 8, 4, 5, 8, 6, 6, 6]

const ROW_ORDER = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
]

const DEFAULT_TRACKS = {
  idle: { durations: [500, 500, 600, 500, 500, 600], loop: true },
  'running-right': { durations: [300, 300, 300, 300, 300, 300, 300, 400], loop: true },
  'running-left': { durations: [300, 300, 300, 300, 300, 300, 300, 400], loop: true },
  waving: { durations: [450, 450, 450, 450], loop: true },
  jumping: { durations: [400, 400, 400, 450, 450], loop: false, fallback: 'idle' },
  failed: { durations: [550, 550, 550, 600, 650, 700, 550, 550], loop: false, fallback: 'idle' },
  waiting: { durations: [550, 550, 600, 550, 550, 600], loop: true },
  running: { durations: [330, 330, 330, 330, 330, 400], loop: true },
  review: { durations: [650, 650, 650, 650, 650, 650], loop: true },
}

/**
 * @param {object} manifest 解析后的 pet.json
 * @param {{ atlasUrl: string, manifestUrl?: string, fallbackId?: string }} urls
 */
function buildPetDefinition(manifest, urls) {
  const sprite = (manifest && manifest.sprite2d) || {}
  const cell = {
    width: sprite.cell && Number.isFinite(sprite.cell.width) ? sprite.cell.width : DEFAULT_CELL.width,
    height: sprite.cell && Number.isFinite(sprite.cell.height) ? sprite.cell.height : DEFAULT_CELL.height,
  }
  const columns = Number.isFinite(sprite.columns) ? sprite.columns : DEFAULT_COLUMNS
  const rows = Array.isArray(sprite.frames) && sprite.frames.length >= ROW_ORDER.length
    ? sprite.frames.map(value => (Number.isInteger(value) && value > 0 ? value : 1))
    : DEFAULT_FRAMES.slice()
  const atlasRows = Number.isFinite(sprite.atlasRows)
    ? sprite.atlasRows
    : Math.max(rows.length, ROW_ORDER.length)
  const overrides = sprite.tracks && typeof sprite.tracks === 'object' ? sprite.tracks : {}

  const tracks = {}
  ROW_ORDER.forEach((animation, row) => {
    const pattern = DEFAULT_TRACKS[animation]
    const override = overrides[animation]
    const rawDurations = override && Array.isArray(override.durations) && override.durations.length > 0
      ? override.durations.filter(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
      : pattern.durations
    const frameCount = Math.max(1, Math.min(rows[row], columns))
    const durations = rawDurations.length >= frameCount
      ? rawDurations.slice(0, frameCount)
      : Array.from({ length: frameCount }, (_, index) => rawDurations[index % rawDurations.length])
    const track = {
      frames: Array.from({ length: frameCount }, (_, index) => index),
      durations,
      loop: override && typeof override.loop === 'boolean' ? override.loop : pattern.loop,
    }
    if (pattern.fallback !== undefined) track.fallback = pattern.fallback
    tracks[animation] = track
  })

  const definition = {
    id: (manifest && manifest.id) || urls.fallbackId || 'pet',
    displayName: (manifest && manifest.displayName) || (manifest && manifest.id) || urls.fallbackId || 'pet',
    description: (manifest && manifest.description) || '',
    renderer: 'sprite2d',
    cell,
    columns,
    rows,
    atlasRows,
    tracks,
    atlasUrl: urls.atlasUrl,
  }
  if (sprite.sequences !== undefined) definition.sequences = sprite.sequences
  if (urls.manifestUrl !== undefined) definition.manifestUrl = urls.manifestUrl
  return definition
}

module.exports = { buildPetDefinition, ROW_ORDER, DEFAULT_TRACKS, DEFAULT_CELL, DEFAULT_COLUMNS }
