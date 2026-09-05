# Changelog

## v32 (2026-09-05) - AI练习页面底部导航显示修复

### 修复
- **AI同步练习页底部 4 个 tab 恢复正常**：`App.tsx` 的 `showNav` 排除列表误将 `aiPractice` 列入，导致进入该页面后底部导航消失。移除 `aiPractice`，只保留 `errorDetail`/`camera`/`printPreview` 三个无导航页。

### 修改
- `frontend/src/App.tsx`: 第 143 行 `showNav` 排除列表去掉 `'aiPractice'`

### 部署
- 前端: `index-OIDqBvOX.js` ✅ HTTP 200
- Android: `apk/error-book-nav-fix.apk`

---

## v31 (2026-09-05) - AI 讲解 LaTeX 公式渲染

### 修复
- **AI 讲解中的数学公式正常显示**：`ErrorDetailScreen.tsx` 的三条讲解（错误原因 / 知识点讲解 / 分步教程）原来用纯文本 `<p>` 渲染，导致 `\dfrac{1}{a}`、$\log_2 a$ 等 KaTeX 语法以原始字符串显示。改为使用已存在的 `LatexPreview` 组件，支持 `$...$` 行内公式和 `$$...$$` 块级公式。

### 修改
- `frontend/src/components/ErrorDetailScreen.tsx`：引入 `LatexPreview`，替换 371-374 行的 `<p>` 段落

### 部署
- 前端: `index-DE5luEBZ.js` ✅ HTTP 200
- Android: `apk/error-book-latex-fix.apk`

---

## v30b (2026-09-05) - config.html 管理员账号管理面板

### 新增
- **后端 `backend/src/routes/admin.js`**: 管理员专用 API
  - `GET /api/admin/users` — 获取所有注册用户列表（含订阅状态，不含密码）
  - `PATCH /api/admin/users/:id/subscription` — 修改用户套餐类型、到期时间、孩子数
  - `POST /api/admin/users/:id/reset-daily` — 重置用户每日额度（OCR/AI/同类题归零）
  - 全部接口需 JWT + isAdmin:true
- **config.html 管理员面板**（仅 gpssong 可见）:
  - 新增 `🛡️ 管理员` tab，gpssong 登录后自动显示
  - 展示全部注册用户的卡片列表：用户名/邮箱/套餐徽章/到期时间/注册时间
  - 每用户操作按钮：「📦 套餐」弹窗编辑套餐类型+到期时间；「🔄 重置额度」一键清零每日用量
  - 套餐弹窗：免费版/Pro/Family 三档 + 到期日期选择 + 保存确认

### 部署
- 前端: hash 不变（config.html 在 public 目录，Vite 原样拷贝）`index-dYFHc2GL.js` ✅ HTTP 200
- 后端: `/api/admin/*` 已注册路由 ✅ MongoDB 连接成功

---

## v30 (2026-09-05) - AI练习页面：随机同步练习题 + 打印

### 新增
- **后端 `POST /api/ai/random`**: 按科目生成随机练习题（不依赖具体知识点）
  - 传入 `subject` + 可选 `grade`（自动从 childId 反查）
  - 复用 `buildGradePrompt` 注入学段难度提示
  - 受 `ai_similar` 每日额度限制（免费版 3 次/天）
- **前端 `AIPracticeScreen.tsx`**: 全新 AI 随机练习页
  - 顶部科目选择栏（数学/语文/英语/物理/化学/生物）
  - 点击生成 → 调用 `/api/ai/random` 得到 5 道题
  - 每题可展开/收起参考答案（点击"显示参考答案"）
  - "重新出题" + "打印练习" 按钮
- **AppContext**: 新增 `pendingPracticeQuestions` / `pendingPracticeSubject` 状态，跨页传递练习数据到 PrintPreviewScreen
- **App.tsx**: 底部"AI练习" tab 从跳转到 `errorList` 改为跳转新 `aiPractice` 路由

### 改动
- **PrintPreviewScreen.tsx**: 支持双模式
  - `isPracticeMode = true` 时：绿色主题，显示随机练习题（带 green-200 border）
  - `isPracticeMode = false` 时：原有错题打印逻辑不变
  - 头部标题、配色、footer 均根据模式自适应
  - 返回时自动清空 `pendingPracticeQuestions` / `pendingPracticeSubject`
- **api.ts**: 新增 `generateRandom` 方法，对应 `POST /api/ai/random`

### 部署
- 前端: `index-DECF87oQ.js` ✅ HTTP 200
- 后端: `/api/ai/random` ✅ (auth + paywall 检查通过)
- APK: `error-book-v30-ai-practice.apk` (8.4MB)

---

## v29 (2026-09-05) - config.html 配置数据改由后端存储

### 问题
`config.html` 原先将账号/OCR Keys/设置全部存在浏览器 `localStorage`，
而 `error.93gushi.com` 和 `192.168.0.14` 是不同域名 → localStorage 完全隔离，
两边配置的账号和 Key 互不可见。

