import { describe, it, expect } from 'vitest'
import {
  extractTitleAndKP,
  trimToFirstQuestion,
  formulaSanityCheck,
  KP_KEYWORDS,
} from './textExtract.js'

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

describe('formulaSanityCheck — 拦幻觉(LLM 把根号/分式脑补成模板)', () => {
  // 用户实际遇到的崩坏: [B] √(x²+4)+4/√(x²+4) 被压成 "a+1/a+4"
  it('4 个选项都套同一模板(都 a+1/a+C) → 拒绝', () => {
    const text = [
      '1. 下列代数式中最小值是 4 的有',
      'A. a + 1/a + 4',
      'B. a + 1/a + 4',
      'C. a + 1/a + 4',
      'D. a + 1/a + 4',
    ].join('\n')
    const r = formulaSanityCheck(text)
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/模板化/)
  })

  it('4 个选项独立符号 < 3 → 拒绝', () => {
    const text = [
      '1. 题干',
      'A. a + b',
      'B. a + 1',
      'C. a + 2',
      'D. a + 3',
    ].join('\n')
    const r = formulaSanityCheck(text)
    expect(r.ok).toBe(false)
    // 实际触发顺序: symbols 检查在 toosimilar 之前
    expect(r.reason).toMatch(/symbols/)
  })

  it('没有 LaTeX 结构(根号/分式/上标全丢了) → 拒绝', () => {
    const text = [
      '1. 题干',
      'A. x + y + 1',
      'B. x + y + 2',
      'C. x + y + 3',
      'D. x + y + 4',
    ].join('\n')
    const r = formulaSanityCheck(text)
    expect(r.ok).toBe(false)
    // 触发顺序: 4 选项形状全部相同(toosimilar)先命中
    expect(r.reason).toMatch(/模板化/)
  })

  it('选项数 < 4 → 拒绝', () => {
    const r = formulaSanityCheck('1. 题干\nA. √x + 1\nB. √x + 2')
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/options/)
  })

  it('空串 → 拒绝', () => {
    expect(formulaSanityCheck('').ok).toBe(false)
    expect(formulaSanityCheck(null).ok).toBe(false)
    expect(formulaSanityCheck(undefined).ok).toBe(false)
  })

  it('真实形态的 4 个含根式/分式的选项 → 通过', () => {
    const text = [
      '1. 下列代数式中最小值是 4 的有',
      'A. \\frac{x}{4}+\\frac{1}{x}+3',
      'B. \\sqrt{x^{2}+4}+\\frac{4}{\\sqrt{x^{2}+4}}',
      'C. x(4-x) \\quad (0<x<4)',
      'D. m^{2}+\\frac{2}{\\sqrt{n(m^{2}-n)}}',
    ].join('\n')
    expect(formulaSanityCheck(text).ok).toBe(true)
  })

  it('通过形态: 上下标 + 简单 LaTeX 命令', () => {
    const text = [
      '1. 求和',
      'A. \\sum_{i=1}^{n} i',
      'B. \\prod_{i=1}^{n} i',
      'C. \\int_{0}^{1} x\\,dx',
      'D. \\lim_{n\\to\\infty} \\frac{1}{n}',
    ].join('\n')
    expect(formulaSanityCheck(text).ok).toBe(true)
  })
})
