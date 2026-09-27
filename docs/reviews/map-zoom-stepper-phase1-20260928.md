# Map ＋/－ Zoom Stepper — Phase 1 实现报告（2026-09-28）

**状态：实现完成 + 真机验证基本完成；2 项真机手势场景为 PENDING（见 §8）。**
真机 = **OPPO PKB110 / Android 16 / 微信基础库 3.17.3**，359×789 @ dpr 3.5。

- **未 commit / 未 push / 未 deploy。** HEAD 仍为 `428e1b70`。
- `verify:all` **1149 PASS / 0 FAIL / EXIT 0**；新增 `verify:map-zoom-stepper` **24/24 PASS**。
- 冻结链路按既定机制推进（只动 `sha256`，`baseSha256` 未动），`verify-cloud` **272/272**、`verify-map-veil-review` PASS。

---

## 1. UI

### 位置与尺寸（真机实测，非推算）

| 元素 | 真机 rect（px） | 换算 |
|---|---|---|
| `.recenter-map` | top 205 / bottom 249 / left 295 / right 339 | 44×44 px = **88rpx 圆**（未变） |
| `.zoom-stepper` | top 257 / bottom 327 / left 299 / right 335 | 36×70 px = **72rpx 宽 / 145rpx 高** |
| gap | **8 px** | = 18rpx（规格要求 16~20rpx） |
| `centersAligned` | **0 px** | 两级**完全同轴** |
| 与 `.map-search` | `overlapSearch: false`（search bottom 196 < column top 205） | 不遮挡 |
| 与 `.place-card` | `overlapCard: false`（card top 523 > column bottom 327） | 不遮挡 |

- **同一 right 边距体系**：列锚点 `right: 42rpx`（与 recenter 原值相同）；recenter 宽 88rpx 占满列宽 ⇒ **位置与改动前逐像素一致**；stepper 72rpx 在列内**居中** ⇒ 与 recenter 同轴（`centersAligned = 0`）。
- **固定一种布局**：列锚点用 `overlayTop`（px），内部间距全部走 rpx 流式布局，模板里**没有** px/rpx 混算 ⇒ 不会在运行时来回跳。
- 与 recenter 形成**同一工具区域**（同轴 + 18rpx gap），但**不是**一个巨大面板（两块独立 surface）。

### 视觉

- 复用现有 floating-control 材质：`glass` + `rgba(255,255,255,.89)` + `0 12rpx 22rpx rgba(85,85,85,.13)`，`.dusk` 变体沿用 recenter 的 `rgba(73,73,73,.94)`；pressed 走既有 `ui-pressed`。
- 圆角用既有 token `var(--radius-control, 24rpx)`。
- 分隔线 1rpx、低对比度（`rgba(89,92,79,.14)`；dusk `rgba(255,255,255,.12)`）。
- ＋/－ 用**项目现有 icon system**（`<s-icon name="plus">` / `name="minus"`，`stroke="1.75"`，size 32rpx）——`lucide-plus` / `lucide-minus` 已存在，故按规格**不**用文本 glyph，也**未新增任何图片资源**。
- **不显示 scale 数字**，无 slider / long press / preset menu / radial。

### 真机截图

`phase1-map4.png`（地图页）+ `zoom-column.png`（右侧工具列 5× 放大）：可见 recenter 圆钮在下方的 72rpx 圆角步进器（上 ＋、1rpx 分隔、下 －），宽度与体量明显轻于 recenter。

---

## 2. Scale algorithm

```
integer:     level = round(current);  ±1
fractional:  + => ceil(current) ;  - => floor(current)
clamp(target, MIN_SCALE=3, MAX_SCALE=18)
EPSILON = 0.05
```

```js
zoomAdjacentLevel(current, direction) {
  if (!Number.isFinite(current)) return null;
  const step = direction < 0 ? -1 : 1;
  const nearest = Math.round(current);
  const target = Math.abs(current - nearest) <= ZOOM_LEVEL_EPSILON
    ? nearest + step
    : (step > 0 ? Math.ceil(current) : Math.floor(current));
  return Math.max(ZOOM_MIN_SCALE, Math.min(ZOOM_MAX_SCALE, target));
}
```

