# 图片链路收尾：魏家凉皮灰 marker / Avatar 失败 / 餐厅原图上传失败

**日期**：2026-09-27
**基线**：`8bf5a65`（**未 amend / 未 rebase / 未回退 / 未 push / 未 deploy**）
**状态**：两处**可离线定位的缺陷已修**（B2 错误归因、B3 avatar 全尺寸持久化）+ 三处**设备取证基建已建好**。
⚠️ **A / C 的最终分类需要一次真机 trace 运行**——代码层面能证明的是**机制**，不是**你那台机器上的具体值**。

---

## 魏家凉皮

### 机制结论（离线可证）

代码里有**两套语义**，它们**故意不同**：

| | 表达式 | 位置 |
|---|---|---|
| Map card | `selected.placePhoto \|\| selected.photo \|\| data.photos.meal` | `pages/map/index.js:313` |
| Marker | `memory.placePhoto \|\| (!memory.noPhoto ? memory.photo : '') \|\| ''` | `utils/mapMarkers.js:31` |

而 `cloudRecords.cloudRecordToMemory` 在**没有云端图片**时写的是：

```js
photo: images[0] || data.photos.meal,   // ← 默认餐图
noPhoto: !images.length,                // ← true
```

⇒ **card 能显示图片 ≠ 这条 Memory 有真实可用于 marker 的照片。**
当 `noPhoto===true` 且 `photo===data.photos.meal` 时，card 显示默认餐图、marker **正确地**保持 fallback（灰）。

**这已经用测试锁死**（T7 / T9，`verify:image-pipelines`）：

```
T7  noPhoto=true + defaultMeal  ⇒ photoFor === ''      （card 仍显示默认餐图）
T9  card 与 marker 在 noPhoto 记录上必须分歧，在真实照片上必须一致
```

### 需要真机 trace 才能填的字段

Phase A 的取证已接好（`photoTrace.memorySnapshot`，默认关，零生产调用方）：

| 字段 | 状态 |
|---|---|
| `memoryIdHash` | 已记录（FNV-1a 8 位 hex，**不可逆**，不存原始 id） |
| `mapScale` / `groupCount` / `selected` | 已记录 |
| `noPhoto` | 已记录 |
| `photoExists` / `photoKind` / `isDefaultMeal` | 已记录 |
| `placePhotoExists` / `placePhotoKind` | 已记录 |
| `extraPhotos` | 已记录 |
| `photoForKind` | 已记录 |
| `selectedPhotoSource` | 已记录（`placePhoto` / `photo` / `defaultMeal` / `none`） |

**打开方式**（与既有 `mapTrace` 同一机制，存储 flag，无需改代码）：

```js
wx.setStorageSync('savor:photoTrace', 'on')   // 然后冷启动
```

### root cause：**待真机判定**，但只有两种可能

- **Case A**（`noPhoto===true`、无 `placePhoto`、`photo===data.photos.meal`）
  ⇒ **RECORD HAS NO REAL PHOTO**。灰 marker **不是 renderer bug**；真正问题是照片当初没上传成功，
  而 card 用默认餐图制造了「似乎有照片」的错觉。**A 与 C 合并解决。**
  → 按 brief 要求：**我没有强迫 marker 使用 stock default image**，也**没有未经批准改 card UI**。
- **Case B**（`noPhoto===false` 且 `photoFor` 是真实 safe image，但 marker 仍 fallback）
  ⇒ **MARKER BUG**，才继续追 download / downsample / decode / compose / export / ready / apply。
- **Case C**（`placePhoto` 存在但 marker fallback）⇒ 单独追 placePhoto source。

### 附带回答 brief 提出的那个问题

> Card 是否应该在 `noPhoto===true` 时继续显示 stock meal 图？

**现状是「会显示」，而且这正是这次误判的成因**：用户看到卡片有图 ⇒ 认为记录有照片 ⇒ 认为 marker 坏了。
是否要改属于 **UI 决策**，按 brief 要求**我没有动 card UI**，只把机制和证据摆出来供你裁决。

