/**
 * 垂直拼接两张图片（跨页拍题用）
 *
 * 设计原则：
 *  - 复用 imagePreprocess 的 loadImage 模式（避免重复 onload 时序代码）
 *  - 用 canvas.drawImage 9 参数重载，source rect 直接跳掉 img2 顶部
 *    （避免先裁再画的中间开销）
 *  - 输出按 "maxDim" 等比缩放（JPEG q=0.82）以控制后续 JSON body 体积
 *  - 不做自动重叠检测：v40 走"用户拖滑块手动对齐"的简化路线
 */
export interface StitchOpts {
  /** 裁掉 img2 顶部的比例 [0, 0.6]，0 = 不裁 */
  dropTopRatio: number
  /** 输出图最大边长（像素），超过则等比缩小。默认 1600（略大于 preprocess 的 1200） */
  targetMaxDim?: number
  /** JPEG 质量。默认 0.82 */
  jpegQuality?: number
}

export async function stitchImagesVertically(
  img1Source: string | HTMLImageElement,
  img2Source: string | HTMLImageElement,
  opts: StitchOpts
): Promise<string> {
  const jpegQuality = opts.jpegQuality ?? 0.82
  const targetMaxDim = opts.targetMaxDim ?? 1600
  const dropTopRatio = Math.max(0, Math.min(0.6, opts.dropTopRatio))

  const [img1, img2] = await Promise.all([
    typeof img1Source === 'string' ? loadImage(img1Source) : Promise.resolve(img1Source),
    typeof img2Source === 'string' ? loadImage(img2Source) : Promise.resolve(img2Source),
  ])

  const w1 = img1.naturalWidth
  const h1 = img1.naturalHeight
  const w2 = img2.naturalWidth
  const h2 = img2.naturalHeight
  if (!w1 || !h1 || !w2 || !h2) throw new Error('图片尺寸无效')

  // 拼接画布
  const canvasW = Math.max(w1, w2)
  const cropH2 = Math.max(1, Math.floor(h2 * (1 - dropTopRatio)))  // img2 实际可见高度
  const skipTop2 = Math.round(h2 * dropTopRatio)                    // img2 顶部跳过
  const canvasH = h1 + cropH2

  const canvas = document.createElement('canvas')
  canvas.width = canvasW
  canvas.height = canvasH
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'  // 拼接底色为白，避免透明区域被 OCR 当噪点
  ctx.fillRect(0, 0, canvasW, canvasH)

  // img1 画顶部
  ctx.imageSmoothingQuality = 'high'
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(img1, 0, 0, w1, h1, 0, 0, w1, h1)
  // img2 画底部（跳过顶部 dropTopRatio 部分）
  ctx.drawImage(img2, 0, skipTop2, w2, cropH2, 0, h1, w2, cropH2)

  // 等比缩放（若需要）
  if (canvasW <= targetMaxDim && canvasH <= targetMaxDim) {
    return canvas.toDataURL('image/jpeg', jpegQuality)
  }

  const ratio = Math.min(targetMaxDim / canvasW, targetMaxDim / canvasH)
  const fw = Math.round(canvasW * ratio)
  const fh = Math.round(canvasH * ratio)
  const scaled = document.createElement('canvas')
  scaled.width = fw
  scaled.height = fh
  const sctx = scaled.getContext('2d')!
  sctx.imageSmoothingQuality = 'high'
  sctx.imageSmoothingEnabled = true
  sctx.drawImage(canvas, 0, 0, fw, fh)
  return scaled.toDataURL('image/jpeg', jpegQuality)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片加载失败'))
    img.src = src
  })
}