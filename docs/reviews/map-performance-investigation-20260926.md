# Map 性能专项调查报告 —— 相邻餐厅展开 + marker 缩略图

日期：2026-09-26
范围：`miniprogram/pages/map/*`、`miniprogram/utils/map{Markers,Layout,Stack,Projection}.js`
性质：**只调查，不改生产行为**。本报告本身与全部探针均未 commit、未 deploy。

---

## 0. 方法与可信边界

探针（全部在 `.workbuddy-ai/scratch/map-perf/`，gitignored）：

| 文件 | 做法 | 证明什么 |
|---|---|---|
| `probe-renderer.cjs` | 把**未修改的** `utils/mapMarkers.js` 放进 VM，注入合成原生层（download / getImageInfo / createImage / canvasToTempFilePath）与**虚拟时钟** | 渲染器的**调度结构**：串行队列、cache、queueWait 的线性增长 |
| `probe-cluster.cjs` | 把**未修改的** `pages/map/index.js` 放进 VM，注入合成 `setData`（带 ack 延迟）、`mapCtx`、`selectorQuery`、渲染器桩 | 展开链路的**时序结构**：每次 setData 的 key/字节、reveal 帧节奏、投影往返次数 |

复现：

```bash
cd .workbuddy-ai/scratch/map-perf
node probe-renderer.cjs     # -> renderer-probe-output.txt
node probe-cluster.cjs      # -> cluster-probe-output.txt
```

**注入成本（不是真机数字）**：`download=40ms  imageInfo=12ms  photoDecode=10ms  frameDecode=6ms  export=18ms`
→ 每 job 标称 **74ms**；`setData ack=4ms`、`getRegion=8ms`、`boundingClientRect=6ms`。

⚠️ 因此下表所有 **ms 是「调度结构 × 假设成本」的推演**，不是实测。
凡涉及 Canvas 实现、`wx.cloud` 网络、原生地图 custom callout、真实 FPS 的结论，一律标 **REQUIRES REAL DEVICE**。

---

## Baseline

### Thumbnail — 渲染器每阶段耗时（虚拟时钟，注入成本）

`source`：`cloud` = `cloud://…`；`local` = `wxfile://…`；`bundled` = `/images/…`。

| scenario / job | source | selected | queueWait | download | imageInfo | photoDecode | frameDecode | draw | export | total |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| S1 `wxfile://tmp/local-1.jpg` | local | false | 0 | – | 12 | 10 | 6 | 0 | 18 | **46** |
| S2 `cloud://…/photo-1.jpg` | cloud | false | 0 | 40 | – | 10 | 6 | 0 | 18 | **74** |
| S3 #1 / #2 / #3 / #4 / #5 | cloud | false | 0 / 74 / 148 / 222 / 296 | 40 | – | 10 | 6 | 0 | 18 | **74** each |
| S4 #1（selected，入队序第一） | cloud | **true** | 0 | 40 | – | 10 | 6 | 0 | 18 | **74** |
| S4 #20（最后一个） | cloud | false | **1406** | 40 | – | 10 | 6 | 0 | 18 | **74** |
| A3a 前 3 个 normal | cloud | false | 0 / 74 / 148 | 40 | – | 10 | 6 | 0 | 18 | **74** each |
| A3a selected（第 4 个入队） | cloud | **true** | **222** | 40 | – | 10 | 6 | 0 | 18 | **74** |
| A3c selected（第 20 个入队） | cloud | **true** | **1406** | 40 | – | 10 | 6 | 0 | 18 | **74** |

聚合：

