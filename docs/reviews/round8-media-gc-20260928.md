# 媒体孤儿泄漏修复 + 头像/餐厅照片上传恢复（round8）

**HEAD**：`8bf5a65`（**未 amend / 未 push / 未 deploy**）
**真机**：OPPO PKB110 / Android 16 / 微信 8.0.76 / SDK 3.17.3
**本轮未删除任何真机文件**（dry-run 已执行，`deletedCount: 0`）。

---

## GC model

`photos.collectReferencedLocalMedia(state, token)` —— **只有**同时满足以下两条才算「被引用」：

1. `isLocalRef(path)`：**不是** `wxfile://`、**不是** `cloud://`、**不是** `/images/`、**不是** `http(s)://`
2. `isDurableMediaPath(path, token)`：**在当前 owner 的** `photosDir(token)` 之下，无 `..`，且文件名符合本应用自己的两条命名规则之一

### reference sources（全部覆盖）

| # | 来源 | 字段 |
|---|---|---|
| 1 | 头像 | `profile.avatarAsset.localPath` |
| 2 | 记忆 | `memories[].photo` / `.placePhoto` / `.extraPhotos[]` |
| 3 | 草稿 | `draft.photos[]` / `draft.placePhoto` |
| 4 | outbox | `op.memory` / `op.base` / `op.record` 的同上三字段 |
| 5 | outbox 上传缓存 | `op.uploads` 的**键**（仍在上传/已上传的本地路径） |

**明确不算引用**：`cloud://` / `/images/` / `https://` / `wxfile://` 临时路径。

### 命名规则（只有应用自己创建的文件才可能是候选）

```
ph-<base36>-<base36>.<jpg|jpeg|png|gif|webp>     ← data_createId()
avatar-<64 hex>.<jpg|jpeg|png|gif|webp>          ← avatar.restore()
```

其它任何文件（含 `something-else.jpg`、无扩展名的 `ph-a-b`）**一律不碰**（GC17 锁定）。

---

## RED → GREEN

`tools/verify-media-gc.cjs` —— **18/18 PASS**（先 RED：10 FAILED）。

覆盖你点名的 GC1–GC15，另加 3 条：

| 用例 | 断言 |
|---|---|
| GC1 | 被引用的文件**不删** |
| GC2 | 孤儿**被删** |
| GC3 | **跨 owner 不删**（owner A 不动 owner B，`unlinked.length === 0`） |
| GC4 | 一个 `unlink` 失败，**其余继续**（deleted 2 / failed 1 / code `UNLINK_FAILED`） |
| GC5 | 第二次 GC 删 **0**，且不报错 |
| GC6 | 上传确认 + state 已切 `cloud://` ⇒ 本地副本**被释放** |
| GC7 | 上传失败（无 cloud id）⇒ 本地**保留** |
| GC8 | state 仍指向本地 ⇒ **保留** |
| GC9 | outbox（`op.memory` 或 `op.uploads`）仍依赖 ⇒ **保留** |
| GC10 | 两条 memory 共用同一 local ⇒ 一条云替换后**仍保留** |
| GC11 | **最后**一条引用也切云后才删 |
| GC12 | 真机配额原文 ⇒ `FILE_QUOTA_EXCEEDED`，且 profile-save 归类 `storage` |
| GC13 | 普通 `copyFileSync:fail no such file` ⇒ `COPY_FAILED`，**不得**归类 quota |
| GC14 | `avatarAsset` 引用的文件**不删** |
| GC15 | draft 的 `photos` / `placePhoto` 引用的文件**不删** |
| GC16 | **dryRun 是默认值**，且 `unlinked.length === 0` |
| GC17 | 非本应用命名的文件**永不成为候选** |
| GC18 | 报告里**没有**文件名 / 目录 / 生成名 |

