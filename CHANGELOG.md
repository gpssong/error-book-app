# Changelog

## v47.2 (2026-09-26) - 打印预览页显示「示意图」而非「整张题目照片」

### 背景

v47.1 修了打印预览页缺题图,但**用错了图源** —— 渲染的是 `imageUrl/imageBase64`(用户拍摄整张题目的歪照,含孩子手写 + 拍歪的)。
用户真机截图(2026-09-26)反馈:「打印预览中显示的题目中的图不是这个题目的照片,是题目中提到的如图」。

**正确理解**:
- `imageUrl / imageBase64` = **整张题目照片**(孩子拍的整页,App 内复习/批注用)
- `figureImageUrl / figureBase64` = **题目中提到的示意图**(原书印刷的立方体/物理装置/化学结构,**打印场景孩子要做题必须看这个**)

打印场景下孩子打印题目是为了做题,**只需要看原书印刷图**(清晰的、能跟题干对照的);
整张拍摄照(拍歪/手写)在打印纸上毫无意义。

### 改动(1 文件,28 行)

| 类别 | 文件 | 内容 |
|---|---|---|
| **修复** | `frontend/src/components/PrintPreviewScreen.tsx:317-358` | 打印题卡图片分支:`figureImageUrl/figureBase64`(原书示意图,border-slate-200 + bg-white)→ 兜底 `imageUrl/imageBase64`(整张题照,border-slate-100 + bg-slate-50)。前者高度更大(2 列 140px/1 列 200px,print 加倍到 200/280px),后者小一些(2 列 100px/1 列 160px) |

### 设计决策

- **打印场景语义翻转**:详情页(复习批注)用 imageUrl(可批注),**打印场景用 figureImageUrl**(题目里印的图)
- **三层 fallback**:示意图 > 整张题照 > 无图(空),任意一层有效都显示
- **背景色区分**:示意图是原书印刷 → 白色底 + 深边;整张题照是拍摄 → 灰色底 + 浅边
- **不修后端 OCR fallback**:v47 已部署,本次只调打印页前端

### 已知限制

- **存量数据 figureBase64/figureImageUrl 几乎为空**(v41 后 73 条错题 1.4% 命中率,v47 后端 fallback 上线后预期 ≥30%);
  旧错题打印时仍会回退到整张题照,需让孩子「批注涂抹后重新拍一道」或「重新批注后保存」触发后端 fallback 重写
- **v48+ 可选**:详情页也加 `figureImageUrl`(语义同样,但 UI 不冲突:详情页是 imageUrl 顶部主图,下方可加 figureImageUrl 卡片)

### 验证

- 前端 `pnpm typecheck` ✓ / `pnpm build` ✓(chunk `index-DICFySK_.js` 611714 bytes)
- 飞牛 dist 部署: `curl http://192.168.0.32:4040/assets/index-DICFySK_.js` → HTTP 200 / 611714 bytes,grep `figureImageUrl` ×2 / `figureBase64` ×15
- APK `error-book-v47.2-print-figure-diagram.apk` 5.6MB → 飞牛同步盘 + 本地 `apk/`

---

## v47.1 (2026-09-26) - 打印预览页缺题图 hotfix

### 背景

v47 修了录入完成页 + 详情页,但**没碰打印预览页** —— 用户真机截图(2026-09-26)显示
「天天错题本」打印预览页里:**题图完全没渲染,只看到 A/B/C/D 选项 + 文字题干**。
孩子打出来做题没有图,几何/物理题完全看不懂。

**根因**:`PrintPreviewScreen.tsx:326-337` 的题卡(L317)只渲染了 `<LatexPreview text={err.textContent}>`,
**完全没读 `err.imageUrl` / `err.imageBase64`**。v44 图片静态化后 `imageUrl` 几乎 100% 有值,
但打印页代码停留在 v44 之前,从未渲染过图。

### 改动(1 文件,17 行)

| 类别 | 文件 | 内容 |
|---|---|---|
| **修复** | `frontend/src/components/PrintPreviewScreen.tsx` | L326 改成在 `LatexPreview` **上方**插入题图 `<img src={resolveImageUrl(err.imageUrl || err.imageBase64)}>`,`object-contain` + `border` + `bg-slate-50` + 2列 `max-h-[100px]` / 1列 `max-h-[160px]`(`print:` 加倍);同步改容器 `min-h/max-h` 让图 + 文字都不被压扁 |

### 设计决策

- **优先 `imageUrl`**(轻量静态 URL,可缓存),缺失时回退 `imageBase64`(老数据兜底) —— 顺序与详情页一致
- **`object-contain` 而非 `object-cover`**:题图含文字,必须完整显示;且容器 `max-h-[100px]` / `[160px]` 比 v47 详情页 `max-h-72` 小,几何图可能只显示 1/3 但**能看清文字 + 看到图**
- **2 列与 1 列给不同高度**:1 列 `max-h-160` 给图更大空间,2 列 `max-h-100` 不挤压文字
- **不动 v47 已部署的代码**:只改打印页,前端 chunk `index-Cs8KLGtX.js`

