# 错题本 App (v14)

多子女错题本应用，支持 **拍照识题 + AI讲解 + 手写批注 + 错题管理 + 多用户账号隔离**。

**最新版本**: `error-book-print-answer-fix.apk`
**线上地址**: http://error.93gushi.com:4040

## 技术栈

| 层 | 技术 |
|----|------|
| 移动端 | Capacitor 8 + Android WebView（外网域名加载） |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Vite 8 + **KaTeX**（LaTeX 渲染） |
| 后端 | Node.js + Express + JWT + bcryptjs |
| 数据库 | MongoDB（生产）/ 内存（演示）双模式 |
| OCR | **TextIn**（合合信息）+ **Agnes vision**（多模态兜底） |
| AI 修正 | **MiniMax-M3**（Anthropic Messages 协议，主 LaTeX 修正） |
| 部署 | Ubuntu 192.168.0.14 + nginx + pm2（域名 AAAA 走 IPv6） |

## 项目结构

```
error-book-app/
├── backend/                    # Express 后端服务
│   └── src/
│       ├── index.js            # 主入口（路由注册 + 启动）
│       ├── middleware/auth.js  # JWT 鉴权
│       ├── routes/
│       │   ├── auth.js         # 注册/登录/me
│       │   ├── child.js        # 孩子管理（按 ownerId 隔离，级联删除）
│       │   ├── errorQuestion.js # 错题 CRUD（单删/批量删）
│       │   ├── ai.js           # AI 讲解 & 同类题
│       │   ├── ocr.js          # OCR 主入口（vision-primary 流水线）
│       │   └── upload.js       # 图片上传
│       ├── services/
│       │   ├── textin.js       # TextIn /v2/recognize 封装
│       │   └── minimax.js      # MiniMax-M3 + Agnes 文本合并
│       └── utils/
│           ├── jsonParse.js    # LLM 返回 JSON 容错解析
│           └── latexNormalize.js  # ⭐ LaTeX 后处理(unicode→命令/反斜杠修复)
├── frontend/                   # React 前端
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── utils/
│       │   ├── imagePreprocess.ts  # OCR 前置预处理
│       │   └── imageCrop.ts        # ⭐ 区域裁剪(矩形坐标 [0,1])
│       ├── stores/
│       │   ├── auth.ts
│       │   ├── api.ts
│       │   └── AppContext.tsx
│       └── components/
│           ├── LoginScreen.tsx / RegisterScreen.tsx
│           ├── DashboardScreen.tsx        # 首页
│           ├── CameraScreen.tsx           # ⭐ 拍照+区域选择+批量识别
│           ├── RegionSelector.tsx         # ⭐ 矩形框选 + 8 手柄缩放
│           ├── DrawingCanvas.tsx          # 手写画布
│           ├── LatexPreview.tsx           # KaTeX 渲染
│           ├── ErrorDetailScreen.tsx      # 错题详情(含删除按钮)
│           ├── ErrorListScreen.tsx         # 错题列表(多选批量打印/删除)
│           ├── ChildManageScreen.tsx      # 孩子管理(增/删/编辑)
│           ├── PrintPreviewScreen.tsx
│           ├── ProfileScreen.tsx          # 我的(孩子管理入口)
│           └── Icons.tsx
├── android-app/                # Capacitor Android 壳
│   └── android/
└── apk/                        # 每次构建的版本化 APK 输出
```

## 核心功能

### 1. 拍照识题 + 多题识别（v13 新增）
- **手动框选区域**:拍照后进入 `RegionSelector` 页面，画矩形圈出每道题，**每题独立 OCR**
- **8 手柄缩放**:角点 + 边中点，触摸拖拽，比例坐标存储（适配任意屏宽）
- **多矩形管理**:加/删/重置，每题单独识别 + 单独入库
- **自动结果合并**:失败某一道时标"需手动补录"，其他题正常入库
- **批注保留**:批注先做（SVG 笔迹层），不影响后续裁剪

### 2. OCR 流水线（v14 vision-primary 路径）
```
拍照 → preprocessImage → regionSelect (用户框选)
   ↓ 按矩形裁剪（imageCrop.ts, 按比例坐标）
   ↓ 每框独立 OCR
textin OCR → 检测到公式 → Agnes vision 主路径（看图）
                                 ↓ 失败
                       MiniMax-M3 文本合并
                                 ↓ 失败
                       textin-direct OCR 原文拼装
                                 ↓ 失败
                       返回 422（前端手动输入）
```

