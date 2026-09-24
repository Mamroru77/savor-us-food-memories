# Add Photo Native-Return Fix

长期维护文档 · 日期：2026-09-24
范围：`miniprogram/utils/photos.js` + `miniprogram/pages/add/index.js`
来源：本仓库 2026-09-23 的 Add 照片 native-return 阶段性原稿（TDD RED → 最小修复 → GREEN）；该原稿已移入本地归档，未纳入版本库。

> 本文只写原始报告与真机证据实际支持的结论。

---

## Symptom

**用户可见**：Add 页面**无法上传图片**。选完相册 / 相机照片后回到页面，
照片不出现、进度条不复位，**没有任何错误提示** —— 表现为「这个功能坏了」，
但用户拿不到任何可行动的信息。

**真机日志**（稳定复现）：

```
AVATAR_COMPRESS_SKIPPED reason=ORIGINAL_KEPT
[avatar] identity STALE_IDENTITY
```

（`[avatar]` 是 `photos.js` 的共用日志前缀，调用方是 Add → `photos.choosePhotos()`；
它**不是**头像链路的问题。）

RED 阶段在仓库 harness 内复现出**逐字相同**的日志，证明
「resume too early → `STALE_IDENTITY`」这一因果链成立。

---

## Root cause

`identity.resumeNative(token)` 只在**调用瞬间 flight 已存在**时才等待：

```js
async function resumeNative(token) { if (flight) await flight; const next = lease(); ... }
```

真机顺序下，**chooser 回调先于 `App.onShow` 到达**：

1. `photos.pick()` 在回调后**立刻** `resumeNative(token)` → 此刻无 flight
   → 立即返回**复验前**的 lease；
2. `persistPhoto()` 随即开始（`ensureDir` → `compressImage` → `getImageInfo` → `copyFile`）；
3. `App.onShow` → `identity.verify()` → `epoch++` / `current=null`；
4. 持久化链路上任意后续 `assertOwner(token)` → `token.generation !== epoch`
   → **`STALE_IDENTITY`**；
5. `choosePhotos` 以 identity 错误 reject，Add 的 catch 走 `!identity.isCurrent(token)`
   的**静默分支** → `uploading=false`、无草稿写入、**照片丢失且无任何提示**。

**第二条泄漏路径**：`pick()` 之后的第二处 `resumeNative`（Add 的 `.then` 里）被
`catch(e){}` 吞掉。当 owner 在 300 ms 交接窗口内发生变化时，它会拿旧 token 把
**上一个 owner 的照片路径写进新 owner 的草稿**。

**为什么 caller-level 的等待不够**：chooser 回调落在 `photos.choosePhotos()`
**内部**，`pickPhotos()` 在 `choosePhotos` 返回前拿不到控制权，而那时持久化
**已经开始（或已经失败）**。因此等待必须放在 `choosePhotos` 内部 ——
即「chooser 回调之后、`resumeNative` 之前」，与 Add 已有的 native-return
visibility contract（import 的地点 chooser 那套 `_nativeImportShow` / serial）**同一个位置**。

**为什么用「页面重新可见」作为判据**：`identity.verify()` 由 `App.onShow` 触发，
而 `App.onShow` 只在系统 chooser 使小程序退到后台（页面收到 `onHide`、`active=false`）后
才发生。因此「页面从 hidden 回到 active」**必然晚于** `App.onShow` 已经调用 `verify()`
（`flight` 已**同步**建立），此时 `resumeNative` 会 await 该 flight。
若回调到达时页面始终没有隐藏，则 `App.onShow` 也不会发生，旧 lease 依然有效
—— **两种顺序都安全**。

---

## Correct lifecycle contract

```
native picker（相册 / 相机 = 独立系统 UI）
→ 等待页面 / native 可见性回归
→ identity resume（此时 flight 已建立）
→ same-owner verification
→ persistence
```

落地形态：

- `photos.choosePhotos(count, opts, onProgress)` 第 2 参数新增**可选**可见性闸门
  （旧式 `choosePhotos(count, cb)` 调用语义**不变**）；
