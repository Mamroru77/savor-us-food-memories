# ROUND 0 — Marker-Integrated Stack Affordance 可行性审计（2026-10-03）

> **本轮只做审计，不实施。** 方案 A 已被真机判定 REJECTED 并已回退（见 §1）。
> 审计对象：把 stack / count / chevron affordance **合成进 native marker bitmap**，
> 从而取消 marker 旁那个独立的悬浮控件。

---

## 1. STEP 1 — 方案 A 回退结果

| 项 | 结果 |
|---|---|
| 改动 | `pages/map/index.js` 的 `data.drawerRenderMode`：`'native-callout'` → **`'view-overlay'`**（与 `git show HEAD:` 同值） |
| 注释 | 保留原文，并追加 2026-10-03 的真机裁决记录（A 被拒、原因是动画过桥后卡顿） |
| 未回退 | A→B 相机连续性、overview 相机、`cardCollapsed` 粘性、卡片左下角 disclosure、image cache、卡片预览、Me/Home 预载、detail ORIGINAL、Tab 返回缓存、POI、search —— **全部保留** |
| 静态验证 | `npm run verify` **361/361**；`verify:map-camera-motion` / `verify:map-overlay-drawer` / `verify:map-drawer-motion` **全部 OK** |
| wxml/wxss | **未改动** ⇒ 冻结增量不变（wxml `1ba673f6…`、wxss `82c80200…`） |

⇒ **A 引入的 native callout renderer flag 已不再生效于真机。**

---

## 2. 当前 marker 合成管线（问题 1）

`miniprogram/utils/mapMarkers.js` → `createRenderer(canvas)`：

```
render(memory, selected)
  key = JSON.stringify([source, !!selected])          ← 缓存键
  三阶段流水线（各自独立并发）：
   1 NETWORK  cloud → imageCache.localSource(source,'marker')   并发 3
   2 HEAVY    测真实尺寸 → wx.compressImage 到 384px 长边 → 解码 → 取 frame 美术   并发 1
   3 COMPOSE  单张共享 canvas，串行                               并发 1
```

**COMPOSE 的实际绘制**（`composeStage`）：

```js
ctx.setTransform(3,0,0,3,0,0); ctx.clearRect(0,0,256,286);
rounded(ctx,32,43,192,195,27); ctx.clip();          // 照片圆角矩形裁剪
ctx.drawImage(photo, …aspectFill…);                 // ① 照片
ctx.drawImage(frame, 0,0,256,286);                  // ② frame 美术（整张叠上）
wx.canvasToTempFilePath({ width:768, height:858 })  // ③ 导出 3x PNG
```

- 逻辑尺寸 **256×286**，导出 **768×858**，磁盘 PNG 约 45–48 KB。
- `frame` = `/images/markers/landmark-{normal|selected}-frame.png`（每 renderer 惰性解码一次）。
- `style(selected)` → `{width: 80|48, height: w*286/256, anchor:{x:0.5, y:276/286}, zIndex}`。
- **缓存键只有 `[source, selected]`**；`peek()` 用同一键同步命中。
- `LIMIT=512` 变体；`dispose()` 删除全部临时文件。

### frame 美术里已经有的"槽位"（关键）

`docs/design/landmark-selected-frame.svg`（256×286）已经画了：

| 元素 | 位置 |
|---|---|
| 气泡/pin 外形 + 底部尖角（锚点在 y≈276） | 全幅 |
| 左下 **S 首字母徽章** | (6..82, 5..94) |
| 右下 **分类徽章**（utensils） | (164..241, 164..253) |
| 右上 **选中绿勾圆** | 圆心 (218,40) r25 |

⇒ **marker 已经是"照片 + 多个徽章"的合成体**，再加一个 stack/count 徽章**不是新范式**。

---

## 3. 当前 cluster marker 表示（问题 2）

`applyFilters` 里，`groups[index].members.length > 1` 时：

```js
target.width=80; target.height=90;
if (overlayMode) {                 // 当前默认
  target.width=80; target.height=89; target.anchor={x:0.5,y:1};
  target.iconPath = cached || mapMarkers.style(isSelected).iconPath;   // 根记忆的照片合成
} else {                           // native-callout 臂
  target.width=1; target.height=1; target.iconPath='/images/markers/stack-anchor.png';
  target.anchor={x:0.5,y:1};       // 透明 1px 锚点，墨由 callout 画
}
```

**结论**：cluster **没有独立的 marker 表示**。它复用**根记忆**的合成图（照片 + frame），
**"堆叠"的观感完全来自 overlay/callout 额外画出的那些行**，不是 marker 自己画的。

---

## 4. 当前 `onMarkerTap` 语义（问题 3、5）