### 新增
- **`backend/src/schemas/config.js`**: MongoDB 配置模型（单条 `_id: 'global'` 文档）
  - `accounts`: 账号列表 `{ id, username, email, token, exp }`
  - `keys`: OCR/AI/备用 API Keys
  - `current`: 当前选中账号
  - `settings`: 自动降级/并行/日志设置
- **`backend/src/routes/config.js`**:
  - `GET /api/config` — 获取全量配置（公开）
  - `POST /api/config` — 保存全量配置（公开，管理员使用）
- **`backend/src/index.js`**: 注册 `app.use('/api/config', configRoutes)`

### 改动
- **`frontend/public/config.html`** 数据层重构:
  - 移除 `loadData`/`saveData` 等 localStorage 读写函数
  - 新增 `loadConfig()` → `GET /api/config`，页面加载时拉取服务器数据
  - 所有写入操作改为 `saveConfig()` → `POST /api/config`
  - `renderPipelineStatus()` 改用内存变量（不再读 localStorage）
  - `clearAll()` 调用后端清空 API
  - 页脚从"保存在浏览器本地 Storage"改为"保存在服务器"

### 部署
- 前端: hash 不变 `index-BTfGvWnk.js`（config.html 在 public 目录，Vite 原样拷贝）
- 后端: `/api/config` 两端均可访问 ✅ HTTP 200
- 现在无论从 `error.93gushi.com:4040/config.html` 还是
  `192.168.0.14:4040/config.html` 访问，都能看到同一份账号和 Key 配置

---

## v28 (2026-09-05) - 管理员账号gpssong + 账号管理权限控制

### 新增
- **管理员常量**:`backend/src/middleware/auth.js` 导出 `ADMIN_USERNAME = 'gpssong'`
- **JWT 注入 isAdmin**:登录时用户名 == ADMIN_USERNAME → JWT payload 加 `isAdmin:true`,token 里持久化
- **/api/auth/me 返回 isAdmin**:前端 `fetchUser()` 自动同步到 localStorage
- **AuthUser 类型扩展**:`frontend/src/stores/auth.ts` 加 `isAdmin?: boolean`
- **ProfileScreen 权限判断**:`user?.isAdmin` 为 true 才显示"账号管理"菜单项,其他用户隐藏

### 改动
- `backend/src/routes/auth.js`:login 时计算 `isAdmin = user.username === ADMIN_USERNAME`,写入 JWT + 响应体;`GET /me` 同样返回 `isAdmin`
- `backend/src/middleware/auth.js`:解析 token 后注入 `req.isAdmin`
- `frontend/src/stores/api.ts`:`AuthUser` 类型加 `isAdmin?`;`register/login/me` 返回类型同步更新
- `frontend/src/components/ProfileScreen.tsx`:`fetchUser` 合并保存 `isAdmin`;账号管理 MenuButton 加 `{user?.isAdmin && (...)}` 条件渲染

### 部署
- 前端 hash `index-BTfGvWnk.js` ✅ HTTP 200
- 后端 pm2 restart ✅ MongoDB 连接成功
- APK: `error-book-v28-admin.apk` (8.4MB)

---

# Changelog

## v27 (2026-09-05) - 付费墙 + 订阅系统

### 新增
- **User Schema 扩展**: `subscription` 字段含 plan / expiresAt / childrenCount / dailyOcrUsed / dailyAiUsed / dailySimilarUsed / lastResetDate
- **`middleware/paywall.js`**: 每日自动清零 + 额度检查中间件
  - 免费版: OCR 10次/天, AI 讲解 3次/天, 同类题 3次/天
  - Pro/Family: 无限制
- **`routes/subscription.js`**: `GET /api/subscription/me` (查状态) + `POST /api/subscription/upgrade` (手动升级)
- **`UpgradeModal.tsx`**: 三档套餐卡片 (免费/Pro ¥18/月 / Family ¥28/月) + 7天体验提示 + 手动充值流程
- **全局 402 拦截**: `App.tsx` 监听 `PAYWALL_EVENT` 弹出升级弹窗
- **ProfileScreen**: 显示订阅徽章 (免费版显示剩余额度, Pro/Family 显示金色徽章)

### 改动
- `OCR POST /api/ocr` 加 `authMiddleware` + `checkDailyLimit({ action: 'ocr' })`
- `AI /api/ai/analyze` + `/api/ai/similar` 加 `authMiddleware` + 各自额度检查
- `frontend/src/stores/api.ts` 新增 `emitPaywall()`, 402 时自动触发全局事件

### 部署
- 前端 hash `index-bv-X6zNV.js` ✅ HTTP 200
- 后端 pm2 reload ✅ 健康检查通过
- APK: `error-book-v27-paywall.apk` (8.4MB)

---
