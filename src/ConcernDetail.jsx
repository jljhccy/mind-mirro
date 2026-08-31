import { useLiveQuery } from 'dexie-react-hooks'
import { db, resolveConcern, restoreConcern, CATEGORY_LABEL } from './db.js'
import { formatDate, formatTime } from './utils.js'

export default function ConcernDetail({ concernId, onBack }) {
  const concern = useLiveQuery(() => db.concerns.get(concernId), [concernId], undefined)
  const thoughts = useLiveQuery(
    () => db.thoughts.where('concernId').equals(concernId).sortBy('createdAt'),
    [concernId],
    undefined
  )

  if (concern === undefined || thoughts === undefined) return <div className="detail-page" />
  if (!concern) return <div className="detail-page" />

  async function letGo() {
    await resolveConcern(concernId)
    onBack()
  }

  return (
    <div className="detail-page">
      <header className="detail-header">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <div className="detail-title">
          <div className="detail-name">{concern.name}</div>
          <div className="detail-count">
            {CATEGORY_LABEL[concern.category || 'long']} · 共 {thoughts.length} 次
          </div>
        </div>
        {concern.status === 'active' ? (
          <button className="letgo-btn" onClick={letGo}>
            放下
          </button>
        ) : (
          <button className="letgo-btn" onClick={() => restoreConcern(concernId)}>
            恢复
          </button>
        )}
      </header>

      <div className="timeline">
        {thoughts.map((t) => (
          <div key={t.id} className="timeline-item">
            <div className="timeline-dot" />
            <div className="timeline-body">
              <div className="timeline-date">
                {formatDate(t.createdAt)} {formatTime(t.createdAt)}
              </div>
              <div className="timeline-text">{t.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
