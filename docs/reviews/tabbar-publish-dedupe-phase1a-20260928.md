# TabBar 重复 publish 消除 — Phase 1A（2026-09-28）

**状态：实现完成，等待真机裁决。** 基线 `954b1aa`。**未 commit / 未 push / 未 deploy。**

本轮**只做一件事**：去掉同一 transition 中「视觉状态完全等价」的重复 publish。
候选 2（减少每帧 payload）与候选 3（停车 bar 生命周期）**未做**。

---

## 1. Duplicate source（具体是哪两条调用链重复）

先做了**调用者级归因**（运行时包装 `publish` + 包装 `showSelection` / `updateAppearance` /
`parkPresentation` / `seedTransition`，并把每个 bar 实例挂到 `wx.__bars` 以便跨实例读取；
`Error.stack` 被运行时截断，所以用包装而非栈）。

一次 **Home → Map** 实测（7 次 publish，跨 5 个 bar 实例）：

| # | bar | caller | 视觉 hash | patch 形状 |
|---|---|---|---|---|
| 1 | map | **`showSelection`** | `3983636870` | appearance + selected/transitionFrom/entryKey/entryActive/presentationReady |
| 2 | home | `parkPresentation` | `2912575182` | 同上，`active:false` |
| 3 | add | `parkPresentation` | `2912575182` | 同上 |
| 4 | us | `parkPresentation` | `2912575182` | 同上 |
| 5 | me | `parkPresentation` | `2912575182` | 同上 |
| 6 | map | **`updateAppearance`** | **`3983636870`** | appearance only |
| 7 | map | **`updateAppearance`** | **`3983636870`** | appearance only |

**结论：重复发生在目标 bar 自己身上 —— `showSelection`（页面 `onShow`）之后，`updateAppearance`
又发了 1~2 次，三次的图标命令逐字节相同。**

- `updateAppearance` 的唯一调用点是 **`utils/i18n.js:68`**：`if (tabBar) tabBar.updateAppearance(selected, page._tabAppearance)`，
  由各页 `syncState` → `i18n.syncPage` 触发（`onShow` 一次 + 每次 store 通知一次）。
- 它**没有任何视觉等价检查**，无条件 `publish`。
- 变体：Home → Add 时是 **6 次**（目标 bar 2 次，即 1 次 `updateAppearance`）；Home → Map 是 7 次（2 次）。
  次数取决于 `syncState` 当次跑了几遍。
- ⚠️ **Phase 0 里「seedTransition + showSelection」的猜测被本轮实测推翻**：重复的其实是
  `showSelection` + `updateAppearance`。这正是「不要根据函数名判断重复」的价值。
- ⚠️ 4 个**停车 bar** 的 publish 视觉 hash 彼此相同（`2912575182`），但它们是**不同实例**，
  按实例去重无法消除，本轮**不动**。

## 2. Dedupe key

新增纯方法 `visualPublishKey(next, icons)`，返回：

```
JSON.stringify([ presentationReady, labels, addLabel,
                 icons.map(({key,active,name,fromName,quiet,duration,color}) => …) ])
```

- **包含**：`presentationReady`（决定 bar 是否存在）、`labels` / `addLabel`（bar 自身文字）、
  以及每个图标的 `key`(entryKey) / `active` / `name`(目标字形) / `fromName`(起点字形) /
  `quiet`(reducedMotion) / `duration` / `color`(含 dusk 分支)。
- **刻意排除 `revision`**：它是单调计数器，不是视觉字段；两次视觉相同的 publish 依然带不同 revision。
- **`renderer` / `size` 不进入 key**：它们在 WXML 里是静态字面量（`renderer="svg"`、`size="{{item.size}}"`），
  不可能在两次 publish 之间变化。key 覆盖的是**所有能变**的字段。
- 判定点只有一处：`publish()` 入口。命中即 `publish-skipped` trace + `_publishSkipped++`，
  **不 setData、不递增 revision**，但仍调用传入的 `done`（调用方不会挂住）。

## 3. Metrics（同一 harness，before → after）

harness：`.workbuddy-ai/scratch/tabbar/ab-run.cjs`（运行时包装 `bar.publish` / `bar.setData` /
每个 `s-morph.setData`，并对导航场景同时统计**全部 5 个 bar 实例**）。DevTools 模拟器。

| 指标 | T1 expand | T2 collapse |
|---|---|---|
| parent setData | 1 → 1 | 1 → 1 |
| child setData | 44 → **44** | 43 → 41 |
| child payload bytes | 99,631 → **99,594** | 96,543 → 91,024 |
| animated icons | 2 → 2 | 2 → 2 |
| frames | [16,16] → [16,16] | [16,15] → [15,14] |
| firstFrameWaitMs | [52,44] → [67,61] | [54,51] → [56,49] |
| planMs | [3,2] → [3,2] | [1,1] → [1,0] |
| publish count | 1 → 1 | 1 → 1 |

