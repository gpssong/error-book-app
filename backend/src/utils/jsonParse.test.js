import { describe, it, expect } from 'vitest'
import { extractJSON } from './jsonParse.js'

describe('extractJSON', () => {
  it('直接 JSON.parse 优先', () => {
    expect(extractJSON('{"a":1}')).toEqual({ a: 1 })
    expect(extractJSON('[1,2,3]')).toEqual([1, 2, 3])
  })

  it('支持 ```json ... ``` markdown 围栏', () => {
    expect(extractJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    // 围栏无 json 标签
    expect(extractJSON('```\n{"b":"x"}\n```')).toEqual({ b: 'x' })
  })

  it('提取文本中首个最外层 {...} 块', () => {
    const text = '好的, 识别结果如下: {"title":"对数","count":3} 希望有帮助'
    expect(extractJSON(text)).toEqual({ title: '对数', count: 3 })
  })

  it('嵌套大括号正确匹配(最外层)', () => {
    expect(extractJSON('xx {"a":{"b":[1,2]} ,"c":2} yy')).toEqual({ a: { b: [1, 2] }, c: 2 })
  })

  it('围栏内的字符串字面量不影响外层括号匹配', () => {
    // 外层块里带字符串
    expect(extractJSON('res: {"msg":"a{b}c","n":1} done')).toEqual({ msg: 'a{b}c', n: 1 })
  })

  it('空 / undefined / null 返回 null', () => {
    expect(extractJSON('')).toBeNull()
    expect(extractJSON(undefined)).toBeNull()
    expect(extractJSON(null)).toBeNull()
  })

  it('无有效 JSON 时返回 null', () => {
    expect(extractJSON('纯文本没有大括号')).toBeNull()
    // 括号不闭合
    expect(extractJSON('{"a":1')).toBeNull()
  })

  it('跳过不可解析的围栏 / 块, 取下一个可解析的', () => {
    // 围栏内容是坏 JSON, 但后面有合法块
    expect(extractJSON('```json\n{bad}\n```\n{"ok":true}')).toEqual({ ok: true })
  })
})
