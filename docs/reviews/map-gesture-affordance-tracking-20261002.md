# Map manual gesture affordance 实时跟随（2026-10-02 · 真机回归修复 3）

**状态：IMPLEMENTED / STATICALLY VERIFIED / REAL-DEVICE VERIFIED（代理平移）。
STOP FOR UNIVERSAL MAP AFFORDANCE VISUAL APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy / 未重新上传。**`wxml` / `wxss` 逐字节未改**。
- 上一轮的 programmatic 逐帧跟随、disclosure sticky、相机、图片管线全部 KEEP，未推翻。

---

## 1. MANUAL GESTURE CAMERA CAPABILITY MATRIX

| 能力 | 结论 | 依据 |
|---|---|---|
| 手势期间 `regionchange` 事件 | **只能合成 `begin`/`end` 之外我无法验证** —— 见下 | ⚠️ 见 §2 |
| payload 是否含 centre | `begin` 实测 `causedBy:'gesture'`，**无 centre**；`end` 带 `scale` | 本机真机探测 |
| payload 是否含 scale | `end` 有；`begin` 无 | 同上 |
| JS 是否有同步 camera state | **没有** | 平台无同步读 API |
| 唯一权威相机读 | `MapContext.getRegion()`（**一次往返同时给出中心与 scale**：bbox + 视口即可反推 scale） | 本轮新增 `mapCamera.scaleForSpan` |
| 原生 marker-anchored overlay | **存在**（`customCallout` / `cover-view slot="callout"`，本项目 `native-callout` 臂已用），但本项目默认 `view-overlay`；中途切换渲染器 = remount = flash ⇒ **本轮不采用**（Path B 判 risk > 现方案） | 代码审计 |

## 2. regionchange 真机节奏

⚠️ **无法测量**，原因如实记录：本工具链**不能合成原生地图手势**。
`automation_element_action --selector '#savor-map' --action touchstart/touchmove/touchend`（8 点、45ms 间隔）
在真机上**产生了 0 个 `regionchange` 事件** —— 合成触摸落在 WXML 层，不驱动原生地图组件。
⇒ **event cadence / median / p95 / max 全部 UNMEASURED**，本轮**不猜、不声称**。

## 3. EXACT REASON THE OLD CODE HID THE OVERLAY

`onMapRegionChange` 的 `begin` 分支（旧）：

```js
// Only hit regions disappear. Native callouts stay anchored and visible.
if(this.data.stackPositionsReady)this.setData({stackPositionsReady:false});
```

`stackPositionsReady` 同时是 overlay 的 `wx:if` 门控 ⇒ **手指一落下，整个 marker-anchored 组消失**；
手势期间没有任何投影（旧架构只有 settle-only 的 `getRegion`）⇒ 一直不可见；
`end` 后的 `syncStackPositions` 才把它带新坐标显示回来 ⇒ **hide → show + snap**。

## 4. CHOSEN STRATEGY（Path C，且只此一处使用原生读）

**camera ownership + 单飞合并采样**：

```
cameraOwner: idle | programmatic | gesture
programmatic → 帧内解析投影（上一轮，未改）
gesture      → 单飞 getRegion 采样 → projectPoint → syncDrawerAnchors
两者共用同一个 anchor 投影管线（mapCamera.projectPoint）
```

采样器约束（全部有断言）：
- **同一时刻只有一个 `getRegion` 在飞**，回复到达后才请求下一个（**绝不排队**）；
- 回复用 `gestureSampleRequest` epoch 校验，**过期即丢弃**；手势结束后到达的回复**不得移动任何东西**；
- 一次回复同时给出中心与 scale（`scaleForSpan`），**无需第二次查询**；
- 每帧只 patch 位置键（`mapDrawers[i].screenX/screenY/overlay*`），**无 marker 重建 / 无图片工作 / 无 applyFilters / 无 store 写 / 无原生命令**。

## 5. CAMERA OWNERSHIP MODEL

| 转移 | 行为 |
|---|---|
| `idle → programmatic` | `startCameraTransition` 置 `programmatic` |
| `programmatic → gesture` | 手势 begin **立即**取消 travel 并接管；锚点**停在上一个 programmatic 帧的位置**（无跳变、无隐藏） |
| `gesture → idle` | 手势 end 停止采样器，走既有 `syncStackPositions` 做一次校准 |
| `programmatic → idle` | travel 完成或取消 |
| `onHide` | 停止采样器（隐藏页不采样） |

**不使用 hide overlay 来解决 ownership 切换** ✓。

## 6. EXACT FILES CHANGED

| 文件 | 性质 |
|---|---|
| `miniprogram/utils/mapCamera.js` | 新增 `scaleForSpan`（一次 getRegion 同时得到中心与 scale） |
| `miniprogram/pages/map/index.js` | 删除手势隐藏规则；新增 `cameraOwner` / `startGestureTracking` / `stopGestureTracking` / `sampleGestureCamera`；`stepCameraTransition` 标注 owner |
| `tools/verify-map-camera-motion.cjs` | 新增 R1–R9 手势断言（45 条总计） |
| `tools/verify-cloud.cjs` | 两处固化「手势即隐藏」的断言按新契约改写（**未删除任何验证**） |
| `docs/reviews/map-gesture-affordance-tracking-20261002.md` | 本文件 |

**未改**：`wxml` / `wxss` / imageCache / mapMarkers / store / Me 页 / 检查点。

---

## 7–10. 拖拽 / 缩放指标

