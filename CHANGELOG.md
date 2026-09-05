# Changelog

## v18 (2026-09-05) - 删除错题 React #300 真正修复

### 修复
- **v17 修复未生效**:之前只把 `useState deleting` 上移,但 **`useCallback(handleAnalyze)` 和 `useCallback(handleGenerateSimilar)` 仍在 `if (!err) return` 之后**。
- **触发链 v2**:用户从 `ErrorList` 进入 `ErrorDetail` 瞬间,`err` 因 `errors` 尚未加载可能是 `undefined` → 走 early return 分支(只跑 11 个 hooks);接着 `errors` 加载完,`err` 变 defined → 多跑 2 个 `useCallback` → React #300 "Rendered more hooks than during the previous render"
- **v18 修复**:把 `handleAnalyze` / `handleGenerateSimilar` 两个 `useCallback` 上移到 `if (!err) return` 之前;callback 内部用 `if (!err) return` 守门。现在 hook 顺序在所有渲染中固定为 14 个(11×useState + 1×useEffect + 2×useCallback),无论 err 是否存在。

### 部署
- 重新构建前端 hash `index-BvLkYzWd.js`
- APK: `error-book-v18-hook-fix.apk` (5.3MB)

---

## v17 (2026-09-05) - 删除错题 React #300 修复(未生效,见 v18)

### 修复
- **`ErrorDetailScreen.tsx`** `useState(false)` for `deleting` 之前定义在 `if (!err) return` 之后。当删除错题后 `await refreshErrors()` 触发重新渲染,`err` 变 `undefined`,组件走 early return 分支,**hook 数量从 12 变成 11**(少了 `useState deleting`),触发 React #300 "Rendered more hooks than during the previous render"。
- 修复:把 `useState deleting` 上移到组件顶部,与其他 hooks 一起声明,保证 hook 顺序稳定。

### 部署
- 重新构建前端 hash `index-BqaEKU4y.js`
- APK: `error-book-v17-delete-fix.apk` (5.3MB)

---

## v16 (2026-09-05) - 同类练习打印

### 新增
- **`PrintPreviewScreen.tsx`** 在每张错题卡底部追加「📚 同类练习」子网格：
  - 遍历 `err.similarQuestions`，每个同类题一张子卡（蓝底区分于错题白卡）
  - 子卡内容：`LatexPreview` 渲染 `content`（含 KaTeX 公式）+ 解答横线 + 参考答案
  - 排版自适应：2列模式每个错题最多 2 道同类题；1列模式最多 3 道
  - 子卡加 `print:break-inside-avoid`，打印时不被分页截断
- **打印设置面板** 新增 "包含同类练习: 是"
- **顶部工具栏/底部按钮/设置面板** 加 `print:hidden`，打印时不显示

### 部署
- 重新构建前端 hash `index-C7U_uDDD.js`
- APK: `error-book-v16-similar-print.apk` (5.3MB)

---

## v15 (2026-09-05) - 打印显示识别文字 + KaTeX 渲染

### 修改
- **`PrintPreviewScreen.tsx`**: 打印预览的错题卡片从"显示原图"改成"显示识别后的文字（含 KaTeX 公式）"
  - 使用 `<LatexPreview>` 渲染 `textContent`
  - 屏幕预览限制最大高度（2列 96px / 1列 240px）+ `overflow:hidden`
  - 打印模式 `print:overflow-visible print:max-h-none` 解除限制，让学生能看到完整题目
  - 打印字号放大到 `text-[11px]`（屏幕 `text-[10px]`）

### 部署
- 重新构建前端 hash `index-Bx_sjMp2.js`
- APK: `error-book-v15-print-text.apk` (5.3MB)

---

## v14 (2026-09-05) - 录入明细 LaTeX 渲染 + OCR 视觉主路径

### 新增
- **OCR 视觉主路径**: 检测到题目包含公式（`formulaLines >= 1`）时，主路径走 Agnes vision 直接读图，避免 LLM 文本合并看不到图瞎补全（如把 `√(ab)` 错读成 `6`）
- **CHANGELOG.md**（本文件）

### 修复
- `CameraScreen.tsx` batchResult 阶段 "📋 录入明细" 改用 `<LatexPreview>` 渲染（之前用 `<pre>` 原文输出，用户看到 `\sqrt{ab}` 而不是 √ab）

### 部署
- 重新构建前端 hash `index-A3zmNuTp.js`
- 后端 ocr.js 重新部署
- APK: `error-book-v14-latex-render.apk` (5.5MB)

