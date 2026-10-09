# Map selected marker affordance 空间连续性（2026-10-02 · 真机回归修复 2）

**状态：IMPLEMENTED / STATICALLY VERIFIED / REAL-DEVICE VERIFIED。
STOP FOR MAP SELECTED AFFORDANCE VISUAL APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy / 未重新上传。**`wxml` / `wxss` 逐字节未改**（哈希 MATCH）。
- 上一轮的 disclosure **状态**连续性、相机、图片管线全部 KEEP，未动。

---

## 1. EXACT SPATIAL LAG ROOT CAUSE

**不是**「selectedId 没换」，也**不是**「按钮绑了 A 的旧坐标」。是两个叠加的时序缺陷：

1. **marker-anchored 控件的坐标只能来自 `getRegion` 往返。** 唯一 marker-anchored 控件是抽屉堆叠按钮
   （`.pin-stack` / `.pin-stack-toggle`），其 `screenX/screenY` 由 `buildDrawers` 从 `this.stackPositions[rootId]`
   取得，而 `stackPositions` **只有** `syncStackPositions()` 的 `getRegion` 回复会写。
   ⇒ 一次往返只能给出**一个**时间点的投影，**无法逐帧**。
2. **travel 之前发出的 `getRegion` 回复会在 travel 途中落地并重新显示 overlay。**
   `applyFilters` 在 travel 之前调用 `syncStackPositions()`；回复到达时 travel 已在跑，
   而 `stackPositionsReady` 被写回 `true`，overlay 带着**travel 之前**的投影重新出现。
   ⇒ 控件停在 A 的屏幕位置，直到 settle 时才换成 B 的投影。

⇒ **EXACT SPATIAL LAG ROOT CAUSE = 「投影源是 settle-only 的 getRegion 往返」+「travel 前的回复中途复活 overlay」。**
（属于审计表中的 **E + B 组合**：transition 期间派生投影被抑制，且旧回复未被作废。）

## 2. 当前 affordance 定位管线（BEFORE）

```
selection → applyFilters → buildDrawers(groups, markers, selectedId)
                              └── screenX/screenY ← this.stackPositions[rootId]   （可能过期）
camera travel（每帧写 latitude/longitude）
   └── onMapRegionChange 全部早退（上一轮的抑制）⇒ 不投影
getRegion 回复（travel 前发出）
   └── setData({stackPositionsReady:true, mapDrawers[i].screenX/screenY = 旧投影})
settle → onCameraViewportReady → syncStackPositions（新的 getRegion）→ 才跳到 B
```

## 3–4. Anchor 更新时机 BEFORE / AFTER

| | BEFORE | AFTER |
|---|---|---|
| 谁更新 | `syncStackPositions` 的 `getRegion` 回复 | `stepCameraTransition` 每帧 `syncDrawerAnchors()`（**纯解析投影**） |
| 频率 | 每次 settle 一次（travel 中 0 次） | 每 camera frame（真机实测 **40/40 帧**） |
| 旧回复 | 会中途复活 overlay（旧坐标） | **epoch 守卫**：`cameraTransition` 存活期间丢弃该回复 |
| travel 期间可见性 | 被隐藏（`stackPositionsReady:false`）→ settle 才出现 | **保持可见并随图移动**（坐标已逐帧正确） |
| 手势期间 | 隐藏（既有语义，保留） | 隐藏（不变） |

新增纯函数 `mapCamera.projectPoint(coordinates, centre, scale, viewport)` —— 与本文件头部「逐像素验证过」的
模型同源，因此解析投影与原生 `getRegion` 一致，且**不需要任何原生往返**。

## 5. EXACT FILES CHANGED

| 文件 | 性质 |
|---|---|
| `miniprogram/utils/mapCamera.js` | 新增 `projectPoint`（纯解析投影） |
| `miniprogram/pages/map/index.js` | `startCameraTransition` 不再隐藏 overlay；`stepCameraTransition` 每帧 `syncDrawerAnchors()`；`syncStackPositions` 回复加 epoch 守卫；新增 `syncDrawerAnchors` |
| `tools/verify-map-camera-motion.cjs` | 新增 S1–S8 空间连续性断言；M6 契约更新（overlay 保持可见） |
| `docs/reviews/map-affordance-spatial-continuity-20261002.md` | 本文件 |

**未改**：`wxml` / `wxss` / imageCache / mapMarkers / store / 检查点。

---

## 6–7. BEFORE / AFTER 测量（A→B，抽屉组锚点）

