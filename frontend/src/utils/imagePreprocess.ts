/**
 * 图片预处理工具（OCR 前置）
 *
 * 在浏览器中完成 4 步清洗：
 *  ① 去白边（自动裁剪 + 留白边）
 *  ② 灰度化 + 自适应阈值（增强对比度）
 *  ③ 去手写（亮度阈值 + 连通域面积判定，半透明非印刷体像素涂白）
 *  ④ EXIF 自动旋转（Canvas drawImage 渲染时自动校正）
 *
 * 输入：HTMLImageElement 或 base64 dataURL
 * 输出：清洗后的 base64 dataURL（jpeg, 0.92 质量）
 *
 * 零外部依赖，兼容所有现代浏览器和 Capacitor WebView
 */

export interface PreprocessOptions {
  /** 是否启用去手写步骤（默认 true） */
  removeHandwriting?: boolean
  /** 输出图片最大边长（像素），超过则等比例缩小。默认 1600 */
  maxDim?: number
  /** 周围留白边（像素），防止裁掉边角印刷内容。默认 12 */
  margin?: number
  /** 手写判定：非印刷像素亮度阈值 0-255，越小越激进。默认 230 */
  inkThreshold?: number
  /** 手写判定：连通域面积上限（像素²），小于此值的连通块判定为手写。默认 80 */
  inkBlobMaxArea?: number
  /** 输出 jpeg 质量。默认 0.92 */
  jpegQuality?: number
}

/**
 * 主入口：加载图片 → 预处理 → 返回新 base64
 */
export async function preprocessImage(
  source: HTMLImageElement | string,
  opts: PreprocessOptions = {}
): Promise<string> {
  const cfg = {
    removeHandwriting: true,
    maxDim: 1600,
    margin: 12,
    inkThreshold: 230,
    inkBlobMaxArea: 80,
    jpegQuality: 0.92,
    ...opts,
  }

  const img = typeof source === 'string' ? await loadImage(source) : source

  // 第一次裁剪到原始尺寸，做后续清洗
  const w0 = img.naturalWidth
  const h0 = img.naturalHeight

  const cv = document.createElement('canvas')
  cv.width = w0
  cv.height = h0
  const ctx = cv.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0)

  // ── ① 去白边 ──────────────────────────────────────────────────────────────
  const bbox = findContentBBox(ctx, w0, h0)
  const cropX = Math.max(0, bbox.x - cfg.margin)
  const cropY = Math.max(0, bbox.y - cfg.margin)
  const cropW = Math.min(w0 - cropX, bbox.w + 2 * cfg.margin)
  const cropH = Math.min(h0 - cropY, bbox.h + 2 * cfg.margin)

  // ── ② 灰度化（在裁剪后做，减少噪声） ─────────────────────────────────────
  const cleaned = document.createElement('canvas')
  cleaned.width = cropW
  cleaned.height = cropH
  const cctx = cleaned.getContext('2d', { willReadFrequently: true })!
  cctx.drawImage(cv, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

  const imgData = cctx.getImageData(0, 0, cropW, cropH)
  const px = imgData.data

  // 计算灰度 + 自适应阈值（局部均值近似）
  const gray = new Uint8ClampedArray(cropW * cropH)
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    // 0.299 R + 0.587 G + 0.114 B
    gray[j] = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) | 0
  }

  // 全局阈值：白底灰度 > 245 的像素占比 > 80% 时用 200，否则用 170（兼容浅色印刷）
  let brightCount = 0
  for (let i = 0; i < gray.length; i++) if (gray[i] > 245) brightCount++
  const isWhiteBackground = brightCount / gray.length > 0.6
  const threshold = isWhiteBackground ? 200 : 150

  // 强化对比：黑色像素归 0，白色像素归 255，中间值放大
  for (let i = 0, j = 0; i < px.length; i += 4, j++) {
    const g = gray[j]
    let v: number
    if (g > threshold + 20) v = 255
    else if (g < threshold - 20) v = 0
    else {
      // 拉大对比度（线性映射）
      const t = (g - (threshold - 20)) / 40
      v = 255 - t * 255
    }
    px[i] = v
    px[i + 1] = v
    px[i + 2] = v
    px[i + 3] = 255
  }

  // ── ③ 去手写 ─────────────────────────────────────────────────────────────
  if (cfg.removeHandwriting) {
    removeHandwritingMask(gray, cropW, cropH, cfg.inkThreshold, cfg.inkBlobMaxArea)
    // 把被判为手写的像素也涂白（gray 二值：255=白/背景，0=黑/文字）
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      if (gray[j] === 128) {
        // 128 = 被标记为手写
        px[i] = 255
        px[i + 1] = 255
        px[i + 2] = 255
        px[i + 3] = 255
      }
    }
  }

  cctx.putImageData(imgData, 0, 0)

  // ── ④ 缩放限制最大边长 ────────────────────────────────────────────────────
  let finalCanvas = cleaned
  if (cropW > cfg.maxDim || cropH > cfg.maxDim) {
    const ratio = Math.min(cfg.maxDim / cropW, cfg.maxDim / cropH)
    const fw = Math.round(cropW * ratio)
    const fh = Math.round(cropH * ratio)
    const scaled = document.createElement('canvas')
    scaled.width = fw
    scaled.height = fh
    const sctx = scaled.getContext('2d')!
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(cleaned, 0, 0, fw, fh)
    finalCanvas = scaled
  }

  return finalCanvas.toDataURL('image/jpeg', cfg.jpegQuality)
}

