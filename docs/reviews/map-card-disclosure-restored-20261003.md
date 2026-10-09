# 卡片左下角 Disclosure 控件 —— 产品语义纠正与恢复（2026-10-03）

> 上一轮（Option 乙 / native marker disclosure）**正式撤回**。本文记录撤回范围、恢复证据、  
> 新的产品契约与验证结果。检查点**未推进**；等真机视觉批准。

---

## 1. 纠正后的产品语义

|               | 错误理解（已撤回）      | 正确理解（本轮）                             |
| ------------- | -------------- | ------------------------------------ |
| 用户说的"展开按钮"    | marker 旁的控件    | **底部 selected card 左下角那个既有按钮**       |
| SPATIAL OWNER | MARKER         | **BOTTOM CARD**                      |
| 地图移动时         | 控件必须跟着 marker  | **card shell 与按钮保持页面位置**，只更新 card 内容 |
| ACTION TARGET | marker callout | **card 左下角**                         |

最终结构：

```
MAP MARKER            → 保持原有 marker / cluster interaction（不承载 disclosure）
BOTTOM SELECTED CARD  → 保持现有位置
CARD LOWER-LEFT       → 唯一 expand / collapse disclosure control
```



---

## 2. 撤回清单（上一轮因误解新增的部分）

| #  | 撤回内容                                              | 证据                                                                                     |
| -- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1  | `mapAffordances` 视图模型                             | `grep` 全仓 = 0 命中                                                                       |
| 2  | `buildAffordance()` / `syncAffordanceState()`     | 同上                                                                                     |
| 3  | `AFFORDANCE_GLYPH` / `AFFORDANCE_GLYPH_DUSK` 常量表  | 同上                                                                                     |
| 4  | `affordanceIndex` 与 disclosure 专用 `customCallout` | 同上                                                                                     |
| 5  | `<cover-view slot="callout">` 内整个 disclosure 块    | wxml 内 `native-affordance` = 0；`slot="callout"` 只剩 drawer 一个                           |
| 6  | `.native-affordance*` 五条样式                        | wxss 内 0 命中                                                                            |
| 7  | `refreshStackFrame` 里 `!drawerOverlayMode()` 护栏   | 已还原为原实现                                                                                |
| 8  | 4 个 `chevron-{down,up}{,-dusk}.png`               | **Safe Local Archive** 到 `.workbuddy-ai/scratch/map-camera/removed-native-disclosure/` |
| 9  | `tools/build-lucide-chevron-png.py`               | 同上（仅服务本次迁移，已无消费者）                                                                      |
| 10 | `moved-build-sources.json` 的 4 条 runtimePngs      | 已还原为 **11** 条（与 HEAD 逐字节一致）                                                            |
| 11 | `verify-package-budget.cjs` 的 `15`                | 已还原为 `11`                                                                              |

**保留未动**（原有产品能力，与 disclosure 无关）：`drawerRenderMode` / `view-overlay` 架构、  
drawer callout、cluster stack 与它的 `onDrawerToggle`、overlay 定位、相机链路、图片管线。

**手势采样是否还有别的用途？** 有 —— `startGestureTracking` / `sampleGestureCamera` /  
`syncDrawerAnchors` 服务的是 **drawer 行与 overlay** 的定位，不是 disclosure。**全部保留**。

---

## 3. 恢复证据（逐字还原）

| 项                          | 结果                                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `.place-collapse` wxml 行   | 与 `git show HEAD:` **逐字节一致**                                                                          |
| `.place-collapse*` wxss 规则 | 与 `git show HEAD:` **逐字节一致**                                                                          |
| 位置                         | `left:36rpx; bottom:calc(var(--tab-clearance) + 24rpx)`（原位置）                                          |
| 尺寸                         | 88rpx 命中区 / 56rpx 视觉 / 24rpx 圆角（原尺寸）                                                                  |
| 图标                         | `<s-icon name="chevron-down" size="28" color="{{dusk ? '#eeeae3' : '#273b31'}}">`（原图标，PEARL/DUSK 原色）  |
| hit target                 | `catchtap` + `hover-class="ui-pressed"` + `hover-start-time/stay-time`（原样）                            |
| semantics                  | `aria-role="button"` + `aria-expanded="{{!cardCollapsed}}"` + `aria-label` 走既有 locale key（原 EN/ZH 文案） |
| collapsed 表现               | `.place-collapse.is-collapsed .place-collapse-visual { transform: rotate(180deg) }`（原样）               |
| 未重新设计                      | 无任何新增视觉/几何                                                                                            |

