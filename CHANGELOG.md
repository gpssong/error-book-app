# Changelog

## v38.1 (2026-09-14) - 登录态持久化 + APK 插件链接修复 + 飞牛 nginx 挂载加固

### 修复

#### 1. 登录态持久化(SharedPreferences 双写 + 启动回填)

App 杀进程后**仍要求重新登录**的根因是 WebView localStorage 被 Android 系统回收。修复:

- **前端 `frontend/src/stores/auth.ts`**:
  - 新增 native 侧常量 `NATIVE_TOKEN_KEY = 'native_token'` / `NATIVE_USER_KEY = 'native_user'`
  - `hasPreferences = Capacitor.isNativePlatform()`(`@capacitor/core` v8 没有 `isPluginAvailable` 导出,用 `isNativePlatform` 兜底)
  - `setSession()` 双写 localStorage + `Preferences.set()`
  - 新增 `restoreFromNative()`:启动时若 localStorage 没 token 但 native 还在,从 native 回填
- **前端 `frontend/src/App.tsx`**:挂载 effect 调 `restoreFromNative()`,回填成功 `setLoggedIn(true)`
- **依赖**: `frontend/package.json` + `android-app/package.json` 加 `@capacitor/preferences@6.0.4`

#### 2. APK 漏装 Preferences 插件(2 个隐藏坑)

新装 v38 包后**仍然要重登** —— 代码写了但 APK 里**根本搜不到 PreferencesPlugin 类**。挖出来 2 个互不相关的根因:

**坑 A**: `dimer47-capacitor-plugin-printer` (Kotlin) 插件硬编码 `JvmTarget.JVM_21`,跟项目里 `JavaVersion.VERSION_17` 冲突,Gradle 直接 build failed / 报"Inconsistent JVM Target Compatibility"。
- **修复**: sed 改 `node_modules/.../dimer47/capacitor-plugin-printer/android/build.gradle` 第 50 行 `JvmTarget.JVM_21` → `JvmTarget.JVM_17`(pnpm 源文件改一次,cap sync 不重写)

**坑 B**: AGP 8.13.0 + Capacitor 6 plugin 兼容性 bug —— `:capacitor-preferences` 模块的 aar **没被自动识别为外部依赖**,`:app:dexBuilderDebug` 的 input list 里只有 R.jar + app 自己的 javac 输出,插件类全丢。
- **修复**: 部署脚本里加 `:capacitor-preferences:assembleDebug` **单独先跑**(强制触发 `bundleDebugAar`),然后 `./gradlew --stop` + 删 `.gradle` + `app/build` 后再 `:app:assembleDebug`(防 incremental cache 短路)
- **验证**: `apkanalyzer dex packages app-debug.apk | grep PreferencesPlugin` 3 个 classes 命中

#### 3. 飞牛 nginx 挂载偶发失效

线上 `http://error.93gushi.com:4040/` 出现 `403 Forbidden nginx/1.31.5`,容器内 `ls /usr/share/nginx/html/` **total 0**,但宿主机 `/vol1/1000/docker/error-book/frontend/` 正常。根因:飞牛 OS `vol1/1000/` 路径上容器启动时挂载有 race condition,容器跑久了挂载点丢失。
- **修复**: `docker restart error-book-nginx` 即恢复(已做)
- **加固 A** — `docker-compose.yml` nginx 服务加 healthcheck: 每 30s `test -s /usr/share/nginx/html/index.html`,失败 3 次自动重启容器
- **加固 B** — README 部署命令末尾加 `docker exec error-book-nginx nginx -s reload`,让新前端 cp 完主动让 nginx 重新扫盘

### 修改 / 新增文件

| 文件 | 改动 |
|---|---|
| `frontend/src/stores/auth.ts` | 双写 native + restoreFromNative |
| `frontend/src/App.tsx` | 启动 effect 调 restoreFromNative |
| `frontend/package.json` + `frontend/pnpm-lock.yaml` | `@capacitor/preferences@6.0.4` |
| `android-app/package.json` + `android-app/pnpm-lock.yaml` | `@capacitor/preferences@6.0.4` |
| `docker-compose.yml` | **新增** - nginx 加 healthcheck |
| `README.md` | 部署命令末尾加 nginx reload + 修正路径 `/volume1/` → `/vol1/1000/` |

### 部署

- **APK**: `apk/error-book-v38-login-persist.apk` (5.85 MB,含 PreferencesPlugin)
- **NAS**: docker-compose 已 up -d 应用 healthcheck,nginx `Status: healthy`
- **线上**: `http://error.93gushi.com:4040` HTTP 200

