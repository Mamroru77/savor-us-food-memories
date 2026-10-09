# 原生 Marker Disclosure — 终局（ONE CONTROL）+ 真机取证 2026-10-02

> 本文是本轮的**实施记录 + 待批准清单**。检查点**未推进**。
> 前置：`map-native-affordance-binding-audit-20261002.md`（审计）、
> `map-native-affordance-migration-20261002.md`（迁移实施）、
> `map-camera-scope-rules-20261002.md`（Map 范围规则全量版）。
> 授权：用户批准 **Option 乙** 并确认「**THERE MUST BE EXACTLY ONE EXPAND/COLLAPSE INTERACTION CONTROL**」。

---

## 0. 结论摘要

| 项 | 结论 |
|---|---|
| 旧页面级 `.place-expand` 作为第二个 disclosure 入口 | **REMOVED（交互能力）**，视觉节点保留 |
| 唯一 disclosure 控件 | **native marker-anchored callout**（`marker-id` + `catchtap`） |
| 图标 | **包内 PNG ×4**（不再依赖 SVG data URI） |
| 结构/功能验证 | **GREEN**（除 §5 的冻结哈希） |
| 冻结哈希登记 | **PENDING USER VISUAL APPROVAL** |
| 真机视觉 | **见 §7（本轮唯一未闭合项）** |
| CLOSED | **NO** |

---

## 1. 旧第二个控件的处置（brief 第 1 项）

`.place-expand` 是**收起态卡片的名字条**：它仍承载「当前选中的是哪家店」这一视觉信息，
所以按 brief 的「如果该节点已经完全没有视觉用途，可以最小化删除整个 legacy node；
根据真实结构决定」——**真实结构判断为「有视觉用途」**，因此：

| 动作 | 内容 |
|---|---|
| **删除** | `bindtap="onTogglePlaceCard"`、`aria-role="button"`、`aria-label` |
| **删除** | `.place-expand.strip-is-visible` 上的 `pointer-events:auto`（**这是关键**：只删 handler 会留下一个透明 96rpx 命中层，brief 明确禁止） |
| **保留** | 节点本身、`.place-expand-name` 文案、全部几何与视觉 |

于是它现在是**纯视觉节点**：既没有 handler，也没有命中区，两个状态下都没有。

---

## 2. `onTogglePlaceCard` 的**全部**入口（brief 第 2 项）

在**去注释**的模板源码里搜索，全仓只有 **1 处**：

| # | 位置 | 形态 | 性质 |
|---|---|---|---|
| 1 | `pages/map/index.wxml`，`<map>` 内 callout 的 `.native-affordance-hit` | `catchtap="onTogglePlaceCard"` | **产品允许的唯一入口** |

处理器本体只有一处：`pages/map/index.js` 的 `onTogglePlaceCard()`。

---

## 3. ONE-CONTROL 证明（brief 第 3 项）

对 `miniprogram/pages/map/index.wxml`（**去注释**后）实测：

```
onTogglePlaceCard 出现次数        = 1     （预期 1）
class="native-affordance-hit"     = 1     （预期 1）
class="place-collapse "           = 0     （旧页面控件，预期 0）
.place-expand 的交互属性           = 无    （bind*/catch*/data-action/aria-role=button/aria-expanded/hover-class 全无）
.place-expand 的 pointer-events    = none（两个状态都是）
```

`nativeDisclosureCount = 1`，`legacyDisclosureInteractiveCount = 0`。

> ⚠️ **一个真实的坑（本轮踩到并修掉）**：`verify-cloud.cjs` 里有一条
> `assert(!native.includes('catchtap'))`，它被**我自己写的注释**里出现的 `catchtap` 这个词
> 触发而变红 —— 断言读的是含注释的源码。现在该测试**先剥掉 HTML 注释再判结构**。
> 这是「闸门要断产品契约，不是字面量」的直接实例。

---

## 4. 其余改动

### 4.1 callout 结构对齐「已被真机证明」的形态

第一版把 `slot="callout"` 与 `marker-id` 写在**同一个** `cover-view` 上。
本仓唯一**真机证明过**的 callout 结构是 drawer callout 的形态：
**外层 `<cover-view slot="callout">` 占槽，内层 `<cover-view marker-id=… wx:for=…>` 挂 marker**。
已改为与该结构逐字对齐，并把这一点写进断言（`N1-N4`）。

### 4.2 图标改为包内 PNG（brief「DO NOT GAMBLE ON DATA URI」）

- 新增 `tools/build-lucide-chevron-png.py`：**只用标准库**复刻 `tools/build-map-icons.py` 的
  chevron 配方（官方 Lucide SVG → 72×72、stroke 1.75、round cap/join、bKGD 块）。
  ⚠️ 之所以另起脚本：`build-map-icons.py` 依赖 **cairosvg**，而本机**没有 cairo 原生库**，
  那个脚本在本沙箱**根本跑不起来**。
