# MAP — P0-1：魏家凉皮 Map 照片根因轮

**日期**：2026-09-30
**基线**：`0de3e46`（工作树原本已不干净）。**未 commit / 未 push / 未 deploy。**
**结论**：根因已定位并修复在**共享私有照片下载边界**；Map 冻结页**零改动**、检查点**未推进**。
**建议**：**READY FOR REAL-DEVICE PHOTO CONFIRMATION**

---

## 1. 这条记录的特殊条件（Phase 4 的输入）

真机数据是从**开发者工具运行时**只读读出来的（16 条记录全量，不是猜测）：

| 字段 | 魏家凉皮 | 结论 |
|---|---|---|
| `id` / `cloudId` | `d69023ce45caa8b2c694affe1b0b4be4` | 正常 CloudBase `_id` |
| `restaurant` | `魏家凉皮` | — |
| `noPhoto` | **`false`**（boolean） | **这条记录有真实照片** |
| `photo` | `cloud://…/dining/u_033…/memory-1790281335752-7zv92r/0.jpg`（165 字符） | `data.isSafeImage === true`、`data.isCloudImage === true` |
| `placePhoto` | **`undefined`**（字段不存在） | 与 15 条同类记录一致 |
| `extraPhotos` | `[]` | 与多数记录一致 |
| `revision` / `date` | `5` / `2026-08-27` | 正常 |
| `keys` | 44 | 与对照记录**逐键相同** |
| `data.isMemory` | `true` | 通过当前记录契约 |

**字段级 diff 与对照记录（`越利春牛肉粉`，`c710cf1a…`，同样 `revision:5`）只差内容字段**
（`address` / `city` / `coordinates` / `date` / `diningTypes` / `locationName` / `neighborhood` /
`notes` / `photo` / `rating` / `restaurant` / `id` / `cloudId`）。**没有任何 schema / 类型 / 结构差异。**

### 唯一实质差异：`photo` 背后的字节

把 16 条记录的云照片**逐个真实下载**（只读，下完即 `unlink` 自己的临时副本）：

| 记录 | 字节 | 尺寸 | 传输耗时（本机实测） |
|---|---|---|---|
| **魏家凉皮** | **10 607 530 B（10.12 MiB）** | **4096 × 2304** JPEG | **4 025 ms / 14 650 ms（两次，随带宽波动）** |
| 玄松日本料理 | 1 301 493 B | 608 × 1080 | 1 047 ms |
| 越利春牛肉粉 | 255 799 B | 900 × 1600 | 920 ms |
| 其余 13 条 | 143 440 – 399 752 B | — | — |

分布：`[140,161,161,202,203,224,235,236,249,250,273,281,307,390,1271,10359] KB`。
**魏家凉皮是唯一一条超出当前上传契约的记录**，比中位数大 ~41×，比 2 MiB 上传门大 ~5×。

---

## 2. broken vs working 数据形状对照表

| FIELD | WORKING RECORD（越利春牛肉粉） | WEI JIA LIANG PI | DIFFERENCE | CAN THIS EXPLAIN FAILURE? |
|---|---|---|---|---|
| `id` | `c710cf1a0ed3ea56f17817ba5a597227` | `d69023ce45caa8b2c694affe1b0b4be4` | 只是不同 id | **否**（T7 已证同 payload 换 id 行为一致） |
| `cloudId` | 同上 | 同上 | — | 否 |
| `revision` | 5 | 5 | 无 | 否 |
| schema/version 字段 | 无（`keys=44`） | 无（`keys=44`） | 无 | 否 |
| `photos`（云端原始） | 1 条 cloud fileID | 1 条 cloud fileID | 无 | 否 |
| `photo` | cloud fileID（165 字符） | cloud fileID（165 字符） | **仅路径内的 attemptId 不同** | 否（类型/形状相同） |
| `placePhoto` | `undefined` | `undefined` | 无 | 否 |
| `mainPhoto`/`coverPhoto`/`image`/`imageUrl` | 不存在 | 不存在 | 无 | 否 |
| `extraPhotos` | `[]` | `[]` | 无 | 否 |
| legacy 字段 | 无 | 无 | 无 | 否 |
| 嵌套对象 vs 字符串 | 字符串 | 字符串 | 无 | 否 |
| 数组 vs 标量 | 标量 | 标量 | 无 | 否 |
| 空串 / null / undefined | 无 | 无 | 无 | 否 |
| import source / source metadata | `sourcePlatform:''` | `sourcePlatform:''` | 无 | 否 |
| 原图 / 压缩变体 | 只有 1 个对象 | 只有 1 个对象 | 无 | 否 |
| upload state | 无该字段 | 无该字段 | 无 | 否 |
| normalization 字段 | 无 | 无 | 无 | 否 |
| **`photo` 背后的字节** | **255 799 B / 900×1600** | **10 607 530 B / 4096×2304** | **41× 体积、4.4× 长边** | **是 —— 唯一可解释失败项** |

