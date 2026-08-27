export function startOfToday() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// 返回时间段起点(ms)。scale: '7' | '30' | 'all'
export function rangeStart(scale) {
  if (scale === 'all') return 0
  const days = scale === '7' ? 7 : 30
  return Date.now() - days * 24 * 60 * 60 * 1000
}

export function formatTime(ts) {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

export function formatDate(ts) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 点阵:最多画 dots 个 ●,超出用数字表达即可(数字始终显示)
export function dotString(count, max = 10) {
  const n = Math.min(count, max)
  return '●'.repeat(n)
}