- 脚本**先自证**再写文件：把 `chevron-left.svg` 重新光栅化，与**出厂** `chevron-left.png`
  逐像素比对，超过容差就**拒绝写盘**。实测 **124/5184 px 不同、最大通道差 6/255**。
- 产出 4 个文件（2 状态 × 2 主题）：

| 文件 | 字节 | 用途 |
|---|---|---|
| `chevron-down.png` | 280 | PEARL，卡片展开（点它 → 收起） |
| `chevron-up.png` | 282 | PEARL，卡片收起（点它 → 展开） |
| `chevron-down-dusk.png` | 282 | DUSK 同上 |
| `chevron-up-dusk.png` | 283 | DUSK 同上 |

  颜色沿用**已批准控件**的墨色 `#273b31`（PEARL）/ `#eeeae3`（DUSK）；
  `chevron-left/right.png` 的 `#34483c` 是堆叠翻页箭头的单色，不适用于本控件。
- **状态靠换 glyph，不靠 transform**（`cover-view` 连静态 rotate 都不保证）。
- 主题由模板三元选择（`dusk ? glyphDusk : glyph`），所以切主题**不需要** JS 重算。
- `pages/map/index.js` **不再 require `utils/icons`** ⇒ 上一轮为它加的 **17 个 harness 依赖注入已全部回退**。

### 4.3 `marker-id` 安全（brief 第 5 项）

保留上一轮修掉的真 bug：`findIndex === -1` ⇒ **不挂载**，绝不渲染 `marker-id="-1"`。
`mapAffordances` 只在 `markerId >= 0` 时挂载；`N9` 覆盖（选中项落进簇内 ⇒ 交给簇的堆叠按钮）。

### 4.4 overview 语义（brief 第 6 项）

上一轮修掉的 `selected && !overviewPlan` **不再存在**：overview 不是选择变化，
它既不隐藏也不重锚控件。`N5/N8` 断言 overview 后 `markerId` 与 `collapsed` 都不变。

---

## 5. ⛔ 预期红（唯一一处，等批准）

**`tools/map-identity-review.json`** 的 Map 链节 2 个 `sha256`：

| 文件 | 注册值 | 现场值 |
|---|---|---|
| `miniprogram/pages/map/index.wxml` | `4522d59434badb2c180a7bbebfb26e8a2415611a53df5d3bbd14ff31247e52e9` | `95c644d5c2b9adfa8ea8cde22bda63aa3f811f65f6cee38b228a638a02f42652` |
| `miniprogram/pages/map/index.wxss` | `c13016f30f8e4b7ed7779990d712cc145035d59401d2dda52b291edc2406a844` | `e3f8edd4ba605680ad85907c9a5468705216f66613f937eaf9707d94fcaeff67` |

**干跑已证**：临时把这 2 个字段指向新值后，`verify:cloud` **272/272 EXIT 0**；
随后 fixture 从备份**原样还原**，sha256 逐字节一致（`4b6ab61e…`）。

**已按新授权契约改口径并转绿的旧结构断言**（不是删除）：

| 文件 | 原断言 | 现在 |
|---|---|---|
| `verify-cloud.cjs` `'map card uses one fixed toggle …'` | `.place-collapse` 恰好 1 个 + 它的 `left/bottom` 几何 | 改名 `'map card keeps one fixed layout with exactly one disclosure control'`：`.place-collapse` = 0、`onTogglePlaceCard` = 1、native 控件尺寸 88/56rpx、`.place-expand` 无 `pointer-events:auto`；**卡片自身几何断言全部保留** |
| `verify-cloud.cjs` `'native visuals and transparent hit regions …'` | `!native.includes('catchtap')`（含注释） | 改为**去注释后**判定；并**新增**：disclosure callout 恰 1 个 `catchtap` 且必须是 `onTogglePlaceCard`、必须带 `marker-id`、不得画 drawer ink |
| `verify-icons.cjs` | `<s-icon>` 计数 `88` | `87` + 注释说明原因（旧控件的 `<s-icon>` 不能进原生 callout） |
| `verify-package-budget.cjs` + `fixtures/moved-build-sources.json` | `runtimePngs` 11 条 | 15 条（+4 个新 PNG，含 sha256/bytes） |

---

## 6. 验证结果

### 6.1 静态 / 结构（GREEN）

