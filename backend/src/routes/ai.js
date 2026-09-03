/**
 * AI 服务路由
 *
 * POST /api/ai/analyze      - AI 讲解错题（错误原因 + 知识点讲解 + 分步教程）
 * POST /api/ai/similar      - 生成同类练习题
 *
 * 支持两种模式：
 * 1. 真实 AI API（OpenAI / Anthropic / 自定义端点）
 * 2. 模拟模式（无 API Key 时使用，开箱即用）
 */
import { Router } from 'express'
import dotenv from 'dotenv'
dotenv.config()

const router = Router()

const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.openai.com/v1'
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini'
const SIMILAR_COUNT = Number(process.env.SIMILAR_QUESTION_COUNT) || 3

/**
 * 调用 AI API（支持 OpenAI 兼容格式）
 * 包含降级逻辑：无 API Key 时返回模拟数据
 */
async function callAI(prompt, systemPrompt = '') {
  // 模拟模式
  if (!AI_API_KEY || AI_API_KEY === 'sk-placeholder') {
    return getMockAIResponse(prompt)
  }

  try {
    const messages = [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: prompt },
    ]

    const response = await fetch(`${AI_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages,
        temperature: 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`AI API 错误: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  } catch (err) {
    console.error('AI 调用失败，使用模拟数据:', err.message)
    return getMockAIResponse(prompt)
  }
}

/**
 * 模拟 AI 响应（用于演示和无 API Key 场景）
 */
function getMockAIResponse(prompt) {
  const isAnalyze = prompt.includes('错误原因') || prompt.includes('分析')
  const isSimilar = prompt.includes('同类题') || prompt.includes('变式题') || prompt.includes('生成')

  if (isAnalyze) {
    return JSON.stringify({
      mistakeReason: '这道题主要错在符号处理上。在计算顶点坐标时，没有正确处理 -b/2a 中的负号，导致 x 坐标计算错误。另外在代入计算 f(-b/2a) 时，展开过程中出现了算术错误。',
      knowledgeExplained: '二次函数顶点公式：对于 f(x) = ax² + bx + c，顶点横坐标 x = -b/(2a)，纵坐标 y = f(-b/(2a))。也可通过配方法将一般式化为顶点式 f(x) = a(x-h)² + k，其中顶点为 (h, k)。',
      stepByStepGuide: '第一步：识别系数 a=1, b=-4, c=3\n第二步：计算顶点横坐标 x = -(-4)/(2×1) = 2\n第三步：代入求纵坐标 y = 2² - 4×2 + 3 = -1\n第四步：得出顶点坐标 (2, -1)，对称轴 x = 2',
    })
  }

  if (isSimilar) {
    return JSON.stringify({
      questions: [
        {
          id: 'sq1',
          content: '已知二次函数 f(x) = 2x² - 4x + 3，求其顶点坐标及对称轴方程。',
          answer: '顶点坐标为 (1, 1)，对称轴为 x = 1',
        },
        {
          id: 'sq2',
          content: '若二次函数图像过点(0,2)且顶点为(1,-1)，求该函数解析式。',
          answer: 'f(x) = 3x² - 6x + 2',
        },
        {
          id: 'sq3',
          content: '二次函数 y = x² + bx + c 的顶点在第二象限，且与x轴有两个交点，判断b、c的符号。',
          answer: 'b > 0，c > 0',
        },
      ],
    })
  }

  return JSON.stringify({ result: '这是模拟 AI 响应，配置真实 API Key 后可获得准确分析。' })
}

/**
 * 从 AI 响应中安全提取 JSON 对象
 * 支持：
 * - 直接 JSON
 * - ```json ... ``` markdown 代码块
 * - 文本里嵌入 JSON
 */
function extractJSON(text) {
  if (!text) return null
  // 先尝试直接 parse
  try {
    return JSON.parse(text)
  } catch {}

  // 提取 ```json ... ``` 块
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) {
    try {
      return JSON.parse(fenced[1])
    } catch {}
  }

  // 提取首个 { ... } 块
  const braceMatch = text.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    try {
      return JSON.parse(braceMatch[0])
    } catch {}
  }

  return null
}
router.post('/analyze', async (req, res) => {
  try {
    const { title, knowledgePoint, subject, textContent } = req.body

    const prompt = `请分析以下${subject}错题：

题目：${title}
知识点：${knowledgePoint}
题目内容：${textContent || '（见图片）'}

请按以下JSON格式返回分析结果（不要有其他文字）：
{
  "mistakeReason": "错误原因分析",
  "knowledgeExplained": "对应知识点讲解",
  "stepByStepGuide": "分步解题教程"
}`

    const result = await callAI(prompt, '你是一位经验丰富的数学老师，擅长分析学生错误并给出清晰的讲解。')

    const parsed = extractJSON(result)
    if (parsed) {
      res.json({
        mistakeReason: parsed.mistakeReason || '',
        knowledgeExplained: parsed.knowledgeExplained || '',
        stepByStepGuide: parsed.stepByStepGuide || '',
      })
    } else {
      res.json({
        mistakeReason: result,
        knowledgeExplained: '',
        stepByStepGuide: '',
      })
    }
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 生成同类练习题 ────────────────────────────────────────────────────────────
router.post('/similar', async (req, res) => {
  try {
    const { title, knowledgePoint, subject, difficulty = '中等' } = req.body

    const prompt = `请生成${SIMILAR_COUNT}道关于"${knowledgePoint}"知识点的${subject}变式练习题。要求：
- 同知识点、同难度(${difficulty})
- 不同题干
- 每道题附带参考答案

请按以下JSON格式返回（不要有其他文字）：
{
  "questions": [
    {
      "id": "sq1",
      "content": "题目内容",
      "answer": "参考答案"
    }
  ]
}`

    const result = await callAI(prompt, '你是一位命题专家，擅长根据知识点生成高质量的同类练习题。')

    const parsed = extractJSON(result)
    const questions = parsed?.questions || []
    const formatted = questions.map((q, i) => ({
      id: q.id || `sq${i + 1}`,
      content: q.content || '',
      answer: q.answer || '',
    }))
    res.json({ questions: formatted })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
