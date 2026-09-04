/**
 * TextIn OCR 服务封装
 *
 * TextIn 是合合信息旗下的专业 OCR 服务,擅长:
 * - 数学公式识别（输出 LaTeX）
 * - 手写体擦除（智能去除笔迹,保留印刷体）
 * - 通用文字识别（高准确率）
 * - 文档版面分析（题目自动分块）
 *
 * 接入流程:
 * 1. https://www.textin.com 注册开发者账号
 * 2. 工作台 → 账号设置 → 开发者信息 获取 x-ti-app-id / x-ti-secret-code
 * 3. 配置方式 (任选其一):
 *    a) 后端 .env: TEXTIN_APP_ID / TEXTIN_SECRET_CODE (服务器级默认)
 *    b) 前端 config.html OCR Tab 添加 TextIn Key (用户级,优先于 .env)
 *
 * 免费额度: 1000 次/页（一次性赠送）
 */
import dotenv from 'dotenv'
dotenv.config()

const ENV_APP_ID = process.env.TEXTIN_APP_ID || ''
const ENV_SECRET_CODE = process.env.TEXTIN_SECRET_CODE || ''
const BASE_URL = 'https://api.textin.com'

/**
 * 解析请求级凭证 — 优先用 opts 里传的 (来自前端请求头)
 * 否则用 .env 默认
 */
function resolveCredentials(opts = {}) {
  const appId = (opts.appId || ENV_APP_ID || '').trim()
  const secretCode = (opts.secretCode || ENV_SECRET_CODE || '').trim()
  return { appId, secretCode }
}

/**
 * 检查是否配置了 TextIn 凭证 (请求级 或 环境级)
 */
export function isTextInConfigured(opts = {}) {
  const { appId, secretCode } = resolveCredentials(opts)
  return appId !== '' && secretCode !== ''
}

/**
 * 通用请求方法
 * @param {string} endpoint - 接口路径,例如 /ai/service/v1/handwritten_erase
 * @param {Buffer|string} body - 图片二进制流 或 图片 URL 或 JSON 字符串
 * @param {object} params - URL query 参数,例如 { url: "https://..." } 或空
 * @param {object} options
 *   - contentType: 'application/octet-stream' | 'application/json' | 'text/plain'
 *   - opts: 凭证覆盖 (来自请求级配置)
 * @returns {Promise<{ok: boolean, data: any, raw: string}>}
 */
async function textinRequest(endpoint, body, params = {}, options = {}) {
  const { contentType = 'application/octet-stream', opts = {} } = options
  const { appId, secretCode } = resolveCredentials(opts)
  if (!appId || !secretCode) {
    throw new Error('TextIn 未配置,请在 .env 设置 TEXTIN_APP_ID/TEXTIN_SECRET_CODE 或在 config.html 添加 OCR Key')
  }

  const url = new URL(BASE_URL + endpoint)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) {
      url.searchParams.append(k, String(v))
    }
  }

  const headers = {
    'x-ti-app-id': appId,
    'x-ti-secret-code': secretCode,
    'Content-Type': contentType,
  }

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body,
  })

  const raw = await res.text()
  let data
  try {
    data = JSON.parse(raw)
  } catch {
    data = { raw }
  }

  if (!res.ok) {
    const code = data?.code ?? res.status
    const msg = data?.message ?? data?.msg ?? res.statusText
    throw new Error(`TextIn ${endpoint} 失败 [${code}]: ${msg}`)
  }

  return { ok: true, data, raw }
}

// ─── 手写擦除 ────────────────────────────────────────────────────────────────
/**
 * 智能擦除图片中的手写笔迹,保留印刷体
 *
 * 端点: POST /ai/service/v1/handwritten_erase
 *
 * @param {Buffer} imageBuffer - 图片二进制
 * @param {object} opts
 *   - crop: 1 = 自动切边（推荐）,0 = 不切
 *   - doc_direction: 4 = 自动方向转正（推荐）
 * @returns {Promise<Buffer>} 擦除手写后的图片二进制
 */
export async function eraseHandwriting(imageBuffer, opts = {}) {
  const { crop = 1, doc_direction = 4 } = opts
  const { data } = await textinRequest(
    '/ai/service/v1/handwritten_erase',
    imageBuffer,
    { crop, doc_direction },
    { contentType: 'application/octet-stream', opts }
  )

  // 返回格式: { image: "base64...", code: 200, message: "success" }
  if (data.code !== 200 && data.code !== undefined) {
    throw new Error(`手写擦除失败: ${data.message || JSON.stringify(data)}`)
  }

  if (!data.image) {
    throw new Error('手写擦除返回无图片数据: ' + JSON.stringify(data).slice(0, 200))
  }

  return Buffer.from(data.image, 'base64')
}

