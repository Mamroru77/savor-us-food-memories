# Add — Round 5 · Universal Import 最终交互模型决策（2026-09-29）

**未改任何生产文件。未 commit / 未 push / 未 deploy。UI 注册检查点未推进。**
**本文件是决策记录，不是实现。等批准后才动代码。**

---

## 0. 取证方式与限制

**在活的运行时上量的当前已批准 Add 屏**（不是旧截图）：

- 通道：`automation_evaluate` + `createSelectorQuery().boundingClientRect()`（只读）
- 目标：**devtools 模拟器**，`platform: "devtools"`，机型档 `iPhone 12/13 Pro Max`，
  `window 428×926`，`pixelRatio 3`，`identityReady: true`，`photos: 0`
- 截图：`simulator_screenshot`（**与 `getCurrentPages()` 同为模拟器，故与几何一致**）
- ⚠️ **未在真机复核**。本轮所有数字都是**模拟器档 428×926** 下的值；换机型会等比缩放，
  但**布局比例关系（谁高谁矮、谁先谁后）不变**。

**测量手段的边界（如实声明）**：
- `fields({computedStyle})` 在本运行时路径下**不回调** ⇒ 没有读「计算后的颜色」，
  对比度结论来自 CSS 声明值 + 截图目视，**不是**亮度采样。
- 本轮**没有**触发任何会写草稿的状态（见 §7 的 VERIFIED / READ 分级）。

探针（gitignored，可复跑）：`.workbuddy-ai/scratch/round5-import/probe-{geometry,expanded,states,copy}.cjs`

---

## 1. Import 的角色分类 → **ALTERNATIVE ENTRY PATH（替代入口）**

### 事实（来自代码）

| 问题 | 事实 |
|---|---|
| 接受什么 | 用户**手动粘贴**的一段分享文案（≤6000 字符），**一次一家店** |
| 平台/格式 | 三个**声明式**来源：`dianping`(堂食) / `meituan`(外卖) / `other-delivery`(外卖)。链接只认 `m.dianping.com/shopinfo/*` 与 `dpurl.cn/*`（且**只保留不解析**）；点评多行模板只认「价格行→商圈行→地址行」这一种排布，未知排布留空 |
| 会不会去抓页面 | **不会**。面板自己写明「尚未接通商家页面资料获取」，`shareImport.js` 头注释：*Offline, user-initiated text parsing only. No fetch, clipboard read, geocoding or writes.* |
| 会不会读剪贴板 | **不会**。全仓 `getClipboardData` = **0 处**；只有 `setClipboardData`（sheet 分享/space 邀请码）。用户必须自己粘贴 |
| 有几个步骤 | 常用路径 **6 步**：点行 → 选来源 → 粘贴 → 「整理文案，生成候选」→ 「填入草稿」→ 确认弹窗。带定位再 +2~3 步（开关/搜索/选点 + 「确认分店」弹窗） |
| 高频还是偶发 | **偶发**。前置动作发生在**小程序之外**（去点评/美团复制分享文案再回来），不属于应用内的记录回路 |
| 是否替代手动 Add | **否**。`applyCandidate` 只预填：店名、菜系、餐饮类型、`sourcePlatform/sourceUrl`、地址/商圈提示、平台评分、人均；**照片、Notes、日期、用户评分、花费一律不动**，确认弹窗原文即「Notes, photos, ratings and actual cost stay unchanged」 |
| 是否回到同一份草稿 | **是**。`applyCandidate(original, candidate)` 把候选**合并进现有草稿**；`importBlocked()` 在 `saveLock/uploading/locating/editingId/editOperationId/cloudAttempt` 任一为真时**拒绝**导入 ⇒ 它天然以「当前这份草稿」为目标 |
| 已存在哪些状态 | 折叠 / 展开 / 来源已选 / 已粘贴 / 解析失败（7 个映射错误码）/ 候选已生成 / 分类建议 / 定位开关关·开 / 搜索中 / 无结果 / 匹配列表 / 查询错误 / 原生选点进行中(`locating`) / 分店确认弹窗 / 填入确认弹窗 / 已填入(面板关闭+回顶) / 取消 |
| 键盘/粘贴/loading/failure | **四者全有**。textarea 带 `cursor-spacing="100"` + `focusedField` 焦点跟踪；输入方式只有粘贴；`importSearching` 驱动 `loading` 按钮；错误有映射表 |

### 分类理由

