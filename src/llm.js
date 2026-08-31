// 调用 OpenAI 兼容接口,把新念头归入某个已有心事或新建心事。
// 严格要求返回 JSON:{"concern_id": "已有id或null", "new_concern_name": "新心事名或null"}

function buildPrompt(text, concerns) {
  const list =
    concerns.length > 0
      ? concerns
          .map((c) => `- id=${c.id}  名称:${c.name}  分类:${c.category || 'long'}`)
          .join('\n')
      : '(当前没有任何活跃心事)'

  const system = `你是一个帮助用户整理内心念头的助手。用户会记录一条转瞬即逝的念头,你要判断它属于哪一件"心事"。
心事是用户反复挂念的同一件事(如"减肥""学英语""转行的事")。
每个心事都属于一个一级分类,只能是这三个之一:
- long(长期任务):需要长期坚持或反复挂念的事,如减肥、运动、学英语、健康、存钱、人际关系
- short(短期任务):近期要做完的具体事,如本周作业、待回消息、要买的东西
- flash(瞬时灵感):一闪而过的想法、点子、灵感

规则:
1. 如果这条念头在语义上属于下面某个已有心事,返回该心事的 id。
2. 如果都不属于,新建一个心事,用简短中文名概括(2-8字,名词短语,不要标点),并给出它的分类。
3. 优先复用这些常用标签名(如果语义吻合):减肥、运动、学英语、学专业课、身体健康、存钱、转行的事、和家人的关系、本周作业、待回消息、要买的东西、写作灵感、想做的项目
4. 只能二选一:归入已有,或新建。

你必须只输出一个 JSON 对象,不要有任何多余文字、解释或代码块标记。
JSON 格式严格为:{"concern_id": <已有心事id或null>, "new_concern_name": <新心事名字符串或null>, "category": "long"|"short"|"flash"}
归入已有时:concern_id 为该 id,new_concern_name 为 null,category 仍然给出你的判断。
新建时:concern_id 为 null,new_concern_name 为名称,category 为其分类。`

  const user = `已有活跃心事列表:
${list}

新念头:「${text}」

请输出 JSON。`

  return { system, user }
}

// 从可能夹带杂质的文本里抠出 JSON 对象
function parseLoose(content) {
  if (!content) throw new Error('empty content')
  let s = content.trim()
  // 去掉 ```json ... ``` 围栏
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  // 截取第一个 { 到最后一个 }
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1)
  }
  const obj = JSON.parse(s)
  return {
    concern_id:
      obj.concern_id === undefined ||
      obj.concern_id === null ||
      obj.concern_id === '' ||
      obj.concern_id === 'null'
        ? null
        : obj.concern_id,
    new_concern_name:
      typeof obj.new_concern_name === 'string' && obj.new_concern_name.trim()
        ? obj.new_concern_name.trim()
        : null,
    category: typeof obj.category === 'string' ? obj.category.trim() : null
  }
}

export async function classifyWithLLM(text, concerns, config) {
  const { system, user } = buildPrompt(text, concerns)
  const base = config.apiBase.replace(/\/+$/, '')

  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '')
    throw new Error(`LLM ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const data = await resp.json()
  const content = data?.choices?.[0]?.message?.content
  return parseLoose(content)
}
