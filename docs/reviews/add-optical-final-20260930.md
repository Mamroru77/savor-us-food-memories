# Add — FINAL OPTICAL PASS（2026-09-30）

**未 commit / 未 push / 未 deploy。UI 注册检查点未推进（本轮未获授权）。**
未触碰 Import（保持 inline）、未改任何 frozen 结构、未加动效、未改业务逻辑、未加组件/状态。

---

## 0. 取证方式与两条限制（如实声明）

**证据 = 活运行时**（`automation_evaluate` + `boundingClientRect` / `element_action`）+ 截图 + CSS 级联 + 概念图。
当前运行档：**devtools 模拟器，428×926，pixelRatio 3**。

**限制 1 — 无改视口宽度能力**（同 Round 5）：`automation_viewport_action` 只有
`pageScrollTo | screenshot | stopAudits | remote | close`，模拟器机型是 IDE 私有设置。
⇒ 428 实测；更窄宽度只能按 rpx 模型推算。

**限制 2 — 本会话渲染层对 `wx:if` / class 绑定是滞后的（重要）**：
用 `setData` 造态时实测到**混帧**：`wx:for` 列表会更新（`.tag` 渲染出 3 个），
但 `wx:if` 与 class 绑定**不更新**（`.tags-field` 的 class 仍是 `form-field tags-field tags-empty`，
`.main-photo-wrap` 内仍是 `photo-placeholder`，`.main-memory-photo` / `.add-photo` 都不存在），
且 3s 后仍不变。**页面 data 是对的（`photos:1, tags:3`），渲染树不是。**
⇒ 因此**凡是靠 `setData` 造出来的「1 张照片」「有标签」截图一律不可信，本轮不用它们下任何判断**；
判断只基于**真实草稿**渲染出来的状态 + 文本类绑定（notes/date/rating 文字与实心星能正常更新）。
`.workbuddy-ai/scratch/opt-pass/` 里的 `F*` 系列即为此类混帧样本，**已在报告中排除**。

---

## 1. 最终光学审计（只列**当前渲染 UI 里可见**的问题）

| REGION | 观察到的光学问题 | 严重度 | 需要改? | 微调 |
|---|---|---|---|---|
| HEADER | **`.clear-draft` 的图标完全不显示**，只剩一个空圆片（PEARL + DUSK 都是）。渲染树只有 `morph-fallback`，**没有任何 morph-svg/canvas 层**；fallback 请求 `name="lucide-eraser"`，而 `utils/icons.js` 的别名表**没有** `lucide-eraser` ⇒ `iconSvg()` 返回 `''` ⇒ `<image wx:if="{{src}}">` 不渲染 | **高（可见缺陷）** | **否（超出本轮预算）** | 见 §10 遗留 |
| HEADER | 关闭按钮 ✕ 的圆片左缘比内容列外扩 ~5.5px | 无 | 否 | **概念图同样外扩**（概念里 × 圆片左缘也在照片左缘之外）⇒ 一致，不改 |
| HEADER | 标题/副标题左缘 59，表单内容左缘 22 | 无 | 否 | 关闭控件占位所致，概念一致 |
| IMPORT | 行高 50、左右内边距 24rpx、无边框无阴影；`import-entry-note` 20rpx/opacity .85 | 无 | **否** | brief 明确「Inspect only」；保持 secondary/quiet |
| PHOTO | 0 张态：占位框 384×245、圆角 40rpx、边框 `1rpx solid rgba(90,96,84,.12)`、+ 居中 | 无 | 否 | — |
| PHOTO | **1 张态（Edit/Remove/Add-more）本轮无法可信取证** | — | — | 见 §0 限制 2 |
| RESTAURANT + LOCATION | 输入框内边距 22rpx、清除 ✕ 88rpx 居中、pin + 名称 + 地址 | 无 | 否 | — |
| NOTES | 文本域内边距 22rpx（与输入框一致）、圆角 24rpx、min-height 120rpx | 无 | 否 | 两行文案放得下，不加大 |
| **DATE + RATING** | **并排两个控件高度不一致：Date 88rpx / Rating 框 90rpx**（Rating 框的下限必须是 88rpx 星 + 2×1rpx 边框 = 90rpx），两者**下缘差 1.3px** | **中（可见不一致）** | **是** | **OPTICAL-P0-1** |
| DATE + RATING | Date 文本内边距仅 6rpx，而其它输入框是 22rpx（差 ~8px） | 中 | **否** | 被冻结的五星预留**结构性**限制，见 §10 |
| TAGS | 0 标签态：标签左 + 「+」右同排（P1-B 设计）；「+」圆片 PEARL 下只有 Δlum≈17 的淡色，DUSK 下是清晰浅圆 | 低 | 否 | 「+」字形在两种主题下对比度都足够 ⇒ 可读性无损，不制造改动 |
| TAGS | 有标签态（标签在标签下方成列）本轮无法可信取证 | — | — | 见 §0 限制 2 |
| **MORE DETAILS** | 行有 `padding: 0 4rpx` ⇒ **标签比其它所有标签右移 4rpx**；雪佛龙 `margin-right: 14rpx` ⇒ **光学右缘落在内容列内约 5px**，与正下方的 Save 按钮**右缘不对齐** | **中（可见不一致）** | **是** | **OPTICAL-P0-2** |
| SAVE | READY 全宽 384×57、圆角 60rpx（胶囊）、图标→文字 gap 20rpx、下方 56rpx 呼吸 | 无 | 否 | 胶囊是 CTA 的角色圆角，与字段的 24rpx 是刻意区分 |
| BOTTOM NAV | tab-spacer 负责安全区/避让；Save 底 1312 与 tab bar 无重叠 | 无 | 否 | — |
| 圆角总表 | 照片/占位/Add-more 40rpx · 输入/文本域/Date/Rating/Import 24rpx · 标签 40rpx(胶囊) · Edit 37rpx(胶囊) · 「+」50% · Save 60rpx(胶囊) | 无 | 否 | 按角色分层，无意外不一致（除 §1 已列的 Date/Rating 高度） |
| 边框/表面总数 | 一屏内：照片占位 1 条、输入类 4 条 10% 细边、Import 无边框、标签 1rpx 边、「+」无边框 | 无 | 否 | 无「边框+阴影+模糊同时强」的元素 |