| scenario | 结果 |
|---|---|
| S3（5 个 cloud） | ΣqueueWait = 740ms，Σtotal = 370ms，max total = 74ms |
| S4（20 个 marker，1 selected） | ΣqueueWait = 14060ms，Σtotal = 1480ms；**首个可见（selected）= 74ms**；**全部就绪 = 1480ms** |
| S5 warm cache 重开 | 第二次 20 个 job：**新增原生事件 = 0**，`allCached=true`，max total = 0ms |
| S6 hide→show | dispose 前 200 个原生事件；**重建后再次 200 个**，`coldAgain=true`，Σtotal = 1480ms |
| A4 frame 复用 | 10 job → **10 次 frame decode**（1 job : 1 decode）。6ms / 74ms = **8.1%** |
| A5 cache 上限 | 请求 100 个不同 key：**96 个真正干活，4 个永远不干活**（`cache.size>=LIMIT` 直接返回 fallback） |

真实资源体积（磁盘实测）：

| 资源 | 磁盘字节 | 像素 | 解码后 RGBA |
|---|---:|---|---:|
| `landmark-normal-frame.png` | 44,938 | 768×858 | 2,635,776 |
| `landmark-selected-frame.png` | 47,736 | 768×858 | 2,635,776 |
| `landmark-normal-fallback.png` | 51,310 | 768×858 | 2,635,776 |
| `landmark-selected-fallback.png` | 53,349 | 768×858 | 2,635,776 |

导出目标 = `256*3 × 286*3` = **768×858 px = 2,635,776 B 原始 RGBA / 每张 marker**。
PNG 实际 temp 字节数：**REQUIRES REAL DEVICE**。

### 冷启动 Map 打开的 setData 放大（探针实测，`setData` ack = 4ms）

`renderMarkerPhotos()` 每完成一张照片就 `setData({markers})` —— **整个 markers 数组**。

| markers | photo jobs | setData 次数 | 总字节 | 整数组 markers 写入次数 | 整数组 markers 字节 | 单次最大写入 | T+首张就绪 | T+末张就绪 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 5 | 5 | 18 | 17,013 | **14** | 16,900 | 1,699 | 78 | 374 |
| 20 | 20 | 33 | 135,019 | **29** | 134,906 | 5,334 | 78 | 1,484 |
| 48 | 48 | 61 | 631,915 | **57** | 631,802 | 12,160 | 78 | 3,556 |

### Cluster expansion（基线：1 个 6 成员 cluster + 14 单点）

markers=15，drawers=1，rows=3，pages=2

| 指标 | 值 |
|---|---:|
| 展开期间 setData 次数 | 20 |
| 总 payload 字节 | 7,793 |
| 发送**整个 mapDrawers** 的写入次数 | **1**（828 B） |
| 发送**整个 markers** 的写入次数 | **0** |
| 单次最大写入 | 828 B |
| `mapCtx.getRegion` 调用 | **0** |
| `selectorQuery` 往返 | **0** |
| reveal 帧数 | **17**（计划 320ms） |
| 帧间隔 | 20,20,20,20,20,20,20,20,20,20,20,20,20,20,20,20 |
| \>16.7ms 帧 | **16 / 16** |
| \>25ms / \>33ms / \>50ms 帧 | **0 / 0 / 0** |
| T+首个 setData | 0ms |
| T+末帧 | **340ms**（计划 320ms） |
| 展开期间 photo job | 3（T+4ms 入队，T+226ms 全部完成，串行 222ms） |

**集群规模扫描**（ack = 4ms）：

| cluster 成员数 | pages | drawer rows | 帧数 | 帧 patch keys | 帧 patch 字节 | 整 mapDrawers 写入 | 整 mapDrawers 字节 | 单次最大写入 | 总字节 | T+末帧 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 2 | 1 | 1 | 17 | 7 | 240 | 1 | 590 | 590 | 4,839 | 340 |
| 3 | 1 | 2 | 17 | 9 | 311 | 1 | 708 | 708 | 6,252 | 340 |
| 4 | 1 | 3 | 17 | **11** | **381** | 1 | 826 | 826 | 7,663 | 340 |
| 7 | 2 | 3 | 17 | **11** | **381** | 1 | 827 | 827 | 7,851 | 340 |
| 13 | 4 | 3 | 17 | **11** | **381** | 1 | 828 | 868 | 8,232 | 340 |
| 31 | 10 | 3 | 17 | **11** | **381** | 1 | 829 | **2,020** | 9,385 | 340 |

