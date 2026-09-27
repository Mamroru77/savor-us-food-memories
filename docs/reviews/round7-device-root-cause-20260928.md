# 真机诊断结论：根因已定位（REAL_DEVICE）

**设备**：`platform=android` / **OPPO PKB110** / Android 16 / 微信 8.0.76 / SDK 3.17.3 / 359×789 @3.5x
**时间**：2026-09-28 00:30–00:45　**HEAD**：`8bf5a65`（未 amend / 未 push / 未 deploy）
**本轮未改任何生产代码**；7 个冻结文件哈希与开工时逐字节一致。

---

## ⭐ 根因（一条，同时解释全部三个症状）

**本机 `USER_DATA_PATH` 文件存储已被 20 张孤儿照片占满 197 MB，WeChat 文件存储配额被击穿。**

真机返回的原始错误（已脱敏，`<url>` 为真实路径占位）：

```
copyFileSync:fail the maximum size of the file storage limit is exceeded
```

**`the maximum size of the file storage limit is exceeded`** —— 这是**明确的文件存储配额错误**，
不是权限、不是目录、不是路径生命周期。

### 为什么 20 张照片全是孤儿

| 证据 | 值 |
|---|---|
| 持久目录里的文件数 | **20**（全部 `.jpg`） |
| 总字节 | **206,694,791**（≈197.1 MiB） |
| 被业务引用的文件数 | **0** |
| 未被引用的文件数 | **20**（206,694,791 B） |
| store 里全部 20 条图片引用的形态 | **`cloud://` × 17 + bundled × 3** |
| 引用中落在持久目录内的 | **0** |

⇒ **记忆里保存的是 `cloud://` 云端地址，本地的持久副本在云端上传成功后就再没人引用它了**，
但**从来没有被删除**。20 次成功上传 = 20 个孤儿 = 197 MB。

---

## # Filesystem probe（步骤 9）

**在真机、用应用自己的 `photos.photosDir(token)`、只创建/删除自己的 16 字节探针文件。**

| 操作 | 结果 |
|---|---|
| `getFileSystemManager` | ✅ PASS |
| `USER_DATA_PATH` 存在 | ✅ PASS |
| 目录已存在（`accessSync`） | ✅ PASS |
| **mkdir** | ✅ PASS |
| **writeFile**（16 B） | ✅ **PASS** |
| **stat** | ✅ PASS（16 B） |
| **readFile** | ✅ PASS |
| **copyFile** | ✅ PASS（16 B 小文件） |
| **access** | ✅ PASS |
| **readdir** | ✅ PASS |
| **unlink** | ✅ PASS（两个探针都删掉，`probeLeftovers: 0`） |

⇒ **A / B / C 三种假设全部排除**：目录**可写**、`copyFile` **单独不失败**、read/write **不失败**。

⇒ 只有 **D** 成立：**只有「真实图片尺寸」的写入失败** —— 因为 16 字节挤得进剩余空间，
而 2.37 MB 的压缩产物挤不进。

### 关键对照（同一个探针内）

用**持久目录里最大的一张真实照片**（18,316,024 B，`kind=wxfile`）跑生产同款路径
`compressImage({src, quality:80})`（**不传 compressedWidth/Height**）：

| 步骤 | 结果 |
|---|---|
| `compressImage` | ✅ PASS → 产物 **2,374,538 B**，`kind=wxfile` |
| **从 temp 源 `readFile`** | ✅ **PASS**（源**可读**） |
| **从 temp 源 `copyFile` 到持久目录** | ❌ **FAIL** — `the maximum size of the file storage limit is exceeded` |

⇒ **源可读、目标不可写**，而且是**配额**原因。这直接解释了 `COPY_FAILED`。

### `COPY_FAILED` / `WRITE_FAILED` 的真实来源（步骤 8 / 12）

| 你看到的日志 | 真实 native cause | 为什么显示成那个 code |
|---|---|---|
| `[avatar] copy COPY_FAILED` | `the maximum size of the file storage limit is exceeded`（配额） | `photos.failure('copy', e)` 取 `e.code \|\| e.errCode`；微信这个错误**两者都没有** ⇒ 回退成 `stage.toUpperCase()+'_FAILED'` = `COPY_FAILED` |
| `[avatar] write WRITE_FAILED` | 同上（`copyIn` 的 read→write 回退**也是**写进同一个满配额目录） | 同上，回退成 `WRITE_FAILED` |

