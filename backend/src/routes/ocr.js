/**
 * OCR 路由 - 拍照识题
 *
 * 端到端流水线（成熟方案）：
 *   ① 接收 base64 → Buffer
 *   ② (可选) TextIn 手写擦除 → 干净印刷图
 *   ③ TextIn 文字识别 + 公式识别（并行,拿版面+LaTeX）
 *   ④ 用 MiniMax-M3 / Agnes AI 把碎片化结果融合成结构化题目
 *   ⑤ 任意环节失败 → 用 Agnes AI 视觉读图直接兜底
 *
 * 端点:
 *   POST /api/ocr        - 主入口
 *   GET  /api/ocr/status - 检查配置状态
 */
import { Router } from 'express'
import dotenv from 'dotenv'
dotenv.config()

import { isTextInConfigured, eraseHandwriting, recognizeText } from '../services/textin.js'
import { semanticParseText, visionFallback } from '../services/minimax.js'
import { normalizeLatex } from '../utils/latexNormalize.js'

const router = Router()

router.get('/status', (_req, res) => {
  res.json({
    textin: process.env.TEXTIN_APP_ID ? 'configured' : 'not_configured',
    visionModel: process.env.VISION_MODEL || 'agnes-2.5-pro-alpha',
    minimax: process.env.MINIMAX_API_KEY ? 'configured' : 'not_configured',
  })
})