**reveal 帧节奏对 setData ack 的敏感性**：

| setData ack (ms) | 帧数 | 帧间隔 | T+末帧 | \>16.7ms 帧 |
|---:|---:|---:|---:|---:|
| 0 | 20 | 16 | 320 | 0 |
| 1 | 19 | 17 | 323 | 18 |
| **4** | **17** | **20** | **340** | **16** |
| 10 | 13 | 26 | 338 | 12 |
| 20 | 10 | 36 | 360 | 9 |
| 33 | 8 | 49 | 392 | 7 |

---

## Root causes

### Thumbnail

| # | 假设 | 判定 | 证据 |
|---|---|---|---|
| T1 | cloud download 是串行成本 | **PROVEN（结构）** / 量级 REQUIRES REAL DEVICE | `mapMarkers.js:45` `await downloadMapPhoto(source)` 在串行队列内；S3 显示 5 个 marker 的 queueWait 严格 0/74/148/222/296 |
| T2 | 严格串行队列，无并发、无抢占 | **PROVEN** | `mapMarkers.js:32,39,74` `queue=queue.then(async()=>{…})`；A3c：第 20 个入队者 queueWait = 1406ms；48 marker 时 T+末张就绪 = 3556ms |
| T3 | frame 图片每个 job 重新 decode | **PROVEN（重新发起）** / 真实开销 REQUIRES REAL DEVICE | `mapMarkers.js:49` 在 job 内部 `await image(canvas,'/images/markers/landmark-…-frame.png')`，无缓存；A4：10 job → 10 次；占标称预算 8.1%。运行时是否内部去重 **UNKNOWN** |
| T4 | 3× PNG 导出过采样 | **PROVEN（结构）** / CPU/wall/temp 字节 REQUIRES REAL DEVICE | `mapMarkers.js:30` canvas=768×858；`:59` 导出 768×858；而 `style()` 显示宽度 48px（normal）/80px（selected）。相对显示 = **16× / 9.6× 线性过采样**；相对 3× DPR 目标（144/240px）仍是 **5.33× / 3.2× 线性 = 28.4× / 10.2× 像素** |
| T5 | renderer 被 dispose 后重建，缓存全丢 | **PROVEN** | `mapMarkers.js:76` dispose 清 `cache/ready/files`；S6：hide→show 后 200 个原生事件**全部重来**，`coldAgain=true` |
| T6 | 每张照片完成都重发整个 markers 数组 | **PROVEN** | `index.js:503-504` `this.data.markers.map(…)` + `setData({markers})`；冷启动表：N 个 marker → ≈N 次整数组写入，48 marker = 57 次 / 631,802 B |
| T7 | cache 上限 96 时静默降级为 fallback | **PROVEN** | `mapMarkers.js:32,38` `LIMIT=96`；`if(cache.size>=LIMIT) return Promise.resolve(backup)`；A5：100 个不同 key → 4 个永远不干活 |
| T8 | 增强批次硬上限 48 | **PROVEN** | `index.js:495` `.slice(0,48)`；>48 个 marker 静默保留 bundled fallback |

### Cluster expansion