### 装机验证步骤

1. **卸载旧版**(避免 SharedPreferences 残留干扰)
2. 装 `error-book-v38-login-persist.apk`
3. 登录一次
4. 最近任务键**上划杀掉 App**
5. 重新打开 → 应该**直接进首页**

如果还回登录页,打开 Chrome DevTools(APK 装了 webContentsDebuggingEnabled,Chrome 远程调试)看 console `[auth] token 从 native 回填成功` 日志有没有打印。

---

## v38 (2026-09-14) - 语文题 sourceText + 学科 LLM 分类 + 飞牛 NAS 迁移

### 新增

#### 语文题 sourceText(诗词原文/文言文/阅读文章)

学生拍诗词题/阅读题时,题图通常包含原诗全文/文言文段落/阅读文章。旧版只 OCR 题干 + 4 选项,**原文丢了** → 孩子讲题时看不到全词。手动去翻书太麻烦。

- **后端 `services/minimax.js`**: SYSTEM_PROMPT 加 `sourceText` 字段说明(语文类用,其它留空);`normalizeParsed` 透传 `sourceText`
- **后端 `routes/ocr.js`**: 5 个 `res.json` 加 `sourceText: parsed.sourceText || ''`
- **后端 `schemas/errorQuestion.js`**: mongoose schema 加 `sourceText: { type: String, default: '' }`;`createMemoryError` 透传
- **后端 `routes/ai.js`**: `/analyze` + `/similar` prompt 注入 `${sourceText ? ... : ''}`,让 LLM 讲解时能引用原文
- **前端 `stores/api.ts`**: `ErrorItem` 加 `sourceText?`;`recognizeQuestion` / `analyzeError` / `generateSimilar` 类型都加
- **前端 `CameraScreen.tsx`**: results.push 加 `sourceText`;`createError({sourceText})` 透传
- **前端 `ErrorDetailScreen.tsx`**: 题目详情 Tab 在知识点卡片和 AI 讲解按钮之间插入「诗词原文 / 阅读文章」卡片(琥珀底色 + 楷体 + 自动换行)

#### 学科自动分类 v2(LLM 按知识点判 9 学科)

v12 时代前端按用户选定的 `subject` 入错题,LLM OCR 解析出的知识点跟 `subject` 强绑 → 「二里头遗址」被识别成「物理」。

- **`services/minimax.js`**: 新增 `detectSubjectByLLM({title, knowledgePoint, textContent, fallback})`
  - 调用 Agnes 文本模型(默认 `agnes-2.5-flash`),输出 9 学科之一
  - `SUBJECT_KEYWORDS` 关键词投票兜底(无 AI key 时按 历史/地理/科学 关键词匹配)
  - `VALID_SUBJECTS = ['数学','语文','英语','物理','化学','生物','历史','地理','科学']`
- **`routes/ocr.js`**: 5 个返回路径都走 LLM 分类,结果写进 `subject` + `detectedSubject` + `detail.subjectDetection: 'llm'`
- **`schemas/errorQuestion.js`**: `subject` 枚举 6→9(加 历史/地理/科学)
- **前端 `Icons.tsx`**: `subjectColors` 加 3 色;新增 `subjectColorSafe()` 兜底
- **前端 `ErrorListScreen.tsx`**: 筛选器动态拉(从当前错题里去掉「数学」基础项,只显示有数据的扩展学科)

### 修复 / 调优

- **JWT 有效期 7d → 30d**(`backend/src/middleware/auth.js`):减少用户频繁重登,30 天 token 内 App 直接免登录
- **`frontend/public/config.html`**: 管理员配置面板新增 sourceText 字段说明
- **`routes/ai.js` `/similar`**: 参考原题现在带 `textContent` + `sourceText`,让 LLM 出同作者/同朝代类题

### 部署

- **服务器迁移 Ubuntu 192.168.0.14 → 飞牛 NAS 192.168.0.32**(Docker Compose + mongo:7 + nginx:alpine + 自定义 backend 镜像)
- 老数据(1.2MB, 2 users, 2 errorquestions)已迁移到 NAS mongo
- 历史「古诗词理解与赏析」题重新分类为「语文」;「外卖小票」重新分类为「科学」
- 4 条 placeholder( subject='math' 占位)已删除
- DNS: 阿里云 AAAA 记录更新到飞牛 IPv6,A 记录删除(飞牛无 v4 出口)
- **线上地址**: http://error.93gushi.com:4040

### 修改文件汇总(11 个)