> ⚠️ **不要把这一条读成「旧记录存了不一样的字段」**。字段层面**完全一样**；
> 差别只在**同一个字段指向的对象有多大**。这是「旧数据早于当前的**上传体积契约**」，不是旧 schema。

---

## 3. 数据流逐边界追踪（Phase 3）

| # | 边界 | 输入 | 输出 | 类型/形状 | 转换 | 判定 |
|---|---|---|---|---|---|---|
| 1 | 云端记录 | `r.photos = ['cloud://…/0.jpg']` | 同 | `string[]` | — | ✅ |
| 2 | `cloudRecordToMemory` 归一化 | `r.photos` | `photo = images[0]`，`noPhoto=false` | `string` | `.filter(data.isSafeImage)` | ✅ 正确 |
| 3 | Map 可见集 `visibleMemories` | 归一化 memory | 入选（`locationUnknown=false`） | — | — | ✅ |
| 4 | 分组 `mapLayout.group` | — | `groupCount=1`（singleton） | — | — | ✅ |
| 5 | marker 源 `mapMarkers.photoFor` | memory | **该 cloud fileID** | `string` | `placePhoto \|\| (!noPhoto ? photo : '')` | ✅ 正确 |
| 6 | card 源 `pages/map/index.js` | memory | **同一 cloud fileID** | `string` | `placePhoto \|\| photo \|\| data.photos.meal` | ✅ 正确（非默认餐图） |
| 7 | **IMAGE LOAD（下载）** | cloud fileID | — | — | `cloudRecords.downloadMapPhoto` | ❌ **第一处错误转换** |
| 8 | 解码 / 合成 | 本地临时文件 | 合成 PNG | — | `info`→`shrink(384)`→`image()`→compose→export | ⏸ 从未到达（7 失败即 `download-failed`） |
| 9 | fallback | — | `landmark-normal-fallback.png`（灰） | — | `entry.resolve(entry.backup)` | ✅ 按设计工作 |

**第一处错误转换 = 第 7 步**：`utils/cloudRecords.js` 的 `downloadMapPhoto`。

---

## 4. 根因

`downloadMapPhoto` 用**固定 8 000 ms 的总时限**去限制一次传输：

```js
const timer=setTimeout(()=>{expired=true;reject(error('PHOTO_TIMEOUT','Photo preview timed out.'));},8000);
```

这个时限是**体积无关**的。它只有在「每条已存照片都满足当前上传契约」时才成立 ——
而那个契约（`MAX_CLOUD_PHOTO_BYTES = 2 MiB`、`UPLOAD_EDGE_LADDER = [1600,1080]`）**只对写入它之后的记录成立**。
魏家凉皮是写入该门之前的记录，其 `photo` 指向 **10.12 MiB / 4096×2304** 的原图。

⇒ 一次**健康**传输的时长是**记录自身的属性**，不是这个函数的属性。固定总时限因此会在
**对象还在到达的过程中**就把它判为失败 ⇒ `PHOTO_TIMEOUT` ⇒ `networkStage` 捕获后置
`entry.reason='download-failed'` ⇒ `entry.resolve(entry.backup)` ⇒ **marker 停在 bundled 灰色 fallback**。

**同一根因也决定了「为什么只有这一条」**：其余 15 条 140 KB–1.27 MB 的传输只需 0.9–1.7 s，
8 s 有 5–20× 余量；这一条只有 ~2× 余量（4 025 ms 最佳情况），一旦带宽被别的下载占用（16 条连跑）
就直接超时。**所以它在真机上表现为「偶发/一直灰」而不是「永久坏」——与真机报告一致。**

### 运行时复现（Phase 1，模拟器，非真机）

