# Changelog

## v24 (2026-09-05) - 登录后孩子/错题数据不显示修复

### Bug
**用户反馈**:"更新 app 以后再登录 gpssong 账号后小孩信息和错题信息没有显示"。

### 根因
- `AppProvider`(包裹 `AppContent`)在 **App 启动时立即挂载**,早于登录页出现。
- AppContext 第 164 行初始化 `useEffect(() => { refreshChildren() }, [])` 在挂载时立刻发请求 → **此时 `auth.getToken()` 返回 null** → 后端 401 → `refreshChildren` 重试 3 次全部失败 → children 永远是空数组,activeChildId 永远是 `''`。
- 用户从登录页完成登录后:`setLoggedIn(true)` 只触发 AppContent 内部渲染切换,但 AppProvider 不会重新挂载,所以 `refreshChildren` 不会再被调用 → children 一直空 → dashboard 显示"暂无孩子"。
- 后续 `refreshErrors` 因 `state.activeChildId === ''` 短路 return,错题自然也加载不到。

### 修复
1. **`stores/auth.ts`**:新增 `LOGIN_SUCCESS_EVENT = 'error-book:login-success'` + `emitLoginSuccess()`,与 AUTH_EVENT(401)语义分开
2. **`stores/AppContext.tsx`**:
   - 初始化 `useEffect` 加 `if (auth.isLoggedIn())` 守卫 —— 首次启动无 token 时不浪费 401 重试
   - 新增第二个 `useEffect` 监听 `LOGIN_SUCCESS_EVENT`,登录成功后立即调 `refreshChildren()`
3. **`components/LoginScreen.tsx`** + **`RegisterScreen.tsx`**:登录/注册成功后 `auth.setSession()` 之后调 `emitLoginSuccess()`

### 部署
- 前端 hash `index-BQy1yMku.js` ✅ HTTP 200
- APK: `error-book-v24-data-load-fix.apk` (5.3MB)

---

### 改动
- `PrintPreviewScreen.tsx` `showAnswer` 默认值 `true` → `false`
- 打印场景主要是给学生做错题练习,参考答案不打印;用户在打印页右上角"含参考答案"开关可手动开启
- 同步:`打印设置` 面板的"包含参考答案"显示值改为 `showAnswer ? '是' : '否'`(之前硬编码"是")

---

## v23 (2026-09-05) - 打印 A4 顶天立地 + 底部 tab 不打印

### 修复
**Bug 5**: 用户截图反馈打印时"A4 上下空得太多了,A4 纸浪费,最下面首页/错题/AI练习/我的 不需要打印"。

**3 个根因**:
1. **`body { display:flex; align-items:center; justify-content:center }` 在 `@media print` 没被重置** —— `index.css` 把 `#root`(375×812 浏览器壳)水平+垂直居中,打印时这个居中布局**仍然生效**,把 `#root`(内容撑高后)在 A4 纸上**垂直居中** → 视觉上 A4 上下都留白。
2. **A4 容器没有强制 210mm×297mm 尺寸** —— `PrintPreviewScreen.tsx` 的 A4 容器只有内容高度(2 道错题时约 400px),远小于 297mm 纸 → 容器下方大片白底。
3. **`App.tsx` 的 `showNav` 排除列表没包含 `printPreview`** → 底部 4 个 tab(首页/错题/AI练习/我的)跟着打印。BottomNav 外层 div 也没加 `print:hidden` 兜底。

### 改动(4 个文件)
1. **`index.css` `@media print` 块扩展**:
   - 新增 `@page { size: A4; margin: 0 }`
   - `@media print` 内 `html, body` 用 `!important` 重置 `display/align-items/justify-content/background`,解除 flex 居中
2. **`App.tsx`**:
   - 第 88 行 `BottomNav` 加 `print:hidden` 兜底
   - 第 104 行 `showNav` 排除列表 `['errorDetail', 'camera']` → `['errorDetail', 'camera', 'printPreview']`
3. **`PrintPreviewScreen.tsx`**:
   - 第 56 行最外层 `flex flex-col h-full bg-[#F8FAFC]` 加 `print:bg-white print:h-auto`
   - 第 163 行 A4 容器加 `print:w-[210mm] print:min-h-[297mm] print:mx-auto` —— 强制等于 A4 纸尺寸
   - 第 181 行 grid 加 `print:py-8 print:px-10 print:gap-4` —— A4 内部版心更宽松

### 部署
- 重新构建前端 + 部署到 192.168.0.14
- APK: `error-book-v23-print-tight.apk`

---

## v22 (2026-09-05) - "含参考答案"开关变真开关

