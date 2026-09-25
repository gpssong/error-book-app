# Changelog

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
- 前端 `pnpm test` **8/8** + `pnpm typecheck` 通过 + `pnpm build` 通过(产物 `index-C54h8FJ4.js`)
- 纯工程加固,**不重新出 APK / 不重新部署**(线上 v42 已正确)

## v42 (2026-09-25) - 打印同类练习题数量可选(0–8 自主输入)

### 背景

打印预览页(`PrintPreviewScreen`)每题下方挂的「同类练习」数量被写死:2 列排版固定显示前 2 道、1 列排版固定显示前 3 道(`similar.slice(0, printLayout === '2列' ? 2 : 3)`)。但每道错题共存的同类题是 8 道(后端 `SIMILAR_QUESTION_COUNT=8`),标题却写「同类练习 · 8 题」,实际只渲染 2 道 —— 用户想多打几道同类题练手时,没有任何入口能调。

本次让用户**自主输入每道题打印的同类题数量**(数字框 0–8,默认 4),`0`/「不打印」按钮让同类练习区整块消失。

> 迭代轨迹:最初做成了 6 个预设按钮(0/2/4/6/8),用户反馈「要能自己输数字」→ 加 3(变 0/2/3/4/6/8)→ 最终**全部预设按钮换成单个数字输入框**(0–8,失焦钳位)。`sliceSimilarQuestions` 纯函数从头支持任意 `select` 值,UI 怎么改都不影响它的测试。

### 改动

| 文件 | 作用 |
|---|---|
| `frontend/src/utils/sliceSimilarQuestions.ts` (新增) | 纯函数 `sliceSimilarQuestions(questions, select)` + `SIMILAR_COUNT_OPTIONS=[0,2,3,4,6,8]` + `DEFAULT_SIMILAR_COUNT=4`。集中三条逻辑:select 存量 M>select → 显示前 select 道 + 「还有 M-select 道未显示」;M<select → 显示全部 M 道 + 「已显示全部现有 M 道同类题」兜底;select=0 → 空(块不渲染)。纯函数便于单测,支持任意 select(不止预设项) |
| `frontend/src/utils/sliceSimilarQuestions.test.ts` (新增) | vitest 8 用例:覆盖 N<M / N=M / N>M 兜底 / select=0 / 存量 0 / 常量校验 |
| `frontend/src/components/PrintPreviewScreen.tsx` | 加 `similarCount`(默认 4)+ `similarCountInput`(字符串暂存,避免前导零/中间空)两个 state;顶部「每题同类题」一行 = 「不打印」按钮 + `<input type=number min=0 max=8>`(移动端 `inputMode=numeric` 弹数字键盘);`onChange` 跟手解析、`onBlur` 钳位 `[0,8]`(非数字/空回默认 4);渲染处改用 `sliceSimilarQuestions(similar, similarCount)` 取代写死的 slice;「未显示」提示改成 `slice.hiddenCount`/`slice.note`;打印设置卡加「同类练习题:每题 N 道 / 不打印」 |
| `frontend/package.json` | devDep 加 `vitest@^5.0.1` + `"test": "vitest run"` script |

### 设计决策

- **P2(装 vitest)而非手测**:逻辑虽是纯函数,但这是项目第一个测试基建,以后 slice/其他纯函数都能复用。`pnpm test` 跑绿(8/8)。
- **统一控制(选项 A)**:顶部一个控件管所有错题,而非每题独立,交互最简。
- **兜底 ① min(N, M)+ 文案**:存量不足时显示全部现有题并提示「已显示全部现有 M 道同类题」,不自动补 AI 生成(补生成会拖慢打印、增加额度消耗)。
- **默认 4 / 2 列不降级(D1)**:按用户字面意思默认 4,2 列排版可能略挤,需要少就切 2 或不打印。
- **纯函数前置**:「选数量」与「存量不足」的边界最容易写错,抽成 `sliceSimilarQuestions` 单测 8 条用例先跑红再实现;UI 从按钮组改到数字框时纯函数与测试零改动。
- **数字框而非 preset 按钮(最终形态)**:用户要「自主输入数字」。`min=0 max=8` 与后端 `SIMILAR_QUESTION_COUNT=8` 对齐;失焦钳位防止输 9/15/负数。中间态保留 `similarCountInput` 字符串态,避免受控 `<input type=number>` 在前导零/清空时丢字。

