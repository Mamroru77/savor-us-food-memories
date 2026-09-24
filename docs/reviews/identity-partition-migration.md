# Historical Identity Partition Migration

长期维护文档 · 日期：2026-09-24
范围：`miniprogram/utils/identityPartitions.js`（`accept()` 的历史分区兼容路径）
来源：本仓库 2026-09-23 身份分区迁移的阶段性原稿（真机定位 → 迁移修复 → fail-closed 收紧 → 真机验证；原稿已移入本地归档，未纳入版本库）。

> 本文只写原始报告与真机证据实际支持的结论。

---

## Symptom

**用户可见**：应用长期停在「身份验证中 / 需要验证身份」状态，功能不可用；
不是偶发，而是**一直**阻塞，重启、重进都不恢复。

**运行时实际状态**（真机只读探针，`identity.snapshot()`）：

```
status = blocked          ← 只能由 identity.js 的 verify() catch 产生
locked = true             ← current === null ⇒ 后续 lease() 抛 IDENTITY_LOCKED
generation = 5            ← 已尝试 5 次
```

失败落点：

```
stage = partition-accept
code  = CACHE_MISSING
```

`IDENTITY_LOCKED` / `IDENTITY_LEASE_FAILED` 是**后果**，不是根因。
stage 1–5（account / handshake 等云侧阶段）在真机上并未失败 —— 失败发生在
**stage 6（partition accept / cache）**，即唯一输入是**设备本地 storage** 的那一步。

---

## Device root cause

真机 storage 实测形态（全部只读，仅记录类别 / 布尔 / 计数）：

| 项 | 实测 | 说明 |
| --- | --- | --- |
| partition（valid V2） | **present** | 重组 chunkStorage envelope 后逐字段核对通过：`kind==='partition'` / `formatVersion===2` / namespace 匹配 / userId 匹配 key 后缀 / `outbox` 是数组 / 声明 chunk 数与存在数一致 |
| quarantine blob | **missing** | 读取为 `null` |
| established marker | **missing** | 该 key 不存在 |
| manifest / chunk | **valid** | declared 1 / present 1 / missing 0 / extra 0 / unreadable 0 |
| pending / journal | **none** | partition 0 / quarantine 0 / other 0 |
| 损坏迹象 | **无** | 不存在 `CACHE_CORRUPT` / `CACHE_UNSUPPORTED` 的成因 |
| 总 key 数 | **2** | 只有 partition manifest + 其 chunk，别无其它 |
| legacy key（`savor-diary-v1` / `savor-draft-v1` / partitionsV1） | **均不存在** | —— |
| 存储用量 | 约 8 KB / 上限约 10.2 MB（quota 0%） | **不是配额压力**导致的写入失败 |

⇒ 结论唯一：`code = CACHE_MISSING`，且触发点是 `accept()` 的
「partition 存在但 quarantine 缺失」分支。

**为什么这个状态是「由更早的构建写入」**：`established` 标记缺失，而当前构建在
成功 accept 的末尾**必定**写它 ⇒ 该 partition 不是当前代码写出来的。
`persist()` 只有两处调用（`accept()` 的首次初始化分支，与需要 lease 的 `save()`），
所以它来自一个**既没有 quarantine 步骤、也没有 established 标记**的历史构建。

---

## Original logic defect

```js
} else {
  if (!blobs.read(prefix + ':quarantine')) fail('CACHE_MISSING');   // ← 命中
  ensureQuarantine(null);
}
```

`fail()` 位于 `ensureQuarantine(null)` **之前**：守卫在**自愈写入之前**就中止了。
于是每次 `App.onShow` 的 `verify()` 都会再次走到同一行、再次 `fail`，
**永久不可自愈** —— 与「一直阻塞」完全吻合。

**这个路径此前完全没有测试覆盖**：既有 `verify-identity.cjs` 只覆盖了
`CACHE_WRITE_FAILED` 与 `CACHE_CORRUPT`，`CACHE_MISSING` 属于最可能长期潜伏的路径。

---

## Migration contract

只在 `accept()` 中引入**一条**历史分区兼容分支，矩阵如下（最终形态）：

| CASE | 条件 | 行为 |
| --- | --- | --- |
| **A** 历史分区 | valid V2 partition + quarantine 缺失 + **marker 确认不存在** | **允许一次性兼容迁移**：创建 quarantine → 分区内容不变 → `validate` → 写 `established='2'` → accept 成功 |
| **B** 已建立分区损坏 | valid partition + quarantine 缺失 + marker **present** | `CACHE_MISSING` **fail closed** |
| **C** 分区丢失 | partition 缺失 + marker **present**（**任何值**，含 `0` / `false` / 未知值） | `CACHE_MISSING` **fail closed** |
| **C′** 首次初始化 | partition 缺失 + marker **确认不存在** | 允许创建 fresh partition（既有行为，未变） |
| **D** 损坏 / 异主 | malformed / chunk 校验失败 / formatVersion 不支持 / owner 不匹配 | 原错误（`CACHE_CORRUPT` / `CACHE_UNSUPPORTED`），在 `readPartition` 内即抛出，**根本到不了迁移分支** |

