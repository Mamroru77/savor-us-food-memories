# US — P1-1：「管理双人空间与 Wishlist」入口降权

**日期**：2026-10-01
**基线**：`0de3e46`（工作树本就不干净）。**未 commit / 未 push / 未 deploy。**
**结论**：根因已定位并修复在 **WXSS**；**WXML / JS 零改动**；Us 冻结检查点**未推进**。
**建议**：**ONE SPECIFIC REMAINING US ISSUE**（见 §4：渲染截图受阻）

---

## 1. 视觉过重的确切根因

入口是 `<button class="space-management secondary-button">`（`pages/us/index.wxml:17`）。
`.secondary-button` 是产品的**填充式控件原语**，`.space-management` 再把它拉满整行：

| 属性 | 解析值（级联后） | 来源 |
|---|---|---|
| `background` | **`rgba(229,231,221,0.36)`** | `.secondary-button`（app.wxss） |
| `border` | **`1rpx solid rgba(212,215,202,0.44)`** | 同上 |
| `border-radius` | **24rpx**（`--control-radius`→`--radius-control`） | 同上 |
| `min-height` | **88rpx**（`--control-height`） | 同上 |
| `padding` | **17rpx 27rpx** | 同上 |
| `justify-content` | **center** | 同上 |
| `width` | **100%** | `.space-management` |
| `color` | **`var(--ink)`** | `.space-management` |
| `font-size` | 25rpx | 两者 |

⇒ 身份卡**上方**恰好只有一个**填充 + 描边 + 圆角 + 满宽 + 居中 + 全强度墨色**的控件面 ——
这就是「主操作按钮」的视觉语法。

### 量化：它比身份卡**更重**

把各自的填充按 `--surface-page: #efeeeb` 合成后取相对亮度：

| 对象 | 材质 | 合成亮度 |
|---|---|---|
| **管理入口** | `rgba(229,231,221,.36)` | **0.8313** |
| 双人身份卡 | `--surface-card: rgba(251,250,247,.82)` | **0.9373** |

⇒ **入口的面比身份卡的面更暗**。它因此是页面上第一个「实心物体」，身份卡反而成为第二眼的东西 ——
这正是用户描述的「management UI 视觉上打断了 Us → Our space → the two people」。

### DUSK 下更糟

`app.wxss:269` 有 `.dusk .secondary-button { background:#2b2c30; color:var(--ink); }`
⇒ 在 `#121315` 的深色页面上是一块**近黑高对比板块**，即一个纯正的深色 CTA。

### 第二个贡献者：说明段落完全没有样式

`<view class="secondary-subtle">{{copy.s325a78d28f}}</view>` ——
**全项目没有任何 CSS 规则定义 `.secondary-subtle`**（只有这条 WXML 引用它）。
所以它按页面默认渲染：**26rpx / 38rpx / `var(--ink)`** —— 与页面副标题**同字号**、颜色**更强**（副标题是 `--muted`）。
⇒ 它是第二个「标题级」文本块。

### 合计

身份卡之前共 **~222rpx 的满宽高对比材料**（88rpx 控件面 + 20rpx 间距 + 3×38rpx 全强度正文），
其中**每一块都比身份卡本身更抢眼**。

### 其它已确认的事实（brief 要求先查清）

| 问题 | 答案 |
|---|---|
| 一个目的地还是多个动作 | **一个**：`onManageSpace(){wx.navigateTo({url:'/pages/space/index'});}` |
| 说明段落是否条件渲染 | **恒常可见**（无 `wx:if`） |
| 无障碍语义 | `aria-label="{{copy.s23f3b65ad3}}"` 在右侧设置图标上；入口本身是原生 `<button>` + 可见文案 |
| 与设置图标的关系 | 设置图标在 header 右侧（`.us-settings`，88rpx 命中区）；入口在 header 下方整行，**无碰撞** |

---

## 2. 选定的紧凑处理