### 部署

纯前端改动,无 schema 变更。`pnpm build` → `dist` 覆盖飞牛 `192.168.0.32` nginx 挂载目录 → `nginx -s reload`。线上 `index-C54h8FJ4.js` 已含「每题同类题 / 不打印 / min:0 / max:8」标记,验证通过(`n150.93gushi.com` 的 AAAA 当前指向飞牛同一 v6,一并生效)。

APK: `error-book-v42-similar-count.apk`(纯 Web 前端功能,重出 APK 装到小米 10;数字输入框在 Capacitor WebView 内正常弹键盘取值)。

## v41 (2026-09-25) - 题目插图单独保存 + AI 讲解看图

### 背景

识别题目时,题目里的关键示意图(几何立体图 / 物理装置图 / 化学结构 / 折线图等)只活在裁剪进 `imageBase64` 的整题大图里,**没有被单独保存**。孩子复习时只能看文字选项,对不上"哪个面是 A、哪个是 G"(典型:立方体昆虫爬行最短路径题),也看不到装置图。AI 讲题/出同类题时同样看不到图,几何类题讲解失真。

本次让 AI 在识别时额外回传 `figureRegion`(题目插图归一化包围盒),前端据此裁出**题目插图 `figureBase64` 单独入库**,详情页多一张「📷 题目插图」卡片;AI 讲解/同类题也把这张图喂进去,真正"看图"。

### 改动

| 文件 | 作用 |
|---|---|
| `backend/src/services/minimax.js` | vision/文本解析 prompt 加 `figureRegion` 规则;`normalizeParsed` 新增 `figureRegion` 字段 + `normalizeFigureRegion` 校验(坐标 clamp、面积 <2% 误判丢弃) |
| `backend/src/routes/ocr.js` | 4 条返回路径(vision-primary / 低质量 vision-fallback / textin+ai-text / 兜底 vision-fallback)透传 `figureRegion` |
| `backend/src/schemas/errorQuestion.js` | mongoose schema + `createMemoryError` 加可选 `figureBase64`(默认 `''`) |
| `backend/src/routes/ai.js` | `callAI` 支持 `figureBase64` 多模态 message;`/analyze` `/similar` 把题图喂进 prompt(模拟模式/无图不受影响) |
| `frontend/src/stores/api.ts` | `ErrorItem` + `recognizeQuestion`/`analyzeError`/`generateSimilar` 加 `figureBase64`/`figureRegion` 类型 |
| `frontend/src/components/CameraScreen.tsx` | `handleRegionsConfirm` 用 `parseFigureRegion` + 现成 `cropImage` 在裁剪图内再裁一次得 `figureBase64`,随 `createError` 入库 |
| `frontend/src/components/ErrorDetailScreen.tsx` | 详情 Tab 渲染「📷 题目插图」卡片(有图才显示);`analyzeError`/`generateSimilar` 带上 `figureBase64` |

### 部署顺序(关键!)

**先发版后端,再发版前端**:`figureBase64` 是新 schema 字段,mongoose `strict:true` 未声明字段会被静默丢弃。本次已按此顺序在飞牛 `192.168.0.32` 完成(后端 3 容器 rebuild+restart → 前端 dist 覆盖 nginx → `nginx -s reload`)。

### 文件

| 文件 | 改动 |
|---|---|
| 见上表 | 后端 4 + 前端 3,共 7 个文件 |

APK: `error-book-v41-figure.apk`(前端含新卡片,装到手机即可;识别新题时自动带图入库)

## v40 (2026-09-24) - 跨页/翻面拍题模式

### 背景

学生拍题时题目正好在两页交界处,或作业本翻面时一道题横跨上下两个半页。一次拍照没法拍齐,旧版只能拍两次 → OCR 两次 → 入库两条独立错题。讲题时要在两个详情页翻,且后半段题没题号衔接,复习体验断裂。

本次新增「跨页拍题」模式:拍 2 张 → App 自动垂直拼接 → 拖滑块手动对齐 → **只入库 1 条**错题(挂拼接图)。

### 新增

#### 1. 前端工具与组件