| # | 假设 | 判定 | 证据 |
|---|---|---|---|
| C1 | 动画每帧 setData 整个大数组 | **DISPROVEN** | `index.js:425-436` `patchDrawerFrame` 走 `mapDrawers[i].progress/height/rootTop/…` 增量 key；集群扫描：2→31 成员，帧 patch **恒为 11 keys / 381 B** |
| C2 | 动画期间反复 getRegion / selectorQuery | **DISPROVEN** | 展开全程 `getRegion = 0`、`selectorQuery = 0`；`onDrawerToggle`（`index.js:443-457`）不调用 `syncStackPositions` |
| C3 | photo renderer 抢动画关键路径 | **PARTIAL** | 结构上 **不抢**：B4 对照（photo 成本 74ms vs 0ms）帧数/T+末帧完全一致，几何循环被 setData ack 门控而非 photo 队列。真实 JS 时间片与 canvas/native 资源竞争 **REQUIRES REAL DEVICE** |
| C4 | drawer 元素太多 | **DISPROVEN** | `buildDrawers`（`index.js:378`）`others.slice(page*3,page*3+3)` ⇒ rows 上限 3；每 drawer ≈21 个节点（callout 层 ~14 + 命中层 ~7） |
| C5 | JS 动画循环调度本身有结构性下限 | **PROVEN** | `index.js:475-481`：`setTimeout(step,16)` 被排在 `patchDrawerFrame` 的 **setData ack 回调内** ⇒ 帧间隔 ≥ 16ms + ack。ack=4 → 20ms/帧（50fps 上限）、17 帧、320ms 动画实际 340ms 收尾；ack=33 → 49ms/帧（20fps）。**60fps 在构造上不可达** |
| C6 | 原生地图 custom callout / cover-view 每帧重排 | **UNKNOWN / REQUIRES REAL DEVICE** | `index.wxml:29-57` drawer 的 `rows[i].top/opacity`、`height/rootTop/progress/buttonBox.*` 全部写在 `slot="callout"` 内的 `cover-view` 上，每帧都变。原生 callout 重排成本 Node 测不出 |
| C7 | `clusterChoices` 是只写不读的 payload | **PROVEN** | `index.js:450` setData，`index.wxml` **零引用**（只在 `index.js:596` 做 JS 侧成员校验）；31 成员时 **2,020 B，是整次展开的单次最大写入**，比整个 mapDrawers（829 B）还大 |

---

## Selected-priority proof

**结论：调用方的 "selected photo priority" 只存在于「入队顺序」，不构成任何抢占。**

页面级（真实 `renderMarkerPhotos` 的 sort，`index.js:495`）：

```
selectedId=s1  → enqueue head [SEL:s1, s2, s3, s4 ... s19, s20]   selected queueWait = 0ms
selectedId=s5  → enqueue head [SEL:s5, s1, s2, s3 ... s19, s20]   selected queueWait = 0ms
selectedId=s20 → enqueue head [SEL:s20, s1, s2, s3 ... s18, s19]  selected queueWait = 0ms
```

排序 `Number(b.m.id===selectedId)-Number(a.m.id===selectedId)` 确实把 selected 排到**入队位置 0**，所以**冷启动时它是第一个出队**（T+78ms 就绪）。

渲染器级（真实 `mapMarkers.js` 的 FIFO 队列）：

```
A3a — 3 个 normal 先入队，随后 selected：
  start order: normal@0ms  normal@74ms  normal@148ms  SELECTED@222ms
  → selected queueWait = 222ms

A3b — selected 先入队：
  start order: SELECTED@0ms  normal@74ms  normal@148ms  normal@222ms
  → selected queueWait = 0ms

A3c — 生产形状：19 个 normal 已排队，用户此刻才选中一个：
  start order: normal@0ms … normal@1332ms  SELECTED@1406ms
  → selected queueWait = 1406ms
```

**即用户要求的判断成立**：`A → B → C → D`，selected **不能**抢占任何已在队列或已在飞行中的任务。
生产上「Map 打开后立刻点某个餐厅」就是这个形状 —— 选中反馈要等前面 19 个 cloud 作业跑完（模型 1406ms）。

---

## Renderer critical-path proof

用户要求的 A/B 对照（B = 仅诊断模式让 renderer 立即返回 fallback，只在探针里做，**未改正式行为**）：

| 指标 | 正常照片 | renderer 立即返回 fallback |
|---|---:|---:|
| 帧数 | 17 | 17 |
| T+首个 setData | 0 | 0 |
| T+末帧 | 340 | 340 |
| T+最后照片完成 | 226 | 4 |
| \>33ms 帧 | 0 | 0 |

