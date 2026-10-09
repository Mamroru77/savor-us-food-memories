# Map 相机 / 图片管线 — 范围规则与实测事实（2026-10-02）

> 本文是 `MEMORY.md` §8 的**完整版**。MEMORY.md 只留「违反即回归」的禁令清单，实测数据、推导与理由放这里。
> 相关评审：`map-camera-motion-20261002.md`、`map-camera-continuity-image-pipeline-20261002.md`、
> `camera-image-pipeline-completion-20261002.md`、`map-native-affordance-binding-audit-20261002.md`、
> `map-native-affordance-migration-20261002.md`。

## 0. 状态

Map 相机 + 图片管线在 **2026-10-02 重开**，属「已冻结区」的受控改动。
**检查点未推进；等视觉/运动批准。** 真机运动 **NOT VERIFIED**。

---

## 1. Map 冻结区（改前必读）

- 真机 `<map>` **不渲染原生缩放控件**。
- `MapContext` **没有缩放 setter**；唯一的命令式改缩放是 `includePoints`，而它**改中心点**。
- 绑定 `scale` prop **向下取整小数** ⇒ `STEP=0.5` 不可用。
- **禁 `=== 18`**：平台会回 17.999…，比较要带 ε=0.05。
- `data.commandScale` 是**唯一**命令通道；**`regionchange` 绝不写它**。
- 默认 `drawerRenderMode = 'view-overlay'`。
- ⚠️ cluster 与 singleton 的照片过滤都要 `&& !overlayMode`。
- ⚠️ `stack-button-*.png` **已经包含整个按钮**（含底与圆角）⇒ **绝不**再加 CSS `background` / `border-radius` / `box-shadow`。

---

## 2. 相机：平台能力与实测

| 事实 | 实测 |
|---|---|
| 有无相机动画 API | **没有**（无 `setScale` / `animateTo`） |
| 绑定 `latitude`/`longitude` prop | **瞬时**（27ms 到点；900ms/161 采样只有 1 个不同中心） |
| 绑定 `scale` prop | 向下取整，但**缩放变化被原生动画化**（~2.3s） |
| 按帧写 prop 的代价 | 每次写入引发 **2 组** `regionchange`（`causedBy:'update'`；begin 上是平台拼写 `'upudate'`；用户手势是 `gesture`/`drag`/`scale`）。一次 focus 已 7 组 |
| 30 次按帧写入 | 原生 **26 个不同中心**、单调 —— 所以 prop **确实**能当 A→B 的载体 |
| `includePoints` | 在 DevTools **静默无操作** |
| `moveToLocation` | 在 DevTools **直接失败** |
| 几何模型 | `utils/mapCamera.js`（纯函数）；验证到像素（scale 13 / 428×926 ⇒ 428.0 / 926.0 px） |
| 相机 padding | **必须实测**（`syncCameraPadding`），实测 `[229,74,351,0]`；写死 `[90,40,165,40]` 会把 13/14 个 marker 排进 chrome 下 |

### 由实测推出的禁令

1. **禁止在选中同一个 `setData` 里写相机中心** —— prop 瞬时，会**抢在命令之前瞬移**。这正是旧「闪过去」的根因。
2. **拒绝 JS 相机插值**（每帧推整个 `mapDrawers` 过桥）—— 会重造 P0-1/P0-2 已消除的问题。
3. A→B 的载体是**按帧写绑定 `latitude`/`longitude`**，且**必须有 `cameraTransition` token**：
   travel 期间整段早退 `onMapRegionChange`，settle 时**恰好一次**走 `onCameraViewportReady`。
4. `stepCameraTransition(elapsed)` **必须与定时器解耦**（harness 要能直接调用以断言 START/MID/END）；
   **progress = 0 那一帧不写 prop**；**harness 页面必须 `active: true`**。
5. `syncCameraPadding` **必须是独立查询**：`verify-map-control-clearance.cjs` 硬断言
   `syncOverlayClearance` 的选择器只能 `.map-search`、`setData` 键只能 `['overlayTop']`。

### ⚠️ 被冻结的相机契约（改前需单独批准）

`verify-cloud.cjs` 断言：真机臂 focus 必须 `moveToLocation(原始坐标)` 且 `fits == 0`；
IDE 臂必须 `includePoints([{原始单点}])`。**改 focus 的落点或加缩放 = 改冻结断言。**

---

## 3. 图片管线

`utils/imageCache.js`：

- **L1** 在途去重 + **L2** 会话缓存 + **L3 持久 24MB LRU**（**只缓存派生，绝不缓存原图**）。
- 键 = `source | variant | revision`（FNV-1a）。
- `resolve()` 在同一个 tick 合并为**一次** `getTempFileURL` 并**复用 URL**
  （每次生成新签名 = 平台 `<image>` 缓存失效 ⇒ 这正是列表二次加载的根因）。
