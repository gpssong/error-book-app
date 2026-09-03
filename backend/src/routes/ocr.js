/**
 * OCR 路由
 *
 * POST /api/ocr        - 识别题目图片，提取标题/知识点/题目内容
 */
import { Router } from 'express'
import dotenv from 'dotenv'
dotenv.config()

const router = Router()

const AGNES_API_KEY = process.env.AI_API_KEY || ''
const AGNES_API_BASE = process.env.AI_API_BASE || 'https://apihub.agnes-ai.com/v1'
const VISION_MODEL = process.env.VISION_MODEL || 'agnes-2.5-pro-alpha'

/**
 * 从 AI 响应中安全提取 JSON 对象
 * 支持：
 * - 直接 JSON
 * - ```json ... ``` markdown 代码块
 * - 文本里嵌入的 { ... } 块（取第一个完整匹配的）
 */
function extractJSON(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch {}

  // 提取 ```json ... ``` 块
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch {}
  }

  // 提取首个完整的 { ... } 块（处理嵌套括号）
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) {
        const start = i
        depth = 1
      } else {
        depth++
      }
    } else if (text[i] === '}') {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch {}
      }
    }
  }

  return null
}

/**
 * 调用 Agnes Vision API 识别图片中的题目
 */
async function recognizeImage(base64Image) {
  const prompt = `你是一位专业的数学老师，擅长 OCR 识别理科题目。请识别图片中的题目，提取：
1. title: 简短题目标题（如"二次函数顶点坐标求解"）
2. knowledgePoint: 核心知识点（如"二次函数"）
3. textContent: 完整题目文字（保留数学符号如 x²、≥ 等）

只返回 JSON，不要有任何其他文字：
{
  "title": "题目标题",
  "knowledgePoint": "知识点",
  "textContent": "完整题目文字"
}`

  const response = await fetch(`${AGNES_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AGNES_API_KEY}`,
    },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: base64Image } },
        ] },
      ],
      max_tokens: 300,
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Vision API 错误 ${response.status}: ${errText.slice(0, 200)}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content?.trim() || ''

  const parsed = extractJSON(content)
  if (parsed && parsed.title && parsed.textContent) {
    return {
      title: parsed.title,
      knowledgePoint: parsed.knowledgePoint || '未知',
      textContent: parsed.textContent,
    }
  }

  // 降级：用纯文本作为题目内容
  console.warn('OCR 返回非 JSON 格式，使用原始内容:', content.slice(0, 100))
  return {
    title: content.slice(0, 50) || '未识别',
    knowledgePoint: '未知',
    textContent: content,
  }
}

router.post('/', async (req, res) => {
  try {
    const { imageBase64, subject } = req.body

    if (!imageBase64) {
      return res.status(400).json({ error: '需要 imageBase64 参数' })
    }

    // 去除 data URI 前缀
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '')

    const result = await recognizeImage(`data:image/jpeg;base64,${cleanBase64}`)

    res.json({
      ...result,
      subject: subject || '数学',
    })
  } catch (err) {
    console.error('OCR 失败:', err.message)
    res.status(500).json({ error: err.message || 'OCR 识别失败' })
  }
})

export default router
