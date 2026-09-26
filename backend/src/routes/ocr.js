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

import { isTextInConfigured, eraseHandwriting, recognizeText, recognizeFormula } from '../services/textin.js'
import { semanticParseText, visionFallback, detectSubjectByLLM } from '../services/minimax.js'
import { normalizeLatex } from '../utils/latexNormalize.js'
import { extractTitleAndKP, trimToFirstQuestion, formulaSanityCheck, figureRegionFromTextPositions } from '../pipeline/textExtract.js'
import { authMiddleware } from '../middleware/auth.js'
import { checkDailyLimit } from '../middleware/paywall.js'

const router = Router()

// ─── 题目插图:归一化 figureRegion 透传给前端裁出 figureBase64 ─────────────
// 设计:后端不裁图(避免引入 sharp 依赖/重建镜像),只把 AI 回传的归一化
// 包围盒 {x,y,w,h} 原样放进 /api/ocr 响应的 figureRegion 字段;
// 前端拿到后在【已裁剪的单题图】内部用现成 cropImage 再裁一次,得到题目插图
// figureBase64,随 createError 入库。无图/解析失败 → figureRegion=''。

router.get('/status', (_req, res) => {
  res.json({
    textin: process.env.TEXTIN_APP_ID ? 'configured' : 'not_configured',
    visionModel: process.env.VISION_MODEL || 'agnes-2.5-flash',
    minimax: process.env.MINIMAX_API_KEY ? 'configured' : 'not_configured',
  })
})

