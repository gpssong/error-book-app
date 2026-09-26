# Changelog

## v46 (2026-09-26) - OCR 视觉塌缩多层防护(P0 治本 + P1/P2 兜底)

### 背景

拍「代数最小值」等高频套路题时,视觉模型(Agnes-2.5-pro-alpha)把
`[B] √(x²+4)+4/√(x²+4)` 脑补成 `a+1/a+4`,把 `[D] m²+2/√(n(m²−n))` 脑补成 `4+1/4+4`,
`latexNormalize` 还帮忙「包装」成看起来对的 LaTeX, **双重掩盖识别崩坏**.

**根因(trace 出的 3 个)**:
1. TextIn `/v2/recognize/formula` 端点已实现但未调用,仅用通用 OCR + 视觉
   → 视觉模型从「白板读图」,容易套训练数据里的常见模式
2. `latexNormalize` 贪婪匹配 `\sqrt` 后跟多字符 radicand,把 `\sqrt{x^2+4}`
   毁成 `\sqrt{x}^{2}+4}` 渲染报错/错位
3. 前端 TextIn key 被后端丢弃,`config.html` 配置死开关

### 改动(6 项)

| 类别 | 内容 |
|---|---|
| **P0 治本:权威公式锚点** | `routes/ocr.js` 并行调 `recognizeFormula`(/v2/recognize/formula), 把权威 LaTeX 注入 `visionFallback` 的 userPrompt;视觉模型从「白板读图」变「按锚点补全」,杜绝脑补 |
| **P1 normalizer 不再毁 radicand** | `latexNormalize.js` Step 2 只对单字符 radicand 补 `{}`,多 token radicand(含运算符/花括号)不碰;Step 1 接受 `√` 后接 `(` 触发 `\sqrt(` |
| **P2 公式 sanity 拦幻觉** | `pipeline/textExtract.js` 新增 `formulaSanityCheck(textContent)` 纯函数,4 种幻觉检测:选项<4 / symbols<3(去 A-D 前缀) / 形状重复(去变量后 hash ≤2) / 无 LaTeX 结构;视觉主路径返回前 + 低质量重读触发器都接入,**不通过则降级到 `semanticParseText` 文本路径形成对照** |
| **P4 双 provider(线上已就绪)** | 飞牛 `.env` 已配 `MINIMAX_API_KEY`,`semanticParseText` 优先走 Anthropic Messages 协议调 MiniMax-M3;但 `visionFallback` 之前误用 OpenAI `/chat/completions` 协议调 MiniMax → 404。**hotfix**: `callAnthropicAPI` 加 `imageBase64` 支持,`visionFallback` MiniMax 分支切到 `callAnthropicAPI`,按 Anthropic Messages image block 发多模态 |
| **P5 前端 TextIn key 透传** | `routes/ocr.js` 读 `X-TextIn-App-Id/Secret-Code` 头透传给 `recognizeText/recognizeFormula/eraseHandwriting/isTextInConfigured`,`config.html` 配置的 key 真正生效 |
| **P6 前端「换通道重试」按钮** | 后端 `POST /api/ocr` 接受 `forceTextPath=true` 跳过 `visionFallback`;前端 `CameraScreen` batchResult 页加「换通道重试」按钮,缓存最近 croppedUrl,重试结果拼到明细作为对照 |

### 设计决策

- **「治本 + 多层兜底」分层**: P0 治本(权威锚点) + P1 normalizer 不再放大错误 + P2 sanity 拦幻觉 + P6 用户逃生口。任何一层失效,下一层接住。
- **视觉模型塌缩的根因是「白板读图」,不是「模型不够强」**:给视觉模型看到原图 + 权威公式字符串,问题消失。这比换模型/换 prompt 都彻底。
- **`formulaSanityCheck` 是「拦幻觉」而非「禁止幻觉」**:真出幻觉,LLM 仍可能产出;sanity 在 LLM 返回值上做统计性检查(形状重复 / 符号贫乏 / 无 LaTeX 结构),不通过则降级文本路径,文本路径通过就用文本。
- **P6 是「逃生口」不是「主路径」**:默认走视觉兜底,用户怀疑结果时点按钮换文本,**主动选择**而非强制路径。
- **hotfix-1: MiniMax 协议**: `callVisionAPI`(OpenAI `/chat/completions`)MiniMax 不支持,**必须**用 `callAnthropicAPI`(Anthropic Messages `/v1/messages`)+ image block。Agnes 视觉账户已欠费到 $0.0002,所以 MiniMax 是实际工作 provider。

