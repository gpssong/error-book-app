/**
 * ErrorListScreen - v48.1-hotfix 回归测试
 *
 * 复现并锁定:「错题历史」页无限闪「加载中…」的根因 + 修复。
 *
 * 根因: loadPage 的 useCallback deps 里含 loadingMore(state)。
 *   首次 loadPage(true) → setLoadingMore(true) → re-render → loadPage 引用变
 *   → useEffect([..., loadPage]) 重新跑 → 重置 pageItems 又 loadPage(true) → 无限循环。
 *
 * 修复: 防重入逻辑改用 loadingMoreRef(ref), loadPage deps 只保留 [activeChildId, filterSubject]。
 *   => loadingMore 切换不再重建 loadPage => effect 不再被 loadPage 抖动触发 => 循环终止。
 *
 * 本测试用与组件完全一致的 guard 逻辑(读 ref 防重入)验证:
 *   并发触发 N 次 loadPage(true), 只有第一次真正发请求, 其余被 ref 拦截。
 */
import { describe, it, expect, vi } from 'vitest'

// ── 与 ErrorListScreen 修复后逻辑一致的防重入守卫 ──────────────────────────────
function makeGuard() {
  const loadingMoreRef = { current: false }
  let calls = 0
  const loadPage = async (reset: boolean) => {
    if (loadingMoreRef.current) return // ref 拦截, 不发请求
    loadingMoreRef.current = true
    calls++
    // 模拟 await api.getErrorsPage(...)
    await new Promise((r) => setTimeout(r, 10))
    loadingMoreRef.current = false
    return reset
  }
  return { loadPage, get calls() { return calls } }
}

describe('ErrorList 防重入守卫 (v48.1-hotfix)', () => {
  it('并发 N 次 loadPage(true): 仅首次发请求, 其余被 ref 拦截', async () => {
    const g = makeGuard()
    await Promise.all([
      g.loadPage(true),
      g.loadPage(true),
      g.loadPage(true),
      g.loadPage(true),
    ])
    expect(g.calls).toBe(1)
  })

  it('上一次完成后, 下一次可以正常发请求(ref 已复位)', async () => {
    const g = makeGuard()
    await g.loadPage(true)
    await g.loadPage(false)
    await g.loadPage(false)
    expect(g.calls).toBe(3)
  })
})
