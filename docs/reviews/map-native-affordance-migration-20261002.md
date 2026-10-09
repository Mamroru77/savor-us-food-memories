# Map 选中标记的原生锚定 disclosure 控件（Option 乙）— 实施与验收 2026-10-02

> 本文是**本轮的实施记录 + 待批准清单**。检查点**未推进**；真机证据**未取得**。
> 授权依据：用户确认 **Option 乙**（把底部 expand/collapse 控件迁到 selected marker 下方并原生锚定），
> 并预先接受「WXML/WXSS 改动 ⇒ 冻结哈希链按设计变红」。审计与裁决见
> `docs/reviews/map-native-affordance-binding-audit-20261002.md`。

---

## 1. 结论摘要（先读这段）

| 项 | 结论 |
|---|---|
| 迁移是否实施 | **IMPLEMENTED = YES** |
| 静态验证 | **STATICALLY VERIFIED = YES**（`verify:map-camera-motion` 47/47） |
| 新契约是否有 RED 证明 | **YES**（2 处，见 §4） |
| 检查点 | **NOT ADVANCED**（预期红见 §5，等你批准） |
| 模拟器视觉 | **NOT CAPTURED**（本轮未跑模拟器截图） |
| **真机视觉 / 真机渲染** | **UNVERIFIED — 本轮最大缺口**（见 §7） |
| CLOSED | **NO** |

**一句话**：控件已从「JS 每帧算屏幕坐标」变成「原生 callout 挂在 marker 上，JS 一次都不算位置」，
这一层是干净且可断言的；**但原生 callout 的几何与 `cover-image` 对 SVG data URI 的支持，
只能由真机回答，本轮没有回答。**

---

## 2. 改了什么（精确到行）

### 2.1 `miniprogram/pages/map/index.js`

| 位置 | 改动 |
|---|---|
| 顶部常量 | 新增 `icons` require；`AFFORDANCE_GLYPH = { expanded: iconSvg('chevron-down'), collapsed: iconSvg('chevron-up') }` |
| `applyFilters` patch | `mapAffordances` 改为**视图模型**，与 selection 同一个 `setData` 下发 |
| `buildAffordance()` | 新方法：`{ markerId, collapsed, glyph }`，**不含任何屏幕坐标** |
| `syncAffordanceState()` | 新方法：把 `collapsed` + `glyph` 一起写回同一视图模型 |
| `onTogglePlaceCard()` | 增加一次 `syncAffordanceState()`（**唯一**状态变更点不变） |

`mapAffordances` 的挂载条件（本轮修正，见 §3.1）：

```js
const affordance = selected ? this.buildAffordance(selected, representatives) : null;
const mapAffordances = (affordance && affordance.markerId >= 0) ? [affordance] : [];
```

### 2.2 `miniprogram/pages/map/index.wxml`（**冻结面**）

- **删除**：页面绝对定位的 `<view class="place-collapse …"><view class="place-collapse-visual glass"><s-icon name="chevron-down" …/></view></view>`。
- **新增**：`<map>` 内 `<cover-view slot="callout" wx:for="{{mapAffordances}}" marker-id="{{affordance.markerId}}">`，
  内含 `cover-view.native-affordance-hit`（88rpx，`catchtap="onTogglePlaceCard"`）
  → `cover-view.native-affordance-disc.glass`（56rpx / 24rpx 圆角）
  → `cover-image.native-affordance-glyph`（28rpx，`src="{{affordance.glyph}}"`）。

### 2.3 `miniprogram/pages/map/index.wxss`（**冻结面**）

- **删除**：`.place-collapse { position:absolute; left:36rpx; bottom:calc(…) }`（旧定位规则）
  **以及** `.place-collapse-visual` 的 4 条**孤儿规则**（旧控件已不存在，留着是无主死 CSS）。
- **新增**：`.native-affordance`（88×88，`background:transparent`、`border:0`、`box-shadow:none`、`padding:0`）、
  `.native-affordance-hit`（88×88 flex 居中）、`.native-affordance-disc`（56rpx / 24rpx）、
  `.dusk .native-affordance-disc`（`rgba(37,38,42,.96)`，与旧 `.dusk .place-collapse-visual` 逐值一致）、
  `.native-affordance-glyph`（28rpx）。

### 2.4 闸门与 harness（**不是产品代码**）

- `tools/verify-map-camera-motion.cjs`：新增 `N1–N4 / N5,N8 / N9 / N10` 原生锚定契约（45 → 47 个测试）。
- 12 个 harness 补 `icons` 依赖（严格白名单 9 个 + 宽松 require 3 个）。
  理由：`pages/map/index.js` 新增了一个 `require`，白名单 harness 会**抛错**、宽松 harness 会拿到 `{}`；
  这正是本仓已知的「新页面依赖必须补 harness，否则被 `try/catch` 静默吞掉」模式。

