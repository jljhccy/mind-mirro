import { useState, useEffect, useRef, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  resolveConcern,
  restoreConcern,
  renameConcern,
  mergeConcern,
  markThresholdPrompted
} from './db.js'
import { rangeStart, startOfToday, formatTime, dotString } from './utils.js'
import { useLongPress } from './useLongPress.js'
import Sheet from './Sheet.jsx'

const SCALES = [
  { key: '7', label: '7天' },
  { key: '30', label: '30天' },
  { key: 'all', label: '全部' }
]

// 频次榜单行
function ConcernRow({ concern, count, flame, onOpen, onLongPress }) {
  const handlers = useLongPress(
    () => onLongPress(concern),
    () => onOpen(concern.id)
  )
  return (
    <div className={`rank-row ${flame ? 'flame' : ''}`} {...handlers}>
      <div className="rank-name">
        {flame && <span className="flame-icon">⚡</span>}
        {concern.name}
      </div>
      <div className="rank-meta">
        <span className="rank-dots">{dotString(count)}</span>
        <span className="rank-num">{count}</span>
      </div>
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
    if (thoughts) for (const t of thoughts) {
      if (t.concernId != null) m.set(t.concernId, (m.get(t.concernId) || 0) + 1)
    }
    return m
  }, [thoughts])

  // 阈值追问:每次进入回顾页,最多挑 1 条(全时段次数≥5 且从未提醒过的活跃心事,取次数最高者)
  useEffect(() => {
    if (!ready || decided.current) return
    decided.current = true
    const candidates = concerns
      .filter((c) => c.status === 'active' && !c.thresholdPrompted && (allTimeCount.get(c.id) || 0) >= 5)
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
  const flameIds = new Set(
    ranked.filter((r) => r.count >= 5).slice(0, 2).map((r) => r.concern.id)
  )

  // 今日流水(倒序)+ 每条在其心事内的序号(第N次,按全时段计)
  const ordinal = new Map()
  {
    const grouped = new Map()
    for (const t of thoughts) {
      if (t.concernId == null) continue
      if (!grouped.has(t.concernId)) grouped.set(t.concernId, [])
      grouped.get(t.concernId).push(t)
    }
    for (const arr of grouped.values()) {
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
      title: concern.name,
      actions: [
        { label: '放下', danger: true, onClick: () => resolveConcern(concern.id) },
        { label: '改名', onClick: () => openRename(concern) },
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

  function dismissPrompt(action) {
    const id = promptId
    setPromptId(null)
    if (id == null) return
    if (action === 'talk') {
      markThresholdPrompted(id)
      onOpenConcern(id)
    } else if (action === 'resolve') {
      markThresholdPrompted(id)
      resolveConcern(id)
    } else {
      markThresholdPrompted(id) // 知道了:今后不再弹
    }
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
        {ranked.length === 0 && <div className="empty-hint">这段时间还很安静。</div>}
        {ranked.map(({ concern, count }) => (
          <div key={concern.id}>
            <ConcernRow
              concern={concern}
              count={count}
              flame={flameIds.has(concern.id)}
              onOpen={onOpenConcern}
              onLongPress={openConcernMenu}
            />
            {promptConcern && promptConcern.id === concern.id && (
              <ThresholdPrompt
                count={allTimeCount.get(concern.id) || 0}
                onDismiss={dismissPrompt}
              />
            )}
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
                <div className="flow-sub">
                  {c ? `↳ ${c.name} · 第${ordinal.get(t.id)}次` : '↳ 待归类…'}
                </div>
              </div>
            </div>
          )
        })}
      </section>

      <section className="resolved-section">
        <button className="resolved-toggle" onClick={() => setShowResolved((v) => !v)}>
          已了却 {resolvedList.length} 桩 {showResolved ? '⌄' : '›'}
        </button>
        {showResolved &&
          resolvedList.map((c) => {
            return <ResolvedRow key={c.id} concern={c} onLongPress={openResolvedMenu} />
          })}
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
        <button className="ghost" onClick={() => onDismiss('ack')}>知道了</button>
      </div>
    </div>
  )
}

function ResolvedRow({ concern, onLongPress }) {
  const handlers = useLongPress(
    () => onLongPress(concern),
    () => {}
  )
  return (
    <div className="resolved-row" {...handlers}>
      {concern.name}
    </div>
  )
}