- **不是 PRIMARY PATH**：概念图（`docs/design/0.savor-concept.png`，第 3 屏）的主流程是
  `Photo → Restaurant → Notes → Date/Rating → Tags → Save`，**根本没有 Import**；
  正常手动录入才是主路径。
- **不是 SECONDARY PATH**（不是「为主路径服务」的那种，例如 Tags / More details / Date+Rating
  都是**在已有录入上做细化**）。
- Import 提供的是**同一份产物的另一种来源**：目标是同一个草稿，输入来自应用外部的分享文案，
  并且**合并进**当前草稿 ⇒ 它是**进入 Add 草稿的另一条路**。

⇒ **ALTERNATIVE ENTRY PATH。**

**顺带一个结构性事实**：当前正常 Add 流程
`Header → Universal Import → Photo → Restaurant → Notes → Date/Rating → Tags → More details → Save`
中，**Universal Import 是唯一一个不在概念图里的元素**。

---

## 2. 当前内联成本（实测，折叠态）

### 数字

| 元素 | top | bottom | 高 | 宽 |
|---|---|---|---|---|
| `.add-heading`（Header） | 88 | 147 | 59 | 390 |
| **`.import-entry`（折叠的 Import 行）** | **165** | **215** | **50** | **384**（满内容宽） |
| `.import-entry-note`（右侧小字） | 179.5 | 200.5 | 21 | 78.8（右缘 393） |
| `.photo-editor-row`（照片锚点） | **233** | 478 | **245** | 384 |
| `.save-memory` | 1305.3 | 1362.3 | 57 | 384 |

- Header 底 147 → Import 行顶 165：**间隙 18pt**（`--space-md` = 32rpx）
- Import 行底 215 → 照片顶 233：**间隙 18pt**
- ⇒ 这一行把概念图的第一个元素（照片）从 165 推到 233，**净位移 68pt**
- 照片块 245pt = Import 行的 **4.9 倍**
- 行高 50pt 恰好等于共享控件 token `--control-height: 88rpx`（**没有靠缩触摸目标买密度**）

### 视觉权重（CSS 声明值 + 截图目视）

- 背景 `rgba(251,250,247,.52)`（PEARL）/ `rgba(238,234,227,.08)`（DUSK）—— 全屏**最轻的一层表面**
- **无边框、无阴影、无 backdrop-filter**
- 主标签走 `--ink`（**这是刻意修正过的**：CSS 注释记载第一次用 `--muted`，实测在活的氛围照片上不可读）
- 右侧小字走 `--muted`，20rpx（≈11.4pt），`opacity: .85`

### 回答：折叠的 Import 行**是否实质打断主记录流程**？

## **NO（不打断）**

具体视觉理由：

1. **它是一行，不是一张卡**：50pt，等于共享控件高度，没有卡片的任何特征（无边框/阴影/模糊）。
2. **它不是最重的东西**：正下方的照片锚点 245pt，是它的 4.9 倍，且是首屏唯一带大图标（`+`）的元素。
3. **它不和 Save 竞争**：Save 在表单另一端（top 1305），57pt，是首屏唯一的深色实心按钮。
4. **它读起来是一行说明文字**：标签用正文字色只为可读，副标保持 muted ⇒ 视觉上是一个「一行说明 + 右侧注脚」，不是动作块。
5. **实测截图**（`add-collapsed.png`）：首屏最醒目的是照片块，Import 行是一道浅色横条。

**但必须诚实地说出「打断」的那一面**：它**确实占在首屏**，而且占的正是
**header 与照片之间**那个位置（header → import → photo）。所以打断是**位置性的，不是视觉性的**。
⇒ 这恰恰说明**这一行的「轻」是承重的**：一旦给它加边框/阴影/图标，它就会开始读成页面主操作。

---

## 3. INLINE 模型：强项 / 弱项

### 实测状态（折叠态与展开态分开看）

