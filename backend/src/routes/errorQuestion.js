/**
 * 错题管理路由
 *
 * 所有接口都需要 JWT 认证（router 级中间件）
 * 数据自动按 req.userId 隔离，每个家长只能看自己的错题
 */
import { Router } from 'express'
import { ErrorQuestion } from '../schemas/errorQuestion.js'
import { Child } from '../schemas/child.js'
import { isMemoryDB } from '../schemas/db.js'
import memoryStore from '../schemas/memory.js'
import { createMemoryError } from '../schemas/errorQuestion.js'
import { authMiddleware } from '../middleware/auth.js'

const router = Router()
router.use(authMiddleware)

// ─── 辅助：根据 userId 过滤内存数据 ────────────────────────────────────────────
function listChildrenOf(userId) {
  return Array.from(memoryStore.children.values()).filter((c) => c.ownerId === userId)
}
function listErrorsOf(userId, filter = {}) {
  const childIds = new Set(listChildrenOf(userId).map((c) => c.id))
  return Array.from(memoryStore.errors.values()).filter((e) => {
    if (!childIds.has(e.childId)) return false
    if (filter.childId && e.childId !== filter.childId) return false
    if (filter.subject && e.subject !== filter.subject) return false
    return true
  })
}
function getErrorOf(userId, id) {
  const err = memoryStore.errors.get(id)
  if (!err) return null
  const child = memoryStore.children.get(err.childId)
  if (!child || child.ownerId !== userId) return null
  return err
}
function getChildOf(userId, id) {
  const c = memoryStore.children.get(id)
  if (!c || c.ownerId !== userId) return null
  return c
}

// ─── 获取错题列表 ─────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { childId, subject } = req.query
    if (isMemoryDB()) {
      const list = listErrorsOf(req.userId, { childId, subject })
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      return res.json(list)
    }
    const childFilter = { ownerId: req.userId }
    if (childId) childFilter._id = childId
    const childIds = await Child.find(childFilter).distinct('_id')
    const filter = { childId: { $in: childIds } }
    if (subject) filter.subject = subject
    const errors = await ErrorQuestion.find(filter).sort({ createdAt: -1 })
    res.json(errors)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 获取单个错题 ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      return res.json(err)
    }
    const err = await ErrorQuestion.findById(req.params.id)
    if (!err) return res.status(404).json({ error: '错题不存在' })
    // 权限校验
    const child = await Child.findOne({ _id: err.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问该错题' })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 创建错题 ─────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { childId, subject, title, knowledgePoint } = req.body
    if (!childId || !subject || !title || !knowledgePoint) {
      return res.status(400).json({ error: 'childId、subject、title、knowledgePoint 为必填项' })
    }

    if (isMemoryDB()) {
      const child = getChildOf(req.userId, childId)
      if (!child) return res.status(404).json({ error: '孩子不存在或无权访问' })
      const err = createMemoryError(req.body, childId)
      err.id = memoryStore.genErrorId()
      memoryStore.errors.set(err.id, err)
      child.errorCount = (child.errorCount || 0) + 1
      memoryStore.children.set(childId, child)
      return res.status(201).json(err)
    }

    const child = await Child.findOne({ _id: childId, ownerId: req.userId })
    if (!child) return res.status(404).json({ error: '孩子不存在或无权访问' })
    const err = await ErrorQuestion.create(req.body)
    await Child.findByIdAndUpdate(childId, { $inc: { errorCount: 1 } })
    res.status(201).json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 更新错题 ─────────────────────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      Object.assign(err, req.body, { updatedAt: new Date().toISOString() })
      memoryStore.errors.set(req.params.id, err)
      return res.json(err)
    }
    // 权限校验
    const orig = await ErrorQuestion.findById(req.params.id)
    if (!orig) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: orig.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问' })
    const err = await ErrorQuestion.findByIdAndUpdate(req.params.id, req.body, { new: true })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 清除手写笔迹 ─────────────────────────────────────────────────────────────
router.patch('/:id/handwriting', async (req, res) => {
  try {
    const { clear } = req.body
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      if (clear) err.handwritingSvg = ''
      memoryStore.errors.set(req.params.id, err)
      return res.json(err)
    }
    const orig = await ErrorQuestion.findById(req.params.id)
    if (!orig) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: orig.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问' })
    const update = clear ? { handwritingSvg: '' } : req.body
    const err = await ErrorQuestion.findByIdAndUpdate(req.params.id, update, { new: true })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 保存 AI 讲解结果 ─────────────────────────────────────────────────────────
router.patch('/:id/ai-analysis', async (req, res) => {
  try {
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
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      err.aiAnalysis = analysisData.aiAnalysis
      if (similarQuestions) err.similarQuestions = similarQuestions
      memoryStore.errors.set(req.params.id, err)
      return res.json(err)
    }
    const orig = await ErrorQuestion.findById(req.params.id)
    if (!orig) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: orig.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问' })
    const err = await ErrorQuestion.findByIdAndUpdate(req.params.id, { $set: analysisData }, { new: true })
    res.json(err)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 删除错题 ─────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      const child = memoryStore.children.get(err.childId)
      if (child) child.errorCount = Math.max(0, (child.errorCount || 0) - 1)
      memoryStore.errors.delete(req.params.id)
      return res.json({ deleted: true })
    }
    const orig = await ErrorQuestion.findById(req.params.id)
    if (!orig) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: orig.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问' })
    await ErrorQuestion.findByIdAndDelete(req.params.id)
    await Child.findByIdAndUpdate(orig.childId, { $inc: { errorCount: -1 } })
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
      let deleted = 0
      const childDelta = new Map()
      for (const id of ids) {
        const err = getErrorOf(req.userId, id)
        if (err) {
          childDelta.set(err.childId, (childDelta.get(err.childId) || 0) + 1)
          memoryStore.errors.delete(id)
          deleted++
        }
      }
      for (const [cid, n] of childDelta.entries()) {
        const c = memoryStore.children.get(cid)
        if (c) c.errorCount = Math.max(0, c.errorCount - n)
      }
      return res.json({ deleted })
    }
    // MongoDB: 先校验权限
    const origs = await ErrorQuestion.find({ _id: { $in: ids } })
    const ownedChildIds = (await Child.find({ ownerId: req.userId }).distinct('_id')).map(String)
    const allowedIds = origs.filter((e) => ownedChildIds.includes(String(e.childId))).map((e) => e._id)
    const result = await ErrorQuestion.deleteMany({ _id: { $in: allowedIds } })
    res.json({ deleted: result.deletedCount })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

export default router