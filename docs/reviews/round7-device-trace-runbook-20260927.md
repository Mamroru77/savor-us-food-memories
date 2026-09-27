# 真机 trace 收口操作手册（round7）

**状态**：生产代码**已冻结**，本轮**只做取证**，不再改任何生产代码。
**HEAD**：`8bf5a65473b1c2c537adfd74c6b4cba83044d80f`（**未 amend / 未 push / 未 deploy**）
round7 的修改**留在 working tree**（17 项未提交）。

---

## 0. 冻结清单（这份手册期间不得再改）

| 冻结项 | 文件 | 工作树 sha256（前 16） |
|---|---|---|
| profile-save 错误分类修复 | `miniprogram/utils/photos.js` | `e9e1e11d8d66a1b0` |
| avatar `MAX_EDGE=1024` downsample | `miniprogram/utils/avatar.js` | `01b8ec6b3c3ac962` |
| `photoTrace` / `auditMedia` 诊断能力 | `miniprogram/utils/photoTrace.js` | `4aa266fa530b0214` |
| 错误文案映射 | `miniprogram/components/profile-editor/index.js` | `202c030e3345a4e6` |
| Phase A 快照挂载 | `miniprogram/utils/mapMarkers.js` | `08cfa9ddbdc255bc` |
| Phase A 调用点 | `miniprogram/pages/map/index.js` | `ddef7401e929ef6f` |
| 新增套件 | `tools/verify-image-pipelines.cjs` | `33d326f59de3c623` |

**不动**：Map renderer、marker generation、zoom grouping、1600/1080 meal ladder、2MiB gate、
Card UI、storage GC、cloud schema。Map 的 `8bf5a65` 优化同样冻结。

> 如果某个哈希对不上，说明工作树被改过 —— 先停下告诉我，不要继续取证。

---

## 1. 开关 trace（**注意需要冷启动**）

### 打开

```js
wx.setStorageSync('savor:photoTrace', 'on')
```

⚠️ **必须重新启动小程序才生效。** 原因：`photoTrace.on()` 在**第一次被调用时**读一次 storage
并把结果缓存在内存里（`if (enabled === null)`）。所以只写 storage 而不重启，本次会话仍然读不到。

不想重启也可以用（**立即生效**，同时也会写 storage）：

```js
require('./utils/photoTrace').setEnabled(true)
```

### 关闭

```js
wx.removeStorageSync('savor:photoTrace')
```

⚠️ **同样需要重新启动才真正生效**（内存里的 `enabled` 已是 `true`）。
要**立即关闭**：

```js
require('./utils/photoTrace').setEnabled(false)
```

### 确认当前状态

```js
require('./utils/photoTrace').on()      // true = 正在记录
```

> 在哪里执行：**微信开发者工具的 Console**（真机调试模式下同样可用）。
> 相对路径 `require('./utils/…')` 以小程序根目录为基准，这是本仓库第三轮起就在用的方式。

### 零开销保证

trace 关闭时：`begin()` 直接返回 `0`，`record()` 直接 `return`，`memorySnapshot()` 直接 `return 0`，
`auditMedia()` 直接返回空结构。**没有任何正式 UI 元素**（`index.wxml` 里零引用）。

---

## 2. 场景 A：魏家凉皮

### 操作步骤

1. 打开 Map，选中**魏家凉皮**
2. 缩放到它**一直灰图**的那个比例
3. **停留 10 秒**
4. 再**轻微放大/缩小一次**

### 一次性打印（Console 里整段粘贴）

```js
const pt = require('./utils/photoTrace'), mt = require('./utils/mapTrace')
const mem = pt.snapshot().filter(r => r.phase === 'map-memory')
const ren = mt.snapshot().filter(r => r.selected === true)
console.log('=== A-1 memory semantics (selected) ===')
console.log(JSON.stringify(mem, null, 1))
console.log('=== A-2 renderer jobs for the selected memory ===')
console.log(JSON.stringify(ren, null, 1))
console.log('=== A-3 renderer summary ===')
console.log(JSON.stringify(mt.summary()))
```

把三段输出都发给我。

### 字段对照（你要的那张表从哪里来）