```js
onMarkerTap(event) {
  const index = event.detail.markerId, group = this.markerGroups && this.markerGroups[index];
  if (group && group.members.length > 1) {
    if (this.data.clusterOpen && this.drawerRootId === group.memory.id)
      this.selectMapMemory(group.memory.id, true);   // 已开 → 选根
    else this.onDrawerToggle({currentTarget:{dataset:{index}}});   // 未开 → 开关抽屉
    return;
  }
  const memoryId = this.visibleIds && this.visibleIds[index];
  if (memoryId) this.selectMapMemory(memoryId);      // 单点 → 选中
}
```

⇒ **cluster marker 的 tap 已经完全承担"开/关抽屉"**。
**独立 stack 按钮不是唯一入口** ⇒ 问题 5 的答案是 **YES**。

---

## 5. 当前 stack-button 的唯一功能（问题 4）

| 组成 | 作用 |
|---|---|
| `.pin-stack-toggle`（overlay 臂）/ `.native-stack-toggle`（callout 臂） | **唯一**职责：`catchtap="onDrawerToggle"` —— 一个**独立的点击目标** |
| 其中的 `stack-button-{up,down}{,-dusk}.png` | 视觉提示：这里可以展开/收起 |
| `.pin-stack-pages` | 翻页（`onDrawerPage`），**与开关无关** |
| `.pin-stack-row` | 每个成员一个点击目标（`onClusterPick`） |

⇒ 它**只做两件事**：一个独立 hit target + 一个可展开的视觉提示。
**没有**其它隐藏职责（不参与选中、不写数据、不控相机）。

### overlay 的命中区结构（决定"删掉开关后谁来接 tap"）

```css
.map-stack-overlay      { pointer-events:none; }   /* 容器不吃事件 */
.map-stack-overlay .pin-stack { pointer-events:none; }
.map-stack-overlay .pin-stack-toggle,
.map-stack-overlay .pin-stack-root,
.map-stack-overlay .pin-stack-pages { pointer-events:auto; }
.map-stack-overlay .pin-stack-row { pointer-events:auto; }
```

⇒ **容器本身是 `pointer-events:none`**。删掉 `.pin-stack-toggle` 后，
该区域的事件会**自然落到原生 marker**，**不需要任何透明 page overlay**（满足 brief 的
"DO NOT CREATE TRANSPARENT FAKE BUTTONS"）。

---

## 6. stack/count/chevron 能否绘进 marker（问题 6、7、8）

**能。** `composeStage` 已经在 `photo` 之上叠了 `frame`；再加一次 `drawImage`（或 canvas 文字）
即把徽章画进 marker 位图。三种可行做法：

| 做法 | 说明 | 代价 |
|---|---|---|
| **① 复用现有 `stack-button-*.png`** | 把它按比例 `drawImage` 到 marker 右下角 | **零新资产**；但它是"按钮"外观（圆底 + chevron），做徽章偏大偏重 |
| **② 画一个 count 徽章（canvas 文字 + 圆底）** | 与 frame 里 S 徽章/绿勾同一套圆底语言 | 需在 `composeStage` 加 ~15 行 canvas；**不新增资产** |
| **③ 新增 frame 变体 PNG** | `landmark-{normal|selected}-stack-frame.png` | **受阻**：`tools/build-map-icons.py` 依赖 cairosvg，**本机没有 cairo 原生库**，生成不了（同 2026-10-02 的结论） |

- **只在 `members.length > 1` 时绘制** —— 是（问题 7）。单点 marker 完全不变。
- **selected / unselected 是否需要不同处理** —— 是（问题 8）。frame 本来就分 normal/selected，
  徽章也应跟着这两套走（例如选中态徽章用 `#416344` 底 + 白字，未选中用 `#273b31` 底 + 奶白字，
  与既有徽章一致）。

---

## 7. 缓存影响（问题 9）

**当前键**：`JSON.stringify([source, !!selected])`。

**需要的键**：`JSON.stringify([source, !!selected, stacked])`，其中 `stacked = members.length > 1`。

- 键里**只有** source / selected / stacked（**count 不进去** —— 否则每个成员数都生成一张图，
  缓存爆炸；徽章画的是"这是组"而不是"有几条"，或按桶 2/3+ 归并）。
- **绝不加入** `latitude` / `longitude` / 屏幕坐标 —— 满足 brief 的禁令。
- `peek()` / `prefetchSelected()` 必须同步改成三元素键，否则选中态会命中错图。
- 影响面：`render`、`peek`、`prefetchSelected`、`traceJobId` 共 4 处键构造（同一常量）。

---

## 8. 合成成本（问题 10）