| 文件 | 作用 |
|---|---|
| `frontend/src/utils/imageStitch.ts` | 纯函数 `stitchImagesVertically(img1, img2, {dropTopRatio})`,canvas drawImage 9 参数重载 + JPEG q=0.82 输出 |
| `frontend/src/components/SplitPageScreen.tsx` | 跨页拍题 UI 容器,自管子状态机 `idle → firstReady → aligning → confirmed`,滑块 0..0.6 控制 `dropTopRatio` |
| `frontend/src/components/ErrorDetailScreen.tsx` | 标题旁新增「📄 跨页题 N 页」徽章 |

#### 2. `CameraScreen` 接入

- `Phase` 类型扩 `splitPage`;`cameraMode` 扩 `跨页`
- 顶部 tab 加第 4 项「跨页」,点击直接进 `SplitPageScreen`
- 「跨页」tab 时 viewfinder 拍照/相册按钮 disabled(避免误触重复触发)
- 拼接图塞回 `capturedImageUrl` → 进 `regionSelect` 走原有流水线,识别/入库零感知
- 入库时挂 4 字段:`isSplitPage / pageIndex / totalPages / splitGroupId`

#### 3. 后端 schema

`backend/src/schemas/errorQuestion.js` mongoose schema 加 4 字段(`default: false/0/0/''`),`createMemoryError` 同步透传。

### 部署顺序(关键!)

**必须先发版后端,再发版前端**:mongoose 默认 `strict:true`,未声明字段会被静默丢弃。先发版前端会让 `isSplitPage` 永远是 `undefined`。

### 文件

| 文件 | 改动 |
|---|---|
| `frontend/src/utils/imageStitch.ts` | **新增** |
| `frontend/src/components/SplitPageScreen.tsx` | **新增** |
| `frontend/src/components/CameraScreen.tsx` | Phase 扩 splitPage + tab 加「跨页」+ 拍照按钮 disabled + handleRegionsConfirm 入库带 4 字段 |
| `frontend/src/components/ErrorDetailScreen.tsx` | 跨页题徽章 |
| `frontend/src/stores/api.ts` | ErrorItem 4 字段可选 |
| `backend/src/schemas/errorQuestion.js` | mongoose schema + createMemoryError 4 字段 |
| `docker-compose.yml` | 无改动(沿用 v39 mongo healthcheck 门控) |

### 部署

- 后端:scp + docker build + compose up -d backend(mongo healthcheck 触发 `Waiting → Healthy → backend Started`)
- 前端:pnpm build + scp + nginx reload
- `/api/health` 报 `db: mongodb`,`/assets/index-pfIr_qI3.js` 200 (604 KB)
- APK: `error-book-v40-split-page.apk` (5.8 MB) → 飞牛同步盘

### 已知限制

- 仅支持 2 页拼接;≥3 页需多次拼接后合并(未来 v41 可基于 `splitGroupId` 聚合)
- 不保留拼接前的两张原图(节省存储)
- 滑块手动对齐是简化方案,歪斜/低对比场景体验一般 — 90% 拍齐的作业场景够用

---

## v39 (2026-09-17) - 后端 MongoDB 竞态加固(启动门控 + 运行期自愈)

### 背景

gpssong 账号突然无法登录。排查发现根因是**启动竞态**:backend 启动那一刻 mongo 容器还没就绪 → mongoose 5 秒超时 `ECONNREFUSED 172.21.0.4:27017` → `index.js` 捕获后退化成**内存模式**(`USE_MEMORY_DB=true`)且**永不重试** → 一直查空的内存 store,登录 401。数据本身没丢(mongo 里 gpssong/臭妞儿 2 账号都在),只是 backend 连不上库。

临时修复是 `docker restart error-book-backend` 让它重连上 mongo。但竞态会复发,本次做两层加固:

### 改动

#### 1. `docker-compose.yml`:mongo 就绪门控(治本)

```yaml
mongo:
  healthcheck:
    test: ["CMD", "mongosh", "--quiet", "--eval", "db.adminCommand('ping')"]
    interval: 2s
    timeout: 5s
    retries: 20
    start_period: 10s
backend:
  depends_on:
    mongo:
      condition: service_healthy   # 原为无条件 depends_on: - mongo
```

compose 起 backend 前先等 mongo 通过 `mongosh ping`,从根上消除「backend 抢在 mongo 前启动」的竞态。

#### 2. `backend/src/schemas/db.js` + `index.js`:运行期自愈(兜底)

