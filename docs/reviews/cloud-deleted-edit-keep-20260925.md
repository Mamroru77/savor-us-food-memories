# Cloud-Deleted Record Edit Fix

长期维护文档 · 日期：2026-09-25
范围：`miniprogram/utils/syncRepository.js` + `miniprogram/utils/store.js` + `miniprogram/components/sheet/index.{js,wxml}` + `tools/lib/locale-translations.tsv`
来源：本仓库 2026-09-25 的 TDD RED → 最小修复 → GREEN 过程。

> 本文只写原始报告与 harness 证据实际支持的结论。

---

## Symptom

**用户可见**：编辑一条**云端已被删除**的回忆 → 点「保存回忆」→ 提示

```
修改已保存在本机。请在「我的 → 同步状态」重试或处理冲突。
```

进入「我的 → 同步状态」后，该条显示「这条记录已被删除。」，界面只提供
**重试同步** 与 **以云端为准** 两个动作，而两者都无法保留用户刚输入的内容：

- **重试同步**永远不可能成功 —— 服务端已把该记录标记为 `deleted`，同 `_id` 的
  update 会被永久拒绝。
- **以云端为准**会丢弃本机修改。

**结论：用户没有「保留当前编辑内容」的安全出口。**

---

## 复现方式（可复用）

用 `tools/verify-cloud.cjs` 的**真实 harness 前导段**拼装临时脚本，不重写任何 mock：

```
node .workbuddy-ai/scratch/repro-deleted-edit/build.cjs <scenario>.cjs
node .workbuddy-ai/scratch/repro-deleted-edit/generated-<scenario>.cjs
```

要点：把前导段里的 `__dirname` 替换成 `tools/` 绝对路径、把
`require('./identity-fixture.cjs')` 换成绝对路径，否则换目录后路径解析全错。

---

## 证据：失败链（全部为实测输出）

1. **服务端墓碑**：`cloudfunctions/mealRecords/index.js:71`

   ```js
   if (old.deleted) return {success:false,code:'DELETED',message:'This record was deleted.'};
   ```

   同 `_id` 更新永久被拒；`tools/verify-cloud.cjs` 已断言「不可复活」。
   这是**设计**，不是缺陷 —— 因此「保留编辑内容」不可能靠更新实现。

2. `cloudRecords.js:41` 原样抛出 code → `store.js` 的 `flushOutbox` catch 记为
   `op.error = 'DELETED'`。

3. `syncRepository.js` 把 `'DELETED'` 列入 `RESOLVABLE` ⇒ `canResolve('DELETED') === true`，
   产生两个后果：
   - `store.js` 的 `flushOutbox`：`if(blocked.has(op.recordId) || canResolve(op.error))`
     ⇒ 该操作**永不重试**。所以「重试同步」对这一行是**空操作** —— UI 让用户重试，
     代码连尝试都不会做。
   - `sheet/index.js` 的 `conflict: store.canResolve(op.error)` ⇒ `true` ⇒
     只渲染「以云端为准」一个按钮。

4. **解决模型是二元的**（丢弃本机 / 重试）。墓碑场景下两者都错，
   「保留编辑内容」这条路径在代码里根本不存在。

### 额外发现：一条用户什么都没点就会丢数据的路径

`syncRepository.js` 的 `mergeCloud` 对 `remote.deletedIds` 是**无条件** `delete byId[id]` ——
完全不看该记录是否还有未解决的 outbox 操作。对比：未删除的远端记录会被
`overlay` / `pendingDelete` 保护，这里没有。

而 `miniprogram/app.js:26`（`App.onShow`）与 `miniprogram/pages/home/index.js:63`
（`Home.onShow`）都会**自动**调用 `syncCloud()`。

实测（修复前）：

| 场景 | 结果 |
|---|---|
| 保存被拒之后 | 本地副本**仍带着用户的编辑**，`op.error = DELETED` |
| 分支 A：重试同步 | 本地编辑**被静默抹掉**（日记里没了），但 outbox 行还留着 → 面板列着一条本地已不存在的记录 |
| 分支 B：以云端为准 | memory 与 `op.memory` 双双清空 → 内容在 storage 里**彻底不可恢复** |
| 保存失败后再进编辑器 | `beginEdit` 被队列中的 op 挡住 → **无法手动抄出内容**，也无法再次保存 |
| 模拟 App.onShow 自动同步 | 用户没点任何东西，日记里该记录消失，memory 数 = 0，但 Sync 面板仍列出该行 |

---

## 修复

### 1. 不变量：墓碑不得抹掉仍有未解决操作的本地记录

`syncRepository.js`：

```js
(remote.deletedIds||[]).forEach(id=>{
  if(!outbox.some(operation=>operation.recordId===id)) delete byId[id];
});
```

理由：只要该记录还有排队中的操作，本机就是**唯一副本**，且用户尚未做出决定。
这与「保存失败后本地仍保留编辑内容」的既有状态一致，不再自相矛盾。

