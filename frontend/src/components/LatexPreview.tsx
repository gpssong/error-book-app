/**
 * LatexPreview - 把含 $...$ / $$...$$ 的文本用 KaTeX 渲染成 HTML
 *
 * 解析策略:
 *  - 先把 $$...$$ 块级公式替换为占位符(避免内联解析误伤)
 *  - 再按 $...$ 切分成 [text, tex, text, tex, ...] 数组
 *  - text 用 React 渲染,tex 用 KaTeX 渲染成 HTML
 *  - KaTeX 解析失败时显示原始 tex 字符串(throwOnError:false)
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

interface Segment {
  kind: 'text' | 'tex'
  content: string
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
  return segments
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
    if (s.kind === 'text') {
      return s.content
        .split('\n')
        .map((line, j) => (
          <React.Fragment key={`t${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </React.Fragment>
        ))
    }
    const h = renderKatex(s.content, !!s.display)
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