- 闸门必须落在 `pick()` 内 —— **「chooser 回调之后、`resumeNative` 之前」**：

```js
if (waitVisible) await waitVisible();
try { token = await identity.resumeNative(token); } catch (e) { throw failure('identity', e); }
```

- 每条 native operation 各自持有 **page-instance waiter + request serial**
  （照片用 `_nativePhotoShow` / `nativePhotoSerial`；import 用 `_nativeImportShow` /
  `nativeImportSerial`）；**不要**用 `nativeFlow` 全局单例
  （`begin()` 会 cancel 前一个 flow）。

**结果分类（必须严格区分）**：

| 情形 | 行为 |
| --- | --- |
| same owner 复验后完成 | **accept**，照片恰好加入 1 次 |
| different owner 复验 | **discard**，不得有任何本地写（不落盘、不写草稿） |
| close / unload 后迟到结果 | **discard** |
| 第二次请求 | **newer wins**，旧结果被丢弃且不报错 |
| 取消选择 | **不改动 draft**、`uploading` 复位、**不弹错误提示** |

---

## Why not fix identity

本次**没有**做以下任何一项：

- 放宽 `assertLease`；
- 捕获 `STALE_IDENTITY` 后忽略；
- 失败后 retry 到新的 owner；
- 修改 `identity.verify` / `lease` / `resumeNative` 的语义。

理由：`STALE_IDENTITY` 是**正确**的 fail-closed 保护，问题在于**调用时机**
（在拿到复验后 lease 之前就开始持久化），而不是保护本身。修复位于
**caller / native-return timing**，因此 identity 层逐字未动。

**同时明确未修（本次边界外，同类竞态仍在）**：

- `miniprogram/pages/space/index.js` 的 `addMedia()`：`await photos.choosePhotos(1)`
  之后才 `await identity.resumeNative(...)` —— 同一类竞态（选择阶段 resume 过早），
  但失败会走到 Space 的错误文案而非静默丢图；它不传 `waitVisible`，
  新闸门对它是 no-op，行为与修复前完全一致。
- `miniprogram/utils/avatar.js` 的 `chooseForCloud()`（仅 workspace 使用）：
  `wx.chooseMedia` 回调后立刻 `resumeNative(owner)`，同类模式。

Me 头像链路用的是 `nativeFlow` 的 suspend/show 可见性契约，**与本次不是同一机制**，
不要混用（见 `./avatar-final-rca-and-fix.md`）。

---

## Device acceptance

**Real-device acceptance: PASS (project-owner verified)** —— Add A–E 由项目所有者在真机上
**实际执行并确认**通过。

**证据来源区分**：这**不是**某一份独立 trace artifact 的结论 ——
本仓库该阶段的原始原稿只把 A–E 列为真机复测步骤，**未回填逐项设备日志**；
因此本文把它标记为「**项目所有者验收**」，与「设备日志证据」（如 2026-09-23 阶段性原稿
中 RED 阶段那条逐字一致的 `[avatar] identity STALE_IDENTITY` 日志）**分开陈述**，不互相冒充。

下表为所有者验收覆盖的场景与判定标准：

| # | 场景 | 期望 |
| --- | --- | --- |
| A | Add → 相册原图 | 照片出现、草稿照片数 +1、无 `STALE_IDENTITY`、进度条复位 |
| B | Add → 相机 | 同 A（`sourceType` 含 camera，走同一 `pick()` 路径） |
| C | Add → 取消 | `uploading` 立刻复位、草稿不变、不弹错误 |
| D | Add → 连续两次选择 | 只保留最新一次结果；旧结果不重复加入；期间复验则旧结果被丢弃且无报错 |
| E | picker 期间 background / foreground | 切回后照片正常加入；无 `STALE_IDENTITY`；不卡在「上传中」 |

判定标准：A–E 全程 `[avatar] identity STALE_IDENTITY` 出现次数 = **0**，
且每次选择**恰好**产生 1 张照片。

