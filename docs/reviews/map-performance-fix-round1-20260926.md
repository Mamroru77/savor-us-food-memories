# Map 性能修复第一轮：marker renderer 调度 + frame cache + drawer reveal cadence

日期：2026-09-26
基线：`2dde1eb`（diningTypes，已真机通过、已 push）
范围：只修上一轮 **PROVEN** 的三个根因（T2 串行队列、frame 重复 decode、C5 frame cadence）。
状态：**未 commit / 未 push / 未 deploy**。

---

## 0. 一句话结论

| 修复 | 指标 | before | after |
|---|---|---:|---:|
| A 两阶段调度（prepare 并发 3 / compose 串行） | 20 marker 全部就绪 | 1480 ms | **416 ms** |
| | 48 marker 全部就绪 | 3552 ms | **920 ms** |
| | selected 排在 19 个 normal 之后时的 queueWait | 1406 ms | **56 ms** |
| B frame image cache | 48 marker 的 frame decode 次数 | 48 | **2** |
| C reveal 绝对 deadline | ack=12 时的实际帧数 | 12 | **21** |
| | ack=40 时的完成时间 | 352 ms | **320 ms** |

不变：320ms duration、easing、marker 分辨率、camera 行为、视觉。见 §6。

---

## 1. 对上一轮一处结论的更正（必须先说）

上一轮报告写的「320ms 计划动画 → 实际约 400ms」，**夸大了**。

实测旧实现 `startDrawerReveal` 本来就是 `t = (Date.now()-start)/duration`，**总时长一直是 320~352ms**，
并没有随 ack 线性膨胀成 `320 + N*ack`。真正的缺陷是另一件事：

- **帧数随 ack 崩塌**（ack 4→40：20→17→12→10→7 帧）
- **平均帧间隔随之劣化**（16.0→20.0→28.0→36.0→56.0 ms）
- 末帧**过冲**（336/340/352 ms，而不是 320）

也就是说用户感受到的是「动画变跳、丢帧」，不是「动画变长」。本轮的 RED 断言已按这个真实缺陷重写
（一条断言「帧数受 ack 限制而非 max(16.7, ack)」，一条断言「ack 不得把总时长推过 320+一帧」）。

---

## 2. Renderer before / after

**方法**：同一个探针（`.workbuddy-ai/scratch/map-perf/probe-renderer.cjs`），
只把被测模块从 `miniprogram/utils/mapMarkers.js` 换成从 `HEAD` 抽出的
`before/mapMarkers.before.js`。**没有换模型**，两次运行的成本注入完全相同：

```
download=40ms imageInfo=12ms photoDecode=10ms frameDecode=6ms export=18ms   （单 job 标称 74ms）
```

### 2.1 PHASE-D 原始输出

```
=== BEFORE (HEAD 2dde1eb 的 mapMarkers.js) ===
PHASED m20-selected-first jobs=20 selectedQueueWait=0    lastNormalQueueWait=1406 worstNormalQueueWait=1406 totalReadyTime=1480 frameDecodes=20 photoDecodes=20 maxPrepareOps=1 maxConcurrentDownloads=1 maxCompose=1 composeOverlaps=0
PHASED m20-selected-last  jobs=20 selectedQueueWait=1406 lastNormalQueueWait=1332 worstNormalQueueWait=1332 totalReadyTime=1480 frameDecodes=20 photoDecodes=20 maxPrepareOps=1 maxConcurrentDownloads=1 maxCompose=1 composeOverlaps=0
PHASED m48-selected-first jobs=48 selectedQueueWait=0    lastNormalQueueWait=3478 worstNormalQueueWait=3478 totalReadyTime=3552 frameDecodes=48 photoDecodes=48 maxPrepareOps=1 maxConcurrentDownloads=1 maxCompose=1 composeOverlaps=0

=== AFTER (working tree 的 mapMarkers.js) ===
PHASED m20-selected-first jobs=20 selectedQueueWait=0   lastNormalQueueWait=306 worstNormalQueueWait=306 totalReadyTime=416 frameDecodes=2 photoDecodes=20 maxPrepareOps=3 maxConcurrentDownloads=3 maxCompose=1 composeOverlaps=0
PHASED m20-selected-last  jobs=20 selectedQueueWait=56  lastNormalQueueWait=306 worstNormalQueueWait=306 totalReadyTime=416 frameDecodes=2 photoDecodes=20 maxPrepareOps=3 maxConcurrentDownloads=3 maxCompose=1 composeOverlaps=0
PHASED m48-selected-first jobs=48 selectedQueueWait=0   lastNormalQueueWait=756 worstNormalQueueWait=756 totalReadyTime=920 frameDecodes=2 photoDecodes=48 maxPrepareOps=3 maxConcurrentDownloads=3 maxCompose=1 composeOverlaps=0
```

