# 错题本 App

多子女错题本应用，支持 **拍照识题 + AI讲解 + 手写批注 + 错题管理 + 多用户账号隔离**。

## 技术栈

| 层 | 技术 |
|----|------|
| 移动端 | Capacitor 8 + Android WebView（外网域名加载） |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Vite 8 + **KaTeX**（LaTeX 渲染） |
| 后端 | Node.js + Express + JWT + bcryptjs |
| 数据库 | MongoDB（生产）/ 内存（演示）双模式 |
| AI | **TextIn**（合合信息 OCR 专业接口）+ **MiniMax-M3**（Anthropic Messages 协议，LaTeX 修正）+ Agnes AI（兜底） |
| 部署 | Ubuntu 192.168.0.14 + nginx + pm2 |

## 项目结构

```
错题本app/
├── 后端/                    # Express 后端服务
│   └── src/
│       ├── index.js         # 主入口（路由注册 + 启动）
│       ├── middleware/
│       │   └── auth.js      # JWT 鉴权中间件
│       ├── routes/
│       │   ├── auth.js      # 注册/登录/me API
│       │   ├── child.js     # 孩子管理 API（需 JWT）
│       │   ├── errorQuestion.js  # 错题 CRUD API（需 JWT）
│       │   ├── ai.js        # AI 讲解 & 同类题生成
│       │   ├── upload.js    # 图片上传
│       │   └── ocr.js       # OCR 主入口（TextIn + AI 文本合并流水线）
│       ├── services/
│       │   ├── textin.js    # TextIn /v2/recognize 封装（octet-stream）
│       │   └── minimax.js   # MiniMax-M3 (Anthropic) + Agnes 文本合并
│       └── schemas/
│           ├── db.js        # MongoDB/内存数据库适配
│           ├── memory.js    # 内存数据库实现
│           ├── user.js      # 用户数据模型
│           ├── child.js     # 孩子数据模型（带 ownerId 隔离）
│           └── errorQuestion.js  # 错题数据模型
├── 前端/错题本APP设计/         # React 前端
│   └── src/
│       ├── App.tsx          # 主应用 + 路由（登录守卫）
│       ├── main.tsx         # 入口
│       ├── utils/
│       │   └── imagePreprocess.ts  # OCR 前置预处理（EXIF 旋转 + 压缩到 1200px）
│       ├── stores/
│       │   ├── auth.ts      # 登录状态 + token 持久化
│       │   ├── api.ts       # API 请求封装（自动注入 Authorization）
│       │   └── AppContext.tsx  # 全局状态管理
│       └── components/
│           ├── LoginScreen.tsx     # 登录页
│           ├── RegisterScreen.tsx  # 注册页
│           ├── CameraScreen.tsx    # 拍照识题页（含手写批注 + OCR 触发）
│           ├── DrawingCanvas.tsx   # 手写画布组件
│           ├── LatexPreview.tsx    # KaTeX LaTeX 渲染组件（textarea 上方预览）
│           ├── ErrorDetailScreen.tsx  # 错题详情页
│           ├── DashboardScreen.tsx   # 首页
│           ├── ErrorListScreen.tsx   # 错题列表
│           ├── ChildManageScreen.tsx # 孩子管理
│           ├── PrintPreviewScreen.tsx # 打印预览
│           └── Icons.tsx             # 图标组件
├── android-app/             # Android 原生包装
│   └── android/app/src/main/assets/public/  # 前端构建产物
├── apk/                     # 构建好的 APK
│   └── app-debug.apk
└── config.html              # AI模型配置工具页面
```

## API 接口

### 认证（公开）
- `POST /api/auth/register` — 注册（用户名/邮箱/密码）
- `POST /api/auth/login` — 登录（支持用户名或邮箱）
- `GET /api/auth/me` — 获取当前用户（需 JWT）
- `PATCH /api/auth/me` — 更新显示名/密码（需 JWT）

### 孩子管理（需 JWT，数据按 ownerId 隔离）
- `GET /api/children` — 获取当前用户的所有孩子
- `POST /api/children` — 创建孩子
- `PATCH /api/children/:id` — 更新孩子
- `DELETE /api/children/:id` — 删除孩子（级联删除错题）