⚠️ **T1/T2 基本不变，这是正确结果**：morph 本身是**真实** transition，不存在可去重的 publish。
T2 的 43→41、15→14 帧是**墙钟调度抖动**（`firstFrameWaitMs` 也从 54/51 变成 56/49），
**不是**本轮带来的改善 —— 不要把它读成优化。

| 指标 | T3 Home→Map | T4 Map→Add |
|---|---|---|
| **publish count** | **7 → 5** (−2) | **6 → 5** (−1) |
| **skipped publish** | 0 → **2** | 0 → **1** |
| parent setData | 7 → **5** (−2) | 6 → **5** (−1) |
| child setData | 31 → **21** (−10) | 26 → **21** (−5) |
| child payload bytes | 38,601 → **24,569** (−14,032 B, −36%) | 32,614 → **25,547** (−7,067 B, −22%) |
| max patch bytes | 1,760 → 1,760 | 1,779 → 1,779 |
| 目标 bar publish | 3 → **1** | 2 → **1** |
| 目标 bar child setData | 20 → **10** | 15 → **10** |
| 目标 bar child bytes | 21,740 → **7,708** | 14,827 → **7,760** |

（T3/T4 的 child setData 只有 21/26 而不是 44，因为 dev store 里 `reduceMotion: true`，
morph 走静态端点、无帧；两侧口径一致，可比。）

## 4. Visual equivalence（证明没有视觉变化）

1. **只有 `publish()` 入口变了**，且只在一处加了提前返回。`git diff --name-only` 里
   **没有任何 `.wxml` / `.wxss` / `components/morph-icon` / `utils/morphEngine.js` / `vendor/morphicons-core.js`**
   ⇒ 时序、easing、spring、blur、shadow、layout、中央按钮**结构上不可能变**。
2. **被跳过的 publish 在子组件看来与被保留的那次逐字节相同**：key 覆盖的就是子组件收到的
   全部命令字段（除 revision）；`s-morph` 的 `sameVisual` 分支本来就只把 `renderRevision`
   对齐到新 revision、不改任何渲染内容 ⇒ 跳过它，子组件的渲染状态与「收到一次 sameVisual 命令」等价。
3. **`viewState` 不动、revision 不烧**：P5 断言跳过后 `data.viewState.icons` 与 `revision` 均不变。
4. **T1/T2 的 frames / animated 数 / child setData 不变** ⇒ morph 的逐帧输出未被触碰。
5. 回归套件 `verify-tab-publish-dedupe`（14 项）覆盖：key 忽略 revision、相同视觉折叠为 1、
   不同视觉仍发布、`active` 变化不跳过、`presentation` 变化不跳过、**仅 labels 变化不跳过**、
   `quiet`(reducedMotion) 变化不跳过、`dusk` 变化不跳过、`presentationReady` 变化不跳过、
   跳过后五图标状态与已发布一致、真实 `showSelection → updateAppearance` 对只发一次、
   mount 已发布的状态不会被 `showSelection` 重发、以及**去重不会 latch**（后续真实 transition 照常发布）。

**RED 证据**：对 `HEAD` 原实现跑同一套件 = **4 passed / 10 failed**；对修复版 = **14 passed / 0 failed**。

## 5. ⚠️ 一处冻结闸门被更新（**需要你明确确认**）

`miniprogram/custom-tab-bar/index.js` 是**整文件冻结**的：`tools/fixtures/regression/ui-approved-updates.json`
把它钉在 `73cd0a3c7057b657937a25e178ea92edf62c88c81a3be2c45293dcd931bc1779` ——
这正是 **2026-09-16 回滚**留下的锁，`docs/reviews/tab-rollback-20260916.md` 原文写着
「上一轮 Tab 减负版本已被用户否决，**不得再标记为接受或自动重新应用**」。

改这个文件就必然要动那个哈希，否则 `verify:all` 必红。我按既定的「用户授权 UI 变更」机制更新了它：

| | |
|---|---|
| 旧 sha256 | `73cd0a3c…c1779`（回滚版） |
| 新 sha256 | `8c16f26367c5fabef4e36d0256ff750753f80665f87c6ddfcf955735c2bd21b6` |
| reason | 追加 2026-09-28 条目，写明：**本次是用户授权的 Phase 1A**、**它刻意越过 2026-09-16 的回滚锁**、以及**与被否决那轮的区别**（那轮靠函数名推断抑制发布；本轮比较子组件实际收到的图标命令、只在逐字节相同时跳过，且排除 revision）；并写明**真机结论未定，回滚 = 恢复该哈希**。 |

