/**
 * printFigureSrc - v48.2 回归测试
 *
 * 锁定「打印页题卡示意图选取」优先级, 尤其是 v48.2 修复:
 *   列表接口 GET /api/errors 剥离 figureBase64 → 打印页靠 figureMap 懒加载还原,
 *   优先级 3 (lazyFigure) 在 figureBase64 库里没有但 figureMap 有时仍应出图,
 *   不再 fallback 到 imageUrl(整张拍摄照)。
 */
import { describe, it, expect } from 'vitest'
import { pickPrintFigure, type ErrorFigureInput } from './printFigureSrc'

const PHOTO: ErrorFigureInput = {
  id: 'e1',
  imageUrl: '/uploads/photo.jpg',
  imageBase64: 'data:image/png;base64,PHOTO',
}

describe('pickPrintFigure — 打印题卡示意图选取 (v48.2)', () => {
  it('库里已有 figureBase64(无 figureImageUrl) → 出 figureBase64, 不用整张照', () => {
    const r = pickPrintFigure({ ...PHOTO, figureBase64: 'data:image/png;base64,FIG' }, undefined, undefined)
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('data:image/png;base64,FIG')
  })

  it('figureImageUrl 优先于 figureBase64', () => {
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg', figureBase64: 'data:...' },
      undefined, undefined,
    )
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('/uploads/fig.jpg')
  })

  it('v48.2 核心: 库里无 figure(列表剥离后), figureMap 懒加载到图 → 出 lazyFigure, 不用整张照', () => {
    // err 只有 imageUrl/imageBase64(整张照), 但打印页懒加载 figureMap 还原出示意图
    const r = pickPrintFigure(PHOTO, undefined, 'data:image/png;base64,LAZYFIG')
    expect(r.kind).toBe('lazyFigure')
    expect(r.src).toBe('data:image/png;base64,LAZYFIG')
  })

  it('refine 成功 + 有 region → 出去手写图 + region(最高优先级, 用 clip-path)', () => {
    const region = { x: 0.2, y: 0.3, w: 0.6, h: 0.5 }
    const r = pickPrintFigure(
      { ...PHOTO, figureBase64: 'data:...' },
      { refined: true, figureImageUrl: '/uploads/refined.jpg', region, loading: false },
      'data:image/png;base64,LAZYFIG',
    )
    expect(r.kind).toBe('refined')
    expect(r.src).toBe('/uploads/refined.jpg')
    expect(r.region).toBe(region)
  })

  it('refine 标记成功但缺 region → 降级到 figureBase64(不用 clip-path)', () => {
    const r = pickPrintFigure(
      { ...PHOTO, figureBase64: 'data:image/png;base64,FIG' },
      { refined: true, figureImageUrl: '/uploads/refined.jpg', region: undefined, loading: false },
      undefined,
    )
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('data:image/png;base64,FIG')
  })

  it('什么图都没有 → none', () => {
    const r = pickPrintFigure({ id: 'empty' }, undefined, '')
    expect(r.kind).toBe('none')
    expect(r.src).toBeUndefined()
  })

  it('整张题照兜底: 只有 imageUrl, 无 figure → photo', () => {
    const r = pickPrintFigure({ id: 'e2', imageUrl: '/uploads/photo.jpg' }, undefined, undefined)
    expect(r.kind).toBe('photo')
    expect(r.src).toBe('/uploads/photo.jpg')
  })

  it('figureMap 值为空字符串 → 不算图, 继续兜底到 photo', () => {
    const r = pickPrintFigure({ id: 'e2', imageUrl: '/uploads/photo.jpg' }, undefined, '')
    expect(r.kind).toBe('photo')
    expect(r.src).toBe('/uploads/photo.jpg')
  })
})
