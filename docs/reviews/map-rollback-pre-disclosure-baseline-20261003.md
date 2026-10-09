# 外科式回退到 pre-disclosure baseline（2026-10-03）

> 目标：把 `pages/map/**` 恢复到 `docs/reviews/camera-image-pipeline-completion-20261002.md` 的
> 生产状态，**只**回退 disclosure / affordance 实验链。
> **不做** git reset / checkout / clean；**不动**其它页面；**不修** disclosure 问题。

---

## 1. Baseline 的确定（用证据，不靠记忆）

按评审文档的 mtime 排出真实时间线：

| 时间 | 文档 | 性质 |
|---|---|---|
| 16:28 | `map-camera-motion-20261002.md` | 相机第 1 轮 |
| 17:40 | `map-camera-continuity-image-pipeline-20261002.md` | A→B 连续性 + 图片管线 |
| **18:05** | **`camera-image-pipeline-completion-20261002.md`** | **← BASELINE** |
| 18:57 | `map-card-disclosure-continuity-20261002.md` | **第一次 disclosure 报告** |
| 19:21 / 19:45 / 20:07 / 20:44 / 00:05 / 02:14 / 02:32 | affordance 空间 / 手势 / native 审计 / native 迁移 / 终局 / 恢复 / fan-out 审计 | 全部 post-baseline |

⇒ **Baseline = 18:05 的状态。**

### 快照甄别

`ckpt-backup/` 里逐份探测：

| 快照 | 时间 | 判定 |
|---|---|---|
| `index.js.before-red` | 16:12 | **太早** —— 没有 A→B 连续位移（无 `cameraTransition`/`stepCameraTransition`/`panPoint`） |
| **`index.js.before-red2`** | **18:50** | **有** A→B 连续位移；**无** `mapAffordances`/`syncDrawerAnchors`/`startGestureTracking`/`sampleGestureCamera`/`gestureSampleRequest`/`cameraOwner` |

`before-red2` 只比 baseline 多**一个 Phase-1 改动**。逐方法比对 16:12 快照：
`onMarkerTap` / `onTogglePlaceCard` / `onClusterClose` **完全相同**，
唯一差异是 `selectMapMemory` + `onClusterPick` + 一段注释。

⇒ **baseline JS = `before-red2` 反向应用那一个 Phase-1 块**（86,955 B）。
交叉核对：重建后的 `selectMapMemory` / `onClusterPick` 与 16:12 快照**逐字一致**；
`stepCameraTransition`/`scheduleCameraFrame` 仍在；disclosure 符号全无。

---

## 2. POST-BASELINE CHANGE LEDGER