- `ensureMongoReconnect()`:连失败后后台每 5s 重试(最多 3 小时),连上即清 `USE_MEMORY_DB` 标记、切回 MongoDB
- `watchDisconnection()`:监听 mongoose `disconnected` 事件,mongo 中途 OOM/重启/断网时自动触发重连
- `isMemoryDB()` 语义收紧为 `USE_MEMORY_DB==='true' && readyState!==1`——只要真连上 mongo(readyState===1)就自动切回,不再被环境变量卡死

这样覆盖「启动竞态」+「运行中断连」两种场景,后端静默自愈,不再需要手动 restart。

### 部署

- backend 镜像重建 + `docker compose up -d`(日志确认 `Waiting → Healthy`,backend 等 mongo healthy 才起)
- nginx 因 backend recreate 后 IP 变化一度 502,`docker restart error-book-nginx` 重新解析上游后恢复
- `/api/health` 报 `db: mongodb`,gpssong 登录 `/me` 200 admin

### 文件

| 文件 | 改动 |
|---|---|
| `docker-compose.yml` | mongo healthcheck + backend `service_healthy` 门控 |
| `backend/src/schemas/db.js` | `ensureMongoReconnect` / `watchDisconnection` / `isMemoryDB` 收紧 |
| `backend/src/index.js` | 连失败调 `ensureMongoReconnect`,启动后注册 `watchDisconnection` |

---

## v38.2 (2026-09-17) - DDNS 自动同步（飞牛 v6 → 阿里云 AAAA）

### 背景

飞牛 NAS 的公网 IPv6 是运营商**动态租约（~7 天）**，到期换地址后 `error.93gushi.com` 的 AAAA 记录仍指向旧值 → 公网打不开（容器/nginx/4040 本地都正常，纯 DNS 没跟上）。

本次手动修复时把 AAAA 从旧 `240e:390:88f6:c681::3f3` 更新到当前 `240e:390:88f4:5a91::3f3`，并搭好自动同步，让下次 v6 再变也能自动跟上。

### 改动

#### 1. `scripts/ddns-update.sh` 重写（旧版 3 个问题全修）

| 旧版问题 | 修复 |
|---|---|
| 依赖已下线的 `gpssong@192.168.0.14` 拿 v6 | 真源改到飞牛 `192.168.0.32`，SSH 读 `ip -6 addr` 实时全局 v6 |
| 假设飞牛有 v4 出口、更新 A 记录 | 只做 AAAA（飞牛无 v4 出口，A 记录无意义） |
| `aliyun` / `sshpass` 用裸命令名，cron PATH 没有 homebrew → 一直报 "aliyun CLI 未安装"，**脚本从未真正生效** | 全部改全路径 `/opt/homebrew/bin/...` + crontab 顶部 `PATH=` 行 |

**决策逻辑**：每 5 分钟比对「飞牛当前 v6」与「阿里云当前 AAAA」，一致就跳过（不打 API），不一致才 `UpdateDomainRecord` 刷新。

#### 2. crontab

```
PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/sbin:/usr/sbin
*/5 * * * * /Users/tongban/projects/error-book-app/scripts/ddns-update.sh >> /tmp/ddns-update.log 2>&1
```

### 踩坑记录

- 阿里云 DNS API `DescribeDomainRecords` 的 `--DomainName` 必须传**根域** `93gushi.com`，传 FQDN `error.93gushi.com` 会报 `InvalidDomainName.NoExist`；子域走 `--RR error`
- `UpdateDomainRecord` 不接受 `--DomainName` 参数（跟 Describe 不一致）
- 阿里云 DNS 必须走 `--profile dns`（套 2 的 AK `LTAI5t6jBuHjTYd7SnGRj3iP`），默认 profile 没这个域名权限
- 更新成已存在的值会报 `DomainRecordDuplicate`（本脚本靠"先查再对比"规避，不是 bug）

### 验证

- 手动跑 `bash scripts/ddns-update.sh` → `OK 一致` 退出码 0
- 模拟 cron 最小环境（`env -i PATH=...`）跑通
- 下次 v6 变化后 5 分钟内自动刷新，无需人工介入

### 文件

| 文件 | 改动 |
|---|---|
| `scripts/ddns-update.sh` | 重写（飞牛 v6 真源 + 全路径 + 阿里云对比决策） |
| crontab | 加 `PATH=` 行 + `*/5` ddns 行 |

---

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
