# Map 相机运动 — Marker Focus / Overview（2026-10-02）

**状态：IMPLEMENTED / STATICALLY VERIFIED / RUNTIME-VERIFIED（模拟器）/ 真机运动 = NOT VERIFIED。
STOP FOR VISUAL-MOTION APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy。
- **冻结 UI 面零改动**：`pages/map/index.wxml` `4522d594…`、`index.wxss` `c13016f3…` 与
  `tools/map-identity-review.json` 注册值**逐字节 MATCH**（见 §9），`verify:cloud` **272/272 EXIT 0**。
- 本轮只重开 Map 的**相机**范围：marker focus 的 camera transition、右侧 `+/-` 上方 overview 按钮的
  camera logic + animation。搜索栏 / marker 样式 / 卡片 / TabBar / POI / 颜色 / 阴影 / 间距**未动**。

---

## 1. CURRENT CAMERA MODEL（审计结论，改前实测）

### 1.1 点击链路

| 步骤 | 位置 | 行为 |
|---|---|---|
| marker 点击 | `pages/map/index.js: onMarkerTap` | 单 marker → `selectMapMemory(id)`；聚合 → `onDrawerToggle` |
| 选中更新 | `selectMapMemory` | `setData({selectedId, cardCollapsed:false, clusterOpen})` 然后 `applyFilters(query, filter, id)`（**viewportMode 未传**） |
| 统一出口 | `applyFilters` | 过滤 → 分组 → 组 `markers`/`mapDrawers`/`selected` → **一次 `setData`** → 回调里下发**一条**相机命令 |
| 命令 | `focusMapCamera(coords)` | 真机臂：`mapCtx.moveToLocation({latitude, longitude, success, fail})`；IDE 臂：`setData({latitude, longitude})` + `mapCtx.includePoints({points:[单点], padding})` |
| 卡片 | 同一个 `setData` | `selected` 与 `markers` 同批下发 ⇒ 卡片在命令之前就已落位 |

### 1.2 全览链路

`recenter()` → `applyFilters('','all',keep,'overview')`；`keep` 保持当前可见选中（不可见才回 `comptoir`）。

| 臂 | 行为（改前） |
|---|---|
| IDE | `overviewLocalFit = visible.length>1 && cameraFitLocal()` → 只写 `patch.latitude/longitude = 经纬度**算术平均**`，**不改缩放**；随后 `includePoints(全部可见点, [90,40,165,40])` |
| 真机 | 不写 prop；`includePoints(全部可见点, [90,40,165,40])` |

### 1.3 平台 API 事实（SDK 3.17.3，运行时枚举 + 实测）

`wx.createMapContext('savor-map')` 真实成员（运行时枚举，非文档印象）含
`getCenterLocation getRegion getScale includePoints moveToLocation setCenterOffset
translateMarker moveAlong setBoundary toScreenLocation fromScreenLocation on off once …`。
**没有 `setScale` / `setZoom` / `zoomTo` / `animateTo`，也没有任何带 `duration`/缓动的相机 API。**

实测（本机 DevTools 运行时，428×926，scale 13）：

| 通道 | 实测行为 |
|---|---|
| 绑定 `latitude`/`longitude` prop | **瞬时跳变**：写入后首个采样（27ms）即已在目标点；900ms 内 **161 次采样只有 1 个不同中心** |
| 绑定 `scale` prop | 生效但**向下取整**（13.5 → 13）；且**缩放变化被原生动画化**（17 → 10 实测约 2.3s 连续经过中间值） |
| `MapContext.includePoints` | **IDE 上静默无操作**：success/fail/complete 三个回调都不触发、相机不动 |
| `MapContext.moveToLocation` | **IDE 上不可用**：`moveToMapLocation:fail 开发者工具暂时不支持此 API 调试，请使用真机进行开发` |

⇒ **没有任何原生相机动画 API。** 中心点的唯一可用通道（prop）是瞬时的；
`scale` prop 是唯一能动画化的通道，但它**只作用于缩放，且只能承载整数**。

---

## 2. marker 瞬移的**确切根因**

`applyFilters` 在**同一个 `setData`** 里既写选中态、又写绑定相机中心：

```js
if (shouldFocus && viewportMode !== 'overview') {
  patch.latitude = selected.coordinates[0]; patch.longitude = selected.coordinates[1];
}
```

而绑定 prop 通道**是瞬时的**（§1.3）。于是时序是：

```
tap → setData(选中 + latitude/longitude) → 【相机瞬移完成】
    → 回调 → moveToLocation(...) → 相机已经在目标点 → 用户永远看不到这条命令
```