### zoom reproduction

`memorySnapshot` 在每次 `applyFilters` 时对**选中项**记录一条，包含 `mapScale`（取整）与 `groupCount`，
所以围绕失败 scale 连续缩放（13.7 / 13.9 / 14.0 / 14.1 / 14.3）会得到一串记录，
可以直接看出灰图出现时它是 **singleton / cluster root / cluster member**（`groupCount`），
以及 source 是否发生变化（`photoForKind` / `selectedPhotoSource` 逐条对比）。

---

## Avatar

### 找到并修掉的两个真实缺陷

**B2 — 错误归因（已修，T1/T2 覆盖）**

`components/profile-editor/index.js:335` 原来是：

```js
const reported = photos.logFailure(error, 'profile-save');
// category === 'identity' ? 身份文案 : 一律「保存失败，请清理存储空间后重试」
```

而 `utils/photos.js` 的 `failure()` 把 **`'profile-save'` 放进了 filesystem 阶段列表**：

```js
: ['mkdir','copy','read','write','stat','profile-save'].includes(stage) ? 'filesystem'
```

⇒ **任何** profile-save 异常都被判成 filesystem ⇒ 一律显示存储文案。
`store.updateProfile` 实际会抛的远不止存储问题：`IDENTITY_LOCKED` / `STALE_IDENTITY`（身份）、
`CACHE_CORRUPT` / `CACHE_MISSING` / `OUTBOX_IDENTITY_MISMATCH`（缓存）、`TypeError`（程序）。

**修法**：分类改由**错误自身**决定，而不是调用方起的阶段名。
`photos.profileSaveFailure()` 分四类 —— `identity` / `image` / `storage` / `unknown`，
**只有明确的 quota/filesystem 类**才用存储文案；`unknown` 用新的普通文案
「保存失败，请重试。」（已按既有 locale 流程加入 `tools/lib/locale-translations.tsv` 并 `build:locales`）。
native `errMsg` **只用于内部判定，绝不展示给用户**。

⚠️ 修的过程中发现一个必须记住的点：`chunkStorage.write()` 会把失败的 native 写入**包装**成
`CACHE_WRITE_FAILED` 并把原始错误挂在 **`error.cause`** 上。所以分类器**必须沿 `cause` 链向下找**
quota 信号，否则真实配额失败会被误判成 `unknown`。（这正是 T2 一开始失败的原因。）

**B3 — avatar 把全尺寸原图持久化（已修，T3/T4/T5 覆盖）**

`avatar.prepare` 走的是 `photos.persistPhoto(tempPath, false, owner)` →
`compressImage({quality:80})` **不传 compressedWidth/Height ⇒ 不降采样**。
这条「不降采样」是**餐厅照片的刻意不变量**，但对 avatar 是错的：
一张 4000×3000 的原图会被**整份复制**进 `savor-photos`。

**修法**（avatar-only，`MAX_EDGE = 1024`）：

```
original chooser result
  → getImageInfo 取真实尺寸
  → 长边 > 1024 才 compressImage(quality 80 + compressedWidth/Height)
  → 用 photos.persistDerivative() 做 durable copy（不再二次编码）
```

- **≤1024 绝不 upscale**（T4：800×600 → 仍是 800×600，且**不请求任何 resize**）
- **resize 失败明确报 `AVATAR_DOWNSAMPLE_FAILED`，绝不静默保存巨型原图**（T5）
- **餐厅照片完全不动**：meal 仍走 `keepOriginal` / `UPLOAD_EDGE_LADDER=[1600,1080]`（T10 锁死阶梯常量）
- 不覆盖用户原图、不上传原图；既有 cloud avatar 256px 逻辑保持

实测（T3）：`4000×3000 → 请求 1024×768`，durable 资产 **1024×768**。

### 需要真机 trace 才能填的字段