// ─── 数学公式识别 ────────────────────────────────────────────────────────────
/**
 * 识别图片中的数学公式,返回 LaTeX
 *
 * 端点: POST /ai/service/v2/recognize/formula
 *
 * @param {Buffer} imageBuffer - 图片二进制
 * @param {object} opts
 *   - mode: 'formula' | 'formula_and_text' (默认 formula)
 * @returns {Promise<{formulas: Array<{latex: string, type: string, angle: number}>}>}
 */
export async function recognizeFormula(imageBuffer, opts = {}) {
  const { mode = 'formula' } = opts
  const { data } = await textinRequest(
    '/ai/service/v2/recognize/formula',
    imageBuffer,
    { mode },
    { contentType: 'application/octet-stream', opts }
  )

  // 返回结构: { result: { lines: [{ text: "LaTeX", ... }] } }
  const lines = data?.result?.lines || data?.result?.textlines || []
  return {
    formulas: lines.map((l) => ({
      latex: l.text || '',
      type: l.sub_type || 'formula',
      angle: l.angle || 0,
    })),
    raw: data,
  }
}

// ─── 通用文字识别（含版面分析）─────────────────────────────────────────────
/**
 * 识别图片中的所有文字,返回带版面信息的结果
 *
 * 端点: POST /ai/service/v2/recognize
 *
 * @param {Buffer} imageBuffer - 图片二进制
 * @returns {Promise<{lines: Array, blocks: Array}>}
 */
export async function recognizeText(imageBuffer, opts = {}) {
  const { recognize_graphics = 1 } = opts
  // 重要:TextIn /v2/recognize 必须 application/octet-stream 二进制,JSON body 会报 40600
  const { data } = await textinRequest(
    '/ai/service/v2/recognize',
    imageBuffer,
    { recognize_graphics },
    { contentType: 'application/octet-stream', opts }
  )

  // 实际返回结构是 result.lines(扁平),不是 pages[].structured.lines
  const rawLines = data?.result?.lines || []
  const lines = rawLines.map((b) => ({
    text: b.text || '',
    type: b.type || 'text', // text | formula
    angle: b.angle || 0,
    direction: b.direction || 0,
    score: b.score || 0,
    position: b.position || [],
    handwritten: b.handwritten || 0,
  }))

  return {
    lines,
    raw: data,
  }
}

// ─── 便捷方法：完整流水线 ────────────────────────────────────────────────────
/**
 * 一站式 OCR 流水线：
 * 1. 手写擦除（如果有手写）
 * 2. 数学公式识别（输出 LaTeX）
 * 3. 通用文字识别（输出印刷文字 + 版面）
 *
 * 返回给上层做语义解析
 */
export async function ocrPipeline(imageBuffer, opts = {}) {
  const result = {
    handwritingErased: false,
    cleanedImageBase64: '',
    formulas: [],
    textLines: [],
  }

  // ① 手写擦除
  let processedBuffer = imageBuffer
  try {
    const erasedBuffer = await eraseHandwriting(imageBuffer, opts)
    processedBuffer = erasedBuffer
    result.handwritingErased = true
    result.cleanedImageBase64 = `data:image/png;base64,${erasedBuffer.toString('base64')}`
    console.log('[OCR] 手写擦除完成,大小:', erasedBuffer.length, 'bytes')
  } catch (err) {
    console.warn('[OCR] 手写擦除失败,继续识别原图:', err.message)
    result.cleanedImageBase64 = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
  }

  // ② 公式识别 + ③ 文字识别（并行）
  const [formulaResult, textResult] = await Promise.allSettled([
    recognizeFormula(processedBuffer, opts),
    recognizeText(processedBuffer, opts),
  ])

  if (formulaResult.status === 'fulfilled') {
    result.formulas = formulaResult.value.formulas
  } else {
    console.warn('[OCR] 公式识别失败:', formulaResult.reason?.message)
  }

  if (textResult.status === 'fulfilled') {
    result.textLines = textResult.value.lines
  } else {
    console.warn('[OCR] 文字识别失败:', textResult.reason?.message)
  }

  return result
}