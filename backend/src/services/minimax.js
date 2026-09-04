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
- 根号:\\sqrt{a} 或 \\sqrt[n]{a}
- 不等式:\geq / \leq / \neq / \infty
- 区间:[a,+\\infty) 用 [a,+\\infty) 这种 LaTeX 写法
- 自然对数 e:\\mathrm{e} 或 \\sqrt{e} 保持原样
- 复数 i:\\mathrm{i}

textContent 格式:
- 题目描述(题干)+ 四个选项 A./B./C./D.
- 如果是选择题,把题号+题干+4 个选项全部包含进去
- 如果是多个题目,只取第一道完整的(含它的所有选项)
- 公式/符号必须用 LaTeX,中文/数字/字母保持原文
- 不要输出题目之外的任何解释

textContent 示例:
"已知集合 A = {x | x^2 - 2x - 3 \\geq 0},B = {x | \\ln x \\geq \\dfrac{1}{2}},则 A\\cup B = ( )
A. [3,+\\infty)
B. (-\\infty,-1] \\cup [\\sqrt{e},+\\infty)
C. (-\\infty,-1] \\cup [3,+\\infty)
D. [-1,\\sqrt{e}]"

注意:
- 如果 ocrText 为空,以图片为主,不要输出"无法识别"
- 如果 ocrText 中漏字,以图片为准
- 只输出**第一道**完整题目(不要把第二、第三题的内容混进来)

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
    title: String(p.title || '').slice(0, 50) || '未识别',
    knowledgePoint: String(p.knowledgePoint || '').slice(0, 30) || '未知',
    textContent: String(p.textContent || '').trim(),
  }
}
