# Map 缩放步进器 — Phase 0.5 技术前提报告（2026-09-28）

**状态：COMPLETE（真机已完成）。** 真机 = **OPPO PKB110 / Android 16 / 微信基础库 3.17.3**，
359×789 @ dpr 3.5，经「真机调试」由自动化驱动（`platform: "android"`）。

- 未 commit / 未 push / 未 deploy。
- 最终 `git diff` 为空；`git status --short` 只有本报告一个 untracked。
- 冻结链路（view-overlay drawer / grouping / marker renderer / batching / ready rebind /
  photo derivative / place card / search / positioning / TabBar）**未改**：
  `verify-cloud` 272/272 PASS、`verify-structure` 6/6 PASS。
- 临时探针页已用 **Safe Local Archive** 归档（未 `rm`），`app.json` 已还原 —— 见 §9。

---

## Native zoom UI

### SOURCE

**结论：不是平台原生控件。右侧那个「缩放控件」是本项目自己的 `.recenter-map` 按钮。**

真机证据三条，互相独立：

1. **裸地图对照（决定性）**：临时探针页 `pages/zoomprobe/index` 放了一个**全屏裸 `<map>`**，
   `enable-zoom="true"`、无任何自定义控件、无 `cover-view`、无 `controls`。
   真机截图 `dev-bare.png` 的右侧整条带（`zoom-bare-right.png`，4× 放大）**只有地图瓦片**，
   没有任何 +/− 或其它控件。⇒ 该平台/该基础库对 `<map>` **不渲染**原生缩放控件。
2. **生产页真机截图**：用户提供的高清截图与我方 `dev-prod.png` 一致 —— 地图右侧**只有一个**
   圆形白色按钮。放大（`zoom-user-ctrl.png`）后图标是「地图＋定位针」，即
   `<s-icon name="map-pinned" size="40">`，正是 `pages/map/index.wxml:155-157` 的
   `.recenter-map`（`position:absolute; right:42rpx; width/height:88rpx; border-radius:50%`，
   内联 `top:{{overlayTop}}px`）。**是一个按钮，不是纵向 +/− 步进器。**
3. **属性面**：官方 `map` 组件全量属性表里，缩放相关只有 `scale` / `min-scale` / `max-scale` /
   `enable-zoom`；UI 相关只有 `show-compass` / `show-scale`（比例尺，非缩放按钮）。
   `setting` 的 14 个字段（`skew rotate showLocation showScale subKey layerStyle enableZoom
   enableScroll enableRotate showCompass enable3D enableOverlooking enableSatellite enableTraffic`）
   **不含**任何缩放按钮开关。`controls` 属性在本仓库**从未使用**。

⚠️ 一个可能的误认来源：若点过卡片上的「在腾讯地图打开」，进入的是**腾讯地图 App**，
那里的缩放控件属于外部 App，不在小程序内，与本项目无关。

### CAN_HIDE / CANNOT_HIDE

**N/A —— 前提不成立。** 真机上不存在需要隐藏的原生缩放控件。
因此「隐藏失败就只能叠加第二套 +/−」的两难**不存在**，本轮也**没有**任何覆盖 / 遮挡 /
负 margin / 改 key / 重建 map 的 hack。

⇒ 按指示，**可以继续**自定义 stepper；但 §Step A/B 的结论会改变它的可行形态。

---

## Command channel

### 实际使用：`scale` **prop**（受控属性）

`MapContext` **没有**缩放 setter —— 这不是文档印象，是**运行时枚举**：
`wx.createMapContext('savor-map')` 在 SDK 3.17.3 上暴露的全部可调用成员为

```
addArc addCustomLayer addGroundOverlay addMarkers addVisualLayer eraseLines
executeVisualLayerCommand fromScreenLocation getCenterLocation getIndoorFloor getRegion
getRotate getScale getSkew includePoints initMarkerCluster moveAlong moveToLocation
off on once openMapApp removeArc removeCustomLayer removeGroundOverlay removeMarkers
removeVisualLayer setBoundary setCenterOffset setIndoorFloor setIndoorMaskColor
setLocMarkerIcon toScreenLocation translateMarker updateGroundOverlay
```

**没有 `setScale` / `setZoom` / `zoomTo` / `animateTo`**，官方 `MapContext` 文档一致。
⚠️ 顺带证伪一条流传很广的教程（`echo.cool`《地图缩放控制》教
`mapContext.setScale({scale: res.scale + 1})`）——**该方法在本 SDK 不存在**，照抄必报错。

⇒ 可用通道只有两个：**`scale` prop**，和 **`includePoints`**（唯一命令式改缩放的方法，
但它是 fit-bounds，同时决定中心点）。

### 真机结果