| 条件 | 结果 |
|---|---|
| 16 条记录**逐个**下载（修复前） | **15 成功 + 魏家凉皮 `PHOTO_TIMEOUT`** ← 缺陷复现 |
| 单独下载魏家凉皮（修复前） | 成功，4 025 ms（余量仅 2×） |
| 16 条记录**逐个**下载（修复后） | **16/16 成功，0 失败**（魏家凉皮 10 607 530 B） |

Phase 1 逐项回答：

- **哪个面失败**：**marker thumbnail**（已复现）。**selected-place card**：模拟器里正常渲染，**未复现为硬失败**（见 §13）。
- **DevTools 是否也失败**：**是**（上面的 16 条矩阵就是 DevTools 里跑的）。
- **是否只在首次加载失败**：**否**。renderer 在 fallback 时会 `cache.delete`，下一次显式 render 会重试；
  所以它是**带宽/时序竞争**，会时好时坏。
- **tab 重入是否改变结果**：会（重新 render 即重试）。修复后 Home→Map 重入仍正常。
- **`imageErrors` 是否被置位**：**否**（card 的 `binderror` 从未触发；`imageErrors` 恒 0 键）。
- **是否渲染 fallback**：**是**，`/images/markers/landmark-normal-fallback.png`。
- **底层 src 是否为空/非法/不可达**：**都不是**。cloud fileID 非空、合法（`isCloudImage`/`isSafeImage` 均 true）、
  可下载（给足时间即成功 10 607 530 B）。

---

## 5. 分类（Phase 4）

### **A. VALID LEGACY DATA**

- 这条记录**完全符合**它被写入时的产品路径（Add → 上传 → 云端保存），没有违反任何当时的契约。
- 它只是**早于**后来加入的**上传体积门**（2 MiB / 长边 1600）。
- 当前 App **必须保持向后兼容**：不能因为一条旧记录体积大就把它当作坏数据。
- **不是** MALFORMED（字段/类型/结构全部合法）、**不是** ASSET MISSING（对象存在且可下载）、
  **不是** VALID ALTERNATE SCHEMA（没有第二套 schema）、**不是** UNKNOWN（证据充分）。

---

## 6. 选定的修复边界与理由（Phase 5）

**选定：共享私有照片下载边界 —— `miniprogram/utils/cloudRecords.js` 的 `downloadMapPhoto`**
（brief 偏好顺序中的 #2「shared photo-source resolver」/ 数据工具层）。

理由：

1. **它才是实际出错的那一步。** 追踪表里 1–6 步输出全部正确，第 7 步失败。
2. **它已经是共享边界。** 两个「需要字节」的渲染方都走它：
   - marker：`utils/mapMarkers.js` → `networkStage` → `downloadMapPhoto`
   - 原生预览：`utils/nativePreviewSources.js` → `downloadMapPhoto`
   ⇒ 在更靠下的地方修会漏掉另一条链路。
3. **零视觉改动。** 不动 `pages/map/index.wxml` / `.wxss`，不动 renderer，不动分组、不动相机通道。
4. **修的是语义而不是常量。** 时限的存在意义是识别**死掉的**传输，不是给**活着的**传输封顶。
   把「固定总时限」换成「**进度静默窗口**」正是把这个语义改正；只把 8000 调大则是把同一个语义错误藏起来。

被否决的候选：

| 候选 | 为什么否决 |
|---|---|
| ① canonical record normalization（`cloudRecordToMemory`） | 记录**没有**任何可供归一化的体积信号；同步归一化里也不允许做网络/编码工作。它没有任何东西可改。 |
| ③ Map view-model normalization | 会在 Map 里复制一份下载边界，并让**预览链路继续坏**；且 card 的 src 不是本轮的失败点（未复现）。 |
| ④ shared image component | 失败发生在字节到达之前，不在渲染组件里。 |
| ⑤ page-specific visual fallback patch | 会把一次**活着的**传输伪装成失败，正是 brief 明令避免的。 |

### 修复内容

```js
const PHOTO_STALL_MS = 8000;   // 同一个 8 s 数字，语义从「总时限」变成「静默窗口」
```

- 每次 `onProgressUpdate` 报告**真实增加**的 `totalBytesWritten` 时**重置**窗口；
  重复上报同一个计数**不重置**（否则一条死传输会被自己的重复上报养着）。
