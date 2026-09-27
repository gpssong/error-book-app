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
import { isTextInConfigured, eraseHandwriting, recognizeText } from '../services/textin.js'
import { figureRegionFromTextPositions, guardFigureRegion } from '../pipeline/textExtract.js'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'
import fs from 'fs'

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
// 两种形态(共享权限 + 投影逻辑):
//  - 默认(全量): 客户端本地过滤/统计/全选打印需要整个孩子错题集 → 直接 res.json(数组)
//  - ?paged=1(分页): 列表页无限滚动用, 返回 {items, hasMore}, 并带 X-Total-Count 头
// 两者都不返回两张大 base64(列表永远轻量, 图走 /uploads 静态)。
// P3 分页: ?paged=1&offset=&limit= (limit 默认 30, 上限 100)
router.get('/', async (req, res) => {
  try {
    const { childId, subject } = req.query
    const paged = req.query.paged === '1' || req.query.paged === 'true'
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 30))

    if (isMemoryDB()) {
      let list = listErrorsOf(req.userId, { childId, subject })
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      if (!paged) return res.json(list)
      const total = list.length
      const items = list.slice(offset, offset + limit)
      res.set('X-Total-Count', String(total))
      return res.json({ items, hasMore: offset + items.length < total, total, offset, limit })
    }

    const childFilter = { ownerId: req.userId }
    if (childId) childFilter._id = childId
    const childIds = await Child.find(childFilter).distinct('_id')
    const filter = { childId: { $in: childIds } }
    if (subject) filter.subject = subject
    // v44 P0: 列表不返回两张大 base64 图(imageBase64/figureBase64 各 300KB~2MB),
    // 否则错题多时列表 JSON 膨胀到数 MB, 公网拉取慢。缩略图走 imageUrl(/uploads 静态, 可缓存)。
    // 手写字段 handwritingSvg 是 SVG(小), 详情页需要, 保留。
    const query = ErrorQuestion.find(filter).select('-imageBase64 -figureBase64').sort({ createdAt: -1 })

    if (!paged) {
      const errors = await query
      res.json(errors)
      return
    }
    // P3 分页: skip/limit + 一次 count(索引 {childId, createdAt} 覆盖排序, 开销可控)
    const [items, total] = await Promise.all([
      query.skip(offset).limit(limit),
      ErrorQuestion.countDocuments(filter),
    ])
    res.set('X-Total-Count', String(total))
    res.json({ items, hasMore: offset + items.length < total, total, offset, limit })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 单独取图(v44 P1):按需返回单张题图, 避免详情页为取图拉全量 base64 ────────
// 已有 imageUrl(/uploads 静态 URL)时直接 302 跳静态文件(可被浏览器/CDN 缓存);
// 否则回退读 imageBase64, 以 data-URL 形式返回(老数据兼容)。
router.get('/:id/image', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      if (err.imageUrl) return res.redirect(err.imageUrl)
      return res.type('text/plain').send(err.imageBase64 || '')
    }
    const err = await ErrorQuestion.findById(req.params.id)
    if (!err) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: err.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问该错题' })
    // 静态 URL → 302 交给 nginx/express.static(带缓存)
    if (err.imageUrl && !err.imageUrl.startsWith('data:')) {
      return res.redirect(err.imageUrl)
    }
    // 老数据: 只有 base64, 直接吐 data-URL
    return res.type('text/plain').send(err.imageBase64 || '')
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ─── 取示意图(v48.2 / v48.3):按需返回 figureBase64/figureImageUrl/figureRegion ─
// 背景: 列表接口 GET /errors 做 .select('-imageBase64 -figureBase64') 剥离大 base64,
// 导致打印页(AppContext.errors 来自列表)永远拿不到 figureBase64 → 含图题打印时
// fallback 到 imageUrl(整张题照)而非 figureBase64(原书示意图)。
// 本端点按需返回单条的示意图(可能 30KB+ 的 base64),打印页对选中题逐个懒加载。
// v48.3: 同时返回 figureRegion (refine-figure 持久化的归一化 bbox), 让 pickPrintFigure
// 在列表里拿到 figureImageUrl 后也能直接走 clip-path, 不必每次 session 都重 refine。
router.get('/:id/figure', async (req, res) => {
  try {
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      return res.json({
        figureImageUrl: err.figureImageUrl || '',
        figureBase64: err.figureBase64 || '',
        figureRegion: err.figureRegion || null,
      })
    }
    const err = await ErrorQuestion.findById(req.params.id)
    if (!err) return res.status(404).json({ error: '错题不存在' })
    const child = await Child.findOne({ _id: err.childId, ownerId: req.userId })
    if (!child) return res.status(403).json({ error: '无权访问' })
    return res.json({
      figureImageUrl: err.figureImageUrl || '',
      figureBase64: err.figureBase64 || '',
      figureRegion: err.figureRegion || null,
    })
  } catch (err) {
    console.error('[figure] 异常:', err)
    res.status(500).json({ error: err.message })
  }
})