| 实验 | 写入 prop | 真机 `getScale()` | 判定 |
|---|---|---|---|
| D1 | 15 | **15** | 生效 |
| D2a | 13.32 | **13** | **向下取整** |
| D2b | 13.63 | **13** | 向下取整 |
| D2c | 12.4 | **12** | 向下取整 |
| D2d | 13.0 | **13** | 生效 |
| D3a | 13.5 | **13** | 向下取整 |
| D6 | 18 / 3 | **18 / 3** | clamp 生效 |

**真机的 native 地图本身支持小数**：生产页 `data.mapScale` 实测 `10.59`、`10.27`；
探针页 `getScale` 实测 `13.31`、`11.99`、`14.49`、`15.99`。
⇒ **被抹掉的是 prop 通道，不是原生能力。**（模拟器行为完全一致。）

### 特别报告：「历史 command value == 新 target」

**真机确认：这个场景不会导致按钮失效。**

| 步骤 | cmd | 真机 native |
|---|---|---|
| D3a 写 13.5 | 13.5 | 13 |
| D3b 用 `includePoints` 把 native 打到 11（模拟用户 pinch，**prop 不动**） | 13.5 | **10.99** |
| D3c `setData({cmdScale: 13.5})` —— 与 prop 当前值**完全相同** | 13.5 | — |
| D3d | 13.5 | **13** |

同值写入把 native 从 **10.99 拉回 13**，说明本 SDK 的 `setData` 只要 patch 含该数据路径，
就会把 `scale` 重新下发给原生组件，**即使值没变**。

反面对照（模拟器 E7，真机未重复）：写**无关**字段（`tick`、`latitude`）时 native **不**被拉回
（15.99 连续保持经过 2 次 no-op `setData` 与一次 `latitude` 变更）。
⇒ 重新下发由**写入 `scale` 所在 data 路径**触发，不是「任意 re-render 都会重新下发」；
也排除了「prop 粘住用户 pinch」的担忧。

### Loop safety（真机，生产 map 页）

在生产页做**运行时**（不落盘）monkey-patch 计数：`applyFilters` / `syncStackPositions` /
`renderMarkerPhotos` / `startDrawerReveal` / `onMapRegionChange`(begin,end) /
`mapCtx.includePoints` / `mapCtx.moveToLocation`。

| 动作 | cmds（应用主动相机命令） | beg/end | applyFilters | stack | photos |
|---|---|---|---|---|---|
| 一条命令 `initialMapScale=15` | **0** | **1/1** | **1** | 2 | 2 |
| 之后**静置**（只观测） | **0** | **0/0** | 0 | 0 | 0 |
| 一条命令 `initialMapScale=12` | **0** | **1/1** | **1** | 2 | 2 |

- **应用层主动 camera command == 1**（即注入的那一次 prop 写入），命令执行**不**派生新命令。
- **`regionchange` 只负责观测**：全程 `includePoints` / `moveToLocation` 计数保持 **0**，
  `initialMapScale` 未被回写。**没有形成 controlled-map 回路**，静置也不空转。
- 真机上 `regionchange.detail.scale` 携带的是**正确**的新值（15 / 12 都对）。

---

## Step A/B

算法统一为 `target = clamp(getScale() + delta, 3, 18)`，按钮 handler **先 `getScale()` 取即时值**再算。

### STEP = 0.5（真机）

| 场景 | cmd | 真机 native | 主观变化 |
|---|---|---|---|
| 13.0 → 按 + | 13.5 | **13** | **完全没变化**（连 regionchange 都没发，beg/end 停在 1/1） |
| 再按 + | 13.5 | **13** | 完全没变化 |
| 按 − | 12.5 | **12** | 一次跳满 1.0 |
| pinch 到 13.31 → 按 + | 13.81 | **13** | **反向缩小 0.31**（按 + 却变小） |
| 13.31 → 按 − | 12.5 | 12 | 跳 1.0 |

**判定：`ignored` + `quantized`，且会方向反转。** 0.5 在 prop 通道上**不可靠**。

### STEP = 1.0（真机）

| 场景 | cmd | 真机 native |
|---|---|---|
| 13 → + | 14 | **14** |
| 14 → + | 15 | **15** |
| 15 → − | 14 | **14** |
| pinch 到 13.31 → + | 14.31 | **14** |

**判定：`accepted`（整数）。** 动作干净、方向正确、每次一个 regionchange 周期。

### 推荐：**STEP = 1.0**

理由：`scale` prop 通道把小数**向下取整**（真机与模拟器一致），所以 0.5 的语义**无法通过该通道表达** ——
按 + 会「完全没变化」甚至反向。按用户既定优先级（0.5 可靠才用 0.5），取 **1.0**。

**备选架构（需用户决策，本轮未实现）**：`includePoints` 是**唯一**能精确落到小数的通道
（真机 want 12 / 14.5 / 16 → 实测 **11.99 / 14.49 / 15.99**，误差 ≤0.01，且 `cmds` 计数为 0）。
但它同时决定**中心点**，语义从「原地微调」变成「重新构图」；若要走 0.5，
必须额外用 `getCenterLocation` 把当前中心钉住，再按目标 scale 反算对称 bbox。
这会把命令通道从 prop 换成 MapContext 方法，属于架构变更，**需单独批准**。

