# Add — Round 3-A：静态表单状态完整性（2026-09-29）

**未 commit / 未 push / 未 deploy。** P0 / P1-A / P1-B 全部冻结未动（本轮只碰状态呈现，不碰布局节奏）。
**未加任何 motion**：无 transition / spring / morph / fade / scale（`.more-details-row::after` 的既有
`transition: transform` 属 P0 遗留，未新增）。

---

## 1. STATE AUDIT MATRIX

真机实测（视口 428×926pt）。`CURRENT VISUAL SIGNAL` 一栏以**像素证据**为准。

| CONTROL | STATE | CURRENT VISUAL SIGNAL | PROBLEM | CHANGE |
|---|---|---|---|---|
| Restaurant | RESTING | 1rpx 浅边 + `--field` 底；文字 `--ink` | — | NO |
| Restaurant | FOCUSED | `.is-focused` = `inset 0 0 0 2rpx var(--muted)`；像素差 Δ103（窄带，即字段四周） | 可见；但与 ERROR 环**同权重**（仅色相差） | NO |
| Restaurant | FILLED | 同 RESTING（文字 `--ink`） | 无（不该「永远 active」） | NO |
| Restaurant | **ERROR** | 2rpx `#994d3d` 环 **＋ `.form-error.field-error` 卡片**（padding 20rpx / radius 20rpx / 染色底） | 单字段消息渲染成**页面级 banner** | **YES → P0-1** |
| Restaurant | **DISABLED** | **完全没有**（`app.wxss` 与 add 页 WXSS 里无任何 disabled 规则） | 状态不可见 | **YES → P0-2** |
| Notes | 同上 5 态 | 同 Restaurant（共用 `.form-input/.form-textarea`） | 同上 | YES（共享） |
| Date | RESTING / FILLED | `.date-input` 边+底，文字 `--ink` | — | NO |
| Date | DISABLED | 无 | 共享 P0-2 | YES（共享） |
| Rating | UNSET | 星 `fill="none"`，色 `#898a84` | 可读 | NO |
| Rating | SELECTED | 星 `fill` = `--ink` | 可读 | NO |
| Rating | CLEAR AFFORDANCE | `.rating-clear` 文本链（P1-A 移到 header 行） | 已批准 | NO |
| Tags | 0 tags | P1-B 同行 `Tags …… [+]` | 已批准 | NO |
| Tags | SELECTED / WRAPPING | `.tag` 浅灰渐变 chip；换行正常 | 已批准（注：与 `.category-type.is-selected` 的深色填充语言不同，见 §8） | NO |
| Location summary | VALID / COLLAPSED | 名称+地址 + `Edit` 文本链 | 已批准 | NO |
| Location summary | ERROR | `.location-entry.has-error` 环 + 同一张 `.form-error.field-error` 卡片 | 共享 P0-1 | YES（共享） |
| More details | COLLAPSED | muted 行 + chevron | 已批准 | NO |
| More details | EXPANDED | 仅 `::after` 旋转 | 已批准 | NO |
| More details | **ERROR-FORCED** | **与用户手动展开完全相同**（CSS 里 collapsed/expanded 唯一差异是 `::after` 的 transform） | 看不出「是被错误强制展开的」 | **YES → P0-3** |
| 全部 | DUSK | `.dusk .has-error` → `#ffc0aa`；`--muted` → `#b6b2aa`；`.dusk .form-error` 有独立配色 | 环与卡片在 dusk 都成立 | NO |

**为什么没选更多**：FOCUS 虽然与 ERROR 同权重，但 ERROR 额外带消息，两者可区分（不构成
「hard to distinguish」）；FILLED 无异常；Rating / Tags / Location 的正常态都清晰。
按指令**不制造工作**。

## 2. 选定的 STATE-P0（3 个）

