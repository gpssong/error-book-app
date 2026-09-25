import { describe, it, expect } from 'vitest'
import { extractTitleAndKP, trimToFirstQuestion, KP_KEYWORDS } from './textExtract.js'

describe('extractTitleAndKP', () => {
  it('去掉题号取前 20 字做 title', () => {
    const { title } = extractTitleAndKP('3. 已知 a>0,b>0,求最小值')
    expect(title).toBe('已知 a>0,b>0,求最小值')
  })

  it('title 空 → 未命名题目', () => {
    expect(extractTitleAndKP('', '数学').title).toBe('未命名题目')
  })

  it('命中知识点关键词(数学) — 按池顺序取第一个命中的', () => {
    // 数学池里「函数」排在「对数」前, 所以先命中「函数」
    const { knowledgePoint } = extractTitleAndKP('求对数函数的最值', '数学')
    expect(knowledgePoint).toBe('函数')
    // 只含对数相关词时命中「对数」
    const r2 = extractTitleAndKP('已知对数值求大小', '数学')
    expect(r2.knowledgePoint).toBe('对数')
  })

  it('没命中任何关键词 → 退回 subject 本身', () => {
    const { knowledgePoint } = extractTitleAndKP('一段普通文字', '物理')
    expect(knowledgePoint).toBe('物理')
  })

  it('未知学科 → 用数学关键词池', () => {
    expect(KP_KEYWORDS.数学).toBeDefined()
    // 传一个不在池里的 subject, 应回退到数学池
    const { knowledgePoint } = extractTitleAndKP('关于函数的题目', '未知学科')
    expect(knowledgePoint).toBe('函数')
  })
})

describe('trimToFirstQuestion', () => {
  it('截断到第二个题号之前', () => {
    const text = [
      '前言',
      '1. 第一道题内容',
      'A. 选项',
      'B. 选项',
      '2. 第二道题内容',
      'C. 选项',
    ].join('\n')
    expect(trimToFirstQuestion(text)).toBe('1. 第一道题内容\nA. 选项\nB. 选项')
  })

  it('只有一个题号 → 取到末尾', () => {
    const text = '1. 唯一一题\nA. 甲\nB. 乙'
    expect(trimToFirstQuestion(text)).toBe('1. 唯一一题\nA. 甲\nB. 乙')
  })

  it('没有题号 → 从 0 取到末尾(整段)', () => {
    const text = '没有题号的纯文本\n第二行'
    expect(trimToFirstQuestion(text)).toBe('没有题号的纯文本\n第二行')
  })

  it('支持中文顿号/全角点 1．', () => {
    const text = '1．甲题\nx\n2．乙题\ny'
    expect(trimToFirstQuestion(text)).toBe('1．甲题\nx')
  })
})