**用户看到的不是「命令没有动画」，而是「命令被 prop 写抢在前面、根本没被看到」。**
这就是「闪过去 / 画面被换成另一个位置」的来源。IDE 上更彻底：`includePoints` 是空操作，
所以 IDE 的相机完全由 prop 通道驱动 = 纯瞬移。

---

## 3. 选定策略（单一候选，未做 A/B/C 三套）

**「一次意图 = 一条原生命令」**，并让这条命令不再被 prop 预写抢占：

1. **真机臂不再预写绑定中心**（根因修复）。相机只由 `moveToLocation` 驱动，用户于是能看到
   平台自己的运动。命令成功后由**既有的** `onCameraViewportReady` → `getRegion` 回复把绑定中心
   对齐到真实视口（`cameraAnchorPending` 扩展到 `'focus'`），避免后续 `scale` 写把视野拉回旧中心。
2. **IDE 臂保留 prop 通道**（那是 IDE 唯一可用的通道），但用**实测遮挡**而非固定 padding。
3. **相机 padding 从实测遮挡推导**：搜索栏底 / 工具列左沿 / 卡片顶 —— 三个都会随设备、语言、
   卡片折叠状态变化。**运行时实测值 `[229, 74, 351, 0]`**，替换写死的 `[90, 40, 165, 40]`。
4. **全览 = 有选定 level 的 fit**：用已验证的 Mercator 模型算出精确 fit level，
   `floor` 后 clamp 到 `[3, 16]`，再合成一个**该 level 的 bbox** 交给 `includePoints`；
   IDE 臂用同一 plan 写 prop（中心按可视区合成 + 整数 level）。
   - 退化集合（1 个 marker、或同坐标多个）⇒ 不再要求平台的退化 fit（那会跳到最大级别），
     而是落在 `OVERVIEW_MAX_SCALE = 16`（实测可视带约 0.7–0.8 km）。
   - 极端跨度 ⇒ 落在平台自己的下限 3（`min-scale="3"`）。
5. **0 marker ⇒ 不下发任何相机命令**（保留当前视野）。
6. **全览不取消选中**（`recenter()` 语义不变）。

### 明确**拒绝**的方案：JS camera interpolation

理由（可复现，不是偏好）：prop 插值必须按帧写绑定路径，每次写入都会触发
`regionchange` → `readMapScale` / `syncStackPositions` / `refreshStackFrame`；
实测**一次 focus 已经产生 7 组 begin/end**，按帧写会把整个 `mapDrawers` 数组每帧推过桥
—— 正是 P0-1/P0-2 与 drawer 性能轮次花力气消除的东西。同时 `scale` prop 只能整数，
插值会变成一级一级的跳档。**该方案会重新制造「切回 Map 又重新加载」类问题，故不采用。**

---

## 4. 改动文件

| 文件 | 性质 |
|---|---|
| `miniprogram/utils/mapCamera.js` | **新增**，纯几何（无 wx / 无页面状态），可 Node 直测 |
| `miniprogram/pages/map/index.js` | 相机链路（`applyFilters` / `focusMapCamera` / `onCameraViewportReady` / 新增 `syncCameraPadding` `cameraViewport` `cameraPadding` `planOverview`） |
| `tools/verify-map-camera-motion.cjs` | **新增** 24 条相机套件（含 RED 证明，§10） |
| `package.json` | 新增 `verify:map-camera-motion`，并挂进 `verify:all` |
| `tools/verify-map-viewport.cjs` `verify-map-scale-echo.cjs` `verify-map-empty.cjs` `verify-map-reveal-cadence.cjs` `verify-map-overlay-drawer.cjs` `verify-marker-apply.cjs` `verify-map-trace.cjs` `verify-map-drawer-motion.cjs` | 只**补上页面的真实新依赖** `utils/mapCamera`（这些 harness 用白名单 stub `require`）。**未放宽、未删除任何断言** |
| `docs/reviews/map-camera-motion-20261002.md` | 本文件 |

**未改**：`pages/map/index.wxml`、`index.wxss`、`tools/map-identity-review.json`、store、renderer、TabBar、
搜索、POI、卡片、任何主题样式。

---

## 5. marker-focus 的 start / mid / end 证据

模拟器，428×926，platform `devtools`。计数器装在**页面实例方法**上（`focusMapCamera` / `applyFilters` /
`onMapRegionChange` / `readMapScale` / `syncStackPositions`）与页面自己的 `mapCtx` 上（各包一次）。