// ─── 获取单个错题 ─────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // full=1 → 全量(含 imageBase64/figureBase64, 供详情页 AI 讲解喂图);
    // 默认 → 投影排除两张大 base64, 首屏缩略图只需 imageUrl(轻量, 可缓存)。
    const full = req.query.full === '1' || req.query.full === 'true'
    const select = full ? undefined : '-imageBase64 -figureBase64'
    if (isMemoryDB()) {
      const err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      if (full) return res.json(err)
      return res.json({ ...err, imageBase64: undefined, figureBase64: undefined })
    }
    const err = await ErrorQuestion.findById(req.params.id).select(select)
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

// ─── v48 重新计算示意图(去手写 + 扩边完整裁剪)─────────────────────────
// 背景:v47 OCR fallback 只能求 regionSelect 内图的「最大空白」,但示意图常常
// 被 regionSelect 部分裁掉导致只显示一角。用户在打印预览页发现图不全,
// 点此端点:取整张原照(imageBase64)→ TextIn eraseHandwriting 去手写
// → recognizeText 拿真实 bbox → figureRegionFromTextPositions 求最大空白
// → 扩边 10% → 落盘 /uploads/fig-{id}.jpg → 写库 figureImageUrl
//
// 入参: 无 (从 URL :id 取错题)
// 出参: { refined: true, figureImageUrl: '/uploads/fig-xxx.jpg' }
//       或 { refined: false, reason: 'no-image'|'no-textin'|'no-figure' }
//
// v48.3 重要变更: eraseHandwriting 失败时(返回「无图片数据」), 不再落盘带手写的整张原照
//   (用户截图里图"脏"就是这个原因)。改为复用 err.imageUrl(本来就是用户原照, 静态化 URL)
//   作 figureImageUrl, 仅靠 region 在前端 clip-path 抠出示意图部分。手写原本就在原照外,
//   抠 region 后图本身没有手写。这避免了 +40MB 的 sharp/jimp 依赖, 也不浪费磁盘。
router.post('/:id/refine-figure', async (req, res) => {
  const start = Date.now()
  try {
    // 1) 加载错题(内存/Mongo 都支持) + 提取 imageUrl
    let err, imageBase64, imageUrl
    if (isMemoryDB()) {
      err = getErrorOf(req.userId, req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      imageBase64 = err.imageBase64
      imageUrl = err.imageUrl
    } else {
      err = await ErrorQuestion.findById(req.params.id)
      if (!err) return res.status(404).json({ error: '错题不存在' })
      const child = await Child.findOne({ _id: err.childId, ownerId: req.userId })
      if (!child) return res.status(403).json({ error: '无权访问' })
      imageBase64 = err.imageBase64
      imageUrl = err.imageUrl
    }
    if (!imageBase64) {
      return res.json({ refined: false, reason: 'no-image' })
    }

    // 2) TextIn 配置检查
    if (!isTextInConfigured()) {
      return res.json({ refined: false, reason: 'no-textin' })
    }

    // 3) 取干净 buffer(去掉 data: 前缀)
    const cleanBase64 = String(imageBase64).replace(/^data:image\/\w+;base64,/, '')
    const imageBuffer = Buffer.from(cleanBase64, 'base64')
    if (imageBuffer.length < 1000) {
      return res.json({ refined: false, reason: 'image-too-small' })
    }

    // 4) 去手写 + 文字识别(并行)
    const [eraseResult, textResult] = await Promise.allSettled([
      eraseHandwriting(imageBuffer, { crop: 1, doc_direction: 4 }),
      recognizeText(imageBuffer, { recognize_graphics: 1 }),
    ])
    if (eraseResult.status === 'rejected') {
      console.warn('[refine-figure] eraseHandwriting 失败, 用原图继续:', eraseResult.reason?.message)
    }
    if (textResult.status === 'rejected') {
      return res.json({ refined: false, reason: 'recognize-failed', detail: textResult.reason?.message })
    }

    // 5) 用识别 bbox 求示意图区域(优先去手写后的图,缺则用原图 bbox)
    const textLines = textResult.value.lines
    const positions = textLines.map((l) => l.position).filter((p) => Array.isArray(p) && p.length === 8)
    let region = null
    // v48.3: 启发式返回的 region area > 0.55 → 视为"太大"(可能是补集法 fallback 到整图空白, 或图本身很小被 padding 撑大), 落视觉兜底
    let heuristicArea = 0
    if (positions.length >= 2) {
      const heuristic = figureRegionFromTextPositions(positions, 1, 1)
      if (heuristic) {
        heuristicArea = heuristic.w * heuristic.h
        if (heuristicArea >= 0.02 && heuristicArea <= 0.55) {
          region = heuristic
        }
      }
    }
    // 5b) v48.2: 启发式(补集/文字包围)提不出图时, 改用视觉模型直接看图找图 bbox
    //     对「图夹在题干+ABCD 选项中间」的几何/立体题, 启发式常 no-figure-region,
    //     视觉模型(agnes-2.5-flash)命中更稳。视觉也失败 → 保留 no-figure-region。
    if (!region) {
      try {
        const { extractFigureRegion } = await import('../services/minimax.js')
        const dataUrl = `data:image/jpeg;base64,${cleanBase64}`
        const visionRegion = await extractFigureRegion({ imageBase64: dataUrl, subject: err.subject || '数学' })
        if (visionRegion && visionRegion.x !== undefined) {
          region = visionRegion
          console.log(`[refine-figure] 视觉模型兜底命中 region: ${JSON.stringify(region)}`)
        }
      } catch (e) {
        console.warn('[refine-figure] 视觉模型兜底失败, 用启发式结果:', e.message)
      }
    }
    if (!region) {
      return res.json({ refined: false, reason: 'no-figure-region' })
    }

    // v48.6 坐标护栏: 拒收"框到文字 / 框了大半条带"的坏 region, 避免打印页 clip 出错的局部。
    // 用已算出的 positions(TextIn 文字+公式 bbox)判断 region 主体是否为文字。
    // 图片宽高比在 refine 场景拿不到精确像素(不做图像解码), 传 imgW=1/imgH=1 跳过 strip 判,
    // 只做「主体非文字」这条核心校验 —— 这是"框到答案文字区"这类坏 region 的必经拦截。
    // 拒收 → refined=false, 库里保留旧 region(不写坏值), 前端打印页回退整条带兜底。
    const guard = guardFigureRegion(region, positions, 1, 1)
    if (!guard.ok) {
      console.warn(`[refine-figure] 护栏拒收 region (${guard.reason}): ${JSON.stringify(region)} → 保留旧值, 不写库`)
      return res.json({
        refined: false,
        reason: guard.reason,
        region: null,
        bboxCount: positions.length,
      })
    }

    // v48.3: eraseHandwriting 成功 → 用去手写后的图落盘
    //        eraseHandwriting 失败 → 不落盘"带手写的原照", 复用 err.imageUrl 作 figureImageUrl
    //        (前端用 imageUrl + clip-path region 渲染; imageUrl 本身就是用户原照, 静态化,
    //         没有重复磁盘开销; region 紧贴图形本身时, 区域内无手写 = 显示干净)
    let figureImageUrl
    let erasedHandwriting = false
    if (eraseResult.status === 'fulfilled') {
      const cleanedBuffer = eraseResult.value
      const fileName = `fig-${req.params.id}-${uuidv4().slice(0, 8)}.jpg`
      const uploadDir = path.join(process.cwd(), 'public/uploads')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
      const filePath = path.join(uploadDir, fileName)
      fs.writeFileSync(filePath, cleanedBuffer)
      figureImageUrl = `/uploads/${fileName}`
      erasedHandwriting = true
      console.log(`[refine-figure] 去手写成功, 落盘 ${figureImageUrl}`)
    } else if (imageUrl) {
      // erase 失败 + 有 imageUrl: 复用, 不落盘, 避免带手写原照污染图库
      figureImageUrl = imageUrl
      console.log(`[refine-figure] erase 失败, 复用 imageUrl ${imageUrl} 作 figureImageUrl`)
    } else {
      // 老数据: 既无 erase 成功又无 imageUrl (只有 base64)
      // 退路: 把原照落盘(虽然带手写, 但比没有强)
      const fileName = `fig-${req.params.id}-${uuidv4().slice(0, 8)}.jpg`
      const uploadDir = path.join(process.cwd(), 'public/uploads')
      if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
      const filePath = path.join(uploadDir, fileName)
      fs.writeFileSync(filePath, imageBuffer)
      figureImageUrl = `/uploads/${fileName}`
      console.warn(`[refine-figure] erase 失败且无 imageUrl, 落盘原照 ${figureImageUrl}(可能带手写)`)
    }

    // 7) 写库: figureImageUrl + 持久化 region (v48.3)
    //    region 字段让 pickPrintFigure 即使在列表里拿到 figureImageUrl 也能触发 clip-path
    //    (之前: 前端只 pickPrintFigure 看到 refined.region 才 clip; 现在库里也有 region)
    if (isMemoryDB()) {
      err.figureImageUrl = figureImageUrl
      err.figureBase64 = ''
      err.figureRegion = region
      memoryStore.errors.set(req.params.id, err)
    } else {
      await ErrorQuestion.findByIdAndUpdate(req.params.id, {
        $set: { figureImageUrl, figureBase64: '', figureRegion: region },
      })
    }

    console.log(`[refine-figure] ${req.params.id} → ${figureImageUrl} (${Date.now() - start}ms, positions=${positions.length}, region=${JSON.stringify(region)})`)
    return res.json({
      refined: true,
      figureImageUrl,
      region,  // 归一化 {x,y,w,h}, 前端 clip-path 用
      bboxCount: positions.length,
      erasedHandwriting,
      elapsedMs: Date.now() - start,
    })
  } catch (err) {
    console.error('[refine-figure] 异常:', err)
    res.status(500).json({ error: err.message || 'refine 失败' })
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