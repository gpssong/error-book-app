# 错题本 App (v48)

多子女错题本应用，支持 **拍照识题 + AI讲解(看图) + 跨页拍题 + 手写批注 + 错题管理 + 打印同类题数量可选 + 多用户账号隔离 + 语文原文提取 + 学科 LLM 自动分类 + 登录态持久化 + 图片性能根治 + 列表分页(无限滚动) + OCR 视觉塌缩多层防护 + 录入明细数学公式渲染 + 录入完成页图预览 + 详情页主图完整显示**。

**工程基建**: 前后端测试(vitest)+ ESLint + GitHub Actions CI + `tsc` 门禁(见「开发/测试/CI」章节)。

**最新版本**: `error-book-v48-refine-figure.apk`
**线上地址**: http://error.93gushi.com:4040
**内网直连**: http://192.168.0.32:4040(飞牛 NAS 局域网)

## 技术栈

| 层 | 技术 |
|----|------|
| 移动端 | Capacitor 8 + Android WebView（外网域名加载） |
| 前端 | React 19 + TypeScript + Tailwind CSS v4 + Vite 8 + **KaTeX**（LaTeX 渲染） |
| 后端 | Node.js + Express + JWT + bcryptjs |
| 数据库 | MongoDB（生产）/ 内存（演示）双模式 |
| OCR | **TextIn**（合合信息）+ **Agnes vision**（多模态兜底） |
| AI 修正 | **MiniMax-M3**（Anthropic Messages 协议，主 LaTeX 修正） |
| 学科 LLM | **Agnes-2.5-flash** 按知识点判 9 学科（数学/语文/英语/物理/化学/生物/历史/地理/科学） |
| 部署 | **飞牛 NAS 192.168.0.32** + Docker Compose(mongo:7 + nginx:alpine + backend) |

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
│       ├── pipeline/
│       │   └── textExtract.js  # ⭐ OCR 启发式提取(trimToFirstQuestion/extractTitleAndKP, 可测纯函数)
│       └── utils/
│           ├── jsonParse.js    # LLM 返回 JSON 容错解析
│           ├── latexNormalize.js  # ⭐ LaTeX 后处理(unicode→命令/反斜杠修复)
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

### 7. 语文原文提取(v38 新增)

学生拍诗词题/阅读题时,题图通常包含原诗全文/文言文段落/阅读文章。旧版只 OCR 题干 + 4 选项,**原文丢了** → 孩子讲题时看不到全词。

- LLM OCR 解析时多抽一个 `sourceText` 字段(诗词/文言文/阅读文章原文,保留标点 + 换行)
- 入库 mongoose schema 加 `sourceText` 字段(默认空串)
- 详情页加「📜 诗词原文 / 阅读文章」卡片:琥珀底色 + 楷体 + 自动换行,在知识点卡片和 AI 讲解按钮之间
- AI 讲解(`/analyze`) 和同类题(`/similar`) prompt 注入原文,让 LLM 能引用原文 + 出同作者/同朝代类题

### 8. 学科 LLM 自动分类 v2(v38 新增)

v12 时代前端按用户选定的 `subject` 入错题,LLM OCR 解析出的知识点跟 `subject` 强绑 → 「二里头遗址」被识别成「物理」。

- 后端 `detectSubjectByLLM({title, knowledgePoint, textContent, fallback})`:调 Agnes 文本模型(默认 `agnes-2.5-flash`),输出 9 学科之一
- 无 AI key 时退化为关键词投票(`SUBJECT_KEYWORDS` 字典)
- 5 个 ocr.js 返回路径都走 LLM 分类,结果写进 `subject` + `detectedSubject` + `detail.subjectDetection: 'llm'`
- 学科枚举 6 → 9:数学/语文/英语/物理/化学/生物/历史/地理/科学
- 前端 `ErrorListScreen` 筛选器动态拉(只显示当前有数据的学科)

### 9. 图片性能根治(v44 新增)

**问题**: 历史数据把题图以 base64 内联存进 Mongo(`imageBase64`/`figureBase64`),`GET /api/errors` 整文档返回 —— 错题越多, 每次打开列表都要拉 N 张图的 base64(生产实测 59 题 = 10.9MB JSON), 公网 v6 拉取慢。

**根治**: 图片脱离列表 JSON、脱离 Mongo, 存成静态文件:

| 层 | 手段 | 效果 |
|---|---|---|
| P0 列表投影 | `GET /api/errors` `.select('-imageBase64 -figureBase64')` | 列表 JSON ~99% 瘦身, 秒开(零数据风险) |
| P1 单独取图 | `GET /api/errors/:id/image`(静态 URL→302)+ `GET /:id?full=1` 按需全量 | 详情页首屏轻量, AI 讲解时才拉全量 base64 |
| P2a 静态化 | 入库前 `uploadBase64` 落盘 `/uploads/xxx.jpg`, `imageUrl` 存 URL | `<img>` 走静态文件, 浏览器/nginx 可缓存(30d) |
| P2a 缩放 | `cropImage` 加 `maxDim=1280` + `quality=0.85` | 裁剪图不再=原图 4000px 那么大, 存储瘦身 |
| P2c 迁移 | `backend/scripts/migrate-images-to-static.js`(dry-run + 自动备份) | 存量 base64 落盘 + `imageUrl` 改指 URL + 清空大 base64, 库瘦身 |

**部署要点**: compose 给 backend+nginx 各挂 `./backend-public/uploads`(不加卷则 `docker build` 重建镜像丢图); `nginx.conf` 加 `location ^~ /uploads/ → alias /uploads-static/` + 30d 缓存。`figureBase64` 保留(AI 讲解 `ai.js` 只用它喂视觉模型, 从不读 `imageBase64`), 迁移只补 `figureImageUrl`。

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
- `GET /api/errors?childId=&subject=` — 列表(v44 起不返回 `imageBase64`/`figureBase64`, 只返回 `imageUrl` 静态 URL, 轻量可缓存)
- `GET /api/errors/:id` — 详情(默认排除大 base64;`?full=1` 返回全量含 base64, 供详情页 AI 讲解喂图)
- `GET /api/errors/:id/image` — 单独取图(v44):静态 URL→302 跳 `/uploads`,老数据→吐 data-URL
- `POST /api/errors` — 创建
- `PATCH /api/errors/:id` — 更新
- `DELETE /api/errors/:id` — 删除单条
- `POST /api/errors/batch-delete` — 批量删除 `{ids: [...]}`
- `PATCH /api/errors/:id/handwriting` — 清除手写
- `PATCH /api/errors/:id/ai-analysis` — 保存 AI 分析

### OCR（公开）
- `POST /api/ocr` — `{imageBase64, subject, cleanHandwriting}` → `{title, knowledgePoint, textContent, sourceText, subject, detectedSubject, detail}`
- `GET /api/ocr/status` — 检查 TextIn / Agnes 配置

### OCR 响应字段
```json
{
  "title": "对数最小值求解",
  "knowledgePoint": "对数函数",
  "textContent": "3.已知 $a>0,b>0,\\sqrt{ab}=\\dfrac{1}{a}+\\dfrac{1}{b}$,则 $\\dfrac{1}{\\log_{a}2}+\\dfrac{1}{\\log_{b}2}$ 的最小值为( )\nA. $3$\nB. $2$\nC. $\\sqrt{2}$\nD. $1$",
  "sourceText": "",
  "subject": "数学",
  "detectedSubject": "数学",
  "detail": {
    "ocrSuccess": true,
    "pipeline": "textin+vision-primary",
    "aiProvider": "vision-primary",
    "textLineCount": 7,
    "formulaCount": 4,
    "subjectDetection": "llm"
  }
}
```

> 语文题(诗词/文言文/阅读)的 `sourceText` 示例:
> ```json
> {
>   "title": "古诗词理解与赏析",
>   "knowledgePoint": "宋词",
>   "textContent": "对下列词的理解与赏析,不正确的一项是...",
>   "sourceText": "《苏幕遮》\n[北宋·范仲淹]\n碧云天,黄叶地,秋色连波,波上寒烟翠。\n山映斜阳天接水,芳草无情,更在斜阳外。\n..."
> }
> ```

## 部署信息

### 服务器（v38 起：飞牛 NAS）