| 场景 | 结果 |
|---|---|
| 单次点击（相机被先移到远处） | **`focus: 1`**、`applyFilters: 1`、`fits: 1`（IDE 臂的单点 fallback）、`moves: 0` ⇒ **一次意图一条命令** |
| 焦点前后 `commandScale` | 13 → 13 ⇒ **focus 不改缩放**（平台没有「中心+缩放一条命令」的能力，本轮不伪造） |
| 相机 start / mid / end | 命令前后中心由远处跳到目标；IDE 臂 distinct = 1 ⇒ **IDE 上是瞬移**（§1.3 的平台限制） |
| 真机臂 | 本机**无真机附着**（`platform: devtools`）⇒ `moveToLocation` 路径**无法在本轮实测** |

> **FRAME-LEVEL CAMERA PROOF UNAVAILABLE（真机）**：本机没有真机调试会话，
> `moveToLocation` 在 DevTools 上直接报错。真机上「命令本身是否连续」**本轮没有测到，也不声称**。
> 本轮能证明的是**行为契约**（一意图一命令、无预写、无队列、last-intent-wins）与
> **几何正确性**（命令落点与模型预测一致），不是运动质感。

---

## 6. overview 的 start / mid / end 证据

| 场景 | 结果 |
|---|---|
| 从 (31.60, 120.90) scale 17 按全览 | 命令 payload：`points` = 合成 bbox 两角、`padding` = `[229,74,351,0]`、`cmdScale` 17 → **10** |
| 轨迹 | t=0 中心已在 (31.23293, 121.28415)、scale 17；**scale 连续经过中间值**（12.07 / 12.23 被采到），t≈2.7s 落到 **10** ⇒ **缩放由原生动画化，中心由 prop 瞬时到位** |
| 收敛终态 | 中心 (31.23296, 121.28413)，scale **10** == 计划 level；与几何模型预测的合成中心相差 **≈4px** |
| 重复按全览 | payload **逐字节相同**，相机不再移动（同值写）⇒ 稳定、不漂移 |
| 0 marker | **`fits: 0, moves: 0, focus: 0`**，`plan: null` ⇒ 不下发任何命令 |
| 1 marker | `fits: 1`、level **16**（不是最大 18）、payload 是围绕该点的合成 bbox |
| 6 marker（真实数据） | `fits: 1`、level 10、全部 marker 落在可视带内（§8） |

---

## 7. 交互与回归

| 场景 | 结果 |
|---|---|
| **快速 A→B** | 两次点击 = **2 条命令**（`focus: 2`），无积压；终态选中 = **B**（`lastIntentWins: true`） |
| **用户手势打断** | 手势 begin 后 `zoomPendingTarget` 被清空（`true`）；begin/end 全程 **`fits: 0, moves: 0, focus: 0`** ⇒ 程序相机不抢用户控制、手势结束后不再补发命令 |
| **Tab Map→Home→Map**（干净状态，连续两轮） | **`fits: 0, moves: 0, focus: 0, applyFilters: 0`**；`markers` **同一对象**（`markersReused: true`）、中心/缩放/选中/POI/卡片全部不变 ⇒ **P0-2 缓存不变量未回归** |
| **POI 关 → 开** | 两次切换 **`fits: 0, moves: 0, focus: 0`** ⇒ 与相机完全解耦；`showNativePoi` 正确往返 |
| **PEARL / DUSK** | 相机 plan payload **逐字节相同**（`identical: true`，level 10，212 bytes）⇒ geometry / camera / timing 同源，只有视觉主题不同 |
| 0 / 1 / 多 / 集中 / 跨区 / 极端跨度 | §6 + §8：0 → 无命令；1 与「高度集中」→ 上限 16；极端跨度 → 下限 3 |

> POI 切换会触发一次 `applyFilters`（`store.updateSettings` → revision 变化 → `syncState`）。
> 这是**既有**行为，与相机无关（相机命令为 0），本轮未改。

---

## 8. before / after 构图证据（数值化，非截图）

用**生产** `utils/mapCamera` 模块 + 真实 14 个 marker 坐标 + 实测遮挡几何
（可视带 y ∈ [229, 575]，右界 x ≤ 354）复算每条链路把 marker 放在哪里：

| 链路 | 落在可视带 | 落在遮挡区 | 屏幕外 |
|---|---|---|---|
| **BEFORE / 真机臂**（`includePoints` + `[90,40,165,40]`，自然 fit 10.91） | **1 / 14** | **13 / 14**（12 个在顶栏/搜索栏下、1 个在卡片下） | 0 |
| **BEFORE / IDE 臂**（算术平均中心、缩放不变 17） | 0 | 0 | **14 / 14** |
| **AFTER**（实测 padding + level 10 + 合成中心） | **14 / 14** | 0 | 0 |