Phase B 取证已接好（`avatar` phase）：`stage` / `category` / `code`、
`originalWidth/Height/Bytes/Format`、`requestedWidth/Height`、`resultBytes`、
`resizeRequested` / `compressInvoked` / `upscaled` / `compressMs`。

| 你要的字段 | 状态 |
|---|---|
| original px / bytes | **待真机**（trace 已记录） |
| durable px / bytes | **待真机**（trace 已记录） |
| first failing stage | **待真机**（trace 已记录 stage+code+category） |
| actual category | **待真机**（trace 已记录 identity/image/filesystem/storage/unknown） |
| **storage copy 是否真实** | ⚠️ **很可能是「不真实」** —— 见下 |

⚠️ **关于「保存失败，请清理存储空间」这句话是否属实**：B2 的证据表明，
**在修之前这句话是没有依据的**（任何错误都会这么说）。所以「storage full」这个归因
**在旧代码里不可信**。修完之后，只有当 `setStorageSync` 真的以 quota 类错误失败时才会出现该文案；
届时 trace 会给出 `category=storage` 与 `code`，**那才是可信的存储失败**。

---

## Meal failing photo

Phase C 取证已接好（`meal` phase），字段：`chooser` / `sizeType` / `originalWidth/Height/Bytes/Format`、
`keepOriginal` / `copyAttempted` / `copySucceeded` / `readWriteFallback` / `durableBytes`、
逐档 `rung`（`1600` / `1080` / `reencode`）+ `rungWidth/Height/Bytes`、
`uploadInvoked` / `uploadBytes` / `uploadMs` / `uploadResult`。

| 你要的字段 | 状态 |
|---|---|
| original px / type / bytes | **待真机** |
| persist stage | **待真机** |
| shrink result | **待真机** |
| uploadInvoked | **待真机** |
| first failing stage / code | **待真机** |

**本轮没有改任何餐厅照片保真策略**（按 brief C4）：没有降 2MiB gate、没有改 1600/1080 阶梯、
没有删本地原图、没有全局改 1024、没有自动清照片目录。T10 反而把阶梯与 byte gate **锁成了常量**。

---

## Local media storage audit

`photoTrace.auditMedia(dir, referencedPaths)` —— **只读**，本轮**绝不自动删除 orphan**。

输出：`fileCount` / `totalBytes` / `referencedCount` / `referencedBytes` /
`unreferencedCount` / `unreferencedBytes` / `largest[10]`（**只有 bytes + 扩展名**）。

| 你要的字段 | 状态 |
|---|---|
| photo dir file count / total bytes | **待真机**（本机没有 `savor-photos` 目录） |
| referenced bytes | **待真机** |
| unreferenced bytes | **待真机** |

**引用集合的构成**（在真机上要喂给 `auditMedia`）：`profile.avatarAsset.localPath`、
`state.memories` 的 `photo` / `placePhoto` / `extraPhotos`、draft 的 photos/placePhoto、outbox 的 photo refs。

⚠️ 如果确实发现大量 orphan，**下一轮再设计安全 GC**（本轮只审计）。

**T12 证明了三件事**（用真实磁盘 fixture）：计数与 referenced/unreferenced 分类正确；
报告里**不含任何文件名或目录**；**审计前后目录内容与文件字节完全不变**（read-only 保证）。

### C3：两类 storage 必须分开测

| 系统 | 如何测 | 状态 |
|---|---|---|
| 1. `USER_DATA_PATH` 文件持久化 | `auditMedia()` 的 `totalBytes` | **待真机** |
| 2. `wx storage` / `identity.setStorageSync` 的 diary JSON | `JSON.stringify(state).length` | **待真机** |

⚠️ 这两者**不能混为一谈**：avatar 的失败如果发生在 `profile-save`，它属于 **2**；
如果发生在 `persistPhoto`/`copyIn`，才属于 **1**。B2 的修复正是为了让这个区分可见。

**T12 过程中发现并修掉一个真实 bug**：`auditMedia` 原来用 `/` 拼接子路径、用原始字符串比对引用集合，
在 Windows 分隔符下会把**每一个被引用的文件都误报成 orphan**。已改为两侧归一化后比对。