**模式 B —— 身份卡上方的紧凑次级行**，**纯 WXSS**（brief 偏好顺序里的第一档）。

```css
.us-screen .space-management{width:100%;min-height:var(--control-height);margin:20rpx 0 0;padding:0;
  background:transparent;border:0;border-radius:0;justify-content:flex-start;text-align:left;
  color:var(--muted);font-family:var(--sans);line-height:40rpx;font-size:25rpx;font-weight:400;
  white-space:normal;overflow-wrap:break-word}
.secondary-subtle{color:var(--muted);font-size:var(--type-caption);line-height:var(--leading-caption);overflow-wrap:break-word}
```

- **去掉控件面**（填充/描边/圆角/内边距）⇒ 不再是 CTA，也不再比身份卡更暗。
- **保持满宽命中区 + `--control-height`(88rpx)**：brief 明示「Visual size and hit area do not need to be identical」，
  所以**可见处理变轻、触摸目标不变**（仍是产品自己的控件高度）。
- **左对齐 + `var(--muted)`**：与本页已有的安静文本affordance「查看全部 / See all」同一套处理（`--muted`，26rpx，无面）。
- **说明段落**从「页面默认正文」降到页面已有的 **caption 处理**（`--type-caption` 24rpx / `--leading-caption` 36rpx / `--muted`）。
  **文案一字未改、键位未换**（仍是 `copy.s325a78d28f`），跨账号/隐私语义完整保留。
- 未引入新颜色、新材料、新卡片族、新 Sheet、新浮标、新设置页。

### ⚠️ 一个必须记录的坑：**特异性**

入口**保留** `secondary-button` 类（`verify-secondary-ui.cjs` 明确断言 Us 入口复用既有控件，不新造控件族），
而深色主题是靠 `.dusk .secondary-button`（**两个类**）上色的。
若把降权规则写成单类 `.space-management`（**一个类**），它会**输给** `.dusk .secondary-button` ——
**PEARL 变安静了，DUSK 依旧是一块 `#2b2c30` 深色板**。
所以选择器写成 **`.us-screen .space-management`（两个类）**：与 `.dusk .secondary-button` **同特异性**，
再由**应用顺序**（页面样式在 `app.wxss` 之后）决胜 ⇒ **两个主题同时生效**，且不需要一条重复的 `.dusk` 孪生规则。

这个坑已写进回归闸门（§8），并用**两种 RED 各自证明**过。

---

## 3. 改动文件

| 文件 | 变化 |
|---|---|
| `miniprogram/pages/us/index.wxss` | 入口规则改为安静行 + 新增 `.secondary-subtle` 的 caption 处理（+24 / −3） |
| `tools/verify-ui-quality.cjs` | 新增 1 条特异性感知的回归闸门（43/43 → **44/44**） |

**没有**任何 WXML / JS 改动；**没有**动 Us 数据模型、关系逻辑、Wishlist、共享记忆、Journey 统计、Latest place、
Shared Moments、底部导航或其它冻结区域。

---

## 4. ⚠️ Before / After 截图：**本轮无法产出**

brief 要求 PEARL / DUSK × 中文 / 英文的真机渲染对照。**本环境做不到**，原因是可验证的：

| 通道 | 状态 |
|---|---|
| `automation_evaluate` / `automation_runtime_info` / `automation_element_action` / `automation_viewport_action` | **全部 `timeout waiting for automator response`** |
| `simulator_screenshot` / `open_project_window` | ✅ 正常（IDE 与模拟器都活着，`imageWidth 374`） |
| `miniprogram-automator` 直连 `ws://127.0.0.1:9420` 与 `:27946` | ❌ `check if target project window is opened with automation enabled` |
| `simulator_refresh` | ❌ 无效 |
| `cli open --project` | ❌ 无效（IDE server 在 27946 重启） |
| `cli auto --auto-port 9420 --trust-project` | ❌ 8 分钟后仍无自动化端口；该命令要求**先退出 IDE**（`-h` 原文：*If IDE has launched with a HTTP server of different port, you must quit IDE before re-run the command*）⇒ **需要用户操作**，我**没有**单方面关闭你的 IDE |

