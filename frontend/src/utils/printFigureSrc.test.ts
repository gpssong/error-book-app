/**
 * printFigureSrc - v48.2 回归测试
 *
 * 锁定「打印页题卡示意图选取」优先级, 尤其是 v48.2 修复:
 *   列表接口 GET /api/errors 剥离 figureBase64 → 打印页靠 figureMap 懒加载还原,
 *   优先级 3 (lazyFigure) 在 figureBase64 库里没有但 figureMap 有时仍应出图,
 *   不再 fallback 到 imageUrl(整张拍摄照)。
 */
import { describe, it, expect } from 'vitest'
import { pickPrintFigure, isClippableRegion, type ErrorFigureInput } from './printFigureSrc'

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
    const r = pickPrintFigure(PHOTO, undefined, { src: 'data:image/png;base64,LAZYFIG' })
    expect(r.kind).toBe('lazyFigure')
    expect(r.src).toBe('data:image/png;base64,LAZYFIG')
  })

  it('refine 成功 + 有 region → 出去手写图 + region(最高优先级, 用 clip-path)', () => {
    const region = { x: 0.2, y: 0.3, w: 0.6, h: 0.5 }
    const r = pickPrintFigure(
      { ...PHOTO, figureBase64: 'data:...' },
      { refined: true, figureImageUrl: '/uploads/refined.jpg', region, loading: false },
      { src: 'data:image/png;base64,LAZYFIG' },
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
    const r = pickPrintFigure({ id: 'empty' }, undefined, undefined)
    expect(r.kind).toBe('none')
    expect(r.src).toBeUndefined()
  })

  it('整张题照兜底: 只有 imageUrl, 无 figure → photo', () => {
    const r = pickPrintFigure({ id: 'e2', imageUrl: '/uploads/photo.jpg' }, undefined, undefined)
    expect(r.kind).toBe('photo')
    expect(r.src).toBe('/uploads/photo.jpg')
  })

  it('lazyFigure 值为 null → 不算图, 继续兜底到 photo', () => {
    const r = pickPrintFigure({ id: 'e2', imageUrl: '/uploads/photo.jpg' }, undefined, null)
    expect(r.kind).toBe('photo')
    expect(r.src).toBe('/uploads/photo.jpg')
  })

  // ─── v48.3 新增: figureRegion 持久化路径 ──────────────────────────
  it('v48.3 核心: 库里有 figureImageUrl + figureRegion(持久化) → 出 figure + region 走 clip-path', () => {
    const region = { x: 0.6, y: 0.05, w: 0.35, h: 0.6 }
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg', figureRegion: region },
      undefined, undefined,
    )
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('/uploads/fig.jpg')
    expect(r.region).toEqual(region)
  })

  it('v48.3: figureImageUrl 在但 figureRegion 缺失 → 出 figure 不带 region(老数据兼容)', () => {
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg' },
      undefined, undefined,
    )
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('/uploads/fig.jpg')
    expect(r.region).toBeUndefined()
  })

  it('v48.3 优先级: refine 本地 region 优先于持久化 figureRegion', () => {
    const refinedRegion = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }
    const persistedRegion = { x: 0.5, y: 0.5, w: 0.2, h: 0.2 }
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg', figureRegion: persistedRegion },
      { refined: true, figureImageUrl: '/uploads/refined.jpg', region: refinedRegion, loading: false },
      undefined,
    )
    expect(r.kind).toBe('refined')
    expect(r.src).toBe('/uploads/refined.jpg')
    expect(r.region).toEqual(refinedRegion)
  })

  // ─── v48.4 新增: lazyFigure 携带 region 路径 ──────────────────────────
  it('v48.4 核心: 库里无 figure, 懒加载到 {src, region} → 出 lazyFigure + region(走 clip-path)', () => {
    const region = { x: 0.55, y: 0.1, w: 0.3, h: 0.4 }
    const r = pickPrintFigure(PHOTO, undefined, { src: '/uploads/lazy-fig.jpg', region })
    expect(r.kind).toBe('lazyFigure')
    expect(r.src).toBe('/uploads/lazy-fig.jpg')
    expect(r.region).toEqual(region)
  })

  it('v48.4: 懒加载到 {src} 无 region → lazyFigure 不带 region(不 clip)', () => {
    const r = pickPrintFigure(PHOTO, undefined, { src: '/uploads/lazy-fig.jpg' })
    expect(r.kind).toBe('lazyFigure')
    expect(r.src).toBe('/uploads/lazy-fig.jpg')
    expect(r.region).toBeUndefined()
  })

  // ─── v48.6 新增: region 宽高比异常 → 不 clip(宁可整条带, 不 clip 出错的局部) ──
  it('v48.6: 带 region 但 region 过宽(宽高比>3.5, 像文字条带) → 出图不 clip', () => {
    const wideRegion = { x: 0.05, y: 0.05, w: 0.9, h: 0.2 } // ratio 4.5 太宽
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg', figureRegion: wideRegion },
      undefined, undefined,
    )
    expect(r.kind).toBe('figure')
    expect(r.src).toBe('/uploads/fig.jpg')
    expect(r.region).toBeUndefined() // 过宽 region 被丢弃, 不 clip
  })

  it('v48.6: isClippableRegion 判定', () => {
    // 立方体典型: w/h≈1 → 可 clip
    expect(isClippableRegion({ x: 0.1, y: 0.1, w: 0.3, h: 0.3 })).toBe(true)
    // 异常宽(条带/文字行): w/h=9 → 拒收
    expect(isClippableRegion({ x: 0.0, y: 0.5, w: 0.9, h: 0.1 })).toBe(false)
    // 异常窄(一条缝): w/h=0.1 → 拒收
    expect(isClippableRegion({ x: 0.5, y: 0.1, w: 0.1, h: 0.8 })).toBe(false)
    // null / 非法 → false
    expect(isClippableRegion(null)).toBe(false)
    expect(isClippableRegion({ x: 0, y: 0, w: 0, h: 0 })).toBe(false)
  })

  // ─── v48.7.1 新增: 显式不出图(suppressImage=true → 连整张题照也不出, 题卡只剩文字) ──
  it('v48.7.1: suppressImage=true → 即便有 figure+region / 有整张题照, 也返回 none', () => {
    const r = pickPrintFigure(
      { ...PHOTO, figureImageUrl: '/uploads/fig.jpg', figureRegion: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 } },
      undefined,
      undefined,
      true,
    )
    expect(r.kind).toBe('none')
    expect(r.src).toBeUndefined()
  })

  it('v48.7.1: suppressImage=true 优先于 refine(本地优化图也不出)', () => {
    const r = pickPrintFigure(
      { ...PHOTO },
      { refined: true, figureImageUrl: '/uploads/refined.jpg', region: { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, loading: false },
      undefined,
      true,
    )
    expect(r.kind).toBe('none')
  })

  it('v48.7.1: suppressImage=false/缺省 + figureRegion=null(显式不裁) 但仍有整张题照 → 走 photo 兜底', () => {
    // figureRegion 为 null 时, 出图优先级不变: 有 figure 走 figure, 否则 photo
    const r = pickPrintFigure(
      { id: 'e', imageUrl: '/uploads/photo.jpg' },
      undefined,
      undefined,
      false,
    )
    expect(r.kind).toBe('photo')
  })
})