### 验证

- 后端 `pnpm test` **50/50 通过**(原42 + 1 P1 修复回归 + 7 P2 sanity)
- 后端 `pnpm lint` **0 error / 9 warning**(均存量 unused var)
- 前端 `pnpm typecheck` ✓ / `pnpm build` ✓(chunk `index-BhdpWipg.js`)
- 飞牛线上部署:`/api/ocr/status` 返回 `{"textin":"configured","visionModel":"agnes-2.5-pro-alpha","minimax":"configured"}`
- 健康检查: `curl -6 http://error.93gushi.com:4040/api/health` → `{"status":"ok","db":"mongodb"}`
- 真机验证(MiniMax vision protocol): `curl https://api.minimaxi.com/anthropic/v1/messages` + image block → 200 OK ✓
- APK `error-book-v46-ocr-fix.apk`(5.87MB, 含 v46 chunk) → 飞牛同步盘 + 本地 apk/

### 待办(用户充值即可)

- Agnes 视觉账户欠费 ($0.0002),目前实际靠 MiniMax-M3 跑视觉。建议充值到 $5+ 以便双 provider 都可用(Agnes 文本 / MiniMax 视觉,互为备份)。

## v45 (2026-09-26) - 错题列表分页 + 无限滚动(千条级仍流畅)

### 背景

v44 解决了「列表 JSON 带 11MB base64」的根因, 但列表本身仍是**一次全量拉回**(单孩子所有错题)。错题上千条时, 即使每条已轻量, 单次拉回 + 前端一次性渲染 N 张 `<img>` 仍会卡顿。本次加**服务端分页 + 前端无限滚动**, 首屏只拉 30 条, 滚动到底自动追加。

### 改动

| 层 | 文件 | 内容 |
|---|---|---|
| 后端 | `routes/errorQuestion.js` | `GET /api/errors` 加 `?paged=1&offset=&limit=`(limit 默认 30 / 上限 100), 返回 `{items, hasMore, total}` + `X-Total-Count` 头; **默认全量形态不变**(仍返回数组), 分页是 additive, 老客户端零影响。Mongo 一次 `countDocuments` + `skip/limit`(索引 `{childId, createdAt}` 覆盖排序) |
| 前端 | `stores/api.ts` | 新增 `getErrorsPage({childId, subject, offset, limit})` |
| 前端 | `ErrorListScreen.tsx` | 本地分页列表 `pageItems` + 无限滚动(滚到距底 <240px 追加); 学科筛选走**服务端**(不再客户端 filter); child/subject 变化重置; 竞态保护(飞行中切换丢弃旧结果); 多选/「全选已加载」作用域 = 已加载页 |

### 设计决策

- **不改共享 store**:`AppContext.errors` 仍由 AppContext 拉全量, Dashboard「本周统计」图 + 打印页「全选」不受影响; 分页只作用于列表页本身。
- **全量接口保留**:`?paged=1` 才走 skip/limit, 默认路径原样, 兼容老 APK。
- **治标定位**:这是 P3(性能兜底), 治本还是 v44 的图片静态化。错题上千条时靠分页保持流畅, 但**不会减少已存储数据量**。

### 顺带补提交

- v44 P1 的 `GET /:id` 详情投影修复(`.select` 排除大 base64, `?full=1` 才全量)在 v44 部署时已上线但**漏提交**, 本次一并 `git commit`(线上与仓库对齐)。

### 验证

- 前端 `tsc --noEmit` ✓ / `pnpm build` ✓(chunk `index-HdQt4DWI.js`)
- 后端 `pnpm test` 42/42 ✓ / `pnpm lint` 0 error
- 线上(飞牛 v6):注册临时账号建 6 条错题, `?paged=1&limit=2` → `items=2 hasMore=true total=6`;`?offset=4` → `hasMore=false`;响应头 `X-Total-Count: 6` ✓;默认路径仍返回数组 ✓
- APK `error-book-v45-paged-list.apk`(5.87MB, 含 v45 chunk)→ 飞牛同步盘

## v44 (2026-09-26) - 图片性能根治:列表不传大图 + 图片静态化 + 裁剪缩放

### 背景

用户反馈「错题多了以后连公网打开有点慢」。定位根因:每道错题的**题图以 base64 内联存进 Mongo 文档**(`imageBase64`/`figureBase64` 都是 `String`),而 `GET /api/errors` 列表接口**整文档返回、无投影** —— 每切一次孩子 / 进列表 / 删除后 refresh,都要把 N 道错题 × 每张 300KB~2MB 的 base64 一次性经公网 v6 拉到手机。实测生产库 **59 道错题、58 条带 `imageBase64`、合计 10.9 MB base64**,单次打开列表 = 拉 ~11MB 的 JSON,这是慢的真正原因(不是 App 本身)。

