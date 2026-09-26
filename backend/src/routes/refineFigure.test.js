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
      { text: '题干', position: [0, 0, 0.4, 0, 0.4, 0.3, 0, 0.3] },
      { text: '选项A', position: [0, 0.3, 0.4, 0.3, 0.4, 0.4, 0, 0.4] },
      { text: '选项B', position: [0, 0.4, 0.4, 0.4, 0.4, 0.5, 0, 0.5] },
      { text: '选项C', position: [0, 0.5, 0.4, 0.5, 0.4, 0.6, 0, 0.6] },
      { text: '选项D', position: [0, 0.6, 0.4, 0.6, 0.4, 0.7, 0, 0.7] },
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
    expect(r.body.bboxCount).toBe(5)

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
})