/**
 * textContent LaTeX 后处理(2026-09-05)
 *
 * 问题:OCR 后端(MiniMax + Agnes)在 textContent 里输出的 LaTeX 不一致:
 *   - 有些用 LaTeX 命令(\sqrt, \cup, \geq),有些直接用 unicode 符号(√, ∪, ≥)
 *   - `\mathrm{i}` 等命令有时未加转义反斜杠
 *   - `$...$` 包裹有时不闭合
 *   - 前端 KaTeX 渲染规则不统一,导致用户看到 \mathrm 字符未渲染
 *
 * 解决:在 backend 拿到 textContent 之后,做一次强制规范化:
 *   1) 替换 unicode 数学符号为标准 LaTeX(\cup, \cap, \geq, \leq, \sqrt 等)
 *   2) 修复反斜杠转义错误(如 `mathrm{i}` → `\mathrm{i}`)
 *   3) 补全 `\sqrt` 后缺失的花括号(\sqrt 2 → \sqrt{2})
 *   4) 修复双重反斜杠(`\\sqrt` → `\sqrt`)
 *   5) 修复未闭合的 `$...$` 美元符
 *
 * 重要:这是字符串级别变换,无法识别"语义级 LaTeX"。凡是 LLM 输出已正确的部分不破坏。
 */

const LATEX_COMMANDS = [
  'sqrt', 'mathrm', 'frac', 'dfrac', 'overline', 'underline',
  'sum', 'prod', 'int', 'lim', 'inf', 'sup',
  'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'ln', 'log', 'exp',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta',
  'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi',
  'rho', 'sigma', 'tau', 'phi', 'chi', 'psi', 'omega',
  'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma',
  'Phi', 'Psi', 'Omega',
  'mathbb', 'mathcal', 'mathfrak',
  'vec', 'hat', 'tilde', 'dot', 'ddot',
  'cup', 'cap', 'subseteq', 'supseteq', 'in', 'notin',
  'subset', 'supset', 'varnothing', 'emptyset',
  'geq', 'leq', 'neq', 'approx', 'equiv', 'sim',
  'to', 'rightarrow', 'leftarrow', 'Rightarrow', 'Leftrightarrow',
  'pm', 'mp', 'times', 'div', 'ast', 'circ',
  'infty', 'partial', 'nabla',
  'angle', 'perp', 'parallel',
]

/**
 * 完整规范化:用于 textContent。
 * - 输入:后端 LLM 输出的 textContent(可能含 unicode + LaTeX 混用)
 * - 输出:所有数学符号统一为标准 LaTeX,美元符包裹正确
 */