---

## 4. `onTogglePlaceCard` 的全部入口

| # | 位置                                                 | 形态                             |
| - | -------------------------------------------------- | ------------------------------ |
| 1 | `pages/map/index.wxml:213`，卡片左下角 `.place-collapse` | `catchtap="onTogglePlaceCard"` |
| — | `pages/map/index.js:1391`                          | 处理器本体（唯一）                      |

⇒ `cardDisclosureInteractiveCount = 1`，`nativeMarkerDisclosureInteractiveCount = 0`。

**cluster / stack 按钮**：仍是 `catchtap="onDrawerToggle"`，**不调用** `onTogglePlaceCard`（断言 CD1 覆盖）。

---

## 5. A→B 稳定性根因审计（不假设是 marker 投影问题）

逐项排查「卡片左下角按钮在 A→B 时停顿 / 闪烁 / 消失」的可能来源：

| 候选                                   | 结论                                                                                                                   |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `selected` 对象替换                      | **不是**：`applyFilters` 每次都造新对象，但**永不为假**（`visible` 非空时），`wx:if="{{selected}}"` 不发生分支切换 ⇒ **不 remount**                |
| `wx:key` / 按 id 重建                   | **不是**：模板里没有对 `selected` 的 `wx:key`，也没有把 `selected.id` 写进 class                                                      |
| card shell remount                   | **不是**：`.place-card` / `.place-collapse` / `.place-expand` **共用同一个 `wx:if="{{selected}}"` 门**，三者同生同灭                 |
| `cardCollapsed` 被 selection 重置       | **曾是**（`selectMapMemory` 旧实现强制 `cardCollapsed:false`）⇒ **上一轮已修**，本轮断言 CD5/CD6 固定                                     |
| `selectedPhoto` patch                | **不是**：只写 `selectedPhoto`，不碰 disclosure（CD7 断言写入集合只有 `cardCollapsed`）                                                |
| CSS animation / opacity              | **不是**：`cardCollapsed` 不变 ⇒ `.place-collapse-visual` 的 transform 过渡不触发；`.place-card.card-is-collapsed` 的 opacity 也不变 |
| `place-collapse` / `place-expand` 切换 | **不是**：`.place-expand` 只是**视觉名字条**（`pointer-events:none`、无 handler），它的显隐不影响 `.place-collapse`                        |
| 相机 transition / gesture lifecycle    | **不是**：CD8b 断言整条相机+手势路径**零** disclosure 写入、零 `screenX/screenY` 写入                                                    |

⇒ **结论**：恢复后的控件是**纯 CARD-space 元素**，由样式表定位，`cardCollapsed` 是它唯一的状态。  
上一轮观察到的所有"跟不上 / 闪 / 消失"都来自 **marker-anchored** 那个控件（本轮已删除），  
不是卡片按钮本身的问题。

---

## 6. 验证

| 命令                                                                          | 结果                                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `npm run verify`                                                            | **361/361 PASS**                                                                                              |
| `verify:all` 54 项逐个独立运行                                                     | **52 OK / 2 FAIL**，两个 FAIL 都**只**指向 §7 的冻结哈希（`verify:cloud`、`verify:r2` 里的 `verify:map-veil-review`，后者读同一组字段） |
| `verify:map-camera-motion`                                                  | **47/47**（CD1–CD8b 取代原 N1–N11）                                                                                |
| `verify:icons`                                                              | OK（`<s-icon>` 计数 **87 → 88**，恢复的控件带回一个 `<s-icon>`）                                                            |
| `verify:map-overlay-drawer`                                                 | **18/18**（D3 还原为「overlay 下 cluster 不得挂 callout」）                                                              |
| `verify:package-budget`                                                     | OK（runtimePngs 回到 11）                                                                                         |
| `verify:detail-original` / `verify:image-cache` / `verify:map-photo-budget` | OK                                                                                                            |
| `verify:cloud` 干跑（临时推进 2 个 sha256）                                          | **272/272 EXIT 0** ⇒ 冻结哈希是唯一红点；随后 fixture 原样还原（`4b6ab61e…`）                                                   |

### 断言改写（按新契约，不是删测试）