**回归点**：`Add → Import`（地点 chooser）的取消 / 成功仍按原契约工作
（与照片 waiter 互不干扰）；`Me → 编辑资料 → 头像` 仍能选图并在 Save 后生效。

---

## Regression

| 命令 | 结果 |
| --- | --- |
| `npm run verify:add-native-return` | **18/18 PASS**（11 条 import native-return + 7 条 photo native-return） |
| `npm run verify:avatar` | EXIT 0 |
| `npm run verify:identity` | 24/24 PASS |
| `npm run verify:all` | EXIT 0（0 FAIL） |
| `npm run verify` | EXIT 0，`355/355`，`FINAL STATIC VALIDATION: PASS` |

**RED 清单（修复前 6 条红，既有 11 条 import 检查全绿）**：

1. picker 回调在 App 复验前**不得**进入持久化 → 实测已进入；
2. 同 owner 复验后恢复持久化、照片恰好加 1 次 → 实测 0 次；
3. 异 owner 复验 → 丢弃、不得有本地写 → 实测 `copy=1`；
4. 已交给页面的选择不得写入异 owner 草稿 → 实测 `draftWrites=1`；
5. 取消 → uploading=false、草稿不变、无错误 → 修复前后皆 PASS（回归保护）；
6. unload 后迟到结果被丢弃 → 实测 `draftWrites=1`；
7. 更新的请求压制旧的 in-flight 结果 → 实测 `draftWrites=1`。

**harness**：在既有 `tools/verify-add-native-return.cjs` 内新增 `photoHarness()`，
**只模拟 native 层**（chooser / `compressImage` / `getImageInfo` /
`FileSystemManager` / cloud transport），其余全部是**生产模块**（真实 `pages/add/index.js`、
真实 `utils/photos.js`、真实 `utils/identity.js` 含 `identityPartitions` + `chunkStorage`、
真实 `utils/store.js`）⇒ RED/GREEN 反映的是**生产代码语义**，不是 fixture 的语义。

**行为变化（有意，1 处）**：`pickPhotos` 成功路径删除旧的
`if (that.disposed) { store.saveDraft(...) }` 兜底 —— 页面 unload 后迟到的选择
不再写入草稿（原来会写整份 draft 快照 + 照片）。这更安全（unload 后的草稿快照
可能覆盖更新的草稿），且已确认无任何既有测试依赖该兜底。

**已知的窄边界（fail-closed）**：若在页面隐藏期间**并发**发起第二次照片请求，
第二次会覆盖 `_nativePhotoShow`；第一次的 `waitVisible` 因 serial 不匹配立即放行，
它可能再次撞上复验而失败 —— 但 serial 守卫保证它**绝不会**写入草稿，
且第二次请求会正常完成。结果安全，只是第一次的选择被丢弃。

---

## Final commit

```
e39c2ee  fix: resume Add photo picker after identity verification
```

文件：

- `miniprogram/utils/photos.js` —— `pick(method, count, token, waitVisible)` 的可见性闸门；
  `choosePhotos(count, opts, onProgress)` 的可选第 2 参数（旧式回调仍接受）；
  同时承载本轮已审核的**诊断埋点清理**（一个文件无法按 commit 拆分）；
- `miniprogram/pages/add/index.js` —— page-instance waiter + request serial 接线；
- `tools/verify-add-native-return.cjs` —— 18 条检查。

未证明的风险（保持记录）：

1. `App.onShow` 先于 `Page.onShow` 是本修复的时序前提（也是既有 import 契约的前提）。
   若某平台顺序相反，闸门会立即放行，此时仍依赖 `resumeNative` await 已建立的 flight；
   **未在反序设备上验证**。
2. 真机上 `wx.chooseMedia` 成功回调与 `Page.onShow` 的先后未在设备日志中逐帧取证。
3. 未覆盖：真机大图（> 2 MB）走 original 分支、9 张上限边界、弱网下复验失败的 UI 文案。
4. Space / Workspace 的同模式竞态未修、未做真机复现。
