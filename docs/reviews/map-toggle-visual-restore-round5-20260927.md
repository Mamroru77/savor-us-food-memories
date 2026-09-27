# Map 第五轮：cluster 展开/收起按钮视觉一致性修复

**日期**：2026-09-27
**触发**：真机验收 `view-overlay` —— **性能 PASS**（展开/收起已明显流畅），但出现**视觉回归**：cluster 按钮被改变。
**状态**：已修复 + 全部可运行套件 0 FAIL；**未 commit / 未 push / 未 deploy**。

**本轮只改按钮视觉一致性。** 没有回退 view-overlay、没有恢复 customCallout 动画、没有动 drawer 动画 / 320ms / easing /
marker renderer / thumbnail / projection / grouping / 分页 / 其它 UI。

---

## Original button source

旧版（`drawerRenderMode='native-callout'`）使用**四个既有 PNG 资产**，没有别的来源：

| 资产 | 尺寸 | 内容 |
|---|---|---|
| `/images/markers/stack-button-up.png` | 96×96 RGBA | 半透明白色圆盘 + **向上** chevron |
| `/images/markers/stack-button-down.png` | 96×96 RGBA | 半透明白色圆盘 + **向下** chevron |
| `/images/markers/stack-button-up-dusk.png` | 96×96 RGBA | **不透明**深色圆盘 + 向上 chevron |
| `/images/markers/stack-button-down-dusk.png` | 96×96 RGBA | **不透明**深色圆盘 + 向下 chevron |

**关键事实（本轮实测得出，是这次回归的根因）**：这四张 PNG **已经包含整个按钮**（圆盘 + chevron），
不是只有 glyph。用 PNG alpha 通道解码验证（`inspect-button-png.cjs`）：

```
stack-button-up.png        corners A=[0,0,0,0]  widest A>100 row=86px  widest A>240 row=6px
stack-button-down.png      corners A=[0,0,0,0]  widest A>100 row=86px  widest A>240 row=6px
stack-button-up-dusk.png   corners A=[0,0,0,0]  widest A>100 row=84px  widest A>240 row=84px
stack-button-down-dusk.png corners A=[0,0,0,0]  widest A>100 row=84px  widest A>240 row=84px
```

浅色盘是**半透明**（alpha ≈150），dusk 盘是**不透明**（alpha ≈245）。旧版把它当**裸 image** 画
（`.native-stack-toggle` 只有 `position/width/height/z-index`，**没有** background / border / border-radius / box-shadow）。

**本轮没有新增任何资产、SVG、`s-icon` 或字符箭头。**

---

## State mapping

旧版两个 orientation 的判断**故意不同**，从 native-callout WXML 逐字提取：

```
向上分支（drawer.down === false）：
  dusk ? (drawer.targetOpen  ? '-down-dusk' : '-up-dusk')
       : (drawer.targetOpen  ? '-down'      : '-up')

向下分支（drawer.down === true）：
  dusk ? (!drawer.targetOpen ? '-down-dusk' : '-up-dusk')
       : (!drawer.targetOpen ? '-down'      : '-up')
```

八种组合全部实测（D15）：

| orientation | state | light | dusk |
|---|---|---|---|
| 向上 | collapsed | `stack-button-up.png` | `stack-button-up-dusk.png` |
| 向上 | expanded | `stack-button-down.png` | `stack-button-down-dusk.png` |
| 向下 | collapsed | `stack-button-down.png` | `stack-button-down-dusk.png` |
| 向下 | expanded | `stack-button-up.png` | `stack-button-up-dusk.png` |

**我原来的 overlay 只用了「向上分支」的条件**，所以**每一个向下展开的 cluster 都显示错的 chevron**。这是本轮修掉的第一个缺陷。

现在这条规则**只有一处**（`buildDrawers` 里的 `showDownChevron = down ? !targetOpen : targetOpen`），
两个 renderer 都读同一个值，不可能再各自漂移（D16 断言 overlay **不得**内联重新推导资产规则）。

---

## Geometry

**完全复用 `drawer.buttonBox`，没有为 overlay 重新定义任何几何。**

| 项 | 来源 | 值 |
|---|---|---|
| 视觉尺寸 | `buttonBox.size` | 32px（原值） |
| 视觉横向位置 | `buttonBox.left` − `buttonBox.hitLeft` = 6px 偏移 | 合成后 = `screenX + 28` |
| 视觉纵向位置 | `buttonBox.top` − `buttonBox.hitTop` = 8px 偏移 | 合成后 = callout 的同一像素 |
| 触控区 | `buttonBox.hitLeft / hitTop / hitWidth / hitHeight` | **44×40，未缩小** |

