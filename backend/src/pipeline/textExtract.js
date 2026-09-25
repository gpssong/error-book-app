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