### 修复
- **`PrintPreviewScreen` 含参考答案开关无法点击**:之前的"开关"是**纯装饰品 div**(`<div>` 套 `<div>`,没 `onClick` 也没 `state`),看起来像 toggle 但点不动 —— 用户反馈"想关参考答案关不掉"。
- **v22 修复**:
  1. 新增 `const [showAnswer, setShowAnswer] = useState(true)` state(默认开,保持 v21 之前行为)
  2. 装饰 div 改成真 `<button type="button" aria-pressed={showAnswer} onClick={() => setShowAnswer(v => !v)}>`
  3. 颜色根据 state 切换:`#2563EB` (开) ↔ `#CBD5E1` (关),圆点位置 `flex-end` ↔ `flex-start`
  4. 错题卡"参考答案:X" 区域改用 `{showAnswer ? (...) : ('已隐藏参考答案')}` —— 关掉时显示提示占位而不是留空
  5. 同类题"答案:X" 也加 `{showAnswer && sq.answer && (...)}` —— 关掉时连同类题答案都不显示

### 部署
- 重新构建前端 hash `index-6g6YU5Ld.js` ✅ HTTP 200
- APK: `error-book-v22-toggle-fix.apk` (5.3MB)

---

### 修复
- **v19/v20 修复漏的入口**:`ErrorDetailScreen` 底部"打印此题"按钮 (`onErrorId('printPreview')`) 之前**没有**调 `setPendingPrintIds`,从详情页进打印页时 `pendingPrintIds = []` → 走默认全量显示 → 用户看到"明明打印 1 题却有 4 道题"。
- **v21 修复**:按钮 onClick 时先把 `[errorId]` 写进 `pendingPrintIds`:
  ```tsx
  onClick={() => { setPendingPrintIds([errorId]); onErrorId('printPreview') }}
  ```
  打印页用 `useState<string[]>(pendingPrintIds)` 读初值,自动只显示这一道。

### 部署
- 重新构建前端 hash `index-CHxKNV9f.js` ✅ HTTP 200
- APK: `error-book-v21-detail-print.apk` (5.3MB)

---

## v20 (2026-09-05) - v19 漏 import useState 修复

### 修复
- **v19 引入的新 bug**:`AppContext.tsx` 加 `pendingPrintIds` 时只往 context value 加导出,**忘了往 `import` 加 `useState`** → 整个 AppProvider 抛 `ReferenceError: useState is not defined`,所有渲染 `useApp()` 的页面(ErrorList/PrintPreview/ErrorDetail 等)都崩。
- **报错现象**:用户在 ErrorList / PrintPreview 等页面看到"页面开小差了 / useState is not defined"的错误边界卡片。
- **根因**:AppContext.tsx line 12 在 `import React, { createContext, useContext, useReducer, useEffect, useCallback } from 'react'` 里**没有 useState**,但文件第 112 行用了 `const [pendingPrintIds, setPendingPrintIds] = useState<string[]>([])`。Vite build 没报错(因为模块顶层 throw 时通常静默),runtime 直接挂。
- **v20 修复**:`import` 加上 `useState`:
  ```ts
  import React, { createContext, useContext, useReducer, useEffect, useCallback, useState } from 'react'
  ```

### 教训
- 改文件时若新引入 React hook,**必须回头核对 `import` 行**
- Vite 不会对"调用了未导入标识符"报 build 错 —— 必须靠运行时检查或单元测试覆盖

### 部署
- 重新构建前端 hash `index-DNbQZAMp.js` ✅ HTTP 200
- APK: `error-book-v20-import-fix.apk` (5.3MB)

---

### 修复
- **`PrintPreviewScreen` 选中状态丢失 Bug**:`ErrorList` 多选模式勾选 N 道题 → 点"打印(N)" → 进入打印页 → 显示**全部孩子错题**(默认 slice(0,6))而非用户选中的 N 道。
- **根因**:`PrintPreviewScreen` 的 `selectedIds` 是组件本地 state (永远空 `[]`),`ErrorListScreen` 跳转打印时 `onNavigate('printPreview')` **没有传任何 ID**;打印页走 `selectedIds.length > 0 ? ... : childErrors.slice(0, 6)` 默认分支。
- **v19 修复**:
  1. `AppContext` 新增 `pendingPrintIds: string[]` + `setPendingPrintIds` 跨页 state
  2. `ErrorListScreen` 跳转打印前调 `setPendingPrintIds(selectedErrors)`,把选中的 IDs 传出去
  3. `PrintPreviewScreen` 用 `useState<string[]>(pendingPrintIds)` 读取初值
  4. 打印页头部新增"📋 题目选择"区:横排 chip 显示每道题,蓝色=已选,灰色=未选,可点击切换;带"全选/清空"快捷按钮;未选时显黄色警告
  5. 返回 / 卸载时清空 `pendingPrintIds`,避免下次残留

### 部署
- 重新构建前端 hash `index-DGaNNESL.js` ✅ HTTP 200
- APK: `error-book-v19-print-select.apk` (5.3MB)

---

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