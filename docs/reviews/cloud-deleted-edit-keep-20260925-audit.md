# Cloud-Deleted Record Edit Fix — 修复后验收审计

长期维护文档 · 日期：2026-09-25
被审对象：`cloud-deleted-edit-keep-20260925.md` 所述修复（**未提交**，工作区 11 改 + 1 新增）
基线：`HEAD = c0466cd645ca1ef742343ddd591e495a322e7000`，分支 `integrated-with-cloud`
审计约束（用户指定）：**不 commit / 不 push / 不 deploy / 不继续修改生产代码**

> 本文只写实测证据支持的结论。审计脚本自身的错误也一并记录（见「审计脚本自我更正」）。

---

## 结论

| 目标 | 结论 |
|---|---|
| 1. 不丢本地数据 | **PROVEN**（7 项） |
| 2. 不重复创建云端回忆 | **PROVEN**（10 项） |
| 3. 未用刷新 approval/hash 基线掩盖无关改动 | **PROVEN**（32 项，含 32 个基线文件双向自洽） |
| 4. 未改坏 CONFLICT / delete / flags 语义 | **PROVEN**（19 项，含 2 项逐字节静态比对） |
| 5. 不只在当前 JS 进程有效 | **PROVEN**（26 项，真实双进程重启 × 2 变体） |

合计 **94 项 PROVEN / 0 项 FAILED**。审计过程只写 `.workbuddy-ai/scratch/`，仓库改动集合与审计前完全一致。

---

## 审计方法

- 复用 `tools/verify-cloud.cjs` 的**真实 harness 前导段**（生产 mock，不重写）：`.workbuddy-ai/scratch/audit/build.cjs <scenario>`。
- 目标 5 用**两个独立 node 进程** + 落盘 storage / 落盘 mock 服务端行，而不是同进程模块重载。
- 全部证据汇总：`.workbuddy-ai/scratch/audit/evidence.txt`。

---

## Phase A：真实 Diff

```
$ git status --short
 M miniprogram/components/sheet/index.js
 M miniprogram/components/sheet/index.wxml
 M miniprogram/utils/locales.js
 M miniprogram/utils/store.js
 M miniprogram/utils/syncRepository.js
 M tools/fixtures/regression/ui-approved-updates.json
 M tools/lib/locale-translations.tsv
 M tools/stage6-refactor-review.json
 M tools/ux-remediation-review.json
 M tools/verify-cloud.cjs
 M tools/verify-sheet-edits.cjs
?? docs/reviews/cloud-deleted-edit-keep-20260925.md

$ git diff --stat
 miniprogram/components/sheet/index.js              |  5 +-
 miniprogram/components/sheet/index.wxml            |  1 +
 miniprogram/utils/locales.js                       | 20 ++++++
 miniprogram/utils/store.js                         | 41 +++++++++++--
 miniprogram/utils/syncRepository.js                |  5 +-
 tools/fixtures/regression/ui-approved-updates.json | 12 ++--
 tools/lib/locale-translations.tsv                  |  4 ++
 tools/stage6-refactor-review.json                  |  6 +-
 tools/ux-remediation-review.json                   |  6 +-
 tools/verify-cloud.cjs                             | 71 ++++++++++++++++++++++
 tools/verify-sheet-edits.cjs                       | 42 ++++++++++++-
 11 files changed, 192 insertions(+), 21 deletions(-)
```

生产代码只动 5 个文件，改动面 5 + 1 + 20 + 41 + 5 = **72 行**（含注释）。逐行审查要点：

- `syncRepository.js`：**唯一**的语义改动是 `deletedIds` 分支加 `if(!outbox.some(...))`。前后两段（墓碑分支之前、之后）已用逐字节比对证明未变（4.18 / 4.19）。
- `store.js`：3 处——outbox 白名单加 `'recreate'`、`flushOutbox` 抽出 `persist` 并加 `recreate` 分支、新增 `keepLocalEdit` + 导出。**未触碰** `blocked`/`canResolve` 阻塞规则、`ownSuccessor` 重基、`useCloudVersion`。
- `sheet/index.js`：**恰 2 个 hunk、+4 −1**（1 行就地修改 syncRows 投影 + 3 行新增 `onKeepEdit`）。
- `sheet/index.wxml`：**恰 1 行新增**（按钮），0 行删除。
- `locales.js`：**纯追加**，既有 520 条逐条字节不变。