**关键修复**:
- v12: LLM 文本合并会把 `√(ab)` 错读成 `6`（看不到图瞎补全）→ **数学题改走 Agnes vision**
- v12: LLM 输出 LaTeX 不一致 → **`latexNormalize.js` 后处理**（unicode→命令 / `\sqrt{}` 补全 / `\mathrm` 反斜杠修复 / 双反斜杠还原）

### 3. 错题管理（v12 新增）
- **错题详情页**:红色"删除此错题"按钮，二次确认
- **错题列表**:多选模式加"删除"按钮（与"打印"并列）
- **批量删除 API**:`POST /api/errors/batch-delete` `{ids: [...]}`

### 4. 孩子管理（v12 增强）
- **ProfileScreen 入口**:菜单项"孩子管理"，跳 ChildManageScreen
- **删除孩子**:API 级联删除该孩子的所有错题
- **后端保护**:"至少保留一个孩子" 校验

### 5. LaTeX 一致性（v12 + v14）
| 问题 | 修复 |
|---|---|
| `\sqrt 2` 漏大括号 | → `\sqrt{2}` |
| `mathrm{i}` 漏反斜杠 | → `\mathrm{i}`（不重复套 `\mathrm{\mathrm{i}}`） |
| unicode `≤ ≥ ∈ ∪` | → `\leq \geq \in \cup` |
| `\\sqrt` JSON 双转义 | → `\sqrt` |
| 未闭合 `$...$` | 自动补全 |
| 单 i 当复数 | → `\mathrm{i}` |
| `log_2` | → `\log_{2}` |

### 6. KaTeX 渲染（v10 起）
- `LatexPreview` 组件：解析 `$...$` 行内 + `$$...$$` 块级
- `throwOnError:false`：解析失败回退源码（不报错）
- v14 修复：识别完成页（batchResult）的"录入明细"也用 LatexPreview 渲染（之前用 `<pre>` 原文输出）

## API 接口

### 认证（公开）
- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录
- `GET /api/auth/me` — 当前用户
- `PATCH /api/auth/me` — 更新显示名/密码

### 孩子管理（需 JWT，ownerId 隔离）
- `GET /api/children` — 列表
- `POST /api/children` — 创建
- `PATCH /api/children/:id` — 更新
- `DELETE /api/children/:id` — 删除（级联删除错题）

### 错题管理（需 JWT）
- `GET /api/errors?childId=&subject=` — 列表
- `GET /api/errors/:id` — 详情
- `POST /api/errors` — 创建
- `PATCH /api/errors/:id` — 更新
- `DELETE /api/errors/:id` — 删除单条
- `POST /api/errors/batch-delete` — 批量删除 `{ids: [...]}`
- `PATCH /api/errors/:id/handwriting` — 清除手写
- `PATCH /api/errors/:id/ai-analysis` — 保存 AI 分析

### OCR（公开）
- `POST /api/ocr` — `{imageBase64, subject, cleanHandwriting}` → `{title, knowledgePoint, textContent, detail}`
- `GET /api/ocr/status` — 检查 TextIn / Agnes 配置

### OCR 响应字段
```json
{
  "title": "对数最小值求解",
  "knowledgePoint": "对数函数",
  "textContent": "3.已知 $a>0,b>0,\\sqrt{ab}=\\dfrac{1}{a}+\\dfrac{1}{b}$,则 $\\dfrac{1}{\\log_{a}2}+\\dfrac{1}{\\log_{b}2}$ 的最小值为( )\nA. $3$\nB. $2$\nC. $\\sqrt{2}$\nD. $1$",
  "subject": "数学",
  "detail": {
    "ocrSuccess": true,
    "pipeline": "textin+vision-primary",
    "aiProvider": "vision-primary",
    "textLineCount": 7,
    "formulaCount": 4
  }
}
```

## 部署信息

### 服务器
- IPv4: `192.168.0.14`（内网）/ `60.185.134.142`（公网，已废）
- **IPv6**: `240e:390:88f7:6cb1::697`（域名 AAAA 记录）
- 域名: `error.93gushi.com`
- SSH: `gpssong@192.168.0.14`（密码: `850225song`）
- 端口: 3001（后端）/ 4040（nginx 反代）

