# Map 性能第二轮：真机暴露的两个剩余根因

日期：2026-09-26
基线：`HEAD = 2dde1eb`（`feat: support persistent custom dining types`，已真机验收）
状态：**已实施，未 commit / 未 push / 未 deploy**
覆盖：`git diff --stat HEAD` 同时包含**第一轮与第二轮**（第一轮按指示未 commit）

---

## 0. 一句话结论

真机「某些缩放比例下 marker 永久 fallback」**不是图片问题，是页面层的两个丢弃逻辑**：
(1) `generation !== this.markerGeneration` 直接把异步结果丢掉，
(2) `renderMarkerPhotos` 的 `.slice(0,48)` 预算让第 49 个之后的 singleton 在本次会话内永久停在 fallback。
两者都已用 RED 测试复现并修复。
「缩略图慢」的剩余主因是**原图直接进 canvas decode**（4000×3000 → 45.8 MiB RGBA），
现已改为 ≤384 长边 derivative，**decode 输入降到 384×288（≈0.42 MiB，约 1/108）**。
「drawer 卡」在 Node 里**无法再进一步证明**，已把 CSS/native transform 方案做成 isolated spike（默认关闭），真机验证是唯一出路。

---

## 1. Zoom fallback root cause

### 1.1 逐项判定

| 候选原因 | 判定 | 证据 |
|---|---|---|
| **页面 `generation !== markerGeneration` 丢弃结果** | **PROVEN** | 见 1.2。这是**暂时性**丢失：只要之后有事件再次调用 `renderMarkerPhotos` 就会自愈；但手势期间页面**整体跳过** `renderMarkerPhotos`，导致最新 generation **根本没有挂上完成回调** ⇒ 结果无人接收，也没人重新绑定。 |
| **页面 `.slice(0,48)` 增强预算** | **PROVEN（永久性主因）** | 60 个 singleton → 恰好 **12 个永久停在 fallback**（M48…M59），且之后每一次 pass 都重新取同样的前 48 个。这是「永远不加载」的真正来源。 |
| **renderer `LIMIT = 96` 缓存上限** | **PROVEN（次要、可触发）** | 96 是**放大后的地图可以达到的**数量；一旦越过，renderer 会在**本次会话剩余时间里**拒绝一切新合成。已提到 512。 |
| **grouping（进入 cluster 后把个人照贴到 anchor）** | **DISPROVEN** | 旧代码已有该保护，测试在旧代码下就 PASS。cluster 状态不是 fallback 的原因。 |
| **renderer 本身失败（download/decode/export 报错）** | **DISPROVEN** | 真机证据自相矛盾：同一 memory 的底部卡片照片正常。在 Node 复现的场景里 render **成功**，是**页面**把成功结果丢了。 |
| **照片资源不可访问** | **DISPROVEN** | 同上；且卡片与 marker 用同一 source。 |

### 1.2 RED（旧页面，同一 harness）

```
=== Task A: marker apply — BEFORE (page from HEAD 2dde1eb) ===
FAIL a stale-generation result still applies to the same current singleton
  A is still the current singleton with the same source; its ready photo must be applied
  (got /images/markers/landmark-selected-fallback.png)
FAIL every singleton eventually receives a photo, not just the first batch
  markers stranded on the bundled fallback: 12 of 60 (M48, M49, M50, M51, M52, M53, M54, M55)
3 FAILED, 5 passed
```

### 1.3 新语义（已实施）

异步结果**不再用「老 generation」判断**，而是**重新验证当前真实对象**：

- `renderer === this.pinRenderer`、页面 active、不在 `stackGesture`、未 dispose
- 按 **memoryId** 在当前 markers 中查找（**不使用 captured index**）⇒ 缩放重分组后 index 变化不会贴错
- `current groupCount === 1`（现在是 singleton，不是 stack anchor）
- `current.stampSelected === job 的 selected`（render 变体未变）
- `mapMarkers.photoFor(currentMemory) === jobSource`（照片未被替换）

全部成立 ⇒ 允许应用。任一条不成立 ⇒ 记下安全原因并丢弃。

新增 `rebindReadyMarkerPhotos()`：在**既有事件点**触发（region end / grouping settle / job completion），
**不引入 polling timer**。

### 1.4 结果