### 改动(四块,自底向上)

| 类别 | 内容 |
|---|---|
| **P0 列表投影(止血)** | `GET /api/errors` 加 `.select('-imageBase64 -figureBase64')`,列表 JSON 从 N 张图降到纯文字 + `imageUrl`(~99% 瘦身),零数据风险 |
| **P1 单独取图端点** | 新增 `GET /api/errors/:id/image`(静态 URL → 302,老数据 → 吐 data-URL);`GET /api/errors/:id` 加 `?full=1` 开关,默认排除两张大 base64,详情页按需拉全量喂 AI |
| **P2a 图片静态化** | 入库前把裁剪图 `uploadBase64` 落盘成 `/uploads/xxx.jpg`,`imageUrl` 存静态 URL(可缓存),不再内联 base64;`cropImage` 输出加 `maxDim=1280` 缩放上限 + `quality=0.85`(避免裁剪图=原图 4000px 那么大) |
| **P2c 存量迁移脚本** | `backend/scripts/migrate-images-to-static.js`:把存量 `imageBase64` 落盘成 `/uploads/err-{id}.jpg`、文档 `imageUrl` 改指向静态 URL、`imageBase64` 清空;**保留** `figureBase64`(AI 讲解只用它喂视觉模型,`ai.js:217` 从未读 `imageBase64`)。带 `--dry-run` + 自动备份集合 |

### 前端配套

- `stores/api.ts`:新增 `getErrorFull(id)`(`?full=1`)、`resolveImageUrl(url)`(把 `/uploads` 相对路径绝对化成 API base,`data:`/`http` 原样返回 —— Capacitor `file://` 与跨域下相对路径解析不了必须绝对化)
- `ErrorListScreen` / `DashboardScreen` 列表 `<img>` 走 `resolveImageUrl(err.imageUrl)` + `loading="lazy"`
- `ErrorDetailScreen`:显示优先轻量 `imageUrl`;进详情页按需 `getErrorFull` 补齐 base64 供 AI;插图卡支持 `figureImageUrl`
- `CameraScreen`:裁剪 → 上传拿 `/uploads` URL → `imageUrl` 存 URL;`uploadUrl` 失败回退内联 base64 不卡流程

### 部署配套

- `docker-compose.yml`:backend + nginx 各挂 `./backend-public/uploads`(backend 写 `/app/public/uploads`,nginx 只读挂 `/uploads-static`),**不加卷则 `docker build` 重建镜像会丢已上传图片**
- `nginx.conf`(拉进 repo 作源):加 `location ^~ /uploads/` → `alias /uploads-static/` + 30 天强缓存(`^~` 让其优先于下方 `.jpg` 正则匹配,避免被 `root` `try_files` 404)

### 部署顺序(关键)

```
1. 发版后端(P0 投影 + P1 端点 + schema figureImageUrl)→ 立刻止血列表
2. 同步 compose(加 uploads 卷)+ nginx.conf(加 /uploads location),docker compose up -d
3. 发版前端(P2a 静态化 + 缩放)→ 新拍题走 /uploads
4. 跑迁移:P0/P1 验证 OK 后, scp 脚本 + 先 --dry-run,再真跑 P2c
   node backend/scripts/migrate-images-to-static.js --dry-run
   node backend/scripts/migrate-images-to-static.js   # 自动备份 errorquestions-bak-{ts}
5. 健康检查 + 出 APK
```

### 设计决策

- **图不再经列表 JSON**:核心是把 11MB 的 base64 从「每次打开列表都拉」变成「静态文件 + 浏览器/CDN 缓存,只在首屏 `<img>` 按需拉一次」。P0 立刻止血(零数据风险),P2 根治(库瘦身 + 可缓存)。
- **`imageBase64` 保留但不显示**:AI 讲解 `analyze/similar` 只用 `figureBase64` 喂视觉模型(`ai.js:217/272`),从不读 `imageBase64`,所以清空 `imageBase64` 不影响 AI;新数据仍存一份 base64 作兜底,老数据迁移后清空。
- **`figureBase64` 保留**:生产当前 0 条,但 AI 依赖它,迁移只补 `figureImageUrl` 不清 base64,零 AI 破坏。
- **幂等 + 可回滚**:迁移脚本对已迁移文档(字段已空)跳过;真跑前自动 `insertMany` 备份到 `errorquestions-bak-{ts}`。