**入选 2 条**（brief 允许「只有 2–3 个就只修 2–3 个」）。

---

## 2. 选定的 OPTICAL-P0 改动

### OPTICAL-P0-1 — Date 与 Rating 并排两控件高度统一（`.date-input` 88rpx → 90rpx）

- **可见理由**：同一行、同一基线、同一表面语言的两个控件**下缘差 1.3px**（Date 50.0px / Rating 51.3px）。
- **为什么是改 Date 而不是改 Rating**：Rating 框的下限是 **90rpx**（88rpx 星盒 + 上下各 1rpx 边框），
  降到 88rpx 会让 88rpx 的星盒溢出边框；所以这一行里**约束更高的是 Rating 框**，Date 应当对齐它。
- **实测（428）**：`dateInput` h 50 → **51**，b 1095 → **1096**；`ratingInput` h 51.3，b **1096.3**
  ⇒ 下缘差 1.3px → **0.3px**。
- **未受影响**：`dateInputRpx 219` / `ratingInputRpx 443.3` / `starsOneLine true` / 五个星 top 全同 /
  `dateRatingRow` 高 108.3（label 的 `min-height:88rpx` 主导行高，未变）⇒ **冻结的 Rating 响应式契约完整**。

### OPTICAL-P0-2 — More details 行回到内容列（`padding: 0 4rpx` → `0`；雪佛龙 `margin-right: 14rpx` → `2rpx`）

- **可见理由**：① 该行标签比其它所有表单标签**右移 4rpx**；② 雪佛龙光学右缘落在内容列**内约 5px**，
  而它是 Save 正上方唯一的右缘标记，**与 Save 的右缘不对齐**。
- **为什么是 2rpx**：雪佛龙是**旋转 45° 的 12rpx 方块**，其视觉外接盒比布局盒每侧多出 ~2.5rpx
  （12rpx·√2/2 − 6rpx ≈ 2.5rpx）⇒ 2rpx 的 margin 正好把**光学右缘**落在内容缘上（406）。
- **实测（428）**：`.more-details-row` l22 r406（= 内容列），与 `.save-memory` l22 r406 一致。

---