### 修掉的第二个缺陷：视觉按钮比原版低 8px

overlay 的 toggle 是「**外层触控盒 + 内层视觉**」结构，而我原来把**外层**放在了 callout **视觉按钮**的位置，
内层又加了一次偏移 ⇒ **偏移被算了两遍**，向上展开时按钮**下移 8px**。

改成：外层放在 `buttonBox.hitTop`（触控盒自己的位置），内层承担差值。实测（`probe-toggle-position.cjs`）：

```
修复前：up   TOP DELTA = 8   LEFT DELTA = 0      <- 回归
        down TOP DELTA = 0   LEFT DELTA = 0

修复后：up   TOP DELTA = 0   LEFT DELTA = 0
        down TOP DELTA = 0   LEFT DELTA = 0
```

（向下恰好一直是对的，因为 `orient()` 之后 `hitTop === top`，差值天然为 0 —— 这正是为什么这个 bug 只在**向上**时显形。）

### 修掉的第三个缺陷：叠了第二个圆盘

我原来给 ink toggle 加了 `.map-stack-overlay .pin-stack-ink .pin-stack-toggle { background:#fffffb; border-color:...; box-shadow:... }`
—— 在**已经自带圆盘**的 PNG 后面又画了一个不透明白圆 + 边框 + 阴影。这就是真机上看到的「新的圆形 chevron 样式」。

现在该规则是 `.map-stack-overlay .pin-stack-ink .pin-stack-toggle { background:transparent; border:0; box-shadow:none; }`：

- `background:transparent` / `box-shadow:none` —— 不再画第二个圆盘；
- **`border:0` 是必须的，不能只写 `border-color:transparent`**：绝对定位子元素是按**padding box** 布局的，
  1px 边框会把资产整体**内缩 1px**，破坏像素对齐。

### 修掉的第四个缺陷：pressed 反馈丢失

旧版有 `opacity:{{pressedStackRoot === drawer.rootId ? 0.85 : 1}}`，我迁移时**漏掉了**。
现在补回到视觉 glyph 上，与原版位置一致。没有新增 scale / bounce / ripple。

---

## Performance

**仍是 view-overlay，性能未退化。**

| 项 | 结果 |
|---|---|
| 一次展开的 JS drawer 帧写入 | **0**（D1） |
| 一次展开的 JS drawer 写入总数 | **1** |
| 3 次 open/close/open 的 `markers` 数组写入 | **0**（D2） |
| `customCallout` | overlay 模式下**不挂载**（D3） |
| overlay ink 使用的元素 | 普通 `view` + `image`，**零 `cover-view`**（D12） |
| 容器 | 开合前后 `overlayTop/overlayHeight/overlayRootTop/screenX/screenY` **完全不变**（D14） |

本轮只改了 **button image source + button visual geometry**，没有引入逐帧 `setData`、
没有恢复 native customCallout 动画、没有 `cover-view` 动画。

---

## 验证

| 命令 | 结果 |
|---|---|
| `verify:map-overlay-drawer` | **18/18**（本轮 14 → 18） |
| `verify:map-drawer-motion` | 12/12 |
| `verify:map-motion` | 24/24 |
| `verify:map-viewport` | 7/7 |
| `verify:ui` / `verify:visual-language` / `verify:structure` / `verify:package-budget` / `verify:menu-copy` / `verify:audit-stages` / `verify:secondary-ui` / `verify:store-boundaries` / `verify:map-save` / `verify:r2` | 全部 EXIT 0 |
| `verify:avatar` / `verify:sheet-edits` | EXIT 0 |

### 新增断言（D15–D18）

| 用例 | 断言 |
|---|---|
| D15 | 八种状态（up/down × open/closed × light/dusk）的资产**逐个**等于旧版规则；四个资产**全部可达** |
| D16 | native-callout 的**两条原始表达式逐字保留**（基线不许偷偷改）；overlay 必须读**共享字段**、不得内联重推导 |
| D17 | overlay **合成后**的按钮像素 == callout 按钮像素（top 与 left 都断言）——这是 D10 的盲区 |
| D18 | ink toggle 规则里没有不透明 background / border-radius / 可见 box-shadow，且有 `border:0`；必须是 `<image>`；零 `cover-view`；无 `s-icon` chevron；pressed opacity 保留；hit box 仍用 `buttonBox.hitLeft/hitWidth/hitHeight` |