---

## 3. 本轮发现并修掉的 3 个**真实缺陷**（都是我自己上一轮引入的）

### 3.1 一次 overview 会把控件整个抹掉

`mapAffordances` 原本写成 `(selected && !overviewPlan) ? […] : []`。
`recenter()` 走 `applyFilters(..., 'overview')` ⇒ `overviewPlan` 非空 ⇒ 控件被清空。
**overview 不是选择变化**，它不该让控件消失。已改为只由 `selected` + `markerId >= 0` 决定。
（`N5/N8` 的 RED 证据即此：修前 `mapAffordances.length === 0`。）

### 3.2 选中项落在簇内时会锚到一个不存在的 marker

若 selected 不是 representative（`clusterOpen` 打开时可能发生），
`findIndex` 返回 `-1` ⇒ 会渲染 `marker-id="-1"` 的 callout。
已加 `markerId >= 0` 门槛：不挂载，交给簇自己的堆叠按钮（`N9` 覆盖）。

### 3.3 用 `transform` 表达「已收起」——在 `cover-view` 上不保证

上一轮写的是 `.native-affordance-disc.is-collapsed { transform: rotate(180deg) }`。
审计文档自己就记着「`cover-view` 的 transform 过渡**不保证**」；而**静态 rotate 的支持同样没有保证**。
已改为**换 glyph**（`chevron-down` ⇄ `chevron-up`），状态由一个纯数据字段承载，
原生层不可能「悄悄丢掉」一个 `src` 替换。
顺带清掉：wxml 里一个**没有任何规则**的 `is-dusk` 类；wxss 里无主的 `.place-collapse-visual` 规则组。

> 这 3 条都不是「顺手重构」，而是**不修就会在真机上错**的问题。列在此处供你复核。

---

## 4. RED / GREEN 证据

| # | 断言 | RED 手法 | RED 结果 | GREEN |
|---|---|---|---|---|
| R1 | `N5/N8`：overview 后控件仍在 | 把生产代码临时改回 `!overviewPlan` 写法（备份 → 改 → 跑 → **还原并核对**） | `FAIL N5/N8 … the affordance survives an overview`；`FAIL N9 … no affordance is mounted`；45/47 | 47/47 |
| R2 | `N1–N4`：旧页面控件不得回来 | 把旧 `.place-collapse` 行**临时注入** `<map>` 内（备份 → 注入 → 跑 → **还原**） | `FAIL N1-N4 … the page-space control is gone`；46/47 | 47/47 |

还原完整性：`miniprogram/pages/map/index.js` 与 `index.wxml` 均从备份原样回写并**核对 sha256 一致**。
备份位置：`.workbuddy-ai/scratch/map-camera/ckpt-backup/`。

`N` 组断言覆盖的契约：

- **N1/N2**：全模板**恰一个** `.native-affordance-hit`；`.place-collapse` 计数为 0；**`<map>` 内**只有 callout 一处 `onTogglePlaceCard`，且不是 `bindtap`。
- **N3**：`buildAffordance` 的**函数体**不得出现 `screenX/screenY/left:/top:/latitude/longitude`。
- **N4**：动作就是**既有**的 `onTogglePlaceCard`，没有第二条代码路径。
- **N5/N8**：选择变化 ⇒ 锚点跟随；disclosure 状态**粘住**；overview ⇒ 锚点与状态都**不动**；glyph 随状态换。
- **N9**：选中项无自己的 marker ⇒ 不挂载，且**不会**锚到错误索引。
- **N10**：disclosure 路径**零** `getScale` / **零** `getRegion` / **零** 绑定相机 prop；`setData` 只写 `cardCollapsed` / `mapAffordances[0].collapsed` / `mapAffordances[0].glyph`。

---

## 5. ⛔ 预期红（**等你批准，不要自行推进**）

本轮**只**留下 3 处预期红。除此之外全部套件为绿（见 §6）。

### 5.1 `tools/map-identity-review.json` — 2 个 `sha256`（Map 链节）

| 文件 | 注册值 | 现场值 |
|---|---|---|
| `miniprogram/pages/map/index.wxml` | `4522d59434badb2c180a7bbebfb26e8a2415611a53df5d3bbd14ff31247e52e9` | `894a321d4b4445d607b6d099ff1ec4f93b46dd2b0af543891e1ce90c6c3b8527` |
| `miniprogram/pages/map/index.wxss` | `c13016f30f8e4b7ed7779990d712cc145035d59401d2dda52b291edc2406a844` | `3c9f79dfb8d0b807000c4c5b06eae347166a01189a3db526ff01652c31541cfd` |

