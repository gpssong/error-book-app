/**
 * MiniMax-M3 语义解析服务
 *
 * 作用: 把 TextIn OCR 的"碎片化输出"(文字行 + 公式 LaTeX)融合成结构化题目数据。
 *
 * 实现为多 provider 适配层:
 * - 优先用 MiniMax API 调 MiniMax-M3 (如果配置了 MINIMAX_API_KEY)
 * - 降级到 Agnes AI (兼容 OpenAI Chat Completions 格式)
 *
 * 输入: { imageBase64, ocrText, formulas, subject }
 * 输出: { title, knowledgePoint, textContent }
 */
import dotenv from 'dotenv'
dotenv.config()
import { extractJSON } from '../utils/jsonParse.js'
import { normalizeLatex, normalizeLatexLight } from '../utils/latexNormalize.js'

const MINIMAX_KEY = process.env.MINIMAX_API_KEY || ''
const MINIMAX_BASE = process.env.MINIMAX_API_BASE || 'https://api.minimaxi.com/anthropic'
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3'

const AGNES_KEY = process.env.AI_API_KEY || ''
const AGNES_BASE = process.env.AI_API_BASE || 'https://apihub.agnes-ai.com/v1'
const AGNES_VISION = process.env.VISION_MODEL || 'agnes-2.5-pro-alpha'

const SYSTEM_PROMPT = `你是一位资深中学教师,擅长从 OCR 碎片化结果中还原题目原貌。

你的任务:
1. 接收三部分输入:
   - ocrText: TextIn OCR 识别出的所有文字行(顺序按版面)
   - formulas: TextIn 公式识别出的 LaTeX 公式列表
   - imageBase64: 题目原图(作为参考)
2. 还原出结构化题目:
   - title: 简短题目标题(≤15 字,如"二次函数顶点坐标求解")
   - knowledgePoint: 核心知识点(如"二次函数"、"动量守恒")
   - textContent: 完整题目文字,所有数学符号必须用标准 LaTeX 表示

LaTeX 规范(必须严格遵守):
- 集合并/交/补:\cup / \cap / \complement,如 A\\cup B、A\\cap B、A 的补集
- 集合属于/包含:\in / \notin / \subseteq / \supseteq
- 分数:\\frac{a}{b} 或 \\dfrac{a}{b}(推荐 dfrac)
- 根号:\\sqrt{a} 或 \\sqrt[n]{a} — **必须带花括号**
- 不等式:\geq / \leq / \neq / \infty
- 区间:[a,+\\infty) 用 [a,+\\infty) 这种 LaTeX 写法
- 自然对数 e:\\mathrm{e} 或 \\sqrt{e} 保持原样
- 复数 i:\\mathrm{i}(必须用 \\mathrm 包裹,不要裸 i)
- 对数:\\log_{2} a、\\ln x(必须带 \\log / \\ln 命令)
- 模/共轭:|z| = \\sqrt{z \\cdot \\bar{z}},或直接 |z|
- 三角函数:\\sin / \\cos / \\tan
- 绝对值:|x| — 用 |x|,不用 \\abs{x}
- 角标 x^2 必须带花括号 x^{2}

**严格 LaTeX 输出规则(防止格式错乱)**:
1. 所有数学内容必须用一对 $...$ 包裹,**不要散落 \$ 符号**
2. 一道题的所有选项都要么全用 LaTeX,要么全用纯文本,**不要混用**
3. 不要输出"15"这种被 OCR 误识别的数字,如果原文是 \\sqrt{ab} 请忠实输出 \\sqrt{ab}
4. 题号 "1." 写在最前,后面紧跟题干,不要省略题干

textContent 格式:
- 题目描述(题干)+ 四个选项 A./B./C./D. (完整保留,不要省略题干)
- 如果是选择题,把题号+题干+4 个选项全部包含进去
- 如果是多个题目,只取第一道完整的(含它的所有选项)
- 公式/符号必须用 LaTeX,中文/数字/字母保持原文
- 不要输出题目之外的任何解释

**重要:诗词/阅读/文言文题要包含原文**
语文题(古诗词、文言文、现代文阅读)中,题目常常引用或要求考生读懂一首诗/一段文言文/一篇文章。
题目截图里通常会出现原文,但 OCR 输出可能被截断或考生只截了题目部分。
为了孩子讲题时能看到完整原文,**必须**:
- 认真看 OCR 文字 + 看图,**把题目所引用的诗词原文/文言文全文/阅读文章原文全部抓回**
- 原诗词要保留标点、换行(用 \\n)、原文中的专有名词(朝代、作者、地名等)
- 原诗词在 sourceText 里输出,**不要再混入 textContent**(textContent 只放题干 + 选项)
- 题目字数限制放宽:诗词 100-500 字 / 文言文 200-800 字 / 阅读文章 300-2000 字
- 如果题图里**确实没有**原文(只有题干和选项),sourceText 留空字符串 ""(不要瞎写)

sourceText 示例:
"《苏幕遮·怀旧》[北宋·范仲淹]\\n
碧云天,黄叶地,秋色连波,波上寒烟翠。\\n
山映斜阳天接水,芳草无情,更在斜阳外。\\n
黯乡魂,追旅思,夜夜除非,好梦留人睡。\\n
明月楼高休独倚,酒入愁肠,化作相思泪。\\n\\n
《沁园春·长沙》[近代·毛泽东]\\n
独立寒秋,湘江北去,橘子洲头。\\n
看万山红遍,层林尽染;漫江碧透,百舸争流。\\n
鹰击长空,鱼翔浅底,万类霜天竞自由。\\n
怅寥廓,问苍茫大地,谁主沉浮?\\n
携来百侣曾游,忆往昔峥嵘岁月稠。\\n
恰同学少年,风华正茂;书生意气,挥斥方遒。\\n
指点江山,激扬文字,粪土当年万户侯。\\n
曾记否,到中流击水,浪遏飞舟?"

textContent 示例:
"1.已知集合 A = \\{x | x^2 - 2x - 3 \\geq 0\\},B = \\{x | \\ln x \\geq \\dfrac{1}{2}\\},则 A\\cup B = ( )
A. [3,+\\infty)
B. (-\\infty,-1] \\cup [\\sqrt{e},+\\infty)
C. (-\\infty,-1] \\cup [3,+\\infty)
D. [-1,\\sqrt{e}]"

注意:
- 如果 ocrText 为空,以图片为主,不要输出"无法识别"
- 如果 ocrText 中漏字,以图片为准
- 只输出**第一道**完整题目(不要把第二、第三题的内容混进来)
- **重要**:如果题目包含多道题,只输出第 1 道,但第 1 道必须**完整**(题干 + 4 个选项齐全)

严格返回 JSON,无任何其他文字:
{
  "title": "...",
  "knowledgePoint": "...",
  "textContent": "...",
  "sourceText": "..."   // 诗词原文/文言文/阅读文章(只语文类有值,其它学科留空字符串)
}`