### 部署命令（实测可用）
```bash
# 1. 后端文件
sshpass -p '850225song' scp backend/src/utils/latexNormalize.js \
  backend/src/services/minimax.js backend/src/routes/ocr.js \
  gpssong@192.168.0.14:/tmp/
sshpass -p '850225song' ssh gpssong@192.168.0.14 \
  'echo "850225song" | sudo -S -p "" cp /tmp/latexNormalize.js \
   /home/gpssong/error-book/backend/src/utils/ && \
   cp /tmp/minimax.js /home/gpssong/error-book/backend/src/services/ && \
   cp /tmp/ocr.js /home/gpssong/error-book/backend/src/routes/ && \
   chown -R gpssong:gpssong /home/gpssong/error-book/backend/src/{utils,services,routes}/'

# pm2 reload(必须用绝对路径 + 完整 PATH,否则 "node: No such file")
sshpass -p '850225song' ssh gpssong@192.168.0.14 \
  'PATH=/home/gpssong/.nvm/versions/node/v20.20.2/bin:$PATH \
   /home/gpssong/.nvm/versions/node/v20.20.2/bin/pm2 reload error-book-backend'

# 2. 前端 build + 部署
cd frontend && pnpm build
cd ..
tar czf /tmp/error-book-dist.tar.gz -C frontend/dist .
sshpass -p '850225song' scp /tmp/error-book-dist.tar.gz gpssong@192.168.0.14:/tmp/
sshpass -p '850225song' ssh gpssong@192.168.0.14 \
  'echo "850225song" | sudo -S -p "" bash -c \
   "rm -rf /var/www/error-book/* /var/www/error-book/.[!.]* 2>/dev/null; \
    tar xzf /tmp/error-book-dist.tar.gz -C /var/www/error-book/ && \
    chown -R www-data:www-data /var/www/error-book"'

# 3. 出 APK
cd android-app && rm -rf www && cp -R ../frontend/dist www/ && npx cap sync android
sed -i '' 's/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g' \
  android-app/android/app/capacitor.build.gradle   # ⚠️ 每次 sync 后必做
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew --offline assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../apk/error-book-v$N.apk
```

### nginx 关键配置（防 413）
```nginx
client_max_body_size 20m;  # OCR base64 大图必须放大
```

## 版本历史