| 你要的字段 | 来源 | 说明 |
|---|---|---|
| `mapScale` | A-1 `.mapScale` | 取整 |
| `groupCount` | A-1 `.groupCount` | `1` = singleton / cluster root；`>1` = 簇 |
| `selected` | A-1 `.selected` | 恒 `true`（只记选中项） |
| `noPhoto` | A-1 `.noPhoto` | |
| `photo.exists` / `.kind` / `.isDefaultMeal` | A-1 `.photoExists` / `.photoKind` / `.isDefaultMeal` | `kind` = bundled / local / cloud / https / empty |
| `placePhoto.exists` / `.kind` | A-1 `.placePhotoExists` / `.placePhotoKind` | |
| `photoFor` | A-1 `.photoForKind` | `empty` = marker **没有**任何源 |
| `selectedPhotoSource` | A-1 `.selectedPhotoSource` | placePhoto / photo / defaultMeal / none |
| `renderer.requested` | A-2 是否存在记录 | 有记录 = 确实发起了渲染 |
| `renderer.ready` | A-2 是否出现 `stage:"export"` | 走到 export 才算 ready |
| `renderer.peekHit` | A-2 `applyResult:"ready-cache-rebound"` | ⚠️ 没有独立字段，这是**最接近的证据**；否则为 `false` |
| `renderer.fallback` | A-2 的 `reason` / `applyResult` | 见下 |
| `stage` | A-2 `.stage` | download / downsample / decode / compose / export（是**最后到达**的阶段） |
| `applyResult` | A-2 `.applyResult` | applied / stale-but-rebound / ready-cache-rebound / clustered / source-changed / superseded / disposed / gesture-deferred |
| 各阶段耗时 | A-2 `.downloadMs/.downsampleMs/.decodeMs/.composeMs/.exportMs/.totalMs` | |

**fallback 的判定**（任一成立即视为 fallback）：
- `reason` ∈ {`unsafe-source`, `download-failed`, `derivative-failed`, `decode-failed`, `compose-failed`}
- 或 `applyResult` ∈ {`clustered`, `source-changed`, `superseded`}
- 或 **A-2 完全为空**（根本没发起渲染）

> ⚠️ **字段缺失是有意义的，不是数据不全。** 记录只写「被记录过的」字段：
> - **`reason` 只在失败时出现**。一条成功走到 `export` 的记录**根本没有 `reason` 字段** ——
>   看到它缺席就说明这条**没有**失败原因。
> - 同理，`derivativeWidth/Height/Bytes` 只在真的走了 downsample 时才出现。
> - 所以：**先看 `stage` 到哪、`applyResult` 是什么，再用「某字段不存在」作为辅助证据。**

### 判定规则（**只能三选一**）

按顺序判断：

| 条件 | 结论 |
|---|---|
| `noPhoto === true` **且** `photoForKind === "empty"` **且** `placePhotoExists === false` | **A. RECORD_HAS_NO_REAL_PHOTO** |
| `groupCount > 1` 且该 memory 不是 cluster root（`applyResult === "clustered"`） | **C. CLUSTER_STATE_NOT_RENDERER_BUG** |
| `photoForKind` ∈ {`local`,`cloud`,`https`}（**有**真实源）但 `stage` 未到 `export`，或 `reason` 是 `*-failed` | **B. REAL_PHOTO_RENDER_FAILED** |

⚠️ 如果 A-1 里出现**多个不同的 `memoryIdHash`**，说明你中途换了选中项 —— 请只保留最后一个 hash 的记录重测。

---

## 3. 场景 B：那张一直上传失败的餐厅原图

### 铁律

必须用**同一张原始照片**，从 Add 页**重新选择原文件**。
**不要**截图后再选、**不要**微信转存、**不要**编辑后再选、**不要**压缩后再选。

### 操作步骤

1. Add 页 → 选择**那一张原图** → 保存一次
2. 等它走完（成功或失败）

### 打印

```js
const pt = require('./utils/photoTrace')
console.log(JSON.stringify(pt.snapshot().filter(r => r.phase === 'meal'), null, 1))
```

### 字段对照

| 你要的字段 | 来源 |
|---|---|
| `chooserMethod` | `.chooser` |
| `original.width/height/type/bytes` | `.originalWidth/.originalHeight/.originalFormat/.originalBytes` |
| `sizeType` | `.sizeType` |
| `persist.keepOriginal` | `.keepOriginal` |
| `persist.compressInvoked` | `.compressInvoked` |
| `persist.copyInvoked` / `copyResult` | `.copyAttempted` / `.copySucceeded` |
| `persist.readWriteFallback` | `.readWriteFallback` |
| `persist.durableBytes` | `.durableBytes` |
| `shrink original` | 第一档 `.rung === "original"` 的 `.rungBytes` |
| `shrink 1600` | `.rung === "1600"` 的 `.rungWidth/.rungHeight/.rungBytes` |
| `shrink 1080` | `.rung === "1080"` 的 `.rungWidth/.rungHeight/.rungBytes` |
| `upload.invoked/bytes/durationMs/result/safeCode` | `.uploadInvoked/.uploadBytes/.uploadMs/.uploadResult` + 失败时的 `.code` |

### FIRST_FAILING_STAGE（**只能从这七个里选**）

`choose` / `persist` / `decode` / `shrink1600` / `shrink1080` / `upload` / `cloud-response` / `none`

