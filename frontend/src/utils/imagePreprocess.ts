/**
 * 图片预处理工具（OCR 前置）
 *
 * 设计原则：保留原图内容不丢失,只做几何变换。
 *  - EXIF 自动旋转（Canvas drawImage 时自动校正,无需手动读 EXIF）
 *  - 等比缩放到 maxDim,降低网络传输与 API 计费成本
 *
 * 不做的:
 *  - ❌ 去白边裁剪：会把题目区域意外裁掉,得不偿失
 *  - ❌ 二值化/对比度拉伸:对手机拍摄的灰度图会丢失中间调
 *  - ❌ 连通域去手写:会把"低对比印刷字"也涂白,得不偿失
 *
 * 手写擦除与去斜交给后端专业 OCR(TextIn handwritten_erase / deskew)处理。
 */
export interface PreprocessOptions {
  /** 输出图片最大边长(像素),超过则等比缩小。默认 1200 */
  maxDim?: number
  /** 输出 jpeg 质量。默认 0.82 */
  jpegQuality?: number
}

export async function preprocessImage(
  source: HTMLImageElement | string,
  opts: PreprocessOptions = {}
): Promise<string> {
  const cfg = {
    maxDim: 1200,
    jpegQuality: 0.82,
    ...opts,
  }

  const img = typeof source === 'string' ? await loadImage(source) : source

  const w0 = img.naturalWidth
  const h0 = img.naturalHeight
  if (!w0 || !h0) {
    throw new Error('图片尺寸无效')
  }

  // EXIF 自动旋转:把图片"画"到 canvas 时,浏览器已按 EXIF Orientation 旋转好
  const outW = w0
  const outH = h0
  const full = document.createElement('canvas')
  full.width = outW
  full.height = outH
  const fctx = full.getContext('2d')!
  fctx.drawImage(img, 0, 0, outW, outH)

  // 等比缩放
  if (outW <= cfg.maxDim && outH <= cfg.maxDim) {
    return full.toDataURL('image/jpeg', cfg.jpegQuality)
  }

  const ratio = Math.min(cfg.maxDim / outW, cfg.maxDim / outH)
  const fw = Math.round(outW * ratio)
  const fh = Math.round(outH * ratio)
  const scaled = document.createElement('canvas')
  scaled.width = fw
  scaled.height = fh
  const sctx = scaled.getContext('2d')!
  sctx.imageSmoothingQuality = 'high'
  sctx.imageSmoothingEnabled = true
  sctx.drawImage(full, 0, 0, fw, fh)

  return scaled.toDataURL('image/jpeg', cfg.jpegQuality)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}