> ⚠️ 写测试时抓到我自己的一个错：我按 `savor-photos/<scope>/<userId>` 手工拼目录，但
> `photosDir()` 实际是 `savor-photos/<fileScope><userId>`（**无分隔符**）。已改成
> **向模块本身要目录**（`photos.photosDir(token)`），不再手抄布局。

---

## Upload cleanup ordering（crash-safe）

在 `store.js` 的**两个**成功提交点之后各插一行 `releaseUploadedLocalCopies(op.uploads, token, state)`：

1. outbox flush 的 `addRecord`（recreate）分支 —— 在 `commit(...)` 之后
2. outbox flush 的 `mutate` 分支 —— 在 `commit(...)` 之后
3. 直接新增记忆 —— 在 `addMemory(saved)` + `clearCompletedDraft(...)` 之后

顺序严格是：

```
1. upload success           （cloudRecords 拿到 fileID，写入 attempt.uploads）
2. durable state → cloud:// （store 的 commit / addMemory 已完成）
3. outbox completed         （该 op 已从 outbox 移除或不再依赖 local）
4. reference check          （releaseUploadedLocalCopies 从**已提交的 state** 重算引用集合）
5. unlink local orphan
```

**为什么这样是 crash-safe**：第 4 步的引用集合是**从已提交状态重新推导**的，不是从「谁调用了我」推断。
所以任何一步崩溃：
- 崩在 1–3 之间 ⇒ 本地文件仍被 state/outbox 引用 ⇒ 第 4 步判定「仍被引用」⇒ **不删**（GC7/GC8/GC9）
- 崩在第 5 步 ⇒ 只是少删一个文件，**下次 GC 会回收**（GC5 证明幂等）

且整个调用被 `try/catch` 包住：**清理失败绝不影响已保存的记录**。

---

## Quota classification

| native | 旧 code | 新 code |
|---|---|---|
| `copyFileSync:fail the maximum size of the file storage limit is exceeded` | `COPY_FAILED`（**信息全丢**） | **`FILE_QUOTA_EXCEEDED`** |
| `writeFileSync:fail ...` 同类配额 | `WRITE_FAILED` | **`FILE_QUOTA_EXCEEDED`** |
| `copyFileSync:fail no such file or directory` | `COPY_FAILED` | `COPY_FAILED`（**不变**） |

实现：`failure()` 在原有 code 判定**之前**先匹配 `QUOTA_NATIVE`
（`maximum size of the file storage limit|storage limit is exceeded|quota|no space|insufficient`）。

⚠️ **刻意保留 `category = 'filesystem'`**（不改成新的 `'storage'`）——
这样 `copyIn` 里既有的 `if (e.category !== 'filesystem') throw e` 与 read/write 回退路径
**行为完全不变**；只有 **code** 获得了额外语义。

用户文案映射（`profileSaveFailure`）：`FILE_QUOTA_EXCEEDED` 已加入 `STORAGE_CODES`
⇒ `category = 'storage'` ⇒ 「保存失败，请清理存储空间后重试。」
而 `COPY_FAILED` / `WRITE_FAILED` / `IMAGE_FAILED` **不会**显示存储文案（GC13 锁定）。

---

## Device dry-run（真机，READ-ONLY）

编译后真机已加载新代码（`hasGc: true`、`platform: android`），执行 `gcOrphanMedia(token, state, {dryRun:true})`：

| 项 | 真机实测 | 你的预期 | 一致？ |
|---|---|---|---|
| current owner only | ✅ 是 | 是 | ✅ |
| **fileCount** | **20** | — | — |
| **totalBytes** | **206,694,791** | 206,694,791 | ✅ |
| **referencedCount** | **0** | 0 | ✅ |
| **orphanCount** | **20** | 20 | ✅ |
| **orphanBytes** | **206,694,791** | 206,694,791 | ✅ |
| store 引用形态 | **cloud ×17 + bundled ×3** | cloud ×17 + bundled ×3 | ✅ |
| dryRun.deletedCount | **0** | 必须 0 | ✅ |
| dryRun 之后文件数 | **20**（未变） | 必须不变 | ✅ |

