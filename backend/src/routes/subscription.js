/**
 * 订阅管理路由
 *
 * GET  /api/subscription/me     - 查询当前用户订阅状态（含剩余额度）
 * POST /api/subscription/upgrade - 手动升级（扫码充值）
 */
import { Router } from 'express'
import { authMiddleware } from '../middleware/auth.js'
import { getSubscriptionStatus, upgradeSubscription } from '../middleware/paywall.js'

const router = Router()

router.get('/me', authMiddleware, getSubscriptionStatus)
router.post('/upgrade', authMiddleware, upgradeSubscription)

export default router