- **内网 IP**: `192.168.0.32`（飞牛 NAS，Debian 12 + Docker Compose）
- **IPv6**: 动态租约（~7 天），随运营商变化 → **不写死**，由 DDNS 自动同步脚本实时追踪
- **域名**: `error.93gushi.com`（AAAA → 飞牛 v6；A 记录已删，飞牛无 v4 出口）
- **SSH**: `gpssong@192.168.0.32`（密码: `850225sonG`，注意 G 大写）
- **端口**: 4040（nginx 反代）→ 容器内 backend:3001
- **容器**: `error-book-mongo` / `error-book-backend` / `error-book-nginx`

> ⚠️ 旧的 Ubuntu 服务器 `192.168.0.14`（pm2 + mongo）已下线，数据已迁移到飞牛。`frontend/src/stores/api.ts` 里的 4 候选 base 仍保留 `192.168.0.14` 作为历史兜底（探测不到即跳过），不影响线上。

### 部署命令（飞牛 NAS 实测可用）

后端改动走「构建镜像 + 重启容器」：

```bash
# 1. 同步 backend 源码到 NAS
sshpass -p '850225sonG' scp -r backend/src/ gpssong@192.168.0.32:/tmp/eb-src/

# 2. 在 NAS 上重建 backend 镜像并重启
#    ⚠️ 必须先 rm -rf 旧 src 再整体拷 /tmp/eb-src(它=src 内容), 否则 src/src 嵌套 → 镜像崩溃
sshpass -p '850225sonG' ssh gpssong@192.168.0.32 \
  'echo "850225sonG" | sudo -S -p "" bash -c "\
     cd /vol1/1000/docker/error-book && \
     rm -rf backend/src && cp -r /tmp/eb-src backend/src && \
     test -f backend/src/index.js && \
     docker build -t error-book-backend ./backend && \
     docker compose up -d backend"'

# 3. 前端 build + 同步 dist 到 nginx 容器挂的目录
cd frontend && pnpm build && cd ..
sshpass -p '850225sonG' scp -r frontend/dist/ gpssong@192.168.0.32:/tmp/eb-dist/
sshpass -p '850225sonG' ssh gpssong@192.168.0.32 \
  'echo "850225sonG" | sudo -S -p "" bash -c "\
     rm -rf /vol1/1000/docker/error-book/frontend/* && \
     cp -r /tmp/eb-dist/* /vol1/1000/docker/error-book/frontend/ && \
     docker exec error-book-nginx nginx -s reload"'
# v38 加固:最后加 nginx -s reload,让 nginx 重新打开 index.html / assets
# 否则偶发"挂载看似 OK 但 ls /usr/share/nginx/html/ total 0"的脏状态,
# 必须 docker restart error-book-nginx 才能恢复。

# 4. 健康检查(走 v6)
curl -6 -s 'http://[240e:390:88f6:c681::3f3]:4040/api/ocr/status'
```

### 出 APK

```bash
cd android-app && rm -rf www && cp -R ../frontend/dist www/ && npx cap sync android
sed -i '' 's/JavaVersion.VERSION_21/JavaVersion.VERSION_17/g' \
  android-app/android/app/capacitor.build.gradle   # ⚠️ 每次 sync 后必做
cd android
JAVA_HOME=/opt/homebrew/opt/openjdk@17 ./gradlew --offline assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../apk/error-book-v38-subject-llm.apk
```

### nginx 关键配置（防 413）
```nginx
client_max_body_size 20m;  # OCR base64 大图必须放大
```

### DDNS 自动同步（飞牛 v6 变化 → 阿里云 AAAA）

飞牛 NAS 的公网 IPv6 是**运营商动态租约（~7 天）**，到期换地址后 `error.93gushi.com` 的 AAAA 记录仍指旧值 → 公网打不开。

`scripts/ddns-update.sh` 每 5 分钟自动比对「飞牛当前 v6」与「阿里云当前 AAAA」，不一致就 `UpdateDomainRecord` 刷新。

```bash
# 手动跑一次
bash scripts/ddns-update.sh

# 日志
tail -f /tmp/ddns-update.log

# 看当前 crontab (每 5 分钟)
crontab -l | grep ddns
```

**脚本要点**：
- 真源是**飞牛 NAS 实时 v6**（`ssh gpssong@192.168.0.32 'ip -6 addr ...'`），不依赖本地 `ifconfig.me`
- 决策 = 对比飞牛 v6 与阿里云 AAAA，一致就跳过（不打 API），不一致才更新
- `aliyun` / `sshpass` 写**全路径** `/opt/homebrew/bin/...`（cron PATH 不含 homebrew，否则报 "aliyun CLI 未安装"）
- 阿里云 DNS 走 `--profile dns`（套 2 的 AK `LTAI5t6jBuHjTYd7SnGRj3iP`，默认 profile 无此域名权限）
- `DomainName` 必须传**根域** `93gushi.com`，`RR=error`（传 FQDN 会报 `InvalidDomainName.NoExist`）

