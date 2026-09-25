# 大图上传超时 + 地图选点填充餐厅名（2026-09-25）

范围：两个独立的小问题，不做同步系统重构、不改视觉风格、不处理其它技术债。
基线：checkpoint commit `8c2a427`（`fix: keep a locally edited memory when its cloud copy was deleted`）。
**状态：已实现并验证，未 commit / 未 push / 未 deploy。**

---

## A. 大尺寸餐食照片上传容易超时

### 症状

用户从手机相册选择较大照片 → 保存回忆 → 云端图片上传 → 超时。

### 第一层根因：大图被排除在压缩之外（实测）

| 位置 | 事实 |
|---|---|
| `miniprogram/utils/photos.js`（原第 104 行） | `const original = file.sizeType === 'original' \|\| file.size > 2*1024*1024;` |
| 同文件 `persistPhoto` | `if (keepOriginal) { return await copyIn(tempPath, token); }` ⇒ **完全不压缩**，原样拷进 `USER_DATA_PATH` |
| 同文件 `persistPhoto` | 只有 `keepOriginal === false` 才走 `compressImage` |
| `miniprogram/utils/cloudRecords.js:115` | `wx.cloud.uploadFile({filePath})` 与 20s `UPLOAD_TIMEOUT` 竞速 |
| `miniprogram/utils/cloudRecords.js:123` | 超时 → `UPLOAD_FAILED`「Photo upload timed out. Try smaller photos.」 |

⇒ **照片越大越会被强制走「不压缩」分支**，上传的是原图体积 ⇒ 必然更容易撞 20s。
`size > 2MB ⇒ original=true` 的意图像是「已经这么大说明是原图，就别再压了」，效果恰好相反。

附带发现：`pick()` 的 `chooseImage` 分支把结果**硬编码** `sizeType:'original'` 且丢弃了
`chooseImage` 本就提供的 `tempFiles[].size` ⇒ Android 多选每一张都永不压缩。

### 第二层根因：普通压缩不降采样（这才是超时未被解决的真正原因）

`miniprogram/utils/photos.js:166` 的普通压缩只有：

```js
compressed = await callApi(wx, 'compressImage', {src: tempPath, quality: 80}, 'compress');
```

**不传 `compressedWidth` / `compressedHeight`** ⇒ 只做 JPEG 重编码、**不降采样**。
8000×6000 的照片压完仍是 8000×6000，体积依旧多 MB。

本仓库另外两处**早就用了正确的降采样写法**，只有餐食照片这条路径漏了：

| 位置 | 写法 |
|---|---|
| `miniprogram/utils/avatar.js:77-78` | `compressedWidth/Height: Math.max(1, Math.round(asset.width*scale))` |
| `miniprogram/utils/sharedMedia.js:24` | `wx.compressImage({src:filePath, quality:50, compressedWidth:width})` |
| `miniprogram/utils/photos.js:166` | **只有 `quality:80`** |

⇒ **只修第一层，等于让大图「进入」一条本身很弱的压缩路径**，超时并未真正解决。

### 修复：降采样放在**上传阶段**，且判定用**真实 bytes**

`persistPhoto` 的判定**保持原样**（本地副本保留原字节，`photos.js` 未改动），
缩放在 `cloudRecords.js` 的上传步骤完成 —— 那里才知道上传预算。

**只限制像素尺寸是不够的**：一张高画质 / 高噪声的照片可以在中等分辨率下就有好几 MB；
而且 `compressImage` 失败时若回退上传原始超大图，超时会原样复现。所以预算按**字节**算：

```js
const MAX_CLOUD_PHOTO_BYTES = 2 * 1024 * 1024;
const UPLOAD_EDGE_LADDER = [1600, 1080];
function localBytes(path) {                    // 读不到就返回 null，不猜
  try {
    const stat = wx.getFileSystemManager().statSync(path);
    return stat && Number.isFinite(stat.size) && stat.size > 0 ? stat.size : null;
  } catch (e) { return null; }
}
async function shrinkForUpload(path, token) {
  identity.assertLease(token);
  const original = localBytes(path);
  if (original !== null && original <= MAX_CLOUD_PHOTO_BYTES) return path;   // 只有「证明放得下」才原样上传
  let info = null;
  try { info = await new Promise((resolve, reject) => wx.getImageInfo({src: path, success: resolve, fail: reject})); }
  catch (e) { info = null; }
  const width = info && info.width > 0 ? info.width : 0;
  const height = info && info.height > 0 ? info.height : 0;
  const rungs = width && height ? UPLOAD_EDGE_LADDER : [null];   // 读不到画幅时只做一次纯重编码
  for (const edge of rungs) {
    identity.assertLease(token);
    const options = {src: path, quality: 80};
    if (edge !== null) {
      const scale = Math.min(1, edge / Math.max(width, height));
      options.compressedWidth = Math.max(1, Math.round(width * scale));
      options.compressedHeight = Math.max(1, Math.round(height * scale));
    }
    let shrunk;
    try { shrunk = await new Promise((resolve, reject) => wx.compressImage(Object.assign({success: resolve, fail: reject}, options))); }
    catch (e) { identity.assertLease(token); continue; }        // 失败就试下一档，不回退超大原图
    identity.assertLease(token);
    if (!shrunk || !data.isSafeImage(shrunk.tempFilePath)) continue;
    const bytes = localBytes(shrunk.tempFilePath);              // 结果必须重新量过
    if (bytes !== null && bytes <= MAX_CLOUD_PHOTO_BYTES) return shrunk.tempFilePath;
  }
  throw error('UPLOAD_FAILED', 'This photo is too large to upload. Choose a smaller photo and try again.');
}
```

