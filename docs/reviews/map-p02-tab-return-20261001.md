# MAP — P0-2：主 Tab 返回后的 Map 连续性

**日期**：2026-10-01
**基线**：`0de3e46`（工作树本就不干净）。**未 commit / 未 push / 未 deploy。**
**结论**：根因已定位并修复在**页面生命周期 + 数据层新鲜度信号**；Map **WXML/WXSS 零改动**、
检查点**未推进**。
**建议**：**READY FOR REAL-DEVICE CACHE CONFIRMATION**

---

## 1. 精确的 tab 返回生命周期

`switchTab` **不是**页面生命周期边界。**主 Tab 页实例常驻**：切走只触发 `onHide`，切回只触发 `onShow`；
`onLoad` / `onReady` 只发生**一次**，`onUnload` 只在真正销毁时发生。
因此 `<map>` 组件、WXML 节点树、`this.markerCanvas`（渲染画布节点）**都跨 Tab 存活**。

| 回调 | 首次进入 Map | Map → 其他 Tab | 其他 Tab → Map | 销毁 |
|---|---|---|---|---|
| `onLoad` | ✅ 一次 | — | ❌ 不触发 | — |
| `onReady` | ✅ 一次 | — | ❌ 不触发 | — |
| `onShow` | ✅ | — | ✅ **每次** | — |
| `onHide` | — | ✅ **每次** | — | ✅（`onUnload` 内） |
| `onUnload` | — | ❌ | ❌ | ✅ |

> 这不是推断：**上一轮 P0-1 的运行时取证已经证明画布节点跨 Tab 存活** ——
> 当时 `onHide` 会 `dispose()` 渲染器，而切回后 `onShow` 仍能用**同一颗** `this.markerCanvas`
> 重建渲染器并成功合成 marker 照片。若节点被平台替换，那条路径不可能成功。

### 每次回调做什么（**修复前**）

| 回调 | 内容 | 网络/DB 读 | marker 重建 | setData | 相机重置 | 照片解析 |
|---|---|---|---|---|---|---|
| `onLoad` | 胶囊 rect、metrics、`store.subscribe` | 否 | 否 | 2 | 否 | 否 |
| `onReady` | `ensureMarkerRenderer()`（查画布节点、建渲染器） | 否 | 否 | 否 | 否 | 首次合成 |
| `onHide` | 取消定时器/手势/动画、清 drawer、**`pinRenderer.dispose()` + 置 null** | 否 | 否 | 1 | 否 | **销毁全部已合成照片** |
| `onShow` | 胶囊/metrics、**清 `imageErrors`**、`active=true`、`initMarkerRenderer()`、**新建 `mapCtx`**、`syncState()`、`readMapScale()`、**`store.syncCloud()`** | **✅ 1 次全量 list** | **✅ 2 次** | 22 | 否（`preserve`） | **✅ 全部重下** |

`syncState` → `applyFilters` → `setData(markers…)` 的回调里会 `renderMarkerPhotos` / `renderDrawerPhotos`；
`onShow` 结尾的 `store.syncCloud()` 一旦 commit，订阅又会触发**第二次** `syncState` → 第二次 `applyFilters`。
⇒ **一次无变化的 Tab 返回 = 2 次整表 marker 重建 + 1 次全量云读 + 每个可见 marker 一次照片重下。**

---

## 2. 重载的根因

**Map 把 `onHide` 当成拆卸点、把 `onShow` 当成冷启动点，但主 Tab 切换两者都不是。**

1. **`onHide` 销毁派生视图模型**：`this.pinRenderer.dispose(); this.pinRenderer = null;`
   —— `dispose()` 会删除**全部已合成照片的临时文件**并清空 `cache` / `ready`。
   于是 `onShow` 拿到的是一个**空缓存渲染器**，`renderMarkerPhotos` 对每个可见 marker
   `peek()` 全部 miss ⇒ **每个 marker 都要重新 `downloadMapPhoto` + 重新 canvas 合成**。
   这是「可见重建」的主体，也是 P0-1 那条 10 MiB 旧原图会被**再下一次**的原因。
2. **`onShow` 无条件重读产品数据**：`store.syncCloud()` → `flushOutbox()` + `listRecords()`
   （分页全量云读）。而 `store.subscribe` 已经会在**任何真实变化**时通知本页 ⇒ 这次读是重复的。
3. **`mergeCloudRead` 无条件 commit**：`commit()` 会写存储、`Object.assign(state,…)`、
   **通知全部订阅者**。所以一次「读回来完全一样」的同步也会让 Map 重建一次
   —— 连**隐藏中**的 Map 也会重建（Home 的 `onShow` 同样会 sync）。