| 阶段 | 现状 | 加徽章后 |
|---|---|---|
| NETWORK | cloud 下载 / 本地解析 | **不变** |
| HEAVY | 测尺寸 + 384px 重编码 + 解码 | **不变** |
| COMPOSE | `clearRect` + 裁剪 + `drawImage(photo)` + `drawImage(frame)` + **768×858 导出** | **+1 次小 `drawImage`（或 ~15 行文字绘制）** |

⇒ 边际成本相对**导出**（`canvasToTempFilePath`，最贵的一步）**可忽略**（<5%）。
**且只在 compose 发生时才付** —— 而 compose 只在
`group composition / selected / source / theme` 变化时发生（见 §9）。

---

## 9. NO NEW PER-FRAME WORK（brief 的硬要求）

marker 位图的重新合成**只**由这四件事触发：`members.length` 跨过 1（分组变化）、
`selected` 变化、`source` 变化、主题若视觉需要。

| 场景 | 现状 compose 次数 | 加徽章后 |
|---|---|---|
| drag | 0（相机变化不触发 compose） | **0** |
| pinch | 0 | **0** |
| A→B 相机帧 | 除 selection 自身的一次状态变化外 = 0 | **0** |
| overview | 0 | **0** |

⇒ 因为缓存键**不含相机**，且 `render()` 只在 `applyFilters` 里按 `[source, selected]` 调用，
**相机移动本来就不会触发 compose**。加徽章不引入新的每帧工作。**这一点天然满足。**

---

## 10. ⚠️ 审计的关键发现：**只能消灭"按钮"的第二个时钟，不能消灭"行"的**

这是本审计最重要的一条事实，必须讲清楚：

| 屏幕上可见的东西 | 谁画的 | 是否随相机移动 |
|---|---|---|
| marker 的照片 + 徽章 | **native marker 位图**（`mapMarkers` 合成） | 原生合成器，**零 JS** |
| **堆叠的行**（展开后多出来的卡片） | **overlay（普通视图）/ callout** | **靠 JS 投影定位** |
| **stack 开关按钮** | overlay / callout | 靠 JS 投影定位 |

⇒ 把 affordance 合进 marker 位图，**可以删掉那个常驻的悬浮按钮**（正是用户在拖拽时看到"飘走"的东西），
但**展开后的那几行仍然由 overlay 画**，仍然需要 JS 定位 ⇒ **打开状态下拖地图，行仍会拖尾。**

要**彻底**消灭第二套时钟，必须连"展开的行"也去掉，即：
**cluster 的成员不再用地图上的堆叠行呈现，改为在底部 selected card 里翻页选择。**
那是**产品交互变更**，不是纯实现优化，需要用户单独裁决。

---

## 11. 独立 hit target 是否真的必要（问题 6 的核心）

**不必要。** 理由（全部有代码依据）：

1. `onMarkerTap` 对 cluster **已经**调用 `onDrawerToggle`（§4）—— 行为 100% 覆盖开关的功能。
2. `.map-stack-overlay` 容器是 `pointer-events:none`（§5）—— 删掉开关后事件自然落到原生 marker。
3. 开关**没有**其它职责（§5）。
4. cluster root marker 在 overlay 臂下是 **80×89 CSS px**（§3），
   **远大于** 44px 的最小触控尺寸 ⇒ **marker 本身点击区域足够**。

⇒ **不存在 brief 里那个 FALLBACK 分支的前提**（"必须保留独立点击区域"）。

---

## 12. 三套架构的事实对比（问题 12）

| | **A. native-callout** | **B. view-overlay sampled** | **C. marker-integrated** |
|---|---|---|---|
| 空间同步 | 原生合成器，构造上同步 | JS 投影，**采样** | marker 位图部分：**原生同步**；行部分：JS 投影 |
| drag 表现 | 同步 | **拖尾**（用户实测） | 按钮消失 ⇒ 常驻控件不再拖尾；**行仍拖尾** |
| pinch 表现 | 同步 | 拖尾 | 同上 |
| 相机表现 | 同步 | 拖尾 | 同上 |
| JS 工作量 | 320ms 动画**逐帧过桥** | 每帧投影（`syncDrawerAnchors`） | 每帧投影**不变**（行还在） |
| native 工作量 | 高（动画在原生层） | 低 | 低 |
| remount 风险 | callout 挂载/卸载 | 无 | 无（位图缓存） |
| tap 语义 | 开关独立 hit target | 开关独立 hit target | **marker 自己**（更简单） |
| 实现复杂度 | 低（一个 flag） | —（现状） | **中**：改缓存键 + compose + 删开关 + 改 5 处断言 |
| 回归风险 | **高**（真机动画卡顿，已 REJECT） | — | **中**：断言面广（见 §13） |
| 真机判定 | **TOO LAGGY ⇒ REJECTED** | 可用但有拖尾 | **未测** |