### 2. 缺失的出口：`store.keepLocalEdit(recordId)`

墓碑不可更新、不可复活，所以唯一能保留内容的出口是**把本机编辑另存为一条新云端记录**。

实现刻意复用既有原语，不新造机制：

- 新增 outbox 操作类型 `recreate`。它**同时充当** `cloudRecords.addRecord` 的 durable attempt
  （`actorUserId` / `id` / `memory` / `uploads` / `submitted` 字段原本就在 op 上）。
- `op.id` 即 create 的 `requestId` ⇒ 服务端按 `sha256(openid+requestId)` 派生主键
  ⇒ 丢回包后重试**只会创建一次**。
- 成功后：丢弃该 `recordId` 上所有失效操作、移除本地旧副本、把旧 id 加入 `cloudHidden`、
  插入新记录。
- `normalizeDiary` 的 outbox 白名单必须包含 `'recreate'` —— 否则 `commit` 会静默丢弃该操作，
  内容随之丢失。

前置条件刻意收紧：仅当存在 `kind==='update' && error==='DELETED'` 且 `op.memory` 是合法
Memory 时才允许，因此**活跃冲突（`CONFLICT`）永远不会被复制成新记录**。

### 3. 面板与文案

- `sheet/index.js`：`syncRows` 增加 `keepable`；`recreate` 行的 kind 显示为「新回忆」。
- `sheet/index.wxml`：`keepable` 行新增「保留我的修改」按钮，复用既有
  `secondary-button` 与 `hover-class`，未引入新样式。
- 文案经既有 TSV 构建追加 4 条（`npm run build:locales`）。

---

## 证据：RED → GREEN

**RED**（修复前，`node tools/verify-cloud.cjs`）：

```
PASS cloud deletion is an idempotent tombstone, survives fresh sync and retains shared photo files
AssertionError [ERR_ASSERTION]: a tombstone must not delete a local record that still holds queued work
    at tools/verify-cloud.cjs:844:5
```

第二步 RED：

```
TypeError: store.keepLocalEdit is not a function
    at tools/verify-cloud.cjs:851:17
```

**GREEN**（修复后）：

| 命令 | 结果 |
|---|---|
| `npm run verify:cloud` | `236/236 mock contract scenarios passed` |
| `npm run verify:sheet-edits` | `61 synthetic checks passed` |
| `npm run verify` | `TOTAL: 355/355 checks passed` |
| `npm run verify:all` | `EXIT=0`，日志内 FAIL/Error 行数 0 |
| 包体积门禁 | `1.48 MB (release target 1.5 MB)`，未变 |

新增 4 条 cloud 契约场景：

- `a cloud tombstone never discards local work that still has an unresolved operation`
- `an edit blocked by a cloud tombstone can be kept as a new cloud record`
- `keeping an edit after a lost reply reuses one create request and never duplicates the memory`
- `keeping an edit is refused while the cloud copy still exists`

新增 1 条 UI 接线场景（`verify-sheet-edits.cjs`）：
`sync status offers keeping a locally edited record whose cloud copy was deleted`
—— 断言 `keepable` / `conflict` / 文案、确认后调用 `keepLocalEdit`，
以及「活跃冲突」与「在建 create」都不会显示该按钮。

---

## 第二个窗口：墓碑在「已 beginEdit、尚未保存」时到达

第一版修复只覆盖「已经有 outbox 操作」的记录。用户**已经打开编辑器、但还没点保存**时
outbox 里什么都没有，墓碑照样删掉了本地记录。这个窗口由上一轮验收审计发现，
按同样方式（先证明 RED、再做最小修复）单独处理。

### 最小复现（稳定）

1. 云端建记录 A，本地持有 A。
2. `store.beginEdit(A)` —— 此时**只有** `savor-draft-v1` 被写入，outbox 仍为空。
3. 另一台设备删除 A。
4. `store.syncCloud()`（`App.onShow` / `pages/home` 的 `onShow` 会自动调用它）。
5. 观察：A 从 `state.memories` 消失，而 draft 仍然指向 A。

### root cause（实测）

- `queueMutation` 是 outbox 的**唯一**写入点，只被 `saveEdit` / `updateMemory` /
  `deleteMemory` / `setMemoryLocation` 调用；`beginEdit` 只写 `DRAFT_KEY`。
  也就是说「待同步的云端操作」与「正在写的编辑草稿」是**两个独立的持久化通道**。
- `mergeCloud` 的墓碑判断只看第一个通道：

```js
(remote.deletedIds||[]).forEach(id=>{
  if(!outbox.some(operation=>operation.recordId===id)) delete byId[id];
});
```

- 于是第 5 步记录被删。用户随后点保存时，`saveEdit` 确实会入队一个 `DELETED` 操作，
  但 `queueMutation` 是对 `state.memories` 做 map
  （`state.memories.map(m=>m.id===memory.id?syncRepository.overlay(m,[op]):m)`），
  记录已不在其中 ⇒ **编辑后的内容在日记里同样看不见**。

### 最小修复