### 披露：审计开始前撤回的一条测试

收到「停止改代码」指令前，我刚为「墓碑在编辑中途到达」这一残余缺口在 `tools/verify-cloud.cjs` 里加了一条 **RED** 测试（未实现修复，未动生产代码）。留着它会让被审树带一条红测试，故**已撤回**，使被审树回到全绿。该缺口仍然存在，见「未证明的风险 #2」。

---

## 目标 3：哈希基线取证（重点）

闸门的真实逻辑不是「文件哈希 == `ui-approved-updates.json` 里的值」，而是一条**链式覆盖**：
`baseline → approved → refinements/mapFrame/addPage → ux → homeIdentity/mapIdentity/meProfile/usIdentity → stage6 → 最终比对`。
审计按此链**独立重实现**了期望哈希解析。

| 检查 | 结果 |
|---|---|
| 改动前：链式期望哈希 == `sha256(git show HEAD:<file>)`，对全部 **32 个基线文件** | PROVEN |
| 改动前：全部链式 `baseSha256` 链接成立 | PROVEN |
| 改动后：链式期望哈希 == 工作树文件哈希，对全部 32 个基线文件 | PROVEN |
| 「期望哈希变化」的文件集合 == 「内容真实变化」的文件集合 | PROVEN（两边都只有 `sheet/index.wxml`） |
| 该文件：旧期望 == HEAD 版本，新期望 == 工作树版本 | PROVEN |
| `ui-approved-updates.json` 键集合一致（46 条）、无新增 `removed` | PROVEN |
| 该清单仅 3 条被改，且恰为预期的 3 个文件 | PROVEN |
| `ux` / `stage6` 键集合一致、**全部 `review` 文档引用未变**、仅 `sheet/index.wxml` 被改 | PROVEN |
| wxml 哈希变化**恰由 1 行新增解释**：删掉该行后字节 == HEAD 版本 | PROVEN |
| 该行就是 `keepable` 按钮 | PROVEN |
| `locales.js` 是 TSV 的**纯函数**：用 HEAD 的 TSV 重建 == HEAD 的 locales.js；用当前 TSV 重建 == 当前 locales.js | PROVEN |
| TSV diff 恰 4 行新增、0 行删除 | PROVEN |

**关键结论**：哈希清单的更新**恰好等于**文件的真实 diff，既无遗漏也无多刷；`review` 文档引用未被替换成更弱的评审记录；没有任何基线文件在哈希未更新时被改动。

### 发现的既有闸门作用域问题（**非本次引入**，但必须记录）

`ui-approved-updates.json` 有 **46** 条，而 `ui-baseline.json` 只覆盖 **32** 个文件。因此 **23 条是纯记账、不被任何哈希校验**——其中就包括我本次改的 `miniprogram/utils/locales.js` 与 `miniprogram/components/sheet/index.js`。已逐一排查 8 个含 `sha256` 的 `.cjs`：出现这两个文件的地方**全部只是 `require` 加载**，无期望哈希。

含义：对这两个文件，刷新记录哈希**不可能掩盖任何东西**（没人校验它），但也意味着**它不提供保护**。故本次对它们做了独立取证：

- `locales.js`：条目数 520 → 524（+4），既有 520 条逐条字节不变，新增 4 条 key 均可由 `sha1(en)` 前 10 位复现，与 `build-locales.cjs` 一致。
- `sheet/index.js`：恰 2 个 hunk、+4 −1，被删行是旧 `syncRows` 投影，新增行是新投影（含 `keepable`）与 `onKeepEdit`。

---

## 目标 1：不丢本地数据（7 项）

