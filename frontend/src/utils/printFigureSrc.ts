/**
 * printFigureSrc — 打印题卡示意图选取(v48.2)
 *
 * 决定打印页题卡顶部显示哪张图,优先级:
 *   1) 本地 refine 成功 + 有 region → 去手写后的整张图 figureImageUrl + clip-path
 *   2) err.figureImageUrl / err.figureBase64(原书示意图,库里有的直接用)
 *   3) figureMap[err.id](v48.2: 列表剥离 figureBase64 后, 打印页按需懒加载还原的示意图)
 *   4) err.imageUrl / err.imageBase64(整张题照兜底)
 *
 * 之前 bug(v48.2 前): 列表接口 GET /api/errors 做 .select('-figureBase64') 剥离大 base64,
 * 打印页(AppContext.errors 来自列表)永远拿不到 figureBase64 → 含图题打印时
 * 兜底到 imageUrl(整张拍摄照)。v48.2 用 figureMap 懒加载还原, 优先级 3。
 */
export interface FigureMapEntry {
  figureImageUrl?: string
  region?: { x: number; y: number; w: number; h: number }
  loading?: boolean
  refined?: boolean
  reason?: string
}

export interface ErrorFigureInput {
  id: string
  figureImageUrl?: string
  figureBase64?: string
  imageUrl?: string
  imageBase64?: string
}

export type FigureSrcKind = 'refined' | 'figure' | 'lazyFigure' | 'photo' | 'none'

export interface FigureSrcResult {
  kind: FigureSrcKind
  /** 最终传给 <img src> 的图源(已选优先级最高的) */
  src?: string
  /** refined 成功 + 有 region 时返回归一化 region, 前端用 clip-path 抠 */
  region?: { x: number; y: number; w: number; h: number }
}

/**
 * 选打印题卡的示意图源。
 *
 * @param err   题卡的轻量信息(figureImageUrl/figureBase64/imageUrl/imageBase64 都可能有值)
 * @param refined 本地 refine-map 中该 err 的状态(可能 undefined)
 * @param figureMapValue 打印页懒加载到的 figureBase64/figureImageUrl(可能 undefined/'')
 */
export function pickPrintFigure(
  err: ErrorFigureInput,
  refined: FigureMapEntry | undefined,
  figureMapValue: string | undefined,
): FigureSrcResult {
  // 1) 本地 refine 成功 + 有 region → 用去手写图 + clip-path
  if (refined?.refined && refined.figureImageUrl && refined.region) {
    return { kind: 'refined', src: refined.figureImageUrl, region: refined.region }
  }
  // 2) 库里已有 figureImageUrl / figureBase64
  if (err.figureImageUrl || err.figureBase64) {
    return { kind: 'figure', src: err.figureImageUrl || err.figureBase64 }
  }
  // 3) v48.2: 列表剥离后按需懒加载还原的 figureBase64
  if (figureMapValue) {
    return { kind: 'lazyFigure', src: figureMapValue }
  }
  // 4) 整张题照兜底
  if (err.imageUrl || err.imageBase64) {
    return { kind: 'photo', src: err.imageUrl || err.imageBase64 }
  }
  return { kind: 'none' }
}