## 3. 改动文件（仅 2 处 WXSS）

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/add/index.wxss` | L349 `.date-input` `min-height: 88rpx` → `90rpx`（+ 注释） |
| `miniprogram/pages/add/index.wxss` | L502 `.more-details-row` `padding: 0 4rpx` → `0`；L503 `.more-details-row::after` `margin: -6rpx 14rpx 0 0` → `margin: -6rpx 2rpx 0 0`（+ 注释） |

**未改**：`index.wxml`（哈希 `22913b40…` 与检查点一致，**逐字节未动**）、`index.js`（`b9a99be7…` 未动）、
任何其它页面/组件/工具。

---

## 4. before / final 截图

`.workbuddy-ai/scratch/opt-pass/`：

- **BEFORE**：`D3-bottom.png`（DUSK 底部）、`X1-photo-state.png`（PEARL 顶部）、
  `zoom-right-edge.png`（More details 雪佛龙 + Save 右缘，6×）、`zoom-daterating.png`（Date/Rating，5×）、
  `zoom-insets.png`（Notes vs Date 文本内边距，3×）
- **AFTER**：`A1-pearl-top.png`、`A2-pearl-mid.png`、`A3-pearl-bottom.png`、
  `A4-dusk-bottom.png`、`A5-dusk-top.png`、`A6-zh-bottom.png`、`A7-zh-top.png`、
  `after-bottom-zoom.png`（Date/Rating + Tags + More details + Save，2.6×）
- **参考**：`concept-add-top.png`、`concept-rating.png`、`concept-board.png`

**参考对比（concept vs before vs final）**：概念图第 3 屏与最终页在
①整体层级 ②首屏平衡 ③照片主导性 ④表单连续性 ⑤元数据密度 ⑥字排节奏 ⑦表面一致性
⑧图标打磨 ⑨CTA 终点 上一致；**差异全部是真实产品能力**（Import 行、More details 披露、标签、
geo 渐进披露、Rating 边框），brief 明确允许保留。

---

## 5. PEARL / DUSK

| | PEARL | DUSK |
|---|---|---|
| Date/Rating 高度统一 | ✓（51 / 51.3） | ✓（同一 CSS，几何相同） |
| More details 对齐 | ✓ l22 r406 | ✓ 同 |
| Import 行 | 浅色 wash `rgba(251,250,247,.52)`，无边框 | `rgba(238,234,227,.08)`，可见但安静 |
| 星（未选/已选） | 描边 `#898a84` / 实心 `#1b1c1a` | 描边 `#d7d1c7` / 实心 `#eeeae3` |
| Tags「+」 | 圆片 `rgba(212,212,208,.5)` 淡（Δlum≈17），**字形对比度足够** | 浅圆在深底上清晰 |
| Save | 深色胶囊 | 暖褐渐变胶囊 |
| 结论 | **两主题都成立**；DUSK 不是「更暗的 PEARL」（表面/边框/星/文字各自成体系） | 同上，无过度对比 |

---

## 6. 中文 / 英文

`A6-zh-bottom.png` / `A7-zh-top.png` 对照 `A3/A1`：中文下
`万能导入 / 分享文案 / 链接`、`你的评分 / 未评分`、`日期 / 选择日期`、`已评 N 星 · 清除评分`
均**单行不换行**、与英文共享同一套几何（Date 列 219rpx / Rating 列 443.3rpx / 行高 108.3px 不变）。
长中文与长英文都未破坏节奏。

---

## 7. 响应式结果

- **428（实测）**：Date 219rpx / Rating 443.3rpx / 星 88rpx / 五星单行（五个 top 全同 1045.7）。
- **320 / 375 / 390（按 rpx 模型推算）**：见 Round 5 报告，余量 +0.55…+0.74px 恒正，wrap = NO。
- **本轮改动只碰高度与 More details 行的水平内边距/margin，不涉及任何宽度或 `flex`** ⇒
  已建立的 Rating / Tags 换行 / Date / Import / location / Save 响应式契约**全部未动**。
- `verify-visual-language.cjs` 的五星产品级闸门仍 **PASS**。

---

## 8. 13 维最终评估

| # | 维度 | 结论 |
|---|---|---|
| 1 | 整体层级 | Header → Import → Photo → Restaurant+Location → Notes → Date+Rating → Tags+More details → Save，一眼可读 |
| 2 | 首屏平衡 | 照片（245px）主导；Import 50px 安静；标题衬线体统领 |
| 3 | 照片主导性 | 是（唯一带大图标的元素，宽高比 384×245） |
| 4 | 表单连续性 | 输入类共享 22rpx 内边距 / 24rpx 圆角 / 10% 细边 |
| 5 | 元数据密度 | Date+Rating 一行、Tags 胶囊、More details 折叠 ⇒ 低密度、安静 |
| 6 | 字排节奏 | 51/62 标题 → 26 副标 → 25 标签 → 27 字段 → 24 caption → 20 注脚，层级单调 |
| 7 | 表面一致性 | 无「边框+阴影+模糊同强」；Import 主动放弃 glass |
| 8 | 图标打磨 | ✕ / 铅笔 / 日历 / 星 / 「+」/ 雪佛龙 / Save 图标均居中；**唯 clear-draft 空圆片（§10）** |
| 9 | CTA 终点 | Save 深色胶囊、56rpx 上方呼吸、下方 tab 避让 ⇒ 唯一终点 |
| 10 | PEARL 平静度 | 高（浅 wash + 极淡边框 + 氛围照片 .12） |
| 11 | DUSK 平静度 | 高（无过度对比，暖褐 CTA） |
| 12 | 与概念相似度 | 高；差异均为真实能力（Import/More details/标签/geo/Rating 框） |
| 13 | 整体完成度 | 高；**仅剩 1 个可见缺陷**（clear-draft 图标，见 §10） |

