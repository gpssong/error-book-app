# 错题本 App

多子女错题本应用，支持拍照识题、AI讲解、手写批注、错题管理。

## 技术栈

| 层 | 技术 |
|----|------|
| 移动端 | Capacitor 8 + Android WebView |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Vite 8 |
| 后端 | Node.js + Express |
| AI | Agnes AI（Vision OCR + 文本生成） |
| 部署 | Ubuntu 192.168.0.14 + nginx + pm2 |

## 项目结构

```
错题本app/
├── 后端/                    # Express 后端服务
│   └── src/
│       ├── index.js         # 主入口（路由注册 + 启动）
│       ├── routes/
│       │   ├── child.js     # 孩子管理 API
│       │   ├── errorQuestion.js  # 错题 CRUD API
│       │   ├── ai.js        # AI 讲解 & 同类题生成
│       │   ├── upload.js    # 图片上传
│       │   └── ocr.js       # 题目图片 OCR 识别
│       └── schemas/
│           ├── db.js        # MongoDB/内存数据库适配
│           ├── memory.js    # 内存数据库实现
│           ├── child.js     # 孩子数据模型
│           └── errorQuestion.js  # 错题数据模型
├── 前端/错题本APP设计/         # React 前端
│   └── src/
│       ├── App.tsx          # 主应用 + 路由
│       ├── main.tsx         # 入口
│       ├── stores/
│       │   ├── api.ts       # API 请求封装（自动检测 BASE_URL）
│       │   └── AppContext.tsx  # 全局状态管理
│       └── components/
│           ├── CameraScreen.tsx    # 拍照识题页（含手写批注）
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

### 孩子管理
- `GET /api/children` — 获取孩子列表
- `POST /api/children` — 创建孩子
- `PATCH /api/children/:id` — 更新孩子
- `DELETE /api/children/:id` — 删除孩子

### 错题管理
- `GET /api/errors?childId=&subject=` — 获取错题列表
- `GET /api/errors/:id` — 获取错题详情
- `POST /api/errors` — 创建错题
- `PATCH /api/errors/:id` — 更新错题
- `DELETE /api/errors/:id` — 删除错题
- `PATCH /api/errors/:id/handwriting` — 清除手写笔迹
- `PATCH /api/errors/:id/ai-analysis` — 保存 AI 分析结果

### AI 服务
- `POST /api/ai/analyze` — AI 讲解错题
- `POST /api/ai/similar` — 生成同类练习题

### OCR 识别
- `POST /api/ocr` — 识别题目图片，返回标题/知识点/题目内容

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

- **拍照识题**: 调用系统相机或相册选择图片
- **手写批注**: 独立 canvas 图层，支持多色多粗细画笔，清除不破坏原图
- **AI OCR**: Agnes Vision API 识别数学题目，提取标题/知识点/内容
- **AI 讲解**: 分步解析错误原因、知识点讲解、解题教程
- **同类练习**: 根据知识点生成变式练习题
- **错题管理**: 按孩子分类、收藏、批量删除
- **打印**: 生成可打印的错题文档
