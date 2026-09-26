/**
 * OCR 快速路径的启发式提取(从 ocr.js 拆出,便于单测)
 *
 * 当 TextIn 直出但 AI 文本合并/视觉兜底都失败时,用纯启发式从原始 OCR 行
 * 拼出 title + knowledgePoint + textContent。这里是字符串级变换,无 IO,可独立测试。
 */

// 各学科知识点关键词(用于启发式匹配 knowledgePoint)
export const KP_KEYWORDS = {
  数学: ['集合', '函数', '方程', '不等式', '数列', '三角', '向量', '复数', '概率', '统计', '立体几何', '解析几何', '导数', '积分', '对数', '指数', '二次函数', '一次函数', '反比例', '绝对值', '单调性', '最值'],
  物理: ['力', '运动', '牛顿', '能量', '动量', '电场', '磁场', '电磁', '光学', '热学', '波动', '机械波', '原子'],
  化学: ['元素', '化合物', '反应', '氧化', '还原', '酸碱', '盐', '有机', '化学键', '分子', '原子', '离子', '电解', '沉淀'],
  语文: ['文言文', '现代文', '阅读', '作文', '古诗', '字词', '拼音', '病句', '修辞'],
  英语: ['语法', '词汇', '阅读', '完形', '写作', '时态', '从句', '虚拟语气'],
  生物: ['细胞', '遗传', '基因', '生态', '进化', '光合', '呼吸', '神经', '免疫'],
}

/**
 * 从 OCR 文本提取 { title, knowledgePoint }
 * - title: 第一行去掉题号后取前 20 字
 * - knowledgePoint: 在 KP_KEYWORDS[subject] 里命中第一个关键词,否则退回 subject 本身
 */
export function extractTitleAndKP(text, subject = '数学') {
  const lines = text.split('\n').filter(Boolean)
  const firstLine = lines[0] || ''
  const title = firstLine.replace(/^\s*\d+[\.、．]\s*/, '').slice(0, 20) || '未命名题目'

  const pool = KP_KEYWORDS[subject] || KP_KEYWORDS.数学
  for (const kw of pool) {
    if (text.includes(kw)) return { title, knowledgePoint: kw }
  }
  return { title, knowledgePoint: subject }
}

/**
 * 把多题文本截断到只含第一道完整选择题
 *
 * 策略:找到第一个题号(1. 或 1．)作为起点,向后找第二个题号(2./2．…)作为终点。
 * 若没找到后续题号则取到末尾。
 */
export function trimToFirstQuestion(text) {
  const lines = text.split('\n')

  const qStartRe = /^\s*1[\.\.．、]\s*\S+/
  let startIdx = lines.findIndex((l) => qStartRe.test(l))
  if (startIdx === -1) startIdx = 0

  const qNextRe = /^\s*[2-9][\.\.．、]\s*\S+/
  let endIdx = lines.length
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (qNextRe.test(lines[i])) {
      endIdx = i
      break
    }
  }

  return lines.slice(startIdx, endIdx).join('\n').trim()
}

/**
 * 公式内容 sanity 校验(2026-09-26)。
 *
 * 背景:TextIn 公式识别 + Agnes 视觉兜底在「代数最小值」「代数最值」等高频套路题上,
 * 视觉模型经常把 √(x²+4)+4/√(x²+4) / m²+2/√(n(m²−n)) 脑补成常见模式
 * (a+1/a+C / t+1/t+4)或直接猜一个「答案=4 的样子」。
 * 这种幻觉会通过 latexNormalize 的「包装」变成「看起来对的 LaTeX」,前端 KaTeX 不报错,
 * 学科检测器也无感(只看文字不看图)。
 *
 * 校验维度:
 *  1) 选项数 < 4          → 题面残缺,不可信
 *  2) 独立符号种类 < 3    → 4 个选项都用了同一组变量,疑似模板化
 *  3) 4 个选项形状高度相似(去变量后 hash,独立数 ≤ 2) → LLM 套了相似公式
 *  4) 完全没有 LaTeX 结构(无 \sqrt / \frac / ^{...}) → 模型把根号/分式都丢了
 *
 * 通过 → { ok: true }
 * 不通过 → { ok: false, reason: '...', metric: ... },上游应降级重读
 */
