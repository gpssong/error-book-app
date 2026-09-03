/**
 * OCR 路由 - 拍照识题
 *
 * 端到端流水线（前端预处理 + TextIn + AI 语义解析）:
 *   浏览器端 (imagePreprocess.ts):
 *     ① EXIF 自动旋转
 *     ② 去白边（bbox 自动裁剪）
 *     ③ 灰度化 + 对比度增强
 *     ④ 去手写（连通域分析，可选）
 *   服务端（本文件）:
 *     ⑤ TextIn.eraseHandwriting()   ← 专业去手写（试卷模式）
 *     ⑥ TextIn.recognizeFormula()   ← 数学公式 → LaTeX
 *     ⑦ TextIn.recognizeText()      ← 通用文字 + 版面分析
 *     ⑧ MiniMax-M3 语义解析         ← title / knowledgePoint / textContent
 *
 * POST /api/ocr        - 主入口
 * GET  /api/ocr/status - 检查 TextIn 是否配置
 */
import { Router } from 'express'
import dotenv from 'dotenv'
dotenv.config()

import {
  isTextInConfigured,
  ocrPipeline,
  eraseHandwriting,
} from '../services/textin.js'
import { semanticParse } from '../services/minimax.js'

const router = Router()

/**
 * 检查服务配置状态
 */
router.get('/status', (_req, res) => {
  res.json({
    textin: isTextInConfigured() ? 'configured' : 'not_configured',
    minimax: process.env.MINIMAX_API_KEY ? 'configured' : 'not_configured',
    pipeline: ['auto-rotate', 'crop-margin', 'gray-scale',
               'inpaint-handwriting (frontend)',
               'textin-erase', 'textin-formula', 'textin-text',
               'MiniMax-semantic'],
  })
})

/**
 * 主入口 - 完整 OCR 流水线
 *
 * 请求体:
 * {
 *   imageBase64: string,    // 必填,data:image/jpeg;base64,... 形式
 *   subject?: string,       // 选填,默认为 "数学"
 *   skipHandwritingErase?: boolean,  // 选填,跳过 TextIn 去手写
 * }
 *
 * 响应:
 * {
 *   title: string,
 *   knowledgePoint: string,
 *   textContent: string,    // 含 LaTeX 公式
 *   subject: string,
 *   detail: {
 *     handwritingErased: boolean,
 *     formulas: Array<{latex: string, type: string}>,
 *     cleanedImageBase64: string,  // 擦除手写后的图,可用于预览
 *   }
 * }
 */
router.post('/', async (req, res) => {
  try {
    const { imageBase64, subject = '数学', skipHandwritingErase = false } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '需要 imageBase64 参数' })
    }

    // 解析 base64 → Buffer
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(cleanBase64, 'base64')

    console.log(`[OCR] 收到图片,大小: ${(imageBuffer.length / 1024).toFixed(1)} KB`)

    // ─── ① TextIn 去手写（专业试卷模式） ────────────────────────────────
    let processedBuffer = imageBuffer
    let handwritingErased = false
    let cleanedImageBase64 = imageBase64

    if (isTextInConfigured() && !skipHandwritingErase) {
      try {
        processedBuffer = await eraseHandwriting(imageBuffer, {
          crop: 1,         // 自动切边
          doc_direction: 4 // 自动方向转正
        })
        handwritingErased = true
        cleanedImageBase64 = `data:image/png;base64,${processedBuffer.toString('base64')}`
        console.log(`[OCR] 手写擦除完成,新大小: ${(processedBuffer.length / 1024).toFixed(1)} KB`)
      } catch (err) {
        console.warn('[OCR] 手写擦除失败,继续使用原图:', err.message)
      }
    } else if (!isTextInConfigured()) {
      console.warn('[OCR] TextIn 未配置,跳过专业去手写步骤（仅依赖前端预处理）')
    }

    // ─── ② TextIn 完整 OCR（公式 + 文字） ──────────────────────────────
    let formulas = []
    let textLines = []
    let ocrSuccess = false

    if (isTextInConfigured()) {
      try {
        const pipelineResult = await ocrPipeline(processedBuffer)
        formulas = pipelineResult.formulas
        textLines = pipelineResult.textLines
        ocrSuccess = true
        console.log(`[OCR] TextIn 识别完成,公式 ${formulas.length} 条,文字 ${textLines.length} 行`)
      } catch (err) {
        console.warn('[OCR] TextIn 流水线失败,降级到 MiniMax Vision 直接读图:', err.message)
      }
    }

    // ─── ③ MiniMax-M3 语义解析 ─────────────────────────────────────────
    // 把擦除后的图 + TextIn OCR 文本 + 公式 LaTeX 一起喂给 LLM
    let parsed = null

    try {
      parsed = await semanticParse({
        imageBase64: cleanedImageBase64,
        ocrText: textLines.map((l) => l.text).join('\n'),
        formulas: formulas.map((f) => f.latex).filter(Boolean),
        subject,
      })

      if (!parsed || !parsed.title || !parsed.textContent) {
        throw new Error('MiniMax 返回结构不完整')
      }
    } catch (err) {
      console.warn('[OCR] MiniMax 语义解析失败,降级到 Agnes AI:', err.message)
      // 降级: 用 Agnes AI 直接读图（保留旧实现）
      parsed = await fallbackAgnesRecognize(cleanedImageBase64, subject)
    }

    res.json({
      title: parsed.title,
      knowledgePoint: parsed.knowledgePoint || '未知',
      textContent: parsed.textContent,
      subject,
      detail: {
        handwritingErased,
        ocrSuccess,
        formulas: formulas.map((f) => ({ latex: f.latex, type: f.type })),
        textLineCount: textLines.length,
        cleanedImageBase64: handwritingErased ? cleanedImageBase64 : undefined,
      },
    })
  } catch (err) {
    console.error('[OCR] 失败:', err)
    res.status(500).json({ error: err.message || 'OCR 识别失败' })
  }
})

// ─── 降级方案: Agnes AI 直接读图 ────────────────────────────────────────────
async function fallbackAgnesRecognize(imageBase64, subject) {
  const AGNES_API_KEY = process.env.AI_API_KEY || ''
  const AGNES_API_BASE = process.env.AI_API_BASE || 'https://apihub.agnes-ai.com/v1'
  const VISION_MODEL = process.env.VISION_MODEL || 'agnes-2.5-pro-alpha'

  const prompt = `你是专业的数学老师,擅长 OCR 识别理科题目。请识别图片中的题目,提取:
1. title: 题目标题(如"二次函数顶点坐标求解")
2. knowledgePoint: 核心知识点(如"二次函数")
3. textContent: 完整题目文字(保留数学符号如 x²、≥ 等)

只返回 JSON:
{
  "title": "...",
  "knowledgePoint": "...",
  "textContent": "..."
}`

  const response = await fetch(`${AGNES_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGNES_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageBase64 } },
        ],
      }],
      max_tokens: 600,
    }),
  })

  if (!response.ok) throw new Error(`Agnes API ${response.status}`)

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''
  const parsed = extractJSON(content)

  if (parsed) {
    return {
      title: parsed.title || '未识别',
      knowledgePoint: parsed.knowledgePoint || '未知',
      textContent: parsed.textContent || content,
    }
  }
  return { title: content.slice(0, 50) || '未识别', knowledgePoint: '未知', textContent: content }
}

function extractJSON(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) { try { return JSON.parse(fenced[1]) } catch {} }
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (text[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch {} } }
  }
  return null
}

export default router