> ⚠️ 只有 **v6** 有自动同步。飞牛无 v4 出口，A 记录无意义，纯 v4 网络（部分 Wi-Fi）依旧打不开。

## 版本历史

| 版本 | 日期 | 主要变化 |
|---|---|---|
| **v48** | 2026-09-26 | 打印预览「图不全 + 去手写」fix:`POST /api/errors/:id/refine-figure` 新端点 —— 取 imageBase64 → TextIn `eraseHandwriting` 去手写 → `recognizeText` 拿真实 bbox → `figureRegionFromTextPositions` 求示意图 region → 落盘 `/uploads/fig-{id}-{uuid8}.jpg` + 写 `figureImageUrl`。前端 `PrintPreviewScreen` 题图右上角加「图不全?点此优化」按钮(整张题照兜底时为「提取示意图」)→ 调后端 → 拿到新 figureImageUrl + region → CSS `clip-path: inset(top right bottom left)` 抠 region 部分 + 「✓ 已去手写」徽章。不引入 sharp(Dockerfile 不在 repo);4 文件 ~280 行。后端 test **62/62**(原 58 + 新 4 refine);lint 0 error;前端 typecheck ✓ / build ✓(chunk `index-Co8u3bH-.js` 613568 bytes);飞牛 dist 部署 ✓;后端 rebuild + 容器重启 ✓。已知限制: refine 结果只存本地 state,刷新页面丢(v49+ 持久化);clip-path iOS 未测;依赖 TextIn 凭证 + 余额。APK: `error-book-v48-refine-figure.apk` |
| **v47.2** | 2026-09-26 | 打印预览页图源改用「示意图」(`figureImageUrl/figureBase64`)而非「整张题目照片」(`imageUrl/imageBase64`):v47.1 用错了图源,把用户拍摄的整张歪照当「题图」渲染,孩子打印出来根本看不出原书印刷的立方体/物理装置。修复: 打印题卡图片分支改成 `figureImageUrl/figureBase64`(原书示意图,2 列 140px/1 列 200px,print 加倍) → 兜底 `imageUrl/imageBase64`(整张题照,更小高度)。详情页(复习批注)仍用 imageUrl —— 语义不同。**只改 1 文件 28 行**。已知: 存量 figureBase64 几乎空,旧错题回退到整张题照(v47 OCR fallback 上线后预期 ≥30%); 让孩子「批注涂抹后重新拍一道」可触发后端 fallback 重写。前端 typecheck ✓ / build ✓(chunk `index-DICFySK_.js` 611714 bytes)。APK: `error-book-v47.2-print-figure-diagram.apk` |
|---|---|---|
| **v47.2** | 2026-09-26 | 打印预览页图源改用「示意图」(`figureImageUrl/figureBase64`)而非「整张题目照片」(`imageUrl/imageBase64`):v47.1 用错了图源,把用户拍摄的整张歪照当「题图」渲染,孩子打印出来根本看不出原书印刷的立方体/物理装置。修复: 打印题卡图片分支改成 `figureImageUrl/figureBase64`(原书示意图,2 列 140px/1 列 200px,print 加倍) → 兜底 `imageUrl/imageBase64`(整张题照,更小高度)。详情页(复习批注)仍用 imageUrl —— 语义不同。**只改 1 文件 28 行**。已知: 存量 figureBase64 几乎空,旧错题回退到整张题照(v47 OCR fallback 上线后预期 ≥30%); 让孩子「批注涂抹后重新拍一道」可触发后端 fallback 重写。前端 typecheck ✓ / build ✓(chunk `index-DICFySK_.js` 611714 bytes)。APK: `error-book-v47.2-print-figure-diagram.apk` |
| **v47.1** | 2026-09-26 | 打印预览页缺题图 hotfix(v47 漏修页面):v47 修了录入完成页 + 详情页,但 `PrintPreviewScreen.tsx:317` 题卡只渲染 `<LatexPreview>`,**完全没读 `err.imageUrl/imageBase64`** —— 孩子打出来的题目没有图,几何/物理题根本看不懂。修复: L317 题卡在 LatexPreview 上方插入 `<img src={resolveImageUrl(err.imageUrl \|\| err.imageBase64)}>`,`object-contain` + `bg-slate-50` + 2 列 `max-h-[100px]` / 1 列 `max-h-[160px]`(`print:` 加倍)。**只改 1 文件 17 行**,不动 v47 已部署代码。前端 typecheck ✓ / build ✓(chunk `index-Cs8KLGtX.js` 611412 bytes);容器 bind-mount 重启刷新(`error-book-nginx restart`,v44 P2 老坑)。APK: `error-book-v47.1-print-figure.apk` |
|---|---|---|
| **v47.1** | 2026-09-26 | 打印预览页缺题图 hotfix(v47 漏修页面):v47 修了录入完成页 + 详情页,但 `PrintPreviewScreen.tsx:317` 题卡只渲染 `<LatexPreview>`,**完全没读 `err.imageUrl/imageBase64`** —— 孩子打出来的题目没有图,几何/物理题根本看不懂。修复: L317 题卡在 LatexPreview 上方插入 `<img src={resolveImageUrl(err.imageUrl \|\| err.imageBase64)}>`,`object-contain` + `bg-slate-50` + 2 列 `max-h-[100px]` / 1 列 `max-h-[160px]`(`print:` 加倍)。**只改 1 文件 17 行**,不动 v47 已部署代码。前端 typecheck ✓ / build ✓(chunk `index-Cs8KLGtX.js` 611412 bytes);容器 bind-mount 重启刷新(`error-book-nginx restart`,v44 P2 老坑)。APK: `error-book-v47.1-print-figure.apk` |
| **v47** | 2026-09-26 | 题目插图回归(录入完成页图预览 + 详情页主图完整显示 + figureRegion fallback):① **P0** `CameraScreen` state 扩 `croppedUrls` + batchResult 加 grid 缩略图(`max-h-40 object-contain`)+ 全屏 Modal(点击黑底关闭);② **P1 后端** `pipeline/textExtract.js` 新增 `figureRegionFromTextPositions`(polygon→bbox→合并→100×100 网格 flood-fill,阈值:文字密度>80% / 补集<15% / 补集>92% 拒绝)+ `services/textin.js` 公式端点补 `position` + `routes/ocr.js` 5 处接入 `fallbackFigureRegion()`;③ **P3** `ErrorDetailScreen` 主图改 `object-contain max-h-72` + 删独立插图卡片 + 加补救提示。后端 test **58/58**(原 50 + 新 8 figureRegionFromTextPositions);前端 test 17/17。后端 fallback 预期几何题 figureBase64 命中率从 1.4% → ≥30%。APK: `error-book-v47-figure-preview.apk` |
|---|---|---|
| **v46.1** | 2026-09-26 | LatexPreview 裸 LaTeX 自动识别(录入明细数学公式渲染): v46 修好了 OCR 公式识别(还原 `\sqrt{x^{2}+4}` 等),但录入明细页只把 LaTeX 字符串当文本显示,用户看到的是源码不是公式 —— 识别等于白做。修复: `components/LatexPreview.tsx` 在原 `$...$` / `$$...$$` 解析后做第二遍兜底 —— 按行扫描,含 TeX 命令(`\sqrt`/`\frac`/`\dfrac`/`\sum`/`\int`/`^{`/`_{` 等)且 `$` 配对完整的行整行升级为块级公式渲染;中文题头/选项标签/纯函数表达式 `C. x(4-x)(0<x<4)` 不含 TeX 命令 → 保留 text,**零误伤**。新增 9 条单元测试覆盖裸 LaTeX / 显式 `$` 优先 / 奇数 `$` 跳过 / 纯中文 / 空 / 纯函数表达式。前端 test **17/17** / typecheck ✓ / build ✓(chunk `index-DGSACkjz.js`)。APK: `error-book-v46.1-latex-render.apk` |
| **v46** | 2026-09-26 | OCR 视觉塌缩多层防护(治「代数最小值」等高频套路题被脑补成 `a+1/a+4`):① **P0 治本** `routes/ocr.js` 并行调 `recognizeFormula`(/v2/recognize/formula),把权威 LaTeX 注入 `visionFallback` 的 userPrompt,视觉模型从「白板读图」变「按锚点补全」;② **P1** `latexNormalize.js` Step 2 只对单字符 radicand 补 `{}`,不再毁 `\sqrt{x^2+4}`;③ **P2** `pipeline/textExtract.js` 新增 `formulaSanityCheck(textContent)` 纯函数(选项<4 / symbols<3 / 形状重复 / 无 LaTeX 结构),视觉主路径返回前 + 低质量重读触发器都接入,不通过则降级 `semanticParseText` 文本路径;④ **P5** `routes/ocr.js` 读 `X-TextIn-App-Id/Secret-Code` 头透传给 TextIn,`config.html` 配的 key 真正生效;⑤ **P6** `POST /api/ocr` 接受 `forceTextPath=true` 跳过视觉兜底,前端 batchResult 页加「换通道重试」按钮;⑥ **hotfix** `callAnthropicAPI` 加 `imageBase64` 支持,`visionFallback` MiniMax 分支切 Anthropic Messages 协议 + image block(之前用 OpenAI /chat/completions 协议 MiniMax 不支持 → 404)。后端 test **50/50** / lint 0 error;前端 typecheck ✓。APK: `error-book-v46-ocr-fix.apk` |
| **v45** | 2026-09-26 | 错题列表分页 + 无限滚动(千条级仍流畅, P3 性能兜底): `GET /api/errors?paged=1&offset=&limit=`(默认全量不变, 分页返回 `{items,hasMore,total}` + `X-Total-Count` 头, Mongo `countDocuments`+`skip/limit`); 前端 `ErrorListScreen` 无限滚动(服务端分页 + 学科服务端筛选 + 竞态保护), 多选作用域=已加载页; 共享 `store.errors` 保留供 Dashboard 统计/打印全选。顺带补提交 v44 P1 详情投影(`GET /:id` 默认 `.select` 排除大 base64)。APK: `error-book-v45-paged-list.apk` |
| **v44** | 2026-09-26 | 图片性能根治(解决"错题多 + 公网打开慢"): ① P0 列表接口 `GET /api/errors` 加投影排除两张大 base64(列表 JSON 从 ~11MB 降到纯文字);② P1 新增 `GET /api/errors/:id/image` + `GET /:id?full=1` 按需取图;③ P2a 入库前把裁剪图落盘 `/uploads` 静态文件,`imageUrl` 存 URL(可缓存),`cropImage` 加 `maxDim=1280` 缩放 + `quality=0.85`;④ P2c 存量迁移脚本 `backend/scripts/migrate-images-to-static.js`(dry-run + 自动备份,`imageBase64` 落盘清空、`figureBase64` 保留供 AI);compose 加 uploads 持久化卷、nginx.conf 加 `/uploads` 静态 location。需重新出 APK |
| **v43** | 2026-09-25 | 工程加固批次(非新功能, 不影响线上产物): 修 7 处 tsc 错误 + `build` 加 `tsc --noEmit` 门禁; 后端装 vitest/supertest + 42 条单测(`jsonParse`/`latexNormalize`/`auth`/`textExtract`); `ocr.js` 启发式抽到 `pipeline/textExtract.js`; 后端 ESLint(flat config, 0 error); GitHub Actions CI(backend lint+test / frontend typecheck+test+build)。产物 chunk 名不变 `index-C54h8FJ4.js` |
| **v42** | 2026-09-25 | 打印同类练习题数量可选:`PrintPreviewScreen` 顶部「每题同类题」改为 `<input type=number min=0 max=8>` 自主输入(默认4,失焦钳位0–8)+「不打印」按钮;纯函数 `sliceSimilarQuestions` 集中 slice+兜底文案(min(N,M)),vitest 8 用例。纯前端改动,APK 已重出 `error-book-v42-similar-count.apk` |
| **v41** | 2026-09-25 | 题目插图单独保存 + AI 看图讲解:vision AI 识别时回传 `figureRegion`(插图归一化包围盒)→ 前端在裁剪图内再裁一次得 `figureBase64` 单独入库 → 详情页「📷 题目插图」卡片;AI 讲解/同类题把题图喂进多模态 message。后端 schema + `createMemoryError` 加 `figureBase64`。先发版后端(否则 strict:true 丢字段),再发版前端。APK: `error-book-v41-figure.apk` |
| **v40** | 2026-09-24 | 跨页拍题模式:viewfinder 加「跨页」tab → 拍2张自动垂直拼接(滑块手动对齐)→ 单条错题入库。后端 `ErrorQuestion` schema 加 4 字段(`isSplitPage`/`pageIndex`/`totalPages`/`splitGroupId`)。先发版后端(否则 mongoose strict:true 静默丢字段),再发版前端。APK: `error-book-v40-split-page.apk` |
| **v39** | 2026-09-17 | 后端 MongoDB 竞态加固:mongo healthcheck + backend `service_healthy` 门控(治本);backend 加运行期自愈(`ensureMongoReconnect` 后台重连 + `watchDisconnection` 断连自愈 + `isMemoryDB` 语义收紧),mongo 启动竞态/中途断连时静默切回,不再需手动 restart |
| **v38.2** | 2026-09-17 | DDNS 自动同步:飞牛 v6 动态租约变化 → 每5分钟 cron 比对刷新阿里云 AAAA 记录(脚本 `scripts/ddns-update.sh`,全路径 + `--profile dns` + 根域 `93gushi.com`) |
| **v38.1** | 2026-09-14 | 登录态持久化(SharedPreferences 双写+启动回填);APK Preferences 插件链接修复(Kotlin JVM 21→17 + 强制 aar 产出);飞牛 nginx 挂载加固(healthcheck + 部署后 nginx -s reload) |
| **v38** | 2026-09-14 | 语文题 sourceText(诗词/文言文/阅读原文提取+展示+AI 引用)；学科 LLM 自动分类 v2(9 学科,按知识点判)；JWT 30 天；迁移到飞牛 NAS(Docker Compose) |
| **v37** | 2026-09-06 | Wi-Fi 无 v6 兜底:API base 4 候选探测 fallback + 域名新增 A 记录 `220.187.13.231` |
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
- ~~列表分页(错题上千条时流畅)~~ → **v45 已实现**(`?paged=1` 服务端分页 + 前端无限滚动, 见版本历史)
- ~~OCR 视觉塌缩(代数最小值等高频套路题被脑补成 `a+1/a+4`)~~ → **v46 已实现**(P0 权威公式锚点 + P1 normalizer 不再毁 radicand + P2 formulaSanityCheck 拦幻觉 + P5 前端 TextIn key 透传 + P6 「换通道重试」按钮 + hotfix MiniMax 视觉协议)
- 区域选择后加"自动版面分析"建议位置（用户只微调）
- vision-fallback 加缓存（同图 1 分钟内复用，避免重复慢请求）
- 多题识别时按"4 选项自动切题"
- Agnes 视觉账户充值(目前欠费到 \$0.0002,实际靠 MiniMax-M3 跑视觉;建议冲 \$5+ 让双 provider 都可用)
- 多账号错题本独立存储（已实现 ownerId 隔离，可加切换 UI）