---

## v13 (2026-09-05) - 区域选择 + 多题识别

### 新增
- **`utils/imageCrop.ts`**: 矩形按 [0,1] 比例坐标裁剪，clamp 防越界，输出 JPEG q=0.92
- **`components/RegionSelector.tsx`**: 矩形框选组件
  - 触摸拖拽 + 8 手柄缩放（4 角 + 4 边中点）
  - 多矩形管理（加/删/重置）
  - 默认 1 个全图矩形（零学习成本）
- **`CameraScreen.tsx` 新增 `regionSelect` phase**: 拍照后必经环节
- **批量识别**: 对每个矩形裁剪 → 独立 OCR → 全部入库
- **失败容错**: 单框失败不阻塞其他题，标记 "需手动补录"
- **`batchResult` phase**: 显示 "已自动录入 N 道题到错题库"

### 部署
- 重新构建前端 hash `index-B7MevK13.js`
- APK: `error-book-v13-region-select.apk` (5.5MB)

---

## v12 (2026-09-05) - 删除功能 + LaTeX 后处理

### 新增
- **`ProfileScreen` "孩子管理" 入口**: 菜单项跳 ChildManageScreen
- **`ErrorDetailScreen` 删除按钮**: 详情页底部红色"删除此错题"按钮，二次确认
- **`ErrorListScreen` 批量删除**: 多选模式加"删除"按钮
- **`utils/latexNormalize.js`** (后端): 修复 OCR 输出 LaTeX 不一致
  - unicode 数学符号 → LaTeX 命令（≤≥∈∪∪ℝ 等）
  - `\sqrt` 后缺失花括号修复
  - 反斜杠转义错误修复（`mathrm{i}` → `\mathrm{i}`）
  - 双重反斜杠修复（`\\sqrt` → `\sqrt`）
  - 未闭合 `$` 补全
  - `\mathrm{i}` 重复包裹保护
- **后端 `latexNormalize.js`** 接入 `services/minimax.js` 的 `normalizeParsed()` 和 `routes/ocr.js` 的 textin-direct 兜底

### 部署
- 重新构建前端
- 后端 3 文件 scp + pm2 reload
- APK: `error-book-v12-child-delete.apk`

---

## v11 (2026-09-04) - MiniMax-M3 + KaTeX

### 新增
- **MiniMax-M3**（Anthropic Messages 协议）OCR 文本合并：把 TextIn 碎片化输出修复为标准 LaTeX
- **Agnes text-only**（`agnes-2.5-flash`）兜底：MiniMax 失败时用
- **KaTeX** LaTeX 渲染：`katex@0.16.0`
- **`LatexPreview.tsx`**: 解析 `$...$` 行内 + `$$...$$` 块级
- **错题编辑 textarea 上方**: 加预览区（白底+边框）

### 修复
- TextIn `/v2/recognize` 必须 `application/octet-stream`（不是 JSON body）
- nginx `client_max_body_size 1m` → 20m（OCR 大图不卡 413）

---

## v10 (2026-09-04) - KaTeX 渲染集成

### 新增
- `pnpm add katex@0.16.0`
- `LatexPreview.tsx` 组件
- 字体包 ~63KB，CSS ~14KB gzipped

---

## v9 (2026-09-04) - MiniMax-M3 OCR 修正

### 新增
- `services/minimax.js` `semanticParseText()` 用 MiniMax-M3 修正 OCR 错误
- 字符错误映射表：x2→x^2, 1nx→\ln x, oo→\infty, IJU→\cup, Ve→\sqrt{e}

---

## v8 (2026-09-04) - Agnes AI 文本合并

### 新增
- Agnes `text-only` 模型兜底
- `extractJSON()` 兼容 markdown 代码块

---

## v7 (2026-09-04) - TextIn 直出

### 新增
- TextIn `/v2/recognize` 直接调用，返回 `result.lines[]` 扁平结构
- `recognizeText()` 函数

---

## v6 (2026-09-03) - TextIn 协议修复

### 修复
- TextIn `/v2/recognize` Content-Type 改为 `application/octet-stream`
- nginx `client_max_body_size 20m`

---

## v3-v1 (2026-09-02) - 初版

### 功能
- React 19 + TypeScript + Tailwind CSS v4
- 拍照 / 相册选择
- 文本提交到后端 → 简单 OCR（百度 OCR API 演示版）
- 错题列表 / 详情
- 多用户账号隔离（JWT + bcrypt）