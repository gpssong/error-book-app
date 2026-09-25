import { describe, it, expect } from 'vitest'
import { sliceSimilarQuestions, SIMILAR_COUNT_OPTIONS, DEFAULT_SIMILAR_COUNT } from '@/utils/sliceSimilarQuestions'
import type { SimilarQuestion } from '@/stores/api'

/** 造 N 道 fake 同类题 */
function fakeQuestions(n: number): SimilarQuestion[] {
  return Array.from({ length: n }, (_, i) => ({ id: `sq${i + 1}`, content: `q${i + 1}`, answer: `a${i + 1}` }))
}

describe('SIMILAR_COUNT_OPTIONS / DEFAULT', () => {
  it('选项包含 0/2/3/4/6/8', () => {
    expect(SIMILAR_COUNT_OPTIONS).toEqual([0, 2, 3, 4, 6, 8])
  })
  it('默认值是 4', () => {
    expect(DEFAULT_SIMILAR_COUNT).toBe(4)
  })
})

describe('sliceSimilarQuestions', () => {
  it('select=4, 存量 8 → 显示前 4 道, 隐藏 4 道', () => {
    const { shown, hiddenCount, note } = sliceSimilarQuestions(fakeQuestions(8), 4)
    expect(shown).toHaveLength(4)
    expect(shown[0].id).toBe('sq1')
    expect(shown[3].id).toBe('sq4')
    expect(hiddenCount).toBe(4)
    expect(note).toBeNull()
  })

  it('select=4, 存量 3 → 显示全部 3 道, 提示「已显示全部现有 3 道」', () => {
    const { shown, hiddenCount, note } = sliceSimilarQuestions(fakeQuestions(3), 4)
    expect(shown).toHaveLength(3)
    expect(hiddenCount).toBe(0)
    expect(note).toBe('已显示全部现有 3 道同类题')
  })

  it('select=4, 存量 4 → 显示 4 道, 无提示', () => {
    const { shown, hiddenCount, note } = sliceSimilarQuestions(fakeQuestions(4), 4)
    expect(shown).toHaveLength(4)
    expect(hiddenCount).toBe(0)
    expect(note).toBeNull()
  })

  it('select=0 → 不显示, 块由调用方决定不渲染', () => {
    const { shown, hiddenCount } = sliceSimilarQuestions(fakeQuestions(8), 0)
    expect(shown).toHaveLength(0)
    expect(hiddenCount).toBe(0)
  })

  it('select=8, 存量 8 → 显示全部 8 道, 无隐藏提示', () => {
    const { shown, hiddenCount, note } = sliceSimilarQuestions(fakeQuestions(8), 8)
    expect(shown).toHaveLength(8)
    expect(hiddenCount).toBe(0)
    expect(note).toBeNull()
  })

  it('存量 0 → 空, 无提示', () => {
    const { shown, hiddenCount, note } = sliceSimilarQuestions([], 4)
    expect(shown).toHaveLength(0)
    expect(hiddenCount).toBe(0)
    expect(note).toBeNull()
  })
})
