import Dexie from 'dexie'
import { classifyWithLLM } from './llm.js'
import { classifyLocally } from './classify.js'

export const db = new Dexie('mind-mirror')

// thoughts: 念头  { id, text, createdAt, concernId(null=未归类) }
// concerns: 心事  { id, name, category, status('active'|'resolved'), thresholdPrompted, createdAt }
// settings: 键值对 { key, value }
db.version(1).stores({
  thoughts: '++id, createdAt, concernId',
  concerns: '++id, status, createdAt',
  settings: 'key'
})

// v2:心事增加一级分类 category
db.version(2)
  .stores({
    thoughts: '++id, createdAt, concernId',
    concerns: '++id, status, category, createdAt',
    settings: 'key'
  })
  .upgrade(async (tx) => {
    // 已有心事默认归入「长期任务」——反复挂念的事通常是长期的
    await tx.table('concerns').toCollection().modify((c) => {
      if (!c.category) c.category = 'long'
    })
  })

/* ---------- 一级分类 ---------- */

export const CATEGORIES = [
  { key: 'long', label: '长期任务' },
  { key: 'short', label: '短期任务' },
  { key: 'flash', label: '瞬时灵感' }
]

export const CATEGORY_LABEL = {
  long: '长期任务',
  short: '短期任务',
  flash: '瞬时灵感'
}

export function normalizeCategory(v) {
  if (v === 'long' || v === 'short' || v === 'flash') return v
  // 容错:LLM 可能直接返回中文标签
  if (typeof v === 'string') {
    if (v.includes('长期')) return 'long'
    if (v.includes('短期')) return 'short'
    if (v.includes('瞬时') || v.includes('灵感')) return 'flash'
  }
  return 'long'
}

// 预设标签库:供 LLM 参考用词,也作为手动归类的快捷选项。
// 只是候选词汇,不会预先写进数据库,用到才创建。
export const PRESET_CONCERNS = [
  { name: '减肥', category: 'long' },
  { name: '运动', category: 'long' },
  { name: '学英语', category: 'long' },
  { name: '学专业课', category: 'long' },
  { name: '身体健康', category: 'long' },
  { name: '存钱', category: 'long' },
  { name: '转行的事', category: 'long' },
  { name: '和家人的关系', category: 'long' },
  { name: '本周作业', category: 'short' },
  { name: '待回消息', category: 'short' },
  { name: '要买的东西', category: 'short' },
  { name: '近期约会', category: 'short' },
  { name: '写作灵感', category: 'flash' },
  { name: '想做的项目', category: 'flash' },
  { name: '随手念头', category: 'flash' }
]

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

// 查询当前存储状态,用于在设置页告知用户数据是否受保护
export async function storageStatus() {
  const out = { persisted: false, supported: false, usageMB: null, quotaMB: null }
  try {
    if (navigator.storage?.persisted) {
      out.supported = true
      out.persisted = await navigator.storage.persisted()
    }
    if (navigator.storage?.estimate) {
      const est = await navigator.storage.estimate()
      if (est.usage != null) out.usageMB = (est.usage / 1048576).toFixed(1)
      if (est.quota != null) out.quotaMB = (est.quota / 1048576).toFixed(0)
    }
  } catch (e) {
    console.warn('[storage] status failed', e)
  }
  return out
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

export async function createConcern(name, category = 'long') {
  const id = await db.concerns.add({
    name: name.trim(),
    category: normalizeCategory(category),
    status: 'active',
    thresholdPrompted: false,
    createdAt: Date.now()
  })
  return id
}

export async function setConcernCategory(id, category) {
  await db.concerns.update(id, { category: normalizeCategory(category) })
}

// 手动把念头归到某个已有心事
export async function assignThought(thoughtId, concernId) {
  await db.thoughts.update(thoughtId, { concernId })
}

// 手动新建心事并把念头归进去
export async function assignThoughtToNew(thoughtId, name, category) {
  const cid = await createConcern(name, category)
  await db.thoughts.update(thoughtId, { concernId: cid })
  return cid
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

// 按名称找一个现成心事(含已了却的,避免重复新建);找到已了却的会自动恢复为活跃
async function findOrCreateConcern(name, category) {
  const all = await db.concerns.toArray()
  const hit = all.find((c) => c.name === name.trim())
  if (hit) {
    if (hit.status !== 'active') await db.concerns.update(hit.id, { status: 'active' })
    return hit.id
  }
  return createConcern(name, category)
}

// 对单条念头执行归类。
// 有 API Key 时先试 LLM,失败则退到本地规则;没有 Key 直接用本地规则。
// 本地规则保证一定能给出结果,所以念头不会停留在「待归类」。
export async function classifyThought(thoughtId) {
  const thought = await db.thoughts.get(thoughtId)
  if (!thought || thought.concernId != null) return

  const concerns = await activeConcerns()
  const config = await getConfig()

  // 1) 有 Key 就先试 LLM
  if (config.apiKey) {
    try {
      const result = await classifyWithLLM(thought.text, concerns, config)
      let targetId = null
      if (result.concern_id != null) {
        const match = concerns.find((c) => String(c.id) === String(result.concern_id))
        if (match) targetId = match.id
      }
      if (targetId == null && result.new_concern_name) {
        targetId = await findOrCreateConcern(result.new_concern_name, result.category)
      }
      if (targetId != null) {
        await db.thoughts.update(thoughtId, { concernId: targetId })
        return
      }
    } catch (e) {
      console.warn('[classify] LLM 失败,改用本地规则', e)
    }
  }

  // 2) 本地规则兜底,一定有结果
  const local = classifyLocally(thought.text, concerns)
  const targetId =
    local.concernId != null
      ? local.concernId
      : await findOrCreateConcern(local.newConcernName, local.category)
  await db.thoughts.update(thoughtId, { concernId: targetId })
}

// 启动时补归类所有未归类念头(不再要求必须有 API Key)
export async function retryUnclassified() {
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
