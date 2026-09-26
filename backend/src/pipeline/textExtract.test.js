import { describe, it, expect } from 'vitest'
import {
  extractTitleAndKP,
  trimToFirstQuestion,
  formulaSanityCheck,
  figureRegionFromTextPositions,
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

describe('figureRegionFromTextPositions — v47 后端 fallback', () => {
  // 工具:把 {x,y,w,h} 转成 4 顶点 polygon
  const toPoly = (x, y, w, h) => [
    x, y,
    x + w, y,
    x + w, y + h,
    x, y + h,
  ]

  it('空数组 → null', () => {
    expect(figureRegionFromTextPositions([])).toBe(null)
    expect(figureRegionFromTextPositions(null)).toBe(null)
    expect(figureRegionFromTextPositions(undefined)).toBe(null)
  })

  it('只有一条文字(覆盖整图 80%) → null(不是插图)', () => {
    // 文字覆盖 90% 整图 → 补集太小 → 拒绝
    const positions = [toPoly(0.05, 0.05, 0.9, 0.9)]
    expect(figureRegionFromTextPositions(positions)).toBe(null)
  })

  it('上半部分全文字 + 下半空白 → 命中下半空白作为 figureRegion', () => {
    // 上半 50% 全是文字,下半 50% 空白 → 应该返回下半区域
    const positions = [toPoly(0, 0, 1, 0.5)]
    const r = figureRegionFromTextPositions(positions)
    expect(r).not.toBe(null)
    // 下半空白 y ≈ 0.5, h ≈ 0.5
    expect(r.y).toBeGreaterThanOrEqual(0.4)
    expect(r.h).toBeGreaterThan(0.3)
  })

  it('左侧文字 + 右侧空白 → 命中右侧空白作为 figureRegion', () => {
    // 左侧 30% 全是文字,右侧 70% 空白
    const positions = [toPoly(0, 0, 0.3, 1)]
    const r = figureRegionFromTextPositions(positions)
    expect(r).not.toBe(null)
    expect(r.x).toBeGreaterThan(0.2)
    expect(r.w).toBeGreaterThan(0.3)
  })

  it('2 个文字块在四角 + 中间空白 → 命中中间空白', () => {
    // 左上角文字 + 右下角文字 → 中间空白 = 示意图
    const positions = [
      toPoly(0, 0, 0.3, 0.2),  // 左上
      toPoly(0.7, 0.8, 0.3, 0.2),  // 右下
    ]
    const r = figureRegionFromTextPositions(positions)
    expect(r).not.toBe(null)
    // 中间区域: x ≈ 0.3~0.7, y ≈ 0.2~0.8
    expect(r.x).toBeLessThan(0.4)
    expect(r.x + r.w).toBeGreaterThan(0.6)
    expect(r.y).toBeLessThan(0.4)
    expect(r.y + r.h).toBeGreaterThan(0.6)
  })

  it('文字稀疏(< 15% 整图) → null', () => {
    // 一小块文字,补集 > 80% → 拒绝(可能纯文字题,无图)
    const positions = [toPoly(0.45, 0.45, 0.05, 0.05)]
    expect(figureRegionFromTextPositions(positions)).toBe(null)
  })

  it('坏数据(长度 < 8 / 非数组) → 跳过该条,继续用其余', () => {
    const positions = [
      toPoly(0, 0, 1, 0.5),  // 正常:上半文字
      null,
      undefined,
      [0.1, 0.1, 0.2],  // 长度 3,坏数据
      'not-an-array',
      toPoly(0, 0.5, 1, 0.5),  // 正常:下半文字
    ]
    const r = figureRegionFromTextPositions(positions)
    // 上下都覆盖 → 补集太小 → 拒绝(整图几乎全是文字,不是插图)
    expect(r).toBe(null)
  })

  it('返回坐标都是 [0,1] 归一化', () => {
    const positions = [toPoly(0, 0, 1, 0.4)]
    const r = figureRegionFromTextPositions(positions)
    expect(r).not.toBe(null)
    expect(r.x).toBeGreaterThanOrEqual(0)
    expect(r.y).toBeGreaterThanOrEqual(0)
    expect(r.x + r.w).toBeLessThanOrEqual(1.001)
    expect(r.y + r.h).toBeLessThanOrEqual(1.001)
  })

  // ─── v48.2 P1:「文字包围中央图」启发式 ───────────────────────────────
  it('四边都有文字 + 中央空白(立方体线框图布局) → 命中中央作为 figureRegion', () => {
    // 模拟「昆虫爬立方体」真实布局:题干多行在上、选项 ABCD 在下、左右少量题目文字
    // 中央大块空白 = 立方体线框图(被文字四面包围)
    // 纯补集法会选到「行间缝隙」贴边块 → 启发式改用「中央被包围的最大未 occupied 块」
    const positions = [
      toPoly(0.05, 0.08, 0.90, 0.04),  // 题干 1
      toPoly(0.05, 0.14, 0.90, 0.04),  // 题干 2
      toPoly(0.05, 0.20, 0.90, 0.04),  // 题干 3
      toPoly(0.05, 0.30, 0.12, 0.04),  // 左带(题目文字)
      toPoly(0.83, 0.30, 0.12, 0.04),  // 右带(题目文字)
      toPoly(0.05, 0.70, 0.90, 0.05),  // 选项 A
      toPoly(0.05, 0.78, 0.90, 0.05),  // 选项 B
      toPoly(0.05, 0.86, 0.90, 0.05),  // 选项 C
      toPoly(0.05, 0.94, 0.90, 0.04),  // 选项 D
    ]
    const r = figureRegionFromTextPositions(positions)
    expect(r).not.toBe(null)
    // 中央区域: x ≈ 0.14~0.85, y ≈ 0.23~0.70(图所在)
    expect(r.x).toBeGreaterThanOrEqual(0.10)
    expect(r.x + r.w).toBeLessThanOrEqual(0.86)
    expect(r.y).toBeGreaterThanOrEqual(0.18)
    expect(r.y + r.h).toBeLessThanOrEqual(0.72)
  })

  it('纯文字题(文字填满,四边都密) → 仍返回 null(启发式不该误触发)', () => {
    // 整图高密度文字,没有任何中央空白 → 不该启发式出图
    const positions = []
    for (let i = 0; i < 20; i++) {
      positions.push(toPoly(0.05, (i / 20) * 0.95, 0.9, 0.045))
    }
    expect(figureRegionFromTextPositions(positions)).toBe(null)
  })
})

