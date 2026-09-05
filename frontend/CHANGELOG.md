
## v34 (2026-09-05) - AI讲解按钮无反应修复

### 修复
- **底部"AI讲解"按钮点击无反应**: 用户已在 AI 讲解 tab 时，点击底部按钮只触发 `setTabActive('ai')`，而当前 tab 已是 `ai`，所以没有任何效果。改为：若在 AI tab 则直接调用 `handleAnalyze()` 发起分析；否则先切换 tab。

### 修改
- `frontend/src/components/ErrorDetailScreen.tsx`: 底部 AI讲解 按钮点击逻辑