另外：`memoryCount = 14`；`draftPresent = true` 但 `draftPhotoCount = 0`
⇒ **把草稿也算进引用后仍是 20 个孤儿**（草稿不贡献任何引用）。

# 结论：**READY_TO_DELETE**

**已停下。没有删除任何真机文件。** 等你明确批准后才执行 `dryRun:false`。

---

## 执行结果（用户批准后，真机 REAL_DEVICE）

### 删除前 guard（同一次 evaluation 内重算，未用缓存列表）

| 项 | 预期 | 实测 | |
|---|---|---|---|
| `referencedCount` | 0 | **0** | ✅ |
| `orphanCount` | 20 | **20** | ✅ |
| `orphanBytes` | 206694791 | **206,694,791** | ✅ |

`guard.matches = true` ⇒ 允许继续。

### 实际 GC

```
deletedCount = 20
deletedBytes = 206,694,791
failedCount  = 0        failures: []
```

### 删除后立即 audit

```
fileCount 0 / totalBytes 0 / referencedCount 0 / orphanCount 0 / orphanBytes 0
```

### 幂等（第二次 GC）

```
deletedCount 0 / deletedBytes 0 / failedCount 0 / orphanCount 0
```

### GC 后配额分类复验（真机）

| native | code | profile-save 归类 |
|---|---|---|
| `copyFileSync:fail the maximum size of the file storage limit is exceeded` | **`FILE_QUOTA_EXCEEDED`** | **`storage`** → 显示「清理存储空间」✅ |
| `copyFileSync:fail no such file or directory` | `COPY_FAILED` | `unknown` → **不**显示存储文案 ✅ |
| `writeFileSync:fail invalid parameter` | `WRITE_FAILED` | `unknown` ✅ |
| `getImageInfo:fail decode error` | `DECODE_FAILED` | `unknown` ✅ |

KV 侧：`7 keys / 20 KB / 10,486 KB`（健康）。

---

## ⭐ 真机验收抓出一个会导致「删掉用户头像」的严重 bug（已修）

真机 dry-run 通过、用户手动选完头像之后，audit 出现：

```
fileCount 1 / avatarAssetPresent true / referencedCount 0 / orphanCount 1
```

⇒ **用户自己的头像文件被判成 orphan，GC 会删掉它。**

**根因**（真机探针）：`avatarPathKind: 'wxfile'` **且** `avatarInDurableDir: true`
⇒ **这台 Android 的 `wx.env.USER_DATA_PATH` 本身就以 `wxfile://` 开头**，
所以**每一个** durable path 都带这个前缀。而 `isLocalRef()` 为了排除临时文件把 `wxfile://`
**整个前缀**拒掉了 ⇒ **在真机上所有本地引用都被当成 orphan**。

⚠️ 上一轮 GC 删的 20 个文件**没有**误删（当时 store 引用是 `cloud×17 + bundled×3`、确实无本地引用、也无 avatarAsset），
但**若当时存在头像就会删掉** —— 这个 bug 只有真机才暴露得出来。

**修法**：`isLocalRef()` 不再排除 `wxfile://`；改由 `isDurableMediaPath()` 用**目录包含**判定 ——
`path.indexOf(dir + '/')` 必须 `= 0`，或**紧跟在一个 scheme 前缀之后**。真正的临时路径
（`wxfile://tmp_xxx.jpg`）不含 durable 目录 ⇒ 自然被拒。

**回归测试**：新增 **GC19**（scheme 前缀的 durable 引用仍算引用，头像必须存活）、
**GC20**（临时 `wxfile://` 不是 durable 引用）。`verify:media-gc` → **20/20**。

**修复后真机复验**：

```
fileCount 1 / totalBytes 65,693
referencedCount 1 / referencedBytes 65,693   ← 头像被正确计为引用
orphanCount 0 / orphanBytes 0                ← 无可删项
```