`mergeCloud` 增加一个可选参数 `editedIds`（由调用方从**存储**解析，不读页面内存）：

```js
function mergeCloud(local,remote,hiddenIds,outbox,editedIds){
  const held=editedIds||[];
  ...
  (remote.deletedIds||[]).forEach(id=>{
    if(held.includes(id))return;
    if(!outbox.some(operation=>operation.recordId===id))delete byId[id];
  });
```

`store.js` 新增 `editedRecordIds()`：只有**格式完整、`editBase` 仍指向该记录、且属于当前账号**
的草稿才算数；`mergeCloudRead` 把它传给 `mergeCloud`。`refreshCloudReadOnly` 与 `syncCloud`
都经 `mergeCloudRead`，因此两条自动同步路径同时被覆盖。

约束对照：不写云端 ⇒ 不复活墓碑；不调用 `addRecord` ⇒ 不自动建新记录；
只返回 `editingId` 单个 id ⇒ 不保护无关记录；读 `loadDraft()`（storage）而非页面 `data`
⇒ 不依赖 Page 内存、冷启动等效。参数可选 ⇒ `tools/verify-store-repositories.cjs` 的
4 参数调用语义不变。

### 必测项

| 编号 | 场景 | 结果 |
|---|---|---|
| A | 墓碑在 `beginEdit` 之前 | 正常删除 |
| B | 墓碑在 `beginEdit` 之后、保存之前 | 记录保留，恢复路径可用 |
| C | 墓碑在 save/outbox 之后 | 既有行为不变（仅靠 outbox 保护） |
| D | 普通 remote delete，无 draft/outbox | 正常删除 |
| E | 正在编辑 B，同时删除 A | A 正常删除，B 不受影响 |
| F | 外部账号 / `editBase` 不匹配的草稿 | **不**保护，A 正常删除 |
| G | `beginEdit` → 杀进程 → 远端删除 → 重启 → 首次 sync | 编辑内容仍安全 |

**RED**：`node tools/verify-cloud.cjs` 在 B 处断言失败
（`a tombstone must not remove the record the open editor is bound to`，
`verify-cloud.cjs:872`，`actual: undefined, expected: true`）。非致命运行器下
B / G / queued-create 三项 FAIL，其余 241 项 PASS ⇒ 无连带破坏。

**GREEN**：`244/244 mock contract scenarios passed`。

### 冷启动证据（真实双进程）

`.workbuddy-ai/scratch/tomb-draft/` 用文件后备存储跑了两个**真实独立进程**：
进程 1 建记录并 `beginEdit` 后退出；进程 2 只从磁盘恢复，然后执行首次同步。

- 对照组（`TOMB_NEUTER=1`，把调用点还原成修复前的 4 参数形式）：
  `AssertionError: the first sync after a cold start must keep the record the restored draft is bound to`，exit 1。
- 修复后：进程 1 pid 20824 / 进程 2 pid 26204，`kept: true`，恢复的编辑可见，
  `keepLocalEdit` 生成新记录而墓碑保持 `deleted: true`，exit 0。

---

## 未证明的风险

1. **未做真机 / 开发者工具验收。** 以上全部是 Node mock 契约测试，
   `verify:cloud` 自报「Not verified in WeChat DevTools or live CloudBase」。
   真机行为（尤其 `wx.showModal` 与面板滚动）未验证。
2. **草稿会长期「钉住」被墓碑化的记录。** 这是第二个窗口修复的直接后果：
   只要 `savor-draft-v1` 还指向某条已被云端删除的记录，该记录就会一直留在日记里。
   用户仍有出口（重开编辑器保存 → 走 `DELETED` → `keepLocalEdit`，或「以云端为准」丢弃），
   但**放弃编辑而不清草稿**会让该记录长期可见。未做 UI 提示。
3. **「以云端为准」仍是破坏性的。** 对墓碑行它依旧清空 memory 与 `op.memory`，
   内容不可恢复。现在它从「唯一选项」变成了**有意的丢弃选择**，但未加二次确认文案。
4. **`重试同步` 对 `canResolve` 行为仍是空操作**（既有设计：需显式解决的操作不盲目重试）。
   墓碑行现在有了可用动作，因此该提示不再误导，但按钮本身对该行依旧什么都不做。
5. **UI 哈希清单已按授权更新，但未经原生视觉复核。**
   `tools/fixtures/regression/ui-approved-updates.json`、`tools/ux-remediation-review.json`、
   `tools/stage6-refactor-review.json` 中 `miniprogram/components/sheet/index.wxml` 的哈希链
   已按新文件更新（理由字段记录了本次授权）。这属于**用户授权的 UI 变更**，
   原生渲染验收仍为 `NOT_EXECUTED`。
6. **同类的 `mergeCloud` 覆盖缺口未逐一排查。** 本轮只补了「编辑草稿」这一条通道。
   `localChanges` / `cloudHidden` 等其它本地状态是否也需要类似的墓碑豁免，未做穷尽审计。
