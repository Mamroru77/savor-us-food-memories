# Map selected marker affordance — TRUE NATIVE BINDING（ROUND 0 审计，2026-10-02）

**状态：AUDIT COMPLETE / 生产代码未改 / 等产品裁决 1 个歧义后实施。
检查点未推进。`wxml` / `wxss` / `js` **均未改动**（本轮只读审计）。**

上一轮 `MANUAL DRAG AFFORDANCE TRACKING` 重新标记为 **REVISE**（用户真机判定：仍是两套独立位置时钟）。

---

## 1. 为什么 sampled tracking 不能满足产品要求

sampled tracking 的物理结构是：

```
map native compositor ──(marker 位置)──> 屏幕
        │
        └──(regionchange / getRegion)──> JS 估算 ──> setData ──> 另一个 overlay 层
```

marker 由**原生 compositor** 移动，affordance 由**JS 时钟**移动 —— 两者是**两个独立的更新源**。
无论采样多快，都存在：① 采样间隔内的位置差；② `getRegion` 往返延迟；③ `setData` → 渲染的延迟。
三者叠加 ⇒ marker 与 control 永远不是同一时刻的同一坐标。

**只要 control 的 screenX/screenY 需要 JS 计算，本轮就不能判 KEEP** ✓（与 brief 一致）。

---

## 2. 现有 native-callout 架构审计（代码级，逐条）

| 位置 | 事实 |
|---|---|
| `pages/map/index.js:130` | `drawerRenderMode: 'view-overlay'`（**默认**） |
| `index.js:438` | `customCallout: (groups[index].members.length>1 && !overlayMode) ? {display:'ALWAYS',anchorX:0,anchorY:0} : undefined` ⇒ **只有簇根、且只在 native-callout 臂**才挂 callout |
| `index.js:823` | `drawerOverlayMode() { return this.data.drawerRenderMode === 'view-overlay'; }` |
| `index.wxml:32-60` | `<cover-view slot="callout" wx:if="{{drawerRenderMode === 'native-callout'}}">` → `wx:for="{{mapDrawers}}"` → `marker-id="{{drawer.markerId}}"`；内含 `cover-image`（照片）、`cover-view`（**带 `catchtap="onDrawerToggle"` 的交互控件**）、分页条 |
| 真机/模拟器实测 | `drawerRenderMode='view-overlay'` 时 `markersWithCustomCallout = 0` ✓ 与 438 行规则一致 |

**⇒ 本项目已经存在一个「原生 marker-anchored 可交互 surface」的完整实现（簇抽屉），并且它今天就在被使用（native-callout 臂）。**

### NATIVE AFFORDANCE CAPABILITY MATRIX

| 能力 | 结论 | 依据 |
|---|---|---|
| 是否已能显示自定义 WXML | **能**（`cover-view` / `cover-image` in `slot="callout"`） | 现有 wxml |
| 能否承载可点击 expand/collapse 控件 | **能** | 现有 `cover-view ... catchtap="onDrawerToggle"` |
| tap 是否独立于 marker tap | **能** | `catchtap` 阻止冒泡；marker 自身走 `bindmarkertap` |
| 能否读取当前 selectedId | **能**（数据驱动；`mapDrawers`/`markers` 由 JS 依当前状态生成） | 现有实现 |
| PEARL / DUSK | **能** | 现有 callout 已按 `dusk` 切换 `cover-image` 资源 |
| iOS / Android 差异 | ⚠️ **`cover-view` 的 transform 过渡不保证**（代码注释已记录「只能在真机回答」）⇒ **静态控件安全，带动画的控件不保证** | `index.js:119-122` |
| 多 marker 但只显示 selected 的 affordance | **能**（只给 selected marker 挂 `customCallout`） | 数据驱动 |
| A→B 是否必须 remount map | **不需要**：`customCallout` 是 `markers` 数组的一部分，选择变化 = `setData({markers})` | 现有实现 |
| 为什么现在不是默认 | **不是能力问题**：320ms 抽屉动效被刻意移出原生桥（`view-overlay` 让动效走普通视图层），并规避 `cover-view` transform 的平台不确定性 | `index.js:91-122` + 抽屉动效轮次评审 |

**⇒ 原生可交互锚定 = VIABLE。** 不存在「NATIVE INTERACTIVE ANCHOR NOT VIABLE」的情形，因此不触发 brief 的 FALLBACK 分支。

---

## 3. 需要你裁决的 1 个歧义（**这是本轮停下的唯一原因**）

brief 要求「EXPAND/COLLAPSE CONTROL 原生锚定到 selected marker」，但**当前 UI 里 marker 下方并没有 expand/collapse 控件**：