| 维度 | 事实 |
|---|---|
| 折叠占位 | **50pt**（+18pt 间距 = 68pt 净位移） |
| 可发现性 | **高**：满内容宽、首屏第一行、带标签 |
| 点击目标 | **50pt ≥ 44pt**，且 `bindtap` 在**整行**上 |
| 展开高度 | 空面板 **538.3pt**；**已生成候选时 1468.3pt**（= 视口 926 的 1.59 倍） |
| 展开位移 | 照片/表单被下推 **556.3pt**（空）/ **1486.3pt**（有候选）；Save 被推到 top 2791.7 |
| 展开后的控件量 | 约 **13 类控件**：来源 picker、textarea、解析按钮、店名 input、菜系 input、**8 个分类 chip**、建议按钮、定位 switch、城市 input、搜索按钮、匹配列表（`scroll-view`）、原生选点按钮、填入按钮、取消按钮 |
| 键盘 | 走**页面原生滚动** + `cursor-spacing="100"` + `focusedField` 跟踪 ⇒ 无 fixed 层与键盘打架的问题 |
| loading | `importSearching` 驱动 `loading` 按钮（「查询腾讯地图分店」） |
| success | 面板关闭 + `store.saveDraft(next)` + `wx.pageScrollTo({scrollTop:0})` + toast |
| failure | 7 个错误码映射到**面板内** `errorContext==='import'` 的行内文案；定位查询错误另有 `importLookupError` |
| cancel | 「取消导入」清空 text/candidate/matches/lookup 并关闭；**实测无残留** |
| 草稿保全 | 面板是**纯页面状态**：`importOpen/importText/importCandidate` **从不写进 draft**；草稿只在「填入草稿」+确认弹窗后被写一次 |

### 强项

1. **零新表面**：无新弹层、无新 z-index、无组件注册、无新动效族。
2. **上下文不丢**：草稿就在同一个滚动容器里，前后是同一份表单。
3. **原生返回契约已经是对的**：`_nativeImportShow` waiter + `nativeImportSerial` + scene 保存/还原
   + `identity.resumeNative(token)` + `assertLease` + `pageScrollTo(scrollTop)`，
   **全部是页面作用域**，且是这套代码库已经踩过坑修好的那一类。
4. **没有「弹层叠弹层」**：流程里的 `i18n.modal`（定位授权 / 确认分店 / 确认替换）与原生
   `chooseLocation` 都是**页面之上的模态**，不是模态之上再叠模态。
5. **草稿安全是结构性的**：表现型 flag 与草稿物理隔离，草稿写入只有一处且被守卫。

### 弱项

1. **展开时面板极大**：538pt（空）/ **1468pt**（有候选），把整张表单连同 Save 一起推出屏。
2. **展开时 Add 页承载了一个完整子应用**（13 类控件 + 8 chip + 匹配列表）。
3. **入口在首屏**，所以它永远需要保持「轻」——这是持续的设计约束，不是可以忘记的。

---

## 4. SHEET 模型：强项 / 弱项

### 事实：现有 Sheet **不是**通用容器

- `properties` 只有 `show / type / memoryId / filter / readingPosition` —— **没有 slot / 没有内容投影**
- `type` 驱动 **13 个硬编码分支**：`memory / library / sync / personalize / profile / together /
  preferences / settings / privacy / weekly / journey / notifications / help`
- 定位：`.sheet-modal { position: fixed; inset: 0; z-index: 300 }`；
  `.sheet-panel { position:absolute; left/right 20rpx; top: var(--sheet-top); bottom: calc(194rpx + env(safe-area-inset-bottom)) }`；
  scrim `bindtap="close"`
- 它的 observer 做**页面耦合**的事：`nativeFlow.snapshot/suspend/show/cancel`、`identity.snapshot`、
  `resetFormEdits`、阅读位置还原、`motionPresence.update`
- **注册方只有 home / map / me / us**；`pages/add/index.json` 只注册 4 个组件（icon / morph / toast / identity-gate），**没有 sheet**

### 要用 Sheet 装 Import，必须做的改动

1. 在共享组件里**新增 `type:'import'` 分支**（约 40 行 WXML、13 类控件）
2. `pages/add/index.json` 注册 `s-sheet`
3. 把 Add 的页面状态（`importText` / `importCandidate` / `importBlocked()` / `saveLock` / `uploading` /
   `locating` / draft `editingId`·`cloudAttempt`）与**整套原生返回契约**接进组件，或在组件里复制一遍

### 强项

- 能**完全腾空** Add 首屏（那一行可以删掉或只留一个 50pt 触发器）
- 与 Me/Us/Home 的「重子任务进 sheet」语言一致
- scrim / handle / close / safe-area / scroll 都已现成

### 弱项（决定性）

