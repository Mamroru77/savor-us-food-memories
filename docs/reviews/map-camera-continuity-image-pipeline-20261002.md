# Map A→B 相机连续性 + 全产品图片管线（2026-10-02）

**状态：IMPLEMENTED / STATICALLY VERIFIED / RUNTIME-VERIFIED（模拟器计数）/ 真机 = NOT VERIFIED。
STOP FOR CAMERA + IMAGE PERFORMANCE APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy / 未重新上传微信版本。
- **冻结 UI 面零改动**：`pages/map/index.wxml` `4522d594…`、`index.wxss` `c13016f3…` 与
  `tools/map-identity-review.json` 注册值**逐字节 MATCH**；`verify:cloud` **272/272 EXIT 0**。
- 本轮重开范围：A. Map A→B camera continuity；B–F. 图片 preload / cache / dedupe / invalidation /
  detail 原图保真。**未做任何视觉重设计**（typography / spacing / card / icon / TabBar / colour /
  shadow / hierarchy 全部未动）。

---

## 1. CURRENT A→B CAMERA ROOT CAUSE

上一轮已修「prop 预写抢占命令」，但 A→B 仍然不合格，原因**不同**：

**平台没有任何相机动画 API。** 运行时枚举 `MapContext`（SDK 3.17.3）只有
`includePoints`（fit-bounds，同时决定中心）与 `moveToLocation`（只改中心、无 duration、IDE 上直接失败）。
唯一能连续承载中心的是**绑定 prop 通道**，而单次写入是**瞬时**的。

于是上一轮的 A→B 是：
- **IDE**：`applyFilters` 写 B 的中心 → **一帧跳变**（`includePoints` 是静默空操作）。
- **真机**：`moveToLocation(B)` → 平台自己的行为，无 duration 可控，且与 scale 无关。

⇒ 「从 A 的当前视野连续运动到 B 的当前视野」**在原实现里没有任何载体**。

---

## 2. BEFORE A→B camera timing（改前实测）

模拟器，428×926，platform `devtools`，计数器装在页面实例方法上。

| 观测 | 改前 |
|---|---|
| 命令 | `setData({latitude,longitude})`（IDE）/ `moveToLocation`（真机） |
| 原生中心的不同取值 | **1**（900ms / 161 次采样） ⇒ 纯瞬移 |
| 30 次连续 prop 写入时原生中心的不同取值 | **26**（单调路径） ⇒ **通道本身能承载连续运动** |
| 每次写入引发的 regionchange | **2 组 begin/end** ⇒ 30 次写入 = 60 组 |
| 一次 focus 的 `applyFilters`/`focusMapCamera` | 1 / 1（无队列，last-intent-wins ✓） |

**关键平台结论（决定了实现路径）**：绑定中心 prop **是**一条能逐帧跟随的相机通道；
真正的问题不是「通道不会动」，而是**没有人按帧写它**。

---

## 3. SELECTED CAMERA STRATEGY

**A→B = 一条由帧驱动的、可中断的 bound-centre travel**（`programmaticCameraTransition` token）。

- 通道：绑定 `latitude`/`longitude`（**IDE 与真机同一条路径**，无平台分支）。
- 帧率：绝对 deadline，`frame * 1000/60`（复用 `startDrawerReveal` 的既有规则，避免漂移）。
- 时长自适应：`clamp(160 + 0.55 * 像素距离, 160, 640)` ms；曲线复用项目既有 smoothstep
  （`mapStack.ease` / 底部卡片 `cubic-bezier(1/3,0,2/3,1)`）—— 无 bounce、无 overshoot。
- 纬度在 **Mercator** 空间插值（长距离下地速均匀）。
- 目标 = `centreForPoint(marker, scale, viewport, measuredPadding)` ⇒ marker 落在**有效可视区中心**
  （顺带修掉上一轮因冻结断言而未能实现的「构图」项）。
- **不做缩放**：`scale` prop 的变化会被原生动画化（实测 17→10 约 2.3s），与 160–640ms 的 pan 无法同步；
  平台也没有「中心+缩放一条命令」的能力。⇒ A→B 为纯 pan。