**关键设计点**：进入历史迁移的判据**不是**「quarantine 缺失」，而是
「**marker 确认不存在**」。marker 一旦存在（无论值是什么）就意味着当前方案
**曾经生效过** —— 此时 quarantine 缺失是**数据丢失**的证据，必须 fail closed。
迁移只对**从未建立过**的历史分区开放，且只开放**一次**。

矩阵 B 与「marker present 但 ≠ `'2'`」在实现上已合并为同一条 `!absent(...)` 判定：
`'2'` 只是「存在」的一个特例。

---

## Marker existence contract

storage 在本仓库**唯一**的 missing 契约定义（`chunkStorage.js`）：

```js
const empty = v => v === '' || v === null || v === undefined;
```

同一三重判定也出现在 `identityPartitions.js` 的 `legacy()` 与 `ensureQuarantine()`。

因此「确认不存在」= **`'' | null | undefined`**：

- **不是**只比空字符串；
- **不是** JS 真值判断。

**任何其它值都是 PRESENT**，包括：`0`、`false`、`'0'`、`'false'`、`'no'`、
未知字符串（`'unexpected'`、`'1'`、`'true'`、`'yes'`、`'02'`、`'2 '`、`' 2'`）、
对象 `{}`、数组 `[]` / `['2']`、`1` / `true` 等。

两处 marker 判断**都必须**用 `absent()`，绝不能用 JS 真值判断：

- `!partition` 分支若用真值判断，`0` / `false` 会被当成「没有 marker」
  ⇒ 误建 fresh 空分区（随后还会写 `established='2'`）；
- `else`（quarantine 缺失）分支若用 `'=== \'2\''`，任何非 `'2'` 的 present marker
  都会被误判为历史分区 ⇒ 拿到一次性迁移。

**fail-closed 的可观测后果**（逐个 marker 断言）：`accept` 抛 `CACHE_MISSING`、
**不创建** partition/quarantine、**不写** established（marker 原值不被覆盖）、
**disk 零写入**（整个 disk 快照 `deepEqual` 前后一致）、`lease()` 仍抛 `IDENTITY_LOCKED`。

---

## Data-preservation guarantees

修复**不得**：

- 清 Storage（`clearStorage`）；
- 覆盖 / 重写旧 partition；
- 删除 legacy recovery key（`savor-diary-v1` / `savor-draft-v1`）——
  迁移补建 quarantine 时它们**原值保留**，并被**复制进** quarantine（可读回）；
- 吞掉 `CACHE_CORRUPT` 继续运行；
- 修改 owner validation；
- 放宽 `lease` / `assertLease`；
- 按 userId 特判、写设备专用 hack。

**正向不变量**（迁移用例断言，全部通过）：

- 修复前已存在的每个 key，修复后**字节完全相同**；
- 修复严格**追加式**：新增 key 只允许 `quarantine manifest` + 其 `:chunk:` + `established`，
  任何其它新 key 直接判失败；
- `established === '2'` 已写入；
- payload 全字段存活（含 diary 私有字段、outbox、draft、workspace / media / space intent，
  以及**未知字段** `futureUnknownField` 逐项 `deepEqual`）；
- **不得被重写成 fresh empty partition**（断言 `notDeepEqual`）；
- **幂等**：第二次 accept 后整个 disk 与迁移后快照 `deepEqual` ——
  没有第二次迁移、没有任何写入；
- 写入失败（`setStorageSync` 抛错）⇒ `CACHE_WRITE_FAILED`、lease 仍 locked、
  `established` 未写入、修复前所有 key 字节未变；恢复写入后重试成功且数据完好。

---

## Real-device migration proof

设备：OPPO PKB110 / Android 16（只读探针，不写 storage、不调用 `identity.verify()`、
不返回任何 key 字符串或 value）。

连续只读探针（每次在 `App.onShow → identity.verify()` 之后读回）：

| 探针 | status | locked | generation | totalKeys | partition chunk 年龄 | quarantine chunk 年龄 | marker |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pre-repair 基线 | `blocked` | `true` | 5 | **2** | — | 无 | 无 |
| #1 | **`verified`** | **`false`** | 1 | **5** | **25235 s（≈7.0 小时）** | 1 s | `'2'` |
| #2 | `verified` | `false` | 1 | 5 | 10 s | 11 s | `'2'` |
| #3 | `verified` | `false` | 1 | 5 | 31 s | 32 s | `'2'` |
| #5 | `verified` | `false` | 1 | 5 | 57 s | 58 s | `'2'` |

**结论**：

1. **迁移成功**：`status` `blocked → verified`，`locked` `true → false`。
   真机根因（`CACHE_MISSING` 永久不可自愈）已消除。