| 原断言                                             | 现在                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `N1–N4 / N5,N8 / N9 / N10 / N11`（原生 callout 契约） | **整块替换**为 `CD1/CD2/CD3`、`CD5/CD6`、`CD7/CD8`、`CD8b`                                                                                                                                                       |
| `CD1`                                           | 恰一个 **card** disclosure 控件（`place-collapse`），`onTogglePlaceCard` 全模板恰 1 处，带 button semantics                                                                                                             |
| `CD2`                                           | **零** marker-native disclosure：`native-affordance`/`mapAffordances`/`buildAffordance`/`syncAffordanceState`/`AFFORDANCE_GLYPH` 全 0；`slot="callout"` 恰 1 个且仍属 drawer；overlay 下无 marker 声明 `customCallout` |
| `CD3`                                           | 控件调用既有 handler，且该 handler 只写一个字段；几何/图标/DUSK 逐条断言                                                                                                                                                         |
| `CD4`                                           | `.place-expand` 无 handler / 无 button semantics / 两态都无 hit area；cluster 按钮不调 `onTogglePlaceCard`                                                                                                          |
| `CD5/CD6`                                       | A→B→C 下 `cardCollapsed` 粘住；控件只由 `wx:if="{{selected}}"` 门控、class 不含 `selected.*`、无 `wx:key` ⇒ 不 remount；`cardCollapsed` 是 page data 里唯一 disclosure 状态                                                     |
| `CD7/CD8`                                       | 切换路径零 `getScale` / 零 `getRegion` / 零相机 prop 写入；写入集合只有 `cardCollapsed`；selection 不写 disclosure、不写 `screenX/screenY`                                                                                       |
| `CD8b`                                          | 相机 travel + gesture + overview 全程**零** disclosure 写入                                                                                                                                                     |

> ⚠️ 命名：文件里 **G1–G5 已被相机几何块占用**，所以纠正后的契约标为 **CD1–CD8**（= brief 的 G1–G8），  
> 并在注释里写明映射。一个套件里出现两个不同的 "G1" 正是会掩盖缺口的歧义。

---

## 7. 冻结哈希

| 文件                     | 注册值（旧）      | 现场值（新）                                                             |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| `pages/map/index.wxml` | `4522d594…` | `1ba673f602e26a13fe404a3c1660da5587745bc6b1a6a2d03cafebeb32b94e2b` |
| `pages/map/index.wxss` | `c13016f3…` | `82c802002a9653cbc37e6046c23280885578f300fbcfbb437b872a068bdb7cc6` |

**未登记**。本轮结束仍为 **PENDING USER VISUAL APPROVAL**。

---

## 8. 真机结果（OPPO PKB110 / Android 16 / SDK 3.17.3 / 359×622 / DPR 3.5）

**代码版本已确认**：真机 `buildAffordance` 不存在、`syncAffordanceState` 不存在、
`mapAffordances` 字段不存在 ⇒ 加载的是纠正后的代码。

| 项 | 真机结果 |
|---|---|
| `nativeAffordanceFieldsPresent` | **false** |
| `buildAffordanceGone` / `syncAffordanceGone` | **true / true** |
| `markersDeclaringCallout` | **0**（每一步快照；drawer 的 overlay 臂未被波及） |
| `markersWithDisclosure` | **0** |
| 单次点击 | `calls=1, false→true, changedExactlyOnce=true` |
| 粘性 | 收起后换选另一条 ⇒ `true → true`（**粘住**） |
| **相机 + 手势路径的 disclosure 写入** | **0**（同一段路径确实跑了：`regionChanges=4`、`projections=144`） |
| 第二次点击 | `after=false`，累计 `flips=2` |
| **`disclosureWriteLog`** | **`[true, false]`** ⇒ 两次点击 = 两次写入、严格交替，**无双切换、无空写** |
| 卡片图片源 | `cloud`（记录自身原图） |

⇒ 纠正后的契约在真机上**全部成立**。

**待用户肉眼确认**（`simulator_screenshot` 返回 374×809 = 模拟器，**不跟随真机**，我拿不到真机画面）：
卡片左下角圆形 chevron 是否已回来、拖地图/缩放时是否稳稳停在卡片上。

---

## 9. 本轮改动文件

**产品**：`pages/map/index.wxml`、`pages/map/index.wxss`、`pages/map/index.js`

**闸门**：`tools/verify-map-camera-motion.cjs`、`tools/verify-cloud.cjs`、`tools/verify-icons.cjs`、  
`tools/verify-map-overlay-drawer.cjs`、`tools/verify-package-budget.cjs`、  
`tools/fixtures/moved-build-sources.json`