- 窗口到期 ⇒ `settled=true; expired=true;` → **`task.abort()`** → reject `PHOTO_TIMEOUT`
  （错误码与文案**完全不变**）。
- 平台**没有** `onProgressUpdate` 时（无法区分「慢」与「死」）⇒ 保留**原来那个固定窗口**，
  行为**不弱于**修复前（T5 锁死）。
- 保持既有契约：非 cloud 源仍 `INVALID_PHOTO` 且不触网；`tempFilePath` 缺失仍 `INVALID_PHOTO`；
  lease 失败仍以 `STALE_IDENTITY` 逃逸并**丢弃**临时副本；成功路径仍由调用方持有临时文件。

### 为什么这不是「按名字特判」

- 代码里**没有**任何 `魏家凉皮` / 记录 id 分支（T8 断言 `cloudRecords.js` 不含该名字）。
- 行为只取决于 **payload 与进度**：T7 用**两个不同 fileID 承载同一个 legacy payload**，
  结果完全一致；`T8` 同时证明触发条件（2 MiB 门 / 1600-1080 阶梯）仍被冻结。
- 触发它的是**数据形状条件**（`photo` 指向的对象超出上传契约、传输时长因此超过固定窗口），
  不是记录身份。

### 上游依赖（已由官方文档与运行时双向确认）

- `wx.cloud.downloadFile` 在带任一回调时**返回 downloadTask**，`DownloadTask.onProgressUpdate`
  自基础库 1.4.0 起支持（官方文档）。本机运行时基础库 **3.17.3**，实测
  `taskKeys = ['onProgressUpdate','abort']`，且进度回调**在 ~1 s 内**就报出
  `totalBytesExpectedToWrite = 10 607 530`（即对象大小**提前可知**）。

---

## 7. 改动文件（Phase 8：只有一个修复）

| 文件 | 变化 |
|---|---|
| `miniprogram/utils/cloudRecords.js` | **+43 / −9**：`downloadMapPhoto` 由固定总时限改为进度感知的静默窗口 + `abort()`；新增常量 `PHOTO_STALL_MS = 8000` 与解释性注释。 |
| `package.json` | +3 / −1：新增 `verify:map-photo-budget` 脚本，并插入 `verify:all`。 |
| `tools/verify-map-photo-download-budget.cjs` | **新增**（回归套件，8 项）。 |

**没有**任何 `pages/**`、`components/**`、WXML、WXSS 改动。**没有** Map caching、没有 UI 重排、
没有 fallback 重新设计、没有 locale 改动、没有机会主义重构。

---

## 8. 新增回归测试（Phase 7）

`tools/verify-map-photo-download-budget.cjs`（8 项，已入 `verify:all`）。
**虚拟时钟**驱动，用**真实模块**（`cloudRecords` + `mapMarkers` + `data`）跑，只有
`identity`/`i18n`/`runtimeConfig` 是替身。

**测试描述的是 schema/契约差异，不是餐厅名**：payload 表按「旧契约 / 当前契约」命名，
并直接写入实测值 —— legacy `10 607 530 B / 4096×2304 / 14 650 ms`、
当前契约 `255 799 B / 900×1600 / 920 ms`，旧固定窗口 `8 000 ms`。

### RED 证据（`.workbuddy-ai/scratch/map-p01/red.txt`，修复前）

```
    payload 10607530 B, transfer 14650 ms, clock ran 14650 ms
FAIL T1 a Map marker composes for a legacy pre-gate cloud photo still arriving after the old window
  a legacy cloud photo must reach the marker, not the bundled fallback
    payload 255799 B, transfer 920 ms, clock ran 920 ms
PASS T2 a Map marker still composes for a current-contract cloud photo
FAIL T3 the private photo boundary does not fail a transfer that is still making progress
  Photo preview timed out.
FAIL T4 a stalled transfer still fails as PHOTO_TIMEOUT and is aborted
  a stalled transfer must be aborted, not merely ignored
    no-progress fallback rejected at 8000 ms
PASS T5 without a progress channel the previous fixed window is preserved
PASS T6 a non-cloud source is still rejected without any download
FAIL T7 the outcome follows the payload, not the record identifier
  Photo preview timed out.
PASS T8 the upload contract that makes the payload legacy is unchanged

4 FAILED, 4 passed
```

