import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  resolveConcern,
  restoreConcern,
  renameConcern,
  mergeConcern,
  markThresholdPrompted,
  setConcernCategory,
  assignThought,
  assignThoughtToNew,
  classifyThought,
  CATEGORIES,
  CATEGORY_LABEL,
  PRESET_CONCERNS
} from './db.js'
import { rangeStart, startOfToday, formatTime, dotString } from './utils.js'
import { useLongPress } from './useLongPress.js'
import Sheet from './Sheet.jsx'

const SCALES = [
  { key: '7', label: '7天' },
  { key: '30', label: '30天' },
  { key: 'all', label: '全部' }
]

// 频次榜单行。点名字进详情,点右侧 ⋯ 出操作菜单(长按同样可出菜单)。
function ConcernRow({ concern, count, flame, onOpen, onMenu }) {
  const handlers = useLongPress(
    () => onMenu(concern),
    () => onOpen(concern.id)
  )
  return (
    <div className={`rank-row ${flame ? 'flame' : ''}`}>
      <div className="rank-main" {...handlers}>
        <div className="rank-name">
          {flame && <span className="flame-icon">⚡</span>}
          {concern.name}
        </div>
        <div className="rank-meta">
          <span className="rank-dots">{dotString(count)}</span>
          <span className="rank-num">{count}</span>
        </div>
      </div>
      <button
        className="rank-menu"
        aria-label="操作"
        onClick={(e) => {
          e.stopPropagation()
          onMenu(concern)
        }}
      >
        ⋯
      </button>
    </div>
  )
}