1. **会变成嵌套模态 —— brief 明确禁止。** Import 流程**本身已经含 2~3 个 `i18n.modal`**
   （定位授权 / 确认分店 / 确认替换草稿）**外加原生 `wx.chooseLocation`**。把它放进 sheet ⇒
   sheet 之上再叠授权弹窗 / 确认弹窗 / 原生选点 = **modal-over-modal**。
2. **原生返回的归属会被撕裂。** `chooseLocation` 那条路依赖**页面**的 `_nativeImportShow` waiter、
   `nativeImportSerial`、scene 保存/还原、`identity.resumeNative(token)`、`assertLease`、
   `wx.pageScrollTo(scrollTop)`；而 Sheet 自己的 observer **也**在驱动 `nativeFlow` suspend/show。
   一屏两个原生返回 owner ⇒ 正是这套代码库已经被咬过的竞态类别。
3. **爆炸半径大。** 新分支落在**4 个页面共用**的组件里，而 `components/sheet/index.wxml`
   本身已是**被 file-scoped 复核门**覆盖的 UI 表面。
4. **没有省掉任何成本。** 展开的子表单在 sheet 里**一样高**；交互步数**不减反增**（多一层开/关），
   而且草稿被挡在 scrim 后面。
5. **可发现性反而下降。** 现在它是 header 下第一个带标签的东西；进 sheet 后**仍然需要一个可见触发器**。
6. **键盘处理更差。** Sheet 是 `position: fixed` + **固定 bottom 偏移**，且全组件只有**一个**
   textarea 用了 `cursor-spacing`；面板不会跟键盘移动。当前内联方案用的是**页面原生滚动**。

---

## 5. 12 项标准的**事实对比**（不打分）

| # | 标准 | 事实 | 倾向 |
|---|---|---|---|
| 1 | 主流程清晰度 | 内联=一行、无新层；sheet=多一个入口 + 一个模态层 | **INLINE** |
| 2 | 首屏密度 | sheet 理论上能腾空那 68pt；但现状 50pt 的轻行**已经**让照片主导首屏 ⇒ 收益只有 68pt | SHEET（弱） |
| 3 | 可发现性 | 内联=满宽带标签、首屏第一行；sheet 仍需要自己的触发器 | **INLINE** |
| 4 | 交互成本 | 内联=点一下就地展开；sheet=多一层开+关，**嵌套确认两边都躲不掉** | **INLINE** |
| 5 | 上下文保全 | 内联=同一滚动容器；sheet=草稿被 scrim 挡住 | **INLINE** |
| 6 | 键盘行为 | 内联=页面原生滚动 + `cursor-spacing`；sheet=fixed 面板 + 固定 bottom + 仅一个字段有 `cursor-spacing` | **INLINE** |
| 7 | 错误恢复 | 内联=错误就地渲染在**产生它的那个字段旁**；sheet 需要自建错误面 | **INLINE** |
| 8 | 草稿安全 | 内联=表现型 flag 与草稿物理隔离，草稿写入只有一处；sheet 会把这次写入**拆成两方共有** | **INLINE** |
| 9 | 实现复杂度 | 内联=**今天已经是正确的**，0 改动；sheet=改共享组件 + 接线 + 拆契约 | **INLINE** |
| 10 | 与现有产品一致 | sheet 语言在 Me/Us/Home 成立；但 Import 自己的词汇（来源 picker / 解析 / 候选 / 分类 chip / 定位 / 填入）**本来就是 Add 表单自己的控件词汇** | 混合，略偏 INLINE |
| 11 | 与概念图相似度 | 概念图**完全没有** Import；最接近概念的做法就是**一条最轻的行**（= 现状）。sheet **仍然需要一个可见触发器**，所以并不会更接近概念 | **INLINE** |
| 12 | 整体平静度 | 内联=无新层、无 scrim、无 fixed 面板，那一行是屏上最轻的表面 | **INLINE** |

---

## 6. 推荐最终交互模型 → **A. INLINE compact utility（保持现状，不改）**

**理由（基于用户流，不基于「更干净/更高级」）**：

1. Import 是**替代入口**，不是主路径。主路径（概念图）是 `Photo → … → Save`。
2. 现状已经把「替代入口」这件事做对了：**一行 50pt、无边框无阴影、首屏第一行、满宽可点**。
   它占位但不抢戏（照片是它的 4.9 倍），且**不和 Save 竞争**。
3. **Sheet 不能减少任何成本，只会增加**：多一层开/关、草稿被遮、键盘更差，
   而且会**必然引入嵌套模态**（流程里已有 2~3 个 `i18n.modal` + 一个原生选点），
   并把**已经修好的页面级原生返回契约**拆成两方共有。