- `prepareQueue` 串行（并发 1）。

### 禁令

1. **下载可以在管线里，重编码必须留在调用方的单槽 HEAVY 阶段** ——
   否则 4000×3000 的重编码会跑在并发 3 的网络阶段（`verify-marker-renderer-scheduler` 抓过这个错）。
2. **模块必须能在没有 `wx` 的上下文被 require，且所有入口降级**（`platform()` 守卫），
   否则 `wx: {}` 沙箱会 ReferenceError。
3. **新增页面依赖后必须给 harness 补依赖**（`utils/mapCamera`、`imageCache`、`icons`、`data.isCloudImage`），
   否则白名单 harness 抛错、宽松 harness 拿到 `{}`，而 `try/catch` 会**静默吞掉**，看起来像「命令没发出」。
   2026-10-02 一次 `require('../../utils/icons')` 就让 **12 个 harness** 变红。
4. ⚠️ **`<image>` 的网络字节无法从运行时计数** ⇒ 列表「字节下降」只能证明**解析层**改善，
   **不能**声称字节下降。

---

## 4. 主 Tab 切换不是生命周期边界

- 页实例常驻：切走只 `onHide`，切回只 `onShow`；`<map>` / 节点树 / `markerCanvas` 跨 Tab 存活。
- **禁止在 `onHide` 销毁派生视图模型**。
- **禁止在 `onShow` 无条件重读产品数据 / 重建 marker 表**。
- 释放归属 `onUnload`。
- **数据新鲜度唯一信号 = `store.revision()`**（只在 `commit()` 与身份分区重载自增；
  `mergeCloudRead` 结果相同则不 commit）。
- **禁止**把时间窗当正确性 / 加轮询定时器 / 给 Map 加全局 `mapCache`。

---

## 5. 原生锚定 disclosure 控件（Option 乙，2026-10-02）

- 底部 `.place-collapse`（页面绝对定位的圆形 chevron）**已删除**，含无主的 `.place-collapse-visual` 规则组。
- 改为 `<cover-view slot="callout" marker-id="{{affordance.markerId}}">`：
  88rpx 实心盒 → 56rpx 圆面（`.native-affordance*`；DUSK 面 `rgba(37,38,42,.96)`），
  `catchtap="onTogglePlaceCard"`（与 marker 自身 tap 独立）。
- **状态靠换 glyph（`chevron-down` ⇄ `chevron-up`），绝不靠 `transform`**：
  `cover-view` 的 transform 连**静态** `rotate(180deg)` 都不保证。**也没有 transition**。
- `mapAffordances` 是**视图模型**（`buildAffordance()` / `syncAffordanceState()`），
  只在 `markerId >= 0` 时挂载；选中项落进簇内 ⇒ 不挂载，交给簇自己的堆叠按钮。
- ⚠️ **overview 绝不影响它**：曾经写成 `(selected && !overviewPlan)`，而 `recenter()` 走 overview
  ⇒ **一次全览会把控件整个抹掉**。overview 不是选择变化。
- ⚠️ 页面上 `onTogglePlaceCard` 还有**第二处 = 既有的收起态名字条 `.place-expand`**（**保留，视觉平价**）。
  「只有一个控件」指的是**唯一的 marker 锚定控件**。

### ⚠️ 真机未验（两件只能由真机回答）

1. **原生 callout 的几何**：平台把 `slot="callout"` 放在 marker 锚点的哪一侧、以什么为原点，没有可测契约。
   实现已避开「子元素从 0×0 父盒溢出仍渲染」这一未证行为（用 88×88 实心盒），但**相对 marker 的实际落点仍需真机调一次**。
2. **`cover-image` 能否渲染 `icons.iconSvg()` 的 SVG data URI**：`<s-icon>` 走 WebView `<image>` 是**已验证**的；
   `cover-image` 走**原生图层**，**无先例**。
   **回退方案**：新增 `miniprogram/images/icons/lucide/chevron-down.png` / `chevron-up.png`
   （与同一 callout 里 `chevron-left.png` / `chevron-right.png` 的用法一致），
   需同时更新 `tools/fixtures/moved-build-sources.json` 的 bytes/sha256。

---

## 6. 闸门

`verify:map-camera-motion`(47) / `verify:image-cache` / `verify:detail-original`，
以及 `verify:map-viewport`、`verify:map-scale-echo`、`verify:map-tab-return`、`verify:map-motion`、
`verify:map-empty`、`verify:marker-apply`、`verify:map-trace`、`verify:marker-renderer-scheduler`、
`verify:map-overlay-drawer`、`verify:map-drawer-motion`、`verify:map-search-clearance`、
`verify:map-reveal-cadence`、`verify:map-control-clearance`、`verify:map-veil-review`。
