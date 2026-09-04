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
import jwt from 'jsonwebtoken'
import { findChildById, childBelongsTo } from './childHelper.js'
dotenv.config()

const router = Router()
const AI_PROVIDER = process.env.AI_PROVIDER || 'openai'
const AI_API_KEY = process.env.AI_API_KEY || ''
const AI_API_BASE = process.env.AI_API_BASE || 'https://api.openai.com/v1'
const AI_MODEL = process.env.AI_MODEL || 'gpt-4o-mini'
const SIMILAR_COUNT = Number(process.env.SIMILAR_QUESTION_COUNT) || 3

/**
 * 学段 → 难度 / 知识点范围 / 严禁超纲提示
 * 与前端 utils/grades.ts 保持一致
 */
const GRADE_PROFILES = {
  小学: {
    1: { difficulty: '入门', scope: '10 以内加减法、简单看图列式' },
    2: { difficulty: '基础', scope: '100 以内加减、表内乘除、简单应用题' },
    3: { difficulty: '基础', scope: '万以内加减、简单分数、长度质量单位' },
    4: { difficulty: '基础偏上', scope: '大数读写、三位数乘除、平行四边形初步' },
    5: { difficulty: '中等', scope: '小数乘除、简易方程、多边形面积' },
    6: { difficulty: '中等', scope: '分数百分数、圆柱圆锥、比和比例' },
  },
  初中: {
    7: { difficulty: '中等', scope: '有理数运算、整式加减、一元一次方程、几何初步' },
    8: { difficulty: '中等偏上', scope: '全等三角形、整式乘除、一次函数、分式方程' },
    9: { difficulty: '中等偏难', scope: '二次函数、相似与圆、一元二次方程、概率统计' },
  },
  高中: {
    10: { difficulty: '较难', scope: '集合函数、指数对数、幂函数、数列初步' },
    11: { difficulty: '困难', scope: '三角函数、解三角形、立体几何、概率与统计' },
    12: { difficulty: '高难度', scope: '导数综合、解析几何、圆锥曲线、压轴题' },
  },
}

/** 从 grade 字符串反查学段+年级序号 */
function parseGrade(grade) {
  if (!grade) return null
  // 小学一年级 ~ 小学六年级
  const primary = grade.match(/^小学(\d+)年级$/)
  if (primary) {
    const n = parseInt(primary[1], 10)
    if (n >= 1 && n <= 6) return { stage: '小学', level: n, label: grade }
  }
  // 初一/初二/初三
  const junior = { '初一': 7, '初二': 8, '初三': 9 }
  if (junior[grade]) return { stage: '初中', level: junior[grade], label: grade }
  // 高一/高二/高三
  const senior = { '高一': 10, '高二': 11, '高三': 12 }
  if (senior[grade]) return { stage: '高中', level: senior[grade], label: grade }
  return null
}

/** 生成学段描述, 注入到 AI prompt */
function buildGradePrompt(grade) {
  const parsed = parseGrade(grade)
  if (!parsed) {
    return '【学段信息】未指定年级，请按中等难度、通用初高中知识出题。'
  }
  const profile = GRADE_PROFILES[parsed.stage]?.[parsed.level]
  if (!profile) {
    return `【学段信息】${parsed.label} (${parsed.stage})，请按该学段水平出题。`
  }
  return [
    `【学段信息】${parsed.label} (${parsed.stage})`,
    `【难度要求】${profile.difficulty}`,
    `【知识点范围】${profile.scope}`,
    `【特别强调】题目所用概念、公式、计算量必须严格匹配 ${parsed.label} 学生的认知水平；不要出现超纲内容（如给小学生出方程、给初中生出微积分或导数、给高中生出大学内容）。`,
  ].join('\n')
}

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
// AI 路由 — 兼容匿名调用,但若带 JWT 则 req.userId 可用 (用于按年级出题)
router.use((req, res, next) => {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || 'error-book-dev-secret-change-in-prod')
      req.userId = payload.userId
    } catch {
      // token 无效忽略,作为匿名
    }
  }
  next()
})

router.post('/analyze', async (req, res) => {
  try {
    const { title, knowledgePoint, subject, textContent, childId } = req.body

    // 反查 child grade (用于讲解更贴近学段)
    let childGrade = null
    if (childId && req.userId) {
      const child = await findChildById(childId)
      if (child && childBelongsTo(child, req.userId)) {
        childGrade = child.grade
      }
    }
    const gradePrompt = buildGradePrompt(childGrade)

    const prompt = `请分析以下${subject}错题：

题目：${title}
知识点：${knowledgePoint}
题目内容：${textContent || '（见图片）'}

${gradePrompt}

请按以下JSON格式返回分析结果（不要有其他文字）：
{
  "mistakeReason": "错误原因分析",
  "knowledgeExplained": "对应知识点讲解（使用该学段能理解的语言）",
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
    const { title, knowledgePoint, subject, difficulty = '中等', childId } = req.body

    // 若传了 childId 且当前有用户登录,反查 child 拿到 grade 注入 prompt
    let childGrade = null
    if (childId && req.userId) {
      const child = await findChildById(childId)
      if (child && childBelongsTo(child, req.userId)) {
        childGrade = child.grade
      }
    }
    const gradePrompt = buildGradePrompt(childGrade)

    const prompt = `请生成${SIMILAR_COUNT}道关于"${knowledgePoint}"知识点的${subject}变式练习题。

${gradePrompt}

要求：
- 严格按上述学段难度和知识点范围
- 题目形式多变（选择题、填空题、解答题、应用题皆可）
- 每道题附带参考答案
- 配套答案简洁准确

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

    const result = await callAI(prompt, '你是一位命题专家，擅长根据学段水平生成高质量的同类练习题。')

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