| FILE | BASELINE STATE | POST-BASELINE CHANGE | PHASE | ROLLBACK ACTION | 结论 |
|---|---|---|---|---|---|
| `pages/map/index.wxml` | `4522d594…` | 删 `.place-collapse`；加 native callout 块；去掉 `.place-expand` 的 `bindtap/aria-*`；加注释 | 4/5/6 | 全部反向 | **REVERT** → 哈希 **完全一致** |
| `pages/map/index.wxss` | `c13016f3…` | 删 `.place-collapse` 定位规则；加 `.native-affordance*`；去掉 `pointer-events:auto`；`.place-collapse-visual` 组**位置被挪** | 4/5/6 | 全部反向（含把 `.place-collapse-visual` 移回原位置） | **REVERT** → 哈希 **完全一致** |
| `pages/map/index.js` | `before-red2` − Phase 1 | Phase 1 sticky（`selectMapMemory` 加 `reveal`、不再强制 `cardCollapsed:false`）；Phase 2 `cameraLiveCentre`/`syncDrawerAnchors`；Phase 3 手势采样；Phase 4/5 `mapAffordances`/`buildAffordance`/`syncAffordanceState`/`AFFORDANCE_GLYPH`；Phase 6 `drawerRenderMode` | 1–6 | 整体替换为重建的 baseline | **REVERT** |
| `pages/map/index.js` — `resolveCardPreview` + `CARD_PREVIEW_LONG_EDGE` | **存在** | 曾删除（卡片改绑原图） | 5 | baseline 里本就有 ⇒ **已随之恢复** | **KEEP（恢复）** |
| `utils/mapCamera.js` | — | **未改** | — | — | **KEEP** |
| `utils/mapMarkers.js` | — | **未改**（本轮只是审计） | — | — | **KEEP** |
| 4 个 `chevron-{down,up}{,-dusk}.png` + `build-lucide-chevron-png.py` | **不存在** | 为 native disclosure 新增 | 4 | 已 Safe Local Archive 到 `.workbuddy-ai/scratch/map-camera/removed-native-disclosure/` | **REVERT（归档，未删）** |
| `tools/fixtures/moved-build-sources.json` | `runtimePngs` 11 条 | 15 条 | 4 | 还原为 11 | **REVERT** |
| `tools/verify-package-budget.cjs` | `15` | — | 4 | 还原为 `11` | **REVERT** |
| `tools/verify-icons.cjs` | `<s-icon>` 计数 `88` | `87` → 又改回 `88` | 4/5 | 现为 `88` | **REVERT（已是 baseline 值）** |
| `tools/verify-map-camera-motion.cjs` | 26 个测试（G/M/O/F） | 加 C\*（Phase1）、CD\*（Phase5）、S\*/R\*（Phase2/3）；改 M6 尾巴 | 1–6 | 删除 523 行 post-baseline 测试；M6 恢复为「只隐藏命中区」 | **REVERT** |
| `tools/verify-cloud.cjs` | HEAD 版两处 | 改 `map card …` 测试；加 native callout 断言；改 gesture 可见性断言 | 4/5/6 | 三处全部恢复为 baseline 行为 | **REVERT** |
| `tools/verify-image-cache.cjs` V3 | `cardEdge===512`、`sizes.size===2` | 改成「卡片无派生尺寸」 | 5 | 还原 | **REVERT** |
| `tools/verify-detail-original.cjs` D8 | 「卡片**可以**用 preview 变体」 | 改成「必须绑原图」 | 5 | 还原 | **REVERT** |
| `tools/verify-map-motion.cjs` | — | 改「手势不再隐藏组」 | 3 | 还原为「手势隐藏命中区」 | **REVERT** |
| `tools/verify-map-overlay-drawer.cjs` | D3 断言 `customCallout === undefined` | 改成「选中 marker 携带 callout」 | 4/5 | 已还原 | **REVERT** |
| `tools/map-identity-review.json` | `4522d594…` / `c13016f3…` | **从未改动** | — | 无需动 | **KEEP（未推进）** |
| `docs/reviews/map-*.md`（7 份） | — | 新增审计/实施记录 | 1–7 | **保留为历史** | **KEEP** |

**没有任何 baseline 之后与 disclosure 无关、却仍需保留的 Map 改动。**

---

## 3. 回退后的 baseline 比对

| 文件 | Baseline | 回退后 | 结果 |
|---|---|---|---|
| `pages/map/index.wxml` | `4522d59434badb2c180a7bbebfb26e8a2415611a53df5d3bbd14ff31247e52e9` | 同 | ✅ **EXACT** |
| `pages/map/index.wxss` | `c13016f30f8e4b7ed7779990d712cc145035d59401d2dda52b291edc2406a844` | 同 | ✅ **EXACT** |
| `pages/map/index.js` | 重建基线 86,955 B | 同 | ✅ 逐方法核对 |
| `utils/mapCamera.js` | — | 未改 | ✅ |
| `utils/mapMarkers.js` | — | 未改 | ✅ |

> 两个哈希与 `tools/map-identity-review.json` 的**注册值逐字节相同** ⇒
> **FROZEN HASH RESTORED**（恢复旧已批准状态，**不是**新设计 ⇒ **不推进 checkpoint**）。

---

## 4. 移除清单

- **Disclosure 实验代码**：`mapAffordances` / `buildAffordance` / `syncAffordanceState` /
  `AFFORDANCE_GLYPH(_DUSK)` / `affordanceIndex` / disclosure `customCallout` /
  `native-affordance*`（wxml+wxss）/ `<cover-view slot="callout">` disclosure 块。
- **手势追踪**：`cameraOwner` / `startGestureTracking` / `stopGestureTracking` /
  `sampleGestureCamera` / `gestureSampleRequest` / `cameraLiveCentre` / `syncDrawerAnchors`。
- **native-callout 实验**：`drawerRenderMode` 回到 `'view-overlay'`（与 baseline 同值）。
- **marker-integrated / fan-out**：**从未写入生产代码**（本轮只做了审计与运行时探针）⇒ 无残留。
- **测试**：C\*/CD\*/S\*/R\* 共 523 行；`verify-cloud` 3 处、`verify-map-motion` 1 处、
  `verify-image-cache` V3、`verify-detail-original` D8 恢复为 baseline 口径。