- **不是** `round(current) + delta`。锁死该要求的断言：`13.49 → 14` 与 `13.51 → 14`（后者若用 round+delta 会跳到 15）。
- 逐条对齐规格 Z1–Z6：13→14/12；13.31→14/13；13.72→14/13；13.99（ε 内视为 14）→15/13。
- clamp 真机实测：cmd 18 → native 18；cmd 3 → native 3。

---

## 3. Command channel（observed / command 分离）

| 字段 | 角色 |
|---|---|
| `data.mapScale` | **仅 observed**。由 `readMapScale()` / `regionchange` 写入，喂 grouping。**永不**绑定到 `<map scale>`。 |
| `data.commandScale` | **唯一 command 通道**，绑定 `<map scale="{{commandScale}}">`，初值 13。只由 `issueZoomCommand()` 写。 |

- 原 `initialMapScale` 更名为 `commandScale`：它现在是**每次点按**都会写的命令通道，不再只是初始 seed。语义改名，绑定位置不变。
- **`regionchange` 绝不写 `commandScale`**（`verify-map-zoom-stepper` Z13/Z13b 锁死；`verify-r4-local-refinements` 也新增了 `!m.includes('scale="{{mapScale}}"')` 的负向断言）。
- 全链路只有两个写入口：`issueZoomCommand()`（命令）与 `readMapScale()`（观测）。`settleZoomCommand()` / `cancelZoomCommand()` 只清 pending，不写 data。

---

## 4. Rapid taps（快速连击如何保证 +++ 真正三级）

`requestZoom(direction)`：

1. guard（`active` / `disposed` / `stackGesture` / `mapError`）
2. 若 **有 pending**：`target = zoomAdjacentLevel(pending, step)`，**从 pending 继续**，不再读 native（native 还没跟上，读它只会重复同一级）
3. 否则：`mapCtx.getScale()` 取即时 native，`target = zoomAdjacentLevel(native, step)`
4. `issueZoomCommand(target, from)`：`|target - from| ≤ ε` ⇒ 只把该级记为 pending（clamp 边界，不下发）；否则 `setData({commandScale: target})` + 记 pending

**真机实测**：13 起连击 +++ ⇒ `zoomCommandCount = 3`、最终 **native 16**（即 14→15→16）；16 起连击 --- ⇒ 3 条命令、最终 **13**。
**没有** JS 连续动画；**每次点击最多一条 command**。

---

## 5. Pinch interaction（如何取消 stale pending）

两条独立信号，任一条成立即 `clearZoomCommand()`：

1. **`regionchange` 的 `causedBy`**（真机取证：`begin` 事件带 `causedBy`，我方 prop 命令为 `'update'`；`end` 事件不带）。命中 `gesture` / `drag` / `scale` ⇒ 用户手势优先，丢弃 pending。
2. **小数兜底**：本控件下达的目标**永远是整数**，所以 command 在途时出现**小数** native scale 只可能来自手指 ⇒ 同样丢弃 pending。

另：命令收敛（`|observed - target| ≤ ε`）也会清 pending；`onHide` 递增 `zoomReadRequest` 使迟到的 getScale 回复无法下发命令。

⚠️ 第 1 条信号在**真实手指 pinch** 上的取值尚未实测（§8 PENDING）—— 已装好记录器，待一次真机手势。

---

## 6. Command count（一次点击的真实数字）

| 场景 | 真机 app camera command |
|---|---|
| 单次点击（13 → 14） | **1** |
| 单次点击（14 → 13） | **1** |
| 连击 +++（13 → 16） | **3**（= 3 次用户点击，符合规格） |
| 连击 ---（16 → 13） | **3** |
| MAX 处点击 + | **0**（功能 disabled） |
| MIN 处点击 − | **0**（功能 disabled） |
| recenter | **0**（不产生 zoom 命令） |
| 纯观测（`regionchange`） | **0** |