### STATE-P0-1 — 单字段错误消息被渲染成页面级 banner
**证据**：WXML 用 `class="form-error field-error"`。`.form-error` 提供 `padding:20rpx 22rpx; border-radius:20rpx;
background:rgba(245,218,208,.5)`；`.field-error` 只覆写 `margin`。⇒ 一条「这个字段错了」的消息长得和
「保存失败」的整表 banner **一模一样**，还在每个错误下多出约 38pt 的色块。
**修**：`.form-error.field-error` 改成**纯内联 caption**（同错误色、无底/无 padding/无圆角），
`.form-error` 单独保留卡片给整表级失败。**同一个颜色，不加新 token。**

### STATE-P0-2 — DISABLED 完全没有视觉信号
**证据**：全仓无任何 `disabled` 样式规则；Restaurant 字段 resting vs disabled 的自身像素差仅
`(56,57,55) → (53,54,52)`（布局位移不计）。
**修**：`.memory-form` 用**既有数据**投一个类（`{{saving || uploading ? 'is-locked' : ''}}`，无新 JS 状态），
WXSS 给 `label` 转 muted、字段底**回收一档**；**文字保持满对比**——用表面与标签承载状态，**不用 opacity**。

### STATE-P0-3 — 错误强制展开的 More details 行无信号
**证据**：CSS 中 collapsed/expanded 的唯一差异是 `.more-details-row::after` 的 `transform`；错误只加在
body 里的 perCapita 字段上。滚过去的用户无法知道该区块是被**替他**展开的、且里面有错。
**修**：`fieldErrors.perCapita` 存在时给 `.more-details` 加 `is-error`，行文字取**既有错误色**。

## 3. 改动文件（**2 个，都在 scope 内**）

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/add/index.wxml` | 2 处**类投射**：`.memory-form {{saving \|\| uploading ? 'is-locked' : ''}}`；`.more-details … {{fieldErrors.perCapita ? 'is-error' : ''}}` |
| `miniprogram/pages/add/index.wxss` | 新增 `.add-screen .form-error.field-error`（P0-1）、`.is-locked` + `.dusk .is-locked`（P0-2）、`.more-details.is-error .more-details-row` + `.dusk` 覆写（P0-3） |

**零 JS 改动**；无新 token；无重构；无新组件。

### ⚠️ 一处被我撤回的越界改动

我最初把 P0-1 的规则写进**全局 `app.wxss`**。随后发现 `form-error field-error` 还被
**`components/profile-editor`（Me）** 与 **`components/sheet`** 使用 —— 都在本轮 scope 之外。
⇒ 已**撤回 `app.wxss`**（哈希回到批准值 `c817ec8a…`），把同一条规则**收窄成 `.add-screen .form-error.field-error`
放进 add 页自己的 WXSS**。本轮影响面因此严格限制在 Add 页。

## 4. 截图

`shots/r3a2-{pearl,dusk}-{error-caption,locked,more-forced}.png`（6 张）+ 合成图
`r3a-fixes-light-dusk.png`。审计期基线 `shots/r3a-*.png`（12 态）。
**错误态全部用真实 fixture 达成**（`fieldErrors` 走 `showFieldError` 同一路径 / `saving:true` 真值），
**没有用纯 CSS 假造**。

| 必拍项 | 覆盖 |
|---|---|
| resting / focused / filled / error / disabled | `r3a-resting / focused / error / disabled` + `r3a2-*-error-caption` / `-locked` |
| Rating unset vs selected | `r3a-rating-unset` / `r3a-rating-selected` |
| Tags 0 vs selected | `r3a-tags-zero` / `r3a-tags-selected` |
| location valid vs error-expanded | `r3a-location-valid` / `r3a-location-error` |
| More details collapsed vs error-forced | `r3a-more-collapsed` / `r3a2-*-more-forced` |

## 5. Light / Dusk 结果

| 改动 | PEARL | DUSK |
|---|---|---|
| P0-1 内联 caption | 砖红 caption 贴在字段下，不再是色块 ✓ | `#ffc0aa` caption，在深底上可读 ✓ |
| P0-2 locked | label 转 muted、字段底回收；**值仍是满对比** ✓ | 底 `rgba(255,255,255,.03)`；值仍满对比 ✓ |
| P0-3 is-error 行 | 「The little details」转砖红 ✓ | 转 `#ffc0aa` ✓ |

