import { useState, useEffect } from 'react'
import RecordPage from './RecordPage.jsx'
import ReviewPage from './ReviewPage.jsx'
import ConcernDetail from './ConcernDetail.jsx'
import Settings from './Settings.jsx'
import { retryUnclassified, requestPersistentStorage } from './db.js'

export default function App() {
  // view: 'record' | 'review' | 'concern' | 'settings'
  const [view, setView] = useState('record')
  const [tab, setTab] = useState('record') // 记住底部 tab 归属
  const [concernId, setConcernId] = useState(null)

  // 启动时:申请持久化存储(防止 IndexedDB 被自动清除)+ 重试未归类念头
  useEffect(() => {
    requestPersistentStorage()
    retryUnclassified().catch((e) => console.warn(e))
  }, [])

  function goTab(next) {
    setTab(next)
    setView(next)
  }

  const showTabBar = view === 'record' || view === 'review'

  return (
    <div className="app">
      <main className="app-main">
        {view === 'record' && <RecordPage />}
        {view === 'review' && (
          <ReviewPage
            onOpenConcern={(id) => {
              setConcernId(id)
              setView('concern')
            }}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {view === 'concern' && (
          <ConcernDetail concernId={concernId} onBack={() => setView('review')} />
        )}
        {view === 'settings' && <Settings onBack={() => setView('review')} />}
      </main>

      {showTabBar && (
        <nav className="tab-bar">
          <button
            className={tab === 'record' ? 'active' : ''}
            onClick={() => goTab('record')}
          >
            记录
          </button>
          <button
            className={tab === 'review' ? 'active' : ''}
            onClick={() => goTab('review')}
          >
            回顾
          </button>
        </nav>
      )}
    </div>
  )
}