**没有任何一次点击产生 >1 条 app command。**
另：真机 **真实点击 ＋ 格**（`automation_element_action --action tap --selector .zoom-step`）实测 13 → 14、命令数 1 ⇒ bindtap 接线端到端可用。

---

## 7. Real device

| 规格项 | 真机结果 |
|---|---|
| 13 整数 + / − | 13→**14**→**13** ✓ |
| 快速 +++ / --- | 13→**16**（3 命令）/ 16→**13**（3 命令）✓ |
| 3 MIN clamp | native 停在 **3**，命令数 **0**，`disOut=true` ✓ |
| 18 MAX clamp | native 停在 **18**，命令数 **0**，`disIn=true` ✓ |
| cluster / grouping | 命令后按新 scale **正常重算**（groups 6→7，markers 6→7），`stackPositionsReady` 全程 true ✓ |
| drawer | `drawerRenderMode` 保持 `view-overlay`，`mapDrawers` 结构完整（3→2，随分组正确变化），无报错 ✓ |
| recenter | 仍按原 handler 工作（native → 10.59 全览），**不下发** zoom 命令 ✓ |
| UI overlap | `overlapCard=false`、`overlapSearch=false`，`centersAligned=0`，gap 8px ✓ |
| 小数 pinch（13.x）→ + / − | **PENDING**（见 §8） |
| pinch → + → pinch → − | **PENDING**（见 §8） |

---

## 8. PENDING：两项真机手势场景

`device-pinch-recorder.cjs` 已装上（运行时钩子，不改文件）：记录每次 `regionchange`（含 `causedBy`）与每次 ＋/－ 点按前后的 `cmd` / `pending` / 命令数。

待用户真机执行后即可判定：

1. **小数 pinch**：pinch 到 13.x → 点 ＋ 应到 14、点 − 应到 13（算法已由 Z3/Z4/Z5 锁住，缺的是**真实小数 native**下的端到端确认）。
2. **pinch 打断 pending**：命令在途时 pinch，pending 必须被丢弃、且之后**不会**把地图拉回旧 target；同时确认真实 pinch 的 `causedBy` 取值。

合成 touch 已验证**不可行**（`touchstart/touchmove/touchend` 到不了原生地图，native 不动），因此必须真手指。

---

## 9. 变更清单

### 产品代码
- `miniprogram/pages/map/index.js`：新增常量 `ZOOM_MIN_SCALE` / `ZOOM_MAX_SCALE` / `ZOOM_LEVEL_EPSILON`；`data.commandScale` + `zoomInDisabledAt` / `zoomOutDisabledAt`；新增 `onZoomIn` / `onZoomOut` / `zoomAdjacentLevel` / `requestZoom` / `issueZoomCommand` / `settleZoomCommand` / `cancelZoomCommand` / `clearZoomCommand`；`readMapScale` 接入收敛确认 + 命令在途时改用即时 `getScale`；`onMapRegionChange` begin 接入 `cancelZoomCommand`；`onHide` 作废在途读。**零新增 `require`**（17 个 harness 中至少 4 个是严格白名单，新增 require 会一次打红）。
- `miniprogram/pages/map/index.wxml`：`scale` 绑定改名；新增 `.map-tool-column` 包裹 recenter + 新 stepper（recenter 的 icon / handler / 位置未变）。
- `miniprogram/pages/map/index.wxss`：新增 `.map-tool-column` / `.zoom-stepper` / `.zoom-step` / `.zoom-step-divider` / `.zoom-step.is-disabled`；`.recenter-map` 由自身绝对定位改为列内流式（渲染位置不变）。
- `tools/lib/locale-translations.tsv` + `miniprogram/utils/locales.js`：新增 `Zoom in` / `Zoom out`（→ `s4fc05f2763` / `sa4ae4b24a1`，供 aria-label）。

