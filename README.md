# 错题本 App

多子女错题本应用，支持 **拍照识题 + AI讲解 + 手写批注 + 错题管理 + 多用户账号隔离**。

## 技术栈

| 层 | 技术 |
|----|------|
| 移动端 | Capacitor 8 + Android WebView（外网域名加载） |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Vite 8 |
| 后端 | Node.js + Express + JWT + bcryptjs |
| 数据库 | MongoDB（生产）/ 内存（演示）双模式 |
| AI | Agnes AI（Vision OCR + 文本生成） |
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
│       │   └── ocr.js       # 题目图片 OCR 识别
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
│       │   └── imagePreprocess.ts  # OCR 前置图片预处理（去白边/灰度增强/去手写）
│       ├── stores/
│       │   ├── auth.ts      # 登录状态 + token 持久化
│       │   ├── api.ts       # API 请求封装（自动注入 Authorization）
│       │   └── AppContext.tsx  # 全局状态管理
│       └── components/
│           ├── LoginScreen.tsx     # 登录页
│           ├── RegisterScreen.tsx  # 注册页
│           ├── CameraScreen.tsx    # 拍照识题页（含手写批注 + 预处理）
│           ├── DrawingCanvas.tsx   # 手写画布组件
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
AI_PROVIDER=openai
AI_API_KEY=sk-efc0YTFoq52xCcEyAuisZWhVPJfToY6kGn9v9mJR4u8Cuwsl
AI_API_BASE=https://apihub.agnes-ai.com/v1
AI_MODEL=agnes-2.5-flash
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

# 2. 同步到 Android assets
rm -rf android-app/android/app/src/main/assets/public
cp -r dist android-app/android/app/src/main/assets/public

# 3. 构建 APK
cd android-app/android
JAVA_HOME=/Applications/Android\ Studio.app/Contents/jbr/Contents/Home \
  gradle assembleDebug

# 4. 复制到输出目录
cp app/build/outputs/apk/debug/app-debug.apk ../../apk/
```

## 功能特性

- **🔐 账号系统**: 家长注册/登录（bcrypt 哈希 + JWT），多用户数据完全隔离
- **📷 拍照识题**: 调用系统相机或相册选择图片
- **🪄 OCR 预处理**: 浏览器端自动去白边、灰度增强、去手写笔迹，显著提升识别准确率
- **🤖 AI OCR**: Agnes Vision API 识别数学题目，提取标题/知识点/内容
- **✏️ 手写批注**: 独立 canvas 图层，支持多色多粗细画笔，清除不破坏原图
- **🧠 AI 讲解**: 分步解析错误原因、知识点讲解、解题教程
- **📚 同类练习**: 根据知识点生成变式练习题
- **👶 多子女**: 同一账号下管理多个孩子的错题
- **🌐 外网访问**: 域名 `error.93gushi.com:4040` 即可使用，手机 4G 也能访问
- **🖨️ 打印**: 生成可打印的错题文档