| # | 断言 | 结果 |
|---|---|---|
| 1.1 | 保存失败 + 自动 `syncCloud()` 后本地编辑仍在 | PROVEN |
| 1.2 | 未决操作仍在队列（内容在 memory 与 `op.memory` 双份） | PROVEN |
| 1.3 | 另存失败（离线）后本地编辑仍在 | PROVEN |
| 1.4 | 离线时 `recreate` 操作带着完整内容留存 | PROVEN |
| 1.5 | 模块重载后本地编辑仍在 | PROVEN |
| 1.6 | 模块重载后 `recreate` 未被 `normalizeDiary` 丢弃（白名单生效） | PROVEN |
| 1.7 | 重载后补发成功，内容到达云端 | PROVEN |

对照（修复前实测）：同样路径下 1.1 会变成「本地编辑被静默抹掉」。

---

## 目标 2：不重复创建云端回忆（10 项）

| # | 断言 | 结果 |
|---|---|---|
| 2.1 | 正常另存恰好新增 1 条（before=1 → after=2） | PROVEN |
| 2.2 | 之后任意次同步都不再新增 | PROVEN |
| 2.3 | 丢回包后服务端已提交 1 条 | PROVEN |
| 2.4 | 丢回包重试不产生第二条（`requestId` 幂等） | PROVEN |
| 2.5 | 再重试仍不产生第二条 | PROVEN |
| 2.6 | 同一记录二次调用被拒 | PROVEN |
| 2.7 | 二次调用后仍只有 1 条新增 | PROVEN |
| 2.8 | **并发双击**：`Promise.allSettled` 恰好 1 成功 1 拒绝，只新增 1 条 | PROVEN |
| 2.9 | 前置：队列里只有 flags 操作且为 `DELETED` | PROVEN |
| 2.10 | 无编辑内容可保留时拒绝另存（不凭空建记录） | PROVEN |

---

## 目标 4：CONFLICT / delete / flags 语义无回归（19 项）

**CONFLICT**（4.1–4.5）：活跃冲突仍标 `CONFLICT`；冲突下拒绝另存；云端内容未被本机改动；「以云端为准」仍清空待处理操作并以云端为准。

**delete**（4.6–4.10）：离线删除仍立刻本机移除且不乐观写云端；恢复后落为墓碑；墓碑不因本机队列复活；仍从列表排除并进入 `deletedIds`；服务端仍拒绝复活墓碑（`DELETED`）。

**flags**（4.11–4.13）：离线入队且乐观生效；恢复后全部落云端；队列清空。

**墓碑上的 flags**（4.14–4.17）：被阻塞记录的后续 flags 操作**不被尝试**（既有 block 规则逐字未改）；出口由那个可解决的 `DELETED` 操作提供；自动同步后记录不消失；出口生效后记录按墓碑处理且两条操作一并清除。

**静态**（4.18–4.19）：`mergeCloud` 中墓碑分支**之前**与**之后**的逻辑与 HEAD **逐字节相同**。

### 记录在案的既有行为（非缺陷，本次未改）

- **block 规则**：某 `recordId` 一旦存在可解决的操作，它的**其它操作也不会被尝试**（`flushOutbox` 的 `blocked` 集合）。因此「墓碑 + 后续 flags」时那个 flags 操作会一直 pending、`error` 为 `undefined`，直到用户处理那个 `DELETED`。这是既有设计，本次未改。
- **仅有 flags 的墓碑**：无编辑内容可保留，`keepLocalEdit` 按设计拒绝；唯一出口是「以云端为准」。

---

## 目标 5：跨进程重启后仍有效（26 项 = 13 × 2 变体）

真实双进程：进程 1 构造未完成的「另存」，落盘客户端 storage 与 mock 服务端行后**进程结束**；进程 2 全新启动，从磁盘恢复后继续。

| 变体 | 进程 1 结束时的服务端状态 |
|---|---|
| `clean` | create **未送达**服务端（live=0） |
| `lostreply` | create **已提交**、回包丢失（live=1） |

两变体共同验证（各 13 项全 PROVEN）：

- `recreate` 操作跨进程存活（`normalizeDiary` 白名单确实生效——这是最易漏的一条，漏了就会丢内容）。
- 待保留的编辑内容跨进程完整保留；本地记录仍可见。
- 进程 2 补发后：本机只剩 1 份；云端该内容只有 1 条；live 行数增量 `clean` +1、`lostreply` **+0**（复用已提交那条，**无重复创建**）。
- 队列清空；旧墓碑未复活；旧 id 已隐藏；新记录拿到新云端 id；再同步一次仍无重复。