2. **严格追加式**：`totalKeys` `2 → 5`，新增 3 个 key = quarantine manifest +
   其 chunk + `established`；`pending = 0`；legacy key 全为 `false`。
3. **partition 未被修复改写**：探针 #1 在 quarantine 写入后 **1 秒**读到 partition 的
   chunk id 年龄为 **25235 秒（≈7.0 小时）**。若迁移重写了 partition，该年龄会 ≈1 秒。
   这个 7 小时也**反向印证**了「该分区由更早的构建写入」。
4. **修复只发生一次**：`generation` 全程恒为 `1`（`verify()` 没有第二次）；
   quarantine 的 idDigest 四次完全一致；marker 始终为 `'2'`；
   「历史分支是否仍可达」恒为 `false`。
5. **partition 载荷未变**：与 pre-repair 基线同形（outbox 为空、diary/draft 为空、
   各 workspace / media / space intent 均不存在、`partitionWithoutQuarantine = false`）。

---

## Post-repair write clarification

身份恢复后约 1 秒，partition 的 chunk id **变更过一次**，此后稳定不变。
**这不是迁移重复执行**，归因如下（静态追链，零改动）：

```
Home 页 onShow
→ store.syncCloud()
→ mergeCloudRead()
→ commit(...)
→ identity.setStorageSync(STORAGE_KEY, …)
→ cache().save()
→ identityPartitions.persist()
→ blobs.write()
```

`chunkStorage.write()` 是 **copy-on-write**：**每次写都换新 chunk id**。
因为合并结果与既有 state 相等，**载荷零变化**，只是换了一个 chunk id。

**为什么不可能是修复再跑一次**：若迁移再次执行，quarantine 摘要与 marker 会**同步**改变、
`generation` 会**递增** —— 三者都没有发生，且 partition 载荷内容零变化。

⇒ 这是 **Home 页每次 `onShow` 的云同步提交**，既有行为（`mergeCloudRead` / `commit`
本轮未改动，`git` 无差异），与修复无关。只观测到一次是因为 `syncCloud()` 有 `syncFlight` 去重。

**推论（供后续排查复用）**：证明「某段逻辑只跑一次」时，**不要**用「idDigest 变了」
当反证 —— 它只说明**有人写过**；要用该逻辑**独有的副作用**（此处 = quarantine 摘要
与 marker 是否同步变化、generation 是否递增）作为不变量。

---

## Verification

| 命令 | 结果 |
| --- | --- |
| `npm run verify:identity` | EXIT 0（24/24 runtime + 11 条 historical-partition repair 检查全 PASS） |
| `npm run verify:store-boundaries` | EXIT 0（11 checks） |
| `npm run verify:workspace` | EXIT 0（14/14） |
| `npm run verify:audit` | EXIT 0 |
| `npm run verify:all` | EXIT 0（0 FAIL） |
| `npm run verify` | EXIT 0，`355/355`，`FINAL STATIC VALIDATION: PASS` |

测试装置（复用既有，未新建 harness）：`verify-identity.cjs` 的 `deviceDisk(seed)`
（缺 key 读回 `''`，模拟真实 storage 的 missing 契约）、`buildHistoricalPartition(...)`、
以及惰性矩阵模式 `IDENTITY_REPAIR_MATRIX=1`（**默认严格**，不影响 `verify:all`）。

**冻结闸门未触发**：`miniprogram/pages/me/index.js` 的整文件 SHA-256 与
`tools/lib/reviewed-me-memory-return.cjs` 中的 `approvedSha256` 一致；
**未刷新任何无关基线**。

**真机验证约束**：未 clearStorage、未人工写 key、未修改 `identity.verify` /
`lease` / `assertLease` / `chunkStorage`、未修改 avatar / Add / nativeFlow / cloud protocol。

---

## Final commit

```
0c8ae68  fix: support historical identity partitions
```

文件：

- `miniprogram/utils/identityPartitions.js` —— 模块级 `absent()` 谓词 +
  `accept()` 的 `else` 分支（quarantine 缺失）与 `!partition` 分支（marker 存在性）
  两处判定统一使用该契约；
- `tools/verify-identity.cjs` —— 历史分区迁移 / fail-closed 矩阵回归
  （`deviceDisk` / `buildHistoricalPartition` / `IDENTITY_REPAIR_MATRIX`）。

`identity.js` / `chunkStorage.js` / `store.js` / `lease` / `assertLease` / `resumeNative`
**逐字未动**。`legacy()` 与 `ensureQuarantine()` 内原有的内联三重判定语义与新
`absent()` 完全一致，**刻意不重构**以避免扩大 diff。

未证明的风险（保持记录）：

1. 修复只覆盖 `accept()` 的历史形态。若真机还存在**其它** storage 形态问题，
   需要新的证据（本轮只读清点未发现其它异常）。
2. `store.syncCloud()` 在**云端有新增记录**时的合并结果未直接观测
   （本轮设备无新记录）。