⚠️ **因此这两个 code 本身不含原因** —— 它们只是「copy 阶段失败」的字面翻译。
真正的信息在 native `errMsg` 里，而 `failure()` **把它丢掉了**（这正是我上一轮说的「cause 链在 `copyIn` 里没有保留」）。

---

## # Storage audit（步骤 14）

| 项 | 值 |
|---|---|
| **photoDir** | fileCount **20** / totalBytes **206,694,791**（197.1 MiB） |
| **referenced** | fileCount **0** / totalBytes **0** |
| **unreferenced** | fileCount **20** / totalBytes **206,694,791** |
| largest10（bytes / ext） | 18,316,024 jpg · 18,303,652 jpg · 17,533,474 jpg · 16,735,499 jpg · 16,370,990 jpg · 15,798,638 jpg · 15,687,467 jpg · 15,559,716 jpg · 13,652,552 jpg · 13,336,691 jpg |
| **diaryJsonBytes** | **17,272** |
| **draftJsonBytes** | 未采集（本轮 `loadDraft()` 有副作用，未调用） |
| **KV storage** | keyCount **7** / **20 KB** / limit **10,486 KB** |
| 文件系统配额 API | 存在 `getFileInfo`，但**不返回配额总量** ⇒ **QUOTA_LIMIT = UNKNOWN**（只能由错误信息证明「已超」） |

**两类 storage 的对照（步骤 C3）**：

| 系统 | 用量 | 状态 |
|---|---|---|
| 1. `USER_DATA_PATH` 文件 | **197.1 MiB** | ❌ **已超限** ← 问题在这里 |
| 2. KV / `identity.setStorageSync` diary JSON | **20 KB / 10.2 MB** | ✅ 完全健康 |

⇒ **不是 KV 存储不足**。diary JSON 只有 17 KB。

---

## # Scene A — Map

**PASS（按你的指示不再改 Map renderer）。**

本轮**没有**执行 Scene A 的 trace sanity check —— 因为 `photoTrace` 需要在页面 `applyFilters` 里触发，
而那需要一次真实的选择/缩放操作；在拿到上面那个根因之后它已不是瓶颈。**Map 未被触碰。**

---

## # Scene B — Meal photo

**FIRST_FAILING_STAGE = `persist`**（不是 choose / decode / shrink / upload）

| 阶段 | 结果 |
|---|---|
| choose | 未测（需要你在相册选图） |
| source 可读 | ✅ PASS（temp 源 `readFile` 成功） |
| **persist（copy 进持久目录）** | ❌ **FAIL — 配额超限** |
| decode | 未到达 |
| shrink 1600 / 1080 | 未到达 |
| upload invoked | **未到达** |

⇒ 原图**根本没走到上传**，在 `persistPhoto → copyIn` 就因配额失败。
**新 memory 与 编辑已有 memory 是同一个失败点**（都走 `persistPhoto`），
所以「不是某条老记录的单例问题」这一判断是对的，但**原因不是照片本身**，而是**目录已满**。

---

## # Scene C — Avatar

**FIRST_FAILING_STAGE = `persist`**

| 阶段 | 结果 |
|---|---|
| choose | 未测（需要你在相册选图） |
| downsample | 未到达（在 persist 之前失败） |
| **persist** | ❌ **FAIL — 配额超限** |
| preview / save / reopen | 未到达 |

- **COPY_FAILED cause** = `the maximum size of the file storage limit is exceeded`
- **WRITE_FAILED cause** = 同一个配额错误（read→write 回退写进同一个满目录）

⚠️ 注意：**B3 的 1024 降采样修复本轮无法被验证** —— 它在 `persist` 之后才生效，
而链路在 `persist` 就断了。**不是修复无效，是根本没走到。** 需要先解决配额才能验证。

---

## # Shared root cause

**`SAME_ROOT_CAUSE`**

**证据链**（全部 REAL_DEVICE，同一次会话）：

1. `copyFileSync` 从任意源写入持久目录 → 失败，native 原因**只有一条**：
   `the maximum size of the file storage limit is exceeded`。
