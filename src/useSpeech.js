import { useState, useRef, useCallback, useEffect } from 'react'

// 浏览器原生语音识别(Web Speech API)。
// iOS Safari / Android Chrome 走 webkit 前缀,不支持的浏览器返回 supported=false。
const SR =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null

export function useSpeech({ lang = 'zh-CN', onText } = {}) {
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')

  const recRef = useRef(null)
  const wantRef = useRef(false) // 用户是否仍希望继续听
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const stop = useCallback(() => {
    wantRef.current = false
    setListening(false)
    setInterim('')
    try {
      recRef.current?.stop()
    } catch {
      /* 忽略重复 stop */
    }
  }, [])

  const start = useCallback(() => {
    if (!SR) {
      setError('这个浏览器不支持语音输入')
      return
    }
    setError('')

    const rec = new SR()
    recRef.current = rec
    rec.lang = lang
    rec.continuous = true
    rec.interimResults = true

    rec.onresult = (e) => {
      let finalText = ''
      let interimText = ''
      // 只处理本次回调新增的部分
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalText += r[0].transcript
        else interimText += r[0].transcript
      }
      if (finalText) {
        onTextRef.current?.(finalText)
        setInterim('')
      } else {
        setInterim(interimText)
      }
    }

    rec.onerror = (e) => {
      // 出错就别再自动重启,避免无权限时死循环
      wantRef.current = false
      const map = {
        'not-allowed': '麦克风权限被拒绝,请在系统设置里允许',
        'service-not-allowed': '麦克风权限被拒绝,请在系统设置里允许',
        'no-speech': '没听到声音',
        network: '语音识别需要联网',
        aborted: ''
      }
      const msg = map[e.error]
      if (msg !== '') setError(msg || `语音识别出错:${e.error}`)
      setListening(false)
      setInterim('')
    }

    rec.onend = () => {
      // iOS 常在静音后自动结束,若用户仍想继续则重启
      if (wantRef.current) {
        try {
          rec.start()
          return
        } catch {
          /* 重启失败则收尾 */
        }
      }
      setListening(false)
      setInterim('')
    }

    try {
      rec.start()
      wantRef.current = true
      setListening(true)
    } catch (e) {
      setError('无法启动语音输入')
      setListening(false)
    }
  }, [lang])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // 卸载时确保停止,避免麦克风一直占用
  useEffect(() => {
    return () => {
      wantRef.current = false
      try {
        recRef.current?.stop()
      } catch {
        /* 忽略 */
      }
    }
  }, [])

  return { supported: !!SR, listening, interim, error, start, stop, toggle, clearError: () => setError('') }
}