---

## 未证明的风险

1. **未做真机 / 开发者工具 / 真实 CloudBase 验收。** 全部证据来自 Node mock 契约测试；`verify:cloud` 自报「Not verified in WeChat DevTools or live CloudBase」。`wx.showModal` 与同步面板在真机上的渲染未验证。
2. **「墓碑在编辑中途到达」的窗口仍未修复、仍无测试。** 若墓碑落在「打开编辑器」与「点保存」之间，本地副本可能已在建立 outbox 操作**之前**被 merge 移除；此时内容仍在 `op.memory`、面板仍可「保留我的修改」，但**日记里看不到该条**。本次不变量只保证「不删除已有本地记录」，不保证「从 op 重建缺失的本地记录」。
3. **两个文件的哈希不被闸门保护**（`locales.js`、`sheet/index.js`）。本次靠独立取证证明其完整性；若日后有人改它们，`verify:cloud` **不会**报警。这是既有闸门作用域问题（23/46 条不被强制）。
4. **并发验证只覆盖进程内双击。** 真正的多设备并发（两台设备同时对同一墓碑执行另存）未覆盖。
5. **`useCloudVersion`（以云端为准）对墓碑行仍是破坏性的**，会清空 memory 与 `op.memory`；本次只把它从「唯一选项」变成「有意的丢弃选择」，未加二次确认。
6. **`keepLocalEdit` 仅从同步面板可达**，没有端到端验证按钮真的渲染出来（只有组件级断言 `keepable` 与 `onKeepEdit`）。

---

## 审计脚本自我更正（记录在案）

首轮审计报出 7 处 FAILED，**全部是审计脚本自身错误，不是修复缺陷**：

1. **模型错误（最重要）**：v1 假设 `approved[file].sha256` 就是最终比对值，忽略链式覆盖 ⇒ 5 处假 FAILED。反证：`sha256(HEAD:sheet/index.wxml) = 30a3974c…`，恰等于改动前 `stage6-refactor-review.json` 的 `sha256`。已改为独立重实现整条链。
2. `locales.js` 既有条目基数写成 516，实为 **520**。
3. `sheet/index.js` 期望 diff 写成 +3/−1，实为 **+4/−1**。
4. 探针 2.9 前提写错：在墓碑上叠加的是**服务端** flags，本机那个 update 操作仍是 `DELETED`，故另存本就该成功。已改为「队列里只有 flags 操作」的真守卫场景。
5. 探针 4.14/4.16 前提写错：既有 block 规则使该 flags 操作**根本不会被发送**，`error` 为 `undefined`。已按真实语义重写。
6. 探针 5.5 对 `lostreply` 期望 live=2，实为 **1**。
7. 探针 5.8 标签写「+1」，`lostreply` 实为 **+0**。

---

## 审计后复跑

`npm run verify:all` → **EXIT 0**，日志 0 条 FAIL/Error，`TOTAL: 355/355`，`verify:cloud` 236/236，`verify:sheet-edits` 61，包体积 1.48 MB。`git status --short` 与审计前完全一致。

---

## 总判定

五个目标全部 PROVEN，未发现修复引入的数据丢失、重复创建、哈希掩盖或语义回归。**但本审计不构成批准**：风险 1、2 是实质性的未证明项，其中风险 2 是同一类静默丢失的已知残留缺口。是否放行由用户决定。

---

## 附：审计后处理（2026-09-25 稍晚）

上面「未证明的风险 2」（墓碑在 `beginEdit` 与「保存」之间到达）已按同一方式单独修复：
先写出稳定 RED（`verify-cloud.cjs` 的 A–G 七项，B/G/queued-create 三项失败），
再最小修改 `syncRepository.mergeCloud`（新增可选 `editedIds`）与 `store.js`
（新增 `editedRecordIds()`，从 storage 解析草稿）。含真实双进程冷启动对照实验。

细节、RED/GREEN 输出与对照实验见
`docs/reviews/cloud-deleted-edit-keep-20260925.md` 的「第二个窗口」一节。
本审计其余结论与风险 1、3、4、5 不受影响。