⇒ 本轮**没有任何像素级渲染证据**，我**不**声称「看起来已经是次级」。已产出的是**程序化度量**（§5），
它证明的是**样式契约**（面、尺寸、颜色、特异性），**不是**观感。

---

## 5. 程序化 before / after 度量（解析级联，含特异性）

脚本 `.workbuddy-ai/scratch/us-p11/measure.cjs`：读 `app.wxss` + `visual-tokens.wxss` + `pages/us/index.wxss`，
去注释 → 解析每条规则 → **按特异性 + 应用顺序**求每条属性的胜出值（不是简单「后写赢」）。

| metric | BEFORE | AFTER |
|---|---|---|
| PEARL 入口填充 | `rgba(229,231,221,0.36)` | **`transparent`** |
| PEARL 入口描边 | 有 | **无** |
| PEARL 入口圆角 | 24rpx | **0** |
| PEARL 入口内边距 | `17rpx 27rpx` | **`0`** |
| PEARL 入口对齐 | center | **left** |
| PEARL 入口颜色 | `var(--ink)` | **`var(--muted)`** |
| PEARL 入口合成亮度 | 0.8313 | —（无面） |
| **入口是页面上第一个实心面？** | **是** | **否** |
| **DUSK 入口填充** | **`#2b2c30`** | **`transparent`** |
| **DUSK 入口是控件面？** | **是** | **否** |
| DUSK 入口颜色 | `var(--ink)` | `var(--muted)`（`--muted` 在 `.dusk` 下为 `#b6b2aa`） |
| **命中区高度** | 88rpx | **88rpx（未变）** |
| 行宽 | 100% | 100%（未变） |
| 说明段落有样式？ | **否**（26rpx / `var(--ink)`） | **是**（24rpx / `var(--muted)`） |
| 身份卡前竖向占用 | 222rpx | 216rpx |
| 身份卡合成亮度 | 0.9373 | 0.9373（未变） |

---

## 6. PEARL / DUSK 结果

- **PEARL**：入口不再有面 ⇒ 身份卡 `rgba(251,250,247,.82)` 成为 header 之后**唯一的实心面**，
  也是第一个强视觉对象。不再有「大块浅色板」压在身份卡之前。
- **DUSK**：`.dusk .secondary-button{background:#2b2c30}` 被同特异性的页面规则以应用顺序覆盖 ⇒
  **不再是高对比黑色 CTA**；入口退为 `--muted`(`#b6b2aa`) 的安静一行，身份卡仍是情感锚点。

## 7. 中文 / 英文结果

- 文案**未改**：仍是 WXML 里的 `locale === 'zh-CN' ? '管理双人空间与 Wishlist' : 'Manage shared space & wishlist'`。
- **没有任何 `.locale-zh` 规则命中入口或说明段落**（app.wxss 里的 `.locale-zh` 只覆盖
  `.home-intro-title text:last-child` / `.screen-heading .heading-title` / `.add-title` / `.section-title` / `.sheet-title`）
  ⇒ 紧凑处理在**两种语言下逐属性相同**（25rpx / 40rpx / `--muted` / 左对齐 / 满宽 / 可换行）。
- `white-space:normal` + `overflow-wrap:break-word` ⇒ 长标签换行而非溢出。
  按 rpx 模型估算（375px 视口 ⇒ 内容宽 670rpx，25rpx 字号）：中文标签 ≈317rpx、英文 ≈390rpx，
  **两者都能单行容纳**；这是**算出来的**，不是渲染实测。
- 英文布局**没有被放大**：没有为中文宽度加任何 locale 特例。

## 8. 管理功能确认（未删任何能力）

