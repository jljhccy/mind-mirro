import { useState, useEffect } from 'react'

// 通用底部弹层。通过 sheet 对象控制:
// { type:'actions', title, actions:[{label, danger, onClick}] }
// { type:'input',  title, placeholder, initial, confirmLabel, onConfirm(text) }
// { type:'select', title, options:[{label, value}], onSelect(value), emptyText }
export default function Sheet({ sheet, onClose }) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (sheet?.type === 'input') setText(sheet.initial || '')
  }, [sheet])

  if (!sheet) return null

  const stop = (e) => e.stopPropagation()

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={stop}>
        {sheet.title && <div className="sheet-title">{sheet.title}</div>}

        {sheet.type === 'actions' &&
          sheet.actions.map((a, i) => (
            <button
              key={i}
              className={`sheet-btn ${a.danger ? 'danger' : ''}`}
              onClick={() => {
                a.onClick()
                onClose()
              }}
            >
              {a.label}
            </button>
          ))}

        {sheet.type === 'input' && (
          <>
            <input
              className="sheet-input"
              value={text}
              placeholder={sheet.placeholder || ''}
              autoFocus
              onChange={(e) => setText(e.target.value)}
            />
            <button
              className="sheet-btn primary"
              disabled={!text.trim()}
              onClick={() => {
                sheet.onConfirm(text.trim())
                onClose()
              }}
            >
              {sheet.confirmLabel || '确定'}
            </button>
          </>
        )}

        {sheet.type === 'select' && (
          <>
            {sheet.options.length === 0 && (
              <div className="sheet-empty">{sheet.emptyText || '没有可选项'}</div>
            )}
            {sheet.options.map((o) => (
              <button
                key={o.value}
                className="sheet-btn"
                onClick={() => {
                  sheet.onSelect(o.value)
                  onClose()
                }}
              >
                {o.label}
              </button>
            ))}
          </>
        )}

        <button className="sheet-btn cancel" onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  )
}