4. 12 项标准里 **10 项偏 INLINE**，偏 SHEET 的只有「首屏密度」且收益仅 68pt。
5. 与概念图的关系：概念图没有 Import ⇒ 目标是**让它不打扰概念构图**。
   一条最轻的行已经是能达成这件事的最简形式；**换成 sheet 并不会更接近概念图**（仍要有触发器）。

### 「IF INLINE WINS」的后续动作

> **Do NOT redesign Import. Only refine it if there is a concrete remaining problem.**

**核查结论：本轮没有找到已证实的遗留问题 ⇒ 建议 0 改动。**

逐项核过（全部为实测）：

- **折叠占位**：50pt = 共享控件 token，未缩触摸目标 ✓
- **可发现性**：首屏第一行、满宽、带标签 ✓
- **点击目标**：整行 50pt ✓
- **展开高度**：是「展开子表单」的预期行为（538pt 空 / 1468pt 有候选），
  **属于刻意披露，不是缺陷** ✓
- **键盘**：页面原生滚动 + `cursor-spacing` ✓
- **loading / success / failure / cancel**：四态齐备，取消**实测无残留** ✓
- **草稿保全**：表现型 flag 不写草稿，草稿只在填入时写一次 ✓
- **长文案**：中文（`万能导入` / `分享文案 / 链接`）行高仍 50pt、无溢出；
  **合成压力**（标签 34 字符 + 副标 30 字符，≈1.8 倍）行高**仍为 50pt**，内部换行、无裁切 ✓

⚠️ **一个观察（不是 REVISE 提案）**：右侧小字是 20rpx（≈11.4pt）`--muted` `opacity .85`，
在活的氛围照片上属于**偏小偏低对比**。我**没有**测到它不可读（`fields({computedStyle})` 不回调，
且背景是可变的照片），CSS 注释显示**主标签**曾因同样原因被修正为 `--ink`，**副标未动**。
⇒ 记为**待观察**。按 brief「不要因为 REVISE 存在就发明 REVISE」，**本轮不提议改动**。

---

## 7. MANDATORY STATE REVIEW（12 态）

分级：**VERIFIED** = 本轮在活运行时实测；**READ** = 只读了代码/WXML，未实跑；**N/A** = 不适用。

| # | 状态 | 结果 | 级别 |
|---|---|---|---|
| 1 | normal Add / Import 折叠 | 行 top 165 / h **50** / w 384；照片 233/245；Save 1305/57。截图 `add-collapsed.png` | **VERIFIED** |
| 2 | Import opened | 行**不动**（165/50）；面板 top 233 / h **538.3**；照片→789.3；Save→1861.7；面板内按钮 2 个。截图 `add-expanded.png` | **VERIFIED** |
| 3 | input populated（已生成候选） | 面板 h **1468.3**；照片→1719.3；Save→2791.7；**8 个分类 chip**；候选名 `海底捞火锅` | **VERIFIED** |
| 4 | loading | `importSearching` → 按钮 `loading` + 文案切换；**未实跑**（需要真发一次腾讯地图分店查询，会消耗云配额，且本轮不做云端取证） | **READ** |
| 5 | success | 面板关闭 + `saveDraft(next)` + 回顶 + toast；**未实跑**（**会写用户草稿**，本轮是决策轮，不取得授权不动草稿） | **READ** |
| 6 | recoverable error | `importText:''` → `error:"Paste some share text first."`，`errorContext:'import'`，**行内渲染在面板内**；面板 h 538.3→**559.3**（+21 错误行） | **VERIFIED** |
| 7 | cancel | `importOpen:false`、`importText:''`、`error:''`；照片回到 233 ⇒ **无残留** | **VERIFIED** |
| 8 | keyboard open | **未验证**：自动化通道无法唤起软键盘。已确认代码面：textarea `cursor-spacing="100"`、`focusedField` 跟踪、走页面原生滚动（非 fixed 层） | **READ** |
| 9 | PEARL | 上述全部测量即 PEARL 基线 | **VERIFIED** |
| 10 | DUSK | 行 165/50、副标 78.8×21 —— **与 PEARL 逐字节相同**，只有背景色按 CSS 变化。截图 `add-dusk-collapsed.png` | **VERIFIED** |
| 11 | Quiet | **未实跑**（`quiet` 由 reduceMotion 驱动）。代码面：Import **本就没有专属动效**（无新 keyframe / 无新 transition），故 Quiet 下无插值可去 | **READ** |
| 12 | long English / Chinese copy | 中文：行 165/50、副标 76.2×21，**无溢出**（截图 `add-zh-real.png`）。英文基线：副标 78.8×21。合成 1.8 倍长串：**行高仍 50pt**，内部换行、无裁切（截图 `add-longcopy.png`） | **VERIFIED** |

