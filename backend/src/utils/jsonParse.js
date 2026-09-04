/**
 * 共享 JSON 解析工具
 *
 * 三个地方（ocr.js / ai.js / minimax.js）各自实现了一遍 extractJSON，
 * 逻辑略有差异，抽到统一模块避免维护偏差。
 *
 * 支持：
 *   1. 直接 JSON.parse
 *   2. ```json ... ``` markdown 代码块
 *   3. 文本中首个 { ... } 块（最外层括号匹配）
 */
export function extractJSON(text) {
  if (!text) return null
  try { return JSON.parse(text) } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (fenced) {
    try { return JSON.parse(fenced[1]) } catch {}
  }
  let depth = 0, start = -1
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') { if (depth === 0) start = i; depth++ }
    else if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try { return JSON.parse(text.slice(start, i + 1)) } catch {}
      start = -1
    }}
  }
  return null
}