- **抑制**：transition 存活期间 `onMapRegionChange` **整段早退**（自己的写入 `causedBy:'update'`），
  不做 `readMapScale` / `syncStackPositions` / `applyFilters` / marker 重建；settle 时**恰好一次**
  走既有 `onCameraViewportReady` 对账。手势（`gesture`/`drag`/`scale`）**取消** transition 并走原路径。
- 打断：新点击 → 取消并**从当前实际位置**重新出发（`cameraLiveCentre` 由 `getRegion` 免费维护）。

**明确拒绝**：JS 插值**不是**新架构，而是上面这条 travel 本身；被拒绝的是「按帧写 prop 却不加抑制 token」。

---

## 4. START / MID / END PROOF

**帧级（生产 step 函数，非定时器）**：

```
steps: 30 帧，elapsed 0 → 267ms，每帧间隔 16–25ms
target = centreForPoint(marker, 13, 428×926, [229,74,351,0])
终帧 == 目标（误差 < 1e-9）
```

**原生级（真机不可用，模拟器紧凑采样）**：

```
start  31.451040/121.145611
t=138  31.451452/121.145968     ← MID
t=285  31.463510/121.155820     ← MID
t=389  31.471759/121.162561     ← END（== B 的合成目标，与模型预测差 ≈4px）
monotoneTowardsTarget: true
```

`START ≠ MID ≠ END` 已由**两条独立证据**证明（帧序列 + 原生中心序列）。
⚠️ 采样受 `getCenterLocation` 往返（~65ms）限制，只取到 4 个不同原生中心；**帧级证据**是主证据。

---

## 5. RAPID A→B→C INTERRUPTION PROOF

| 断言 | 结果 |
|---|---|
| 两次点击 = 两条独立 travel（`token` 递增） | PASS |
| 第二条 travel 的 `from` == 第一条中途的**实际中心** | PASS |
| 终态选中 == C，终态中心 == C 的合成目标 | PASS |
| 被取代的 travel 不再写帧（`token !== cameraTransitionSerial` 即返回） | PASS |
| settle 把**当前** generation 交给对账路径（stale 由既有守卫拒绝） | PASS |
| 手势 / pinch / zoom / overview / onHide 全部取消 travel | PASS |
| travel 期间 `readMapScale` / `getRegion` **每帧 0 次** | PASS |
| travel 期间 `commandScale` **0 次写入** | PASS |

---

## 6. FULL IMAGE SURFACE INVENTORY