| 项 | 证据 |
|---|---|
| 导航目标 | `pages/us/index.js` 的 `onManageSpace(){wx.navigateTo({url:'/pages/space/index'});}` **未改** |
| 绑定 | WXML `bindtap="onManageSpace"` **未改** |
| 复用既有控件元素 | WXML 仍是 `space-management secondary-button` ⇒ `verify-secondary-ui` **15/15** |
| 按压反馈 | `hover-class="ui-pressed"` 保留 |
| 命中区 | 88rpx（`--control-height`），满宽 |
| 文案 / 本地化 | 两语言字符串**逐字未改** |
| 隐私语义 | `copy.s325a78d28f` 仍绑定，**一字未改**（只是字号/颜色降级） |
| 无障碍 | 原生 `<button>` 元素、可见文案、header 上的 `aria-label` 未动 |

## 9. 验证结果

| 命令 | 结果 |
|---|---|
| `verify:ui` | **EXIT 0 — 44/44**（新增 1 条；RED 见下） |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:icons` | EXIT 0 |
| `verify:secondary-ui` | EXIT 0 — 15/15（Us 入口仍复用既有控件） |
| `verify:structure` | EXIT 0 — 6 |
| `verify:memory-return` | EXIT 0 — 13 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:page-lifecycle` | EXIT 0 — 8 |
| `verify:map-tab-return` / `verify:map-photo-budget` | EXIT 0 — 7/7 / 8/8（P0-1、P0-2 未受影响） |
| `verify:sheet-edits` | EXIT 0 — 61 |
| `verify:cloud`（**临时推进哈希后**） | **EXIT 0 — 272/272**（见下方说明） |
| `verify:cloud`（**当前工作树**，检查点未推进） | **EXIT 1**，唯一失败点 = Us wxss 哈希链（预期且 brief 允许） |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all`（**临时推进哈希后**） | **EXIT 0**（55 条顶层脚本，0 FAIL） |

### ⚠️ 关于 `verify:cloud` / `verify:all` 的口径（重要）

冻结的 Us wxss 哈希**合法地变了**，而检查点**按 brief 要求未推进** ⇒
`verify:cloud` 会**在第一条链测试就红**（`AssertionError: miniprogram/pages/us/index.wxss`），
于是它的 272 项与 `verify:all` **根本跑不到**。

为了拿到「新状态下仓库其余部分是否仍然全绿」的证据，我做了一次**可逆的本地推进**：
临时把 `ui-approved-updates` / `visual-refinements` / `us-identity-review` 三处的 Us wxss
`sha256`（及后两者的 `baseSha256`）指向新哈希 → 跑完 `verify:cloud`(272/272) + `verify`(358/358) + `verify:all`(EXIT 0)
→ **立即从备份原样还原**，并用脚本逐字段核对三处都回到本轮之前的值
（`d4a9b1b32f4e…` / `a021a8dba2…` / `98bd32681d0a…`），`tools/visual-refinements.json` 与 HEAD **逐字节相同**。

**当前工作树状态：检查点未推进**，`verify:cloud` 因此**仍是红的**（唯一失败点就是这条 Us 哈希），
这与 brief 的「The UI registration gate may remain red … Do not advance it without explicit approval」一致。
**批准后再推进，我没有自行推进。**

### 新闸门的 RED 证明（两种失败模式各一次）

新增闸门 `Us management entry stays a quiet utility while the identity card keeps first glance`，
它**按特异性 + 应用顺序**解析（不是按源码顺序），并对 **PEARL 与 DUSK 两个主题**都断言。

```
# RED 1 — 还原原来的填充式规则
AssertionError: the entry must not carry a fill (pearl), saw rgba(229, 231, 221, 0.36)

# RED 2 — 降权规则只写一个类（DUSK 会被 .dusk .secondary-button 压过去）
AssertionError: the entry must not carry a fill (dusk), saw #2b2c30