router.post('/', async (req, res) => {
  try {
    const { imageBase64, subject = '数学', cleanHandwriting = false } = req.body || {}

    if (!imageBase64) {
      return res.status(400).json({ error: '需要 imageBase64 参数' })
    }

    const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '')
    if (!cleanBase64 || cleanBase64.length < 200) {
      return res.status(400).json({ error: '图片数据无效或过小' })
    }

    const imageBuffer = Buffer.from(cleanBase64, 'base64')
    const imageSizeKB = imageBuffer.length / 1024
    console.log(`[OCR] 收到图片,大小: ${imageSizeKB.toFixed(1)} KB, 学科: ${subject}, 去手写: ${cleanHandwriting}`)

    if (!isTextInConfigured()) {
      return res.status(500).json({
        error: '后端未配置 TextIn 凭证,无法启用专业 OCR。请在 backend/.env 配置 TEXTIN_APP_ID/TEXTIN_SECRET_CODE',
      })
    }

    // ─── ① 可选：手写擦除 ────────────────────────────────────────────────
    let workingBuffer = imageBuffer
    let handwritingErased = false
    if (cleanHandwriting) {
      try {
        workingBuffer = await eraseHandwriting(imageBuffer, { crop: 1, doc_direction: 4 })
        handwritingErased = true
        console.log(`[OCR] 手写擦除完成: ${workingBuffer.length} bytes`)
      } catch (err) {
        console.warn('[OCR] 手写擦除失败,继续原图识别:', err.message)
        workingBuffer = imageBuffer
      }
    }

    // ─── ② 文字识别（公式已包含在 type=formula 的 lines 里,无需额外调用） ────
    const [textResult] = await Promise.allSettled([
      recognizeText(workingBuffer, { recognize_graphics: 1 }),
    ])

    const textLines = textResult.status === 'fulfilled' ? textResult.value.lines : []

    if (textResult.status === 'rejected') {
      console.warn('[OCR] 文字识别失败:', textResult.reason?.message)
    }

    // 公式行(LaTeX 格式已嵌入 text)+ 普通文字行
    const formulaLines = textLines.filter((l) => l.type === 'formula' && l.text)
    const textOnlyLines = textLines.filter((l) => l.type !== 'formula' && l.text)

    const ocrText = textLines.map((l) => l.text).filter(Boolean).join('\n')
    const formulaLatex = formulaLines.map((l) => l.text)

    console.log(`[OCR] 文字行数: ${textOnlyLines.length}, 公式行: ${formulaLines.length}`)

    // ─── ③ 数学题走视觉兜底,纯文字走 LLM(2026-09-05 调整) ─────────
    // 关键洞察:LLM 文本合并看不到原图,会"脑补"内容(如把 √(ab) 错读成 6)
    // 数学题必须用 vision 模型直接看图,避免 LLM 瞎补
    const hasFormula = formulaLines.length >= 1 || formulaLatex.length >= 1
    if (hasFormula) {
      console.log(`[OCR] 检测到 ${formulaLines.length} 条公式,数学题走视觉兜底`)
      try {
        const visionParsed = await visionFallback({ imageBase64, subject })
        if (visionParsed && visionParsed.textContent) {
          console.log(`[OCR] 视觉兜底成功: title="${visionParsed.title}"`)
          return res.json({
            title: visionParsed.title,
            knowledgePoint: visionParsed.knowledgePoint || '未知',
            textContent: visionParsed.textContent,
            subject,
            detail: {
              ocrSuccess: true,
              handwritingErased,
              textLineCount: textLines.length,
              formulaCount: formulaLatex.length,
              pipeline: 'textin+vision-primary',
              aiProvider: 'vision-primary',
            },
          })
        }
      } catch (ve) {
        console.warn('[OCR] 视觉主路径失败,降级到 LLM 文本合并:', ve.message)
        // fallthrough 到 LLM 路径
      }
    }

    // ─── ③ 默认走 AI 文本合并:让 LLM 修正 OCR 字符错误并补全 LaTeX ─────────
    // 流程:OCR 原始行 + 公式 LaTeX → LLM(Agnes text-only)→ 修正后 JSON
    if (ocrText.length > 0 || formulaLatex.length > 0) {
      try {
        const parsed = await semanticParseText({
          ocrText,
          formulas: formulaLatex,
          subject,
        })
        if (parsed && parsed.title && parsed.textContent) {
          console.log(`[OCR] AI 文本合并成功: title="${parsed.title}", provider=${parsed._provider || '?'}`)

          // ─── 低质量检测(2026-09-05):触发自动视觉兜底 ───────────────
          // 触发条件:textContent 过短(<60字),或缺少 4 个选项
          const text = parsed.textContent
          const optionCount = (text.match(/^[A-D][\.\.．、]/gm) || []).length
          const isLowQuality = text.length < 60 || optionCount < 4
          if (isLowQuality) {
            console.warn(`[OCR] 检测到低质量输出(len=${text.length}, options=${optionCount}),启动视觉兜底`)
            try {
              const visionParsed = await visionFallback({ imageBase64, subject })
              if (visionParsed && visionParsed.textContent) {
                console.log(`[OCR] 视觉兜底成功,覆盖原结果: title="${visionParsed.title}"`)
                return res.json({
                  title: visionParsed.title,
                  knowledgePoint: visionParsed.knowledgePoint || '未知',
                  textContent: visionParsed.textContent,
                  subject,
                  detail: {
                    ocrSuccess: true,
                    handwritingErased,
                    textLineCount: textLines.length,
                    formulaCount: formulaLatex.length,
                    pipeline: 'textin+ai-text+vision-fallback',
                    aiProvider: 'vision-fallback',
                  },
                })
              }
            } catch (ve) {
              console.warn('[OCR] 视觉兜底失败,保留 LLM 结果:', ve.message)
            }
          }

          return res.json({
            title: parsed.title,
            knowledgePoint: parsed.knowledgePoint || '未知',
            textContent: parsed.textContent,
            subject,
            detail: {
              ocrSuccess: true,
              handwritingErased,
              textLineCount: textLines.length,
              formulaCount: formulaLatex.length,
              pipeline: 'textin+ai-text',
              aiProvider: parsed._provider || 'unknown',
            },
          })
        }
      } catch (err) {
        console.warn('[OCR] AI 文本合并失败,降级快速路径:', err.message)
      }
    } else {
      console.warn('[OCR] TextIn 未识别出任何文字/公式,降级视觉读图')
    }

    // ─── ④ 快速路径兜底:直接用 OCR 原文拼装(可能含字符错误) ──────────
    if (textOnlyLines.length >= 3 && formulaLines.length >= 1) {
      const fullText = textLines.map((l) => l.text).filter(Boolean).join('\n')
      const singleQuestionText = trimToFirstQuestion(fullText)
      const normalizedText = normalizeLatex(singleQuestionText)
      const { title: heurTitle, knowledgePoint: heurKP } = extractTitleAndKP(normalizedText, subject)
      console.log(`[OCR] TextIn 直接返回(AI 失败兜底): title="${heurTitle}"`)
      return res.json({
        title: heurTitle,
        knowledgePoint: heurKP,
        textContent: normalizedText,
        subject,
        detail: {
          ocrSuccess: true,
          handwritingErased,
          textLineCount: textLines.length,
          formulaCount: formulaLatex.length,
          pipeline: 'textin-direct',
        },
      })
    }

    // ─── ④ 兜底：Agnes AI 直接视觉读图 ──────────────────────────────────
    try {
      const parsed = await visionFallback({ imageBase64, subject })
      if (parsed && parsed.title && parsed.textContent) {
        console.log(`[OCR] 视觉兜底成功: title="${parsed.title}"`)
        return res.json({
          title: parsed.title,
          knowledgePoint: parsed.knowledgePoint || '未知',
          textContent: parsed.textContent,
          subject,
          detail: {
            ocrSuccess: true,
            handwritingErased,
            textLineCount: 0,
            formulaCount: 0,
            pipeline: 'vision-fallback',
          },
        })
      }
    } catch (err) {
      console.error('[OCR] 视觉兜底也失败:', err.message)
    }

    // ─── ⑤ 全失败：返回 422 让前端走手动输入 ──────────────────────────────
    return res.status(422).json({
      error: 'OCR 识别失败,请手动输入',
      hint: '可点击"批注"涂抹掉手写内容后重试,或直接在下方输入题目',
    })
  } catch (err) {
    console.error('[OCR] 异常:', err)
    res.status(500).json({ error: err.message || 'OCR 识别失败' })
  }
})