### 错题管理（需 JWT）
- `GET /api/errors?childId=&subject=` — 获取错题列表（仅当前用户）
- `GET /api/errors/:id` — 获取错题详情
- `POST /api/errors` — 创建错题
- `PATCH /api/errors/:id` — 更新错题
- `DELETE /api/errors/:id` — 删除错题
- `PATCH /api/errors/:id/handwriting` — 清除手写笔迹
- `PATCH /api/errors/:id/ai-analysis` — 保存 AI 分析结果

### AI 服务（公开）
- `POST /api/ai/analyze` — AI 讲解错题
- `POST /api/ai/similar` — 生成同类练习题

### OCR 识别（公开）
- `POST /api/ocr` — 识别题目图片（前端已做去白边/灰度增强/去手写预处理）

### 文件上传
- `POST /api/upload/base64` — 上传 Base64 图片

## 部署信息

### 服务器
- IP: `192.168.0.14`（公网: `60.185.134.142`）
- 域名: `error.93gushi.com`
- SSH: `gpssong@192.168.0.14`（密码: `850225song`）
- 端口: 80（内网）、4040（外网 nginx 代理）

### 后端配置
```bash
# .env
USE_MEMORY_DB=true
PORT=3001
HOST=0.0.0.0

# Agnes AI（兜底）
AI_API_KEY=sk-efc0YTFoq52xCcEyAuisZWhVPJfToY6kGn9v9mJR4u8Cuwsl
AI_API_BASE=https://apihub.agnes-ai.com/v1
VISION_MODEL=agnes-2.5-pro-alpha

# TextIn（合合信息，专业 OCR）
TEXTIN_APP_ID=ad67a5c6b4e15db63a17cb14172ce58d
TEXTIN_SECRET_CODE=b5a657c7a807700c886118c557773d89

# MiniMax-M3（Anthropic Messages 协议，主 OCR 修正）
MINIMAX_API_KEY=sk-cp-...    # 在 minimaxi.com 控制台获取
MINIMAX_API_BASE=https://api.minimaxi.com/anthropic
MINIMAX_MODEL=MiniMax-M3
```

### 部署命令
```bash
# 重启后端
sshpass -p '850225song' ssh gpssong@192.168.0.14 \
  'export NVM_DIR="$HOME/.nvm" && source "$NVM_DIR/nvm.sh" && pm2 restart error-book-backend'

# 部署前端
scp -r dist/* gpssong@192.168.0.14:/var/www/error-book/
```

## 构建流程

```bash
# 1. 构建前端
cd 前端/错题本APP设计 && pnpm build

# 2. 同步到 Android assets（Capacitor sync 会重新生成 capacitor.build.gradle,Java 版本会变 21 → 需手动改回 17）
rm -rf android-app/android/app/src/main/assets/public
cp -r dist android-app/android/app/src/main/assets/public
# OR: cd android-app && npx cap sync android

# 3. 把 capacitor.build.gradle 改回 Java 17（每次 cap sync 后必做）
sed -i '' 's/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g' \
  android-app/android/app/capacitor.build.gradle

# 4. 构建 APK
cd android-app/android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
  ./gradlew --offline assembleDebug

# 5. 复制到输出目录
python3 -c "import shutil; shutil.copy2('app/build/outputs/apk/debug/app-debug.apk', '/Volumes/mac使用/错题本app/apk/error-book-vX.apk')"
```

## OCR 流水线（v11）

