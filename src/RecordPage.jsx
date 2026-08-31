import { useState, useRef, useEffect } from 'react'
import { addThought } from './db.js'
import { useSpeech } from './useSpeech.js'

export default function RecordPage() {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const ref = useRef(null)

  // 语音识别:每段最终结果追加到输入框
  const speech = useSpeech({
    lang: 'zh-CN',
    onText: (chunk) => {
      setText((prev) => {
        const sep = prev && !/\s$/.test(prev) ? '' : ''
        return prev + sep + chunk
      })
    }
  })

  useEffect(() => {
    ref.current?.focus()
  }, [])

  async function save() {
    const t = text.trim()
    if (!t) return
    if (speech.listening) speech.stop()
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
      <div className="record-input-wrap">
        <textarea
          ref={ref}
          className="record-input"
          value={text + (speech.interim ? (text ? ' ' : '') + speech.interim : '')}
          placeholder="此刻,心里冒出什么…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {speech.supported && (
          <button
            className={`mic-btn ${speech.listening ? 'on' : ''}`}
            onClick={speech.toggle}
            aria-label={speech.listening ? '停止语音输入' : '语音输入'}
          >
            {speech.listening ? '■' : '🎤'}
          </button>
        )}
      </div>

      {speech.listening && <div className="mic-hint">正在聆听… 再点一次停止</div>}
      {speech.error && <div className="mic-error">{speech.error}</div>}

      <button className="record-save" disabled={!text.trim()} onClick={save}>
        记下
      </button>
      <div className={`record-flash ${flash ? 'show' : ''}`}>已记下 ✓</div>
      <div className="build-stamp">{__BUILD_TIME__}</div>
    </div>
  )
}