T1 就是 brief 要求的「special photo data → Map photo source invalid/missing/wrong，而 normal photo data → works」：
**T1（legacy）拿到 fallback，T2（当前契约）拿到合成照片。**

### GREEN 证据（`.workbuddy-ai/scratch/map-p01/green.txt`，修复后）

```
    payload 10607530 B, transfer 14650 ms, clock ran 14650 ms
PASS T1 a Map marker composes for a legacy pre-gate cloud photo still arriving after the old window
    payload 255799 B, transfer 920 ms, clock ran 920 ms
PASS T2 a Map marker still composes for a current-contract cloud photo
    resolved after 14650 ms of virtual time (10607530 B)
PASS T3 the private photo boundary does not fail a transfer that is still making progress
    stalled transfer rejected at 8228.90625 ms, aborts=1
PASS T4 a stalled transfer still fails as PHOTO_TIMEOUT and is aborted
    no-progress fallback rejected at 8000 ms
PASS T5 without a progress channel the previous fixed window is preserved
PASS T6 a non-cloud source is still rejected without any download
    two fileIDs, same payload -> same outcome (10607530 B)
PASS T7 the outcome follows the payload, not the record identifier
PASS T8 the upload contract that makes the payload legacy is unchanged
8/8 map photo download budget checks passed.
```

> T4 的 8 229 ms = 第一次进度上报（~229 ms）后静默 8 s ⇒ **死传输仍然在「约 8 s 无进展」时失败**，
> 且现在还会 `abort()`。T5 的 8 000 ms 证明**没有进度通道时窗口原样保留**。

**没有删/改写任何旧断言**；本轮只**新增**一个套件，既有 12 项 `verify:image-pipelines` 与全部
Map 套件原样通过。

---

## 9. 回归矩阵（Phase 9）

| # | 项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 魏家凉皮特殊记录 | **marker 正常渲染**（`sel=true`、80px、合成图标；截图见下） | 运行时探针 + 16/16 下载矩阵 + 截图 |
| 2 | 正常记录 A（Ameigo，3 成员簇） | 未变（簇根照常合成，`groupCount=3`） | 运行时 marker 列表 + `verify:ui` 43/43 |
| 3 | 正常记录 B（越利春牛肉粉） | 未变（255 799 B，合成图标） | 运行时 marker 列表 + T2 |
| 4 | selected-place card | **模拟器下正确**（照片渲染，`imageErrors` 0 键） | 页面 data + 截图 |
| 5 | marker thumbnail | 正确（含簇根与 singleton） | 13/13 marker 均有合成图标 |
| 6 | 图片加载失败 | 既有 fallback 仍工作 | T4；`verify:image-pipelines` 的 export/decode 失败恢复用例；`verify-cloud` 的 marker fallback 用例 |
| 7 | PEARL | 未变 | `verify:ui` 43/43、`verify:visual-language` 13 |
| 8 | DUSK | 未变 | `verify:ui` 43/43（含 dark 对比度用例） |
| 9 | POI ON/OFF | 未变 | Map 套件全绿；未触碰 `showNativePoi` |
| 10 | tab switch | **未引入新状态问题**（本轮**未做**任何 caching） | Home→Map 重入：选中项保留 `d69023ce`、marker 仍合成、`imageErrors` 0 |

---

## 10. 验证结果