---

## 13. 需要改动的文件与回归风险（问题 10、11）

**若实施 C**：

| 文件 | 改动 |
|---|---|
| `utils/mapMarkers.js` | 缓存键加 `stacked`；`render/peek/prefetchSelected/traceJobId` 4 处；`composeStage` 加徽章绘制 |
| `pages/map/index.js` | cluster 时把 `stacked` 传给 renderer；**删除** `.pin-stack-toggle` 的 hit target 与 `onDrawerToggle` 的绑定（或保留 `onDrawerToggle` 供内部使用） |
| `pages/map/index.wxml` | 删掉 `.pin-stack-toggle` 节点（overlay + callout 两处） |
| `pages/map/index.wxss` | 删掉 `.pin-stack-toggle*` 规则；**保留** `.pin-stack-row` / `.pin-stack-pages` 的命中区 |
| 断言 | `verify-cloud`(5) / `verify-map-overlay-drawer`(6) / `verify-map-drawer-motion`(4) / `verify-map-camera-motion` / `verify-assets` / `verify-icons` / `verify-package-budget` **共 7 个套件** 含 `stack-button` 相关断言 ⇒ **全部需要按新契约改口径（不是删测试）** |

**主要回归风险**：
1. **触控可达性**：删掉开关后，marker tap 必须真的能到达 cluster（`.map-stack-overlay` 的
   `pointer-events` 已确认是 `none`，但**真机必须验**）。
2. **⚠️ 删掉开关会失去唯一的"收起"入口（已核实，这是硬事实）**：
   - `.pin-stack-toggle` 是 wxml 里**唯一**绑定 `catchtap="onDrawerToggle"` 的节点；
   - `onMarkerTap` 对**已打开**的 cluster 走的是 `selectMapMemory(rootId, true)`，
     而 `selectMapMemory` 里 `clusterOpen: Boolean(keepDrawer && this.data.clusterOpen)`
     ⇒ **保持打开，不会收起**；
   - `onClusterClose()` 虽然实现了收起逻辑，但**在 wxml 里没有任何绑定、在生产 JS 里也没有调用点**
     （只有 `verify-cloud.cjs` 的三个测试在调它）⇒ **当前从 UI 上不可达**。
   ⇒ 因此**实施 C 之前必须先补上"点已打开的 cluster 收起"的语义**（例如让已开时也走
     `onDrawerToggle`，或把 `onClusterClose` 接到 marker tap 的已开分支）。**这是产品语义决定，不是实现细节。**
3. **7 个套件改口径**：`stack-button-*.png` 若不再被引用，`verify-assets` 的
   "referenced local assets" 与 `verify-package-budget` 的 runtimePngs 会变 ⇒ 又是一次数字型闸门变动。

---

## 14. 结论

### MARKER-INTEGRATED AFFORDANCE — **PARTIALLY VIABLE**

| 目标 | 可行性 |
|---|---|
| 取消 marker 旁**常驻**的悬浮按钮 | ✅ **VIABLE** —— marker 位图承载 stack/count 徽章；`onMarkerTap` 已覆盖开关行为；overlay 容器 `pointer-events:none` 使 tap 自然落到 marker；marker 命中区 80×89 足够 |
| 把 stack/count/chevron 绘进 marker | ✅ **VIABLE** —— `composeStage` 已是"照片 + frame 叠层"，加一次 `drawImage` 即可；缓存键加 `stacked`，**不含相机** |
| NO NEW PER-FRAME WORK | ✅ **天然满足** —— 相机变化本来就不触发 compose |
| **彻底消灭第二套空间时钟** | ❌ **NOT VIABLE**（在不改产品交互的前提下）—— **展开的行仍由 overlay 画**，仍靠 JS 投影 |

### 因此：**不建议直接进入实施**，需要你先裁决 1 件事

**"抽屉打开后，cluster 的成员怎么呈现？"**

- **方案 C1（保守）**：保留 overlay 的堆叠行，只删常驻按钮 + marker 加徽章。
  ⇒ 常驻拖尾消失；**打开状态下拖地图，行仍会拖尾**。需先补上"点已开的 marker 收起"的语义缺口。
- **方案 C2（彻底）**：cluster 的成员**不再在地图上展开**，改为在**底部 selected card** 里翻页选择。
  ⇒ overlay 的堆叠层可以整块删除，**第二套空间时钟彻底消失**；但这是**产品交互变更**。

**C2 才是 brief 描述的"0 JS tracking"终局；C1 只是把可见的拖尾从"常驻"降级为"仅打开时"。**

请回复 **C1 / C2 / 暂不推进**。

**未 commit / 未 push / 未 deploy / 未上传 / 未推进 checkpoint。**