# GREEN
44/44 UI quality regression checks passed.
```

RED 2 是这条闸门存在的真正理由：**只按源码顺序解析的闸门会把 DUSK 的深色板判成「已修复」**。

---

## 10. Us 检查点影响

- **未推进**（按 brief 要求，先交证据）。
- Us wxss 的新哈希：**`6f731a4bc045762a12426a596179e9718f80c00d049340200a4e688aa5d82ffc`**（旧：`98bd32681d0ad76db4961cd6f5c34fbcb993a4b42372961d6a38bf57c93d60d5`）。
- 需要推进时**共三处**（这点容易漏，本轮实测）：
  1. `tools/fixtures/regression/ui-approved-updates.json` → `sha256`
  2. `tools/visual-refinements.json` → `baseSha256` **与** `sha256`
  3. `tools/us-identity-review.json` → `baseSha256` **与** `sha256`
  （`review` 字段是硬断言，**不能改**；新证据写进 `reason`。）
- Us **wxml 哈希未变**（无 WXML 改动）；`verify-secondary-ui` 的 `space-management secondary-button` 契约未破。

---

## 11. 本轮明确没做的事

- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未推进任何 UI 检查点
- ❌ 未改 Us 数据模型 / 关系逻辑 / Wishlist / 共享记忆 / Journey / Latest place / Shared Moments / 底部导航
- ❌ 未新增浮标 / Sheet / 模态 / 设置页 / 卡片族 / 填充按钮 / 渐变 CTA
- ❌ 未改任何文案（说明段落一字未动）
- ❌ 未做通用 Us 审计（只针对这一个入口）
- ❌ 未开始 Me 图标工作

---

## 12. 最终建议

**ONE SPECIFIC REMAINING US ISSUE**

**唯一未决项 = §4 的渲染对照截图**（PEARL / DUSK × 中文 / 英文，before / after）。
代码与样式契约已完成并通过程序化度量与两种 RED 证明，但**在拿到像素级渲染证据之前，我不声称视觉上已获批**。

**解除阻塞只需你做一个动作**（二选一）：

1. 在开发者工具里**退出 IDE**，然后我运行
   `cli auto --project <本仓库> --auto-port 9420 --trust-project`
   重新以「自动化已启用」的方式打开项目 —— 之后我可以自己采 PEARL/DUSK × ZH/EN 的 before/after 截图；**或**
2. 你在真机上直接截 4 张（PEARL·ZH / PEARL·EN / DUSK·ZH / DUSK·EN），只截 Us 页顶部到身份卡即可。

**然后 STOP。**

---

# 13. 渲染视觉证据（2026-10-01 追加 · 自动化已恢复）

**本轮未改任何生产代码**：`pages/us/index.wxss` 仍是 `6f731a4bc045762a…`，`tools/verify-ui-quality.cjs` 未动，
`pages/us/index.wxml` 仍是 `dcae6d39f265cb39…`（= 冻结值）。**Us 检查点仍未推进。**

## 13.1 运行时是怎么恢复的

上一轮 `automation_*` 全部 timeout；本轮再试**一次**即恢复（`automation_runtime_info` 返回 `platform: devtools`），
`simulator_screenshot` 正常。**没有**改任何 DevTools 设置、**没有**重启 IDE、**没有**改生产代码去迁就工具。

设备/视口（运行时读出）：**428 × 926 逻辑像素，dpr 3**；截图 374×809（缩放 0.8738）。
⇒ 下文 px 一律是**逻辑像素**，与页面 `boundingClientRect` 同单位。

## 13.2 四张截图

| 文件 | 主题 | 语言 |
|---|---|---|
| `.workbuddy-ai/scratch/us-p11/01-pearl-en.png` | PEARL | EN |
| `.workbuddy-ai/scratch/us-p11/02-dusk-en.png` | DUSK | EN |
| `.workbuddy-ai/scratch/us-p11/03-dusk-zh.png` | DUSK | 中文 |
| `.workbuddy-ai/scratch/us-p11/04-pearl-zh.png` | PEARL | 中文 |

四张都同时包含：Us 标题 + 副标题、管理入口、说明段落、双人身份卡（头像+心+天数）、Journey 卡顶边（"我们的旅程/Our Journey" 与三项统计）。
放大对照图：`zoom-*.png`（2×）。

⚠️ 截图是通过临时切换 `store.updateSettings({theme, language})` 得到的，**采完已还原到进入时的基线
（theme=pearl / language=en）**，运行时读出确认已还原。

## 13.3 真实渲染几何（428px 视口，逻辑 px）

| 元素 | 宽 × 高 | top → bottom | 换算 |
|---|---|---|---|
| `.us-heading`（标题+副标题） | 384 × 65 | 88 → 153 | — |
| **`.space-management`（管理入口）** | **384 × 50** | **164 → 214** | **50px = 88rpx ⇒ 命中区与设计值一致** |
| `.secondary-subtle`（说明段落） | 384 × 60 | 223 → 283 | EN 3 行 / ZH 2 行 |
| **`.together-card`（双人身份卡）** | **384 × 200** | **305 → 505** | 200px = 350rpx ≈ 冻结的 352rpx |
| `.journey-card`（Journey 卡） | 384 × 191 | 523 → 714 | — |

竖向节奏：标题底 153 → 入口顶 164（20rpx 上边距）→ 入口底 214 → 段落顶 223（16rpx）→ 段落底 283 → 身份卡顶 305（`--space-lg` 40rpx）。
**入口与段落、与身份卡都不重叠**；入口的可点区域完整落在 164–214。

**面积对比（第一眼层级）**：身份卡 **384×200 = 76 800 px²** 且是 header 之后**唯一的实心面**；
入口 **384×50 = 19 200 px²** 且**无面**。⇒ 身份卡面积是入口的 **4 倍**，且是唯一有材质的一层。

## 13.4 七个判定问题

| # | 问题 | 结论 | 依据 |
|---|---|---|---|
| A | 身份卡是否成为 header 之后**第一个主导面**？ | **是** | 四张截图：唯一的实心圆角卡；面积 4× 入口；入口无填充/无描边 |
| B | 「管理双人空间与 Wishlist」是否**清晰可发现**？ | **是（附一条诚实观察）** | 可见、可读、位于副标题正下方、满宽可点、命中区 88rpx、文案直述目的地；⚠️ 但它与下方说明段落**同为 `--muted`**，因此它的「可点」线索只剩**措辞与位置**（见 §13.6） |
| C | 入口还像按钮/CTA 吗，还是安静工具？ | **安静工具** | 渲染尺寸 384×50 但**填充透明、无描边、无圆角、无内边距、左对齐**；放大图可见它是一条纯文本行 |
| D | 说明段落是否仍可读且**未成为第二大视觉块**？ | **是** | 24rpx `--muted`；EN 3 行/60px、ZH 2 行；与 200px 的身份卡、191px 的 Journey 卡相比微不足道 |
| E | DUSK 下是否避免变成高对比深色 CTA？ | **是** | 截图 `02-dusk-en` / `03-dusk-zh`：无深色板；与上一轮的解析度量一致（`#2b2c30` → `transparent`） |
| F | 中文标签是否自然换行？ | **是** | `03/04`：`管理双人空间与 Wishlist` **单行**；入口尺寸仍是 384×50（与英文**逐像素相同**） |
| G | 英文是否稳定？ | **是** | `01/02`：`Manage shared space & wishlist` 单行；尺寸与中文完全一致 ⇒ 没有为中文宽度放大英文 |

