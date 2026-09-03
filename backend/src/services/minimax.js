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

const MINIMAX_KEY = process.env.MINIMAX_API_KEY || ''
const MINIMAX_BASE = process.env.MINIMAX_API_BASE || 'https://api.minimax.io/v1'
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3'

const AGNES_KEY = process.env.AI_API_KEY || ''
const AGNES_BASE = process.env.AI_API_BASE || 'https://apihub.agnes-ai.com/v1'
const AGNES_VISION = process.env.VISION_MODEL || 'agnes-2.5-pro-alpha'

const SYSTEM_PROMPT = `你是一位资深中学教师,擅长从 OCR 碎片化结果中还原题目原貌。

你的任务:
1. 接收三部分输入:
   - ocrText: TextIn OCR 识别出的所有文字行(顺序按版面)
   - formulas: TextIn 公式识别出的 LaTeX 公式列表
   - imageBase64: 擦除手写后的题目原图(作为参考)
2. 还原出结构化题目:
   - title: 简短题目标题(≤15 字,如"二次函数顶点坐标求解")
   - knowledgePoint: 核心知识点(如"二次函数"、"动量守恒")
   - textContent: 完整题目文字,LaTeX 公式用 $...$ 或 $$...$$ 包裹

注意:
- textContent 必须保留所有题目文字 + 公式(公式用 LaTeX)
- 如果 ocrText 中漏字,以图片为准
- 如果有多个题目,只提取第一道完整的

严格返回 JSON,无任何其他文字:
{
  "title": "...",
  "knowledgePoint": "...",
  "textContent": "..."
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

// ─── 工具函数 ──────────────────────────────────────────────────────────────
function normalizeParsed(p) {
  return {
    title: String(p.title || '').slice(0, 50) || '未识别',
    knowledgePoint: String(p.knowledgePoint || '').slice(0, 30) || '未知',
    textContent: String(p.textContent || '').trim(),
  }
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