| 指标 | BEFORE | AFTER（真机） |
|---|---|---|
| 帧数 / **不同位置数** | 40 / **1**（完全不动） | 40 / **40** ✓ |
| START | A 的旧投影（不动） | `(2951, 411)` |
| MID | 同 START | `(757, -822)` |
| END | settle 时**一次跳到** B | `(-1185, -1913)`（连续走到） |
| `maxJumpPx` | **= 全程 span**（一次跳完） | **199.2 / span 4744.7 = 4.2%** ✓ |
| 首次 B-anchor 更新时刻 | **settle 之后** | **第 1 帧（e≈16ms）** |
| 合成断言 `distinct.size` | 1 ⇒ **S2/S3/S4/S5/S7 FAIL** | ≥5 ⇒ PASS |

## 8. selected marker 投影 vs affordance 偏移

`affordanceX = projectPoint(marker).x − 44`，`affordanceY = projectPoint(marker).y` ——
**offset 沿用既有 `mapStack` 几何（`screenX: pos.x-44`），未重新设计** ✓。
S2 逐帧断言 `|affordance − project(currentCamera)| < 0.51px` ✓（每帧误差 < 半像素）。

## 9–14. 场景结果

| 场景 | 结果 |
|---|---|
| **collapsed A→B** | 锚点逐帧跟随；`cardCollapsed` 不变（S7） |
| **expanded A→B** | 同上（S7 两态共用同一管线） |
| **rapid A→B→C** | 第二条 travel 接管后锚点立即跟新相机（S5），无 B ghost |
| **gesture interruption** | 手势取消 travel 后锚点**停在第末帧位置**（不回跳、不冻结在 A）（S6）；overlay 按既有语义隐藏，手势结束由投影恢复 |
| **overview** | 同一 `cameraTransition` 管线 ⇒ 锚点随 overview travel 连续跟随（真机 overview 40 帧已证） |
| **offscreen** | 沿用既有模型：绝对定位 + `.map-screen{overflow:hidden}` 裁剪，**不新增视觉模式**；marker 回到视口内即恢复正确锚点（真机长距离 travel 实测 affordance 走到 `y=-1913` 被裁掉，未悬浮在旧位置） |

## 15–18. 回归

| 项 | 结果 |
|---|---|
| marker compose / image request | S8 断言每帧 patch **只含位置键**（`mapDrawers[i].screenX/screenY/overlay*`）或 `latitude/longitude`；无 `markers`、无 `selectedPhoto`、无 `commandScale`、无原生命令 ✓ |
| camera | `verify-map-camera-motion` **39/39**（26 相机 + 6 disclosure + 7 spatial） |
| disclosure state | 上一轮 6 条全绿 ✓ 未回归 |
| image cache / detail / tab-return | 18/18 · 8/8 · 7/7 |
| 冻结面哈希 | **MATCH** |

## 19–21. PEARL/DUSK · EN/ZH · 验证

主题与语言对锚点无分支（纯几何）✓；`verify:visual-language` / `verify:ui` PASS。
`verify` **361/361** · `verify:cloud` **272/272** · **`verify:all` EXIT 0**（5m11s）。

### RED / GREEN
移除 `syncDrawerAnchors` 调用 ⇒ **S2/S3、S4、S5、S7 红**，其中 S2 的判据是
`the affordance must move on most frames, saw **1** distinct positions` —— 即「整个 travel 中控件完全不动」，
正是真机所见。逐字节还原后 **39/39 GREEN**（RED 残留 0）。

## 22. 真机状态

**PASS（投影/帧日志级）**：真机 4 个抽屉组、travel 40 帧 **40 个不同位置**、`maxJumpPx` 占全程 4.2%、START/MID/END 单调连续。
⚠️ **逐帧观感仍需用户肉眼确认**（无录屏逐帧工具）；本轮提供的是**运行时投影日志**，不是视觉判定。
⚠️ 真机取证：`simulator_refresh` **不推送新包**，须用 `--action remote`（会把 automator 切回模拟器，**约 50s 自动重连、无需扫码**）。

## 23. 剩余限制

1. 只有**簇（≥2 同组）**才有 marker-anchored affordance；单 marker 没有该控件（既有产品形态，未改）。
2. 手势期间 overlay 仍按既有语义隐藏（逐帧投影需要相机状态，手势的视口未知）。
3. 极长 travel 时锚点会走到视口外并被裁剪（符合既有模型，未新增 clamp）。
4. 本机验证链需要 stdin shim（既有环境限制）。

---

## 建议

| 项 | 建议 |
|---|---|
| **A. MAP DISCLOSURE STATE CONTINUITY** | **KEEP**（上一轮，真机已通过） |
| **B. MAP DISCLOSURE SPATIAL CONTINUITY** | **KEEP**（真机 40/40 帧跟随、maxJump 4.2%、无 settle flash） |
| **C. MAP CAMERA CONTINUITY** | **KEEP**（A→B 17 帧、overview 40 帧、手势取消 0 帧，全部未回归） |

**READY FOR MAP SELECTED AFFORDANCE VISUAL APPROVAL**