/**
 * 语义解析主入口
 *
 * @param {object} input
 *   - imageBase64: 擦除手写后的图片
 *   - ocrText: 文字识别结果
 *   - formulas: 公式 LaTeX 数组
 *   - subject: 学科
 * @returns {Promise<{title, knowledgePoint, textContent}>}
 */
export async function semanticParse({ imageBase64, ocrText = '', formulas = [], subject = '数学' }) {
  // 构造 user prompt,把碎片化输入整合
  const userPrompt = `
# 学科
${subject}

# OCR 文字行(顺序按版面)
${ocrText || '(空)'}

# 识别的数学公式 (LaTeX)
${formulas.length ? formulas.map((f, i) => `${i + 1}. ${f}`).join('\n') : '(无)'}

请按系统提示的 JSON 格式输出。`.trim()

  // 优先用 MiniMax
  if (MINIMAX_KEY) {
    try {
      const result = await callVisionAPI({
        apiKey: MINIMAX_KEY,
        baseUrl: MINIMAX_BASE,
        model: MINIMAX_MODEL,
        textPrompt: userPrompt,
        imageBase64,
      })
      const parsed = extractJSON(result)
      if (parsed) return normalizeParsed(parsed)
      console.warn('[MiniMax] 返回非 JSON,降级到 Agnes')
    } catch (err) {
      console.warn('[MiniMax] 调用失败,降级到 Agnes:', err.message)
    }
  }

  // 降级到 Agnes AI
  if (AGNES_KEY) {
    const result = await callVisionAPI({
      apiKey: AGNES_KEY,
      baseUrl: AGNES_BASE,
      model: AGNES_VISION,
      textPrompt: userPrompt,
      imageBase64,
    })
    const parsed = extractJSON(result)
    if (parsed) return normalizeParsed(parsed)
  }

  throw new Error('MiniMax 和 Agnes 都未配置,或返回无法解析')
}

