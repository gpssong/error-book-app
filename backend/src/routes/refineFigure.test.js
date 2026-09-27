/**
 * POST /:id/refine-figure 路由测试(内存模式)
 */
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

// 必须在 import router 之前设好内存模式
process.env.USE_MEMORY_DB = 'true'

// vi.mock 必须在 top-level(hoisting);先 mock 再 import
vi.mock('../services/textin.js', () => ({
  isTextInConfigured: () => true,
  eraseHandwriting: vi.fn(async (buf) => buf),
  recognizeText: vi.fn(async () => ({
    lines: [
      // v48.3 mock: 文本覆盖上中下三块, 让启发式找到右半 0.4~1.0 的「图区」(与真实拍题 strip 一致)
      { text: '题干1', position: [0, 0.02, 0.4, 0.02, 0.4, 0.10, 0, 0.10] },
      { text: '题干2', position: [0, 0.12, 0.4, 0.12, 0.4, 0.20, 0, 0.20] },
      { text: '题干3', position: [0, 0.22, 0.4, 0.22, 0.4, 0.30, 0, 0.30] },
      { text: '选项A', position: [0, 0.34, 0.4, 0.34, 0.4, 0.42, 0, 0.42] },
      { text: '选项B', position: [0, 0.44, 0.4, 0.44, 0.4, 0.52, 0, 0.52] },
      { text: '选项C', position: [0, 0.54, 0.4, 0.54, 0.4, 0.62, 0, 0.62] },
      { text: '选项D', position: [0, 0.64, 0.4, 0.64, 0.4, 0.72, 0, 0.72] },
      // 底部一行(把 L-shape 的"底条"切断 — 直接接到选项 D 下方不留缝隙)
      { text: '尾注', position: [0.0, 0.72, 1.0, 0.72, 1.0, 0.99, 0.0, 0.99] },
    ],
  })),
  recognizeFormula: vi.fn(async () => ({ formulas: [], raw: {} })),
}))
vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req, _res, next) => {
    req.userId = 'test-user-id'
    next()
  },
}))
// v48.6: 视觉兜底 mock —— 默认返回一个覆盖全幅的坏 region, 被 guard 拒收;
// 单测里需要"正常通过"时可用 mockResolvedValueOnce 覆盖
vi.mock('../services/minimax.js', () => ({
  extractFigureRegion: vi.fn(async () => ({ x: 0.05, y: 0.05, w: 0.9, h: 0.9 })),
}))

let app, memoryStore

beforeAll(async () => {
  const errorQuestionRouter = (await import('./errorQuestion.js')).default
  memoryStore = (await import('../schemas/memory.js')).default
  app = express()
  app.use(express.json())
  app.use('/api/errors', errorQuestionRouter)
})

beforeEach(() => {
  memoryStore.clear()
  memoryStore.children.set('child-1', {
    id: 'child-1',
    ownerId: 'test-user-id',
    name: 'test',
    avatar: '🧒',
    grade: '3',
    color: '#fff',
    errorCount: 0,
    weeklyCount: 0,
  })
  memoryStore.errors.set('err-1', {
    id: 'err-1',
    childId: 'child-1',
    title: '立方体最短路程',
    knowledgePoint: '立体几何',
    subject: '数学',
    imageUrl: '',
    // 1x1 PNG header + 2000 bytes padding,base64 后 > 1000 字节(refine 端点最低要求)
    imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABSK/NxK' + 'A'.repeat(2800),
    textContent: '',
    sourceText: '',
    handwritingSvg: '',
    wrongCount: 1,
    isFavorite: false,
    aiAnalysis: { mistakeReason: '', knowledgeExplained: '', stepByStepGuide: '', answer: '', analyzedAt: null },
    similarQuestions: [],
    figureBase64: '',
    figureImageUrl: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
})

describe('POST /:id/refine-figure (内存模式 mock textin)', () => {
  it('错题不存在 → 404', async () => {
    const r = await request(app).post('/api/errors/not-exist/refine-figure')
    expect(r.status).toBe(404)
  })

  it('有 imageBase64 + mock textin 成功 → refined=true + 写 figureImageUrl', async () => {
    const r = await request(app).post('/api/errors/err-1/refine-figure')
    expect(r.status).toBe(200)
    expect(r.body.refined).toBe(true)
    expect(r.body.figureImageUrl).toMatch(/^\/uploads\/fig-err-1-/)
    expect(r.body.region).toBeTruthy()
    expect(r.body.bboxCount).toBe(8)

    const stored = memoryStore.errors.get('err-1')
    expect(stored.figureImageUrl).toBe(r.body.figureImageUrl)
    expect(stored.figureBase64).toBe('')
  })

  it('imageBase64 为空 → refined=false reason=no-image', async () => {
    memoryStore.errors.get('err-1').imageBase64 = ''
    const r = await request(app).post('/api/errors/err-1/refine-figure')
    expect(r.status).toBe(200)
    expect(r.body.refined).toBe(false)
    expect(r.body.reason).toBe('no-image')
  })

  it('imageBase64 太小(< 1000 字节) → reason=image-too-small', async () => {
    memoryStore.errors.get('err-1').imageBase64 = 'data:image/jpeg;base64,/9j/w='
    const r = await request(app).post('/api/errors/err-1/refine-figure')
    expect(r.status).toBe(200)
    expect(r.body.refined).toBe(false)
    expect(r.body.reason).toBe('image-too-small')
  })

  // v48.6: 护栏拒收「框到文字」的坏 region → refined=false, 不写库(保留旧值)
  it('护栏拒收 region-mostly-text → refined=false, figureRegion 不被污染', async () => {
    const textin = await import('../services/textin.js')
    // 让文字覆盖全幅(右半边也是文字), 使启发式/视觉给出的 region 主体是文字
    vi.mocked(textin.recognizeText).mockReset()
    vi.mocked(textin.recognizeText).mockResolvedValue({
      lines: [
        { text: 'x', position: [0.55, 0.05, 0.95, 0.05, 0.95, 0.95, 0.55, 0.95] },
      ],
      raw: {},
    })
    const minimaxMod = await import('../services/minimax.js')
    vi.mocked(minimaxMod.extractFigureRegion).mockReset()
    vi.mocked(minimaxMod.extractFigureRegion).mockResolvedValue({ x: 0.55, y: 0.05, w: 0.4, h: 0.9 })

    const r = await request(app).post('/api/errors/err-1/refine-figure')
    expect(r.status).toBe(200)
    expect(r.body.refined).toBe(false)
    expect(['region-mostly-text', 'strip-too-wide', 'no-figure-region']).toContain(r.body.reason)
    const stored = memoryStore.errors.get('err-1')
    expect(stored.figureRegion ?? null).toBeFalsy()
    // 还原 mock, 避免污染后续用例
    vi.mocked(textin.recognizeText).mockRestore()
  })
})