export function formulaSanityCheck(textContent) {
  const s = String(textContent || '').trim()
  if (!s) return { ok: false, reason: 'empty', metric: 0 }

  // 1) 选项行
  const optionLines = s
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[A-D][\.\.．、\s]/.test(l))
  if (optionLines.length < 4) {
    return { ok: false, reason: 'options<4', metric: optionLines.length }
  }

  // 2) 独立符号种类(字母/希腊字母,排除 A-D 选项前缀)
  const symbols = new Set()
  for (const opt of optionLines) {
    // 先去掉选项前缀 [A. / [B、 / [C． / [D空格], 再统计字母
    const stripped = opt.replace(/^[A-D][\.\.．、\s]+/, '')
    const ms = stripped.match(/[a-zA-Zα-ωΑ-Ω]+/g) || []
    for (const m of ms) symbols.add(m)
  }
  if (symbols.size < 3) {
    return { ok: false, reason: 'symbols<3(疑似模板化)', metric: symbols.size }
  }

  // 3) 形状 hash(去变量/数字/空白)→ 独立数
  const shapes = optionLines.map((o) =>
    o
      .replace(/[a-zA-Zα-ωΑ-Ω0-9]+/g, 'X')
      .replace(/\\sqrt/g, 'SQ')
      .replace(/\\frac|\\dfrac/g, 'FR')
      .replace(/\s+/g, ''),
  )
  const uniq = new Set(shapes).size
  if (uniq <= 2) {
    return { ok: false, reason: 'options-toosimilar(模板化)', metric: uniq }
  }

  // 4) 完全没有 LaTeX 结构 → 模型把根号/分式/上下标都丢了
  const hasLatexStructure = /\\sqrt|\\frac|\\dfrac|\^\{|_\{|\\\\?[a-zA-Z]+/.test(s)
  if (!hasLatexStructure) {
    return { ok: false, reason: 'no-latex-structure', metric: 0 }
  }

  return { ok: true }
}

// ─── 题目插图 fallback:用 TextIn 文字/公式 bbox 求「补集最大连通块」─────
/**
 * 把 TextIn 返回的所有 lines[].position 合并 → 求整图补集(非文字区域)→
 * 找最大连通块,作为 figureRegion 兜底返回。
 *
 * 背景(v47+):几何立体题 figureRegion 命中率仅 1.4%(视觉模型自输出不可靠);
 * 但 TextIn 文字识别和公式识别**自身**的 lines[].position 是真实坐标(4 顶点
 * 归一化 [x1,y1,x2,y2,x3,y3,x4,y4] ∈ [0,1]),它们的并集补集 = 候选示意图。
 *
 * 算法(纯几何,无依赖):
 *  1) 把每个 polygon 转 axis-aligned bbox {x,y,w,h}
 *  2) 求所有 bbox 的并集(轴对齐矩形 union)
 *  3) 计算补集:在 [0,1]×[0,1] 整图上,挖掉 union 后剩余的轴对齐矩形集合
 *  4) 找补集中**面积最大**的连通矩形(>15% 整图且 ≤80% 整图;过大说明文字稀疏)
 *
 * 输入:
 *  - positions: Array<number[8]>(每项是 4 顶点归一化坐标,长度 8);允许部分坏数据
 *  - imgW, imgH: 兼容参数(本算法基于归一化坐标,不需要真实尺寸,默认值 1)
 * 输出:
 *  - { x, y, w, h } (归一化) 或 null
 *
 * 设计决策:
 *  - 宁可不裁,不裁错图(最大连通块 < 15% 整图 或 > 80% 整图 → 返回 null)
 *  - 单条 bbox 就覆盖 80% 整图(整张几乎全是字) → 返回 null(不是插图,是文字密集)
 *  - 输入全部非法 / 全空 → 返回 null
 */
export function figureRegionFromTextPositions(
  positions,
  imgW = 1,
  imgH = 1,
) {
  if (!Array.isArray(positions) || positions.length === 0) return null

  // 1) polygon → axis-aligned bbox
  const bboxes = []
  for (const p of positions) {
    if (!Array.isArray(p) || p.length < 8) continue
    const xs = [p[0], p[2], p[4], p[6]]
    const ys = [p[1], p[3], p[5], p[7]]
    const x = Math.max(0, Math.min(1, Math.min(...xs)))
    const y = Math.max(0, Math.min(1, Math.min(...ys)))
    const x2 = Math.max(0, Math.min(1, Math.max(...xs)))
    const y2 = Math.max(0, Math.min(1, Math.max(...ys)))
    const w = x2 - x
    const h = y2 - y
    if (w <= 0 || h <= 0) continue
    bboxes.push({ x, y, w, h })
  }
  if (bboxes.length === 0) return null

  // 2) 求所有 bbox 的并集(合并重叠/相邻矩形)
  //    贪心:两个矩形相交 → 合并成一个;否则各自保留
  const merged = []
  for (const b of bboxes) {
    let attached = false
    for (let i = 0; i < merged.length; i++) {
      const m = merged[i]
      if (rectsOverlapOrAdjacent(b, m)) {
        merged[i] = unionRect(b, m)
        attached = true
        // 合并后还要再和后续的合一遍,直到稳定
        let changed = true
        while (changed) {
          changed = false
          for (let j = 0; j < merged.length; j++) {
            if (j === i) continue
            if (rectsOverlapOrAdjacent(merged[i], merged[j])) {
              merged[i] = unionRect(merged[i], merged[j])
              merged.splice(j, 1)
              changed = true
              break
            }
          }
        }
        break
      }
    }
    if (!attached) merged.push(b)
  }

  // 3) 计算整图 - 文字并集 的补集(轴对齐矩形拆分)
  //    简化:把 [0,1]×[0,1] 整图切成行带(按 merged 的 y 排序的 y 边界),
  //    每一行带里挖掉 merged 重叠部分,找最大连通矩形。
  //
  //    更简单的等价做法:在归一化网格上做"采样",按 0.01 步长把整图切成
  //    100x100 网格,标记哪些格子被 merged 覆盖,在未被覆盖区域做 flood-fill,
  //    找最大的 4-connected 连通区域,返回它的 axis-aligned bbox。
  //
  //    复杂度 100*100 = 1 万个格子,O(N) 标记 + flood-fill,可接受。
  //
  //    关键:把整图最外层一格视为 occupied(模拟"边框外不存在图"),
  //    避免文字贴边时把边框空白误判为插图。
  const GRID = 100
  const occupied = new Uint8Array(GRID * GRID)
  // 边框视为 occupied(防止文字贴边时把边距空白当插图)
  for (let i = 0; i < GRID; i++) {
    occupied[i] = 1                         // 顶行
    occupied[(GRID - 1) * GRID + i] = 1     // 底行
    occupied[i * GRID] = 1                  // 左列
    occupied[i * GRID + GRID - 1] = 1       // 右列
  }
  for (const m of merged) {
    const x0 = Math.floor(m.x * GRID)
    const y0 = Math.floor(m.y * GRID)
    // 用 min(GRID-1, ...) + 1 防止 Math.ceil 把贴边的 bbox 留出 1 格边距
    const x1 = Math.min(GRID, Math.round((m.x + m.w) * GRID))
    const y1 = Math.min(GRID, Math.round((m.y + m.h) * GRID))
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        occupied[y * GRID + x] = 1
      }
    }
  }

  // 4) flood-fill 找最大连通区域
  const visited = new Uint8Array(GRID * GRID)
  let bestRegion = null
  let bestSize = 0
  let regionCount = 0
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const idx = y * GRID + x
      if (occupied[idx] || visited[idx]) continue
      // BFS 找这个连通块
      const queue = [[x, y]]
      visited[idx] = 1
      let minX = x, maxX = x, minY = y, maxY = y, count = 0
      while (queue.length) {
        const [cx, cy] = queue.shift()
        count++
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        // 4-connected 邻居
        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]
        for (const [nx, ny] of neighbors) {
          if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue
          const nIdx = ny * GRID + nx
          if (occupied[nIdx] || visited[nIdx]) continue
          visited[nIdx] = 1
          queue.push([nx, ny])
        }
      }
      regionCount++
      if (count > bestSize) {
        bestSize = count
        bestRegion = { minX, maxX, minY, maxY }
      }
    }
  }

  // 5) 阈值 + 边界处理
  // 关键:不是只看「补集大小」,还要看「文字本身覆盖密度」
  //  - 文字总覆盖面积 / 整图面积 > 0.80 → 文字密集,不可能有大插图(纯文字题)
  //  - 补集太小(ratio < 0.15) → 文字覆盖太密,无意义
  //  - 补集过大(ratio > 0.85) → 整张几乎都是空白,可能没图
  // 计算文字总覆盖面积
  let occupiedCount = 0
  const totalGrid = GRID * GRID
  for (let i = 0; i < occupied.length; i++) if (occupied[i]) occupiedCount++
  // 减去边框的 4*GRID - 4 个格子(它们永远 occupied,但不代表文字覆盖)
  const borderOccupied = 4 * GRID - 4
  const textDensity = Math.max(0, (occupiedCount - borderOccupied)) / (totalGrid - borderOccupied)
  if (textDensity > 0.80) return null  // 文字太密,无法确定插图

  const ratio = bestSize / totalGrid
  if (typeof process !== 'undefined' && process.env?.DEBUG_FIGURE_REGION) {
    console.log(`[figureRegionFromTextPositions] regions=${regionCount} bestSize=${bestSize}/${totalGrid} ratio=${ratio.toFixed(3)} textDensity=${textDensity.toFixed(3)} merged=${merged.length}`)
  }

  // ─── v48.2 P1:「文字包围中央图」启发式 ────────────────────────────────────
  // 几何立体/3D 线框图(立方体 ABCD-EFGH)的特征:图在**中央**,题干在上、选项在下,
  // 文字把图四面包围。但线框图内部有大量空白,这些空白和「文字行间缝隙」连成一片,
  // 上面「最大连通补集」常选到一个**贴边的巨大空白块**(ratio≈0.6, 其实是行间缝隙),
  // 或者四带都被占走 → 补集法结构性失效。
  //
  // 启发式(在补集结果不靠谱时启用):
  //   - 若最大连通块贴边(贴 4 边任意一边,说明是「行间缝隙/整图留白」而非中央图),
  //     或 ratio 不在合理区(<0.15 太密 / >0.92 太空),
  //   - 且文字确实从上下左右四面包围了中央(见 isFigureBoxedByText),
  //   则改用「中央被包围的最大未 occupied 连通块」作为 figureRegion。
  //
  // 中央候选框:整图水平 [0.15,0.85]、垂直 [0.2,0.8]。线框图典型落在中央。
  const bestTouchesBorder =
    bestRegion && (bestRegion.minX <= 1 || bestRegion.minY <= 1 ||
                  bestRegion.maxX >= GRID - 2 || bestRegion.maxY >= GRID - 2)
  const complementUnreliable = ratio < 0.15 || ratio > 0.92 || bestTouchesBorder
  if (complementUnreliable && isFigureBoxedByText(occupied, GRID, totalGrid)) {
    const center = findBoxedCenterRegion(occupied, GRID)
    if (center) {
      if (typeof process !== 'undefined' && process.env?.DEBUG_FIGURE_REGION) {
        console.log(`[figureRegionFromTextPositions] boxed-center heuristic → ${JSON.stringify(center)}`)
      }
      return center
    }
  }
  if (ratio < 0.15 || ratio > 0.92) return null

  // 网格坐标 → 归一化坐标(扩 1 个格子边界,避免裁剪太紧)
  const x = Math.max(0, (bestRegion.minX - 1) / GRID)
  const y = Math.max(0, (bestRegion.minY - 1) / GRID)
  const x2 = Math.min(1, (bestRegion.maxX + 1) / GRID)
  const y2 = Math.min(1, (bestRegion.maxY + 1) / GRID)
  return {
    x: round4(x),
    y: round4(y),
    w: round4(x2 - x),
    h: round4(y2 - y),
  }
}

