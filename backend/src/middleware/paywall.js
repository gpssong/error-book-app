/**
 * 付费墙中间件 - 每日额度检查
 *
 * 免费版额度:
 *   - OCR 识别: 10次/天
 *   - AI 讲解:  3次/天
 *   - 同类题:   3次/天
 *
 * Pro/Family: 无限制
 *
 * 用法:
 *   router.use(checkDailyLimit({ action: 'ocr', cost: 1 }))
 *   router.post('/analyze', checkDailyLimit({ action: 'ai_analyze' }), handler)
 */
import { User } from '../schemas/user.js'
import { DAILY_OCR_LIMIT, DAILY_AI_LIMIT, DAILY_SIMILAR_LIMIT } from '../schemas/user.js'

// 各 action 对应的配额字段
const LIMIT_MAP = {
  ocr:          { field: 'dailyOcrUsed',    limit: DAILY_OCR_LIMIT },
  ai_analyze:   { field: 'dailyAiUsed',     limit: DAILY_AI_LIMIT },
  ai_similar:   { field: 'dailySimilarUsed', limit: DAILY_SIMILAR_LIMIT },
}

function ensureDailyReset(user) {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  if (user.subscription.lastResetDate !== today) {
    user.subscription.dailyOcrUsed = 0
    user.subscription.dailyAiUsed = 0
    user.subscription.dailySimilarUsed = 0
    user.subscription.lastResetDate = today
  }
  return user
}

export function checkDailyLimit(config) {
  const { action, cost = 1 } = config
  const limitInfo = LIMIT_MAP[action]
  if (!limitInfo) {
    throw new Error(`未知 action: ${action}`)
  }

  return async (req, res, next) => {
    if (!req.userId) {
      return res.status(401).json({ error: '未登录' })
    }

    let user
    try {
      user = await User.findById(req.userId)
    } catch {
      // 内存模式下直接访问 memoryStore.users
      const memoryStore = (await import('../schemas/memory.js')).default
      user = Array.from(memoryStore.users.values()).find(u => u.id === req.userId)
    }

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 每日自动清零
    ensureDailyReset(user)
    await (user.save ? user.save() : Promise.resolve())

    req.user = user

    // Pro/Family 直接放行
    if (user.subscription.plan === 'pro' || user.subscription.plan === 'family') {
      return next()
    }

    // 免费版额度检查
    const used = user.subscription[limitInfo.field]
    if (used + cost > limitInfo.limit) {
      return res.status(402).json({
        error: `${action}_daily_limit_exceeded`,
        action,
        limit: limitInfo.limit,
        used,
        remaining: 0,
        message: `今日次数已用完，升级 Pro 享受无限${
          action === 'ocr' ? '识别' : action === 'ai_analyze' ? 'AI 讲解' : '同类题'
        }`,
        plan: 'free',
      })
    }

    // 消耗额度
    user.subscription[limitInfo.field] = used + cost
    await (user.save ? user.save() : Promise.resolve())
    next()
  }
}

/**
 * GET /api/subscription/me - 查询当前用户订阅状态（含剩余额度）
 */
export async function getSubscriptionStatus(req, res) {
  if (!req.userId) return res.status(401).json({ error: '未登录' })

  let user
  try {
    user = await User.findById(req.userId)
  } catch {
    const memoryStore = (await import('../schemas/memory.js')).default
    user = Array.from(memoryStore.users.values()).find(u => u.id === req.userId)
  }

  if (!user) return res.status(404).json({ error: '用户不存在' })

  // 自动清零
  ensureDailyReset(user)

  const sub = user.subscription
  const isPaid = sub.plan === 'pro' || sub.plan === 'family'
  const isExpired = sub.expiresAt && new Date() > sub.expiresAt

  res.json({
    plan: isExpired ? 'free' : sub.plan,
    expiresAt: sub.expiresAt,
    childrenCount: sub.childrenCount,
    limits: {
      ocr:          { limit: DAILY_OCR_LIMIT,         used: sub.dailyOcrUsed,         remaining: DAILY_OCR_LIMIT - sub.dailyOcrUsed },
      ai_analyze:   { limit: DAILY_AI_LIMIT,          used: sub.dailyAiUsed,          remaining: DAILY_AI_LIMIT - sub.dailyAiUsed },
      ai_similar:   { limit: DAILY_SIMILAR_LIMIT,     used: sub.dailySimilarUsed,     remaining: DAILY_SIMILAR_LIMIT - sub.dailySimilarUsed },
    },
    isPaid,
  })
}

/**
 * POST /api/subscription/upgrade - 手动升级（扫码充值流程）
 * body: { plan: 'pro'|'family', payMethod: 'wechat'|'alipay', screenshotUrl?: string }
 */
export async function upgradeSubscription(req, res) {
  if (!req.userId) return res.status(401).json({ error: '未登录' })

  const { plan, payMethod, screenshotUrl } = req.body || {}
  if (!plan || !['pro', 'family'].includes(plan)) {
    return res.status(400).json({ error: '无效的套餐类型' })
  }

  let user
  try {
    user = await User.findById(req.userId)
  } catch {
    const memoryStore = (await import('../schemas/memory.js')).default
    user = Array.from(memoryStore.users.values()).find(u => u.id === req.userId)
  }

  if (!user) return res.status(404).json({ error: '用户不存在' })

  // 更新订阅
  user.subscription.plan = plan
  user.subscription.childrenCount = plan === 'family' ? 5 : 1
  user.subscription.expiresAt = null // MVP 手动充值暂不设过期
  await (user.save ? user.save() : Promise.resolve())

  res.json({
    success: true,
    plan,
    message: plan === 'family'
      ? '已升级为 Family 版，支持最多 5 个孩子'
      : '已升级为 Pro 版，享受无限 AI 功能',
  })
}