4. 附带：`onShow` 每次清 `imageErrors`、每次新建 `mapCtx`、`onHide` 清 `drawer`。

**第一处不必要的重复操作**：`onShow` → `initMarkerRenderer()` 拿到冷渲染器
（其缓存是被 `onHide` 的 `dispose()` 毁掉的）；紧随其后 `syncState` → `applyFilters` 就把整表
marker 重建并把每个 marker 的照片重新下发。

---

## 3. 修复前的重复工作量（**实测**）

用 `tools/verify-map-tab-return.cjs` 驱动**真实页面 + 真实 store + 真实渲染器**（6 条云照片记录）：

| 场景 | 云读 | 照片下载 | 渲染器新建 | 渲染器销毁 | applyFilters | marker 重建 | markers 桥写 | setData |
|---|---|---|---|---|---|---|---|---|
| 冷启动 | 1 | 6 | 1 | 0 | **2** | **2** | 11 | 32 |
| **Tab 返回（无变化）** | **1** | **6** | **1** | **1** | **2** | **2** | **4** | **22** |
| **4× 快速切换** | **4** | **24** | **4** | **4** | **8** | **8** | **10** | **82** |
| 无变化云同步（Home 的 onShow 会做） | 1 | 0 | 0 | 0 | **1** | **1** | **1** | **7** |

⇒ 一次无变化返回：**每个可见 marker 都被重新下载并重新合成**；快速切换按次数线性放大。
`peekHits = 0` 直接证明返回时渲染器缓存是空的。

---

## 4. 选定的保留模型

按 brief 的偏好顺序执行：**①停止不必要的 onShow 重初始化 → ②复用既有 store 数据 →
③保留 Map 临时视图状态 → ④只在确有必要时加极小的派生状态判定**。
**没有**新建全局 `mapCache`，**没有**序列化页面快照，**没有**第二份 memories 事实来源。

| 状态类别 | 处理 |
|---|---|
| **A 持久偏好**（`showNativePoi` / `theme` / `language` / `reduceMotion`） | 完全不动，仍走既有 settings 持久化；**没有**复制进任何 Map 缓存 |
| **B 产品数据**（memories / 位置 / 照片引用） | 事实来源仍是既有 store/仓库；Map **不**持有第二份权威数据 |
| **C 派生视图模型**（markers / 已解析 marker 照片 / 卡片展示数据） | **在数据 revision 未变时原样复用**（不再销毁重建） |
| **D 临时视图状态**（center / scale / selectedId / query / filter） | 跨 Tab 保留；`applyFilters` 一律以 `'preserve'` 调用，不重置相机 |

### 具体改动

1. **`onHide` 不再销毁渲染器**（也不清 `markerCanvas` / `markerGroups`）。
   仍保留：取消在途定时器/手势/动画、清 drawer 瞬时态、`active=false`、`markerGeneration++`。
   渲染器自身有 `LIMIT = 512` 个已合成变体上界，并在 **`onUnload`** 释放。
2. **`syncState` 增加 revision 闸门**：`store.revision()` 与 `this.renderedRevision` 相同 ⇒
   跳过重算与重发（只做 `resumeMapView()`）；不同 ⇒ 走原有完整路径。
3. **新增 `resumeMapView()`**：一个重新可见的页面**真正**需要补做的全部，且仅此而已 ——
   `syncOverlayClearance()`（量一次搜索栏）、`syncStackPositions()`（重投叠层命中区）、
   `renderMarkerPhotos()` / `renderDrawerPhotos()`（**缓存命中即回绑，不下载**）。
4. **`syncMapCloud()` 加门控**：只有①本页从未同步 ②outbox 有排队工作 ③超过有界刷新窗口
   ④身份未定（locked/verifying，fail-closed 义务）时才读云。`lastCloudSyncAt` 记录上次成功时间。
5. **`onUnload` 显式 `dispose()`**：渲染器现在活过 `onHide`，释放归属真正的页面终点。
6. **`onShow` 仍清 `imageErrors`**：保持既有「返回时给失败图一次重试」的语义，**未改** fallback 行为。
7. **`mapCtx` 仍每次 `onShow` 重建**：创建 JS 上下文对象本身无 I/O、不是本次症状，
   且平台是否需要重建**没有证据** ⇒ 按 brief「只在平台要求时重建」的口径**保守不动**，也不计入收益。

---

## 5. 失效（invalidation）模型

**正确性不依赖时间窗**。三层信号，各司其职：

