/**
 * LatexPreview - 把含 $...$ / $$...$$ 的文本用 KaTeX 渲染成 HTML
 *
 * 解析策略(2026-09-26 v46+):
 *  1. 优先按 $...$ / $$...$$ 显式包裹切分(尊重用户主动写的)
 *  2. 整段(含显式段)按行再扫:每行如果含 TeX 命令(\sqrt \frac \dfrac \sum \int
 *     ^{ 等)但不含未配对 $ → 整行当块级公式渲染
 *  3. 中文题头/选项标签行(A. 中文)不会触发 TeX 检测,保留为 text
 *  4. KaTeX 解析失败时显示原始 tex 字符串(throwOnError:false)
 *
 * 安全: KaTeX 自身做 HTML 转义,不会执行任意 HTML
 */
import React, { useMemo, useEffect, useRef } from 'react'
import katex from 'katex'

interface Props {
  text: string
  className?: string
}

function renderKatex(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      output: 'html',
      strict: false,
    })
  } catch (e: any) {
    console.warn('[LatexPreview] renderKatex failed for', tex, ':', e?.message)
    return tex
  }
}

// 检测一行是否"看起来是裸 LaTeX"
const TEX_CMD = /\\(?:sqrt|frac|dfrac|sum|prod|int|lim|sin|cos|tan|log|ln|exp|cdot|times|div|pm|leq|geq|neq|approx|pi|alpha|beta|gamma|theta|lambda|mu|sigma|omega|infty|to|rightarrow|Rightarrow|subset|supset|in|notin|cup|cap|forall|exists|nabla|partial|binom|vec|hat|bar|tilde|overline|underline|left|right|begin|end)\b|[\^_]\{/
// 行内包含 $ 但 $ 数量为奇数 → 配对未完成,跳过裸 LaTeX 检测(交给 $ 解析器处理)
function isBareLatexLine(line: string): boolean {
  if (!line.trim()) return false
  const dollarCount = (line.match(/\$/g) || []).length
  if (dollarCount % 2 !== 0) return false  // 奇数 $ 留给显式解析
  return TEX_CMD.test(line)
}

interface Segment {
  kind: 'text' | 'tex' | 'br'
  content?: string
  display?: boolean
}

function parseSegments(input: string): Segment[] {
  if (!input) return []
  const segments: Segment[] = []
  // 1. 先抽出 $$...$$ 块级(避免后续被当行内 $...$ 切分)
  const blockRe = /\$\$([\s\S]+?)\$\$/g
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(input))) {
    if (m.index > cursor) {
      parseInline(input.slice(cursor, m.index), segments)
    }
    segments.push({ kind: 'tex', content: m[1].trim(), display: true })
    cursor = m.index + m[0].length
  }
  if (cursor < input.length) {
    parseInline(input.slice(cursor), segments)
  }
  // 2. 兜底:把每个已生成的 text 段,按行扫,裸 LaTeX 行整行升级为块级公式
  const upgraded: Segment[] = []
  for (const seg of segments) {
    if (seg.kind !== 'text') {
      upgraded.push(seg)
      continue
    }
    const textContent = seg.content ?? ''
    const lines = textContent.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (isBareLatexLine(line)) {
        upgraded.push({ kind: 'tex', content: line.trim(), display: true })
      } else {
        upgraded.push({ kind: 'text', content: line })
      }
      // 在行之间补回换行(非末尾)
      if (i < lines.length - 1) {
        upgraded.push({ kind: 'br' })
      }
    }
  }
  return upgraded
}

function parseInline(s: string, out: Segment[]) {
  // 行内 $...$(不跨行)
  const re = /\$([^\n$]+?)\$/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(s))) {
    if (m.index > last) {
      out.push({ kind: 'text', content: s.slice(last, m.index) })
    }
    out.push({ kind: 'tex', content: m[1].trim(), display: false })
    last = m.index + m[0].length
  }
  if (last < s.length) {
    out.push({ kind: 'text', content: s.slice(last) })
  }
}

export default function LatexPreview({ text, className }: Props) {
  const segs = useMemo(() => parseSegments(text || ''), [text])
  const mountRef = useRef(false)

  // 组件挂载日志(只在首次挂载时输出一次)
  useEffect(() => {
    if (!mountRef.current) {
      console.log('[LatexPreview] MOUNTED')
      mountRef.current = true
    }
    // 每次 text 变化都打
    console.log(
      '[LatexPreview] text=',
      JSON.stringify(text).slice(0, 200),
      'len=',
      (text || '').length,
      'segs=',
      segs.length
    )
  }, [text, segs])

  const html = segs.map((s, i) => {
    if (s.kind === 'br') {
      return <br key={`br${i}`} />
    }
    if (s.kind === 'text') {
      return (
        <React.Fragment key={`t${i}`}>
          {s.content ?? ''}
        </React.Fragment>
      )
    }
    const h = renderKatex(s.content ?? '', !!s.display)
    return (
      <span
        key={`m${i}`}
        // KaTeX 输出的 HTML 已转义,不会注入
        dangerouslySetInnerHTML={{ __html: h }}
      />
    )
  })

  // 始终渲染(包括空时显示占位符),保证 DOM 中能查到 .katex 元素
  return (
    <div
      className={className}
      data-latex-preview="true"
      data-text-len={(text || '').length}
      data-segs-count={segs.length}
    >
      {!text || !text.trim() ? (
        <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>
          （题目识别完成后,数学公式会在这里以 KaTeX 形式预览）
        </span>
      ) : (
        html
      )}
    </div>
  )
}