| SURFACE | 显示尺寸 | SOURCE TYPE | 变体 | 冷请求 | 重复请求 | PRELOAD | MEM CACHE | DISK CACHE | DEDUPE | INVALIDATION | FALLBACK | 需要原图 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Map marker（canvas 合成） | 48/80px @3x → 384px 源 | `cloud://` | TINY 384 | `cloud.downloadFile` ×1/source | **0（本轮修）** | ✅ 选中变体后台预取 | ✅ L2 session | ✅ L3 24MB LRU | ✅ L1/L2/L3 | ✅ owner + revision | 内置 landmark PNG | 否 |
| Map selected card | 280rpx | `cloud://` 直绑 `<image>` | ORIGINAL | 平台解析 | 平台缓存 | — | — | — | — | — | `le-comptoir.jpg` | **是** |
| Map drawer row | 80px | 同 marker 合成结果 | TINY | 复用 marker | 0 | — | ✅ | ✅ | ✅ | ✅ | 同 marker | 否 |
| Home ambient / weekly | 全屏 | `cloud://` 直绑 | ORIGINAL | 平台 | 平台 | — | — | — | — | — | `le-comptoir.jpg` | 是（背景） |
| Home recent rows（`memory-row`） | 列表缩略 | `cloud://` → https | ORIGINAL | **getTempFileURL** | **0（本轮修）** | — | ✅ L2 URL | 平台 | ✅ 批量+去重 | ✅ 过期前刷新 | `photos.meal` | 否 |
| Me ambient / avatar | 全屏 / 88rpx | 本地或 cloud | ORIGINAL | — | — | — | — | — | — | — | jamie.jpg | 是 |
| Me → Memories（library sheet） | 列表缩略 | `cloud://` → https | ORIGINAL | **1 次批量** | **0** | — | ✅ | 平台 | ✅ | ✅ | `photos.meal` | 否 |
| Me → weekly rows | 同上 | 同上 | ORIGINAL | 同上 | 0 | — | ✅ | ✅ | ✅ | ✅ | 同上 | 否 |
| Add 主图 / 缩略图 | 大图 / 小图 | 本地 temp / cloud | ORIGINAL | — | — | — | — | — | — | — | `le-comptoir.jpg` | **是** |
| Us avatar / journey / shared rows | 88rpx / 列表 | 本地或 cloud | ORIGINAL | — | — | — | — | — | — | — | 各自 | 是 |
| Sheet 详情大图 | 全宽 | `cloud://` 直绑 | **ORIGINAL** | 平台 | 平台 | — | — | — | — | — | `le-comptoir.jpg` | **是** |
| Sheet 详情缩略图条 | 小图 | 同上 | ORIGINAL | 同上 | 同上 | — | — | — | — | — | 同上 | 是 |
| Sheet 通知 / 情侣头像 | 小图 | cloud / 本地 | ORIGINAL | — | — | — | — | — | — | — | jamie/alex | 是 |
| 原生 preview（memoryPreview） | 全屏 | `cloud://` | **ORIGINAL** | `downloadMapPhoto` | 0（ticket 内） | — | — | — | — | — | — | **是** |
| Space / Workspace / Reports / Account | 小图 / 无 | cloud | ORIGINAL | — | — | — | — | — | — | — | 各自 | 是 |
| 图标 / morph / fallback / chart | — | 包内 | — | — | — | — | — | — | — | — | — | 否 |

**隐式加载点**（容易漏）：`mapMarkers` 的 `canvas.createImage()`（marker 照片 + frame PNG）、
`wx.getImageInfo`（尺寸探测）、`wx.compressImage`（派生）、`wx.canvasToTempFilePath`（合成导出）、
`nativePreviewSources` 的临时副本、`profile-editor` 头像。以上全部已盘点。

---

## 7. CURRENT DUPLICATE-LOAD ROOT CAUSES

1. **`getTempFileURL` 每行一次、每次挂载一次**：library sheet 关闭即卸载行组件，
   重开重建实例 → 重新解析。实测 **17 次 × 每次打开**（open1/open2/open3 完全相同）。
   每次返回**新的签名 URL** ⇒ 平台 `<image>` 缓存键随之改变 ⇒ 字节被重新拉取。
2. **marker 渲染器按 `[source, selected]` 缓存**：选中一个**已经在屏幕上**的 marker
   仍会重新下载**同一个 cloud 文件**（实测同一 fileID 下载 2 次、224 KB×2）。
3. **零预取**：第一次选中某 marker 必然付全额下载 + 重编码 + 合成延迟。
4. **同一 fileID 被多条互不知情的管线各取一次**：`<image>` 原生解析、`memory-row` 的
   `getTempFileURL`、marker 的 `downloadFile`。

---

## 8. CHOSEN UNIFIED IMAGE ARCHITECTURE

新增 `miniprogram/utils/imageCache.js` —— **单一职责的图片资产管线**：

```
source resolution → variant → in-flight dedupe → cache lookup → download
→ local path → render → prefetch → invalidation → eviction
```

接入点（页面级散落 `Map()` **零新增**）：
- `cloudRecords.resolvePhotoUrls` 保留**身份边界**（`assertBusinessCloudAllowed` / lease / 重新
  `assertLease`），把解析**委托**给 `imageCache.resolve` —— 平台调用因此只剩一处。
- `mapMarkers.createRenderer` 的 NETWORK 阶段取**共享源文件**；HEAVY 阶段（单槽）产出派生并
  `imageCache.store` 持久化。
- Map 页在相机 settle 后 `prefetchSelected(可见集合)`（选中变体，高优先级，真实点击可抢占）。

---

## 9. CACHE LAYER DESIGN