语义：
- **原图只有在被证明 ≤ 2MB 时才直接上传**；尺寸未知 / 字节未知 / 超预算 ⇒ 一律走缩放。
- 缩放结果**重新量字节**；仍超预算就换更小的长边再试（阶梯 1600 → 1080）。
- **阶梯用尽 ⇒ 抛出 `UPLOAD_FAILED`，绝不把超大文件送进 upload**，也不静默丢照片。
  用户看到的是可操作的文案，而不是 20s 卡死后的超时。

调用点在 `uploadPhotos` 的循环里，**刻意放在 upload 的 `try` 之外**：

```js
const filePath = await shrinkForUpload(path, token);
try {
  const uploaded = await Promise.race([
    wx.cloud.uploadFile({ cloudPath: ..., filePath: filePath }),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('UPLOAD_TIMEOUT')), 20000))
  ]);
```

理由：`try` 的 catch 会把任何错误归类成 `UPLOAD_FAILED`。把缩放放在外面，
**租约失效会如实报 `STALE_IDENTITY`，而不会被误报成上传失败**。

幂等性不受影响：`attempt.uploads[path]` 仍以**原始路径**为键，重试复用已上传的 fileID，不会重复缩放。

### 被补全的测试 mock（非断言改动）

`tools/verify-identity-runtime.cjs` 的 `wx` mock 原本是 `getFileSystemManager:()=>({})`（**空对象**），
且没有 `compressImage` / `getImageInfo` —— 旧代码不碰这些，所以从未暴露。
本次改动引入了这些调用，该套件的 `identity change during upload cannot submit or clear A draft`
因此失败。**只补全 mock 能力（`statSync` 返回 1024 字节 + 两个原生方法），未改动任何断言。**

（另有 3 个套件含同样的空 mock：`verify-audit-repairs.cjs`、`verify-identity-diagnosis.cjs`、
`verify-profile-sync.cjs`。`verify:all` 全绿说明它们未走到照片上传路径，本次未动。）

### 明确记录：被否决的做法（不要重犯）

修复过程中曾走过两条弯路，均被用户否决，**不要再尝试**：

1. **在 `persistPhoto` 里改判定规则**（让大图进入压缩路径）。
   ⇒ 与 `tools/verify-avatar-persistence.cjs` 的既有断言
   「`large original PNG remains PNG and skips needless compression`」直接冲突。
2. **改写那条旧断言让它变绿**（曾以选项征得同意后执行）。
   ⇒ 用户明确否决：**不许通过删除/改写旧断言来消红**。已完全还原
   （`verify-avatar-persistence.cjs` 与 `photos.js` 的 worktree blob 均等于 index blob）。

此外，在 `persistPhoto` 里无条件加降采样**也不可行**：`persistPhoto` 是共用函数，
头像路径（`avatar.js prepare`）与餐食照片路径走同一压缩分支，而
`verify-avatar-persistence.cjs:116-124` 断言
**「Re-encoding is allowed; downscaling is not. persistPhoto must not request a smaller frame.」**
（`for(const call of r.compressCalls) assert.equal(call.compressedWidth, undefined);`）。

### RED → GREEN

新增 5 项测试（`tools/verify-cloud.cjs`，直接驱动真实的 `cloudRecords.uploadPhotos`，
不创建云端记录以免影响既有行数断言；用可控的假文件系统按路径给出字节数）：

