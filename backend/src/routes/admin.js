/**
 * 管理员路由
 *
 * GET  /api/admin/users      - 获取所有注册用户列表（仅管理员）
 * PATCH /api/admin/users/:id/subscription - 修改用户套餐（仅管理员）
 *
 * 所有接口需 JWT + isAdmin:true
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { User } from '../schemas/user.js'
import { Child } from '../schemas/child.js'
import { ErrorQuestion } from '../schemas/errorQuestion.js'
import { authMiddleware } from '../middleware/auth.js'
import memoryStore from '../schemas/memory.js'

const router = Router()
router.use(authMiddleware)

// ─── 获取所有用户列表（不含密码）───────────────────────────────────────────────
router.get('/users', async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: '无管理员权限' })

  try {
    let users
    if (process.env.USE_MEMORY_DB === 'true') {
      users = Array.from(memoryStore.users.values())
    } else {
      users = await User.find({}, 'username email displayName subscription createdAt updatedAt').sort({ createdAt: 1 })
    }
    const list = users.map(u => ({
      id: u.id,
      username: u.username,
      email: u.email,
      displayName: u.displayName || u.username,
      subscription: u.subscription,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    }))
    res.json({ users: list })
  } catch (err) {
    console.error('GET /api/admin/users 失败:', err)
    res.status(500).json({ error: err.message || '获取用户列表失败' })
  }
})

// ─── 修改用户套餐 ─────────────────────────────────────────────────────────────
router.patch('/users/:id/subscription', async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: '无管理员权限' })

  const { id } = req.params
  const { plan, expiresAt, childrenCount } = req.body

  if (!plan || !['free', 'pro', 'family'].includes(plan)) {
    return res.status(400).json({ error: '无效的套餐类型' })
  }

  try {
    let user
    if (process.env.USE_MEMORY_DB === 'true') {
      user = Array.from(memoryStore.users.values()).find(u => u.id === id)
    } else {
      user = await User.findById(id)
    }
    if (!user) return res.status(404).json({ error: '用户不存在' })

    user.subscription.plan = plan
    user.subscription.childrenCount = plan === 'family' ? 5 : 1
    if (expiresAt) {
      user.subscription.expiresAt = expiresAt === '' ? null : new Date(expiresAt)
    }
    await (user.save ? user.save() : Promise.resolve())

    res.json({ ok: true })
  } catch (err) {
    console.error('PATCH /api/admin/users/:id/subscription 失败:', err)
    res.status(500).json({ error: err.message || '更新失败' })
  }
})

// ─── 重置用户每日额度 ─────────────────────────────────────────────────────────
router.post('/users/:id/reset-daily', async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: '无管理员权限' })

  const { id } = req.params
  try {
    let user
    if (process.env.USE_MEMORY_DB === 'true') {
      user = Array.from(memoryStore.users.values()).find(u => u.id === id)
    } else {
      user = await User.findById(id)
    }
    if (!user) return res.status(404).json({ error: '用户不存在' })

    user.subscription.dailyOcrUsed = 0
    user.subscription.dailyAiUsed = 0
    user.subscription.dailySimilarUsed = 0
    user.subscription.lastResetDate = ''
    await (user.save ? user.save() : Promise.resolve())

    res.json({ ok: true })
  } catch (err) {
    console.error('POST /api/admin/users/:id/reset-daily 失败:', err)
    res.status(500).json({ error: err.message || '重置失败' })
  }
})

// ─── 删除用户（级联删除孩子 + 错题）────────────────────────────────────────────
router.delete('/users/:id', async (req, res) => {
  if (!req.isAdmin) return res.status(403).json({ error: '无管理员权限' })

  const { id } = req.params
  // 阻止删除自己
  if (id === req.userId) return res.status(400).json({ error: '不能删除自己的账号' })

  try {
    let user
    if (process.env.USE_MEMORY_DB === 'true') {
      user = Array.from(memoryStore.users.values()).find(u => u.id === id)
    } else {
      user = await User.findById(id)
    }
    if (!user) return res.status(404).json({ error: '用户不存在' })

    // 级联删除：先删该用户的所有孩子（孩子删除时会级联删错题）
    if (process.env.USE_MEMORY_DB === 'true') {
      const children = Array.from(memoryStore.children.values()).filter(c => c.ownerId === id)
      children.forEach(c => memoryStore.children.delete(c.id))
    } else {
      const childIds = await Child.find({ ownerId: id }, '_id').distinct('_id')
      await ErrorQuestion.deleteMany({ childId: { $in: childIds } })
      await Child.deleteMany({ ownerId: id })
    }

    // 删除用户
    if (process.env.USE_MEMORY_DB === 'true') {
      memoryStore.users.delete(id)
    } else {
      await User.findByIdAndDelete(id)
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('DELETE /api/admin/users/:id 失败:', err)
    res.status(500).json({ error: err.message || '删除失败' })
  }
})

export default router