| 层 | 内容 | 键 | 生命周期 |
|---|---|---|---|
| **L0** source metadata | 调用方自己的 record（fileID + revision） | — | — |
| **L1** in-flight dedupe | 同一 `source+variant` 共享一个 Promise | `keyOf(source,variant,revision)` | 直到 settle |
| **L2** session memory | 已解析 URL（fileID）；已下载/已派生的本地路径 | 同上 | 会话；`reset()` 清空 |
| **L3** persistent disk | **仅派生缩略图**（永不缓存原图） | 同上（FNV-1a 文件名） | 跨启动；24MB 预算 LRU |

⚠️ **绝不把 cloud 原图写盘**：一条 legacy record 实测 10.6 MB，20 条就会打爆文件配额
（项目历史上已因 197 MiB 孤儿文件导致所有写入失败）。

---

## 10. CACHE KEY / INVALIDATION RULE

- 键 = `hash(source + '|' + variant + '|' + revision)`。**绝不只用 fileID**。
- `revision` 来自 record 的真实字段（`memory.revision`），**不虚构**；缺失时退化为 `''`。
- 会话 URL 有 `maxAge`（平台给出则用，否则保守 90 分钟），并在**过期前 5 分钟**停止复用 ⇒ 重新解析。
- **owner 变化**：`syncState` 检测到 `identity.userId` 变化即 `imageCache.reset()`（URL + 会话 + 磁盘索引全清）。
- **schema 变化**：缓存目录名含 `CACHE_SCHEMA`（`v1`）⇒ 换版本即换目录，不读旧字节。

---

## 11. PRELOAD PRIORITY MODEL

| 级别 | 内容 | 实现 |
|---|---|---|
| **P0** 当前可见 | marker 缩略图（normal） | 既有渲染队列，可见即取 |
| **P1** 已选中 / 立即需要 | 选中变体 | 点击时由渲染器的 `high` 队列抢占 |
| **P2** 很可能的下一次交互 | 可见集合的**选中变体** | 相机 settle 后 `prefetchSelected` |
| **P3** 空闲后台 | `imageCache.prefetch`（**并发 1**、去重、可 `cancelPrefetch`） | 未接页面（见 §31） |

**禁止**：启动时预取全库原图。用户操作永远抢占后台预取。

---

## 12. THUMBNAIL VARIANT MODEL

只引入**一个**共享 variant（避免碎片化）：

| variant | 目标像素 | 依据 | 用途 |
|---|---|---|---|
| `marker` | 长边 **384px** | marker 最大屏占 80px×3 = 240 设备像素；384 已超过屏幕可分辨上限（既有 `SOURCE_LONG_EDGE`，本轮未改） | marker 合成 + drawer 行 |
| 其余 surface | **不生成变体** | 它们用 `<image>` + 解析后的稳定 URL，平台自行缩放；详情必须原图 | card / 列表 / 详情 |

**详情页变体不存在**（`verify-detail-original` D4 硬断言：缓存里没有 `'detail'` 这种 variant，
一个存在的 variant 早晚会被误用）。

---

## 13. ORIGINAL-IMAGE CONTRACT

- 详情图绑定 `detail.images[photoIndex]`（record 的**原始**照片列表，顺序不变）。
- 原生查看器 `nativePreviewSources.resolve` 对 `cloud://` 走 `downloadMapPhoto`（**原对象**），
  且**不经过** `imageCache`。
- 失败时回退到内置资源，**绝不**回退到「同一张图的低清副本」。
- 由 `tools/verify-detail-original.cjs`（7 条）作为产品回归守卫。

---

## 14. EXACT FILES CHANGED

