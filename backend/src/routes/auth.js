/**
 * 认证路由
 *
 * POST /api/auth/register   - 注册新账号
 * POST /api/auth/login      - 登录，返回 JWT
 * GET  /api/auth/me         - 获取当前用户信息（需 token）
 * PATCH /api/auth/me        - 更新显示名/密码（需 token）
 *
 * 密码使用 bcryptjs 哈希（纯 JS，无需原生编译）
 * Token 使用 jsonwebtoken (HS256, 7天)
 */
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { User, createMemoryUser } from '../schemas/user.js'
import { isMemoryDB } from '../schemas/db.js'
import memoryStore from '../schemas/memory.js'
import { signToken, authMiddleware } from '../middleware/auth.js'
import { ADMIN_USERNAME } from '../middleware/auth.js'

const router = Router()

// ─── 注册 ─────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, displayName } = req.body
    if (!username || !email || !password) {
      return res.status(400).json({ error: '用户名、邮箱、密码均为必填项' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少 6 位' })
    }
    if (!/^[\w.-]+@[\w-]+(\.[\w-]+)+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    if (isMemoryDB()) {
      // 检查重复
      for (const u of memoryStore.users.values()) {
        if (u.username === username) return res.status(409).json({ error: '用户名已被占用' })
        if (u.email === email) return res.status(409).json({ error: '邮箱已被注册' })
      }
      const user = createMemoryUser({ username, email, passwordHash, displayName })
      user.id = memoryStore.genUserId()
      memoryStore.users.set(user.id, user)
      const token = signToken({ userId: user.id, username: user.username })
      return res.status(201).json({
        token,
        user: { id: user.id, username: user.username, email: user.email, displayName: user.displayName },
      })
    }

    // MongoDB 模式
    const exist = await User.findOne({ $or: [{ username }, { email }] })
    if (exist) {
      const field = exist.username === username ? '用户名' : '邮箱'
      return res.status(409).json({ error: `${field}已被占用` })
    }
    const user = await User.create({ username, email, passwordHash, displayName })
    const token = signToken({ userId: user._id.toString(), username: user.username })
    res.status(201).json({
      token,
      user: { id: user._id.toString(), username: user.username, email: user.email, displayName: user.displayName },
    })
  } catch (err) {
    console.error('注册失败:', err)
    res.status(500).json({ error: err.message || '注册失败' })
  }
})

// ─── 登录 ─────────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { account, password } = req.body  // account 可以是用户名或邮箱
    if (!account || !password) {
      return res.status(400).json({ error: '请输入账号和密码' })
    }

    let user = null
    if (isMemoryDB()) {
      for (const u of memoryStore.users.values()) {
        if (u.username === account || u.email === account.toLowerCase()) user = u
      }
    } else {
      user = await User.findOne({ $or: [{ username: account }, { email: account.toLowerCase() }] })
    }
    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' })
    }

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
      return res.status(401).json({ error: '账号或密码错误' })
    }

    const userId = isMemoryDB() ? user.id : user._id.toString()
    const isAdmin = user.username === ADMIN_USERNAME
    const token = signToken({ userId, username: user.username, isAdmin })
    res.json({
      token,
      user: {
        id: userId,
        username: user.username,
        email: user.email,
        displayName: user.displayName || user.username,
        isAdmin,
      },
    })
  } catch (err) {
    console.error('登录失败:', err)
    res.status(500).json({ error: err.message || '登录失败' })
  }
})

// ─── 当前用户信息 ─────────────────────────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    if (isMemoryDB()) {
      const user = memoryStore.users.get(req.userId)
      if (!user) return res.status(404).json({ error: '用户不存在' })
      const isAdmin = user.username === ADMIN_USERNAME
      return res.json({
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName || user.username,
        isAdmin,
      })
    }
    const user = await User.findById(req.userId).select('-passwordHash')
    if (!user) return res.status(404).json({ error: '用户不存在' })
    const isAdmin = user.username === ADMIN_USERNAME
    res.json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName || user.username,
      isAdmin,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 更新当前用户信息（显示名 / 密码）────────────────────────────────────────
router.patch('/me', authMiddleware, async (req, res) => {
  try {
    const { displayName, oldPassword, newPassword } = req.body
    const updates = {}

    if (displayName !== undefined) updates.displayName = displayName

    if (newPassword) {
      if (!oldPassword) return res.status(400).json({ error: '修改密码需要输入旧密码' })
      let user = null
      if (isMemoryDB()) {
        user = memoryStore.users.get(req.userId)
      } else {
        user = await User.findById(req.userId)
      }
      if (!user) return res.status(404).json({ error: '用户不存在' })
      const ok = await bcrypt.compare(oldPassword, user.passwordHash)
      if (!ok) return res.status(401).json({ error: '旧密码错误' })
      if (newPassword.length < 6) return res.status(400).json({ error: '新密码至少 6 位' })
      updates.passwordHash = await bcrypt.hash(newPassword, 10)
    }

    if (isMemoryDB()) {
      const user = memoryStore.users.get(req.userId)
      if (!user) return res.status(404).json({ error: '用户不存在' })
      Object.assign(user, updates, { updatedAt: new Date().toISOString() })
      memoryStore.users.set(req.userId, user)
      return res.json({ id: user.id, username: user.username, email: user.email, displayName: user.displayName })
    }

    const user = await User.findByIdAndUpdate(req.userId, updates, { new: true }).select('-passwordHash')
    res.json({
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      displayName: user.displayName || user.username,
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router