**D10 也顺手修正**：它原来把「外层触控盒」直接对到「callout 视觉按钮」，等于**默认认可了那个双重偏移**。
现在 D10 断言外层对到**旧版 hit 位置**（触控体验不变），视觉对齐交给 D17。

### 关于 `npm run verify` / `verify:all`（如实说明）

这两个**在本会话无法完整跑通**，原因与本轮改动无关：沙箱禁止「node 拉起 node」的子进程创建
（`EBUSY errno -4082`）。全仓库只有 **3 个**文件会这样 spawn：

| 文件 | 受影响检查 | 直接运行的结果 |
|---|---|---|
| `tools/verify-miniprogram.cjs`（= `npm run verify`） | `[J]`、`[K]`、`[SUB] verify-tabbar.cjs`、`[SUB] verify-assets.cjs` | 四个子步骤**直接运行全部 EXIT 0**（`ASSET VERIFICATION PASSED` / `TABBAR VERIFICATION PASSED 21/21`） |
| `tools/verify-cloud.cjs` | `utils/localDate` 的 `TZ` 日历测试（第 91 个 PASS 之后） | 其余 271 项正常；**哈希链测试 `PASS best-ui visual files match baseline or explicit user-requested UI amendments` 已通过** |
| `tools/verify-icons.cjs` | `build-icons.cjs` 子进程 | 直接运行 `build-icons.cjs` → EXIT 0（49 shapes） |

所以：`npm run verify` 除这 4 项外**全绿**；`verify:cloud` 除那 1 项外**全绿**且哈希链已过；
`verify:all` 因为包含这三个而无法完整跑通。**我没有把任何一项标成绿。**

冻结哈希链用**纯进程内**脚本独立复核（不依赖子进程）：`index.wxml` → `4fbb01868c60…`、
`index.wxss` → `77c8ce71bdc6…`，两处 `VERDICT: MATCH (gate passes)`、`pin satisfied: yes`、待编辑清单为空。

---

## Changed files

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/map/index.js` | `overlayToggleTop` 改用 `buttonBox.hitTop`（消除双重偏移）；新增共享的 `toggleAsset` / `toggleAssetDusk`（按旧版两条分支的语义） |
| `miniprogram/pages/map/index.wxml` | overlay toggle 改读 `drawer.toggleAsset(Dusk)`；补回 pressed opacity |
| `miniprogram/pages/map/index.wxss` | ink toggle 改为 `background:transparent; border:0; box-shadow:none;`（去掉叠加圆盘与 1px 内缩） |
| `tools/verify-map-overlay-drawer.cjs` | 新增 D15–D18；修正 D10 的 toggle 断言口径 |
| `tools/fixtures/regression/ui-approved-updates.json`、`tools/map-frame-review.json`、`tools/map-identity-review.json`、`tools/visual-refinements.json` | 冻结哈希链更新（含 baseSha256 与 reason） |

## git diff --stat

```
 miniprogram/pages/map/index.js                     | 348 +++++++++++++++++++--
 miniprogram/pages/map/index.wxml                   |  39 ++-
 miniprogram/pages/map/index.wxss                   |  36 +++
 miniprogram/utils/mapMarkers.js                    | 289 ++++++++++++++---
 package.json                                       |   8 +-
 tools/fixtures/regression/ui-approved-updates.json |   8 +-
 tools/map-frame-review.json                        |   4 +-
 tools/map-identity-review.json                     |   8 +-
 tools/verify-cloud.cjs                             | 115 ++++++-
 tools/verify-map-motion.cjs                        |  22 +-
 tools/verify-map-photo-recovery.cjs                |   2 +-
 tools/visual-refinements.json                      |   4 +-
 12 files changed, 767 insertions(+), 116 deletions(-)
```

（以上为相对 `HEAD` 的**累积** diff，含第 2/3/4 轮，因为都未 commit。第 5 轮本身只动了上表前 3 个生产文件与测试/链文件。）

---

## 真机复核清单（你只需要看这 7 项）

1. 按钮外观是否恢复原版（**不再是圆形 chevron 样式**）
2. 展开位置是否恢复原版
3. 收起位置是否恢复原版
4. up / down 两个方向图标是否正确
5. dusk 是否正确
6. 点击区是否正常（视觉变小了，**触控区仍是 44×40**）
7. drawer 是否仍保持现在的流畅度

**未 commit / 未 push / 未 deploy。**