- 旧 padding 顶部只留 90px，而搜索栏实际占到 **221px**；底部只留 165px，而卡片+TabBar 实际占 **351px**
  ⇒ fit 把 marker 排进了 chrome 下面。这是**可复现、可量化**的缺陷，不是观感描述。
- AFTER 的 marker 落点：y ∈ [250, 554]、x ∈ [84, 270]，全部在可视带内。
- 截图存档：`.workbuddy-ai/scratch/map-camera/after-overview.png`、`after-focus.png`（374×809，
  **模拟器**，不是硬件证据；静态图也**不能**证明运动质量）。

---

## 9. 验证结果

| 门禁 | 结果 |
|---|---|
| `npm run verify` | **360/360 PASS · FINAL STATIC VALIDATION: PASS**（需本机已知的 stdin shim，见 §11） |
| `npm run verify:cloud` | **272/272 EXIT 0** —— 冻结哈希链全绿 |
| `npm run verify:all` | **EXIT 0**（5m19s，全部顶层套件跑完） |
| `tools/verify-map-camera-motion.cjs` | **24/24 PASS**（新增） |
| 冻结面哈希 | `index.wxml` `4522d594…` / `index.wxss` `c13016f3…` == 注册值 ⇒ **MATCH，检查点未推进** |

---

## 10. 新套件的 RED 证明

新增套件必须先在旧行为下变红。做法：临时把 `applyFilters` 的焦点分支还原成
「无条件写绑定中心」（旧代码），跑套件：

```
FAIL M1 a marker tap issues one native command and never pre-writes the bound centre:
     the prop channel must not be used as a camera on a device
23 passed, 1 failed
```

随后**逐字节还原**（`grep -c "TEMPORARY RED PROOF"` → 0），套件回到 **24/24 PASS**。

---

## 11. 剩余限制（不假装已解决）

1. **平台没有相机动画 API**（§1.3）。真机上 `moveToLocation` / `includePoints` 是否连续
   **本轮没有测到**；本机无真机附着，且这两个 API 在 DevTools 上不可用。
   ⇒ 真机运动质量 = **NOT VERIFIED**。
2. **IDE 上焦点仍是瞬移**：IDE 没有可用的命令式相机，prop 是唯一通道，而它是瞬时的。
   本轮无法也不应伪造 IDE 动画。
3. **marker focus 的构图未改**：`moveToLocation` / IDE 单点 fit 都把目标放在**组件中心**，
   而不是可视区中心（实测差异：垂直 ≈61px、水平 ≈26px）。
   ⚠️ **改它必须改 `tools/verify-cloud.cjs` 中已冻结的相机断言**
   （`moves` 必须等于**原始 marker 坐标**、IDE 臂 `fits[0].points` 必须等于**原始单点**）
   ⇒ 属「改既有守卫」，**本轮未做，需明确批准**。
4. **marker focus 没有目标缩放**：平台没有「中心+缩放一条命令」的能力；加缩放必须另开通道
   （= 本文件拒绝的「先瞬移中心再 zoom」或插值）。⇒ 本轮 focus 保持**中心-only**。
5. **卡片时序未加延迟**：卡片与命令同批下发（既有行为）。因命令现在是唯一相机动作，
   两者不再互相抢拍；**未**引入人为延迟。
6. **本机验证链需要 stdin shim**（本机已知限制，非本轮引入）：
   `NODE_OPTIONS="--require <无空格路径>/node-sync-stdin-shim.cjs"`。带空格的仓库路径放进
   `NODE_OPTIONS` 会被按空格拆分 ⇒ 本轮把 shim 复制到 `%TEMP%` 下再引用。

---

## 12. KEEP / REVISE 建议

| 项 | 建议 | 理由 |
|---|---|---|
| **A. Marker Focus Camera** | **KEEP** | 根因（prop 预写抢占）已消除且有 RED/GREEN 证据；一意图一命令、last-intent-wins、手势零命令、focus 不改缩放，全部运行时实测。**真机运动质感仍待真机确认**（§11.1） |
| **B. Overview Camera** | **KEEP** | padding 由实测遮挡推导（旧值把 13/14 个 marker 排进 chrome）；level 有上下限、0/1/多状态安全；重复按稳定；构图 14/14 落入可视带 |
| A 的构图（可视区居中） | **REVISE —— 需批准** | 需要改 `verify-cloud.cjs` 的冻结相机断言，本轮按铁律未动 |
| A 的目标缩放 | **REVISE —— 需批准** | 需要换命令通道（架构变更）或引入被拒绝的插值 |

**最终一行：READY FOR MAP CAMERA MOTION VISUAL APPROVAL**
