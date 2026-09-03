/**
 * 孩子管理路由
 *
 * 所有接口都需要 JWT 认证
 * 数据按 ownerId = req.userId 隔离
 */
import { Router } from 'express'
import { Child } from '../schemas/child.js'
import { ErrorQuestion } from '../schemas/errorQuestion.js'
import { isMemoryDB } from '../schemas/db.js'
import memoryStore from '../schemas/memory.js'
import { createMemoryChild } from '../schemas/child.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

// ─── 获取当前用户的所有孩子 ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const list = Array.from(memoryStore.children.values()).filter((c) => c.ownerId === req.userId)
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return res.json(list)
    }
    const children = await Child.find({ ownerId: req.userId }).sort({ createdAt: -1 })
    res.json(children)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 创建孩子 ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, grade, avatar, color } = req.body
    if (!name || !grade) {
      return res.status(400).json({ error: '姓名和年级为必填项' })
    }
    if (isMemoryDB()) {
      const child = createMemoryChild({ name, grade, avatar, color })
      child.id = memoryStore.genChildId()
      child.ownerId = req.userId
      memoryStore.children.set(child.id, child)
      return res.status(201).json(child)
    }
    const child = await Child.create({ name, grade, avatar, color, ownerId: req.userId })
    res.status(201).json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 获取单个孩子 ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const child = memoryStore.children.get(req.params.id)
      if (!child || child.ownerId !== req.userId) return res.status(404).json({ error: '孩子不存在' })
      return res.json(child)
    }
    const child = await Child.findOne({ _id: req.params.id, ownerId: req.userId })
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    res.json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 更新孩子 ─────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const updates = req.body
    if (isMemoryDB()) {
      const child = memoryStore.children.get(req.params.id)
      if (!child || child.ownerId !== req.userId) return res.status(404).json({ error: '孩子不存在' })
      Object.assign(child, updates, { updatedAt: new Date().toISOString() })
      memoryStore.children.set(req.params.id, child)
      return res.json(child)
    }
    const child = await Child.findOneAndUpdate(
      { _id: req.params.id, ownerId: req.userId },
      updates,
      { new: true }
    )
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    res.json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 删除孩子（级联删除错题）──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const child = memoryStore.children.get(req.params.id)
      if (!child || child.ownerId !== req.userId) return res.status(404).json({ error: '孩子不存在' })
      // 先清除该孩子的所有错题
      for (const [eid, err] of memoryStore.errors.entries()) {
        if (err.childId === req.params.id) memoryStore.errors.delete(eid)
      }
      memoryStore.children.delete(req.params.id)
      return res.json({ deleted: true })
    }
    // MongoDB: 先删错题，再删孩子
    const child = await Child.findOne({ _id: req.params.id, ownerId: req.userId })
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    await ErrorQuestion.deleteMany({ childId: req.params.id })
    await Child.findByIdAndDelete(req.params.id)
    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router