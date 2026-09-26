/**
 * OCR 快速路径的启发式提取(从 ocr.js 拆出,便于单测)
 *
 * 当 TextIn 直出但 AI 文本合并/视觉兜底都失败时,用纯启发式从原始 OCR 行
 * 拼出 title + knowledgePoint + textContent。这里是字符串级变换,无 IO,可独立测试。
 */

// 各学科知识点关键词(用于启发式匹配 knowledgePoint)
export const KP_KEYWORDS = {
  数学: ['集合', '函数', '方程', '不等式', '数列', '三角', '向量', '复数', '概率', '统计', '立体几何', '解析几何', '导数', '积分', '对数', '指数', '二次函数', '一次函数', '反比例', '绝对值', '单调性', '最值'],
  物理: ['力', '运动', '牛顿', '能量', '动量', '电场', '磁场', '电磁', '光学', '热学', '波动', '机械波', '原子'],
  化学: ['元素', '化合物', '反应', '氧化', '还原', '酸碱', '盐', '有机', '化学键', '分子', '原子', '离子', '电解', '沉淀'],
  语文: ['文言文', '现代文', '阅读', '作文', '古诗', '字词', '拼音', '病句', '修辞'],
  英语: ['语法', '词汇', '阅读', '完形', '写作', '时态', '从句', '虚拟语气'],
  生物: ['细胞', '遗传', '基因', '生态', '进化', '光合', '呼吸', '神经', '免疫'],
}

/**
 * 从 OCR 文本提取 { title, knowledgePoint }
 * - title: 第一行去掉题号后取前 20 字
 * - knowledgePoint: 在 KP_KEYWORDS[subject] 里命中第一个关键词,否则退回 subject 本身
 */
export function extractTitleAndKP(text, subject = '数学') {
  const lines = text.split('\n').filter(Boolean)
  const firstLine = lines[0] || ''
  const title = firstLine.replace(/^\s*\d+[\.、．]\s*/, '').slice(0, 20) || '未命名题目'

  const pool = KP_KEYWORDS[subject] || KP_KEYWORDS.数学
  for (const kw of pool) {
    if (text.includes(kw)) return { title, knowledgePoint: kw }
  }
  return { title, knowledgePoint: subject }
}

/**
 * 把多题文本截断到只含第一道完整选择题
 *
 * 策略:找到第一个题号(1. 或 1．)作为起点,向后找第二个题号(2./2．…)作为终点。
 * 若没找到后续题号则取到末尾。
 */
export function trimToFirstQuestion(text) {
  const lines = text.split('\n')

  const qStartRe = /^\s*1[\.\.．、]\s*\S+/
  let startIdx = lines.findIndex((l) => qStartRe.test(l))
  if (startIdx === -1) startIdx = 0

  const qNextRe = /^\s*[2-9][\.\.．、]\s*\S+/
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (qNextRe.test(lines[i])) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim()
}

/**
 * 公式内容 sanity 校验(2026-09-26)。
 *
 * 背景:TextIn 公式识别 + Agnes 视觉兜底在「代数最小值」「代数最值」等高频套路题上,
 * 视觉模型经常把 √(x²+4)+4/√(x²+4) / m²+2/√(n(m²−n)) 脑补成常见模式
 * (a+1/a+C / t+1/t+4)或直接猜一个「答案=4 的样子」。
 * 这种幻觉会通过 latexNormalize 的「包装」变成「看起来对的 LaTeX」,前端 KaTeX 不报错,
 * 学科检测器也无感(只看文字不看图)。
 *
 * 校验维度:
 *  1) 选项数 < 4          → 题面残缺,不可信
 *  2) 独立符号种类 < 3    → 4 个选项都用了同一组变量,疑似模板化
 *  3) 4 个选项形状高度相似(去变量后 hash,独立数 ≤ 2) → LLM 套了相似公式
 *  4) 完全没有 LaTeX 结构(无 \sqrt / \frac / ^{...}) → 模型把根号/分式都丢了
 *
 * 通过 → { ok: true }
 * 不通过 → { ok: false, reason: '...', metric: ... },上游应降级重读
 */
export function formulaSanityCheck(textContent) {
  const s = String(textContent || '').trim()
  if (!s) return { ok: false, reason: 'empty', metric: 0 }

  // 1) 选项行
  const optionLines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[A-D][\.\.．、\s]/.test(l))
  if (optionLines.length < 4) {
    return { ok: false, reason: 'options<4', metric: optionLines.length }
  }

  // 2) 独立符号种类(字母/希腊字母,排除 A-D 选项前缀)
  const symbols = new Set()
  for (const opt of optionLines) {
    // 先去掉选项前缀 [A. / [B、 / [C． / [D空格], 再统计字母
    const stripped = opt.replace(/^[A-D][\.\.．、\s]+/, '')
    const ms = stripped.match(/[a-zA-Zα-ωΑ-Ω]+/g) || []
    for (const m of ms) symbols.add(m)
  }
  if (symbols.size < 3) {
    return { ok: false, reason: 'symbols<3(疑似模板化)', metric: symbols.size }
  }

  // 3) 形状 hash(去变量/数字/空白)→ 独立数
  const shapes = optionLines.map((o) =>
    o
      .replace(/[a-zA-Zα-ωΑ-Ω0-9]+/g, 'X')
      .replace(/\\sqrt/g, 'SQ')
      .replace(/\\frac|\\dfrac/g, 'FR')
      .replace(/\s+/g, ''),
  )
  const uniq = new Set(shapes).size
  if (uniq <= 2) {
    return { ok: false, reason: 'options-toosimilar(模板化)', metric: uniq }
  }

  // 4) 完全没有 LaTeX 结构 → 模型把根号/分式/上下标都丢了
  const hasLatexStructure = /\\sqrt|\\frac|\\dfrac|\^\{|_\{|\\\\?[a-zA-Z]+/.test(s)
  if (!hasLatexStructure) {
    return { ok: false, reason: 'no-latex-structure', metric: 0 }
  }

  return { ok: true }
}