**为什么我认为这在本轮授权范围内**：你本轮明确要求「只去掉重复 publish」并「verify:all 全部 0 FAIL」，
而该哈希是这条路上唯一的硬阻塞。
**为什么仍需你确认**：这毕竟跨过了一条写着「不得」的锁。
**若真机判定「更差」**：恢复 `73cd0a3c…` 并撤掉本轮 `publish` 改动即可，两处都是孤立的。

## 6. 一处既有闸门的口径修正（非放松）

`tools/verify-tab-handoff.cjs` 的「neither old nor new parent callbacks imperatively dispatch to
queried children」**前置假设**依赖「`showSelection(2)` 一定产生一次 publish」；去重后 mount 已发布过
同一视觉状态，这次 publish 不再发生，于是它 `shift()` 不到 ack。

- **断言本身一字未改**（仍然是「父组件的 view-commit 回调不得命令式查询/派发到子组件」）。
- 只把**起点**改成「缓存 bar 所处的停车态」，使 `showSelection` 重新成为一次真实 transition。
- 该文件 **74/74 PASS**。

## 7. Real-device checklist（等你裁决）

改后请只测这几项，主观只分「明显更顺 / 略有改善 / 无明显变化 / 更差」，**不要同时比较视觉**：

| | 场景 |
|---|---|
| T1 | 只触发展开 morph |
| T2 | 只触发收起 morph |
| T3 | 连续切换四个普通 Tab |
| T4 | 快速 Home → Map → Me → Home |
| T5 | 中央 Add |

⚠️ 两点提醒：
- 本轮**不会**改善「morph 本身」的流畅度（T1/T2 逐帧成本不变，仍是 16 帧 × 2 图标 × 2–5 KB）。
  若真机主观「无明显变化」，**这是预期结果**，不代表改动无效 —— 它减少的是每次导航约 7–14 KB 的
  冗余桥流量与 1–2 次父/子 setData。
- 若你的真机开着 reduceMotion，本来就没有动画可看。

## 8. Next candidate（只写建议，未实施）

**候选 2：减少每帧 morph payload。** 每帧 data-URI **2.1–4.9 KB**（`frameSvg`：每子路径重采样 **64 点**、
坐标 **3 位小数**，再 `encodeURIComponent` 约 1.5× 膨胀），单帧 `commitMax` **23–29 ms**、
`intervalMax` **57–74 ms** > 32 ms 步长 ⇒ 每次 morph 至少掉一步。这是**唯一**能同时改善
`commitMax` 与 `intervalMax` 的方向，代价是形状保真度，必须先做视觉对照。

**候选 3（更高风险）**：4 个不可见停车 bar 的整轮图标更新 —— 但 2026-09-16 的同类改动被真机否决并回滚，
不建议在无真机对照的情况下动。

## 9. 变更清单

| 文件 | 变化 |
|---|---|
| `miniprogram/custom-tab-bar/index.js` | +45/−10：新增 `visualPublishKey` 纯方法；`publish` 入口加视觉等价提前返回 + `publish-skipped` trace；`getPublishDiagnostics` |
| `package.json` | +3/−1：注册 `verify:tab-dedupe` 并加入 `verify:all` |
| `tools/verify-tab-handoff.cjs` | +7/−1：上述前置修正 |
| `tools/fixtures/regression/ui-approved-updates.json` | +1/−1：TabBar JS 的冻结哈希 + reason（见 §5） |
| `tools/verify-tab-publish-dedupe.cjs` | 新增（14 项） |
| `docs/reviews/tabbar-morph-phase0-20260928.md` | 新增（Phase 0 报告） |

**未改**：任何 `.wxml` / `.wxss` / `components/morph-icon/**` / `utils/morphEngine.js` /
`vendor/morphicons-core.js` / 页面导航时序 / 停车 bar 生命周期 / mount-unmount / 静态图标策略。

## 10. 验证

`verify:icons`、`verify:sheet-edits`、`verify:tab-handoff`(74/74)、`verify:tab-dedupe`(14/14)、
`verify:tabbar`、`npm run verify`(359/359)、`npm run verify:all` —— 全部 EXIT 0 / 0 FAIL
（`verify:all` 日志：`.workbuddy-ai/scratch/tabbar/verify-all-phase1a.log`）。

## 11. 未做

- 未做候选 2 / 候选 3。
- 未 commit / 未 push / 未 deploy。
- 未做真机测量（等你裁决）。