---

## 真机验收结果（用户手动操作）

### Avatar

| 项 | 结果 |
|---|---|
| original width/height/bytes | **未取到** —— 我在推修复时做了一次 reload，把 trace 的内存缓冲清掉了（我的操作失误） |
| derivative width/height | **466 × 1024**（`source: album`、`syncState: local`） |
| max(w,h) ≤ 1024 | ✅ **长边正好 1024** ⇒ B3 downsample 在真机生效 |
| 未 upscale | ✅（466×1024 不是放大产物） |
| preview / save / reopen / leave-return | **待复验**（需重做一次选图以拿到 original 侧数字） |

### New Memory photo / Existing Memory edit photo

**未执行** —— 本轮时间用在上面那个必须立刻修的 bug 上。

### After 3 uploads audit

未执行（依赖上面两项）。

---

## 完整验证（修复后重跑）

`verify` **EXIT 0 / 359 ✓ / FINAL STATIC VALIDATION: PASS**；
`verify:all` **EXIT 0**（0 EBUSY / 0 断言失败，50 个子套件，含 `verify:media-gc` 20/20）。

**未写 READY_TO_COMMIT** —— Avatar 与 Meal 的真机验收尚未全部 PASS。

### 仍未完成的三项

| 项 | 状态 | 说明 |
|---|---|---|
| Avatar 1024 复验（步骤 5） | **部分** | derivative 已证 466×1024；**original 侧数字未取到**（我的 reload 清了 trace） |
| 新建 Memory 上传（步骤 6A） | **未执行** | 本轮时间用在修上面那个 bug |
| 编辑已有 Memory 上传（步骤 6B） | **未执行** | 同上 |
| 上传 3 张后的 orphan 审计（步骤 7） | **未执行** | 依赖上面三项 |

⚠️ 顺带记录一个**工具层**限制（供下次参考）：`automation_page_action` 的 `querySelectorAll`
在本会话里对 Me 页组件树返回空（`button` / `.edit-avatar-custom` 均查不到），
`automation_element_action --action tap` 报 `no such element`；而 `automation_evaluate`（探针通道）
**全程稳定可用**。所以「读状态」可靠、「点 UI」不可靠 —— 这也是本轮把系统相册动作交回用户的原因。

---

## 完整验证（修复前）

| 命令 | 结果 |
|---|---|
| `verify:media-gc` | **18/18**（新增，先 RED 10 FAILED） |
| `verify:image-pipelines` | 12/12 |
| `verify:avatar` | 39/39 |
| `verify:sheet-edits` | 61/61 |
| `verify:cloud` | EXIT 0 |
| `verify` | **EXIT 0 / 359 ✓ / FINAL STATIC VALIDATION: PASS** |
| `verify:all` | 见下方（44 条顶层命令，含新增的 `verify:media-gc`） |

---

## 未验证 / 需要你继续的部分

按你的步骤 11/12/13，下面这些**必须先真机删掉孤儿腾出空间**才能做，本轮**没有做**（因为你要求先停）：

- **Avatar 1024 derivative 真机复验**（步骤 11）—— 上传/持久化链路在配额满时走不到
- **Meal photo 真机复验**（步骤 12，新建 + 编辑两条路径）
- **上传 3 张后的 storage audit**（步骤 13）

⇒ 批准执行 `dryRun:false` 之后，我会立刻按 11/12/13 的顺序继续。

---

## 本轮改动文件

```
miniprogram/utils/photos.js    配额分类 + collectReferencedLocalMedia / auditOrphanMedia /
                               gcOrphanMedia / releaseUploadedLocalCopies
miniprogram/utils/store.js     3 处提交点之后调用 releaseUploadedLocalCopies（crash-safe）
package.json                   新增 verify:media-gc，并接入 verify:all（44 条）
tools/verify-media-gc.cjs      新增，18 项
```