（单位 ms；`maxPrepareOps` / `maxConcurrentDownloads` 是**原生层**测得的「同时在飞的 prepare 调用数」，
与调度器怎么写无关；`composeOverlaps` 统计「上一個 compose 还没结束时又发出 `ctx.setTransform`」。）

### 2.2 表格

| scenario | selected queueWait | worst normal queueWait | total ready time | frame decodes |
|---|---:|---:|---:|---:|
| 20 markers, selected **first** — before | 0 | 1406 | 1480 | 20 |
| 20 markers, selected **first** — after | 0 | **306** | **416** | **2** |
| 20 markers, selected **last** (19 normal 已入队) — before | 1406 | 1332 | 1480 | 20 |
| 20 markers, selected **last** (19 normal 已入队) — after | **56** | **306** | **416** | **2** |
| 48 markers, selected first — before | 0 | 3478 | 3552 | 48 |
| 48 markers, selected first — after | 0 | **756** | **920** | **2** |

`photoDecodes` 两次都是 20 / 48（每张照片本来就只解一次），**只有 frame 从每 job 一次降到每 renderer 一次**。

---

## 3. selected-first proof

**问题（上一轮 PROVEN）**：旧实现是单 Promise 链，调用方把 selected 排到数组第一位只影响**入队顺序**，
无法越过已经排队（且已开始串行执行）的 normal。

**现在**：renderer 内部有 `pending.high` / `pending.normal` 两个队列，`pump()` 取槽时
`pending.high.shift() || pending.normal.shift()`。**不抢占已在进行的 prepare，只抢占 pending**。

**证据（同一探针，m20-selected-last）**：

```
BEFORE  selectedQueueWait = 1406 ms   ← selected 排在 19 个 normal 之后，等了整整 19 个 job
AFTER   selectedQueueWait =   56 ms   ← 第一个 prepare 槽一空就拿到（= download 40 + photo 10 + frame 6）
```

56 ms 正是「第一个 prepare 完成、腾出槽位」的时刻，说明 selected **跳过了 16 个还在排队的 normal**。
同时 `worstNormalQueueWait` 从 1332 → 306，说明 normal 没有因此变差。

**不饿死**：`pending.high` 为空时立即继续取 normal（无加权、无配额、无定时器）。
`verify-marker-renderer-scheduler.cjs` 的 `normals resume as soon as the selected queue drains` 覆盖此点。

---

## 4. concurrency proof

### 4.1 prepare 有界并发 = 3

`PREPARE_CONCURRENCY = 3`（模块内局部常量；仓库内**没有**既有设备级 concurrency policy 可复用，
所以按 brief 要求用保守常量，没有按 CPU 核数动态生成策略）。

原生层实测（`maxPrepareOps` / `maxConcurrentDownloads`）：

```
BEFORE  maxPrepareOps = 1    ← 严格串行，一个慢 download 挡住后面全部
AFTER   maxPrepareOps = 3    ← 恰好到上限，不多不少
```

测试直接断言两点，缺一不可：

```js
assert.ok(h.maxDownload <= 3, 'concurrent prepares must never exceed 3');
assert.equal(h.maxDownload, 3, 'prepare must actually overlap 3 jobs');   // 防止「假并发」
```

48 个 marker 时同样是 3（`m48-selected-first maxPrepareOps=3`），没有退化成 48 个并发下载。

### 4.2 compose 仍然严格串行 = 1

共享 `canvas` / `ctx` 只有一个，所以 compose 走 `composeTail` 链，**任何时刻只有一个**：

```
BEFORE  maxCompose = 1  composeOverlaps = 0
AFTER   maxCompose = 1  composeOverlaps = 0
```

`composeOverlaps = 0` 是**直接的不变量检测**：如果两个 compose 撞在同一个 canvas 上，
第二个 `ctx.setTransform` 会被记到（上一個还没等到 `export` 结束）。
测试 `compose/export never overlaps even when prepares finish out of order` 另外构造了
**乱序完成**的 prepare 来验证这一点（不是靠顺序巧合）。