**判定**：几何动画与 photo 队列**结构上不共享关键路径**。`startDrawerReveal` 的下一帧由 `patchDrawerFrame` 的 **setData ack** 触发（`index.js:475-479`），而 `renderDrawerPhotos` 的结果走 `Promise.all` 后一次独立 patch（`index.js:405-415`），两者无 await 依赖。

**未证明**：真实设备上 `drawImage` / `canvasToTempFilePath` / `wx.cloud.downloadFile` 会占用 JS 时间片与原生资源，是否造成掉帧 **REQUIRES REAL DEVICE**。Node 只能证明「调度上没有依赖」，不能证明「运行时没有争抢」。

---

## Recommended minimal fix order

> 前提：C6（原生 callout 每帧重排）与 T1/T4 的量级**必须先用真机 trace 确认**。
> 现成补丁见 `.workbuddy-ai/scratch/map-perf/dev-trace-proposal.md`（**未应用**，dev-only、无 UI、关闭时零开销）。
> 若 trace 显示 C6 主导，请把下面第 2 项与「降 callout 每帧写入量」调序。

### 1 → T2：渲染器引入有界并发（download/decode 并发，canvas compose/export 保持串行）

| 项 | 内容 |
|---|---|
| 收益 | 直接砍掉「N 个 marker = N × 全作业」的线性墙钟。模型下 20 个 marker 的末张就绪 1480ms → 受限于并发度而非 N；48 个 marker 的 3556ms 同理 |
| 风险 | 中。canvas 是共享状态，compose/export 必须继续串行；`cache`（在飞行中即占位）、`ready`、`files`、失败重试语义要逐条对齐 |
| 改动范围 | 仅 `miniprogram/utils/mapMarkers.js` 的 `createRenderer`（队列结构） |

### 2 → C5：把 reveal 循环从「ack 之后再加 16ms」改为「按截止时间推进」

| 项 | 内容 |
|---|---|
| 收益 | 消除系统性漂移（320ms 动画实际 340ms）并把帧率上限从 ~50fps 抬到 ack 允许的水平；ack=33ms 时从 20fps 改善 |
| 风险 | 低。「一帧在飞」是刻意设计（`index.js:474` 注释），不能取消；改法是 `setTimeout(step, max(0, nextDue - Date.now()))`，`nextDue` 按 16ms 从 start 累加，**落后时跳到正确 progress 而不是顺延** |
| 改动范围 | 仅 `miniprogram/pages/map/index.js` 的 `startDrawerReveal`。不触碰 320ms duration、easing、camera 语义 |

### 3 → T3 + T6 + C7：清掉已证明的浪费（低风险、可独立验证）

| 项 | 内容 |
|---|---|
| 收益 | T3 frame 图片做一次进程内缓存（省 8.1% 标称预算 / 每 job）；T6 把 `setData({markers})` 改成 `markers[i].iconPath` 增量 patch（48 marker 时省 631,802 B 的整数组重发）；C7 删掉 `clusterChoices` 的 setData（31 成员时省 2,020 B 单次最大写入） |
| 风险 | 低。T6 需保持「不覆盖并发变更」的现有 `memoryId` 校验；C7 只是移除无人消费的写入 |
| 改动范围 | `miniprogram/utils/mapMarkers.js`（frame 缓存）、`miniprogram/pages/map/index.js`（`renderMarkerPhotos`、`onDrawerToggle`） |

**明确不推荐（无数据支持）**：降低导出分辨率（T4 的真实开销未知，先测再谈）、把 JS 动画改 CSS/native transform（C6 未知，可能白改）、取消 cluster、改 easing/duration。

---

## Files involved