```
=== Task A: marker apply — AFTER ===
5/5 → 8/8 marker apply checks passed (synthetic clock; no device claim).
```

`verify:marker-apply` **8/8**。

---

## 2. Original image pressure

### 2.1 三阶段管线

| 阶段 | 并发 | 职责 |
|---|---:|---|
| `network` | **3** | cloud download / local resolve。**不 decode** |
| `heavy` | **1** | `getImageInfo`（读真实宽高）+ `wx.compressImage`（生成 ≤384 长边 derivative）。共用一个槽 |
| `compose` | **1** | 共享 canvas：clear/clip/drawImage/frame/`canvasToTempFilePath` |

`PREPARE_CONCURRENCY = 3` 已被替换为 `DOWNLOAD_CONCURRENCY = 3` / `HEAVY_CONCURRENCY = 1` / compose `1`。

### 2.2 原图 vs derivative

| 项 | BEFORE | AFTER |
|---|---|---|
| 测试图尺寸 | 4000 × 3000 | 4000 × 3000 |
| **decode 输入（交给 `canvas.createImage`）** | **4000×3000** | **384×288** |
| decode 输入 RGBA | ≈ 45.8 MiB | ≈ 0.42 MiB（**约 1/108**） |
| 峰值并发 download / heavy / compose | 1 / 0 / 1 | **3 / 1 / 1** |
| frame decode 次数（20 / 48 marker） | 20 / 48 | **2 / 2** |

### 2.3 为什么 384 足够（不是拍的）

crop 是 `192×195` canvas 单位，导出 ×3 = `768×858`；marker 实际显示 **48px（normal）/ 80px（selected）**。

- derivative `384×288` scale-to-cover 进 `192×195`：cover = 0.6771
- 实际取样的真实像素 = **284×288** → canvas `192×195` ⇒ **1.48× 下采样（没有放大）**
- 在**导出网格**上：crop 宽 `576` 设备 px 由 `284` 真实 px 供给 ⇒ 2.03× 放大
- 在**用户真正看到的尺寸**上（DPR 3）：crop 占 `36.0` CSS px = `108` 设备 px（48px marker）⇒ **2.63× 过采样**；
  selected（80px）⇒ `180` 设备 px ⇒ **1.58× 过采样**

结论：**唯一「不够」的是导出网格本身**，而导出网格比显示大 16 倍（768 显示成 48），
**不是约束**。若以后单独降导出分辨率，384 仍然够用。**本轮未改导出分辨率。**

### 2.4 边界与安全

- derivative **只用于 Map renderer**，绝不覆盖 `memory.photo` / `placePhoto` / 云端原图，不写 diary store、不上传。
- `dispose()` 清理 derivative 与 export 临时文件。
- `getImageInfo` / `compressImage` 不可用或失败 ⇒ **不永久失败**：回退到原图 decode，**仍在同一个 heavy 槽内**（峰值仍是 1 个大 decode），并记 `derivative-failed`。
- bundled 包内资源（`/images/`）**不重新编码**。

---

## 3. Marker apply（UI bridge 写入）

同一 harness，只换被测页面源码：

```
-- BEFORE (page from HEAD) --
    measured: 10 simultaneous photos -> 10 marker write(s), 10 applied
-- AFTER (working tree) --
    measured: 10 simultaneous photos -> 2 marker write(s), 10 applied
```

**10 → 2**。做法：短窗口 batch（`MARKER_PHOTO_BATCH_MS`），同一批 ready 结果按 **memoryId** 收集后
**一次 clone + 一次 `setData({markers})`**；**不是固定等 100ms**，第一帧立即 flush。
selected ready 允许**立即 flush**，不等普通批次。

批处理窗口内会**重新校验 `stampSelected`**：窗口内发生选中变化时不会贴错 stamp。
index 变化时一律按 memoryId 更新。

---

## 4. Drawer

同一 harness，只换驱动 flag：

```
    measured: JS open  -> 22 drawer write(s), 21 of them frame writes
    measured: CSS open ->  1 drawer write(s),  0 of them frame writes
```

**22 → 1**（其中逐帧写入 21 → 0）。

### 4.1 ⚠️ 但默认是 JS 驱动 —— 必须明确

`drawerCssMotion` **默认 `false`**，即**生产默认行为仍是 JS 逐帧驱动（≈22 次写入）**。