### 4.3 同 key 单飞（语义保持）

`render(m,false)` ×3 → `prepare = 1`、`compose = 1`。这条**在修复前就是绿的**
（旧代码 `cache.set(key, job)` 同步占位），本轮作为回归守卫保留，确保新调度器没有引入重复下载/导出。

---

## 5. frame cache proof

`frameArt = {normal: null, selected: null}`，每个 renderer 生命周期内 lazy decode 一次：

```
BEFORE  frameDecodes = 20 (20 markers) / 48 (48 markers)   ← 每个 job 都重新 createImage + decode
AFTER   frameDecodes =  2 (20 markers) /  2 (48 markers)   ← normal 一次 + selected 一次
```

48 marker 场景：**48 → 2**。

失败语义（brief 要求「失败不要永久缓存 rejection」）：
`pending.catch(() => { if (frameArt[slot] === pending) frameArt[slot] = null; })`
—— 失败时把槽清空，下一次请求重新 decode，而不是继承一个永远 reject 的 Promise。
测试 `a failed frame decode is retried by the next request` 覆盖（**修复前后都是绿的**，属既有语义保持）。

**没有**跨 Page / 跨 renderer 全局 cache，**没有**持久化。`dispose()` 里 `frameArt.normal = null; frameArt.selected = null;`，
所以 hide→show 重建 renderer 后不会复用旧的 image object。

---

## 6. Drawer before / after

**方法**：同一个 harness（`probe-reveal.cjs`，由 `tools/verify-map-reveal-cadence.cjs` 派生），
只把被测页面从 `miniprogram/pages/map/index.js` 换成 `before/map-index.before.js`。
**没有换模型**。ack 表示 `setData` 回调延迟。

```
ack | frames | first | last | completion | avg interval
--- BEFORE (HEAD 页面) ---
  0 |     20 |    16 |  320 |        320 |         16.0
  4 |     17 |    16 |  336 |        336 |         20.0
 12 |     12 |    16 |  324 |        324 |         28.0
 20 |     10 |    16 |  340 |        340 |         36.0
 40 |      7 |    16 |  352 |        352 |         56.0

--- AFTER (working tree 页面) ---
  0 |     21 |     0 |  320 |        320 |         16.0
  4 |     21 |     0 |  320.7 |      320.7 |         16.0
 12 |     21 |     0 |  328.7 |      328.7 |         16.4
 20 |     17 |     0 |  320 |        320 |         20.0
 40 |      9 |     0 |  320 |        320 |         40.0
```

| ack | frames before → after | avg interval before → after | completion before → after |
|---|---|---:|---:|---:|
| 0 ms | 20 → **21** | 16.0 → 16.0 | 320 → 320 |
| 4 ms | 17 → **21** | 20.0 → **16.0** | 336 → **320.7** |
| 12 ms | 12 → **21** | 28.0 → **16.4** | 324 → 328.7 |
| 20 ms | 10 → **17** | 36.0 → **20.0** | 340 → **320** |
| 40 ms | 7 → **9** | 56.0 → **40.0** | 352 → **320** |

实现：`deadline = min(start + frame*1000/60, start + duration)`，`setTimeout(step, max(0, deadline - now))`。
落后就 `delay = 0` 追赶；**始终 one-frame-in-flight**（下一帧只在 `patchDrawerFrame` 的 ack 回调里排），
**没有 while 循环连发 setData**。

**两处可观察的行为变化，需要明确披露（都不改视觉语义）**：

1. **首帧从 16ms 提前到 0ms**（`first: 16 → 0`）。旧代码无条件先 `setTimeout(step,16)`；
   新代码第 0 帧的 deadline 就是 `start`，所以立即写一次。几何值不变（都是 `from`），
   只是首帧早到 16ms —— 是变好，但确实是行为变化。
2. **ack=40 时帧数 7→9**：因为 deadline 一旦落后就 `delay=0`，慢 ack 下会用更少的等待把帧补回来。

---

## 7. unchanged visual semantics

