import { describe, it, expect } from 'vitest'
import { normalizeLatex, normalizeLatexLight } from './latexNormalize.js'

describe('normalizeLatex — unicode 数学符号 → LaTeX', () => {
  it('集合符号 ∪/∩/∈/ℤ', () => {
    expect(normalizeLatex('x ∪ y')).toBe('x \\cup  y')
    expect(normalizeLatex('x ∈ ℤ')).toBe('x \\in  \\mathbb{Z} ')
  })

  it('不等号 ≤', () => {
    expect(normalizeLatex('a ≤ b')).toBe('a \\leq  b')
  })

  it('根号 √ 后接数字/字母 → \\sqrt{}', () => {
    expect(normalizeLatex('√2')).toBe('\\sqrt{2}')
    expect(normalizeLatex('√ab')).toBe('\\sqrt{ab}')
  })

  it('上下标 ^2/^3 → {^2}', () => {
    expect(normalizeLatex('a^2 + b^3')).toBe('a^{2} + b^{3}')
  })

  it('希腊字母 π', () => {
    expect(normalizeLatex('π')).toBe('\\pi ')
  })

  it('箭头 →', () => {
    expect(normalizeLatex('x→y')).toBe('x\\to y')
  })
})

describe('normalizeLatex — 反斜杠修复', () => {
  it('漏反斜杠的 mathrm{i} → \\mathrm{i}', () => {
    expect(normalizeLatex('i + i')).toBe('\\mathrm{i} + \\mathrm{i}')
    // 已正确的不破坏
    expect(normalizeLatex('\\mathrm{i}')).toBe('\\mathrm{i}')
  })

  it('对数 log_2 → \\log_{2}', () => {
    expect(normalizeLatex('log_2 a')).toBe('\\log_{2} a')
  })

  it('双重反斜杠 \\\\sqrt{x} → \\sqrt{x}', () => {
    expect(normalizeLatex('\\\\sqrt{x}')).toBe('\\sqrt{x}')
  })
})

describe('normalizeLatex — 美元符闭合', () => {
  it('未闭合单 $ 自动补全', () => {
    expect(normalizeLatex('x$y')).toBe('x$y$')
  })

  it('已平衡的 $$ 不动', () => {
    expect(normalizeLatex('$a+b$')).toBe('$a+b$')
  })
})

describe('normalizeLatex — 边界与幂等', () => {
  it('空串 / null / undefined 原样返回', () => {
    expect(normalizeLatex('')).toBe('')
    expect(normalizeLatex(null)).toBeNull()
    expect(normalizeLatex(undefined)).toBeUndefined()
  })

  it('幂等: 已规范化的再跑一遍不变', () => {
    expect(normalizeLatex(normalizeLatex('√2'))).toBe('\\sqrt{2}')
    expect(normalizeLatex(normalizeLatex('i + i'))).toBe('\\mathrm{i} + \\mathrm{i}')
  })
})

describe('normalizeLatexLight — title 轻量版', () => {
  it('做规范化并截断到 50 字符', () => {
    expect(normalizeLatexLight('√2')).toBe('\\sqrt{2}')
    const long = normalizeLatexLight('a'.repeat(80))
    expect(long).toHaveLength(50)
  })

  it('空值原样返回', () => {
    expect(normalizeLatexLight('')).toBe('')
    expect(normalizeLatexLight(null)).toBeNull()
  })
})
