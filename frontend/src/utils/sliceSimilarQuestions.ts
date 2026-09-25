import type { SimilarQuestion } from '@/stores/api'

/**
 * 打印同类练习题数量的切片纯函数
 *
 * 设计:把「slice 兜底 + min 文案 + 0 不渲染」三条逻辑集中到一处,
 * 便于单测;调用方(PrintPreviewScreen)只负责 UI 渲染。
 *
 * 语义:
 * - select=0     → shown=[], 块由调用方决定不渲染(见 PrintPreviewScreen)
 * - 存量 N > select → shown=前 select 道, hiddenCount=N-select, 无提示
 * - 存量 N < select → shown=全部 N 道, hiddenCount=0, note=「已显示全部现有 N 道同类题」
 * - 存量 N = select → shown=N, hiddenCount=0, 无提示
 */

/** 顶部「同类题 N」选择器的可选值。0=不打印, 8=后端 SIMILAR_QUESTION_COUNT 上限 */
export const SIMILAR_COUNT_OPTIONS = [0, 2, 3, 4, 6, 8] as const
export type SimilarCountOption = (typeof SIMILAR_COUNT_OPTIONS)[number]
/** 默认每道题打印的同类题数量(P2 D1: 默认 4, 2 列时不自动降级) */
export const DEFAULT_SIMILAR_COUNT: SimilarCountOption = 4

export interface SliceSimilarResult {
  /** 实际要渲染/打印的同类题(前 select 道, 不足则取全部) */
  shown: SimilarQuestion[]
  /** 因数量限制被隐藏的同类题数量(= N - shown.length) */
  hiddenCount: number
  /**
   * 当「存量 < select」且存量 > 0 时提示文案, 否则 null。
   * 调用方据此渲染「已显示全部现有 N 道同类题」。
   */
  note: string | null
}

export function sliceSimilarQuestions(
  questions: SimilarQuestion[],
  select: number,
): SliceSimilarResult {
  const n = questions.length
  if (select <= 0 || n === 0) {
    return { shown: [], hiddenCount: 0, note: null }
  }

  const shown = questions.slice(0, select)

  if (n < select) {
    // 存量不足: 显示全部, 提示「已显示全部现有 N 道」
    return { shown, hiddenCount: 0, note: `已显示全部现有 ${n} 道同类题` }
  }

  // 存量足够或刚好: 隐藏剩余
  const hiddenCount = n - shown.length
  return { shown, hiddenCount, note: null }
}