export default function ReviewPage({ onOpenConcern, onOpenSettings }) {
  const [scale, setScale] = useState('7')
  const [sheet, setSheet] = useState(null)
  const [promptId, setPromptId] = useState(null)
  const [showResolved, setShowResolved] = useState(false)
  const decided = useRef(false)

  const concerns = useLiveQuery(() => db.concerns.toArray(), [], undefined)
  const thoughts = useLiveQuery(() => db.thoughts.toArray(), [], undefined)

  const ready = concerns !== undefined && thoughts !== undefined

  // 每条心事的全部念头数(全时段),用于阈值追问
  const allTimeCount = useMemo(() => {
    const m = new Map()
    if (thoughts)
      for (const t of thoughts) {
        if (t.concernId != null) m.set(t.concernId, (m.get(t.concernId) || 0) + 1)
      }
    return m
  }, [thoughts])

  // 阈值追问:每次进入回顾页,最多挑 1 条(全时段次数≥5 且从未提醒过的活跃心事,取次数最高者)
  useEffect(() => {
    if (!ready || decided.current) return
    decided.current = true
    const candidates = concerns
      .filter(
        (c) => c.status === 'active' && !c.thresholdPrompted && (allTimeCount.get(c.id) || 0) >= 5
      )
      .sort((a, b) => (allTimeCount.get(b.id) || 0) - (allTimeCount.get(a.id) || 0))
    setPromptId(candidates.length ? candidates[0].id : null)
  }, [ready, concerns, allTimeCount])

  if (!ready) return <div className="review-page" />

  const concernById = new Map(concerns.map((c) => [c.id, c]))
  const start = rangeStart(scale)
  const todayStart = startOfToday()

  // 频次榜:活跃心事在时间段内的念头数,倒序
  const rankCount = new Map()
  for (const t of thoughts) {
    if (t.concernId == null || t.createdAt < start) continue
    const c = concernById.get(t.concernId)
    if (!c || c.status !== 'active') continue
    rankCount.set(t.concernId, (rankCount.get(t.concernId) || 0) + 1)
  }
  const ranked = [...rankCount.entries()]
    .map(([id, count]) => ({ concern: concernById.get(id), count }))
    .sort((a, b) => b.count - a.count)

  // ⚡:榜内 count≥5,最多 2 个(次数最高优先)
  const flameIds = new Set(ranked.filter((r) => r.count >= 5).slice(0, 2).map((r) => r.concern.id))

  // 按一级分类分组,组内保持次数倒序
  const grouped = CATEGORIES.map((cat) => ({
    ...cat,
    items: ranked.filter((r) => (r.concern.category || 'long') === cat.key)
  })).filter((g) => g.items.length > 0)

  // 今日流水(倒序)+ 每条在其心事内的序号(第N次,按全时段计)
  const ordinal = new Map()
  {
    const byConcern = new Map()
    for (const t of thoughts) {
      if (t.concernId == null) continue
      if (!byConcern.has(t.concernId)) byConcern.set(t.concernId, [])
      byConcern.get(t.concernId).push(t)
    }
    for (const arr of byConcern.values()) {
      arr.sort((a, b) => a.createdAt - b.createdAt)
      arr.forEach((t, i) => ordinal.set(t.id, i + 1))
    }
  }
  const todayThoughts = thoughts
    .filter((t) => t.createdAt >= todayStart)
    .sort((a, b) => b.createdAt - a.createdAt)

  const resolvedList = concerns.filter((c) => c.status === 'resolved')
  const promptConcern = promptId != null ? concernById.get(promptId) : null

  /* ---------- 交互 ---------- */

  function openConcernMenu(concern) {
    setSheet({
      type: 'actions',
      title: `${concern.name} · ${CATEGORY_LABEL[concern.category || 'long']}`,
      actions: [
        { label: '放下(标记已了却)', danger: true, onClick: () => resolveConcern(concern.id) },
        { label: '改名', onClick: () => openRename(concern) },
        { label: '改分类', onClick: () => openChangeCategory(concern) },
        { label: '合并到其他心事', onClick: () => openMerge(concern) }
      ]
    })
  }
  function openRename(concern) {
    setSheet({
      type: 'input',
      title: '改名',
      initial: concern.name,
      confirmLabel: '保存',
      onConfirm: (name) => renameConcern(concern.id, name)
    })
  }
  function openChangeCategory(concern) {
    setSheet({
      type: 'select',
      title: `「${concern.name}」归入`,
      options: CATEGORIES.map((c) => ({ label: c.label, value: c.key })),
      onSelect: (key) => setConcernCategory(concern.id, key)
    })
  }
  function openMerge(concern) {
    const others = concerns.filter((c) => c.status === 'active' && c.id !== concern.id)
    setSheet({
      type: 'select',
      title: `把「${concern.name}」合并到`,
      emptyText: '没有其他活跃心事',
      options: others.map((c) => ({ label: c.name, value: c.id })),
      onSelect: (toId) => mergeConcern(concern.id, toId)
    })
  }
  function openResolvedMenu(concern) {
    setSheet({
      type: 'actions',
      title: concern.name,
      actions: [{ label: '恢复为活跃', onClick: () => restoreConcern(concern.id) }]
    })
  }

  // 待归类念头:点一下手动归类
  function openAssign(thought) {
    const actives = concerns.filter((c) => c.status === 'active')
    const usedNames = new Set(actives.map((c) => c.name))
    const presets = PRESET_CONCERNS.filter((p) => !usedNames.has(p.name))

    setSheet({
      type: 'select',
      title: '归到哪件心事',
      options: [
        ...actives.map((c) => ({
          label: `${c.name}  ·  ${CATEGORY_LABEL[c.category || 'long']}`,
          value: `id:${c.id}`
        })),
        ...presets.map((p) => ({
          label: `＋ ${p.name}  ·  ${CATEGORY_LABEL[p.category]}`,
          value: `preset:${p.name}:${p.category}`
        })),
        { label: '＋ 自己写一个…', value: 'custom' },
        { label: '↻ 再试一次自动归类', value: 'retry' }
      ],
      onSelect: (v) => {
        if (v === 'custom') return openAssignCustom(thought)
        if (v === 'retry') return classifyThought(thought.id).catch(() => {})
        if (v.startsWith('id:')) return assignThought(thought.id, Number(v.slice(3)))
        if (v.startsWith('preset:')) {
          const [, name, category] = v.split(':')
          return assignThoughtToNew(thought.id, name, category)
        }
      }
    })
  }
  function openAssignCustom(thought) {
    setSheet({
      type: 'input',
      title: '新建心事',
      placeholder: '心事名称,如 减肥',
      confirmLabel: '下一步:选分类',
      onConfirm: (name) => {
        setSheet({
          type: 'select',
          title: `「${name}」归入`,
          options: CATEGORIES.map((c) => ({ label: c.label, value: c.key })),
          onSelect: (key) => assignThoughtToNew(thought.id, name, key)
        })
      }
    })
  }

  function dismissPrompt(action) {
    const id = promptId
    setPromptId(null)
    if (id == null) return
    markThresholdPrompted(id)
    if (action === 'talk') onOpenConcern(id)
    else if (action === 'resolve') resolveConcern(id)
  }

  return (
    <div className="review-page">
      <header className="review-header">
        <div className="scale-switch">
          {SCALES.map((s) => (
            <button
              key={s.key}
              className={scale === s.key ? 'active' : ''}
              onClick={() => setScale(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={onOpenSettings} aria-label="设置">
          ⚙
        </button>
      </header>

      <section className="rank-section">
        {grouped.length === 0 && <div className="empty-hint">这段时间还很安静。</div>}
        {grouped.map((g) => (
          <div key={g.key} className="cat-group">
            <div className="cat-title">{g.label}</div>
            {g.items.map(({ concern, count }) => (
              <div key={concern.id}>
                <ConcernRow
                  concern={concern}
                  count={count}
                  flame={flameIds.has(concern.id)}
                  onOpen={onOpenConcern}
                  onMenu={openConcernMenu}
                />
                {promptConcern && promptConcern.id === concern.id && (
                  <ThresholdPrompt
                    count={allTimeCount.get(concern.id) || 0}
                    onDismiss={dismissPrompt}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="flow-section">
        <div className="flow-title">今天 · {todayThoughts.length} 条</div>
        {todayThoughts.length === 0 && <div className="empty-hint">今天还没有念头。</div>}
        {todayThoughts.map((t) => {
          const c = t.concernId != null ? concernById.get(t.concernId) : null
          return (
            <div key={t.id} className="flow-item">
              <div className="flow-time">{formatTime(t.createdAt)}</div>
              <div className="flow-body">
                <div className="flow-text">{t.text}</div>
                {c ? (
                  <div className="flow-sub">
                    ↳ {c.name} · 第{ordinal.get(t.id)}次
                  </div>
                ) : (
                  <button className="flow-assign" onClick={() => openAssign(t)}>
                    ↳ 待归类 · 点这里归类
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <section className="resolved-section">
        <button className="resolved-toggle" onClick={() => setShowResolved((v) => !v)}>
          已了却 {resolvedList.length} 桩 {showResolved ? '⌄' : '›'}
        </button>
        {showResolved && resolvedList.length === 0 && (
          <div className="resolved-empty">还没有放下任何心事。</div>
        )}
        {showResolved &&
          resolvedList.map((c) => (
            <ResolvedRow key={c.id} concern={c} onMenu={openResolvedMenu} />
          ))}
      </section>

      <Sheet sheet={sheet} onClose={() => setSheet(null)} />
    </div>
  )
}

function ThresholdPrompt({ count, onDismiss }) {
  return (
    <div className="threshold-prompt">
      <div className="threshold-text">⚡ 这事你已经想了 {count} 次。</div>
      <div className="threshold-actions">
        <button onClick={() => onDismiss('talk')}>跟它认真谈谈</button>
        <button onClick={() => onDismiss('resolve')}>放下</button>
        <button className="ghost" onClick={() => onDismiss('ack')}>
          知道了
        </button>
      </div>
    </div>
  )
}

function ResolvedRow({ concern, onMenu }) {
  return (
    <div className="resolved-row">
      <span className="resolved-name">{concern.name}</span>
      <button className="resolved-restore" onClick={() => onMenu(concern)}>
        恢复
      </button>
    </div>
  )
}
