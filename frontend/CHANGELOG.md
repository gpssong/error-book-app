
## v35 (2026-09-05) - 选择题打印重叠修复

### 修复
- **选择题打印时选项与题目类型重叠**: 根因是错题卡外层 `overflow-hidden` 在打印时未覆盖，KaTeX 公式被截断后与下方 title 区域重叠；同时题目文本容器的 `maxHeight: 96px` 在打印时仍然生效。改为：
  - 错题卡外层、随机题外层、A4 容器加 `print:overflow-visible`
  - textContent 容器加 `print:max-h-none` 移除打印高度限制
  - title 改为 `print-title-auto`（CSS 类，白空格正常换行不截断）
  - `@media print` 中为 `.katex` 设置 `line-height: 1.2`

### 修改
- `frontend/src/components/PrintPreviewScreen.tsx`
- `frontend/src/index.css`



### 修复
- **底部"AI讲解"按钮点击无反应**: 用户已在 AI 讲解 tab 时，点击底部按钮只触发 `setTabActive('ai')`，而当前 tab 已是 `ai`，所以没有任何效果。改为：若在 AI tab 则直接调用 `handleAnalyze()` 发起分析；否则先切换 tab。

### 修改
- `frontend/src/components/ErrorDetailScreen.tsx`: 底部 AI讲解 按钮点击逻辑