| 场景 | 修复前 |
|---|---|
| 1200×900 但 **3MB**（像素在限内、字节超预算）⇒ 仍必须缩放 | **FAIL**（旧代码只看像素，直接上传 3MB） |
| 第一次缩放结果 3MB（仍超预算）⇒ 必须换更小的长边重试 | **FAIL**（旧代码只试一次就上传） |
| 5MB 且 `compressImage` 失败 ⇒ **必须拒绝，一个字节都不许进 upload** | **FAIL**（旧代码回退上传 5MB 原图） |
| 原图字节数读不到 ⇒ 必须缩放而不是默认它放得下 | PASS（守卫，新语义下仍需成立） |
| 原图 1MB ⇒ 不重复编码，原样上传 | **FAIL**（旧代码因 4000×3000 而多压了一次） |

修复后 `verify:cloud` **252/252**；修复前 248/252（仅这 4 项失败，无连带破坏）。

---

## B. 餐厅名称为空时，地图选点自动用 POI 名称填充

### 现状

`miniprogram/utils/locations.js:29` 的 `choose()` **已经**返回 `locationName: r.name || ''`（腾讯地图 POI 名），
但 `miniprogram/pages/add/index.js` 的 `onChooseRestaurantLocation()` 只做
`this.changeDraft('location', pick)`，**从不写 `draft.restaurant`** ⇒ 这条路径此前不存在。

### 陷阱（修复时必须避开）

`changeDraft('restaurant', …)` 会 `delete draft.location`（设计如此：改餐厅名即作废旧选点），
**并连带删除 `diningTypes` / `sourceCategory` / `categorySource` 等导入派生字段**。

⇒ 直接拿它做自动填充会：(a) 清掉刚选中的定位；(b) **抹掉用户已经选好的餐饮类型**。
仅靠调整调用顺序无法解决（两种顺序各丢一半）。

### 修复（最小改动，2 处）

1. `changeDraft(key, value, options)` 新增可选第三参，只在 `restaurant` 分支生效：

```js
if (key === 'restaurant' && !(options && options.keepRelated)) { delete draft.location; ... }
```

2. 调用处**先填名字、再设定位**：

```js
if (!this.data.draft.restaurant.trim() && pick.locationName) this.changeDraft('restaurant', pick.locationName, {keepRelated: true});
this.changeDraft('location', pick);
```

第三参可选 ⇒ 既有全部 2 参调用语义不变（`onRestaurant` / `onRestaurantClear` 的失效行为完全保留）。

### RED → GREEN

| 场景 | 修复前 |
|---|---|
| 空餐厅名 + 选点 ⇒ 用 POI 名填充，且定位保留 | **FAIL** |
| 用户已输入名字 ⇒ 不被覆盖 | PASS（守卫） |
| 用户已选餐饮类型 ⇒ 自动填充后不被清除 | **FAIL** |

修复后全 PASS。

---

## 验证（全部 fresh run）

`verify:all` **EXIT 0**，日志 0 条 FAIL/Error：

| 套件 | 结果 |
|---|---|
| `npm run verify` | 355/355 |
| `npm run verify:cloud` | 252/252 |
| `npm run verify:avatar` | **39/39**（**未改动任何既有断言**） |
| `npm run verify:sheet-edits` | 61 |
| `npm run verify:identity` | 11 + 全部 runtime 检查通过（仅补全 mock） |
| spaces / media | 26/26 · 30/30 |
| 包体积 | 1.48 MB（门禁 1.5 MB） |

本轮 diff（相对 checkpoint `8c2a427`）：

```
 miniprogram/pages/add/index.js    |  12 ++++-
 miniprogram/utils/cloudRecords.js |  51 +++++++++++++++++-
 tools/verify-cloud.cjs            | 111 ++++++++++++++++++++++++++++++++++++++
 tools/verify-identity-runtime.cjs |   2 +-
 4 files changed, 172 insertions(+), 4 deletions(-)
```

注意 `miniprogram/utils/photos.js` 与 `tools/verify-avatar-persistence.cjs` **都不在 diff 内**。

---

## 提交前静态审计（2026-09-25）

### 1. no-upscale 审计 —— PASS，未改生产代码

`cloudRecords.js` 的 `const scale = Math.min(1, edge / Math.max(width, height));`
已保证「小于当前档位的原图**绝不会被放大**」：

| 原图 | 1600 档 | 1080 档 |
|---|---|---|
| 1200×900（横，3MiB） | `scale = min(1, 1.333) = 1` ⇒ **保持 1200×900**，只降编码体积 | `scale = 0.9` ⇒ 1080×810 |
| 900×1200（竖，3MiB） | `scale = min(1, 1.333) = 1` ⇒ **保持 900×1200** | `scale = 0.9` ⇒ 810×1080 |

补 2 条回归测试（横 / 竖各一），断言
`compressedWidth <= originalWidth && compressedHeight <= originalHeight`，
并逐档断言实际尺寸（`[1200,900] → [1080,810]`、`[900,1200] → [810,1080]`）。

