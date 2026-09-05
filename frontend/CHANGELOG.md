## v36 (2026-09-05) - 打印参考答案改用AI讲解答案

### 修复
- **打印时参考答案优先用AI讲解答案**：`getAnswer()` 函数优先使用 `aiAnalysis.answer`（AI 讲解最终答案），其次才用同类题第一个答案。

### 修改
- `backend/src/schemas/errorQuestion.js`: aiAnalysis schema 增加 answer 字段
- `backend/src/routes/ai.js`: AI 讲解 prompt 增加 answer 字段要求
- `frontend/src/stores/api.ts`: ErrorItem.aiAnalysis 增加 answer 字段
- `frontend/src/components/ErrorDetailScreen.tsx`: 保存 answer 到 aiAnalysis
- `frontend/src/components/PrintPreviewScreen.tsx`: getAnswer 优先用 AI 讲解答案

### 部署
- 前端: `index-eFL510xG.js` ✅ HTTP 200
- Android: `apk/error-book-print-answer-fix.apk`