| 文件 | 性质 |
|---|---|
| `miniprogram/utils/imageCache.js` | **新增** 统一图片管线（L0–L3、dedupe、批量、预算、LRU、失败回退） |
| `miniprogram/utils/mapCamera.js` | 新增 A→B 过渡纯函数（`panPixels` / `panDurationMs` / `panProgress` / `panPoint`） |
| `miniprogram/pages/map/index.js` | camera transition（token + 抑制 + 取消）、`prefetchVisibleSelection`、owner 失效 |
| `miniprogram/utils/mapMarkers.js` | NETWORK 阶段改用共享源；HEAVY 阶段持久化派生；新增 `prefetchSelected` |
| `miniprogram/utils/cloudRecords.js` | `resolvePhotoUrls` 委托给管线（身份边界保留） |
| `tools/verify-image-cache.cjs` | **新增** 14 条（含 RED 证明） |
| `tools/verify-detail-original.cjs` | **新增** 7 条 |
| `tools/verify-map-camera-motion.cjs` | M 段重写为新 travel 契约 + A→B START/MID/END（26 条） |
| `tools/verify-map-viewport.cjs` / `verify-map-scale-echo.cjs` / `verify-cloud.cjs` | focus 契约按授权**改口径**（未删除任何验证） |
| 11 个地图/渲染器套件 | 补上页面的真实新依赖 `imageCache`（严格白名单 harness；**未放宽断言**） |
| `package.json` | `verify:image-cache` / `verify:detail-original` 注册并挂进 `verify:all` |
| `docs/reviews/map-camera-continuity-image-pipeline-20261002.md` | 本文件 |

**未改**：任何 `wxml` / `wxss` / `map-identity-review.json` / store / 视觉 token / 详情布局。

---

## 15. MAP BEFORE / AFTER

| 指标 | BEFORE | AFTER |
|---|---|---|
| A→B 首次选中 B 的下载 | **1 次 / 228,980 B** + 1 compress + 1 compose | **0 次 / 0 B** + 0 compress + **1 compose** |
| 同一 fileID 被下载次数 | 部分资产 **2 次** | **每个 1 次** |
| A→B 重复 | 0 | 0 |
| A→B 原生中心不同取值 | 1（瞬移） | 4（采样上限）／帧级 30 帧单调 |
| travel 期间 regionchange 派生工作 | 2 组/写入 × 30 | **0**（settle 时 1 次） |
| 冷加载（本次会话 6 个 marker） | — | 6 下载 / 1,932,481 B；L3 落盘 **5 个派生 / 135,843 B** |
| `getTempFileURL`（Map/Home 侧） | 每行 1 次 | **5 id → 1 次调用** |

⚠️ 冷加载的 marker 数量两次会话不同（11 vs 6），因此**逐 marker 的字节对比不作为结论**；
可比的结论是 **A→B 的 1 → 0**、**fileID 去重**、**L3 体积 133 KB 量级**。

---

## 16–18. ME MEALS / PLACES / SAVED MEMORIES BEFORE / AFTER

三个入口都走同一个 `library` sheet（`all` / `shared` / `favorites` 三个 tab）与同一批 `memory-row`。

| 指标 | BEFORE | AFTER |
|---|---|---|
| 冷开（会话首次） | **17 次 `getTempFileURL` / 17 id** | **1 次 / 17 id**（批量合并） |
| 第二次打开 | **17 次** | **0** |
| 第三次打开 | **17 次** | **0** |
| 同 id 重复解析（会话累计） | 每次挂载 1 次 | **90 次命中 / 17 次未命中** |
| 重复下载字节 | 0（平台缓存命中与否不可观测） | 0 |
| 首图 ready | 不可观测（平台 `<image>` 加载不暴露） | 不可观测 |

⚠️ **限制**：`<image>` 自身的网络取字节数**无法从运行时计数**（不是 `wx.cloud.*`）。
本轮能证明的是「不再每次挂载重新解析、URL 稳定」——这是平台缓存能否命中的**前提**，
不是「字节数下降」的直接测量。

---

## 19. HOME / US / OTHER THUMBNAIL AUDIT RESULT

- **Home recent rows**：使用 `memory-row` ⇒ 与 Me 同一路径，批量 + 会话缓存生效
  （运行时实测：Home 的 5 个 id 合并为 1 次调用）。
- **Us journey / shared rows**：直接绑 `cloud://`（ORIGINAL），无重复解析路径 ⇒ **不修改**
  （符合「MEASURED PROBLEM → FIX」，不为看到 image 就重构）。