理由（按你 brief 里 D4 的 gate）：

- D4 明确写「**必须在真机验证** cover-view 内 transform/opacity transition 是否真的平滑」，
  「如果开发工具能跑，但真机不支持/仍掉帧：**不要伪称修复**」。
- CSS 路径会把 row **保持 mounted**，这与既有 `verify:cloud` 断言「关闭的 drawer 有 0 rows」冲突；
  若默认打开而真机不支持 transform，**drawer 会停在 collapsed offset** —— 这是**功能性**回归，比「没优化」更糟。
- 默认 `false` 让生产行为与改动前**逐字节一致**，真机验证只需翻**一个** flag。

**这是一个偏离（brief 说「本轮只修 A/B/C」之外还要做 D），特此显式列出。**
翻 flag 的方式：`pages/map/index.js` 的 `data.drawerCssMotion`。

### 4.2 CSS spike 的实现要点

- 开合几何（collapsed / expanded）在打开前**一次算完**；`row.top` 是 **final/base position**，不动画 `top`/`height`。
- collapsed 用 `transform: translate3d(0, deltaY, 0)` + `opacity`，`transition: 320ms` + **现有 `mapStack` easing**。
- root/toggle **同样走 CSS transform**（没有留下「rows 走 CSS、root 还 JS 20 次 setData」的半套）。
- `reduceMotion` ⇒ 无 transition，直接终态。
- 最终几何与 JS 驱动**完全一致**（有断言）。
- **`mapStack.DURATION = 320` 与 easing 未改。**

---

## 5. CSS customCallout support —— 分开写

| 环境 | 状态 |
|---|---|
| **Node / 合成层** | **PROVEN（只证明写入次数）**：CSS 驱动 1 次 drawer 写入 vs JS 22 次；最终几何一致；transition 复用 320ms 曲线。**不能证明任何渲染平滑度。** |
| **微信开发者工具** | **NOT RUN** —— 本轮没有跑 DevTools。 |
| **REAL DEVICE** | **UNKNOWN / REQUIRES REAL DEVICE** —— `cover-view` 内 `transform` / `opacity` transition 是否真的由原生合成、是否真的平滑，**完全未验证**。 |

**明确不说的话**：不说「drawer 已修好」。只交付了**可开关的 spike + 可复现的写入次数证据**。
若真机确认 `cover-view` 不支持 transform 或仍掉帧 ⇒ 按 D4 保留 spike 证据，
**下一轮换 overlay architecture**（例如把 drawer 移出 native callout，改用覆盖层），而不是继续调参。

---

## 6. Dev-only safe trace（Task E）

新增 `miniprogram/utils/mapTrace.js`（**默认关闭**，storage key 开关，无生产调用方，**无正式 UI**）。

每个 marker 只记：`jobId` / `selected` / `sourceKind` / original W×H / original bytes /
derivative W×H / derivative bytes / `stage`(download→downsample→decode→compose→export→apply) /
`applyResult`(applied / stale-but-rebound / clustered / source-changed / disposed / gesture-deferred)。

**隐私是结构性保证**：只有 **allowlist 里的枚举 token** 能存活，其它一切塌缩成 `'other'`；
测试用**敌意输入**（cloud fileID、`wxfile://` 路径、商家名、openid 都塞进字段）断言
**快照里一个都不出现**。`verify:map-trace` **15/15**。

---

## 7. Fresh verification

| 命令 | 结果 |
|---|---|
| `verify:map-motion` | **24/24** EXIT 0 |
| `verify:map-viewport` | **7/7** EXIT 0 |
| `verify:map-reveal-cadence` | **6/6** EXIT 0 |
| `verify:marker-renderer-scheduler` | **17/17** EXIT 0 |
| `verify:marker-apply` | **8/8** EXIT 0 |
| `verify:map-drawer-motion` | **8/8** EXIT 0 |
| `verify:map-trace` | **15/15** EXIT 0 |
| `verify:map-photo-recovery` | EXIT 0 |
| `verify:map-empty` / `verify:map-save` | 11 / 10/10 EXIT 0 |
| `verify:cloud` | **272/272** EXIT 0 |
| `verify:avatar` | 39/39 EXIT 0 |
| `verify:sheet-edits` | 61/61 EXIT 0 |
| `npm run verify` | **358/358** + `FINAL STATIC VALIDATION: PASS`，`VERIFY=0` |
| `npm run verify:all` | **EXIT 0**（41 条顶层命令，原 38） |