### 验证

- 后端 `pnpm test` **42/42** + `pnpm lint` **0 error**(9 warning 均存量 unused var)
- 前端 `pnpm typecheck` ✓ + `pnpm test` **8/8** + `pnpm build` ✓(产物 `index-BY_9TGeX.js`)
- 生产量级核实:`docker exec error-book-mongo mongosh` 查 `errorquestions` = 59 条 / imageBase64 10.9MB / figureBase64 0 条(迁移前)


## v43 (2026-09-25) - 工程加固批次(测试基建 + 质量门禁 + CI)

### 背景

项目从 v42 起功能已很稳定,但工程基建有空洞:前端 `vite build` 不跑类型检查(7 处 tsc 错一直没拦住)、后端 0 测试、无 lint、无 CI。本次一次性补齐,目标是**让质量门禁真正生效 + 核心纯函数/路由行为有测试兜底**。非新功能,不影响线上行为(产物 chunk 名不变 `index-C54h8FJ4.js`,纯编译期/测试基建)。

### 改动

| 类别 | 内容 |
|---|---|
| **前端类型门禁** | 修 7 处 tsc 错误:`@types/katex` 补声明、`SplitPageScreen` ref 类型改 `RefObject<HTMLInputElement\|null>`(React 19)、`api.ts` `Promise.any` 的 `winner: string`、tsconfig `target/lib` ES2020→**ES2021**。`package.json` 新增 `typecheck` 脚本,`build` 改 `tsc --noEmit && vite build` |
| **后端测试基建** | 装 `vitest` + `supertest`,`"test": "vitest run"` 脚本 |
| **后端单测(42 条)** | `utils/jsonParse.test.js`(8:extractJSON 直 JSON/围栏/首块/嵌套/坏块跳过/空值)+ `utils/latexNormalize.test.js`(15:unicode→LaTeX/反斜杠修复/`$`闭合/幂等/边界)+ `routes/auth.test.js`(10:注册必填/409/密码长度/邮箱格式、登录 username-or-email/大小写/401 文案/400)+ `pipeline/textExtract.test.js`(9:trimToFirstQuestion/extractTitleAndKP) |
| **OCR 流水线拆模块** | `ocr.js` 里两个启发式纯函数 `trimToFirstQuestion` / `extractTitleAndKP` + `KP_KEYWORDS` 抽到 `src/pipeline/textExtract.js`(可独立单测),路由 `import` 复用,**零行为变化** |
| **ESLint** | 后端装 `eslint@9` + `@eslint/js`,`eslint.config.js` flat config(0 error / 9 warning,存量 regex 无害转义降 off、Node 内置 `fetch/AbortSignal` 补 globals)。`db.js` 去掉无意义的 `try{...}catch{throw}` |
| **GitHub Actions CI** | `.github/workflows/ci.yml`:backend job(lint + test)+ frontend job(typecheck + test + build),pnpm 10 + node 20 |
| **文档/清理** | `index.js` 误导注释修正(默认 MongoDB、`USE_MEMORY_DB=true` 才走内存);删本地 `apk/` 旧产物(105MB);`package.json` 依赖归位(修 pnpm 误建根 package.json) |

### 设计决策

- **纯函数先行**:测试只碰**无 IO 的纯函数**(`extractJSON`/`normalizeLatex`/`trimToFirstQuestion`/`extractTitleAndKP`)+ 内存模式路由(auth),不碰 MongoDB/网络,快且稳。`latexNormalize` 断言值先用 `node -e` 实跑核对,不拍脑袋。
- **auth 走内存模式**:测试顶部 `process.env.USE_MEMORY_DB='true'` + 只 import 裸 router(手动挂 `express.json()`),驱动 register/login 的真实分支,零 Mongo 依赖。
- **ESLint 务实不阻塞**:存量代码 35 条 `no-useless-escape`(正则里无害转义)、1 条无意义 try/catch,选择降 off / 修掉真 bug,而非一次报几百条。CI 对 lint 用「0 error 放行、warning 提示」。
- **CI 模拟验证**:GitHub Actions 本地跑不了,用 `pnpm install --frozen-lockfile` + 逐步 `lint/test/typecheck/build` 在本机复现每一步,全绿再 push。

### 验证

- 后端 `pnpm test` **42/42** + `pnpm lint` **0 error**(9 warning 均 unused var)