// ─── 找内容包围盒（去白边） ──────────────────────────────────────────────────
function findContentBBox(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): { x: number; y: number; w: number; h: number } {
  const data = ctx.getImageData(0, 0, w, h).data
  let minX = w, minY = h, maxX = 0, maxY = 0
  let found = false

  // 步进 4 像素采样加速（手机图大）
  const step = Math.max(2, Math.round(Math.min(w, h) / 600))
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4
      // 灰度 < 240 的视为内容像素
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
      if (gray < 240) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        found = true
      }
    }
  }

  if (!found) return { x: 0, y: 0, w, h }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ─── 去手写（连通域分析） ────────────────────────────────────────────────────
/**
 * 算法：
 * 1. 用亮度阈值找出"非背景"的暗像素（潜在手写或印刷）
 * 2. BFS 连通域标记
 * 3. 统计每个连通域的面积：超大（> maxArea）= 印刷字保留；超小（< minArea）= 噪点
 *    介于两者之间 + 形态不规则（宽高比异常）= 手写 → 标记为 128 待涂白
 *
 * 简化判定（不区分形态）：把面积阈值以下的连通块全部视为手写。
 * 印刷汉字字符通常占 > 200 像素²；涂改笔迹、记号笔画散落，单个笔触远小于此。
 */
function removeHandwritingMask(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  inkThreshold: number,
  blobMaxArea: number
) {
  // 二值化：255=背景，0=潜在墨迹
  const bin = new Uint8Array(w * h)
  for (let i = 0; i < bin.length; i++) {
    bin[i] = gray[i] < inkThreshold ? 1 : 0
  }

  // BFS 标记连通域
  const labels = new Int32Array(w * h)
  let nextLabel = 1
  const queue: number[] = []
  const sizes: number[] = [0] // index 0 不用

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      if (bin[idx] !== 1 || labels[idx] !== 0) continue

      const label = nextLabel++
      sizes.push(0)
      queue.length = 0
      queue.push(idx)
      labels[idx] = label
      sizes[label] = 0

      while (queue.length) {
        const cur = queue.pop()!
        sizes[label]++
        const cx = cur % w
        const cy = (cur - cx) / w

        // 4 邻域
        if (cx > 0 && bin[cur - 1] === 1 && labels[cur - 1] === 0) {
          labels[cur - 1] = label
          queue.push(cur - 1)
        }
        if (cx < w - 1 && bin[cur + 1] === 1 && labels[cur + 1] === 0) {
          labels[cur + 1] = label
          queue.push(cur + 1)
        }
        if (cy > 0 && bin[cur - w] === 1 && labels[cur - w] === 0) {
          labels[cur - w] = label
          queue.push(cur - w)
        }
        if (cy < h - 1 && bin[cur + w] === 1 && labels[cur + w] === 0) {
          labels[cur + w] = label
          queue.push(cur + w)
        }
      }
    }
  }

  // 标记小连通域 → gray 设为 128（手写标记）
  // 阈值范围：blobMaxArea 以下判手写
  // 同时过滤极小（< 4 像素²）噪点
  const minArea = 4
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i]
    if (l === 0) continue
    const s = sizes[l]
    if (s >= minArea && s <= blobMaxArea) {
      gray[i] = 128
    }
  }
}

// ─── 加载图片 ────────────────────────────────────────────────────────────────
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(new Error('图片加载失败'))
    img.src = src
  })
}