---

## 5. Overview 按钮（P0）

### 根因审计

`recenter()` 只做四件事：`stopDrawerReveal()` → 计算保留的 `selectedId` →
`setData({query,filter,selectedId,showFilters,clusterOpen})` → `applyFilters('','all',keep,'overview')`。

- 绑定：`.recenter-map` 上的 `bindtap="recenter"`（**无中间层**）。
- **不调用** `onDrawerToggle`，**不调用** `onTogglePlaceCard`。
- **不读** `drawerRenderMode`。

⇒ **`recenter` / `onDrawerToggle` / `onTogglePlaceCard` / `overviewPlan` / `drawerRenderMode`
之间没有任何错误耦合。** 用户观察到的损坏来自 post-baseline 的 **arm A（`native-callout`）**
与 marker 实验对整页状态的影响，而不是 Overview 自身逻辑。

### 真机结果（OPPO PKB110 / Android 16 / 359×622）

| 检查 | 结果 |
|---|---|
| button exists | ✅（`.recenter-map` + `bindtap="recenter"`） |
| tap received / handler invoked | ✅ `recenter()` 触发，`applyFilters(..., 'overview')` |
| camera actually moves | ✅ scale 13 → 10，centre 改变 |
| all valid markers fit | ✅ `usableMarkers: 2 / insideViewport: 2 / allFit: true` |
| repeated tap stable | ✅ scale 三次都是 10 |
| no drawer / disclosure side effect | ✅ `drawerToggles: 0`, `disclosureToggles: 0` |
| selection preserved | ✅ `selectedPreserved: true` |

**⚠️ 但这次真机跑的是「中间版本」**：探针显示 `renderMode: native-callout`、
`hasSyncDrawerAnchors: true`、`hasStartGestureTracking: true`、`selectMapMemoryArity: 3`
⇒ 手机上是**回退前**的构建，IDE 尚未重新编译。
⇒ **P0 的最终判定需要重推一次回退后的代码再测**（见 §7）。

---

## 6. 验证

| 命令 | 结果 |
|---|---|
| `npm run verify` | **361/361 PASS** |
| `verify:cloud` | **272/272 PASS** —— **无需干跑**，因为 wxml/wxss 已回到注册值 |
| `verify:all` 54 项逐个独立运行 | 见 §6.1 |
| `verify:map-camera-motion` | **26/26**（G/M/O/F；post-baseline 的 C\*/CD\*/S\*/R\* 已移除） |

### 6.1 全量套件

`verify:all` 的 54 个条目**逐个独立运行** = **54 OK / 0 FAIL**。

**测试数下降是预期的**：post-baseline 的 disclosure 测试已被移除（baseline 不存在这些契约）。
`verify:map-camera-motion` 从 47 降到 **26**（移除 523 行 post-baseline 测试）。

### 6.2 一个重要的方法论发现

回退 WXSS 时，规则**内容**全部正确、但 `.place-collapse-visual` 那 4 条的**位置**被我放在了
`.place-collapse` 之后，而 baseline 把它们放在 `.pending-close` 之后（文件靠后处）
⇒ **哈希不同**。把它们**移回原位置**后哈希立刻完全一致。

⇒ **恢复一个冻结文件时，必须连「规则在文件中的位置」一起恢复**，只对内容不够。

---

## 7. 已知遗留

1. **DISCLOSURE ISSUE — DEFERRED / NOT FIXED**（按指令不修）：
   `A collapsed → B auto-expands` 会重新出现（`selectMapMemory` 恢复为强制 `cardCollapsed:false`）；
   marker 旁的按钮在拖拽时会与 marker 不同步（`view-overlay` 采样架构，见 §8）。
2. **真机需重推**：当前手机跑的是中间构建，P0 的最终结论待重推后确认。
3. **文档状态**：7 份 post-baseline 评审文档保留为历史；本轮文档明确记录
   `DISCLOSURE / AFFORDANCE EXPERIMENTS — ROLLED BACK / DEFERRED`。

---

## 8. 状态

- **MAP CAMERA + IMAGE PIPELINE BASELINE — RESTORED**
- **OVERVIEW BUTTON — RESTORED**（真机待重推确认）
- **DISCLOSURE / AFFORDANCE EXPERIMENT CHAIN — ROLLED BACK**
- **MAP DISCLOSURE ISSUE — DEFERRED / NOT FIXED**
- **CHECKPOINT — NOT ADVANCED**