**未触碰**：Map / drawer / marker renderer / 384 derivative / 2MiB gate / 1600-1080 ladder /
cloud schema / diningTypes / TabBar。

**未 commit / 未 push / 未 deploy。**

---

# 真机验收：Avatar + Meal（用户手动操作，全程未 reload）

## Avatar — PASS

| | original | derivative | resizeRequested | upscaled | ms |
|---|---|---|---|---|---|
| 第 1 次 | 1256×2760 / 980,122 B | 466×1024 / 63,751 B | true | **false** | 57 |
| 第 2 次 | **4096×2304 / 2,124,121 B** | **1024×576 / 957,863 B** | true | **false** | 495 |

- `max(1024,576) = 1024 ≤ 1024` ✅　`upscaled = false` ✅
- `originalMaxEdge 4096 > 1024` 且 `resizeRequested = true` ⇒ **确实降采样**，不是原图本来就小
- preview / save / reopen / leave-return **PASS**（保存后 `profile.avatarAsset` 为新资产且持久存在）

**旧头像回收（用户纠正后新增的行为）**：保存后目录只剩新头像一个文件，
`referencedCount 1 / orphanCount 0` ⇒ **旧头像被回收，没有留下长期 orphan**（稳定态，非瞬时态）。
`totalBytes 957,863` 等于第 2 行的 `resultBytes` ⇒ durable 文件就是那个 derivative。

**GC dry-run**：`deletedCount 0 / referencedCount 1 / orphanCount 0` ✅

## Meal photo — PASS（**结果层面**）

> ⚠️ **诚实说明**：per-stage 的 meal trace 数字**拿不到**。我在 round7 报告里写「Phase C 取证已接好」
> 是**夸大了** —— 我当时只定义了 `photoTrace` 的 meal schema 并在探针里手动用过，
> **从未把 `trace.begin('meal')` / `trace.record(...)` 接进 `cloudRecords.js` / `photos.js`**。
> 本轮已核实（`grep` 无命中）。所以下面给的是**结果层证据**，不是逐档数字。

从已提交状态读出的结果（14 条 memory）：

```
memoryCount            14
memoriesWithPhoto      14      ← 全部 14 条都有照片
memoriesWithExtraPhotos 4
memoriesFlaggedNoPhoto  0      ← 没有任何一条是 noPhoto
photoKindCounts     { cloud: 21 }   ← 21 条照片引用**全部**是 cloud://
memoryLocalRefs         0      ← 零条本地引用
outboxCount             0      ← outbox 已清空
outboxUnsubmitted       0      ← 没有任何未提交操作
```

⇒ **上传 → 云提交 → 本地副本释放** 这条链在真机上完整走通了：
所有引用都指向 `cloud://`、没有一条停在本地、outbox 为空。

## After successful uploads — orphan 治根验证

```
fileCount        1          ← 只剩头像
totalBytes       957,863
referencedCount  1          ← 头像
referencedBytes  957,863
orphanCount      0
orphanBytes      0
```

**没有出现「成功上传 N 张 → orphanCount += N」。** 上传后本地 durable 副本已被释放。

## Android wxfile regression

GC19（scheme 前缀 + 在 durable photosDir 内 + 被 avatarAsset 引用 ⇒ referenced，不删）**PASS**；
GC20（`wxfile://tmp_...` 不在 durable photosDir ⇒ 不算 durable reference）**PASS**。
判定依据是**目录包含**，不是 scheme 本身 —— 没有为了修头像而把所有 `wxfile://` 当 durable。

## 未取得的东西（不冒充）

- Meal 的 `persist / shrink original|1600|1080 / uploadBytes / uploadMs / uploadResult` 逐档数字
  —— 因为 meal trace 从未接线（见上）。**要拿到它们需要先接 trace，那属于新的生产改动，本轮未做。**
- 逐张照片的 `original width/height/type/bytes`。