---

## Shared root cause

**判定：A / B / C 之间 —— 目前证据不支持「共享同一根因」，需要真机 trace 才能定论。**

用证据说话，而不是「都叫图片失败」：

| 候选共享点 | 是否已被证明共享 | 证据 |
|---|---|---|
| `photos.persistPhoto` | **部分**：avatar 与 meal 都经过它，但**路径不同** | avatar 走 `persistPhoto(temp,false)`；meal 走 `keepOriginal` + upload 阶段 `shrinkForUpload` |
| `USER_DATA_PATH` quota | **未证明** | 旧代码的 storage 文案**不可信**（B2）；真机 trace 会给 `category=storage` 才算证据 |
| `copyFile` / `read` / `write` 回退 | **未证明** | `copyIn` 有 readFile/writeFile 回退；trace 的 `readWriteFallback` 会告诉我们是否触发过 |
| 图片 decode / format | **未证明** | `imageInfo` 对未知格式抛 `IMAGE_FORMAT_UNSUPPORTED`；trace 记录 `originalFormat` |

**已知的、有证据的一条**：avatar 那条「存储空间」文案**在修之前与真实存储状况无关**（B2 的代码级证据）。
所以**不能**据此推断「头像失败与餐厅照片失败共享存储根因」—— 那正是 brief 警告的
「不要因为都叫图片失败就假定同一原因」。

真机 trace 之后，这张表就能填成 YES/NO。

---

## 测试

新增 `tools/verify-image-pipelines.cjs`（**12 项**，已入 `verify:all`，顶层命令 42 → **43**）。
**先 RED**：`3 FAILED, 7 passed`（证据 `.workbuddy-ai/scratch/map-perf/r7-image-red.txt`），
三条失败正是 brief 点名的缺陷：

```
FAIL T1 a non-filesystem profile-save failure never claims "free storage"
  got: Could not save. Free some storage and try again.
FAIL T3 a 4000x3000 avatar is persisted with a long edge <= 1024
  the durable avatar long edge must be <= 1024, got 4000x3000
FAIL T5 a failed avatar downsample never falls back to the giant original
  a failed resize must not persist a 4000x3000 avatar
```

brief 要求的 10 项全部覆盖：T1/T2（错误归因双向）、T3（4000×3000 → ≤1024）、T4（不 upscale）、
T5（downsample 失败不保存巨型原图）、T6（保存后重开仍在）、T7（noPhoto+defaultMeal ⇒ 空）、
T8（noPhoto=false ⇒ 真实 source）、T9（card/marker 语义差异被锁）、T10（meal stage 分类完整）；
另加 **T11**（Phase A 快照分类且零泄漏）、**T12**（C2 审计只读且不泄漏）。

### 改了哪些既有断言（**没有删断言消红**）

| 文件 | 原断言 | 现在 |
|---|---|---|
| `verify-avatar-persistence.cjs` | 用例名「keeps the original pixels」，断言 1600×1200 且**要求 `compressedWidth === undefined`**（即「禁止降采样」） | 改成「keeps real pixels **(bounded at 1024)**」：断言 1024×768、**恰好一次 resize**、resize 读的是**原图不是 132px 派生图**、请求帧 ≤1024。**原意图（绝不用 132px 派生图）保留并加强** |
| `verify-avatar-persistence.cjs` | 保存后 `avatarAsset` 为 1600×1200 | 1024×768 |
| `verify-sheet-edits.cjs` | `photos` double 只有 `isCancelled`/`logFailure` | 增加 `profileSaveFailure`，**委托给真实 `photos.js`**（避免 double 与实现漂移） |
| `verify-map-trace.cjs` / `verify-marker-apply.cjs` / `verify-marker-renderer-scheduler.cjs` | `mapMarkers` 的 require 白名单 | 增加 `./photoTrace`（真实模块） |