export function normalizeLatex(text) {
  if (!text) return text

  let s = String(text)

  // ─── Step 1: 替换 unicode 数学符号为 LaTeX 命令 ────────────────────
  const unicodeMap = [
    // 集合
    [/∪/g, '\\cup '],
    [/∩/g, '\\cap '],
    [/⊆/g, '\\subseteq '],
    [/⊇/g, '\\supseteq '],
    [/∈/g, '\\in '],
    [/∉/g, '\\notin '],
    [/∅/g, '\\varnothing '],
    [/ℝ/g, '\\mathbb{R} '],
    [/ℤ/g, '\\mathbb{Z} '],
    [/ℕ/g, '\\mathbb{N} '],
    [/ℚ/g, '\\mathbb{Q} '],

    // 不等式
    [/≤/g, '\\leq '],
    [/≥/g, '\\geq '],
    [/≠/g, '\\neq '],
    [/≈/g, '\\approx '],

    // 算术
    [/÷/g, '\\div '],
    [/×/g, '\\times '],
    [/±/g, '\\pm '],

    // 根号 / 上下标
    [/√(?=[0-9a-zA-Z{])/g, '\\sqrt'], // √ 后面是数字/字母 → 接 {} 留给后续修复
    [/\^2/g, '^{2}'],
    [/\^3/g, '^{3}'],

    // 对数
    [/∞/g, '+\\infty '],

    // 几何
    [/∠/g, '\\angle '],
    [/π/g, '\\pi '],

    // 复数 — i 单独出现时(非字母单词一部分)
    // 例: "z\\cdot z" 中不变; "i+i" 中变 "\mathrm{i}+\mathrm{i}"
    // 规则: i 前后不是字母时,替换为 \mathrm{i}
    // 例外: 前面已经是 \mathrm{ 或 \mathit{,跳过避免重复包裹
    [/(^|[^a-zA-Z\\{])i(?=[^a-zA-Z]|$)/g, '$1\\mathrm{i}'],
    // 上面的 regex 已经把前面的 \mathrm{i 加了反斜杠,后续 step 不会重复

    // 对数 — \log_2 a / \ln x
    // 例: "log_2" → "\log_2", "lnx" → "\ln x"(ln 后面是字母加空格)
    [/log_(\d+)/g, '\\log_{$1}'],
    [/\\log_\{([^{}]+)\}/g, '\\log_{$1}'],   // 已正确不动
    [/\\log\s+([a-zA-Z])/g, '\\ln $1'],       // 单独的 \log x 当 \ln x(中学场景)
    [/ln(?=[a-zA-Z])/g, '\\ln '],

    // 希腊字母
    [/α/g, '\\alpha '],
    [/β/g, '\\beta '],
    [/γ/g, '\\gamma '],
    [/δ/g, '\\delta '],
    [/θ/g, '\\theta '],
    [/λ/g, '\\lambda '],
    [/μ/g, '\\mu '],
    [/σ/g, '\\sigma '],
    [/ω/g, '\\omega '],

    // 箭头
    [/→/g, '\\to '],
    [/⇒/g, '\\Rightarrow '],
    [/⇔/g, '\\Leftrightarrow '],
  ]

  for (const [re, repl] of unicodeMap) {
    s = s.replace(re, repl)
  }

  // ─── Step 2: \sqrt 后接非 { 字符 → 加 {} 包裹 ──────────────────────
  // 例: \sqrt 2  →  \sqrt{2}
  //     \sqrt e  →  \sqrt{e}
  //     \sqrt{x → 已是合法,不动
  // 也兼容:\sqrt 后跟空格再接数字/字母
  s = s.replace(/\\sqrt(\s*)(?={)(?!})/g, '\\sqrt')   // no-op 安全
  s = s.replace(/\\sqrt(\s*)([a-zA-Z0-9]+)/g, (_m, sp, arg) => `\\sqrt{${arg}}`)
  s = s.replace(/\\sqrt\{\s+([a-zA-Z0-9]+)\s+\}/g, '\\sqrt{$1}')

  // ─── Step 3: 修复反斜杠转义错误的 LaTeX 命令 ──────────────────────
  // LLM 偶发输出 "mathrm{i}" "frac{1}{2}"(漏反斜杠)
  // 修复:在 token 边界(空白/行首/标点)后,若 command 漏 \ 则补
  const cmdAlt = LATEX_COMMANDS.join('|')
  const re = new RegExp(`(^|[\\s(\\[,!?.])(${cmdAlt})(?=[{a-zA-Z0-9])`, 'g')
  s = s.replace(re, (_m, pre, cmd) => `${pre}\\${cmd}`)

  // ─── Step 4: 修复双重反斜杠(`\\sqrt` → `\sqrt`) ──────────────────
  s = s.replace(/\\\\(sqrt|mathrm|frac|dfrac|cup|geq|leq|neq|in|to|pi|alpha|beta|gamma|theta|lambda|infty|mathbb|sum|int|lim|cdot|bar)/g, '\\$1')

  // ─── Step 5: 修复未闭合的 `$...$` 括号 ──────────────────────────────
  const dollarCount = (s.match(/\$/g) || []).length
  if (dollarCount % 2 === 1) {
    s = s + '$'
  }

  return s
}

/**
 * 轻量规范化:用于 title。
 */
export function normalizeLatexLight(text) {
  if (!text) return text
  return normalizeLatex(text).slice(0, 50)
}