三者**在两种主题下都保持可读且层级不变**；未做全应用 Dusk 重设计。

## 6. 8 维评估

| 维度 | 判定 | 具体理由 |
|---|---|---|
| 1. Focus recognizability | **SAME** | 未改；像素差 Δ103 证明原本就可见 |
| 2. Focus vs error distinction | **BETTER** | 错误现在多了「内联 caption 紧贴字段」这一层，focus 只有环 ⇒ 层级拉开 |
| 3. Filled-state calmness | **SAME** | 未改（filled 本就不带 active 外观） |
| 4. Selected-state clarity | **SAME** | Rating / Tags / Location 未改 |
| 5. Disabled readability | **BETTER** | 原本**零信号**；现在 label+底承载状态，文字仍满对比（未用 opacity） |
| 6. Error-message relationship | **BETTER** | 消息从「独立色块」变成字段的 caption，与出错字段的关系变成空间+颜色双重 |
| 7. Cross-control consistency | **BETTER** | 字段级 vs 整表级错误终于有区分；locked 对 4 类字段一致生效 |
| 8. Dusk consistency | **SAME** | 三处都有 dusk 覆写且实测可读 |

## 7. Verification

| 套件 | 结果 |
|---|---|
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0** |
| `verify-structure.cjs` | **EXIT 0** |
| `verify-add-native-return` / `verify-add-identity-fence` / `verify-photo-batch-upload` / `verify-dining-types` / `verify-menu-copy` | 全 **EXIT 0** |
| `npm run verify` | **FINAL STATIC VALIDATION: PASS** |
| `verify-cloud.cjs` | **EXIT 1 —— 预期内** |

**唯一红点 = UI 注册闸门**：`pages/add/index.wxml` 实际 `84d70f2a75fde18c…` ≠ 检查点 `9be79067…`（P1-B 的值）。
按指令 **「visual approval 之前不得更新注册哈希」，未推进**。
✅ `miniprogram/app.wxss` 已回到批准值 `c817ec8a…`（撤回越界改动后不再出现在红点里）。

**本轮改动面**（`git status --short`）：`pages/add/index.{wxml,wxss}` 两个生产文件 + `tools/add-page-review.json`（P1-B 步骤留下的，本轮未再动）。

## 8. 剩余状态缺口（本轮**不修**）

1. **Tags chip 与 dining-type chip 的「选中」语言不一致**：`.tag` 用浅灰渐变，`.category-type.is-selected`
   用深色填充（`#293b31`）。同一语义两种表现。属**跨控件一致性**，但两者在不同上下文（已选标签 vs
   可选类型），且 dining-type 的深色是 P0 已批准的设计 ⇒ 未动。
2. **FOCUS 与 ERROR 环同权重**（都是 2rpx inset）。当前靠「错误多一条 caption」区分，够用；
   若将来觉得不够，可让 focus 环更淡或 error 环加一点底，但**本轮不改**。
3. **Date / Rating 的 disabled** 已随 `.is-locked` 生效，但 `.rating-star` 的 `disabled` 依赖外层
   `saving||uploading` 判断（星星本身没有 disabled 属性）⇒ 交互被 `onRating` 的既有守卫拦住，
   视觉靠 `.is-locked` 的字段底。未加星级专属禁用态。
4. **More details 展开后**若 body 内其他字段（cuisine / dishes）未来新增校验，`is-error` 只认 `perCapita`；
   届时需同步扩展（当前 `perCapita` 是唯一会阻断保存的字段，已在 P0 审计确认）。