**敏感性对照**：临时去掉 `Math.min(1, …)` 后，两条测试分别以
`1600×1200` 与 `1200×1600` 精确失败；还原后 `cloudRecords.js` 的 blob 回到 `66db15f8…`，
**与对照前完全一致 ⇒ 生产代码未被改变。**

### 2. i18n 审计 —— 新补（走仓库管线，未硬编码中文）

- `tools/lib/locale-translations.tsv` 追加 1 行（制表符分隔；`git diff --numstat` = `1  0`）：

```
This photo is too large to upload. Choose a smaller photo and try again.	照片过大，无法上传。请选择较小的照片后重试。
```

- `npm run build:locales` ⇒ `miniprogram/utils/locales.js` 新增 key `s31b6222625`，catalog 524 → 525。
- 双向验证：`zh-CN` → 中文；`en` → 英文原句；`entry.en` 未被误改成中文。
- **未刷新任何 approval 基线**：实测 `locales.js` 不在哈希强制范围内
  （`verify-cloud.cjs:635` 的 catalog 测试只校验 key 唯一 + 每条 `en`/`zh` 非空 + WXML 的 `copy.s*` 可查到）。

### 3. git 状态

- `git diff --check` → exit 0，无输出。
- `git status --short` → 6 个已修改 + 1 个新增评审文档。
- `git fsck --full` → exit 2，但**可达性分析**结论：
  **HEAD 当前快照 96 棵 tree 全在（0 缺失）；index 引用的 599 个 blob 全在（0 缺失）；
  487 个未修改的已跟踪文件与 index 逐字节一致（0 漂移）。**
  唯一的 `missing blob 4bb69238` **只属于祖先提交 `cf2dfc2` 的 tree `b297f277`**，
  **不被 HEAD 当前 tree、也不被 index 引用**，且可按需从远端懒取（`git cat-file -t` 成功）
  ⇒ 属 `blob:none` 部分克隆的正常状态，**不是丢失**。
  其余为 6 行 `invalid reflog entry 8bb92bf8…`（既有旧 amend 残留）+ 2 个 dangling 对象，均为噪音。

> 审计脚本自我更正：首版用 `git status --porcelain` 的整段 `.trim()` 再 `slice(3)`，
> 而 porcelain **首行以空格开头**，导致首行（`miniprogram/pages/add/index.js`）路径被切错，
> 报出「1 个文件与 index 不一致」的**假阳性**。按行解析后为 0。

---

## 未证明的风险

1. **未做真机 / 开发者工具验收。** 全部是 Node mock 契约测试。
   真机上 `wx.getImageInfo` / `wx.compressImage` 的真实压缩率与耗时、
   以及它对上传耗时的真实改善幅度**均未测量**。
2. **`2MB` / 长边 `1600`→`1080` / `quality 80` 都是我选的参数，不是实测得出。**
   依据仅来自仓库内既有写法（`sharedMedia` 用 1280/800、`avatar` 用 256）与产品约束 `MAX_CLOUD_PHOTO_BYTES`。
3. **缩放后仍放不下时会硬失败。** 这是刻意的（不许超大文件进 upload），
   但对「拍了一张极难压缩的照片」的用户来说，体验从「慢但可能成功」变成「明确失败」。
   真实世界里这个比例有多大，未评估。
4. **`compressImage` 会把 PNG 转成 JPEG。** 上传副本可能丢失透明通道。
   本地副本不受影响（仍保留原字节），但**云端存的是转换后的副本**。
5. **`localBytes` 依赖 `wx.getFileSystemManager().statSync`。**
   若某设备上它对本地照片持续失败，原图会被判为「字节未知」⇒ 走缩放 ⇒
   若缩放结果也读不到字节 ⇒ 阶梯用尽 ⇒ 保存硬失败。`statSync` 在真机上的可用性未验证。
6. **Android 多选路径的信息丢失未修。** `pick()` 的 `chooseImage` 分支仍硬编码
   `sizeType:'original'` 并丢弃 `tempFiles[].size`。当前设计下这不影响上传体积
   （判定已完全移到上传阶段并按字节计算），但会让**本地**副本偏大。
   属于已知未修项。
7. **新增的英文文案未进 TSV。** 与相邻的两条上传文案
   （`Photo upload timed out…` / `Photo upload failed…`，后者已在 TSV）不一致 ——
   属既有缺口，本次未扩范围。
8. **Task B 只在「餐厅名为空」时填充。** POI 名与用户已输入的名字不一致时不提示；
   选点后改名会清掉定位（既有设计），本次未改。