// 需要登录 + 付费额度检查
router.post('/', authMiddleware, checkDailyLimit({ action: 'ocr' }), async (req, res) => {
  try {
    const { imageBase64, subject = '数学', cleanHandwriting = false, forceTextPath = false } = req.body || {}

    if (!imageBase64) {
      return res.status(400).json({ error: '需要 imageBase64 参数' })
    }

    const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '')
    if (!cleanBase64 || cleanBase64.length < 200) {
      return res.status(400).json({ error: '图片数据无效或过小' })
    }

    // P5(2026-09-26): 前端 config.html 配的 TextIn Key 通过 X-TextIn-App-Id / X-TextIn-Secret-Code 透传
    // 之前后端从 .env 读,前端传的 header 永远被丢弃 → 用户在 config.html 配 key 是死开关
    const textinOpts = {
      appId: req.headers['x-textin-app-id'],
      secretCode: req.headers['x-textin-secret-code'],
    }

    const imageBuffer = Buffer.from(cleanBase64, 'base64')
    const imageSizeKB = imageBuffer.length / 1024
    console.log(`[OCR] 收到图片,大小: ${imageSizeKB.toFixed(1)} KB, 学科: ${subject}, 去手写: ${cleanHandwriting}`)

    if (!isTextInConfigured(textinOpts)) {
      return res.status(500).json({
        error: '后端未配置 TextIn 凭证,无法启用专业 OCR。请在 backend/.env 配置 TEXTIN_APP_ID/TEXTIN_SECRET_CODE,或在 config.html 添加 OCR Key',
      })
    }

    // ─── ① 可选：手写擦除 ────────────────────────────────────────────────
    let workingBuffer = imageBuffer
    let handwritingErased = false
    if (cleanHandwriting) {
      try {
        workingBuffer = await eraseHandwriting(imageBuffer, { crop: 1, doc_direction: 4, ...textinOpts })
        handwritingErased = true
        console.log(`[OCR] 手写擦除完成: ${workingBuffer.length} bytes`)
      } catch (err) {
        console.warn('[OCR] 手写擦除失败,继续原图识别:', err.message)
        workingBuffer = imageBuffer
      }
    }

    // ─── ② 文字识别 + 专业公式识别(并行,2026-09-26) ────────────
    // 之前只用 recognizeText(通用 OCR + recognize_graphics=1),公式部分经常不稳;
    // 现在并行调 recognizeFormula(/v2/recognize/formula, 专门做数学公式 → LaTeX),
    // 把权威公式 LaTeX 喂给后续的 visionFallback 作为锚点,防止视觉模型脑补常见套路
    const [textResult, formulaResult] = await Promise.allSettled([
      recognizeText(workingBuffer, { recognize_graphics: 1, ...textinOpts }),
      recognizeFormula(workingBuffer, { mode: 'formula_and_text', ...textinOpts }),
    ])

    const textLines = textResult.status === 'fulfilled' ? textResult.value.lines : []

    if (textResult.status === 'rejected') {
      console.warn('[OCR] 文字识别失败:', textResult.reason?.message)
    }

    // 公式行(LaTeX 格式已嵌入 text)+ 普通文字行
    const formulaLines = textLines.filter((l) => l.type === 'formula' && l.text)
    const textOnlyLines = textLines.filter((l) => l.type !== 'formula' && l.text)

    const ocrText = textLines.map((l) => l.text).filter(Boolean).join('\n')
    // 权威公式 LaTeX: 优先用专业公式端点的结果;若失败回退到通用 OCR 公式行
    const formulaLatex =
      formulaResult.status === 'fulfilled' && formulaResult.value.formulas.length > 0
        ? formulaResult.value.formulas.map((f) => f.latex).filter(Boolean)
        : formulaLines.map((l) => l.text)
    if (formulaResult.status === 'rejected') {
      console.warn('[OCR] 专业公式识别失败,回退到通用 OCR 公式行:', formulaResult.reason?.message)
    }

    // v47+: 收集所有 lines[].position,用于后端 figureRegion fallback
    // (TextIn 文字 + 公式端点都返回 4 顶点归一化坐标)
    const textPositions = textLines.map((l) => l.position).filter((p) => Array.isArray(p) && p.length === 8)
    const formulaPositions =
      formulaResult.status === 'fulfilled'
        ? formulaResult.value.formulas.map((f) => f.position).filter((p) => Array.isArray(p) && p.length === 8)
        : []
    const allPositions = [...textPositions, ...formulaPositions]

    console.log(`[OCR] 文字行数: ${textOnlyLines.length}, 公式行: ${formulaLines.length}, 权威LaTeX: ${formulaLatex.length}, 文字bbox: ${textPositions.length}, 公式bbox: ${formulaPositions.length}`)

    // v47+: 当 AI 视觉模型未给出 figureRegion 时,后端兜底用文字/公式 bbox 求补集
    // (几何立体题 figureRegion 命中率仅 1.4%,但 bbox 是真实坐标,补集 = 示意图)
    function fallbackFigureRegion() {
      if (allPositions.length < 2) return ''
      const fb = figureRegionFromTextPositions(allPositions, 1, 1)
      if (!fb) return ''
      return JSON.stringify(fb)
    }

    // ─── P6(2026-09-26): 「重试识别」按钮强制走纯文本路径 ─────────
    // 视觉模型在代数最小值等高频套路题上会脑补常见模式(a+1/a+C),
    // 用户在前端识别完成页点「换纯文本通道重试」时跳过 visionFallback,
    // 走 TextIn OCR + LLM 文本合并作为对照
    if (forceTextPath) {
      console.log(`[OCR] forceTextPath=true,跳过视觉兜底,纯文本路径`)
    }

    // ─── ③ 数学题走视觉兜底,纯文字走 LLM(2026-09-05 调整) ─────────
    // 关键洞察:LLM 文本合并看不到原图,会"脑补"内容(如把 √(ab) 错读成 6)
    // 数学题必须用 vision 模型直接看图,避免 LLM 瞎补
    const hasFormula = formulaLines.length >= 1 || formulaLatex.length >= 1
    if (hasFormula && !forceTextPath) {
      console.log(`[OCR] 检测到 ${formulaLines.length} 条公式,数学题走视觉兜底`)
      try {
        const visionParsed = await visionFallback({ imageBase64, subject, formulaLatex })
        if (visionParsed && visionParsed.textContent) {
          console.log(`[OCR] 视觉兜底成功: title="${visionParsed.title}"`)
          // ─── 公式 sanity 校验(2026-09-26): 拦视觉模型「模板化幻觉」──────
          // 例如 [B] √(x²+4)+4/√(x²+4) 被压成 "a+1/a+4" 这种脑补常见套路
          const sanity = formulaSanityCheck(visionParsed.textContent)
          if (!sanity.ok) {
            console.warn(`[OCR] 视觉结果不通过 sanity: reason=${sanity.reason} metric=${sanity.metric},降级纯文本路径`)
            // 走 fallthrough 到 semanticParseText(LLM 文本合并),失败再视觉再读
            // 重复读图通常给同一结果,这里改走文本路径作为对照
            const textParsed = await semanticParseText({ ocrText, formulas: formulaLatex, subject })
            if (textParsed && textParsed.title && textParsed.textContent) {
              const textSanity = formulaSanityCheck(textParsed.textContent)
              if (textSanity.ok || !sanity.ok) {
                // 任一通过 → 用文本路径(更稳,因为 TextIn 公式 LaTeX 已校验过)
                console.log(`[OCR] 文本路径兜底成功: title="${textParsed.title}" sanity=${textSanity.ok}`)
                const llmSubject2 = await detectSubjectByLLM({
                  title: textParsed.title,
                  knowledgePoint: textParsed.knowledgePoint,
                  textContent: textParsed.textContent,
                  fallback: subject,
                })
                return res.json({
                  title: textParsed.title,
                  knowledgePoint: textParsed.knowledgePoint || '未知',
                  textContent: textParsed.textContent,
                  sourceText: textParsed.sourceText || '',
                  figureRegion: textParsed.figureRegion || fallbackFigureRegion(),
                  subject: llmSubject2,
                  detectedSubject: llmSubject2,
                  detail: {
                    ocrSuccess: true,
                    handwritingErased,
                    textLineCount: textLines.length,
                    formulaCount: formulaLatex.length,
                    pipeline: 'textin+vision-rejected+text-fallback',
                    aiProvider: textParsed._provider || 'unknown',
                    subjectDetection: 'llm',
                    visionRejected: sanity.reason,
                  },
                })
              }
            }
            // 两条都不可信: 仍返回视觉结果(用户至少能看见一个结果),但 detail 标记
            console.warn(`[OCR] 文本路径也无法修复 vision 幻觉,保留视觉结果`)
          } else {
            // LLM 按知识点判断学科(基于 AI 解析出的 title/knowledgePoint/textContent)
            const llmSubject = await detectSubjectByLLM({
              title: visionParsed.title,
              knowledgePoint: visionParsed.knowledgePoint,
              textContent: visionParsed.textContent,
              fallback: subject,
            })
            if (llmSubject !== subject) {
              console.log(`[OCR] LLM 学科分类: 用户=${subject} → 检测=${llmSubject}`)
            }
            return res.json({
              title: visionParsed.title,
              knowledgePoint: visionParsed.knowledgePoint || '未知',
              textContent: visionParsed.textContent,
              sourceText: visionParsed.sourceText || '',
              figureRegion: visionParsed.figureRegion || fallbackFigureRegion(),
              subject: llmSubject,
              detectedSubject: llmSubject,
              detail: {
                ocrSuccess: true,
                handwritingErased,
                textLineCount: textLines.length,
                formulaCount: formulaLatex.length,
                pipeline: 'textin+vision-primary',
                aiProvider: 'vision-primary',
                subjectDetection: 'llm',
              },
            })
          }
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

          // LLM 按知识点判断学科(基于 AI 解析出的 title/knowledgePoint/textContent)
          const llmSubject = await detectSubjectByLLM({
            title: parsed.title,
            knowledgePoint: parsed.knowledgePoint,
            textContent: parsed.textContent,
            fallback: subject,
          })
          if (llmSubject !== subject) {
            console.log(`[OCR] LLM 学科分类: 用户=${subject} → 检测=${llmSubject}`)
          }

          // ─── 低质量检测(2026-09-05 + 2026-09-26 扩):触发自动视觉兜底 ─────
          // 触发条件:textContent 过短(<60字),或缺少 4 个选项,
          // 或公式 sanity 不通过(模板化幻觉,如 4 选项都套 a+1/a+C)
          const text = parsed.textContent
          const optionCount = (text.match(/^[A-D][\.\.．、]/gm) || []).length
          const sanity = formulaSanityCheck(text)
          const isLowQuality = text.length < 60 || optionCount < 4 || !sanity.ok
          if (isLowQuality) {
            console.warn(`[OCR] 检测到低质量输出(len=${text.length}, options=${optionCount}, sanity=${sanity.ok ? 'ok' : sanity.reason}),启动视觉兜底`)
            try {
              const visionParsed = await visionFallback({ imageBase64, subject, formulaLatex })
              if (visionParsed && visionParsed.textContent) {
                console.log(`[OCR] 视觉兜底成功,覆盖原结果: title="${visionParsed.title}"`)
                const visionLlmSubject = await detectSubjectByLLM({
                  title: visionParsed.title,
                  knowledgePoint: visionParsed.knowledgePoint,
                  textContent: visionParsed.textContent,
                  fallback: llmSubject,
                })
                return res.json({
                  title: visionParsed.title,
                  knowledgePoint: visionParsed.knowledgePoint || '未知',
                  textContent: visionParsed.textContent,
                  sourceText: visionParsed.sourceText || '',
                  figureRegion: visionParsed.figureRegion || fallbackFigureRegion(),
                  subject: visionLlmSubject,
                  detectedSubject: visionLlmSubject,
                  detail: {
                    ocrSuccess: true,
                    handwritingErased,
                    textLineCount: textLines.length,
                    formulaCount: formulaLatex.length,
                    pipeline: 'textin+ai-text+vision-fallback',
                    aiProvider: 'vision-fallback',
                    subjectDetection: 'llm',
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
          sourceText: parsed.sourceText || '',
          figureRegion: parsed.figureRegion || fallbackFigureRegion(),
          subject: llmSubject,
          detectedSubject: llmSubject,
          detail: {
            ocrSuccess: true,
            handwritingErased,
            textLineCount: textLines.length,
            formulaCount: formulaLatex.length,
            pipeline: 'textin+ai-text',
            aiProvider: parsed._provider || 'unknown',
            subjectDetection: 'llm',
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
      // 快速路径没有 AI 解析,直接按知识点用 LLM 再判断一次学科
      const directLlmSubject = await detectSubjectByLLM({
        title: heurTitle,
        knowledgePoint: heurKP,
        textContent: normalizedText,
        fallback: subject,
      })
      return res.json({
        title: heurTitle,
        knowledgePoint: heurKP,
        textContent: normalizedText,
        sourceText: '',
        subject: directLlmSubject,
        detectedSubject: directLlmSubject,
        detail: {
          ocrSuccess: true,
          handwritingErased,
          textLineCount: textLines.length,
          formulaCount: formulaLatex.length,
          pipeline: 'textin-direct',
          subjectDetection: 'llm',
        },
      })
    }

    // ─── ④ 兜底：Agnes AI 直接视觉读图 ──────────────────────────────────
    try {
      const parsed = await visionFallback({ imageBase64, subject })
      if (parsed && parsed.title && parsed.textContent) {
        console.log(`[OCR] 视觉兜底成功: title="${parsed.title}"`)
        // 视觉兜底也按知识点 LLM 判学科
        const visionLlmSubject = await detectSubjectByLLM({
          title: parsed.title,
          knowledgePoint: parsed.knowledgePoint,
          textContent: parsed.textContent,
          fallback: subject,
        })
        return res.json({
          title: parsed.title,
          knowledgePoint: parsed.knowledgePoint || '未知',
          textContent: parsed.textContent,
          sourceText: parsed.sourceText || '',
          figureRegion: parsed.figureRegion || fallbackFigureRegion(),
          subject: visionLlmSubject,
          detectedSubject: visionLlmSubject,
          detail: {
            ocrSuccess: true,
            handwritingErased,
            textLineCount: 0,
            formulaCount: 0,
            pipeline: 'vision-fallback',
            subjectDetection: 'llm',
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

export default router