/**
 * 错题管理路由
 *
 * GET    /api/errors                      - 获取所有错题（支持 ?childId= 筛选）
 * GET    /api/errors/:id                  - 获取单个错题详情
 * POST   /api/errors                      - 创建新错题
 * PATCH  /api/errors/:id                  - 更新错题（含手写笔迹、AI分析等）
 * DELETE /api/errors/:id                  - 删除错题
 * PATCH  /api/errors/:id/handwriting      - 更新手写笔迹 SVG
 * PATCH  /api/errors/:id/ai-analysis      - 保存 AI 讲解结果
 */
import { Router } from 'express'
import { ErrorQuestion } from '../schemas/errorQuestion.js'
import { Child } from '../schemas/child.js'
import { isMemoryDB } from '../schemas/db.js'
import memoryStore from '../schemas/memory.js'
import { createMemoryError } from '../schemas/errorQuestion.js'

const router = Router()

// ─── 获取错题列表 ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { childId, subject, page = 1, limit = 20 } = req.query

    if (isMemoryDB()) {
      let list = Array.from(memoryStore.errors.values())
      if (childId) list = list.filter((e) => e.childId === childId)
      if (subject) list = list.filter((e) => e.subject === subject)
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const start = (Number(page) - 1) * Number(limit)
      return res.json(list.slice(start, start + Number(limit)))
    }

    const filter = {}
    if (childId) filter.childId = childId
    if (subject) filter.subject = subject

    const errors = await ErrorQuestion.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))

    res.json(errors)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 获取单个错题 ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (isMemoryDB()) {
      const err = memoryStore.errors.get(id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      return res.json(err)
    }

    const err = await ErrorQuestion.findById(id)
    if (!err) return res.status(404).json({ error: '错题不存在' })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 创建错题 ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { childId, subject, title, knowledgePoint, imageUrl, textContent, handwritingSvg } = req.body

    if (!childId || !subject || !title || !knowledgePoint) {
      return res.status(400).json({ error: 'childId、subject、title、knowledgePoint 为必填项' })
    }

    // 验证孩子存在
    if (isMemoryDB()) {
      if (!memoryStore.children.has(childId)) {
        return res.status(404).json({ error: '孩子不存在' })
      }
    } else {
      const child = await Child.findById(childId)
      if (!child) return res.status(404).json({ error: '孩子不存在' })
    }

    if (isMemoryDB()) {
      const err = createMemoryError(req.body, childId)
      err.id = memoryStore.genErrorId()
      memoryStore.errors.set(err.id, err)

      // 更新孩子的错题统计
      const childData = memoryStore.children.get(childId)
      childData.errorCount = (childData.errorCount || 0) + 1
      memoryStore.children.set(childId, childData)

      return res.status(201).json(err)
    }

    const err = await ErrorQuestion.create(req.body)

    // 更新孩子统计
    await Child.findByIdAndUpdate(childId, {
      $inc: { errorCount: 1 },
    })

    res.status(201).json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 更新错题 ─────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const updates = req.body

    if (isMemoryDB()) {
      const err = memoryStore.errors.get(id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      Object.assign(err, updates, { updatedAt: new Date().toISOString() })
      memoryStore.errors.set(id, err)
      return res.json(err)
    }

    const err = await ErrorQuestion.findByIdAndUpdate(id, updates, { new: true })
    if (!err) return res.status(404).json({ error: '错题不存在' })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 清除手写笔迹 ─────────────────────────────────────────────────────────────
router.patch('/:id/handwriting', async (req, res) => {
  try {
    const { id } = req.params
    const { clear } = req.body

    if (isMemoryDB()) {
      const err = memoryStore.errors.get(id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      if (clear) err.handwritingSvg = ''
      memoryStore.errors.set(id, err)
      return res.json(err)
    }

    const update = clear ? { handwritingSvg: '' } : req.body
    const err = await ErrorQuestion.findByIdAndUpdate(id, update, { new: true })
    if (!err) return res.status(404).json({ error: '错题不存在' })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 保存 AI 讲解结果 ─────────────────────────────────────────────────────────
router.patch('/:id/ai-analysis', async (req, res) => {
  try {
    const { id } = req.params
    const { mistakeReason, knowledgeExplained, stepByStepGuide, similarQuestions } = req.body

    const analysisData = {
      aiAnalysis: {
        mistakeReason: mistakeReason || '',
        knowledgeExplained: knowledgeExplained || '',
        stepByStepGuide: stepByStepGuide || '',
        analyzedAt: new Date(),
      },
      ...(similarQuestions ? { similarQuestions } : {}),
    }

    if (isMemoryDB()) {
      const err = memoryStore.errors.get(id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      err.aiAnalysis = analysisData.aiAnalysis
      if (similarQuestions) err.similarQuestions = similarQuestions
      memoryStore.errors.set(id, err)
      return res.json(err)
    }

    const err = await ErrorQuestion.findByIdAndUpdate(
      id,
      { $set: analysisData },
      { new: true }
    )
    if (!err) return res.status(404).json({ error: '错题不存在' })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 删除错题 ─────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    if (isMemoryDB()) {
      const err = memoryStore.errors.get(id)
      if (!err) return res.status(404).json({ error: '错题不存在' })

      // 更新孩子的错题统计
      const childData = memoryStore.children.get(err.childId)
      childData.errorCount = Math.max(0, (childData.errorCount || 0) - 1)
      memoryStore.children.set(err.childId, childData)

      memoryStore.errors.delete(id)
      return res.json({ deleted: true })
    }

    const err = await ErrorQuestion.findByIdAndDelete(id)
    if (!err) return res.status(404).json({ error: '错题不存在' })

    // 更新孩子统计
    await Child.findByIdAndUpdate(err.childId, {
      $inc: { errorCount: -1 },
    })

    res.json({ deleted: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 批量删除错题 ─────────────────────────────────────────────────────────────
router.post('/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids 数组不能为空' })
    }

    if (isMemoryDB()) {
      const childIdMap = new Map()
      for (const id of ids) {
        const err = memoryStore.errors.get(id)
        if (err) {
          childIdMap.set(err.childId, (childIdMap.get(err.childId) || 0) + 1)
          memoryStore.errors.delete(id)
        }
      }
      for (const [childId, count] of childIdMap.entries()) {
        const child = memoryStore.children.get(childId)
        if (child) child.errorCount = Math.max(0, child.errorCount - count)
      }
      return res.json({ deleted: ids.length })
    }

    const result = await ErrorQuestion.deleteMany({ _id: { $in: ids } })
    res.json({ deleted: result.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router
