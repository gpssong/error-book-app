/**
 * 孩子管理路由
 *
 * GET    /api/children          - 获取所有孩子列表
 * POST   /api/children          - 创建新孩子
 * GET    /api/children/:id      - 获取单个孩子
 * PATCH  /api/children/:id      - 更新孩子信息
 * DELETE /api/children/:id      - 删除孩子（同时清除其所有错题）
 */
import { Router } from 'express'
import { Child } from '../schemas/child.js'
import { ErrorQuestion } from '../schemas/errorQuestion.js'
import { isMemoryDB } from '../schemas/db.js'
import memoryStore from '../schemas/memory.js'
import { createMemoryChild } from '../schemas/child.js'

const router = Router()

// ─── 获取所有孩子 ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const list = Array.from(memoryStore.children.values())
      return res.json(list)
    }
    const children = await Child.find().sort({ createdAt: -1 })
    res.json(children)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 创建孩子 ────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { name, grade, avatar, color } = req.body

    if (!name || !grade) {
      return res.status(400).json({ error: '姓名和年级为必填项' })
    }

    if (isMemoryDB()) {
      const child = createMemoryChild({ name, grade, avatar, color })
      child.id = memoryStore.genChildId()
      memoryStore.children.set(child.id, child)
      return res.status(201).json(child)
    }

    const child = await Child.create({ name, grade, avatar, color })
    res.status(201).json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 获取单个孩子 ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (isMemoryDB()) {
      const child = memoryStore.children.get(id)
      if (!child) return res.status(404).json({ error: '孩子不存在' })
      return res.json(child)
    }

    const child = await Child.findById(id)
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    res.json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 更新孩子 ─────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    if (isMemoryDB()) {
      const child = memoryStore.children.get(id)
      if (!child) return res.status(404).json({ error: '孩子不存在' })
      Object.assign(child, updates, { updatedAt: new Date().toISOString() })
      memoryStore.children.set(id, child)
      return res.json(child)
    }

    const child = await Child.findByIdAndUpdate(id, updates, { new: true })
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    res.json(child)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 删除孩子（级联删除错题）──────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (isMemoryDB()) {
      // 先清除该孩子的所有错题
      for (const [eid, err] of memoryStore.errors.entries()) {
        if (err.childId === id) memoryStore.errors.delete(eid)
      }
      memoryStore.children.delete(id)
      return res.json({ deleted: true })
    }

    // MongoDB：先删错题，再删孩子
    await ErrorQuestion.deleteMany({ childId: id })
    const child = await Child.findByIdAndDelete(id)
    if (!child) return res.status(404).json({ error: '孩子不存在' })
    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