| 命令 | 结果 |
|---|---|
| `npm run verify`（带本机必需的 stdin shim） | **361/361 PASS** |
| `verify:all` 的 54 个条目逐个独立运行 | **52 OK / 2 FAIL**，两个 FAIL 都**只**指向 §5 的冻结哈希（`verify:cloud`、`verify:r2` 里的 `verify:map-veil-review`，后者读同一组字段） |
| brief 点名的套件 | 全部 **OK**：`verify:map-camera-motion`(**48/48**)、`verify:image-cache`、`verify:detail-original`、`verify:map-tab-return`、`verify:map-viewport`、`verify:map-photo-budget`、`verify:map-overview-label`、`verify:map-control-clearance`、`verify:map-search-clearance`、`verify:ui`、`verify:visual-language`、`verify:icons`、`verify:store-boundaries`、`verify:package-budget` |
| `verify:map-overlay-drawer` | **18/18**（D3 已按新契约改口径） |
| `verify:cloud` **干跑**（临时把 2 个 sha256 指向新值） | **272/272 EXIT 0** ⇒ 冻结哈希是唯一红点 |

> ⚠️ `verify:map-control-clearance` **不是** package.json 脚本，它只作为
> `node tools/verify-map-control-clearance.cjs` 出现在 `verify:r2` 里；用 `npm run` 调会因脚本不存在而失败。

### 6.2 RED 证明（新断言必须能变红）

| 断言 | 手法 | RED 结果 |
|---|---|---|
| 恰一个 disclosure 控件 | 临时给 `.place-expand` 加回 `bindtap="onTogglePlaceCard"` | `exactly one element toggles the card, saw 2` |
| 旧控件不得有透明命中层 | 临时给 `.place-expand.strip-is-visible` 加回 `pointer-events:auto` | `a transparent 96rpx tap layer would still be a second control` |
| **锚点 marker 必须声明 callout（N11）** | 临时回退 `customCallout` 赋值（回到修复前） | `N11 … and that marker declares the callout the control hangs off`；47/48 |
| 锚点必须合法（`markerId >= 0`） | 上一轮已证（`N9`） | `no affordance is mounted…` |
| overview 不得抹掉控件 | 上一轮已证（`N5/N8`） | `the affordance survives an overview` |

全部改动后均**从备份原样还原并核对 sha256**（`miniprogram/pages/map/index.js` 逐字节一致）。

---

## 7. 真机取证（brief「REAL DEVICE — REQUIRED NOW」）

**本轮尚未执行。** 原因：真机调试会话需要用户**手动扫码**建立，已与用户约定
「把静态部分全部做完，再一次性扫码跑完整真机批次」，避免反复重推。

已准备好的**一次性真机批次**（`.workbuddy-ai/scratch/map-camera/device/`）：

| 探针 | 覆盖 |
|---|---|
| `d1-relaunch-map.js` | `wx.reLaunch` 到 Map（每次导航只做一页） |
| `d2-contract.js` | 单控件计数、`markerId>=0`、A→B→C 锚点跟随、overview 不重锚、collapsed 粘性、一次切换 = 一次状态变化、disclosure 路径的 `getRegion/projectPoint/screen-position setData` 计数、4 个 glyph 资源在包内可读、`drawerRenderMode`、`customCallout` 计数 |
| `t1-install.js` / `t2-read.js` | 装只读计数器 → **用户用手指**做 drag / pinch / tap → 读回计数 |

**探针无法覆盖、必须靠用户肉眼判断的项**（如实标注为 NOT MEASURABLE BY AUTOMATION）：
慢拖 / 快拖 / 双指放大缩小 / 拖+捏合时「控件是否焊在 marker 上」；
以及原生 callout 相对 marker 的**实际落点**（平台无契约、无法查询）。

> ⚠️ 上一轮已实测：`automation_element_action` 合成的 `touchstart/touchmove/touchend`
> 在真机上产生 **0 个 `regionchange`** ⇒ 本工具链**无法合成原生地图手势**。
> 因此手势类项目只能由用户真手指驱动 + 肉眼判定，**不得**用探针结果冒充。

---

## 8. 真机结果（第一轮）

**已取得**（真机 OPPO PKB110 / Android 16 / SDK 3.17.3 / 359×789 / DPR 3.5）：

| 项 | 结果 |
|---|---|
| 单控件计数 | `affordanceCount = 1`（每一步都快照） |
| `markerId` 合法性 | 全程 `markerIdInRange = true`、`anchoredToSelected = true`（含 16 成员的簇根） |
| **A→B 锚点跟随** | `anchorSequence = [0, 1]` ⇒ 跟随 |
| overview | `anchorUnchanged = true` |
| collapsed 粘性 | `true → true` |
| expanded 连续性 | `false → false` |
| 一次切换 | `calls=1, false→true` ⇒ 只变一次 |
| 离屏 / 回屏 | 真机 `getCenterLocation` 确认相机移开 >1° ⇒ marker 投影 `x=-2005,y=2989`（屏外）；移回 ⇒ `x=180,y=395`（屏内）；affordance 数量全程 1 |
| **`getRegion` / `projectPoint` / `screenPositionWrites`** | **0 / 0 / 0**（14 次 affordance 写入只含 `collapsed/glyph/glyphDusk`） |
| 4 个 glyph 包内资源 | 真机 `accessSync` 全部 present |
| `drawerRenderMode` | `view-overlay` |
| **视觉（最重要的一问）** | **FAIL** —— 控件**没有渲染**，见 §9 |