按本仓链序规则：`ux-remediation-review.json` 里 map wxml 的 `sha256`（`464c48ae…`）
是 `map-identity-review.json` 的 `baseSha256`，**保持不动**；`map-identity-review.json` 的
`baseSha256` 也**保持不动**；**只改上表 2 个 `sha256`**，并在 `reason` 里**追加**本轮证据（`review` 字段被硬断言，不能动）。

> 附带效果：`tools/lib/reviewed-map-veil-removal.cjs` 直接读这 2 个字段做整文件哈希断言，
> 所以 `verify:map-veil-review`（以及它所在的 `verify:r2`）**会随这 2 个字段一起转绿**，无需单独改。

**干跑已验证**：临时把这 2 个字段指向新值后，哈希链断言通过，红点前移到 §5.2；随后 fixture 已从备份
**原样还原**并核对 sha256（`4b6ab61e42eac60ee6bab75813e0fbe6bfc7043e941d83b70aea8566a783fb60`）。

### 5.2 `tools/verify-cloud.cjs` — 1 个测试里的 3 条**结构性**断言

测试名：`map card uses one fixed toggle beside both expanded actions and collapsed name`（约 1869–1877 行）。

```js
assert.equal((wxml.match(/class="place-collapse /g)||[]).length,1);          // 现在 0
assert(wxml.indexOf('class="place-collapse ')<wxml.indexOf('class="place-expand-name"'));  // 现在 -1
assert.match(css,/\.place-collapse\s*\{[^}]*left:36rpx; bottom:calc\(var\(--tab-clearance\) \+ 24rpx\)/);  // 规则已删
```

**这三条断言的「产品契约」本身被本轮授权改掉了**（控件不再是一个页面固定元素），所以它们**必须改口径、不能删**。
建议的替换（等你批准后我才动）：

```js
assert.equal((wxml.match(/class="place-collapse /g)||[]).length,0);
assert.equal((wxml.match(/class="native-affordance-hit"/g)||[]).length,1);
assert(wxml.indexOf('class="native-affordance-hit"')<wxml.indexOf('class="place-expand-name"'));
assert.match(css,/\.native-affordance-hit\s*\{[^}]*width:88rpx;[^}]*height:88rpx/);
assert.match(css,/\.native-affordance-disc\s*\{[^}]*width:56rpx;[^}]*border-radius:24rpx/);
assert.match(css,/\.native-affordance\s*\{[^}]*background:transparent;[^}]*border:0/);
assert.equal(/\.native-affordance[^{]*\{[^}]*transform/.test(css),false);
// 折叠态名字条几何不变（这条本来就是对的，保留）
assert.match(css,/\.place-expand\s*\{[^}]*left:32rpx; bottom:calc\(var\(--tab-clearance\) \+ 20rpx\);[^}]*padding:0 28rpx 0 100rpx/);
```

### 5.3 `tools/verify-icons.cjs` 第 65 行 — `<s-icon>` 计数 `88 → 87`

```js
assert.equal(count,88); // …
```

**原因（不是我漏了图标）**：被删的旧控件里有一个 `<s-icon name="chevron-down" size="28" …>`；
而 **`<s-icon>` 是自定义组件，不能出现在原生 `cover-view` callout 里**——callout 只允许
`cover-view` / `cover-image`。所以新控件用 `cover-image` + `icons.iconSvg()` 生成的 data URI，
`s-icon` 总数因此**合法地少 1**。请批准把该行改为 `87` 并在注释里追加本轮说明。

---

## 6. 套件结果

`npm run verify`（带本机必需的 stdin shim）= **361/361 PASS**。

`verify:all` 的 54 个条目逐个独立运行（因为 `&&` 链会在第一个红点停下）：

| 结果 | 数量 |
|---|---|
| OK | **51** |
| FAIL（= §5 的预期红） | **3**：`verify:icons`、`verify:cloud`、`verify:r2`（其唯一红点是 `verify:map-veil-review` = §5.1） |

新增/相关套件：

- `verify:map-camera-motion` — **47/47**
- `verify:image-cache` / `verify:detail-original` — 绿
- `verify:marker-renderer-scheduler` / `verify:map-overlay-drawer` / `verify:map-drawer-motion` /
  `verify:map-trace` / `verify:marker-apply` / `verify:map-reveal-cadence` / `verify:map-save` /
  `verify:map-zoom-stepper` / `verify:map-scale-race` / `verify:map-scale-echo` — 绿（补 harness 后）

