/**
 * printFigureSrc — 打印题卡示意图选取(v48.3)
 *
 * 决定打印页题卡顶部显示哪张图,优先级:
 *   1) 本地 refine 成功 + 有 region → 去手写后的整张图 figureImageUrl + clip-path
 *   2) err.figureImageUrl / err.figureBase64(原书示意图)
 *      + 若 err.figureRegion 存在(v48.3 起持久化) → 用同一张图 + clip-path
 *   3) figureMap[err.id](v48.2: 列表剥离 figureBase64 后, 打印页按需懒加载还原的示意图)
 *   4) err.imageUrl / err.imageBase64(整张题照兜底)
 *
 * 之前 bug(v48.2 前): 列表接口 GET /api/errors 做 .select('-figureBase64') 剥离大 base64,
 * 打印页(AppContext.errors 来自列表)永远拿不到 figureBase64 → 含图题打印时
 * 兜底到 imageUrl(整张拍摄照)。v48.2 用 figureMap 懒加载还原, 优先级 3。
 *
 * v48.3 改动: refine-figure 即使 eraseHandwriting 失败也写库 figureImageUrl=imageUrl + figureRegion;
 * printFigureSrc 在优先级 2 处检测到 figureRegion 时也走 clip-path, 不再依赖"本次 session refine 成功"。
 * 这条路径修复了"立方体题图脏"的根因(erase 失败时,旧逻辑落盘带手写整张原照)。
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
  /** v48.3: refine-figure 持久化的 region, 即便没重新 refine 也走 clip-path */
  figureRegion?: { x: number; y: number; w: number; h: number }
  imageUrl?: string
  imageBase64?: string
}

export type FigureSrcKind = 'refined' | 'figure' | 'lazyFigure' | 'photo' | 'none'

export interface FigureSrcResult {
  kind: FigureSrcKind
  /** 最终传给 <img src> 的图源(已选优先级最高的) */
  src?: string
  /** region (refined 或 figureRegion 持久化, 或 lazyFigure 懒加载到的 region) → 前端用 clip-path 抠 */
  region?: { x: number; y: number; w: number; h: number }
}

/** 懒加载到的示意图(v48.4 起带 region) */
export interface LazyFigureValue {
  src: string
  region?: { x: number; y: number; w: number; h: number }
}

/**
 * 选打印题卡的示意图源。
 *
 * @param err   题卡的轻量信息(figureImageUrl/figureBase64/figureRegion/imageUrl/imageBase64 都可能有值)
 * @param refined 本地 refine-map 中该 err 的状态(可能 undefined)
 * @param lazyFigure 打印页懒加载到的示意图(带 region, 可能 undefined)
 */
export function pickPrintFigure(
  err: ErrorFigureInput,
  refined: FigureMapEntry | undefined,
  lazyFigure: LazyFigureValue | null | undefined,
): FigureSrcResult {
  // 1) 本地 refine 成功 + 有 region → 用去手写图 + clip-path
  if (refined?.refined && refined.figureImageUrl && refined.region) {
    return { kind: 'refined', src: refined.figureImageUrl, region: refined.region }
  }
  // 2) 库里已有 figureImageUrl / figureBase64
  //    v48.3: 若 err.figureRegion 也存在(持久化的 region), 同样走 clip-path。
  //    这是 eraseHandwriting 失败的关键路径: figureImageUrl = imageUrl(原照),
  //    但 region 已紧贴图形 → clip 后只显示图本身, 手写在 region 外。
  if (err.figureImageUrl || err.figureBase64) {
    if (err.figureRegion) {
      return { kind: 'figure', src: err.figureImageUrl || err.figureBase64, region: err.figureRegion }
    }
    return { kind: 'figure', src: err.figureImageUrl || err.figureBase64 }
  }
  // 3) v48.2/v48.4: 列表剥离后按需懒加载还原的 figureBase64/figureImageUrl
  //    v48.4: 携带 figureRegion(后端 getErrorFigure 返回)→ lazyFigure 也走 clip-path
  if (lazyFigure?.src) {
    return { kind: 'lazyFigure', src: lazyFigure.src, region: lazyFigure.region }
  }
  // 4) 整张题照兜底
  if (err.imageUrl || err.imageBase64) {
    return { kind: 'photo', src: err.imageUrl || err.imageBase64 }
  }
  return { kind: 'none' }
}