---

## 8. 草稿 / 键盘 / 错误的含义（两种模型的差别）

| 关注点 | INLINE（现状） | SHEET（假想） |
|---|---|---|
| 草稿绑定 | `importOpen/importText/importCandidate` 是**页面表现态**，从不进 draft；草稿**只在「填入草稿」+确认后被写一次** | 草稿写入必须**回调页面** ⇒ 写入权拆成两方共有，正是本项目 §6 反复告警的竞态源 |
| 键盘 | 页面原生滚动；`cursor-spacing="100"`；`focusedField` 定位错误 | `position:fixed` 面板 + `bottom: calc(194rpx + safe-area)` **不随键盘移动**；全 sheet 仅 1 个字段有 `cursor-spacing` |
| 错误 | 错误渲染在**产生它的字段旁**（面板内 / `importLookupError` 单独一行），与字段同一表面 | 需要为 import 分支**自建**错误面；sheet 的 13 个分支都是**定制**的，不是数据驱动 |
| 嵌套模态 | `i18n.modal` ×2~3 + 原生 `chooseLocation`，都是**页面之上**的模态 | sheet 之上再叠 ⇒ **modal-over-modal**（brief 明确禁止） |
| 原生返回 | `_nativeImportShow` / `nativeImportSerial` / scene 还原 / `resumeNative` / `assertLease` / `pageScrollTo` **全在页面**，已修好 | 与 sheet 自己的 `nativeFlow` 驱动**争夺同一屏** |

---

## 9. 会改动的确切文件

### 采用推荐方案（INLINE 保持现状）

**无。0 个生产文件改动。** 不需要新的 WXML 分组、不需要新组件、不需要新动效。

### 如果最终选择 SHEET（**仅供备查，本轮不实施**）

- `miniprogram/pages/add/index.json` —— 注册 `s-sheet`
- `miniprogram/components/sheet/index.js` / `index.wxml` / `index.wxss` —— 新增 `type:'import'` 分支 + 状态模型
- `miniprogram/pages/add/index.js` —— 移除内联面板、把 handlers / `importBlocked()` / 原生返回契约接线或搬移
- `miniprogram/pages/add/index.wxml` / `index.wxss` —— 移除 40 行内联面板与其样式
- 注册链：`tools/add-page-review.json`（Add 两个文件）+ `components/sheet/*` 的 file-scoped 复核门
  （`verify-cloud.cjs` 的 UX / stage6 scope 已把 `components/sheet/index.wxml` 视为受复核表面）

若选 SHEET，需先给出 brief 要求的**确切状态模型**（CLOSED / OPEN / INPUT / LOADING / RESULT /
ERROR / CONFIRM / CANCEL），并明确「什么留在 Add 页、什么进 Sheet、什么仍绑草稿、什么关闭 Sheet、
成功/失败/键盘/返回各做什么」——**本轮不做**。

---

## 10. 明确**不**改动的东西

- 不改 `miniprogram/pages/add/index.wxml` / `index.wxss` / `index.js`（**本轮 0 生产改动**）
- 不改 `miniprogram/components/sheet/**`
- 不改 `miniprogram/utils/shareImport.js` / `importPolicy.js`（业务语义不动）
- 不改 Import 的业务逻辑、错误码映射、`importBlocked()` 守卫、原生返回契约
- 不加新卡片、不加新动效族、不增加视觉权重
- 不推进 UI 注册检查点（本轮没改 UI）
- 不动 `tools/add-page-review.json` 的 `baseSha256` / `review` / `sha256`
- 不做 commit / push / deploy
- 不开始 Import 实现（等批准）

---

## 11. 一句话结论

**Universal Import 是「替代入口」，当前的内联紧凑行已经是正确形态；
Sheet 只会增加成本（嵌套模态 + 拆分已修好的原生返回契约 + 更差的键盘），
不会减少任何成本 ⇒ 保持 INLINE，0 改动。**