/**
 * 纯文本 OCR 修正（推荐路径）
 *
 * 输入:TextIn 的 OCR 文字 + 公式 LaTeX,无图片
 * 输出:{title, knowledgePoint, textContent},由 LLM 修正 OCR 错误并补全 LaTeX
 *
 * 为什么用文本路径:
 *   - 不传图片:Token 省 80%,延迟低
 *   - Agnes text-only 模型(agnes-2.5-flash)不会因图像输入报 500
 *   - 对选择题场景,OCR 已经能拿到完整文字,LLM 只负责修正 OCR 字符错误
 */
export async function semanticParseText({ ocrText, formulas = [], subject = '数学' }) {
  const userPrompt = `
# 学科
${subject}

# OCR 文字行(顺序按版面)
${ocrText || '(空)'}

# 识别的数学公式 (LaTeX)
${formulas.length ? formulas.map((f, i) => `${i + 1}. ${f}`).join('\n') : '(无)'}

请修正 OCR 字符错误(例如 "x2" → "x^2","lnx" → "\\ln x","oo" → "\\infty","IJU" → "\\cup","Ve" → "\\sqrt{e}"),用标准 LaTeX 表示数学符号,严格按系统提示输出 JSON。`.trim()

  // 优先 MiniMax-M3 (Anthropic Messages 协议,强推理)
  if (MINIMAX_KEY) {
    try {
      const result = await callAnthropicAPI({
        apiKey: MINIMAX_KEY,
        baseUrl: MINIMAX_BASE,
        model: MINIMAX_MODEL,
        textPrompt: userPrompt,
        systemPrompt: SYSTEM_PROMPT,
      })
      const parsed = extractJSON(result)
      if (parsed) return { ...normalizeParsed(parsed), _provider: 'minimax' }
      console.warn('[semanticParseText] MiniMax 返回非 JSON,降级 Agnes')
    } catch (err) {
      console.warn('[semanticParseText] MiniMax 失败,降级 Agnes:', err.message)
    }
  }

  // 降级 Agnes text-only (便宜稳定)
  if (AGNES_KEY) {
    try {
      const result = await callTextAPI({
        apiKey: AGNES_KEY,
        baseUrl: AGNES_BASE,
        model: 'agnes-2.5-flash', // text-only,稳定
        textPrompt: userPrompt,
      })
      const parsed = extractJSON(result)
      if (parsed) return { ...normalizeParsed(parsed), _provider: 'agnes' }
    } catch (err) {
      console.warn('[semanticParseText] Agnes 失败:', err.message)
    }
  }

  throw new Error('所有文本模型调用失败')
}

// ─── 通用 OpenAI 兼容 Vision 调用 ──────────────────────────────────────────
async function callVisionAPI({ apiKey, baseUrl, model, textPrompt, imageBase64 }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: textPrompt },
            { type: 'image_url', image_url: { url: imageBase64 } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`${baseUrl} ${model} [${response.status}]: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ─── 通用 OpenAI 兼容 纯文本调用（不带图片）──────────────────────────────
async function callTextAPI({ apiKey, baseUrl, model, textPrompt }) {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: textPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`${baseUrl} ${model} [${response.status}]: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content?.trim() || ''
}

// ─── MiniMax Anthropic Messages 协议调用（anthropic-version 头）────────────
async function callAnthropicAPI({ apiKey, baseUrl, model, textPrompt, systemPrompt }) {
  // baseUrl 默认形如 https://api.minimaxi.com/anthropic,我们 POST {baseUrl}/v1/messages
  const url = baseUrl.replace(/\/$/, '') + '/v1/messages'
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: systemPrompt || '你是一位严谨的中学教师,擅长把 OCR 碎片化的题目还原成结构化 JSON。',
      messages: [{ role: 'user', content: textPrompt }],
      temperature: 0.1,
    }),
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`${baseUrl} ${model} [${response.status}]: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  // Anthropic 协议返回 content: [{type:"text", text:"..."}]
  const blocks = data?.content || []
  const text = blocks
    .filter((b) => b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim()
  return text || ''
}

/**
 * 视觉兜底：直接用多模态模型读图理解题目
 * 与 semanticParse 的区别:不带 OCR 文字上下文,完全依赖图像理解。
 *
 * 用于:TextIn 没识别出任何文字(复杂版面/手写严重)时。
 */
export async function visionFallback({ imageBase64, subject = '数学' }) {
  const userPrompt = `