**归档（可恢复，未删除）**：`.workbuddy-ai/scratch/map-camera/removed-native-disclosure/`  
（4 个 PNG + 生成器脚本）

**未改**：`imageCache`、Home、Add、Us、Me、store 语义、TabBar、POI、search、cluster/stack、相机链路。

---

## 10. 建议

| 项                                  | 建议                     |
| ---------------------------------- | ---------------------- |
| **A. CARD LOWER-LEFT DISCLOSURE**  | **KEEP**（已逐字恢复，真机视觉待判） |
| **B. MARKER-NATIVE DISCLOSURE**    | **REMOVE**（已完成）        |
| **C. DISCLOSURE STATE CONTINUITY** | **KEEP**               |
| **D. MAP CAMERA**                  | **KEEP**               |

---

## 11. 追加决定：`drawerRenderMode` 定为 `'native-callout'`（用户选 A）

### 11.1 用户报告的症状

**marker 堆叠下方**的圆形 chevron 在**滑动地图时飘到 marker 之外**。
（卡片左下角那个控件**没有问题** —— 见 §8。）

### 11.2 真机诊断（先证明不是逻辑 bug）

| 项 | 真机值 | 结论 |
|---|---|---|
| `drawerCssMotion` / `drawerOverlayMode` / `drawerTransformDriver` | `true / true / true` | 收起态的 `translate3d(0,-331px,0)` **确实生效** |
| `toggleDrawn` | `{left:99, top:369}` | 按钮实际画在哪 |
| `markerAt`（实况相机投影） | `{x:121, y:365}` | marker 锚点（pin 尖端） |
| **`offsetFromMarker`** | **`{x:-22, y:+4}`** | 水平居中、pin 尖端下方 **4px** ⇒ **静止时完全正确** |
| 原生平移后的滞后采样（11 点） | `0,-1,-1,-1,0,0,0,0,0,0,0` | **最大 1px，settle 后 0** |

⇒ **应用侧跟随是准确的**；位移只出现在**拖拽进行中**。

### 11.3 根因

`view-overlay` 下抽屉的墨是**普通视图**，靠 `regionchange` / `getRegion` **采样**相机重定位；
原生 marker 由地图合成器**每帧**移动。**两个时钟无法焊死** ⇒ 快拖必然拖尾。

这正是 `drawerRenderMode` 注释里写明的待裁决项：
*"the LOCAL REAL-DEVICE PREVIEW VALUE for arm B. It must be settled by a device run before
anything is committed"*。

### 11.4 改动

`pages/map/index.js` 的 `data.drawerRenderMode`：`'view-overlay'` → **`'native-callout'`**，
并把注释改为记录**这次真机裁决**（症状、测量值、为什么是架构问题、代价是什么）。

### 11.5 静态验证

`npm run verify` **361/361**；`verify:all` 54 项逐个独立运行 = **52 OK / 2 FAIL**，
两个 FAIL 都**只**指向 §7 的冻结哈希（`verify:cloud`、`verify:r2` 里的 `verify:map-veil-review`）。
`verify:map-overlay-drawer` **18/18**、`verify:map-drawer-motion`、`verify:map-motion`、
`verify:map-trace`、`verify:marker-apply`、`verify:map-reveal-cadence`、`verify:map-viewport`、
`verify:map-empty`、`verify:map-camera-motion` **全部 OK** ——
**每个套件都 pin 自己演练的 mode，所以没有闸门依赖这个默认值**（注释里早已写明）。

⚠️ **wxml/wxss 未改动** ⇒ 冻结增量与本轮之前**完全相同**（wxml `1ba673f6…`、wxss `82c80200…`）。

### 11.6 待真机复验（本 arm 的代价）

`'native-callout'` 下 320ms 抽屉展开/收起会**走 JS→原生桥** —— 这正是当初选 `view-overlay` 的理由。
必须真机确认：

1. 拖拽时堆叠开关是否**不再飘**（本 arm 的目的）；
2. 抽屉展开/收起**是否仍然流畅**（本 arm 的代价）；
3. 一次开/关的桥写入次数（`device/d9-native-callout.js` 会量出来）。

**若动画在真机上变卡** ⇒ 回到 B/C，或做**混合方案**（只把**静态的**开关按钮放进 callout、
动画的行仍留在 overlay）—— 那是新设计，需用户单独批准。