| 文件 | 改动 |
|---|---|
| `backend/src/middleware/auth.js` | JWT 7d → 30d |
| `backend/src/routes/ai.js` | /analyze + /similar 注入 sourceText |
| `backend/src/routes/ocr.js` | 5 个返回加 sourceText + LLM 学科分类 |
| `backend/src/schemas/errorQuestion.js` | subject 枚举 6→9 + 新增 sourceText 字段 |
| `backend/src/services/minimax.js` | SYSTEM_PROMPT 加 sourceText + detectSubjectByLLM |
| `frontend/public/config.html` | 管理员面板说明 |
| `frontend/src/components/CameraScreen.tsx` | createError 透传 sourceText |
| `frontend/src/components/ErrorDetailScreen.tsx` | 诗词原文卡片 + AI 透传 sourceText |
| `frontend/src/components/ErrorListScreen.tsx` | 学科筛选器动态化 |
| `frontend/src/components/Icons.tsx` | 3 新学科色 + subjectColorSafe |
| `frontend/src/stores/api.ts` | ErrorItem 加 sourceText + Subject 9 类型 |

### 已知

- 老数据(迁移前的古诗词题) `sourceText` 是空串(预期,只对**新拍题**生效)
- LLM 学科分类依赖 Agnes AI;无 AI key 时退化为关键词投票(数学题 9 学科识别度有限,其它 8 学科 OK)

---

## v37 (2026-09-06) - IPv4 fallback + DNS A 记录

### 问题
电脑/手机连 **Wi-Fi 无 IPv6 出口** 的网络时（如部分企业网、酒店 Wi-Fi、二级路由场景），域名 `error.93gushi.com` 只有 AAAA 记录（`240e:390:88f7:6cb1::697`），所有请求超时无法打开。

### 修复
- **APK 端**: `frontend/src/stores/api.ts` 新增 4 候选 base + 运行时探测 fallback
  - 优先级：`http://error.93gushi.com:4040` → `http://220.187.13.231:4040` → `http://192.168.0.14:4040` → `http://192.168.0.14:3001`
  - 启动时并行 ping `/api/ocr/status`，4 秒超时内谁先 200 谁锁定
- **DNS 端**: 阿里云 DNS `error.93gushi.com`（属于 `93gushi.com`）新增 A 记录 → `220.187.13.231`

### 修改
- `frontend/src/stores/api.ts`: 替换同步 `BASE_URL` 常量为可变的 `_activeBase`，新增 `API_BASE_CANDIDATES` + `startBaseProbe()` + `resolveStaticBase()` + 导出 `getApiBase()`
- 阿里云 DNS: RecordId `2096397542803602432`

### 部署
- 前端: `index-CLN3KWUk.js` ✅ HTTP 200
- APK: `apk/error-book-v37-ipv4-fallback.apk` (8.4MB)

### 备注
- 公网 IPv4 `220.187.13.231` 依赖运营商分配，若重启光猫会变——重跑 `curl -4 ifconfig.me` 拿新值，再用 `aliyun alidns update-domain-record --record-id 2096397542803602432 --value <新IP>` 更新
- 当前 IPv6 仍可用，电脑双栈/手机 4G 仍走原 AAAA 路径

---

## v35 (2026-09-05) - 选择题打印时选项与题目重叠修复

### 修复
- **选择题打印时选项与 title 重叠**：根因是错题卡外层 `overflow-hidden` 在打印时未覆盖，导致 KaTeX 公式被截断后溢出到下方 title 区域；同时题目文本容器的 `maxHeight: 96px` 在打印时仍然生效，限制了内容高度。修复：
  - 错题卡外层、随机题外层、A4 容器加 `print:overflow-visible`
  - textContent 容器加 `print:max-h-none` 移除打印时高度限制
  - title 改为 `print-title-auto`（CSS 类，白空格正常换行，不截断）
  - `@media print` 中为 `.katex` 设置 `line-height: 1.2` 和 `margin: 0`

### 修改
- `frontend/src/components/PrintPreviewScreen.tsx`: 错题卡/A4/随机题 div 加 `print:overflow-visible`，textContent 容器加 `print:max-h-none`，title 换 `print-title-auto`
- `frontend/src/index.css`: `@media print` 块加 `.katex` line-height、`.print-text-content`、`.print-break-inside-avoid`、`.print-title-auto` 规则

### 部署
- 前端: `index-qDV9Lh0r.js` ✅ HTTP 200
- Android: `apk/error-book-print-fix.apk`

---

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

## v32 (2026-09-05)
- CameraScreen 提示文字可见度：从 `text-white/70` 改为 `text-white/95`，提升深色背景上的对比度
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
