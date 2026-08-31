# 念镜(mind-mirror)交接文档

> 给下一个接手的 AI / 新对话窗口看。读完这份就能无缝继续。
> 最后更新:2026-08-31

## 一句话

一个自用的手机端"念头记录"PWA。随手记下转瞬即逝的念头,应用自动把相似念头归类成"心事"并累计次数。定位是"镜子",不是待办工具:默认零处理义务,只保留"放下"和"阈值提醒"两个出口。

## 技术栈 & 关键事实

- **React + Vite + Dexie(IndexedDB)+ vite-plugin-pwa**,纯前端、零后端、无账号,数据全部存本机浏览器。
- 本地项目路径:`C:\Users\jhyzcy\mind-mirror`
- **GitHub**:`https://github.com/jljhccy/mind-mirro`(注意仓库名少一个 r,是 `mind-mirro`)。**Public**。
  - 远程地址里已嵌入用户的 PAT token,所以 AI 端可以直接 `git push origin main`,无需用户手动授权。
  - ⚠️ 该 token 曾在截图中泄露过,已多次建议用户撤销重配,截至本文档时用户尚未处理。
- **Netlify**:站点 `merry-lamington-28beff`,已连 GitHub 自动部署。
  - Base directory:**留空**;Build command:`npm run build`;Publish directory:`dist`;分支:`main`。
  - 用户 GitHub 账号已 Link 到 Netlify(之前因 "unrecognized Git contributor" 失败,靠"仓库转 Public + Link Git account"解决)。
  - 线上网址:`https://merry-lamington-28beff.netlify.app`
- **部署流程**:AI 改代码 → `git commit` → `git push origin main` → Netlify 自动构建上线。用户手机上把 PWA 从后台划掉重开 1-2 次即可更新(Service Worker `autoUpdate`)。

## 用户是谁 / 沟通要点

- 中文交流。非程序员,不熟悉命令行、Git、Netlify 操作,需要一步步手把手引导截图级别的指引。
- 主要在**手机**上使用本应用(iOS 居多,从截图看)。
- 环境:Windows 11,PowerShell。AI 这端的终端是非交互的,**弹不出 GitHub 授权窗口**——凡是需要交互式登录的命令,要么已通过嵌入 token 解决,要么得让用户在自己电脑上跑。

## 数据模型(见 src/db.js)

- **thought(念头)**:`{ id, text, createdAt, concernId }`。`concernId=null` 表示未归类。
- **concern(心事)**:`{ id, name, category, status, thresholdPrompted, createdAt }`。
  - `category`:`'long'`(长期任务)| `'short'`(短期任务)| `'flash'`(瞬时灵感)。三大一级分类。
  - `status`:`'active'` | `'resolved'`。"放下"=改为 resolved,不删数据,可恢复。
  - `thresholdPrompted`:阈值追问是否已弹过(一次性)。
- **settings**:键值对,存 `apiKey` / `apiBase` / `model`。
- Dexie 版本:v1 → v2(v2 给 concern 加了 category,upgrade 时旧数据默认归 'long')。**再改 schema 要新开 db.version(3),不要改旧版本定义。**

## 已实现的功能(按页面)

### 记录页(RecordPage.jsx)
- 大输入框自动聚焦,回车保存(Shift+回车换行),保存后清空 + "已记下✓"轻反馈。
- **语音输入**(useSpeech.js):右下角麦克风按钮,Web Speech API(webkit 前缀),中文 zh-CN。识别中实时显示 interim 文字,最终结果追加进输入框。不支持的浏览器不显示按钮。
- 底部有极淡的版本号 `__BUILD_TIME__`(Vite define 注入的构建北京时间),用于确认手机是否更新到新版。