⚠️ **真实手势指标（event count / median / p95 / max latency / position error）本轮无法在真机上采集** ——
工具链不能合成原生手势（§2）。可用的是**代理平移**（`moveToLocation`，技能记录的最近似 pan）：
**先测，再实现** —— 代理测量证明采样器在真实相机移动下能连续跟随。

| 指标 | 代理平移（真机） |
|---|---|
| 采样点数 | **3** |
| 不同 anchor 位置 | **3**（每采样必动） |
| 位置序列 | `(2924,431) → (2898,452) → (2872,472)`（与相机移动方向一致） |
| **手势期间是否全程可见** | **`visibleThroughout: true`** ✓（旧行为：全程隐藏） |
| 位置误差 | 合成断言 S2/R3 已证 `|actual − projectPoint(当前相机)| < 0.51px`（每个采样点） |

## 11–12. 交接与换 marker

| 场景 | 结果 |
|---|---|
| **programmatic → gesture** | `cameraTransition` 取消、`cameraOwner='gesture'`、锚点**停在上一个 travel 帧的位置**（R5 断言 deepEqual）⇒ 无 hide / 无 re-show / 无跳变 |
| **gesture → 新 marker** | 换选后 `syncDrawerAnchors` 由新的组坐标驱动（S1/S5 已证锚点源=组坐标），下一次采样即跟新锚点 |

## 13–15. collapsed / expanded / 离屏

- collapsed 与 expanded **共用同一 spatial 管线**（S7 断言）；手势不写 `cardCollapsed`（R7/R8 断言）✓
- 离屏：沿用既有视觉模型（绝对定位 + `.map-screen{overflow:hidden}` 裁剪）。marker 真离屏 ⇒ 组被裁掉；
  回到视口 ⇒ 自然回来。**不再有「手势一开始就隐藏」这条规则** ✓

## 16–20. 性能与副作用

| 指标 | 结果 |
|---|---|
| 每帧 setData 字段 | **只含位置键**（R7/R8 断言）；无 `markers`/`selectedPhoto`/`cardCollapsed`/`commandScale` |
| marker compose 次数 | 0（断言无 `markers` 写） |
| 图片请求 | 0（断言无 `selectedPhoto` 写） |
| 原生命令 | 0（断言 `commands.length === 0`） |
| cloud / store 副作用 | 0（未触碰 syncState / applyFilters） |
| 采样并发 | **恒 ≤ 1**（R2 断言 in-flight 数） |

## 21–26. 回归

| 项 | 结果 |
|---|---|
| A→B 相机 + 逐帧 affordance | `verify-map-camera-motion` **45/45**（26 相机 + 6 disclosure + 7 spatial + 6 gesture） |
| overview | 未改（同一 travel 管线） |
| image-cache / detail / tab-return | 18/18 · 8/8 · 7/7 |
| PEARL/DUSK · EN/ZH | 纯几何，无主题/语言分支；`verify:visual-language` / `verify:ui` PASS |
| 冻结面哈希 | **MATCH** |

## 27. 验证结果

`verify` **361/361** · `verify:cloud` **272/272** · `verify:all` **EXIT 0**。

### RED / GREEN
恢复旧的隐藏行 ⇒ **R1/R4、R5、R7/R8 红**（`the affordance stays visible when the finger lands` /
`it never left the screen` / `a gesture sample may only move anchors, saw stackPositionsReady`）——
正是真机所见的「手指一落下按钮就消失」。逐字节还原后 **45/45 GREEN**（RED 残留 0）。

## 28. 真机状态

**PASS（可见性 + 跟踪级）**：代理平移下锚点 3/3 采样全部移动、**全程可见**、方向与相机一致；
R1–R9 的合成断言覆盖「手指落下不隐藏、每采样必动、位置 == 当前相机投影、过期回复无效、单飞」。
⚠️ **真实 drag / pinch 的肉眼验收仍需要你操作手机确认** —— 本工具链无法合成原生地图手势（§2），
因此「无可见滞后 / 无拖影 / 无追赶 / 无 gesture-end snap」这些**视觉判定本轮无法自动给出**。

## 29. 剩余平台限制

1. **无法合成原生地图手势** ⇒ 手势事件节奏与视觉滞后**未测量**，只能靠代理平移 + 合成断言。
2. JS 没有同步 camera state ⇒ 手势期间必须采样；采样延迟 = 一次 `getRegion` 往返（**未测**，真机上一次采样往返量级为数十 ms）。
3. 若平台在拖拽中只发 `begin`/`end`（不排除），则锚点只能按「一次往返一次更新」的节奏跟随——
   **这正是为什么必须由你在真机上肉眼确认**；若仍可见滞后 ⇒ 按 brief 判 **REVISE**，不要拿「能跟」当「跟得好」。
4. 本项目默认 `view-overlay`；原生 `customCallout` 能让控件天然随图移动，但切换渲染器会 remount ⇒ 本轮未采用。

---

## 建议

| 项 | 建议 |
|---|---|
| **A. PROGRAMMATIC AFFORDANCE TRACKING** | **KEEP**（真机 40/40 帧，未回归） |
| **B. MANUAL DRAG AFFORDANCE TRACKING** | **KEEP（待肉眼确认）** —— 可见性缺陷已修（全程可见 + 采样跟随）；**视觉滞后未经真机手势验证** |
| **C. MANUAL PINCH AFFORDANCE TRACKING** | **KEEP（待肉眼确认）** —— 同上；scale 由同一次回复反推 |
| **D. CAMERA OWNERSHIP HANDOFF** | **KEEP**（programmatic→gesture 锚点 deepEqual 连续、gesture→idle 校准一次） |

**READY FOR UNIVERSAL MAP AFFORDANCE VISUAL APPROVAL**