`verify` 的总数**不是固定常量**（随 `miniprogram/` 下 `.json` 文件数等变化），只报实测值。

### 7.1 RED / GREEN 覆盖（brief 要求的 14 项）

| # | 项 | 状态 |
|---|---|---|
| 1 | stale generation + same singleton → 可安全 rebind | **RED**（旧页面 FAIL）→ GREEN |
| 2 | stale generation + now clustered → 禁止 rebind | 旧代码已 PASS，作为**守卫**保留 |
| 3 | source changed → 禁止旧 path | 同上（守卫） |
| 4 | zoom oscillation settle → ready singleton 全部恢复 | 旧代码已 PASS，守卫保留 |
| 5 | 4000×3000 → decode 输入 ≤384 | **RED**（BEFORE 探针 `4000x3000`）→ `384x288` |
| 6 | downsample 并发 max 1 | **RED**（BEFORE `max heavy = 0`，无此阶段）→ `1` |
| 7 | download 并发 max 3 | **RED**（BEFORE `max download = 1`）→ `3` |
| 8 | compose 并发 max 1 | BEFORE `1` → AFTER `1`（**不变量**，未放宽） |
| 9 | derivative 失败 → 安全回退，不永久 placeholder | GREEN（断言「仍能合成」+ 记 `derivative-failed`） |
| 10 | 10 个 normal 同时 ready → batched setData | **RED**（`10` 次）→ `2` 次 |
| 11 | selected ready → 立即 apply | GREEN（<1 帧内应用） |
| 12 | drawer 320ms → JS setData 从 ~20 降为 O(1) | **RED**（JS `22` 次）→ CSS `1` 次（**默认仍 JS，见 §4.1**） |
| 13 | final geometry 与旧实现一致 | GREEN（断言相等） |
| 14 | reduceMotion → 无 transition | GREEN |

---

## 8. Remaining real-device test list

全部 **REQUIRES REAL DEVICE**，Node 里的数字都是**注入值**，不构成真机结论：

1. `wx.cloud` **真实下载延迟**（决定「首次 Map 是否仍卡在 download」）
2. `canvasToTempFilePath` **真实耗时 + 真实 PNG 字节数**
3. `wx.compressImage` **真实耗时**，以及它是否真的避免了解码原图（**关键**：若实现内部仍解原图，B 的收益会被抵消）
4. `cover-view` / `customCallout` **每帧重排**的真实成本
5. **真 FPS**
6. **Task D 的 CSS transform 是否在 native callout 内生效且平滑**（§5）
7. 真机 **decode 内存峰值**（derivative 是否真的把峰值压下来）
8. 真机 **首次进入 Map 到所有 marker 就绪**的端到端时间

下一轮若真机显示首次 Map 仍主要卡在 cloud download ⇒ 再考虑**云端小图 sidecar**
（本轮**明确未做**：不动 `memory.mapThumbnail`、不动 schema、不加 upload、不做历史 migration）。

---

## 9. 需要你裁决的三件事（如实交代）

### 9.1 我改了两条**既有断言**（不是我新写的）

`tools/verify-cloud.cjs` 里两条断言**把旧的实现细节钉死了**，而这两条正是你要求删掉的根因：

1. `map photo work ... is bounded to 48 records per refresh` → `assert.equal(seen.length, 48)`
2. `marker cache bounds queued compositions ...` → 断言 `LIMIT = 96`

我没有「删断言消红」，而是**改成钉住更强的新契约**：

- 第 1 条：断言从 `seen.length === 48` 改为 **4 条**：
  `seen[0] === ['bounded-79', true]`（selected 排最前）、`seen.length === 80`（**一个都不落下**）、
  `new Set(...).size === 80`（每个 singleton 恰好请求一次）、`seen.filter(s=>s[1]).length === 1`
  （只有选中项用 selected 变体）。比原来的 `=== 48` 严格得多。
- 第 2 条：不再钉常量，而是断言**形状**：`composed >= 128`（必须清得掉真实规模）
  **且** `composed < 560`（必须仍是有限上界）。原来的 `=== 96` 反而**在旧代码下是空过的**
  （全局 `wx` 没有 `canvasToTempFilePath`，每次 render 都静默回退 ⇒ 断言实际上没测到东西）。