⚠️ 本机 `npm run verify` **不带** `NODE_OPTIONS="--require $TEMP/node-sync-stdin-shim.cjs"` 时
会**假红** 4 项（`[J]/[K]` 资产、`[SUB] verify-assets`/`verify-tabbar`）——这是已知的
「同步子进程拿不到 piped stdin ⇒ EBUSY(-4082)」，**不是本轮引入**，也**不要去改测试**。

---

## 7. ⚠️ 真机验证：本轮**没有做**，且有两件事只能由真机回答

本轮结束时自动化通道**未被用于真机**，因此以下全部记为 **UNVERIFIED**，**不得**用模拟器截图替代：

1. **原生 callout 的几何**：`slot="callout"` 的盒子被平台放在 marker 锚点的哪一侧、以什么为原点，
   官方没有可测的契约。我把 `.native-affordance` 做成 88×88 的**实心盒**（而不是 0×0 + 负偏移溢出），
   就是为了不依赖「子元素从零尺寸父盒溢出仍渲染」这一未证行为。
   **但控件相对 marker 的实际落点仍需真机调一次。**
2. **`cover-image` 能否渲染 `icons.iconSvg()` 的 SVG data URI**：`<s-icon>`（WebView `<image>`）
   渲染同一字符串是**已验证可用**的；`cover-image` 走**原生图层**，是**新用法，无先例**。
   若真机不显示，**回退方案**（需要一个新资产，因此同样要你批准）：
   `miniprogram/images/icons/lucide/chevron-down.png`（+ `chevron-up.png`），
   走 `tools/assets/` 边界 + `tools/fixtures/moved-build-sources.json` 的 bytes/sha256
   ——这与现有 `chevron-left.png` / `chevron-right.png` 在同一 callout 里的用法完全一致，
   是**已被证明可行**的路径。

真机验证时应当采集的最小证据（沿用本仓既有的只读探针手法）：

- `disclosurePositionGetRegion = 0`、`disclosurePositionProjectPoint = 0`、`disclosurePositionSetData = 0`，
  分别在 **拖拽 / 捏合 / A→B 相机移动 / overview** 四种情形下；
- 截图与真机 `getWindowInfo()` **比尺寸**（不一致 ⇒ 纯视觉判据记 UNVERIFIED）；
- 收起 / 展开两态各一张，确认 glyph 与 DUSK 表面。

---

## 8. 建议

| 项 | 建议 |
|---|---|
| **A. SCREEN-SPACE SAMPLED AFFORDANCE** | **REMOVE**（已完成：disclosure 不再有任何 JS 位置计算） |
| **B. NATIVE MARKER-ANCHORED AFFORDANCE** | **KEEP** |
| **C. DISCLOSURE STATE CONTINUITY** | **KEEP**（状态语义未动，仍粘住） |
| **D. MAP CAMERA CONTINUITY** | **KEEP**（本轮未动相机） |
| **E. `.place-expand` 收起态名字条** | **KEEP，但请确认**：它**仍然**可点、且仍调 `onTogglePlaceCard`（见 §9） |

---

## 9. 需要你裁决 / 确认的 1 件事

「**只有一个控件**」这条，我按「**唯一 marker 锚定控件**」实现：页面里除了原生 callout，
**还有一处** `onTogglePlaceCard` —— 底部的**收起态名字条 `.place-expand`**。

- 它**不是**本轮迁移的对象（迁移对象是 `.place-collapse` 那个圆形 chevron）；
- 它在**批准版设计里一直存在**，且 brief 要求「**视觉平价**」⇒ 删掉它会破坏平价；
- 迁移**前后**都是「收起态同时有名字条 + chevron」⇒ **没有引入新的重复**。

所以我**保留了它**，并把 `N1–N4` 的断言写成**精确口径**（`<map>` 内只有 callout 一处；
另一处是既有的名字条），而不是把它算成「第二个控件」。

**如果你要的是「收起态只能有一个可点区域」**，那就是一次**额外的视觉变更**，
请明确批准，我再删名字条的 `bindtap`（或整条），并同步更新 `N1–N4` 与 `verify-cloud` 的口径。

---

## 10. 状态汇总

| 证据等级 | 值 |
|---|---|
| IMPLEMENTED | YES |
| STATICALLY VERIFIED | YES（`verify:map-camera-motion` 47/47；`npm run verify` 361/361） |
| RED PROOF | YES（2 处，见 §4） |
| SIMULATOR-VERIFIED | **NO**（本轮未跑） |
| REAL-DEVICE-VERIFIED | **NO** |
| VISUALLY APPROVED | **NO** |
| CHECKPOINT-REGISTERED | **NO** |
| CLOSED | **NO** |