- **Add 草稿图**：本地 temp / 已持久化路径，无 cloud 解析 ⇒ 不修改。
- **Space / Workspace / Reports / Account**：图片极少且为原图直绑 ⇒ 不修改。
- **Sheet 详情 / 通知 / 情侣头像**：ORIGINAL 契约 ⇒ 不修改。

---

## 20. DETAIL ORIGINAL FIDELITY PROOF

`tools/verify-detail-original.cjs` **7/7 PASS**：
D1 绑定 `detail.images[photoIndex]`；D2 图库 = `[memory.photo].concat(memory.extraPhotos)`；
D3 原生查看器走 `downloadMapPhoto`（原对象）且**不经** `imageCache`；D4 缓存里**没有** detail 变体；
D5 marker 派生上限 ≤512；D6 只有 marker 渲染器可以请求 marker 变体；D7 失败回退到内置资源。

⇒ **DETAIL IMAGE MUST RESOLVE TO ORIGINAL 有硬守卫。**

---

## 21–24. BUDGET / EVICTION / FAILURE

- **内存缓存预算**：会话 Map 无上限风险（每个 entry 只是一条 URL 或一个路径字符串）；
  实测 17 行 ⇒ 17 条 URL 记录。**无像素驻留**（原图从不解码进缓存）。
- **磁盘缓存预算**：**24 MB**，LRU（`lastModifiedTime`），逐出最久未读条目；
  实测一套 marker 派生 ≈ **133–170 KB**，距离预算三个数量级。
- **淘汰行为**：`evictToBudget` 按 LRU 删除直到低于预算；被淘汰的只是可重生成的缩略图。
- **失败回退**（全部有测试）：
  - 缓存文件被删/损坏 ⇒ 丢弃条目并回网络（L5）
  - 无 FileSystemManager / 无 `wx` ⇒ 直接返回未缓存路径，`store()` 返回 `null` 而不抛（L6/L9）
  - 解析失败 ⇒ 返回原 source，调用方保留自己的 fallback（U3）
  - URL 临近过期 ⇒ 提前重新解析（U4）
  - 磁盘写失败（copyFileSync 不可用）⇒ 退 `readFileSync`+`writeFileSync`，再失败则放弃缓存
  - **缓存永远只是性能层，绝不成为 correctness 单点。**

---

## 25–28. PEARL/DUSK · EN/ZH · TAB RETURN · POI

| 项 | 结果 |
|---|---|
| **PEARL / DUSK** | 相机 plan payload 逐字节相同（上一轮已证）；图片管线**不读主题** ⇒ 无分支 |
| **EN / ZH** | 图片管线**不读 locale**；文案路径未改（`verify:ui` / `verify:visual-language` PASS） |
| **Tab return** | `verify:map-tab-return` 7/7；相机命令 0、`applyFilters` 0、markers 同一对象；L3 使返回时**零下载** |
| **POI** | 与相机/图片管线完全解耦（`verify:cloud` 相关用例 PASS） |

---

## 29. VERIFICATION RESULTS

| 门禁 | 结果 |
|---|---|
| `npm run verify` | **361/361 PASS · FINAL STATIC VALIDATION: PASS** |
| `npm run verify:cloud` | **272/272 EXIT 0**（冻结链全绿） |
| `npm run verify:all` | **EXIT 0**（4m46s，含 2 个新套件） |
| `verify:map-camera-motion` | **26/26**（含 A→B START≠MID≠END、打断、抑制） |
| `verify:image-cache` | **14/14** |
| `verify:detail-original` | **7/7** |
| `verify:map-viewport` / `verify:map-scale-echo` / `verify:map-trace` / `verify:marker-apply` / `verify:marker-renderer-scheduler` / `verify:map-motion` / `verify:map-photo-budget` | 全部 PASS |
| 冻结面哈希 | `4522d594…` / `c13016f3…` == 注册值 ⇒ **MATCH，检查点未推进** |

### RED 证明
1. **A→B**：把 `applyFilters` 的焦点分支还原成「无条件写中心」⇒ `verify-map-camera-motion` **M1 FAIL**
   （「the selection patch must not carry a camera write」）；还原后 26/26。