| 事件 | 谁负责 | Map 的反应 |
|---|---|---|
| **本地写入**（Add 保存 / 编辑 / 删除 / 标记 / 改位置） | `store.commit()` → `revision++` → 通知订阅者 | `syncState` 走完整路径 ⇒ 新记录/改动**立刻**上 Map |
| **身份切换 / 登出 / 恢复** | `identity.subscribe` → 重新加载分区 → `revision++` → 通知 | 完整重建；且**新页面实例**不会继承旧实例的 markers/渲染器（S3） |
| **远端变化**（别的设备改的） | 有界刷新窗口 + 既有网络恢复同步 + `App.onLaunch` | 到窗口才读一次；读回来一样 ⇒ **不重建**（S6/S7） |
| **主题 / 语言 / POI 偏好变化** | `updateSettings` → `commit` → `revision++` | 只更新受影响的表现（`dusk`/`quiet`/`showNativePoi`/copy），**不重下照片**（S5） |
| **切换 Tab / `onShow` 触发 / 页面重新可见** | —— | **明确不失效**（本轮的全部意义） |

### 数据层的新鲜度信号（brief 点名的「store version」）

`utils/store.js` 新增**只读、单调、不持久化**的 `revision()`：

```js
let revisionCount = 0;                       // 恰好被「发布新状态」的两件事自增
function revision() { return revisionCount; }
```

- 自增点**只有两处**：`commit()`，以及 `identity.subscribe` 里的分区重载。
  ⇒ **不变量：revision 未变 ⇔ 自上次渲染以来没有任何通知被发布。**
- 与之配套：**`mergeCloudRead` 在合并结果与本地逐条相同时不再 `commit`**。
  一次「读回来一模一样」的云同步不是数据变化 ⇒ 不写存储、不自增 revision、不通知任何订阅者。
  比较用**规范化（key 排序）序列化**，因为本地记忆与经 `overlay()` 回来的记忆 key 顺序可能不同。

### 缓存生命周期

| | 条件 |
|---|---|
| **有效** | 同一页面实例 + 同一身份分区 + 同一 `store.revision()` |
| **失效** | 身份切换（revision++）、任何真实数据变化（revision++）、`onUnload`（渲染器 `dispose()`）、页面销毁重建 |

**没有 TTL 参与正确性**：`MAP_CLOUD_SYNC_INTERVAL_MS = 30000` 只是「远端变化多久至少被看到一次」的
有界补充，注释里明确写了它不是正确性机制。**没有轮询定时器。**

---

## 6. 改动文件

| 文件 | 变化 |
|---|---|
| `miniprogram/pages/map/index.js` | `onHide` 不再销毁渲染器；`syncState` 加 revision 闸门；新增 `resumeMapView()`；`syncMapCloud()` 加门控 + 新增 `cloudSyncDue()`；`onUnload` 显式释放渲染器；新增常量 `MAP_CLOUD_SYNC_INTERVAL_MS` |
| `miniprogram/utils/store.js` | 新增 `revision()`（+ 两处自增）；`mergeCloudRead` 无变化时不再 commit（+ `sameMemories`/`canonical`） |
| `tools/verify-cloud.cjs` | 1 条既有断言由「`onHide` 必须 dispose」改为「隐藏页不得发布迟到照片 + `onUnload` 必须 dispose」（见 §12） |
| `tools/verify-map-tab-return.cjs` | **新增**（7 项） |
| `package.json` | 新增 `verify:map-tab-return` 并插入 `verify:all` |

**没有**任何 `pages/**/*.wxml`、`*.wxss`、`components/**` 改动。**没有**动 mapMarkers、分组、
相机通道、fallback、卡片、搜索、浮动控件、POI UX。

---

## 7. 无变化返回的结果（**修复后**）

| 场景 | 云读 | 照片下载 | 渲染器新建 | 渲染器销毁 | applyFilters | marker 重建 | markers 桥写 | setData |
|---|---|---|---|---|---|---|---|---|
| 冷启动 | 1 | 6 | 1 | 0 | 1 | 1 | 10 | 25 |
| **Tab 返回（无变化）** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **10** |
| **4× 快速切换** | **0** | **0** | **0** | **0** | **0** | **0** | **0** | **40** |

`peekHits = 6`（返回时 6 个 marker **全部缓存命中**，0 次下载）。

S1 同时断言了用户可见状态逐项未变：`markers` **同一数组对象**、`selectedId`、`latitude` / `longitude`、
`mapScale`、`commandScale`、`selected`、`selectedPhoto`、`showNativePoi`，
且**没有任何 marker 退回 bundled fallback**。