// ─── v48.2 P1:「文字包围中心」启发式辅助函数 ──────────────────────────────────
//
// 判断图是否被文字四面包围:在归一化网格上,看候选中央区域
// (整图水平方向 [0.2,0.8]、垂直方向 [0.15,0.85] 的矩形)
// 是否在上下左右四个方向都能碰到文字(occupied)。
//
// 实现:把整图分成「中央候选框」外环,统计外环里文字占的四个方向条带:
//  - 上带: y ∈ [0.1, 0.25)
//  - 下带: y ∈ (0.75, 0.9]
//  - 左带: x ∈ [0.0, 0.15), y ∈ [0.25, 0.75)
//  - 右带: x ∈ (0.85, 1.0], y ∈ [0.25, 0.75)
// 四个带里都有一定比例(≥ 8%)的格子被文字占据 → 认定图被四面包围。
//
// 这种几何先验只在「文字确实从四个方向围着中央」时触发,
// 对纯文字题(全是文字,无中央图)和单边空白题(只有上方文字)不会误触发。
function isFigureBoxedByText(occupied, grid, total) {
  const band = (x0, y0, x1, y1) => {
    let total = 0, occ = 0
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        total++
        if (occupied[y * grid + x]) occ++
      }
    }
    return total ? occ / total : 0
  }
  const G = grid
  // 归一化 [0.1,0.25] → 网格坐标
  const top = band(Math.floor(0.0 * G), Math.floor(0.10 * G), Math.ceil(1.0 * G), Math.floor(0.25 * G))
  const bottom = band(Math.floor(0.0 * G), Math.floor(0.75 * G), Math.ceil(1.0 * G), Math.ceil(0.90 * G))
  const left = band(Math.floor(0.0 * G), Math.floor(0.25 * G), Math.floor(0.15 * G), Math.ceil(0.75 * G))
  const right = band(Math.floor(0.85 * G), Math.floor(0.25 * G), Math.ceil(1.0 * G), Math.ceil(0.75 * G))
  const need = 0.08
  // 四带都需达到 8% 文字密度才算「被包围」
  return top >= need && bottom >= need && left >= need && right >= need && total > 0
}