## 开发 / 测试 / CI

### 测试

```bash
# 后端测试(42 条:jsonParse/latexNormalize/auth/textExtract)
cd backend && pnpm test

# 前端测试(8 条:sliceSimilarQuestions)
cd frontend && pnpm test

# 前端类型检查(quality gate, build 前会自动跑)
cd frontend && pnpm typecheck

# 后端 lint(0 error / 少量 unused-var warning)
cd backend && pnpm lint
```

### GitHub Actions CI

`.github/workflows/ci.yml` 每次 push / PR 自动跑两个 job:

- **backend**:`pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm test`
- **frontend**:`pnpm install --frozen-lockfile` → `pnpm typecheck` → `pnpm test` → `pnpm build`

pnpm 10 + Node 20,缓存 pnpm-lock.yaml。CI 红了看 Actions 日志调 workflow,逻辑本机已全绿。

### 测试覆盖范围(v43 起)

| 层 | 覆盖 | 说明 |
|---|---|---|
| 纯函数 | `extractJSON` / `normalizeLatex` / `trimToFirstQuestion` / `extractTitleAndKP` / `sliceSimilarQuestions` | 无 IO, 快且稳, 断言值实跑核对 |
| 路由 | `POST /auth/register` / `POST /auth/login` | 内存模式(`USE_MEMORY_DB=true`)+ 手动挂 `express.json()`, 驱动真实分支零 Mongo |