| 命令 | 结果 |
|---|---|
| `verify:map-photo-budget`（新增） | **EXIT 0 — 8/8**（RED 4 FAILED → GREEN 8/8） |
| `verify:image-pipelines` | EXIT 0 — 12/12 |
| `verify:map-photo-recovery` | EXIT 0 |
| `verify:map-trace` | EXIT 0 — 17/17 |
| `verify:marker-apply` | EXIT 0 — 10/10 |
| `verify:marker-renderer-scheduler` | EXIT 0 — 17/17 |
| `verify:memory-preview-sources` | EXIT 0 — 10 |
| `verify:map-preview-selection` | EXIT 0 — 12 |
| `verify:media-gc` | EXIT 0 — 23/23 |
| `verify:ui` | EXIT 0 — 43/43 |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:icons` | EXIT 0 |
| `verify:package-budget` | EXIT 0 — 5/5 |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `verify:cloud` | **EXIT 0 — 272/272** |
| `npm run verify:all` | **EXIT 0**（54 条顶层脚本 / 53 个子套件，0 error） |

> `npm run verify` 的 358 项与更早记录里的 359 项不同，**与本轮无关**：把
> `cloudRecords.js` 临时还原成 `HEAD` 版本重跑，同样是 **358/358**（工作树自 v1.2.3 起本就不干净）。
>
> 本机 sync+piped-stdin 限制照旧用 `NODE_OPTIONS="--require <abs>/node-sync-stdin-shim.cjs"` 绕过，
> **没有改任何测试**。

---

## 11. 冻结 Map 检查点影响（FROZEN MAP RULE）

**无影响，无需推进，未改任何注册检查点。**

- 本次改动**只落在** `utils/cloudRecords.js`（不在任何 review 链、不在 `ui-approved-updates.json` 的键集合里）。
- 冻结页哈希**逐一未变**：
  - `pages/map/index.wxml` = `4522d59434badb2c…` = `tools/map-identity-review.json` 里记录的 `sha256` ✅
  - `pages/map/index.wxss` = `c13016f30f8e4b7e…` ✅
- `verify-cloud.cjs`（哈希链所在套件）**EXIT 0 — 272/272**。

**不需要**向用户申请「改冻结视觉文件」——因为**没有**任何 WXML/WXSS 需要改。

---

## 12. 真机证据状态

- 本机**仍然只有 DevTools 模拟器，没有物理设备**（`platform: devtools`，基础库 3.17.3，
  模拟机型 `iPhone 12/13 Pro Max`）。本轮**不把模拟器输出当硬件证据**。
- 模拟器截图（`.workbuddy-ai/scratch/map-p01/map-sim-fixed.png`，279×600）显示：
  选中魏家凉皮后，**原生 marker 上是合成后的菜品照片**、**卡片照片正常**、无破图。
- ⚠️ 模拟器截图**不是**真机截图；它只能证明「代码路径通了」，不能证明硬件上的清晰度/合成层行为。

### 需要的真机证据（**一张即可**）

> 在物理设备上打开 Map，选中「魏家凉皮」，**截一张图**，要求能同时看到：
> ①**地图上的 marker 缩略图** ②**底部 selected-place 卡片照片**。

判定标准：

- 两处都显示**真实菜品照片** ⇒ 本 P0 关闭。
- **marker 正常但卡片仍异常** ⇒ 转入下一条（见 §13），属**已批准的下一步**，不是本轮回归。

---

## 13. 尚未证实的部分（诚实声明）

- **selected-place card 的失败未被复现。** card 绑定的是**同一个**未加界的 cloud fileID，
  但它是原生 `<image>`，**没有应用侧时限**，所以本修复**不会**改变它的行为。模拟器里它正常渲染。
  ⇒ **卡片在真机上是否也坏，本地无法判定，必须由 §12 的那张截图回答。**
- 若截图显示卡片也坏，正确的下一处边界是 **Map view-model 绑定**（让卡片也经由一个共享的、
  有界来源解析器取图），那是**独立且需要批准的一步**——本轮按 brief 明确**不**做
  （会引入新的下载/缓存语义，属「Map caching」范围）。
- **未取到真机 console**：`get_simulator_console` 缓冲区为空，因此**不能**用它证明真机上没有报错。
- 本修复**不改变**「照片当初为什么以 10 MB 存进云」这件事：那是旧版本没有体积门的既成事实，
  已按 VALID LEGACY DATA 兼容处理；**没有**做任何数据迁移/重传（那需要单独批准）。

---

## 14. 本轮明确没做的事

- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未开始 Map caching
- ❌ 未动 Us、未动 Me、未重开 Map 视觉打磨
- ❌ 未改任何冻结页 WXML/WXSS、未推进任何检查点
- ❌ 未改 2 MiB 上传门 / 1600-1080 阶梯 / renderer / 分组 / 相机通道 / fallback 设计 / locale
- ❌ 未按记录名或记录 id 特判
- ❌ 未自动删除任何用户文件（探测期间下载的临时副本全部由探针自己 `unlink`）

---

## 15. 最终建议

**READY FOR REAL-DEVICE PHOTO CONFIRMATION**

marker thumbnail 的根因已定位、已修复、已用真实记录与真实模块双向复现与验证；
冻结 Map 检查点零影响；全部既有验证保持绿色。
唯一未决项是 §12 那张真机截图（特别是卡片那一半），按 brief **到此停止**。
