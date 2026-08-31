// 本地归类器:不依赖 LLM,靠关键词规则自动把念头归入心事。
// 优先级:已有心事 > 预设标签 > 按一级分类兜底。保证任何念头都能被归类。

// 预设标签对应的关键词。命中任一即归入该标签。
const PRESET_KEYWORDS = [
  { name: '减肥', category: 'long', words: ['减肥', '瘦', '体重', '身材', '卡路里', '热量', '节食', '少吃', '胖'] },
  { name: '运动', category: 'long', words: ['运动', '健身', '跑步', '锻炼', '撸铁', '游泳', '瑜伽', '骑车', '步数', '打球'] },
  { name: '学英语', category: 'long', words: ['英语', '单词', '雅思', '托福', '口语', '听力', '四级', '六级', 'english'] },
  { name: '学专业课', category: 'long', words: ['专业课', '论文', '课程', '复习', '考试', '读书', '学习', '文献', '作业', '考研', '功课'] },
  { name: '身体健康', category: 'long', words: ['健康', '睡眠', '失眠', '熬夜', '体检', '生病', '头疼', '胃', '医生', '吃药', '疲惫', '累'] },
  { name: '存钱', category: 'long', words: ['存钱', '省钱', '攒钱', '理财', '花钱', '预算', '工资', '收入', '基金', '穷', '开销'] },
  { name: '转行的事', category: 'long', words: ['转行', '换工作', '跳槽', '辞职', '离职', '简历', '面试', '职业', '前途', '工作方向'] },
  { name: '和家人的关系', category: 'long', words: ['妈妈', '母亲', '爸爸', '父亲', '家人', '家里', '爷爷', '奶奶', '父母', '亲戚', '弟弟', '妹妹', '哥哥', '姐姐'] },
  { name: '感情的事', category: 'long', words: ['喜欢', '暗恋', '恋爱', '分手', '男朋友', '女朋友', '对象', '相亲', '孤独', '寂寞'] },

  { name: '本周作业', category: 'short', words: ['作业', '交作业', 'ddl', 'deadline', '截止', '提交', '报告', '要交'] },
  { name: '待回消息', category: 'short', words: ['回消息', '回复', '微信', '没回', '消息', '电话', '回电', '邮件'] },
  { name: '要买的东西', category: 'short', words: ['要买', '买个', '购物', '下单', '快递', '买点', '囤', '缺个'] },
  { name: '近期约会', category: 'short', words: ['约', '见面', '聚', '吃饭', '约会', '周末去', '看电影'] },

  { name: '写作灵感', category: 'flash', words: ['写', '文章', '标题', '句子', '文案', '写作', '博客', '选题'] },
  { name: '想做的项目', category: 'flash', words: ['项目', '做个', '开发', '产品', '创业', '副业', '搞个', 'app', '网站', '工具'] }
]

// 一级分类的信号词。用于兜底判断以及新建标签时定分类。
const CATEGORY_HINTS = {
  flash: ['突然想到', '忽然', '灵感', '点子', '想法', '要是', '如果', '会不会', '有意思', '好像可以', '脑子里'],
  short: ['今天', '明天', '后天', '这周', '本周', '周末', '记得', '别忘', '马上', '尽快', '今晚', '下午', '早上', '待办']
}

// 各分类的兜底标签名
const FALLBACK_NAME = {
  long: '其他心事',
  short: '零碎待办',
  flash: '随手念头'
}

// 去掉心事名里的虚词,便于和念头文本互相匹配
function coreOf(name) {
  return name.replace(/的事$|的问题$|这件事$/g, '').trim()
}

function detectCategory(text) {
  for (const w of CATEGORY_HINTS.flash) {
    if (text.includes(w)) return 'flash'
  }
  for (const w of CATEGORY_HINTS.short) {
    if (text.includes(w)) return 'short'
  }
  return 'long'
}

// 在已有活跃心事里找匹配。返回 concern 或 null。
function matchExisting(text, concerns) {
  let best = null
  let bestLen = 0

  for (const c of concerns) {
    const core = coreOf(c.name)
    // 心事名直接出现在念头里
    if (core.length >= 2 && text.includes(core) && core.length > bestLen) {
      best = c
      bestLen = core.length
    }
    // 心事名恰好是某个预设标签,则借用它的关键词
    const preset = PRESET_KEYWORDS.find((p) => p.name === c.name)
    if (preset) {
      for (const w of preset.words) {
        if (text.includes(w) && w.length > bestLen) {
          best = c
          bestLen = w.length
        }
      }
    }
  }
  return best
}

// 在预设标签里找匹配。返回 {name, category} 或 null。
function matchPreset(text) {
  let best = null
  let bestLen = 0
  for (const p of PRESET_KEYWORDS) {
    for (const w of p.words) {
      if (text.includes(w) && w.length > bestLen) {
        best = p
        bestLen = w.length
      }
    }
  }
  return best ? { name: best.name, category: best.category } : null
}

// 本地归类主入口。
// 返回 { concernId } 表示归入已有,或 { newConcernName, category } 表示新建。
export function classifyLocally(text, activeConcernList) {
  const t = String(text || '').toLowerCase()
  const raw = String(text || '')
  const probe = raw + ' ' + t // 中英文都能匹配

  const hit = matchExisting(probe, activeConcernList)
  if (hit) return { concernId: hit.id }

  const preset = matchPreset(probe)
  if (preset) {
    // 已有同名心事(可能已了却)时不重复新建,交给上层判断
    return { newConcernName: preset.name, category: preset.category }
  }

  const cat = detectCategory(probe)
  return { newConcernName: FALLBACK_NAME[cat], category: cat }
}