## 13.5 验收目标核对

目标：**双人身份卡在视觉上必须重于管理工具**（允许入口在空间上靠前）。

| | 身份卡 | 管理入口 |
|---|---|---|
| 材质 | `--surface-card` 实心圆角面 + 阴影 | **无面**（透明） |
| 面积 | 76 800 px² | 19 200 px²（4× 差） |
| 内容 | 两个头像 + 心 + 「已经相伴 15 天」 | 一行 25rpx 文本 |
| 首眼位置 | header 之后**第一个强对象** | 安静的过渡行 |

⇒ **满足**：入口空间上靠前，但视觉上不主导。

## 13.6 一条诚实观察（非阻塞，供你裁决）

降权后，**入口与说明段落共用了同一种 `--muted` 文本处理**（25rpx vs 24rpx，颜色相同、都无面）。
结果是：入口读起来更像**小节标签**，而不是一个「可点开的入口」——
它的可点线索来自**措辞（Manage … / 管理…）与位置（副标题正下方、满宽可点）**，而不是视觉 affordance。

这是**降权的预期方向**，也是把「填充面」拿掉后必然的代价；本轮的验收目标（身份卡重于入口）**已满足**。
若要再补一点可发现性，**只允许一次**且必须落在 brief 的禁区之外，最保守的一步是
**把入口文本从 `--muted` 提到 `--ink`**（仍是纯文本、无面、无描边、无图标、不改文案、不改间距）——
但我**没有**自行做这一步，因为：
- brief 的「NOT GOOD」分支定义是「入口**仍然太强**」，而当前问题方向相反；
- brief 明示 **NO EXTRA POLISH**、不要再来一轮间距/图标/文案调整。