---

## 8. Add 保存后返回的结果

`store.addMemory()`（Add 保存后真实走的路径）→ commit → 隐藏中的 Map 订阅触发完整重建 →
返回走 `resumeMapView()`：

| | 结果 |
|---|---|
| 新记录是否出现 | ✅ 新 marker 存在（`memoryId === 'm-new'`），`markers.length` 增加 |
| 照片下载 | **1**（只有新 marker 的那张）—— 不是 7 |
| 其余 marker | 缓存命中，**0 次重下** |
| 云读 | 0（本地 commit 已是权威；outbox 为空） |
| 相机 | **未重置**（`applyFilters(..., 'preserve')`，且返回路径不调 `applyFilters`） |

⇒ **「永不重载」不是本轮的契约**：契约是「**无变化 → 复用；有变化 → 只刷新受影响的部分**」。

---

## 9. 快速切换结果

`Map → Home → Map → Us → Map → Me → Map`（S4 以 4 次连续 `onHide`/`onShow` 驱动）：

- 云读 **0**（修复前 4）· 照片下载 **0**（修复前 24）· 渲染器新建 **0**（修复前 4）· 渲染器销毁 **0**（修复前 4）
- `markers` 数量恒定、`selectedId` 保持有效、**无 marker 重复**、无累积监听（`unsubscribe` 只在 `onUnload` 调一次）
- `setData` 40 次（修复前 82）：全部是每次 show 的胶囊/metrics/tabbar 与叠层命中区，**没有一次 markers 写入**

---

## 10. 照片缓存 / 魏家凉皮 回归

**未改 P0-1 的任何东西**（`cloudRecords.downloadMapPhoto` 的静默窗口一字未动；
`verify:map-photo-budget` 仍 **8/8**）。

| brief 要求 | 结果 |
|---|---|
| 魏家凉皮返回后仍可见 | ✅ S1 断言「返回后没有任何 marker 退回 fallback」，且 `markers` 是同一数组对象 ⇒ 已合成的照片图标原样保留 |
| 立即返回**不再**发生第二次 10 MiB 下载 | ✅ 无变化返回 `downloads = 0`。机制与体积无关：返回路径**一次都不调用** `downloadMapPhoto`（`peek` 命中即回绑） |
| 失败图状态不永久毒化后续重试 | ✅ `onShow` 仍清 `imageErrors`，语义未变 |
| fallback 语义未变 | ✅ `mapMarkers.fallback` / `photoFor` 未改；`verify:image-pipelines` 12/12、`verify:map-photo-recovery` EXIT 0 |

⚠️ **权衡（如实记录）**：渲染器现在跨 Tab 存活 ⇒ 已合成的临时文件在会话内保留（上界 `LIMIT = 512`
个变体，`onUnload` 全量删除）。修复前每次 `onHide` 就释放一次。这是「立即返回」换来的代价，
上界由渲染器自身保证，**不新增任何清理定时器**。

---

## 11. 隐藏期间切主题 / 语言

S5：Map 为 PEARL → `onHide` → `store.updateSettings({theme:'dusk', showNativePoi:false})` → `onShow`：

- `dusk === true`、`showNativePoi === false`（**没有**陈旧表现）
- 照片下载 **0**、marker 重建 **0**、markers 桥写 **0**

机制：`updateSettings` → `commit` → `revision++` → 通知 ⇒ 隐藏中的 Map 也会走完整路径更新表现；
返回时 revision 已匹配 ⇒ 只做 `resumeMapView()`。**语言**同理（`i18n.syncPage` 每次 `syncState` 都跑，
不受闸门影响）。

---

## 12. 验证结果

| 命令 | 结果 |
|---|---|
| `verify:map-tab-return`（新增） | **EXIT 0 — 7/7**（修复前 RED：4 FAILED / 2 passed） |
| `verify:cloud` | **EXIT 0 — 272/272** |
| `verify:map-photo-budget` | EXIT 0 — 8/8 |
| `verify:image-pipelines` | EXIT 0 — 12/12 |
| `verify:map-photo-recovery` | EXIT 0 |
| `verify:map-trace` | EXIT 0 — 17/17 |
| `verify:marker-apply` | EXIT 0 — 10/10 |
| `verify:marker-renderer-scheduler` | EXIT 0 — 17/17 |
| `verify:map-motion` | EXIT 0 — 24/24 |
| `verify:map-overlay-drawer` | EXIT 0 — 18/18 |
| `verify:map-drawer-motion` | EXIT 0 — 12/12 |
| `verify:map-empty` / `verify:map-viewport` / `verify:map-zoom-stepper` / `verify:map-save` / `verify:map-reveal-cadence` | 全部 EXIT 0 |
| `verify:memory-preview-sources` / `verify:map-preview-selection` | EXIT 0 |
| `verify:memory-return` | EXIT 0 — 13 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:ui` | EXIT 0 — 43/43 |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:sheet-edits` / `verify:media-gc` / `verify:profile-sync` / `verify:workspace` | EXIT 0 |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 0**（55 条顶层脚本，0 FAIL） |