---

## 9. 验证结果

| 套件 | 结果 |
|---|---|
| `verify-visual-language.cjs` | **EXIT 0**（10 条契约，含五星产品级闸门） |
| `verify-ui-quality.cjs` | **EXIT 0**（43/43） |
| `npm run verify`（verify-miniprogram） | **EXIT 0**（`FINAL STATIC VALIDATION: PASS`） |
| `npm run verify:all` | **EXIT 1 —— 唯一红点 = Add UI 注册闸门**（见下） |

**唯一红点（预期，非缺陷）**：`verify-cloud.cjs` 的 Add UI 注册链 ——
`add/index.wxss` 现为 `df572eae…`，检查点仍是 `337b92fa…`。
`add/index.wxml` 哈希**未变**（`22913b40…`，与检查点一致）。
⇒ 与之前每一轮一样，推进 `tools/add-page-review.json` 的 `sha256` 需要**单独授权**；**本轮未推进**。

---

## 10. 遗留 Add 缺口

### (A) `.clear-draft` 图标不显示 —— **唯一的可见缺陷**（本轮未修）

**证据（渲染树，非截图）**：`.clear-draft` 子树里只有
`morph-icon → .morph-box → .morph-fallback → <components/icon name="lucide-eraser">`，
**没有 `.morph-svg` / `.morph-canvas` 层**；而 `s-icon` 自己的 `<image>` 也没渲染。

**根因（精确）**：`miniprogram/utils/icons.js` 的别名表有 **28** 条 `lucide-*`（TabBar/morph-lab 用到的每一对都在），
**唯独没有 `lucide-eraser`**；`iconSvg()` 对未知名返回 `''` ⇒ fallback 的 `<image wx:if="{{src}}">` 永不渲染。
`components/morph-icon/index.wxml` 的 fallback 统一拼 `'lucide-' + name`，而页面传的是 `name="eraser"`。

**为什么本轮不改**：正确修法是给 `tools/icon-aliases.json` 加 `"lucide-eraser": "eraser"` 并重新生成
`miniprogram/utils/icons.js`（+ 更新 `tools/verify-icons.cjs` 里 `Object.keys(aliases).length === 28` 的断言与文案），
**属于图标注册表 + 闸门改动，超出本轮「micro / WXSS-first」预算**（brief 亦要求 "Avoid JS" / "Do not replace the icon system"）。

**影响面（诚实界定）**：当前模拟器运行时 morph 层不存在 ⇒ fallback 就是可见路径 ⇒ 用户看到空圆片。
真机上 morph 会绘制（TabBar morph 已证实可用），届时图标可见 ⇒ 这是**fallback 安全网损坏**，
不是 morph 本身损坏。

### (B) Date 文本内边距 6rpx vs 其它输入框 22rpx（约 8px 差）—— **接受的结构性权衡**

Date 列宽被**冻结的五星预留（444rpx）**限制为 219rpx；"Choose a date" 文本本身就要 165rpx，
加上图标 32rpx、内部 gap 6rpx、边框 2rpx，只剩 ~14rpx 可分配 ⇒ 每侧最多 ~7rpx。
**除非重开 Rating 响应式契约，否则无法与 22rpx 对齐**。本轮**不动**，作为已知权衡记录。

---

## 11. 一句话结论

**最终光学审计只找到 2 个可修的可见问题（Date/Rating 并排控件高度差 1.3px；More details 行标签与雪佛龙偏离内容列），
已按 micro 预算只改这两处 WXSS，冻结的 Rating 契约与 Import 模型完好。
页面其余部分已达「 optically resolved 」；唯一遗留可见缺陷是 `.clear-draft` 的空圆片（图标别名缺 `lucide-eraser`），
其修法属注册表 + 闸门改动，需单独授权。**