# 学科
${subject}

请直接看图,提取**第一道完整题目**(含题号+题干+四个选项)。

数学符号必须用标准 LaTeX:
- \\cup / \\cap / \\in / \\geq / \\dfrac{a}{b} / \\sqrt{a} / +\\infty
- 选项写成 "A. ...\\nB. ...\\nC. ...\\nD. ..."`.trim()

  // 优先 Agnes 视觉（已在 .env 配置 VISION_MODEL）
  if (AGNES_KEY) {
    try {
      const result = await callVisionAPI({
        apiKey: AGNES_KEY,
        baseUrl: AGNES_BASE,
        model: AGNES_VISION,
        textPrompt: userPrompt,
        imageBase64,
      })
      const parsed = extractJSON(result)
      if (parsed) return normalizeParsed(parsed)
    } catch (err) {
      console.warn('[VisionFallback] Agnes 失败:', err.message)
    }
  }

  // 备选 MiniMax-M3
  if (MINIMAX_KEY) {
    try {
      const result = await callVisionAPI({
        apiKey: MINIMAX_KEY,
        baseUrl: MINIMAX_BASE,
        model: MINIMAX_MODEL,
        textPrompt: userPrompt,
        imageBase64,
      })
      const parsed = extractJSON(result)
      if (parsed) return normalizeParsed(parsed)
    } catch (err) {
      console.warn('[VisionFallback] MiniMax 失败:', err.message)
    }
  }

  throw new Error('视觉兜底未配置可用 API Key')
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function normalizeParsed(p) {
  return {
    title: normalizeLatexLight(p.title || '') || '未识别',
    knowledgePoint: String(p.knowledgePoint || '').slice(0, 30) || '未知',
    textContent: normalizeLatex(p.textContent || '').trim(),
    sourceText: String(p.sourceText || '').trim(),
  }
}

/**
 * 学科检测:对 OCR 文本 + 公式做关键词投票,从 6 个学科中挑最匹配的一个
 *
 * 关键词来自各学科典型词汇。命中越多分数越高;全为 0 时返回 fallback
 * (通常是用户在 UI 手动选的那个学科,或者保守回 '数学')。
 *
 * 设计原则:
 * - 不依赖 LLM 额外调用,纯本地投票,零成本、快、可离线
 * - 对「纯文字 + 多道选择题」场景,TextIn 识别出的文字本身就带学科特征
 * - 公式密集(>5 条 LaTeX)→ 数学强信号,直接 boost 数学
 */
const SUBJECT_KEYWORDS = {
  数学: ['方程', '不等式', '集合', '函数', '导数', '向量', '数列', '三角函数', 'sin', 'cos', 'tan', 'log', 'ln', '√', '²', '³', 'π', '解方程', '求解', '证明', '几何', '全等', '相似', '圆', '直线', '抛物线', '椭圆', '双曲线', '概率', '排列', '组合'],
  物理: ['牛顿', '力', '加速度', '速度', '动能', '势能', '动量', '电路', '电场', '磁场', '电磁', '光', '波动', '频率', '波长', '折射', '反射', '热力学', '内能', '功', '功率', '电流', '电压', '电阻', '电荷', '电容', '电感', '变压器'],
  化学: ['元素', '化合物', '反应', '氧化', '还原', '酸', '碱', '盐', '离子', '化合价', '摩尔', '浓度', 'pH', '沉淀', '电解', '有机', '化学键', '分子', '原子', '同位素', '核素', '周期', '族', '官能团'],
  语文: ['文言文', '现代文', '古诗', '诗', '词', '赋', '阅读', '作文', '字词', '拼音', '病句', '修辞', '比喻', '拟人', '排比', '成语', '名句', '默写', '标点', '语段'],
  英语: ['语法', '时态', '从句', '虚拟语气', '完形', '阅读', '写作', '翻译', '词汇', '短语', '介词', '冠词', '代词', '被动', '非谓语', '主谓一致', '定语', '状语', '倒装'],
  // v38.1 扩展:补全植物生理/矿质营养/生态群落/微生物/人体生理/实验设计等
  // 之前漏了"矿质元素/植物/培养液/无土栽培"等 → "番茄无土栽培培养液分析"被误判数学
  生物: ['细胞', '遗传', '基因', 'DNA', 'RNA', '蛋白质', '酶', '呼吸', '光合', '光合作用', '生态', '进化', '神经', '免疫', '激素', '分裂', '减数', '染色体', '孟德尔', '变异', '显性', '隐性', '植物', '动物', '微生物', '细菌', '病毒', '真菌', '藻类', '蕨类', '种子', '萌发', '根系', '叶片', '气孔', '蒸腾', '矿质', '矿质元素', '无土栽培', '培养液', '培养基', '幼苗', '幼叶', '老叶', '番茄', '玉米', '水稻', '小麦', '大豆', '种群', '群落', '生态系统', '食物链', '食物网', '生产者', '消费者', '分解者', '碳循环', '氮循环', '血糖', '血压', '体温', '反射', '胰岛素', '甲状腺', '神经系统', '泌尿系统', '血液循环', '人体', '器官', '组织', '疫苗', '抗体', '抗原'],
  历史: ['朝代', '皇帝', '战役', '战争', '制度', '改革', '革命', '文明', '遗址', '文物', '史料', '夏商周', '春秋', '战国', '秦朝', '汉朝', '唐朝', '宋朝', '元朝', '明朝', '清朝', '民国', '近代', '现代', '古代', '皇帝', '王', '诸侯', '分封', '郡县', '科举', '洋务', '戊戌', '辛亥', '五四', '抗日', '解放'],
  地理: ['地形', '气候', '洋流', '人口', '城市', '地图', '板块', '经纬度', '纬度', '经度', '时区', '季风', '台风', '降水', '气温', '海拔', '盆地', '平原', '高原', '山地', '丘陵', '流域', '河流', '湖泊', '海洋', '海峡', '半岛', '岛屿', '亚洲', '欧洲', '非洲', '美洲', '大洋洲', '南极', '北极'],
  科学: ['实验', '观察', '测量', '比较', '分类', '假设', '猜想', '现象', '物质', '能量', '变化', '简单机械', '杠杆', '滑轮', '声音', '影子', '光的反射', '水的三态'],
}

// ─── 学科自动分类(2026-09-14:改用 LLM 按知识点判断,替换早期关键词投票)──
//
// 设计要点:
// - 输入 = 题目标题 + 知识点标签 + 题目正文(截前 600 字,够 LLM 理解)
// - LLM 输出一个 subject 字段:数学/语文/英语/物理/化学/生物/历史/地理
//   (历史、地理是中学 6 大主科之外的"常识/历史/地理"科目,实际题目里很常见,
//    例如二里头遗址、夏商周、秦朝、美国独立战争、地球运动等)
// - 失败/超时 → 返回 fallback(用户手选的学科),绝不把题目归到错误学科
// - 命中历史/地理 → 前端 SubjectTag 会自动 fallback 到"语文"(因为前端 6 学科里没有历史/地理)
const VALID_SUBJECTS = ['数学', '语文', '英语', '物理', '化学', '生物', '历史', '地理', '科学']

export async function detectSubjectByLLM({ title = '', knowledgePoint = '', textContent = '', fallback = '数学' }) {
  // 任一输入都有内容才值得调 LLM
  const signal = (title || knowledgePoint || (textContent || '').slice(0, 600)).trim()
  if (!signal) return fallback

  // ─── v38.1 本地兜底优先: 调 LLM 前先做关键词投票 ───────────────
  // 根因: LLM 对中学 9 学科不熟,会把"植物矿质元素"识别成数学(因为有"Mg/浓度"被当成化学式歧义)
  // 本地投票命中 >=2 个明确学科词 → 直接信任,跳过 LLM 调用
  const corpus = `${title}\n${knowledgePoint}\n${(textContent || '').slice(0, 600)}`
  const localScores = {}
  for (const [subject, kws] of Object.entries(SUBJECT_KEYWORDS)) {
    let s = 0
    for (const kw of kws) if (corpus.includes(kw)) s += 1
    if (s > 0) localScores[subject] = s
  }
  // 找本地最高分学科(排除 fallback)
  let localBest = null
  let localBestScore = 0
  for (const [subject, score] of Object.entries(localScores)) {
    if (score > localBestScore) { localBestScore = score; localBest = subject }
  }
  // 本地命中 >=2 个词 → 高可信,直接采用(零成本,避免 LLM 把生物判成数学这种错)
  if (localBest && localBestScore >= 2 && localBest !== fallback) {
    console.log(`[detectSubjectByLLM] 本地投票命中 ${localBest}=${localBestScore} (corpus: ${corpus.length}字),跳过 LLM`)
    return localBest
  }

  const prompt = `你是中学学科分类专家。根据下面这道题目的【标题】【知识点】【正文片段】,判断它属于哪一科。

