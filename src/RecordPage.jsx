import { useState, useRef, useEffect } from 'react'
import { addThought } from './db.js'

export default function RecordPage() {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    ref.current?.focus()
  }, [])

  async function save() {
    const t = text.trim()
    if (!t) return
    await addThought(t)
    setText('')
    setFlash(true)
    setTimeout(() => setFlash(false), 900)
    ref.current?.focus()
  }

  function onKeyDown(e) {
    // 回车保存,Shift+回车换行
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className="record-page">
      <textarea
        ref={ref}
        className="record-input"
        value={text}
        placeholder="此刻,心里冒出什么…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <button className="record-save" disabled={!text.trim()} onClick={save}>
        记下
      </button>
      <div className={`record-flash ${flash ? 'show' : ''}`}>已记下 ✓</div>
      <div className="build-stamp">{__BUILD_TIME__}</div>
    </div>
  )
}