// ─── 启发式：从 TextIn 输出提取标题和知识点 ────────────────────────────
const KP_KEYWORDS = {
  数学: ['集合', '函数', '方程', '不等式', '数列', '三角', '向量', '复数', '概率', '统计', '立体几何', '解析几何', '导数', '积分', '对数', '指数', '二次函数', '一次函数', '反比例', '绝对值', '单调性', '最值'],
  物理: ['力', '运动', '牛顿', '能量', '动量', '电场', '磁场', '电磁', '光学', '热学', '波动', '机械波', '原子'],
  化学: ['元素', '化合物', '反应', '氧化', '还原', '酸碱', '盐', '有机', '化学键', '分子', '原子', '离子', '电解', '沉淀'],
  语文: ['文言文', '现代文', '阅读', '作文', '古诗', '字词', '拼音', '病句', '修辞'],
  英语: ['语法', '词汇', '阅读', '完形', '写作', '时态', '从句', '虚拟语气'],
  生物: ['细胞', '遗传', '基因', '生态', '进化', '光合', '呼吸', '神经', '免疫'],
}

function extractTitleAndKP(text, subject = '数学') {
  const lines = text.split('\n').filter(Boolean)
  const firstLine = lines[0] || ''
  // 标题提取：第一行前 15 字,去掉题号
  const title = firstLine.replace(/^\s*\d+[\.、．]\s*/, '').slice(0, 20) || '未命名题目'

  // 知识点匹配
  const pool = KP_KEYWORDS[subject] || KP_KEYWORDS.数学
  for (const kw of pool) {
    if (text.includes(kw)) return { title, knowledgePoint: kw }
  }

  return { title, knowledgePoint: subject }
}

/**
 * 启发式：把多题文本截断到只含第一道完整选择题
 *
 * 策略:找到第一个题号(1. 或 1．)作为起点,再向后找到 4 个连续的 A./B./C./D. 行
 *      作为终点。如果没找到完整选项,就只截到第二个题号之前。
 */
function trimToFirstQuestion(text) {
  const lines = text.split('\n')

  // 1. 找到第一个题号行(形如"1. "或"1．"或"1、"开头,且后面跟文字)
  const qStartRe = /^\s*1[\.\.．、]\s*\S+/
  let startIdx = lines.findIndex((l) => qStartRe.test(l))
  if (startIdx === -1) startIdx = 0

  // 2. 从 startIdx 之后找第二个题号(2./2．)作为终止位置
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

export default router