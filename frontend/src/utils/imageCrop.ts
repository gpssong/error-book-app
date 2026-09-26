/**
 * 图片裁剪工具（区域 OCR 用）
 *
 * region 坐标系: 按 [0,1] 比例存储,适配任意显示宽高。
 * 输出按原始图片分辨率裁剪,保留 OCR 所需的清晰度。
 */
export interface Region {
  /** 矩形左上角 X 比例 [0,1] */
  x: number
  /** 矩形左上角 Y 比例 [0,1] */
  y: number
  /** 矩形宽度比例 [0,1] */
  w: number
  /** 矩形高度比例 [0,1] */
  h: number
}

/**
 * 把 dataUrl 中的图片按 region 裁剪,返回 JPEG base64 dataUrl。
 *
 * 设计原则:
 *  - 输出分辨率 = 原图 region 区域(不做缩放,保留清晰度)
 *  - 输出 JPEG q=0.92(单题裁剪图很小,质量优先)
 *  - region 坐标按比例 clamp 到 [0,1]
 */
/** v44 P2b: 输出缩放/质量上限,避免裁剪图=原图那么大(原图可达 4000px)导致存储失控 */
export interface CropOpts {
  /** 最长边上限(像素),默认 1280(手机看题 + 打印 KaTeX 已足够) */
  maxDim?: number
  /** JPEG 质量 0..1,默认 0.92;入库场景可传 0.85 进一步瘦身 */
  quality?: number
}

export async function cropImage(
  imageDataUrl: string,
  region: Region,
  opts: CropOpts = {},
): Promise<string> {
  const { maxDim = 1280, quality = 0.92 } = opts
  const img = await loadImage(imageDataUrl)

  const W = img.naturalWidth
  const H = img.naturalHeight
  if (!W || !H) throw new Error('图片尺寸无效')

  // clamp 到 [0,1],防止 UI 端算出的坐标越界
  const x = Math.max(0, Math.min(1, region.x))
  const y = Math.max(0, Math.min(1, region.y))
  const w = Math.max(0.01, Math.min(1 - x, region.w))
  const h = Math.max(0.01, Math.min(1 - y, region.h))

  const sx = Math.round(x * W)
  const sy = Math.round(y * H)
  // 源裁剪框(原分辨率)
  const srcW = Math.round(w * W)
  const srcH = Math.round(h * H)
  // v44 P2b: 等比缩放到最长边 ≤ maxDim(只缩小不放大)
  let sw = srcW
  let sh = srcH
  const maxSide = Math.max(sw, sh)
  if (maxSide > maxDim) {
    const scale = maxDim / maxSide
    sw = Math.max(1, Math.round(sw * scale))
    sh = Math.max(1, Math.round(sh * scale))
  }

  const canvas = document.createElement('canvas')
  canvas.width = sw
  canvas.height = sh
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img, sx, sy, srcW, srcH, 0, 0, sw, sh)

  return canvas.toDataURL('image/jpeg', quality)
}

/**
 * 区域面积比例 (用于判断矩形是否太小)
 */
export function regionArea(region: Region): number {
  return Math.max(0, region.w) * Math.max(0, region.h)
}

/**
 * 把矩形坐标 clamp 到图片边界(防止越界)
 */
export function clampRegion(region: Region): Region {
  return {
    x: Math.max(0, Math.min(1 - region.w, region.x)),
    y: Math.max(0, Math.min(1 - region.h, region.y)),
    w: Math.min(region.w, 1),
    h: Math.min(region.h, 1),
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}