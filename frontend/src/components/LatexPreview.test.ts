/**
 * LatexPreview - 解析策略测试(v46+)
 * 覆盖三种核心路径:
 *  1. 显式 $...$ → tex(inline)
 *  2. 显式 $$...$$ → tex(display)
 *  3. 裸 LaTeX 行(含 \sqrt/\frac/^{ 等) → tex(display,自动识别)
 *  4. 纯中文/纯文本 → text(无误伤)
 */
import { describe, it, expect } from 'vitest'

// 直接复刻 parseSegments 的纯函数版本(避免引入 JSX/React 依赖)
const TEX_CMD = /\\(?:sqrt|frac|dfrac|sum|prod|int|lim|sin|cos|tan|log|ln|exp|cdot|times|div|pm|leq|geq|neq|approx|pi|alpha|beta|gamma|theta|lambda|mu|sigma|omega|infty|to|rightarrow|Rightarrow|subset|supset|in|notin|cup|cap|forall|exists|nabla|partial|binom|vec|hat|bar|tilde|overline|underline|left|right|begin|end)\b|[\^_]\{/

function isBareLatexLine(line: string): boolean {
  if (!line.trim()) return false
  const dollarCount = (line.match(/\$/g) || []).length
  if (dollarCount % 2 !== 0) return false
  return TEX_CMD.test(line)
}

interface Segment { kind: 'text' | 'tex' | 'br'; content?: string; display?: boolean }

function parseSegments(input: string): Segment[] {
  if (!input) return []
  const segments: Segment[] = []
  const blockRe = /\$\$([\s\S]+?)\$\$/g
  let cursor = 0, m
  while ((m = blockRe.exec(input))) {
    if (m.index > cursor) parseInline(input.slice(cursor, m.index), segments)
    segments.push({ kind: 'tex', content: m[1].trim(), display: true })
    cursor = m.index + m[0].length
  }
  if (cursor < input.length) parseInline(input.slice(cursor), segments)
  const upgraded: Segment[] = []
  for (const seg of segments) {
    if (seg.kind !== 'text') { upgraded.push(seg); continue }
    const lines = (seg.content ?? '').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isBareLatexLine(line)) upgraded.push({ kind: 'tex', content: line.trim(), display: true })
      else upgraded.push({ kind: 'text', content: line })
      if (i < lines.length - 1) upgraded.push({ kind: 'br' })
    }
  }
  return upgraded
}

function parseInline(s: string, out: Segment[]) {
  const re = /\$([^\n$]+?)\$/g
  let last = 0, m
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ kind: 'text', content: s.slice(last, m.index) })
    out.push({ kind: 'tex', content: m[1].trim(), display: false })
    last = m.index + m[0].length
  }
  if (last < s.length) out.push({ kind: 'text', content: s.slice(last) })
}

describe('LatexPreview.parseSegments', () => {
  it('裸 LaTeX 行(含 \\dfrac)自动升级为块级公式', () => {
    const segs = parseSegments('A. \\dfrac{x}{4}+\\dfrac{1}{x}+3')
    expect(segs).toEqual([{ kind: 'tex', content: 'A. \\dfrac{x}{4}+\\dfrac{1}{x}+3', display: true }])
  })

  it('裸 LaTeX 行 + 中文混排 → 逐行正确分类', () => {
    const input = `第 1 题 代数式最小值判断
9.下列代数式中,最小值是 4 的有
A. \\dfrac{x}{4}+\\dfrac{1}{x}+3
B. \\sqrt{x^{2}+4}+\\dfrac{4}{\\sqrt{x^{2}+4}}`
    const segs = parseSegments(input)
    // 第 1 行:text + br + 第 2 行:text + br + A 行:tex + br + B 行:tex
    expect(segs[0]).toEqual({ kind: 'text', content: '第 1 题 代数式最小值判断' })
    expect(segs[1].kind).toBe('br')
    expect(segs[2]).toEqual({ kind: 'text', content: '9.下列代数式中,最小值是 4 的有' })
    expect(segs[3].kind).toBe('br')
    expect(segs[4]).toMatchObject({ kind: 'tex', display: true })
    expect((segs[4] as any).content).toContain('\\dfrac')
    expect(segs[5].kind).toBe('br')
    expect(segs[6]).toMatchObject({ kind: 'tex', display: true })
    expect((segs[6] as any).content).toContain('\\sqrt')
  })

  it('显式 $...$ 包裹的公式 → 行内 tex(display:false)', () => {
    const segs = parseSegments('已知 $x^2+4$ 求最小值')
    expect(segs).toEqual([
      { kind: 'text', content: '已知 ' },
      { kind: 'tex', content: 'x^2+4', display: false },
      { kind: 'text', content: ' 求最小值' },
    ])
  })

  it('显式 $$...$$ 块级公式优先于裸 LaTeX 检测', () => {
    const segs = parseSegments('$$\\sqrt{x^2+4}$$')
    expect(segs).toEqual([{ kind: 'tex', content: '\\sqrt{x^2+4}', display: true }])
  })

  it('奇数个 $ 不触发裸 LaTeX 检测(避免破坏跨段 $...$ 配对)', () => {
    // "未配对 $a" 不会被误判为 LaTeX,留给 $...$ 解析器处理
    const segs = parseSegments('价格是 $5 美元')
    // 内层 parseInline 在奇数 $ 时不会切出 tex 段,整段是 text
    // 然后裸 LaTeX 检测:奇数 $ → 跳过
    expect(segs.every((s) => s.kind !== 'tex')).toBe(true)
  })

  it('纯中文行不触发 LaTeX 检测', () => {
    const segs = parseSegments('第 1 题\n下列说法正确的是\nA. 苹果是水果')
    expect(segs.every((s) => s.kind !== 'tex')).toBe(true)
    expect(segs.filter((s) => s.kind === 'text').map((s) => s.content)).toEqual([
      '第 1 题',
      '下列说法正确的是',
      'A. 苹果是水果',
    ])
  })

  it('空字符串返回空数组', () => {
    expect(parseSegments('')).toEqual([])
  })

  it('纯函数表达式行 C. x(4-x)(0<x<4) 不含 TeX 命令 → text', () => {
    // 修复点: 录入明细里 C 选项这种纯函数表达式不应被当 LaTeX
    const segs = parseSegments('C. x(4-x)(0<x<4)')
    expect(segs).toEqual([{ kind: 'text', content: 'C. x(4-x)(0<x<4)' }])
  })

  it('^{x} 单字符命令触发裸 LaTeX 检测', () => {
    const segs = parseSegments('m^{2}+n^{3}')
    expect(segs[0]).toMatchObject({ kind: 'tex', display: true })
  })
})