| 版本 | 日期 | 主要变化 |
|---|---|---|
| **v36** | 2026-09-05 | 打印参考答案改用AI讲解答案:`aiAnalysis` 增加 `answer` 字段,`getAnswer()` 优先用 AI 讲解最终答案 |
| **v35** | 2026-09-05 | 选择题打印时选项与题目重叠修复:`print:overflow-visible` + `print:max-h-none` 解决 KaTeX 公式截断溢出 |
| **v32** | 2026-09-05 | AI练习页面底部tab修复:`showNav`不再排除`aiPractice`,进入AI同步练习页底部导航正常显示 |
| **v31** | 2026-09-05 | AI讲解LaTeX公式渲染:`mistakeReason/knowledgeExplained/stepByStepGuide` 用 KaTeX 正确显示 $\dfrac$ \log_2 等公式 |
| **v30b** | 2026-09-05 | config.html管理员面板:查看全部用户+套餐管理+额度重置 |
| **v30** | 2026-09-05 | AI练习页面:随机同步练习题(按科目生成)+打印 |
| **v29** | 2026-09-05 | config.html 配置数据改由后端存储,两端域名数据同步 |
| **v28** | 2026-09-05 | 管理员gpssong:JWT注入isAdmin,账号管理仅管理员可见 |
| **v27** | 2026-09-05 | 付费墙:免费版每日 OCR 10次/AI 讲解 3次,Pro ¥18/月 Family ¥28/月,手动扫码充值 |
| **v26** | 2026-09-05 | Android 物理返回键修复:装 `@capacitor/app@6.0.3`,非首页拦截 backButton 跳回首页,首页再返回才退出 |
| **v25** | 2026-09-05 | App 端打印按钮修复:装 `@dimer47/capacitor-plugin-printer@2.0.4`,Android 走 native PrintManager(`printWebView` + `@media print` 自动隐藏工具栏) |
| **v24** | 2026-09-05 | 登录后无数据修复:AppProvider 启动早于登录,401 后不再重试;新增 LOGIN_SUCCESS_EVENT 触发 refreshChildren |
| **v23.1** | 2026-09-05 | 打印默认关闭参考答案(showAnswer 默认 false,打印设置面板同步) |
| **v23** | 2026-09-05 | 打印 A4 顶天立地:body flex 居中重置 + A4 容器强制 210mm×297mm + BottomNav 排除 |
| **v22** | 2026-09-05 | 含参考答案开关变真 button:加 showAnswer state,div 装饰品改为可点击 toggle |
| **v21** | 2026-09-05 | ErrorDetailScreen 详情页"打印此题"也走 setPendingPrintIds,只打这一题 |
| **v20** | 2026-09-05 | v19 漏 import useState 修复:AppContext.tsx 补 useState 到 react import |
| **v19** | 2026-09-05 | 打印选中传递:AppContext 加 pendingPrintIds 跨页传选中,打印页加 chip 勾选 UI 二次调整 |
| **v18** | 2026-09-05 | React #300 真正修复：所有 useCallback 上移到早返回前,hook 顺序固定为 14 个 |
| **v17** | 2026-09-05 | 删除错题 React #300 修复（仅 useState,useCallback 漏改,未生效） |
| **v16** | 2026-09-05 | 同类练习打印：每张错题卡底部追加同类题网格（含 KaTeX + 答案） |
| **v15** | 2026-09-05 | 打印预览改为显示识别文字（含 KaTeX 公式），屏幕限高+打印全展开 |
| **v14** | 2026-09-05 | 录入明细 LaTeX 渲染；OCR 数学题走 vision-primary |
| **v13** | 2026-09-05 | 区域选择器（RegionSelector）+ 批量识别 + imageCrop 工具 |
| **v12** | 2026-09-05 | 我的页面加孩子管理入口；错题删除（详情+批量）；latexNormalize 后处理 |
| **v11** | 2026-09-04 | MiniMax-M3 (Anthropic 协议) LaTeX 修正 + Agnes text-only 兜底 |
| **v10** | 2026-09-04 | KaTeX 渲染 LaTeX 公式 |
| **v9** | 2026-09-04 | MiniMax-M3 OCR 文本合并 |
| **v8** | 2026-09-04 | Agnes AI 文本合并 |
| **v7** | 2026-09-04 | TextIn 直出 OCR |
| **v6** | 2026-09-03 | TextIn 协议修复（octet-stream）+ nginx 413 body 上限 |
| **v3-v1** | 2026-09-02 | 初版 |

## 待改进（未实施）
- 区域选择后加"自动版面分析"建议位置（用户只微调）
- vision-fallback 加缓存（同图 1 分钟内复用，避免重复慢请求）
- 多题识别时按"4 选项自动切题"
- 多账号错题本独立存储（已实现 ownerId 隔离，可加切换 UI）

## 测试

```bash
# 验证后端健康
curl -6 -s 'http://[240e:390:88f7:6cb1::697]:4040/api/ocr/status'
# 应返回 {"textin":"configured","visionModel":"agnes-2.5-pro-alpha","minimax":"configured"}

# OCR 流程跑通测试
# 1. 注册账号 → 拿 token
# 2. 加孩子
# 3. 上传图片 → 拿到 textContent
# 4. 创建错题 (POST /api/errors)
```

## 已知坑

- `npx cap sync android` 会把 `capacitor.build.gradle` 的 Java 版本改成 21，**必须**手动 sed 回 17
- 前端代码必须先 `pnpm build` 才能 cap sync
- pm2 不在默认 PATH，必须用 `/home/gpssong/.nvm/versions/node/v20.20.2/bin/pm2` 绝对路径
- macOS 本机 `scp -r dist/*` 到 `/var/www/error-book/` 会因 www-data 所有权失败 —— 用 tar 包方式
- IPv6 是动态租约（~7天），DNS AAAA 可能过期 —— 重启路由器或手动更新
- happy-eyeballs 优先 v4 → curl 必须加 `-6` 才能测 IPv6-only 域名
- 后端在 FNOS/Docker 容器里时，`/tmp/` 目录可能没权限，先 `sudo mkdir -p /tmp && sudo chmod 1777 /tmp`

## License

MIT