| 不变量 | 证明 |
|---|---|
| **320ms duration 不变** | `miniprogram/utils/mapStack.js` **完全未被修改**（`git diff --stat HEAD -- miniprogram/utils/mapStack.js` 为空），`DURATION=320` 原样 |
| **easing 不变** | 同上，`mapStack.ease` 未被触碰；`startDrawerReveal` 仍调用 `mapStack.ease(t)`，只是 `t` 的来源从「帧序号」变成「elapsed/duration」 |
| **marker 分辨率不变** | `WIDTH = 256, HEIGHT = 286` 与 `canvas.width = WIDTH*3` / `canvasToTempFilePath {width:WIDTH*3, height:HEIGHT*3, destWidth, destHeight}` **逐字未改**；仍导出 768×858 PNG |
| **marker 视觉不变** | `function style(selected)` 与 `HEAD` **逐字节相同**（diff 为空），仍是 80px/48px、`anchor 276/286`、`zIndex 9999/100`、同一组 fallback 图 |
| **camera 行为不变** | `pages/map/index.js` 的 diff 只有 `startDrawerReveal` 一个函数（见 §8）；`verify:map-viewport` 通过 |
| **grouping 不变** | `mapLayout` / `mapProjection` 未修改；`clusterChoices` 等未触碰 |
| **LIMIT 不变** | `LIMIT = 96` 原样 |
| **最终几何一致** | 测试断言 `every acknowledgement still ends on exactly the target geometry` + `closing reaches exactly progress 0 for every acknowledgement` 全绿（5 种 ack 下终值完全相同） |
| **暂停语义不变** | `a late acknowledgement may not revive a stopped animation` + `hiding the page stops the reveal loop without further writes` 全绿 |

**本轮明确没有做**（按 brief）：不降 768×858 分辨率、不做 `USER_DATA_PATH` derived thumbnail cache、
不跨 onHide 保存 renderer、不减 48 marker enhancement budget、不改 CSS/native animation、
不改 customCallout / cover-view 结构。

---

## 8. RED → GREEN

### 8.1 新增测试与 RED 证据

两个新测试文件（都带**完成哨兵** `process.on('beforeExit')`，防止挂起的 `await` 静默变绿 —— 本轮真的触发过一次，已修）：

**`tools/verify-marker-renderer-scheduler.cjs`** — 修复前 **5 FAILED / 5 passed**：

```
FAIL prepare stage runs at most 3 jobs at once and actually reaches 3
  prepare must actually overlap 3 jobs, saw 1
PASS compose/export never overlaps even when prepares finish out of order
FAIL selected marker takes the next freed prepare slot instead of the next queued normal
  the first 3 prepares should already be active
FAIL normals resume as soon as the selected queue drains
  both selected jobs take the first two freed slots
PASS three concurrent requests for one key download and compose exactly once
FAIL normal frame decodes once and selected frame decodes once per renderer
  the normal frame must decode exactly once, saw 10
PASS a failed frame decode is retried by the next request
FAIL dispose stops pending work, blocks compose and cleans owned downloads
  three prepares are active when dispose lands
PASS dispose during an in-flight export discards and removes the late composite
PASS repeated dispose is safe and never deletes source photos
```

修复后：**10/10 passed**。

**`tools/verify-map-reveal-cadence.cjs`** — 修复前 **2 FAILED / 4 passed**（表格见 §6），修复后 **6/6 passed**。

### 8.2 被更新的既有断言

`tools/verify-map-motion.cjs` 里有一条断言**编码的是旧的 cadence 规则**：

```js
// 旧：ack 之后无条件再等 16ms
assert.equal(timers[0].ms, 16);
```

改成断言**新规则**（更严格，不是放松）：ack 回调里排的下一帧延迟必须 = `max(0, deadline - now)`，
并且把「动画按 elapsed time 推进」也 pin 住。`verify-map-motion` 从 23 → **24/24**（新增一条）。
**没有删除任何旧断言来消红。**

### 8.3 注册

`package.json` 新增 `verify:map-reveal-cadence`、`verify:marker-renderer-scheduler`，
并插进 `verify:all` 链（紧跟 `verify:map-motion`）⇒ `verify:all` 顶层命令 **36 → 38**。

---

## 9. Fresh verification