```
┌─────────────────┐
│ 前端图片预处理    │  EXIF 旋转 + 等比缩放 1200px / jpeg q=0.82
│ (preprocessImage)│  输出 base64 (100-300 KB)
└────────┬────────┘
         ↓
┌─────────────────────────────────────┐
│ TextIn /v2/recognize (octet-stream) │  返回 result.lines[] 扁平结构
│   - Content-Type: application/octet-stream  │
│   - URL query: ?recognize_graphics=1        │
│   - 每行 type: "text" | "formula"           │
└────────┬────────────────────────────────────┘
         ↓
┌──────────────────────────────────────┐
│ AI 文本合并 (semanticParseText)      │  修正 OCR 字符错误为标准 LaTeX
│   ① MiniMax-M3 (Anthropic 协议)       │  "x2"→"x^2", "1nx"→"\\ln x",
│      POST /v1/messages + x-api-key    │  "oo"→"\\infty", "Ve"→"\\sqrt{e}",
│   ② Agnes text-only (OpenAI 兼容)    │  "IJU"→"\\cup", "\\dfrac{1}{2}" 等
│   ③ 失败 → 启发式 OCR 原文拼装        │
└────────┬─────────────────────────────┘
         ↓
┌──────────────────────────┐
│ 前端 KaTeX 渲染           │  $...$ 行内公式 + $$...$$ 块级公式
│ (LatexPreview)            │  throwOnError:false（解析失败回退源码）
└──────────────────────────┘
         ↓
       识别结果
```

### 响应字段
```json
{
  "title": "已知集合",
  "knowledgePoint": "集合运算",
  "textContent": "已知集合 $A=\\{x \\mid x^2-2x-3\\geq 0\\}$，$B=\\{x \\mid \\ln x \\geq \\dfrac{1}{2}\\}$，则 $A \\cup B = (\\ )$\nA. $[3,+\\infty)$\nB. $(-\\infty,-1]\\cup[\\sqrt{e},+\\infty)$\nC. $(-\\infty,-1]\\cup[3,+\\infty)$\nD. $[-1,\\sqrt{e}]$",
  "subject": "数学",
  "detail": {
    "ocrSuccess": true,
    "pipeline": "textin+ai-text",
    "aiProvider": "minimax",
    "textLineCount": 47,
    "formulaCount": 19
  }
}
```

### TextIn 协议要点
| 接口 | Content-Type | Body | 返回 |
|---|---|---|---|
| `/v2/recognize` | `application/octet-stream` | 图片二进制 | `result.lines[]` 扁平 |
| `/v2/recognize/formula` | `application/octet-stream` | 图片二进制 | 单独公式接口(本项目未使用) |
| `/v1/handwritten_erase` | `application/octet-stream` | 图片二进制 | `{image: "base64..."}` |

**JSON body 会被 TextIn 当成"文件类型不支持"返回 40600** —— 必须裸二进制。

## 功能特性

- **🔐 账号系统**: 家长注册/登录（bcrypt 哈希 + JWT），多用户数据完全隔离
- **📷 拍照识题**: 调用系统相机或相册选择图片
- **🪄 OCR 前置预处理**: 浏览器端 EXIF 旋转 + 压缩到 1200px（不破坏原图内容）
- **🤖 OCR 流水线（v11）**: TextIn 专业 OCR → MiniMax-M3 修正 LaTeX → 前端 KaTeX 渲染
- **✏️ 手写批注**: 独立 canvas 图层，支持多色多粗细画笔，清除不破坏原图
- **🧠 AI 讲解**: 分步解析错误原因、知识点讲解、解题教程
- **📚 同类练习**: 根据知识点生成变式练习题
- **👶 多子女**: 同一账号下管理多个孩子的错题
- **🌐 外网访问**: 域名 `error.93gushi.com:4040` 即可使用，手机 4G 也能访问
- **🖨️ 打印**: 生成可打印的错题文档

## APK 输出

每次构建后 APK 自动复制到 `/Volumes/mac使用/错题本app/apk/`，按版本号命名：
- `error-book-vX-xxx.apk`（如 `v10-katex`、`v11-katex-debug`）

历史版本（按时间倒序）：
- v11 调试版（含 KaTeX + 多重 console.log）
- v10 KaTeX 渲染
- v9 MiniMax-M3 OCR 修正
- v8 AI 文本合并（Agnes）
- v7 TextIn 直出（OCR 原文）
- v6/v5/v4 TextIn 协议修复 + 413 body 上限
- v3/v2/v1 初版 OCR 接入
