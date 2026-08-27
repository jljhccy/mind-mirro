import { useState, useEffect, useRef } from 'react'
import { getConfig, setSetting, exportData, importData } from './db.js'

export default function Settings({ onBack }) {
  const [apiBase, setApiBase] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [saved, setSaved] = useState(false)
  const [msg, setMsg] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    getConfig().then((c) => {
      setApiBase(c.apiBase)
      setApiKey(c.apiKey)
      setModel(c.model)
    })
  }, [])

  async function save() {
    await setSetting('apiBase', apiBase.trim())
    await setSetting('apiKey', apiKey.trim())
    await setSetting('model', model.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  async function doExport() {
    const data = await exportData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const d = new Date()
    a.href = url
    a.download = `念镜备份-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate()
    ).padStart(2, '0')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function doImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!confirm('导入将覆盖当前所有数据,确定继续?')) {
      e.target.value = ''
      return
    }
    try {
      const text = await file.text()
      await importData(JSON.parse(text))
      setMsg('导入成功')
    } catch (err) {
      setMsg('导入失败:' + err.message)
    }
    e.target.value = ''
    setTimeout(() => setMsg(''), 2500)
  }

  return (
    <div className="settings-page">
      <header className="detail-header">
        <button className="icon-btn" onClick={onBack} aria-label="返回">
          ‹
        </button>
        <div className="detail-title">
          <div className="detail-name">设置</div>
        </div>
        <span style={{ width: 44 }} />
      </header>

      <div className="settings-body">
        <div className="settings-group">
          <label className="settings-label">API 地址</label>
          <input
            className="settings-input"
            value={apiBase}
            placeholder="https://api.openai.com/v1"
            onChange={(e) => setApiBase(e.target.value)}
          />
          <div className="settings-hint">OpenAI 兼容接口,填到 /v1 即可</div>

          <label className="settings-label">API Key</label>
          <input
            className="settings-input"
            type="password"
            value={apiKey}
            placeholder="sk-..."
            onChange={(e) => setApiKey(e.target.value)}
          />

          <label className="settings-label">模型</label>
          <input
            className="settings-input"
            value={model}
            placeholder="gpt-4o-mini"
            onChange={(e) => setModel(e.target.value)}
          />

          <button className="settings-save" onClick={save}>
            {saved ? '已保存 ✓' : '保存'}
          </button>
        </div>

        <div className="settings-group">
          <div className="settings-label">数据</div>
          <button className="settings-action" onClick={doExport}>
            导出备份 (JSON)
          </button>
          <button className="settings-action" onClick={() => fileRef.current?.click()}>
            导入备份
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={doImport}
          />
          {msg && <div className="settings-hint">{msg}</div>}
        </div>

        <div className="settings-footer">数据全部保存在本机浏览器中。</div>
      </div>
    </div>
  )
}