⚠️ 诚实标注：`simulator_screenshot` 返回 **374×809（模拟器）**，**不跟随真机** ⇒ 我这边拿不到真机画面；
`automation_element_action` 合成的触摸在真机产生 **0 个 `regionchange`** ⇒ 拖拽/捏合无法代操作。

---

## 9. 真机第二轮：控件**根本没有渲染**（根因已定位并修复）

### 9.1 判定过程（不靠肉眼，靠像素比例）

用户提供真机截图（**873×1920 px**，视口 **359×1920/2.432** ⇒ 每 CSS px = **2.432** 截图 px）。
对 marker 下方区域做连通块分析，得到**唯一**一个 chevron，宽 **7.4 CSS px**：

| 候选控件 | 预期 chevron 宽 |
|---|---|
| `stack-button-down.png`（overlay 堆叠按钮，渲染 30.63 CSS px） | **≈ 8.0 CSS px** ← 命中 |
| 原生 disclosure disc 的 glyph（28rpx） | 13.4 CSS px |

⇒ 屏幕上是 **overlay 的堆叠按钮**，**原生 disclosure 控件没有画出来**。

### 9.2 根因（真机探针 + 本仓既有实现共同确认）

`<cover-view slot="callout">` 的子节点**只对「自己声明了 `customCallout` 的 marker」渲染**。
本仓 `customCallout` 只在 `members.length > 1 && !overlayMode` 时设置 ——
默认 `drawerRenderMode = 'view-overlay'` ⇒ `overlayMode` 为真 ⇒ **没有任何 marker 声明它**。
真机探针实测：`othersWithCustomCallout: 0`、`hadCustomCallout: false`。
⇒ 控件静默不画（没有报错、没有警告）。

### 9.3 修复

1. 在 `applyFilters` 里**于构建 markers 之前**解析 `affordanceIndex`，
   让**那个 marker** 声明 `customCallout: {display:'ALWAYS', anchorX:0.5, anchorY:0}`
   （`anchorX:0.5` ⇒ 气泡顶边中点落在 marker 锚点上 ⇒ **水平居中、挂在 marker 下方**）。
   一次解析、两处使用（锚点索引 + 谁声明 callout），两者不可能不一致。
2. `refreshStackFrame` 的**逐帧 `customCallout.anchorY` 写入**限定在 `!drawerOverlayMode()`：
   该循环本来就只服务 native-callout 臂（overlay 下没有任何 marker 有 callout ⇒ 原本是空转），
   现在它不可能再去拖新控件的锚点。**行为保持**。
3. `buildAffordance(markerIndex)` 改签名（索引由调用方解析），避免第二处 `findIndex`。

新闸门 **`N11`**（RED 已证：把 `customCallout` 赋值回退 ⇒ `N11` 红；还原后 48/48）。

### 9.4 卡片改回原图（用户决定）

`CARD_PREVIEW_LONG_EDGE` / `resolveCardPreview()` / `'preview'` 预取**全部删除**；
`selectedPhoto` 直接绑记录自身源（云原图）。口径同步更新：
`verify-detail-original` D8、`verify-image-cache` V3、`verify-map-overlay-drawer` D3、
`verify-map-camera-motion` C7/C8。

---

## 10. 本轮改动的文件

**产品**：`pages/map/index.wxml`、`pages/map/index.wxss`、`pages/map/index.js`

**资产（新增）**：`images/icons/lucide/chevron-{down,down-dusk,up,up-dusk}.png`

**生成器（新增）**：`tools/build-lucide-chevron-png.py`

**闸门 / fixture**：`tools/verify-map-camera-motion.cjs`、`tools/verify-cloud.cjs`、
`tools/verify-icons.cjs`、`tools/verify-package-budget.cjs`、`tools/fixtures/moved-build-sources.json`；
17 个 harness 回退上一轮的 `icons` 注入。

**未改**：`imageCache`、Home、Add、Us、Me、store 语义、TabBar、POI、search。

---

## 11. 建议

| 项 | 建议 |
|---|---|
| **A. LEGACY PAGE-SPACE DISCLOSURE** | **REMOVE**（已完成：handler + 命中区都已移除） |
| **B. NATIVE MARKER DISCLOSURE** | **KEEP**（真机视觉待判） |
| **C. ONE-CONTROL CONTRACT** | **KEEP** |
| **D. DISCLOSURE STATE CONTINUITY** | **KEEP** |
| **E. MAP CAMERA** | **KEEP**（本轮未动相机） |