### 唯一被改动的既有断言（**改口径，不是删掉**）

`tools/verify-cloud.cjs` 的 *late marker photo cannot overwrite …* 里原来有一句
`p.onHide();assert(disposed);` —— 它把「隐藏页不得接受迟到照片」这个**行为**钉在了
「`onHide` 必须 dispose 渲染器」这个**机制**上。本轮正是要改掉这个机制，所以断言改为：

- 保留并**加强**行为断言：隐藏后投递迟到照片，`markers[0].iconPath` 不得被改写；
- 新增终点断言：`p.onUnload(); assert(disposed)` —— 渲染器仍必须被释放，只是归属改为卸载。

**没有删除任何断言**，也没有放宽任何不变量。

---

## 13. 冻结 Map 检查点影响

**无影响，无需推进。**

- 本轮**没有**改任何 WXML/WXSS；冻结页哈希**逐一未变**：
  `pages/map/index.wxml` = `4522d59434badb2c…` ✅ · `pages/map/index.wxss` = `c13016f30f8e4b7e…` ✅
  （均等于 `tools/map-identity-review.json` 记录值）
- `verify-cloud.cjs`（哈希链所在套件）**EXIT 0 — 272/272**
- 改动只在 `pages/map/index.js`（JS）与 `utils/store.js`（数据层）⇒ 属 brief 明示的
  「JS-only lifecycle changes ⇒ 不推进 Map UI checkpoint」

---

## 14. 需要的真机证据

**本机仍然只有模拟器，没有物理设备。** 且本轮**运行时探针无法执行**：
DevTools 的 IDE 侧 automator 已脱离（`automation_*` 全部 `timeout waiting for automator response`，
而 `simulator_screenshot` / `open_project_window` 正常 ⇒ 按 skill 的诊断表是「automator 没挂到运行时」）。
尝试过 `simulator_refresh` 与 `cli open`（IDE server 已在 27946 重启）**均未恢复**；
按 skill 的规定**停止自救**。⇒ 本轮性能证据全部来自
**驱动真实页面 / 真实 store / 真实渲染器的确定性 harness**，**不是**模拟器实时观测。

### 请求 1：一段真机录屏（交互）

```
Map 完全加载 → 切到 Home → 切回 Map
```

要求画面能看出：**立即返回**、**无整页加载序列**、**中心/缩放保持在离开时的位置**、
**若曾选中则选中卡片仍在**。

### 请求 2：同一段录屏里接着做失效验证

```
Map → Add → 保存一条新记忆 → Map
```

要求：**新记忆出现**，且相机**没有**被重置。

### 请求 3（可选，恢复本地取证能力）

在 DevTools 里让**模拟器小程序重新挂上自动化**（重开项目窗口 / 触发一次「真机调试」再切回），
之后我可以补一次**模拟器实时**的 Map→Home→Map 观测作为交叉验证。

**在拿到真机录屏之前，不宣称 P0-2 已完全关闭。**

---

## 15. 本轮明确没做的事

- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未动 P0-1 的照片下载行为
- ❌ 未开始 Us、未开始 Me
- ❌ 未加全局 `mapCache`、未把整页状态写进 localStorage、未用 TTL 当正确性机制、
  未复制第二份 memories 事实来源、未做页面快照序列化
- ❌ 未改 Map 视觉层级 / WXML / WXSS / pin / 卡片 / 搜索 / 浮动控件 / POI UX
- ❌ 未在持久存储里放任何原生句柄 / 组件实例 / 事件对象

---

## 16. 最终建议

**READY FOR REAL-DEVICE CACHE CONFIRMATION**

根因已定位（`onHide` 销毁派生视图模型 + `onShow` 无条件重读产品数据 + 无变化云同步也会 commit），
修复落在 JS 与数据层、零视觉改动、冻结检查点零影响，全部既有验证保持绿色。
唯一未决项是 §14 的真机录屏（含 Add 失效验证），按 brief **到此停止**。
