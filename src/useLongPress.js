import { useRef, useCallback } from 'react'

// 长按 500ms 触发 onLongPress;短按触发 onClick。
// 兼容触摸与鼠标,移动超过阈值则取消(视为滚动)。
export function useLongPress(onLongPress, onClick, { delay = 500, moveTolerance = 10 } = {}) {
  const timer = useRef(null)
  const longFired = useRef(false)
  const startPos = useRef({ x: 0, y: 0 })

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  const start = useCallback(
    (e) => {
      longFired.current = false
      const point = e.touches ? e.touches[0] : e
      startPos.current = { x: point.clientX, y: point.clientY }
      timer.current = setTimeout(() => {
        longFired.current = true
        onLongPress?.(e)
      }, delay)
    },
    [onLongPress, delay]
  )

  const move = useCallback(
    (e) => {
      if (!timer.current) return
      const point = e.touches ? e.touches[0] : e
      const dx = Math.abs(point.clientX - startPos.current.x)
      const dy = Math.abs(point.clientY - startPos.current.y)
      if (dx > moveTolerance || dy > moveTolerance) clear()
    },
    [clear, moveTolerance]
  )

  const end = useCallback(
    (e) => {
      clear()
      if (!longFired.current) {
        onClick?.(e)
      }
    },
    [clear, onClick]
  )

  return {
    onTouchStart: start,
    onTouchMove: move,
    onTouchEnd: end,
    onMouseDown: start,
    onMouseMove: move,
    onMouseUp: end,
    onMouseLeave: clear,
    onContextMenu: (e) => e.preventDefault()
  }
}