⇒ 按「先交证据再裁决」处理，等你决定是否要这**一次**提升。

## 13.7 本轮交付物哈希与检查点

| 文件 | 当前 sha256 |
|---|---|
| `miniprogram/pages/us/index.wxml` | `dcae6d39f265cb39b8898e9e9fea05d492b04ba62bbb8457dc61cf0222a9940b`（**= 冻结值，未变**） |
| `miniprogram/pages/us/index.wxss` | `6f731a4bc045762a12426a596179e9718f80c00d049340200a4e688aa5d82ffc` |

**Us 检查点影响：未推进。** 三处链节仍为 `d4a9b1b32f4e…` / `a021a8dba212…` / `98bd32681d0a…`，
即本轮之前的值；`verify:cloud` 因此仍在第一条链测试红（预期，brief 允许）。

---

# 14. 结项：视觉已批准 + 检查点推进（2026-10-01）

**US-P1-1 已视觉批准。** 保留当前实现**逐字节不变**；**未**采用可选的 `--muted → --ink` 调整。
§13.7 记录的「检查点未推进」是**批准前**的状态，本节取代它。

## 14.1 批准的最终状态（保留，勿改）

`.space-management`：透明 · 无描边 · 无圆角 · 无可见填充面 · 左对齐 · `--muted` · 25rpx · **88rpx 命中区** · 满宽
`.secondary-subtle`：caption 层级 · `--muted` · **文案不变**
功能保留：原生 `<button>` · `onManageSpace` · `/pages/space/index` · Wishlist 管理 · 隐私/跨账号说明文案 · `hover-class` 反馈 · 无障碍语义

## 14.2 已批准的视觉证据

| | 文件 |
|---|---|
| PEARL / 中文 | `.workbuddy-ai/scratch/us-p11/04-pearl-zh.png` |
| PEARL / EN | `.workbuddy-ai/scratch/us-p11/01-pearl-en.png` |
| DUSK / 中文 | `.workbuddy-ai/scratch/us-p11/03-dusk-zh.png` |
| DUSK / EN | `.workbuddy-ai/scratch/us-p11/02-dusk-en.png` |

最终层级：`Header → 安静的管理工具 → 说明 caption → 双人身份卡 → Journey`。
**空间顺序可以把它放在前面，但视觉主导权属于双人身份卡。**

**已接受的 affordance 权衡（有意为之）**：管理入口主要靠**措辞 + 位置 + 满宽命中区**，
而不是填充面。**没有复现出真实可用性失败之前，不得再为 affordance 打磨重开此项。**