⚠️ 过程中踩到一次既有不变量：我最初把 `photoTrace` 挂到 **`mapTrace`** 上，
但仓库有一条测试 **「mapTrace has no dependencies」** —— 那是**刻意的设计约束**（保证它可被任何 harness 加载）。
已回退，改由 **`mapMarkers`**（本就 require `./mapTrace`）再导出，调用处用
`mapMarkers.photoTrace && …` 守卫，因此**页面没有新增任何 require**。

---

## 验证

| 命令 | 结果 |
|---|---|
| `verify:image-pipelines` | **12/12**（新增） |
| `verify:avatar` | 39/39 |
| `verify:sheet-edits` | 61/61 |
| `verify:cloud` | EXIT 0 |
| `verify` | **EXIT 0，359 项 ✓，FINAL STATIC VALIDATION: PASS** |
| `verify:all` | **EXIT 0**（43 条顶层命令，49 个子套件汇总，**0 EBUSY / 0 断言失败**） |
| Map targeted（overlay-drawer / drawer-motion / motion / viewport / marker-apply / marker-renderer-scheduler / map-trace / map-reveal-cadence / map-photo-recovery / map-empty / map-save / pending-pagination / map-search-clearance / map-overview-label / map-preview-selection / map-scale-echo / map-scale-race / r2） | 全部 EXIT 0 |

> 本机 sync+piped-stdin 限制仍在，用 `NODE_OPTIONS="--require <scratch>/node-sync-stdin-shim.cjs"` 绕过（不改任何测试）。

⚠️ 过程中**修掉一个我自己引入的回归**：`verify:all` 第一次跑成 EXIT 1，
原因是 `mapMarkers` 新增 `./photoTrace` 后，`verify-map-photo-recovery.cjs` 的 require 白名单没同步补
（报 `unexpected require ./photoTrace`）。已补上并重跑为 EXIT 0。

---

## 8bf5a65

**保持原 commit 不动。** `git log` 仍为 `8bf5a65` → `2dde1eb`；未 amend、未 rebase、未回退、未 push、未 deploy。
本轮改动**尚未 commit**（按 brief 未授权提交）。

## git diff --stat

```
 miniprogram/components/profile-editor/index.js | 10 +++-
 miniprogram/pages/map/index.js                 | 11 ++++
 miniprogram/utils/avatar.js                    | 71 +++++++++++++++++++++++++-
 miniprogram/utils/locales.js                   |  5 ++
 miniprogram/utils/mapMarkers.js                |  5 +-
 miniprogram/utils/photos.js                    | 40 +++++++++++++++
 package.json                                   |  3 +-
 tools/lib/locale-translations.tsv              |  1 +
 tools/verify-avatar-persistence.cjs            | 18 +++++--
 tools/verify-map-photo-recovery.cjs            |  2 +-
 tools/verify-map-trace.cjs                     |  2 +
 tools/verify-marker-apply.cjs                  |  1 +
 tools/verify-marker-renderer-scheduler.cjs     |  1 +
 tools/verify-sheet-edits.cjs                   | 18 ++++++-
 14 files changed, 176 insertions(+), 12 deletions(-)
```

新增未跟踪：`miniprogram/utils/photoTrace.js`、`tools/verify-image-pipelines.cjs`、
`docs/reviews/image-pipelines-round7-20260927.md`。

---

## 下一步（需要你在真机上做的两件事）

1. **打开 trace**：`wx.setStorageSync('savor:photoTrace', 'on')` 后冷启动。
2. 复现三个场景：选中「魏家凉皮」并围绕失败 zoom 连续缩放；走一次自定义头像；用**那一张原图**走一次餐厅照片上传。

然后 trace 快照就能把本文档里所有 **待真机** 的字段填满，从而判定：
魏家凉皮是 **RECORD HAS NO REAL PHOTO** 还是 **MARKER BUG**；头像的 first failing stage / category；
餐厅照片的 first failing stage / code；以及 **Shared root cause 是 YES 还是 NO**。