### 回顾页(ReviewPage.jsx)
- 顶部时间尺度切换:7天 / 30天 / 全部。右上角 ⚙ 进设置。
- **频次榜按三大一级分类分组**,组内按时间段内念头次数倒序。每行:名称 + 点阵 + 数字。
- ⚡ 标记:榜内次数≥5,最多 2 个(次数最高优先),带微高亮背景。
- 每行右侧 **⋯ 按钮**(也支持长按 500ms)→ 菜单:放下 / 改名 / 改分类 / 合并到其他心事。点名字进详情页。
- **阈值追问**:某心事全时段次数首次≥5 且从未提醒过 → 下次进回顾页在该行下方展开一条:"⚡ 这事你已经想了 N 次" [跟它认真谈谈][放下][知道了]。每次进页面最多弹 1 条,三个按钮都会 markThresholdPrompted(今后不再弹)。
- **今日流水**:"今天·N条",倒序列出今天念头原文,下方浅灰显示 "↳ 心事名 · 第X次"。未归类的显示可点的"待归类·点这里归类"按钮。
- **已了却区**:折叠的 "已了却 N 桩",展开后每项带删除线 + "恢复"按钮。

### 心事详情页(ConcernDetail.jsx)
- 顶部:名称 + "分类·共N次";右上角按钮按状态在"放下"/"恢复"间切换。
- 该心事所有念头按时间正序铺成时间线。

### 设置页(Settings.jsx)
- **存储状态**徽标(绿/橙):显示是否获得 persist 授权、已用空间。橙色时提示"添加到主屏、从主屏图标打开、别用无痕"。
- **自动归类**说明:强调 API 可选,默认用本地规则。
- API 地址 / Key / 模型(OpenAI 兼容,可选填)。
- 数据导出(JSON)/ 导入(覆盖式,有 confirm)。

## 归类逻辑(重点)

**核心:不依赖 LLM 也能全自动归类。** 用户目前没接 LLM。

- **classify.js**:本地规则引擎。关键词匹配。优先级:匹配已有活跃心事 > 匹配预设标签 > 按一级分类信号词兜底。保证任何念头都能被归类,不会卡在"待归类"。已本地实测有效(减肥/运动/学英语/本周作业/想做的项目/和家人的关系等)。
- **db.js classifyThought()**:有 apiKey 先试 LLM(llm.js),失败或无 key 则退回 classify.js 本地规则。
- **llm.js**:OpenAI 兼容 /chat/completions。严格 JSON:`{"concern_id", "new_concern_name", "category"}`,parseLoose() 做容错(去代码围栏、截取 {}、字段兜底)。会校验返回的 concern_id 确实在活跃列表里。
- 预设标签见 db.js `PRESET_CONCERNS`,关键词见 classify.js `PRESET_KEYWORDS`。

## 已知坑 / 教训

1. **IndexedDB 不索引 null 键**:不能用 `where('concernId').equals(null)`,会抛错。用 `.filter(t => t.concernId == null)`。(retryUnclassified 里已修。)
2. **移动端数据丢失**:根因是浏览器回收 IndexedDB。已加 `requestPersistentStorage()`(App 启动时调用 `navigator.storage.persist()`)。但这是"申请"不是"命令",iOS 不保证 100%。必须从主屏图标打开、非无痕模式,授权率才高。始终提醒用户定期导出备份。旧版本记的数据在持久化上线前记的,救不回。
3. **换部署网址 = 换新站 = 手机本地数据全丢**(IndexedDB 绑 origin)。所以一直坚持复用同一个 Netlify 站点,不新建。
4. **Netlify 免费版私有仓库拦截非验证 contributor**:解决靠仓库转 Public + Link Git account。
5. Git 提交有 LF/CRLF warning,无害,忽略。

## 待办 / 用户可能接下来想要的

- 用户仍需去确认手机上"存储状态"是绿色(数据持久化生效)。
- token 泄露待用户撤销重配。
- 之前给底部 tab 加了 40px 垫高避开 Netlify 徽章;Git 部署后徽章应已消失,这 40px 可考虑撤掉(styles.css `.tab-bar` 的 padding-bottom)。用户没确认过是否碍眼。

## 构建 / 常用命令

```bash
cd /c/Users/jhyzcy/mind-mirror
npm run build                    # 构建,产物在 dist/
git add -A && git commit -m "..." && git push origin main   # 部署
```