| 命令 | 结果 |
|---|---|
| `npm run verify:map-motion` | **24/24**, EXIT 0 |
| `npm run verify:map-viewport` | **7/7**, EXIT 0（camera/scale 语义） |
| `npm run verify:map-empty` | **11/11**, EXIT 0 |
| `npm run verify:map-reveal-cadence` | **6/6**, EXIT 0 |
| `npm run verify:marker-renderer-scheduler` | **10/10**, EXIT 0 |
| `npm run verify:map-photo-recovery` | **6/6**, EXIT 0（既有 renderer 不变量） |
| `npm run verify:cloud` | **272/272**, EXIT 0 |
| `npm run verify:avatar` | EXIT 0 |
| `npm run verify:sheet-edits` | EXIT 0 |
| `npm run verify` | **357/357**, `FINAL STATIC VALIDATION: PASS`, EXIT 0 |
| `npm run verify:all` | EXIT 0（见 §9.1 注） |

### 9.1 一个流程事故（已记录，不影响结论）

第一次 `verify:all` 跑完后，我在**同一批日志文件**上又启了一次重跑；两个进程同时写同一个重定向文件，
中途看到的日志是交错的（一度出现「EXIT 0 但末尾缺 `verify:r2` 输出」的假象）。
等重跑真正结束后，日志完整：结尾是 `verify:r2` 的最后一条 `verify:preferences-contrast`，
并带 **两行 `VERIFY_ALL_EXIT=0`**（两次运行各自追加）。

最终判定依据不是那两行 echo，而是日志内容本身：

```
24/24 map motion checks passed (synthetic; no phone FPS claim).
6/6  map reveal cadence checks passed (synthetic clock; no phone FPS claim).
10/10 marker renderer scheduler checks passed (synthetic; no device timing claim).
FINAL STATIC VALIDATION: PASS
```

全日志**只有一条** verdict 行（`FINAL STATIC VALIDATION: PASS`），无任何 `FAILED`。
**教训**：不要把两次 `verify:all` 指向同一个日志文件。这不是代码问题，属我的流程失误，如实记录。

---

## 10. Real-device items still unverified

以下**全部**标记 **REQUIRES REAL DEVICE**，本报告任何数字都不能替代：

- `wx.cloud.downloadFile` 真实延迟 —— 探针里 download 是**注入的 40ms**，不是实测
- `canvasToTempFilePath` 真实耗时与真实 PNG 字节数（768×858）—— 注入 18ms，字节数未测
- 真机 `createImage` / decode 真实耗时
- native map `cover-view` / `customCallout` 每帧重排成本（C6，仍是 **UNKNOWN**）
- 真实 FPS / 真实掉帧分布

Node/VM 只能证明**调度结构与阶段归属**（谁阻塞谁、并发上限、帧数上限），
**不能**证明任何绝对毫秒数。上一轮写的真机 trace 提案
（`.workbuddy-ai/scratch/map-perf/dev-trace-proposal.md`）**仍然没有应用** ——
因为 brief 要求本轮不改生产行为，且没让我应用它。

---

## 11. Changed files

```
 M miniprogram/utils/mapMarkers.js        重写调度：两阶段 + 双优先级 pending + frameArt cache
 M miniprogram/pages/map/index.js         仅 startDrawerReveal：绝对 deadline 调度
 M tools/verify-map-motion.cjs            旧 cadence 断言 → 新 cadence 断言（更严格）+ 新增一条
 M package.json                           注册 2 个新 verify 脚本并插入 verify:all
?? tools/verify-marker-renderer-scheduler.cjs   新增（10 项）
?? tools/verify-map-reveal-cadence.cjs          新增（6 项）
```

未修改（关键）：`miniprogram/utils/mapStack.js`、`mapLayout.js`、`mapProjection.js`、
`miniprogram/pages/map/index.wxml`、`index.wxss`、`cloudfunctions/**`。

### git diff --stat

```
 miniprogram/pages/map/index.js  |  16 ++++-
 miniprogram/utils/mapMarkers.js | 142 ++++++++++++++++++++++++++++++----------
 package.json                    |   4 +-
 tools/verify-map-motion.cjs     |  11 +++-
 4 files changed, 135 insertions(+), 38 deletions(-)
```

探针与证据全部在 gitignored 的 `.workbuddy-ai/scratch/map-perf/`：
`probe-renderer.cjs`、`probe-reveal.cjs`、`before/`（从 HEAD 抽出的旧源码）、
`after/renderer-BEFORE.txt`、`after/renderer-AFTER.txt`、`after/reveal-BEFORE-AFTER.txt`、`red-baseline.txt`。

**未 commit / 未 push / 未 deploy。**