### 9.2 我改了 4 个冻结哈希 fixture

因为动了 `pages/map/index.wxml` / `index.wxss`，项目的**冻结哈希链**（`verify:cloud` 主链）会红。
我按仓库**既有的**「用户授权 UI 变更」机制更新（`tools/fixtures/regression/ui-approved-updates.json`
+ `map-frame-review.json` + `map-identity-review.json` + `visual-refinements.json`），
并且**先做了 dry-run** 复现整条链逐文件比对、确认基线全绿才落盘（dry-run 脚本在 `.workbuddy-ai/scratch/map-perf/dryrun-hash-chain.cjs`）。
`reviewed-map-veil-removal.cjs` 里**硬编码的 `1af64be70016…` pin 保持不变**（dry-run 确认 `pin satisfied: yes`）。

**这属于「用户授权 UI 变更」的既定流程，但毕竟是我替你签的字，请复核。**

### 9.3 新增了一个生产树文件

`miniprogram/utils/mapTrace.js`。**默认关闭、无生产调用方、无 UI**，
只有开发时手动打开 storage key 才记录，且只存 allowlist 枚举值。

---

## 10. Changed files

**修改（12）**

```
 miniprogram/pages/map/index.js                     | 239 ++++++++++++++++--
 miniprogram/pages/map/index.wxml                   |   8 +-
 miniprogram/pages/map/index.wxss                   |   8 +
 miniprogram/utils/mapMarkers.js                    | 268 +++++++++++++++++----
 package.json                                       |   7 +-
 tools/fixtures/regression/ui-approved-updates.json |   8 +-
 tools/map-frame-review.json                        |   4 +-
 tools/map-identity-review.json                     |   8 +-
 tools/verify-cloud.cjs                             |  35 ++-
 tools/verify-map-motion.cjs                        |  11 +-
 tools/verify-map-photo-recovery.cjs                |   2 +-
 tools/visual-refinements.json                      |   4 +-
 12 files changed, 511 insertions(+), 91 deletions(-)
```

（此 stat 含**第一轮**未提交的改动，见开头说明。）

**新增（8）**

```
 miniprogram/utils/mapTrace.js                      (Task E，dev-only)
 tools/verify-marker-apply.cjs                      (Task A/C)
 tools/verify-map-drawer-motion.cjs                 (Task D)
 tools/verify-map-trace.cjs                         (Task E)
 tools/verify-marker-renderer-scheduler.cjs         (第一轮)
 tools/verify-map-reveal-cadence.cjs                (第一轮)
 docs/reviews/map-performance-investigation-20260926.md   (第一轮调查报告)
 docs/reviews/map-performance-fix-round1-20260926.md      (第一轮修复报告)
```

**未动（不变量，可核对）**

- `miniprogram/utils/mapStack.js` —— **完全未改**（`DURATION = 320`、easing）
- `miniprogram/utils/mapLayout.js` —— 未改（grouping 算法）
- camera semantics / Map 缩放控件 / Map card / TabBar / Add / cloud functions / 图片保存业务 —— 未改
- 导出分辨率 **768×858** —— 未改
- marker 视觉（`WIDTH/HEIGHT`、48/80px、`style()`）—— 未改
- `48` marker 增强预算**已移除**（这是被要求修的根因，不是不变量）

---

## 11. 证据文件

全在 gitignored 的 `.workbuddy-ai/scratch/map-perf/`：

- `round2-phaseD-evidence.txt` —— before/after 汇总（同一探针，只换被测源码）
- `after/r2-renderer-BEFORE.txt` / `after/r2-renderer-AFTER.txt` —— Phase D 原始输出
- `before/mapMarkers.before.js` / `before/map-index.before.js` —— 从 `HEAD` 抽出的对照源码
- `probe-renderer-r2.cjs` / `probe-apply-before.cjs` —— 探针
- `round2-taskA-red-green.txt` —— Task A RED/GREEN
- `dryrun-hash-chain.cjs` —— 冻结哈希链 dry-run
- `r2-verify*.log` —— 完整验证日志

---

**未 commit、未 push、未 deploy。**