### 验证

- 前端 `pnpm typecheck` ✓ / `pnpm build` ✓(chunk `index-Cs8KLGtX.js` 611412 bytes)
- 飞牛 dist 部署:`curl http://192.168.0.32:4040/assets/index-Cs8KLGtX.js` → HTTP 200 / 611412 bytes(grep `imageBase64` ×16)
- 容器内 `/usr/share/nginx/html` bind-mount 重启后刷新(`error-book-nginx restart`,v44 P2 老坑)
- APK `error-book-v47.1-print-figure.apk`(5.8MB)→ 飞牛同步盘 + 本地 `apk/`

---

## v47 (2026-09-26) - 题目插图回归(录入完成页图预览 + 详情页主图完整显示 + figureRegion fallback)

### 背景

拍一道含示意图的题(立方体 ABCD-EFGH 几何题,2026-09-26 用户截图),文字被 OCR 正确识别,但**录入完成页(录入明细)只显示文字,完全看不到图**。孩子必须跳详情页才能看完整原图。

**关键事实**(生产 73 条错题统计):
- `imageUrl/imageBase64` **100% 有值**(用户在 regionSelect 阶段手动框选裁出来的题图,本身已含文字 + 图)
- `figureBase64` 非空率仅 **1.4%**(73 条里 1 条)—— 几何立体图命中率极低
- `ErrorDetailScreen.tsx:302` 顶部主图已渲染 `displayImageUrl`,但 `object-cover h-48` 比例太扁,看起来"图没了"
- `LatexPreview` 只渲染公式,不渲染图 → 录入明细没图

**根因(3 层)**:
1. **P0 录入完成页不可见**:`batchResult` 只渲染 `LatexPreview`(纯公式),题图被丢掉
2. **P1 详情页主图被裁切**:`object-cover h-48` 把含文字的题图裁成封面,看不清
3. **P2 后端 figureRegion 不可靠**:视觉模型自己输出 bbox,几何立体图经常输出空串 → figureBase64 命中失败

### 改动(5 文件,~220 行)

| 类别 | 文件 | 内容 |
|---|---|---|
| **P0 前端 - 录入完成页显示题图** | `CameraScreen.tsx` | state 扩 `croppedUrls: string[]`;`batchResult` 在 LatexPreview 下方加 grid 缩略图(`max-h-40 object-contain`)+ 全屏 Modal(点黑色背景关闭 + 关闭按钮);点击缩略图放大原图 |
| **P1 后端 - figureRegion fallback** | `backend/src/pipeline/textExtract.js` | 新增纯函数 `figureRegionFromTextPositions`:polygon → bbox → 合并 → 100×100 网格 flood-fill 求最大连通块,返回 `{x,y,w,h}`;**2 个阈值**:文字密度 > 80%(纯文字题)/ 补集 < 15% / 补集 > 92% 一律返回 null;边框强制 occupied 防止文字贴边误判 |
| **P1 后端 - textin 公式端点补 position** | `backend/src/services/textin.js:153` | 公式识别结果新增 `position: l.position \|\| []` 字段(文字端点已有,公式端点之前漏了) |
| **P1 后端 - ocr 路由接入** | `backend/src/routes/ocr.js` | 提取 `textPositions + formulaPositions`(L116-117),新增 `fallbackFigureRegion()` 内嵌函数;5 处 `figureRegion: <X>.figureRegion \|\| ''` 改为 `\|\| fallbackFigureRegion()`(L178/212/280/304/374) |
| **P3 前端 - 详情页主图完整显示** | `ErrorDetailScreen.tsx` | 主图 `object-cover h-48` → `object-contain max-h-72 bg-slate-50`(题图含文字必须看清);删「独立题目插图卡片」(figureBase64 命中率 1.4%,主图已含图);主图下方加「如题图不全,可点批注涂抹后重新框选」提示 |

### 设计决策

- **不显示独立"插图卡片"**:用户决策。统一显示主图(`imageUrl`),把视觉复杂度降下来。
- **后端 fallback 优于 prompt 调优**:TextIn `lines[].position` 是**真实坐标**(不是模型猜的),bbox 合并后补集 = 候选示意图。视觉模型 prompt 即使加 1-shot 也只能把命中率从 1.4% 提到 3-5%,而 fallback 预期 50%+。
- **边框强制 occupied**:防止文字贴边时把边框空白误判为插图(测试场景1)
- **2 阈值 + 文字密度**:避免纯文字题被误判(全图 80%+ 是文字 → 拒绝)、补集太大误判(>92% → 拒绝)、补集太小误判(<15% → 拒绝)
- **2 个全屏 Modal 模式**(不是抽通用 ImageViewer):场景特殊(纯图片 + 黑底 + 关按钮),直接内联 15 行最简单
- **不引入新依赖**:纯 in-memory 几何运算,无 sharp / jimp