判定：取 trace 里**最后到达**的那个 `stage`，若它之后没有成功推进到 upload 的 `success`，
则该 stage 就是 first failing stage；`uploadResult` 给出具体 safe code
（`UPLOAD_TIMEOUT` / `UPLOAD_REJECTED` / 其它）。

---

## 4. 场景 C：Me 自定义头像

### 操作步骤

用一张**长边 3000px+** 的照片，然后：

1. 选择后确认**编辑面板立即显示头像**
2. 点击**保存**成功
3. 关闭「关于你」
4. **重新打开** → 头像仍在？
5. **退出 Me 再回来** → 头像仍在？

### 打印

```js
const pt = require('./utils/photoTrace')
console.log(JSON.stringify(pt.snapshot().filter(r => r.phase === 'avatar'), null, 1))
```

### 要求核对

- `original.width/height/bytes` → `.originalWidth/.originalHeight/.originalBytes`
- avatar derivative `width/height/bytes` → `.requestedWidth/.requestedHeight/.resultBytes`（resize 后）
  与 `.originalWidth/.originalHeight`（若未 resize，说明原图 ≤1024）
- **必须满足 `max(width,height) <= 1024`** → 检查 `.requestedWidth` / `.requestedHeight`，
  或未 resize 时 `.originalWidth/.originalHeight`
- `.resizeRequested` / `.compressInvoked` / `.upscaled`（`upscaled` 必须为 `false`）

### FIRST_FAILING_STAGE（**只能从这八个里选**）

`choose` / `downsample` / `persist` / `preview` / `profile-save` / `storage-write` / `reload` / `image-render`

并给出 safe code。第 4/5 步（重开、退出再回来）失败时属于 `reload` 或 `image-render`。

---

## 5. 本地媒体存储审计

```js
const store = require('./utils/store'), identity = require('./utils/identity')
const photos = require('./utils/photos'), pt = require('./utils/photoTrace')

// 组装「仍被业务引用」的本地文件集合
const s = store.get(), refs = []
const add = v => { if (typeof v === 'string' && v) refs.push(v) }
if (s.profile && s.profile.avatarAsset) add(s.profile.avatarAsset.localPath)
;(s.memories || []).forEach(m => { add(m.photo); add(m.placePhoto); (m.extraPhotos || []).forEach(add) })
;(s.outbox || []).forEach(op => { const m = op.memory; if (m) { add(m.photo); add(m.placePhoto); (m.extraPhotos || []).forEach(add) } })

pt.setEnabled(true)                                  // auditMedia 需要 trace 打开
const dir = photos.photosDir(identity.lease())
console.log('=== media audit ===')
console.log(JSON.stringify(pt.auditMedia(dir, refs), null, 1))
console.log('diaryJsonBytes =', JSON.stringify(s).length)
pt.setEnabled(false)
```

**输出只会是**：`photoDir.fileCount/totalBytes`、`largest10[].{extension,bytes}`、
`referenced.fileCount/totalBytes`、`unreferenced.fileCount/totalBytes`、`diaryJsonBytes`。

⚠️ **不含路径、不含文件名、不含 openid。**
⚠️ **本轮绝对不删除任何文件** —— `auditMedia` 是只读的，T12 已用真实磁盘 fixture 证明
「审计前后目录内容与文件字节完全不变」。

---

## 6. 最终报告模板（把 trace 输出发我，我按这个填）

```
# 魏家凉皮
noPhoto:
photoKind:
isDefaultMeal:
placePhoto:
failingScale:
groupCount:
photoFor:
rendererStage:
rootCause:            ← RECORD_HAS_NO_REAL_PHOTO | REAL_PHOTO_RENDER_FAILED | CLUSTER_STATE_NOT_RENDERER_BUG

# Meal original
original:
persisted:
1600:
1080:
uploadInvoked:
uploadBytes:
uploadDuration:
firstFailingStage:
safeCode:

# Avatar
original:
derivative:
preview:
save:
reopen:
firstFailingStage:
safeCode:

# Storage audit
photoDirBytes:
referencedBytes:
unreferencedBytes:
diaryJsonBytes:
draftJsonBytes:

# Shared root cause
Avatar 和 meal photo：SAME_ROOT_CAUSE | DIFFERENT_ROOT_CAUSES | INSUFFICIENT_EVIDENCE
证据：
```

---

## 7. 本轮不做的事

- ❌ 不 commit / 不 push / 不 deploy
- ❌ 不改任何生产代码（含 Map renderer / marker generation / zoom grouping / 1600-1080 ladder /
  2MiB gate / Card UI / storage GC / cloud schema）
- ❌ 不自动删除任何本地文件（media GC 等真机数据出来后再设计）
- ✅ 8bf5a65 保持不动；round7 修改继续留在 working tree

取证完成后由你决定：是否修魏家凉皮、是否需要 media GC、是否提交 avatar fixes、是否改 Card noPhoto UI。