## 14.3 检查点推进（只有三处、只有已证明需要的字段）

| # | 文件 | 字段 | 旧 → 新 |
|---|---|---|---|
| 1 | `tools/fixtures/regression/ui-approved-updates.json` | `miniprogram/pages/us/index.wxss.sha256` | `d4a9b1b32f4efaf3f88061269ec38f886a39ddf3aae76c5106a91ede0fafbbe3` → `6f731a4bc045762a12426a596179e9718f80c00d049340200a4e688aa5d82ffc` |
| 2 | `tools/visual-refinements.json` | `…us/index.wxss.baseSha256` | `d4a9b1b32f4efaf3…` → `6f731a4bc045762a…` |
| 2 | `tools/visual-refinements.json` | `…us/index.wxss.sha256` | `a021a8dba2129f3ea269521c4b84b38e341eecb1275de0f62d020aa92a73882e` → `6f731a4bc045762a…` |
| 3 | `tools/us-identity-review.json` | `…us/index.wxss.baseSha256` | `a021a8dba2129f3e…` → `6f731a4bc045762a…` |
| 3 | `tools/us-identity-review.json` | `…us/index.wxss.sha256` | `98bd32681d0ad76db4961cd6f5c34fbcb993a4b42372961d6a38bf57c93d60d5` → `6f731a4bc045762a…` |

- **恰好 5 个字段**，与 §6/§10 中「可逆临时推进」已证明的字段集**完全一致**；**没有**发明额外检查点改动。
- **所有 `review` 字段未变**（`docs/mcp-r2-remaining-layout-review-20260919.md` / `docs/reviews/us-identity-state-20260922.md`）。
- **键集合未变**（`baseSha256,sha256,reason,review` / `sha256,reason`）——`deepEqual` 断言仍然成立。
- `reason` 只**追加**（长度 97→1076 / 259→1238 / 706→1685，各 +979 字符），沿用既有「日期 + 授权范围（文档路径）」格式，**历史文本逐字保留**。
- 链结构不变：`approved → refinements → us-identity`，三处都指向同一新哈希。

## 14.4 生产完整性

| 文件 | 哈希 | 结果 |
|---|---|---|
| `miniprogram/pages/us/index.wxml` | `dcae6d39f265cb39b8898e9e9fea05d492b04ba62bbb8457dc61cf0222a9940b` | **逐字节未变** |
| `miniprogram/pages/us/index.wxss` | `6f731a4bc045762a12426a596179e9718f80c00d049340200a4e688aa5d82ffc` | **逐字节未变** |
| `miniprogram/pages/us/index.js` | `4de5ce8700c464011262b31ef91410cf9f9706ec8b8d55b6b033d251e79abe66` | **逐字节未变** |

本次结项**只改检查点/注册元数据**；未触碰 Home / Map / Add / Me / 共享 locale / 共享图标注册表 / Map P0-1 / Map P0-2。

## 14.5 验证

| 命令 | 结果 |
|---|---|
| `verify:cloud` | **EXIT 0 — 272/272**（**不再需要任何临时哈希操作**） |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 0**（0 FAIL） |
| `verify:ui` | EXIT 0 — 44/44 |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:icons` | EXIT 0 |
| `verify:secondary-ui` | EXIT 0 — 15/15 |
| `verify:structure` | EXIT 0 — 6 |
| `verify:memory-return` | EXIT 0 — 13 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:page-lifecycle` | EXIT 0 — 8 |
| `verify:map-tab-return` | EXIT 0 — 7/7 |
| `verify:map-photo-budget` | EXIT 0 — 8/8 |

## 14.6 最终状态

**US-P1-1 — CLOSED**
**US — FROZEN**

该页**不得**因以下原因重开：把管理文案调深、加图标、加 chevron、加浅背景、改间距、缩短说明文案、进一步层级打磨
—— **除非复现出真实的真机可用性失败**。