---

## Scale math

- 最终口径**确认不是** `round(mapScale) + delta`，而是 **`current observed scale + delta`**：
  探针实测 `13.31 + 0.5 = 13.81`（写进 prop 的值就是 13.81），
  **没有**变成 `round(13.31) + 1 = 14`。
- 小数确实**进入**了 prop（cmd 回读 13.81 / 14.31）；被抹掉的是**原生侧取整**，不是应用侧算法。
- ⚠️ **必须写进设计的附带发现**：按钮 handler 不能信任 `data.mapScale`。
  - 模拟器上 `regionchange.detail.scale` 是**移动前**的旧值（cmd 15 → `end scale 13`，1.7s 后 native 才 15），
    生产页 `data.mapScale` 因此滞后一格（native 15 时 `mapScale` 还是 18）。
  - 真机上该字段是**正确**的，但为跨平台一致，**统一改用 `getScale()` 的即时值**。

## clamp / disabled

- clamp 真机实测：cmd 18 → native **18**；cmd 3 → native **3**。
  算法侧 `Math.max(3, Math.min(18, target))` 生效。
- ⚠️ 顺带记录：`MapContext.setBoundary` 会**限制最小整数缩放级别**（官方文档明写）；
  本轮未调用，仓库中也无调用。若将来引入 boundary，会与 clamp 语义叠加。
- **disabled / ε 建议**：真机 `getScale` 返回小数（实测 10.27 / 10.59 / 13.31 / 11.99 / 14.49 / 15.99），
  所以**绝不能用 `=== 18`**。取 **ε = 0.05** 有实测支撑：clamp 边界上 native 落在 18 / 3，
  而 `includePoints` 的最接近值是 15.99（对 16 的误差 0.01），
  0.05 既能吸收这类 ≤0.01 的通道误差，又不会误伤 17.9 这类真实值。
  判定：`observed >= 17.95` → 禁用 +；`observed <= 3.05` → 禁用 −。

---

## Regression（真机 + 静态）

| 项 | 结果 |
|---|---|
| view-overlay drawer | 结构完整：`drawerRenderMode === 'view-overlay'`，`mapDrawers` 数组字段齐全，命令前后持续存在 |
| cluster grouping | **按新 scale 正常重算**（真机 12→9→3 groups），无异常、无级联 |
| marker renderer / batching / ready rebind | 无报错；`stackPositionsReady` 全程 `true`；`markers` 随分组正确增减 |
| photo derivative / place card / search / positioning / TabBar | 未触碰 |
| UI 冻结哈希链 | `verify-cloud` **272/272 PASS** |
| 结构 | `verify-structure` **6/6 PASS** |

⚠️ 口径：分组**变化**是**正确**行为（scale 变了），不是回归。本轮**不声称**「分组不变」；
要求的是「相机命令不破坏分组」。

---

## 变更、保全与可复现

- 临时探针页 `miniprogram/pages/zoomprobe/` 已用 **Safe Local Archive** 移到
  `.workbuddy-ai/archive/2026-09-28-zoomprobe/pages/zoomprobe/`（4 个文件，`mv` 未 `rm`）。
- `miniprogram/app.json` 已还原为原 10 个页面；`git diff` 为空。
- 全部证据在 gitignored 的 `.workbuddy-ai/scratch/zoom-stepper/`：
  - `devtools.cjs` 双通道驱动；`run-probe.cjs` 脱敏探针运行器。
  - `probe-a-mapcontext.js` → MapContext 能力枚举（§Command channel）。
  - `probe-app/` 独立一次性探针小程序（模拟器对照用，`libVersion 3.17.3`）。
  - `device-experiment.cjs` → `device-exp.json`（真机 D1–D7 全量）。
  - `device-production.cjs` → `device-prod.json`（真机生产页 loop safety + regression）。
  - `dev-bare.png` / `dev-prod.png` / `dev-final.png` / `zoom-bare-right.png` /
    `zoom-user-ctrl.png` / `probe-sim.jpg`（截图证据）。
  - `experiment2-sim.json` / `experiment3.cjs` / `production-sim.json`（模拟器对照）。
- 探针设计要点（复用时必须保留）：`cmdScale` 是**唯一**被命令写入的 data 字段，
  `regionchange` 处理器**不写任何 data**，计数放在页面实例上。
  v1 把计数写进 `data`，导致观测本身 re-render 地图并污染实验（已在 v2 修正）。

## 本轮未做 / 明确不做

- 未实现正式 UI（无 stepper、无 `pages/map/*` 改动）。
- 未把 `includePoints` 作为命令通道实现（属架构变更，见 §Step A/B 备选）。
- 未 commit / push / deploy。