### 冻结哈希链（**只推进 `sha256`，`baseSha256` 全部未动**）
先 dry-run（`.workbuddy-ai/scratch/zoom-stepper/dryrun-hash-chain.cjs`）内存复现整条链通过后，才写入：

| 文件 | 字段 | 值 |
|---|---|---|
| `tools/map-identity-review.json` | wxml `sha256` | `4fbb0186…` → **`d1de466e…`** |
| `tools/map-identity-review.json` | wxss `sha256` | `77c8ce71…` → **`d6182bec…`** |
| 同上 | 两者 `baseSha256` | **`464c48ae…` / `1af64be7…` 未变**（`reviewed-map-veil-removal.cjs` 的硬 pin） |
| 同上 | `reason` | 追加 2026-09-28 用户授权条目（指向本报告） |

中间链 `map-frame-review.baseSha256` / `ux-remediation.baseSha256` / `refinements.baseSha256` **全部保持原值**（dry-run 逐条 ok）。

### 两个既有闸门的**期望值**更新（如实列出，非放松）
1. `tools/verify-icons.cjs`：`<s-icon>` 计数 **85 → 87**（新增 plus / minus），并按既有惯例在注释里追加 `2026-09-28 user-authorized: the Map zoom stepper adds two (plus, minus).`
2. `tools/verify-r4-local-refinements.cjs`：断言里的绑定名 `scale="{{initialMapScale}}"` → `scale="{{commandScale}}"`，并**新增**负向断言 `!m.includes('scale="{{mapScale}}"')`（意图不变且更严：禁止 observed 回绑相机）。

其余既有断言**一条未删、一条未放松**。

---

## 10. 验证

- **`verify:all`：1149 PASS / 0 FAIL / EXIT 0**（日志 `.workbuddy-ai/scratch/zoom-stepper/verify-all-phase1.log`）。
- `verify:map-zoom-stepper`：**24 / 0**（Z1–Z14 全覆盖 + clamp 功能 disabled + UI 契约）。
- Map targeted 全绿：`map-motion` / `map-viewport` / `map-photo-recovery` / `marker-renderer-scheduler` / `marker-apply` / `map-overlay-drawer` / `map-scale-echo` / `map-scale-race` / `map-drawer-motion` / `map-reveal-cadence` / `map-control-clearance` / `map-overview-label` / `map-empty` / `map-search-clearance` / `map-preview-selection` / `map-save` / `map-veil-review`。
- `verify-cloud` **272/272**；`verify-icons` / `verify-menu-copy` / `verify-structure` PASS。

---

## 11. git diff --stat

```
 miniprogram/pages/map/index.js        | 115 +++++++++++++++++++++++++++++++++-
 miniprogram/pages/map/index.wxml      |  25 ++++++--
 miniprogram/pages/map/index.wxss      |  36 ++++++++++-
 miniprogram/utils/locales.js          |  10 +++
 package.json                          |   3 +-
 tools/lib/locale-translations.tsv     |   2 +
 tools/map-identity-review.json        |   8 +--
 tools/verify-icons.cjs                |   2 +-
 tools/verify-r4-local-refinements.cjs |   8 ++-
 9 files changed, 194 insertions(+), 15 deletions(-)
```

未跟踪新增：`tools/verify-map-zoom-stepper.cjs`、`docs/reviews/map-zoom-stepper-phase05-20260928.md`、本报告。

HEAD 仍 `428e1b70`。**未 commit / 未 push / 未 deploy。**

当前哈希：wxml `d1de466e…`、wxss `d6182bec…`、map JS `e09a1724…`、新套件 `a61c0b16…`。

---

## 12. 本轮未做

- 未实现 0.5 步进（Phase 0.5 已证 prop 通道取整，0.5 语义无法表达）；未把命令通道换成 `includePoints`。
- 未 commit / push / deploy。
- 未验证真实手指 pinch 的 `causedBy` 取值与端到端小数场景（§8）。
