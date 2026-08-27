import Dexie from 'dexie'
import { classifyWithLLM } from './llm.js'

export const db = new Dexie('mind-mirror')

// v1 schema
// thoughts: 念头  { id, text, createdAt, concernId(null=未归类) }
// concerns: 心事  { id, name, status('active'|'resolved'), thresholdPrompted(bool), createdAt }
// settings: 键值对 { key, value }
db.version(1).stores({
  thoughts: '++id, createdAt, concernId',
  concerns: '++id, status, createdAt',
  settings: 'key'
})

// 向浏览器申请持久化存储,避免移动端(尤其 iOS Safari)在存储/内存紧张时
// 自动清除 IndexedDB,导致记录退出后丢失。授予后数据不会被自动回收。
export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persisted) {
      const already = await navigator.storage.persisted()
      if (already) return true
    }
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist()
      console.info('[storage] persistent:', granted)
      return granted
    }
  } catch (e) {
    console.warn('[storage] persist request failed', e)
  }
  return false
}

/* ---------- settings ---------- */

export async function getSetting(key, fallback = null) {
  const row = await db.settings.get(key)
  return row ? row.value : fallback
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value })
}

export async function getConfig() {
  return {
    apiKey: await getSetting('apiKey', ''),
    apiBase: await getSetting('apiBase', 'https://api.openai.com/v1'),
    model: await getSetting('model', 'gpt-4o-mini')
  }
}

/* ---------- concerns ---------- */

export function activeConcerns() {
  return db.concerns.where('status').equals('active').toArray()
}

export async function createConcern(name) {
  const id = await db.concerns.add({
    name: name.trim(),
    status: 'active',
    thresholdPrompted: false,
    createdAt: Date.now()
  })
  return id
}

export async function renameConcern(id, name) {
  await db.concerns.update(id, { name: name.trim() })
}

export async function resolveConcern(id) {
  await db.concerns.update(id, { status: 'resolved' })
}

export async function restoreConcern(id) {
  await db.concerns.update(id, { status: 'active' })
}

export async function markThresholdPrompted(id) {
  await db.concerns.update(id, { thresholdPrompted: true })
}

// 合并:把 fromId 的所有念头改挂到 toId,再删除 fromId
export async function mergeConcern(fromId, toId) {
  await db.transaction('rw', db.thoughts, db.concerns, async () => {
    await db.thoughts.where('concernId').equals(fromId).modify({ concernId: toId })
    await db.concerns.delete(fromId)
  })
}

/* ---------- thoughts ---------- */

// 保存念头(先落库,concernId=null),随后静默归类
export async function addThought(text) {
  const id = await db.thoughts.add({
    text: text.trim(),
    createdAt: Date.now(),
    concernId: null
  })
  // 不 await:归类在后台进行,失败也不影响保存
  classifyThought(id).catch((e) => console.warn('classify failed', e))
  return id
}

// 对单条念头执行归类
export async function classifyThought(thoughtId) {
  const thought = await db.thoughts.get(thoughtId)
  if (!thought || thought.concernId != null) return

  const config = await getConfig()
  if (!config.apiKey) throw new Error('no api key')

  const concerns = await activeConcerns()
  const result = await classifyWithLLM(thought.text, concerns, config)

  let targetId = null
  if (result.concern_id != null) {
    // 校验返回的 id 确实是当前活跃心事之一
    const match = concerns.find((c) => String(c.id) === String(result.concern_id))
    if (match) targetId = match.id
  }
  if (targetId == null && result.new_concern_name) {
    targetId = await createConcern(result.new_concern_name)
  }
  if (targetId == null) {
    // LLM 没给出有效结果,保持未归类,留待重试
    throw new Error('no valid concern from llm')
  }
  await db.thoughts.update(thoughtId, { concernId: targetId })
}

// 启动时重试所有未归类念头
export async function retryUnclassified() {
  const config = await getConfig()
  if (!config.apiKey) return
  // 注意:IndexedDB 不索引 null 键,不能用 where('concernId').equals(null),
  // 只能全表 filter。
  const pending = await db.thoughts.filter((t) => t.concernId == null).toArray()
  for (const t of pending) {
    try {
      await classifyThought(t.id)
    } catch (e) {
      // 单条失败不阻断其余
      console.warn('retry classify failed for', t.id, e)
    }
  }
}

/* ---------- 导入 / 导出 ---------- */

export async function exportData() {
  const [thoughts, concerns, settings] = await Promise.all([
    db.thoughts.toArray(),
    db.concerns.toArray(),
    db.settings.toArray()
  ])
  return { version: 1, exportedAt: Date.now(), thoughts, concerns, settings }
}

export async function importData(data) {
  if (!data || !Array.isArray(data.thoughts) || !Array.isArray(data.concerns)) {
    throw new Error('文件格式不正确')
  }
  await db.transaction('rw', db.thoughts, db.concerns, db.settings, async () => {
    await Promise.all([db.thoughts.clear(), db.concerns.clear()])
    await db.thoughts.bulkAdd(data.thoughts)
    await db.concerns.bulkAdd(data.concerns)
    if (Array.isArray(data.settings)) {
      await db.settings.bulkPut(data.settings)
    }
  })
}