### 验证

- 后端 `pnpm test` **58/58 通过**(原 50 + 新 8 figureRegionFromTextPositions)
- 后端 `pnpm lint` **0 error / 11 warning**(存量 unused var,无新增)
- 前端 `pnpm test` **17/17 通过**(LatexPreview 9 条 + 通用测试,无新增)
- 前端 `pnpm typecheck` ✓ / `pnpm build` ✓(chunk `index-DJcXzRko.js` 611KB)
- 8 条新增测试覆盖:空数组 / 文字占满整图 / 半边空白 / 右侧空白 / 四角空白 / 文字稀疏 / 坏数据容错 / 归一化范围

### 待办(可选)

- v48+:visionFallback prompt 加 1-shot 示例,把模型自输出 figureRegion 命中率从 1.4% 提到 3-5%(已不是必需,fallback 兜底足够)
- 实测生产 figureBase64 命中率增长(预期 ≥30%,需 Mongo 统计)

---

## v46.1 (2026-09-26) - LatexPreview 裸 LaTeX 自动识别(录入明细数学公式渲染)

### 背景

v46 修好了 OCR 「识别崩坏」(`[B] √(x²+4)+4/√(x²+4)` 还原成 `\sqrt{x^{2}+4}}+\dfrac{4}{\sqrt{x^{2}+4}}`),但**录入明细页只把 LaTeX 字符串当文本塞在「题 + 选项」里**,用户看到的是 `\dfrac{x}{4}+\dfrac{1}{x}+3` 这种源码,而不是渲染后的公式 —— **整段识别等于白做**,视觉上仍像没识别对。

**根因**: `LatexPreview` 只识别 `$...$` / `$$...$$` 显式包裹的公式。OCR 回传的题目文本是**裸 LaTeX**(整段没有 `$` 包裹),所以整段当 text 走 React 渲染,KaTeX 根本不会被调用。

### 改动(2 文件,196 行)

| 层 | 文件 | 内容 |
|---|---|---|
| 前端 | `components/LatexPreview.tsx` | 在原 `$...$` / `$$...$$` 解析后做第二遍兜底 —— 按行扫描,含 TeX 命令(`\sqrt`/`\frac`/`\dfrac`/`\sum`/`\int`/`^{`/`_{` 等)且 `$` 配对完整的行整行升级为块级公式渲染。中文题头/选项标签/纯函数表达式 `C. x(4-x)(0<x<4)` 不含 TeX 命令 → 保留 text,**零误伤** |
| 前端 | `components/LatexPreview.test.ts`(新增 9 条) | 覆盖:裸 LaTeX → tex、`$x$` 优先内联、`$$x$$` 优先块级、奇数 `$` 跳过检测(避免破坏跨段配对)、纯中文不误伤、空字符串、纯函数表达式不误伤、整段混排逐行分类、奇数命令触发 |

### 设计决策

- **按行扫描而非按段**: 录入明细是「题头(中文) + 选项 A-D(混排)」结构,整段当公式会把中文题头当 LaTeX 解析报错。按行扫描能正确区分。
- **TeX 命令白名单**: 用正则列出常见命令避免误检。`C. x(4-x)(0<x<4)` 这种纯函数表达式不含命令,正确保留 text。
- **奇数 `$` 跳过**: 留给显式 `$...$` 解析器继续工作,避免把「价格是 $5 美元」这种未配对的 `$` 误判为裸 LaTeX。
- **`throwOnError:false` 兜底**: 任何一行 KaTeX 解析失败时显示原始字符串,不破坏整页渲染。
- **行为不变**: 用户主动写 `$x^2$` / `$$...$$` 的优先于裸 LaTeX 检测(已在第一遍解析时切走,第二遍扫描只处理剩下的 text 段)。

### 验证

- 前端 `pnpm test` **17/17 通过**(原 8 + 新 9 LatexPreview)
- 前端 `pnpm typecheck` ✓ / `pnpm build` ✓(chunk `index-DGSACkjz.js`)
- 飞牛 dist 部署: `curl http://error.93gushi.com:4040/assets/index-DGSACkjz.js` → HTTP 200 / 610550 bytes
- 后端 `curl http://error.93gushi.com:4040/api/health` → `{"status":"ok","db":"mongodb"}`
- 实地测试(纯函数测试 + 截图原题): 4 个选项中 3 个含 TeX 命令 → 当块级公式渲染(A/B/D 行);C. x(4-x)(0<x<4) → 保留 text;题头「代数式最小值判断」→ text
- APK `error-book-v46.1-latex-render.apk`(5.6MB) → 飞牛同步盘 + 本地 `apk/`

---

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