| 文件 | 角色 | 本轮是否改动 |
|---|---|---|
| `miniprogram/pages/map/index.js` | tap→toggle→reveal→photo 全链路 | **否** |
| `miniprogram/pages/map/index.wxml` | callout `cover-view` 结构 + 命中层 | **否** |
| `miniprogram/pages/map/index.wxss` | — | **否** |
| `miniprogram/utils/mapMarkers.js` | 渲染器（串行队列 / cache / 3× 导出） | **否** |
| `miniprogram/utils/mapStack.js` | `DURATION=320`、`layout()`、`ease()` | **否** |
| `miniprogram/utils/mapLayout.js` | marker 尺寸缓动 | **否** |
| `miniprogram/utils/mapProjection.js` | 坐标投影 | **否** |
| `tools/verify-map-motion.cjs` | 既有动效门禁 | **否** |
| `tools/verify-map-viewport.cjs` | 既有视口门禁 | **否** |

新增（全部 gitignored / 未跟踪）：

- `.workbuddy-ai/scratch/map-perf/probe-renderer.cjs`、`renderer-probe-output.txt`
- `.workbuddy-ai/scratch/map-perf/probe-cluster.cjs`、`cluster-probe-output.txt`
- `.workbuddy-ai/scratch/map-perf/dev-trace-proposal.md`（真机 trace 补丁提案，未应用）

---

## No-production-change proof

```
$ git rev-parse HEAD
2dde1eb1c5277a5f139745f56bfb8c85264e1bcf

$ git diff --stat HEAD
(空)                      <-- 没有任何 tracked 文件被修改

$ git status --short
?? docs/reviews/map-performance-investigation-20260926.md

$ git status --short --untracked-files=all
?? docs/reviews/map-performance-investigation-20260926.md
                          <-- 全仓库唯一新增文件 = 本报告自身（未跟踪，未 commit）

$ git check-ignore -v .workbuddy-ai/scratch/map-perf/probe-cluster.cjs
.gitignore:24:/.workbuddy-ai/   .workbuddy-ai/scratch/map-perf/probe-cluster.cjs
```

即：**`miniprogram/` 与 `tools/` 下 0 改动**；全部探针位于 gitignored 的 `.workbuddy-ai/scratch/`；
唯一未跟踪文件是本报告。没有 commit、没有 deploy、没有上传。

生产文件 sha256（前 16 位）：

| 文件 | sha256[0:16] |
|---|---|
| `miniprogram/pages/map/index.js` | `791a32c35394ce86` |
| `miniprogram/pages/map/index.wxml` | `cf92efbb3250d137` |
| `miniprogram/pages/map/index.wxss` | `fa77efd61d741fa8` |
| `miniprogram/utils/mapMarkers.js` | `33f3e3259d06b2db` |
| `miniprogram/utils/mapLayout.js` | `cce68d0b9abac343` |
| `miniprogram/utils/mapStack.js` | `b0d82521780e73ef` |
| `miniprogram/utils/mapProjection.js` | `ab7f98958d1faccd` |
| `tools/verify-map-motion.cjs` | `43fd9e090dea25b0` |
| `tools/verify-map-viewport.cjs` | `f98ea26eda6d1e49` |

**未 commit、未 deploy、未改任何生产文件。**

---

## 未证明的风险（必须真机回答）

| 问题 | 为什么 Node 测不出 |
|---|---|
| `canvasToTempFilePath` 768×858 的真实 wall time 与 temp 字节 | 需要 Canvas 2D 实现 |
| `wx.cloud.downloadFile` 的真实 RTT 与并发上限 | 需要网络与云环境 |
| 每帧写 `cover-view` 几何的真实重排耗时 | 需要原生地图 custom callout |
| 真机 FPS / 掉帧分布（C5 vs C6 谁是主因） | 需要渲染管线 |
| 照片作业是否抢占动画的 JS 时间片 | 需要真实事件循环负载 |
| 微信运行时是否对 `img.src` 相同的 frame 资源内部去重 | 需要运行时行为确认 |
| `setData` ack 在真机上的真实延迟（本报告取 4ms 建模） | 需要原生桥实测 |