# 标题
${title || '(无)'}

# 知识点
${knowledgePoint || '(无)'}

# 正文片段(前 600 字)
${(textContent || '').slice(0, 600) || '(无)'}

可选值(从 9 个里选一个最贴切的):
- 数学(方程/不等式/函数/几何/概率/统计)
- 物理(力学/电学/光学/热学/波动/动量/能量)
- 化学(元素/化合物/反应/氧化还原/化学键/有机)
- 语文(文言文/古诗/阅读理解/字词/修辞/作文)
- 英语(语法/词汇/时态/从句/阅读/完形)
- 生物(细胞/遗传/基因/光合/呼吸/神经/免疫,植物生理/矿质/培养液/生态系统/微生物)
- 历史(朝代/事件/人物/战争/制度/文明/史料)
- 地理(地形/气候/洋流/人口/城市/地图/板块)
- 科学(综合小学/初中理科,跨学科基础)

**严格只输出一个词,从上面 9 个里选。不要输出任何解释、标点或引号。**`

  // 优先 Agnes 文本(便宜稳定)
  if (AGNES_KEY) {
    try {
      const raw = await callTextAPI({
        apiKey: AGNES_KEY,
        baseUrl: AGNES_BASE,
        model: 'agnes-2.5-flash',
        textPrompt: prompt,
      })
      const subject = String(raw || '').trim().replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 4)
      if (VALID_SUBJECTS.includes(subject)) {
        // 二次校验: LLM 输出的 subject 在本地 0 命中 → 不可信(可能 LLM 把生物判成数学),
        // 若本地有 fallback 之外的高分学科,优先用本地
        if (localBest && localBest !== fallback && localBestScore >= 1 && localScores[subject] === 0) {
          console.warn(`[detectSubjectByLLM] LLM 输出=${subject},但本地 0 命中;本地高分=${localBest}=${localBestScore},信任本地`)
          return localBest
        }
        return subject
      }
      console.warn(`[detectSubjectByLLM] Agnes 输出非法,值="${subject}",回 fallback`)
      return fallback
    } catch (err) {
      console.warn('[detectSubjectByLLM] Agnes 调用失败:', err.message)
      return fallback
    }
  }

  return fallback
}

// ─── 旧版关键词投票(保留作为离线/低成本兜底,不再默认使用)────────────
export function detectSubject(text = '', formulaCount = 0, fallback = '数学') {
  const t = String(text || '')
  if (!t && !formulaCount) return fallback
  const scores = {}
  for (const [subject, kws] of Object.entries(SUBJECT_KEYWORDS)) {
    let s = 0
    for (const kw of kws) if (t.includes(kw)) s += 1
    scores[subject] = s
  }
  // 公式密集 → 数学加分(强信号)
  if (formulaCount >= 5) scores['数学'] = (scores['数学'] || 0) + 3
  else if (formulaCount >= 2) scores['数学'] = (scores['数学'] || 0) + 1

  let best = fallback
  let bestScore = -1
  for (const [subject, s] of Object.entries(scores)) {
    if (s > bestScore) { bestScore = s; best = subject }
  }
  // 全 0 命中 → 回 fallback(通常是用户在 UI 选的)
  if (bestScore <= 0) return fallback
  return best
}