// 找到「被文字包围」的中央区域(归一化 {x,y,w,h}):
// 在中央候选框 [0.15,0.85]×[0.25,0.75] 里找最大未 occupied 连通块。
// 该连通块 = 文字四面包围的中央空白 = 线框图所在。
function findBoxedCenterRegion(occupied, grid) {
  const G = grid
  const x0 = Math.floor(0.15 * G)
  const x1 = Math.ceil(0.85 * G)
  const y0 = Math.floor(0.20 * G)
  const y1 = Math.ceil(0.80 * G)
  const visited = new Uint8Array(G * G)
  let best = null
  let bestCount = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = y * G + x
      if (occupied[idx] || visited[idx]) continue
      const queue = [[x, y]]
      visited[idx] = 1
      let minX = x, maxX = x, minY = y, maxY = y, count = 0
      while (queue.length) {
        const [cx, cy] = queue.shift()
        count++
        if (cx < minX) minX = cx
        if (cx > maxX) maxX = cx
        if (cy < minY) minY = cy
        if (cy > maxY) maxY = cy
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue
          const nIdx = ny * G + nx
          if (occupied[nIdx] || visited[nIdx]) continue
          visited[nIdx] = 1
          queue.push([nx, ny])
        }
      }
      // 中央连通块至少要占候选框的 15%(避免把选项间的小缝隙当成图)
      const candidateArea = (x1 - x0) * (y1 - y0)
      if (count / candidateArea < 0.15) continue
      if (count > bestCount) {
        bestCount = count
        best = { minX, maxX, minY, maxY }
      }
    }
  }
  if (!best) return null
  const x = Math.max(0, (best.minX - 1) / G)
  const y = Math.max(0, (best.minY - 1) / G)
  const x2 = Math.min(1, (best.maxX + 1) / G)
  const y2 = Math.min(1, (best.maxY + 1) / G)
  return {
    x: round4(x),
    y: round4(y),
    w: round4(x2 - x),
    h: round4(y2 - y),
  }
}

// 辅助:两个 axis-aligned 矩形是否相交或邻接(< 1% 整图宽算邻接)
function rectsOverlapOrAdjacent(a, b) {
  const eps = 0.01
  return !(
    a.x + a.w + eps < b.x ||
    b.x + b.w + eps < a.x ||
    a.y + a.h + eps < b.y ||
    b.y + b.h + eps < a.y
  )
}

// 辅助:两个 axis-aligned 矩形求并集
function unionRect(a, b) {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.w, b.x + b.w)
  const y2 = Math.max(a.y + a.h, b.y + b.h)
  return { x, y, w: x2 - x, h: y2 - y }
}

// 辅助:round to 4 decimals(返回字符串友好,传输更短)
function round4(n) {
  return Math.round(n * 10000) / 10000
}