| 现存控件 | 位置 | 定位方式 |
|---|---|---|
| `.place-collapse`（圆形 chevron） | **左下角**，与底部卡片同组 | **页面绝对定位**（`left:36rpx; bottom:calc(tab-clearance+24rpx)`） |
| `.place-expand`（收起态名字条） | 左下角 | 页面绝对定位 |
| 抽屉堆叠按钮（`stack-button-*.png`） | **簇根 marker 下方** | 原生 callout（native-callout 臂）或 JS 投影（view-overlay 臂） |

⇒ 你说的「marker 下方 disclosure button」在**单 marker** 情形下**目前并不存在**。两种可能的意图：

- **(甲)** 指**簇根下方那个堆叠按钮**（上一轮我让它逐帧跟随的那个）⇒ 迁移范围小：把它改成原生锚定（或把该臂设为默认），
- **(乙)** 指**底部的 expand/collapse 控件应当搬到 selected marker 下方并原生锚定** ⇒ 这是一次**控件位置的视觉变更**（brief 同时要求「不要产生视觉变化」，两者冲突，必须由你定夺）。

**选错会直接造成视觉回归**，所以我不猜。

---

## 4. 实施计划（选定 (甲) 或 (乙) 后即可执行；均为最小结构改动）

共同部分（与选择无关）：

1. **新增数据** `mapAffordances`：**最多一个**元素（当前 selected marker），字段 = `{markerId, collapsed, asset}`。
2. **WXML**：在 `<map>` 内新增一个独立于抽屉的 `<cover-view slot="callout" wx:for="{{mapAffordances}}" marker-id="{{a.markerId}}">`，
   内含一个 `cover-view` + `cover-image`，视觉**逐值复制**已批准的 `.place-collapse-visual`（56rpx 圆面 + `chevron-down`，`collapsed` 时 `rotate(180deg)`），
   `catchtap="onTogglePlaceCard"`（**独立于 marker tap**）。
3. **JS**：`mapAffordances` 随 `applyFilters` 的同一个 `setData` 一起更新（**选择变化 = 数据更新，不 remount**）；
   删除 disclosure 对 `startGestureTracking` / `sampleGestureCamera` / `syncDrawerAnchors` 的**位置**依赖
   （这些方法本身保留，仍服务抽屉行等 overlay —— brief 明确要求「不要盲目删整个方法」）。
4. **WXSS**：只加新 callout 控件的静态尺寸/偏移（**无 transform 过渡**，规避 `cover-view` 平台不确定性）。

若选 **(甲)**：额外把 `drawerRenderMode` 的默认改为 `native-callout`（或按簇根分流），
并**必须重跑抽屉动效/覆盖层相关套件**（`verify-map-drawer-motion` / `verify-map-overlay-drawer` / `verify-map-motion` / `verify-map-trace` / `verify-marker-apply`），
因为那是 `view-overlay` 默认值的既有理由。

## 5. 预期代价（必须提前说明）

- **WXML 改动 ⇒ 冻结哈希链按设计变红**（`verify:cloud` 会红）。
  按 `AGENTS.md`：**不推进检查点**，回报「精确的预期红」并等你批准。这是本轮唯一无法同时满足「改 WXML」与「链全绿」的地方。
- 迁移后 disclosure 的 `getRegion` / 投影 / `setData` 位置写入应为 **0**（G1–G5 可直接断言）。

---

## 6. 本轮已完成 / 未完成

- ✅ ROUND 0 审计（§1–§2）、能力矩阵、实施计划、代价说明。
- ⛔ **未改任何生产代码**（brief：「先不要改生产代码」）。
- ⛔ 未做真机 native proof：本轮结束时 automator 已落回模拟器（`platform: devtools`），
  且 `view-overlay` 下 `customCallout=0`；真机复验需要先把设备会话重新挂上并选定 (甲)/(乙)。

---

## 7. 建议

| 项 | 建议 |
|---|---|
| **A. SCREEN-SPACE SAMPLED AFFORDANCE** | **REMOVE**（作为 disclosure 的最终架构） |
| **B. NATIVE MARKER-ANCHORED AFFORDANCE** | **KEEP**（机制已在库内被使用，能力矩阵 9/9 通过） |
| **C. DISCLOSURE STATE CONTINUITY** | **KEEP**（上一轮已真机通过，本轮不动状态语义） |
| **D. MAP CAMERA CONTINUITY** | **KEEP**（不动 camera travel 本身） |

**BLOCKED ON ONE PRODUCT DECISION**（§3 的 (甲) / (乙)）——
确认后即可按 §4 实施，预计改动集中在 `pages/map/index.{js,wxml,wxss}` 三处。