2. avatar 与 meal **共用同一个函数** `photos.persistPhoto → copyIn → copyFile(target=photosDir)`。
3. avatar 的 `COPY_FAILED` 与 meal 的 persist 失败**发生在同一行代码、同一个目录、同一个错误**。
4. 目录容量 **197.1 MiB**，引用数 **0** ⇒ 配额被孤儿占满。
5. 反证：KV 侧只有 **20 KB / 10.2 MB**，`diaryJsonBytes` 仅 **17 KB** ⇒ **不是** KV 存储问题。

⇒ 三个症状（avatar 失败、meal 上传失败、以及那句「清理存储空间」）**是同一个原因**。

---

## ⚠️ 一个必须澄清的结论反转

你上一轮明确说「**不要再把 Avatar 问题归因于『可能存储空间不足』**」。
**真机证据表明：这一次它确实是存储空间不足** —— 而且不是「可能」，是设备原话
`the maximum size of the file storage limit is exceeded`。

这两件事并不矛盾，恰好互相印证：

- 上一轮我说「旧代码**任何** profile-save 错误都显示存储文案」——那是**归因过宽**的 bug，**已修**（B2）。
- 本轮证明「**确实存在**真正的配额失败」——修完之后它**应该**显示存储文案，而且现在**只有**它才显示。

⇒ **B2 的修复方向被真机证据验证为正确**，不是误修。

---

## # 下一步（按你步骤 18：先停，等你批准）

**Root cause**
本地 `USER_DATA_PATH` 被 20 张**无引用**照片占满 197 MB，击穿微信文件存储配额；
所有 `persistPhoto → copyIn → copyFile` 一律失败，连带 avatar 与 meal 两条链路全断。

**Minimal fix**
1. **媒体 GC（治本，且现在有数据支撑）**：删除「不被任何 memory / draft / outbox / avatarAsset 引用」
   的本地文件。本轮实测 **20/20 全部无引用** ⇒ 可回收 **197.1 MiB**。
   ⚠️ 必须：先算引用集合 → 只删未被引用的 → **只删自己的 `savor-photos/<owner>` 内** → 逐个 unlink 并容错
   → 绝不 `rm -rf`、绝不动他人 owner 的目录。
2. **上传成功后清掉本地副本（治根）**：记忆一旦指向 `cloud://`，本地持久副本即无引用。
   在 cloud 上传确认后删除本地副本，从源头不再产生孤儿。
3. **失败时的可诊断性**：`copyIn` 现在把 native `errMsg` 丢掉了，导致 `COPY_FAILED` 完全不含原因。
   建议 `failure()` 保留一个**脱敏后的 cause 摘要**（或至少把 quota 类错误映射成专门的 code）。

**Files affected**
- `miniprogram/utils/photos.js`（`copyIn` / 新增 GC 入口 / 错误分类）
- 可能新增一个 dev-only 或 utils 级 GC 模块
- `miniprogram/utils/cloudRecords.js`（上传成功后清理本地副本）
- 新增回归测试（下面）

**Regression tests needed**
1. GC 只删「未被引用」的文件；被引用的**一个都不能删**
2. GC 只作用于当前 owner 的目录，绝不跨界
3. GC 在 `unlink` 失败时继续处理其余文件，不中断
4. 上传成功后本地副本被删除，且 memory 仍能用 `cloud://` 渲染
5. 配额错误被映射成专门的 safe code（不再退化成 `COPY_FAILED`）
6. GC 幂等：连跑两次第二次为 0

**我不会在你批准前动任何生产代码。** 也不会自动删除你机器上的任何文件 ——
上面那个 197 MB 的结论**只是测量**，清理动作需要你明确授权。

---

## 本轮遵守的禁止事项

未读取/输出 MCP Token · 未要求提供 · 票据未落盘未回显 · 未改 DevTools 安全设置 · 全程 `127.0.0.1` ·
未 upload / deploy · 未清 Storage · 未清缓存编译（只用过普通 `simulator_refresh`）·
**未删除任何用户文件**（探针只删自己创建的 2 个 16 字节文件，`probeLeftovers: 0` 已证）·
未改数据库 · **未改生产代码** · 无遗留后台进程。

**冻结**：`HEAD=8bf5a65`；7 个冻结文件哈希未变；项目树仅新增本报告（与上一轮 runbook）。
本轮产物全在 gitignored 的 `.workbuddy-ai/scratch/wechat-devtools/`。