2. **图片管线**：改前的行为（每行一次 `getTempFileURL`、`[source,selected]` 各自下载）在
   `verify-image-cache` 的 U1 / L1 下**必然 FAIL**（U1 期望 17 行 → 1 次调用；L1 期望 1 次下载）；
   `verify-map-photo-download-budget` 在把 `localSource` 换成逐变体下载时亦会红（同一 fileID 2 次）。
3. **重编码并发**：`verify-marker-renderer-scheduler` 曾真实变红（"re-encodes must never overlap, saw 4"），
   证明「派生必须留在单槽 HEAVY 阶段」——这是一次**被测试抓到的真实设计错误**，已修正。

---

## 30. REAL-DEVICE STATUS

| 项 | 状态 |
|---|---|
| **MAP A→B REAL-DEVICE MOTION** | **PENDING VISUAL CONFIRMATION**（本机无真机附着；`platform: devtools`） |
| 图片缓存性能 | 计数在 DevTools 完成；**真机仍需验证** Map A→B、Me 二次打开、detail 原图三项 |
| 详情原图 | 契约级守卫通过；真机像素级确认待做 |

---

## 31. REMAINING LIMITATIONS

1. **真机 A→B 未验证**：帧序列与原生跟踪均在模拟器上取证；真机的 `setData` 吞吐与原生地图跟随
   需要一次真机确认。**不声称真机已连续。**
2. **`<image>` 的网络字节无法计数**：Me / Home 列表的「二次加载」本轮修的是**解析层**
   （17→1、暖开 0），字节层面的下降依赖平台 `<image>` 缓存，**未直接测量**。
3. **selected card 仍用原图**：card 直绑 `cloud://`（ORIGINAL，保真正确），其解析由平台负责；
   「card 用中等 variant」需要改绑定与 `verify-image-pipelines` 的一条断言 ⇒ **REVISE，需批准**。
4. **P3 空闲预取未接页面**：`imageCache.prefetch` 已实现并测试，但只有 Map 的 P2 预取接了页面；
   Me/Home 的「下一屏窗口」预取未做 ⇒ **REVISE**。
5. **没有服务端缩略图**：CloudBase 是否支持 transformed URL **未审计**（不假设存在）。
   若要走服务端派生 ⇒ **SERVER-SIDE DERIVATIVE REQUIRES DEPLOY APPROVAL**，本轮**未部署任何云函数**。
6. **overview 未纳入本轮**：其中心仍由 `includePoints`/prop 一次到位（上一轮结论，scale 由原生动画化）。
   若要 overview 也连续，可复用同一 travel token ⇒ 需批准。
7. **本机验证链需要 stdin shim**（既有环境限制）：
   `NODE_OPTIONS="--require <无空格路径>/node-sync-stdin-shim.cjs"`。

---

## 32. KEEP / REVISE

| 项 | 建议 | 理由 |
|---|---|---|
| **A. MAP A→B CAMERA** | **KEEP** | 根因（无连续载体）已定位并给出帧驱动 travel；START≠MID≠END 有帧级 + 原生双重证据；打断/手势/缩放/隐藏全部取消；travel 期间派生工作为 0。**真机质感待确认** |
| **B. MAP IMAGE PRELOAD/CACHE** | **KEEP** | A→B 下载 1→0、同 fileID 去重、选中变体预取；L3 体积 133 KB 量级 |
| **C. ME SECONDARY IMAGE CACHE** | **KEEP** | 冷开 17→1 次调用、暖开 17→0；URL 稳定 ⇒ 平台缓存可命中 |
| **D. PRODUCT-WIDE THUMBNAIL PIPELINE** | **KEEP** | 单一职责层 + 身份边界保留；P3 预取与 card variant 待批准后扩展 |
| **E. DETAIL ORIGINAL IMAGE FIDELITY** | **KEEP** | 7 条硬守卫；详情不经缩略图管线 |

**最终一行：READY FOR CAMERA + IMAGE PERFORMANCE VISUAL APPROVAL**