### 线上验证

```bash
# 验证后端健康(飞牛 v6)
curl -6 -s 'http://[240e:390:88f6:c681::3f3]:4040/api/ocr/status'
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
- 飞牛 NAS 上 `gpssong` 用户没加入 docker 组，`docker ps` 直接跑会 `permission denied` —— 用 `sudo -S -p "" docker ...`（密码 `850225sonG`）
- 飞牛 buildkit 走 `docker.fnnas.com` 镜像会 401 —— 后端改动用 `docker build`(吃本地缓存 base image)+ `docker compose up -d`,不要 `docker compose build` 拉全量
- 飞牛后端容器读环境变量 `MONGODB_URI`(不是 `MONGO_URI`),写错 db 会退化成 memory 模式
- 登录接口字段名是 `account`(不是 `username`),`account` 同时接受用户名/邮箱
- IPv6 是动态租约（~7天），DNS AAAA 可能过期 —— 重启路由器或手动更新
- happy-eyeballs 优先 v4 → 飞牛无 v4 出口,手机/电脑必须走 v6,curl 必须加 `-6` 才能测 IPv6-only 域名
- 后端在 FNOS/Docker 容器里时，`/tmp/` 目录可能没权限，先 `sudo mkdir -p /tmp && sudo chmod 1777 /tmp`
- **AGP 8.13 + Capacitor 6 plugin 漏装**: 新装 `@capacitor/X` 后,APK 里可能搜不到 X 的 plugin 类,需手动 `./gradlew :capacitor-X:assembleDebug` 单独跑一遍触发 aar 产出,再删 `.gradle` 和 `app/build` 后重 build app
- **`dimer47-capacitor-plugin-printer` Kotlin JVM 21 冲突**: 插件自带 build.gradle 写死 `JvmTarget.JVM_21`,直接 sed 改 `node_modules/.../android/build.gradle` 的 `JvmTarget.JVM_21` → `JvmTarget.JVM_17`(pnpm 源,cap sync 不重写)
- **飞牛 nginx 挂载偶发失效**: 容器内 `ls /usr/share/nginx/html` 偶发 total 0,根因是挂载 race condition。docker-compose 已加 healthcheck 自动重启,部署脚本也加了 `nginx -s reload`
- **`scp` + `cp -r` 造成 `src/src` 嵌套 → 镜像崩溃(v44/v45 各踩一次)**: `scp -r backend/src/ nas:/tmp/eb-src/` 后 `/tmp/eb-src/` 是 **src 的内容**(没有再套一层 `src`);但部署脚本里 `cp -r /tmp/eb-src $PWD/backend/src` 又会把这份内容当整体拷进 `backend/src/` 下,得到 `backend/src/src/index.js`。Dockerfile `COPY . .` 把嵌套烤进镜像,容器启动 `Cannot find module '/app/src/index.js'` → 反复 `Restarting (1)`。**正确写法**:`rm -rf $PWD/backend/src && cp -r /tmp/eb-src $PWD/backend/src`(先删目标再整体拷),或用 `rsync -a /tmp/eb-src/ $PWD/backend/src/`(尾斜杠=拷内容)。**校验**:build 前 `test -f $PWD/backend/src/index.js`,没有就说明又嵌套了
- **backend 重建期 nginx reload 会 `host not found in upstream "backend"`**: `nginx -s reload` 会重新解析 `backend` 主机名,若此刻 backend 正在 recreate(短暂不可达)就报错。等 `docker ps` 显示 `error-book-backend: Up` 后**再** reload 即可,重试一次就通,不影响数据
- **zsh brace 展开 `{a,b,c}` 在脚本里会炸字面量**: 部署脚本写 `rm ... src/{routes,schemas,services}` 时 zsh 不展开(非交互 shell),会建/删一个字面叫 `{routes,schemas,services}` 的目录,残留还会被 `COPY . .` 带进镜像。目录清理用 `for` 循环或 glob,别用 brace
- **容器内没有 `curl`/`wget`**: 飞牛 backend/nginx 镜像是精简 node/alpine,`docker exec ... curl` 会 `executable file not found`。健康检查从**宿主机** `curl -6 http://error.93gushi.com:4040/...` 或 `curl -6 http://[<feiniu-v6>]:4040/...` 打,别在容器里 curl;也别 `set -e` + 容器内 curl(会中途 abort 后续健康检查)

## License

MIT