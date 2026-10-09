# Add — Round 2 P1-A：Date + Rating rhythm（2026-09-29）

**未 commit / 未 push / 未 deploy。** P0 未再改动（除本轮的 Date/Rating 区块）。

---

## 1. AUDIT（改动前实测；视口 428×926pt，内容宽 384pt）

| 属性 | 实测值 |
|---|---|
| **`.date-rating-row` 总高** | **230 pt** |
| **Notes → metadata 间距** | **14 pt**（Notes 底 279 → row 顶 283… 实测 296+95=391 → 405） |
| **label → control 间距** | **7 pt** |
| **Date 列宽** | **384 pt**（整行宽 —— **该行在换行**） |
| **Rating 列宽** | **384 pt**（整行宽 —— 同一行换行） |
| **star 尺寸 / 命中区** | **50 × 50 pt = 88 × 88 rpx**（`verify-visual-language.cjs` 钉住） |
| **star 间距** | 左 31 / 110 / 189 / 268 / 347 → **pitch 79pt、间隙 29pt**（`space-between` 摊满 384pt） |
| `.rating-clear` | **独占 50pt 竖行**，卡在 Rating label 与星星之间 |
| 行高构成 | 77（Date）+ **18（row-gap）** + 135（Rating）= 230 ✓ |

**换行的根因**：`.date-rating-row > .form-field { flex:1 1 240rpx }` +
`:last-child { flex-basis:464rpx }` + `gap:32rpx` ⇒ **240 + 464 + 32 = 736rpx > 673rpx 可用** ⇒ `flex-wrap:wrap` 把它拆成两个上下独立的小节。

**浪费**：换行本身、18pt 的 row-gap、以及 `rating-clear` 那 50pt + 7pt = **57pt** 的专属竖行。

## 2. 两个候选（未做大规模选项矩阵）

**CANDIDATE 1（保守 —— 本轮实施）**
- 行不换行：Date `flex: 0 1 auto` + `min-width: 0`，Rating `flex: 1 1 auto` + `min-width: 0`（Rating 拿更宽）
- `rating-clear` 并入 **Rating header 行**（右侧），不再占竖行
- 星星不再摊满 384pt：Rating 列变窄后自然成为**紧凑星组**
- 日期控件只让出 padding、rating 框只让出自身 inset ⇒ **两个控件都没有缩小**
- **预期 108pt**

**CANDIDATE 2（更紧，本轮未做）**
- 再把 header 行压到 20pt（`rating-clear` 用绝对定位）⇒ 预期 77pt
- 未采用：会让 88rpx 的 clear 命中区与星星顶部重叠，违反「保留命中区」

## 3. 实施（2 个文件）

| 文件 | 改动 |
|---|---|
| `pages/add/index.wxss` | 追加 P1-A 块：`.date-rating-row{flex-wrap:nowrap;gap:12rpx;margin-top:25rpx;align-items:flex-start}`、两个子项 `min-width:0` + 非对称 flex、`.date-input` 只改左右 padding 22→12rpx、`.rating-input` padding 归零 + `justify-content:flex-start`、`.rating-head`（88rpx 行高、space-between）、`.date-rating-row > .form-field > .form-label` 也拿到 88rpx 行高（**这是让两个控件共基线的原因**）、`.rating-clear{margin:0}` |
| `pages/add/index.wxml` | Rating 字段的 label 与 `rating-clear` 包进一个 `<view class="rating-head">`（**唯一的结构改动**；handler / 文案 / aria / 88rpx 命中区全部不变） |

**没有改**：touch target、date 行为、rating 状态与交互语义、Notes、geo disclosure、More details、Import、Photo、Header、tab bar、Tags、Save、motion。

## 4. 实测结果（同一 fixture / 视口 / 主题 / 滚动基准）

| 指标 | P0 | **P1-A** |
|---|---|---|
| **`.date-rating-row` 总高** | 230 pt | **108 pt**（−122，−53%） |
| **是否换行** | **是**（两个 `.form-field` 都是 w=384） | **否**（两个都 top=405，left 22 / 145） |
| **Date 列宽** | 384 | **117** |
| **Rating 列宽** | 384 | **262** |
| **star 命中区** | 88×88 rpx | **88×88 rpx（未变）** |
| **star 间距** | pitch 79 / gap 29（摊满） | **pitch 50 / gap 0（紧凑星组）** |
| `.date-input` / `.rating-input` top | 310 / 462（**错开 152pt**） | **462 / 462（共基线）** |
| `rating-clear` | 独占竖行，top 405，h50 | **header 行内右侧**，box `left 286, top 405, w 120, h 50`，**与星星零重叠** |
| Notes → row 间距 | 14 pt | **14 pt（按要求未动）** |
| label → control 间距 | 7 pt | **7 pt（按要求未动）** |

**clear-rating 可访问性**：同一个 `bindtap="onRating"`、同一份文案、`min-width/min-height: 88rpx` 全部保留；
它现在与 label 同行（`justify-content: space-between`），**不再占用专属 50pt 竖行**，且命中区完整落在 88rpx 的 header 行内 ⇒ 不会盖到星星。

**星级视觉**：`<s-icon size="37">`（视觉 21pt）仍在 50pt 命中框内 —— 视觉尺寸与命中区本就不同，本轮**未动**。

## 5. 对比（REFERENCE / P0 / P1-A）

`.workbuddy-ai/scratch/ui-refinement-audit/p1-comparison.png`
（三栏对齐在同一「Notes」基准上；REFERENCE = `docs/design/0.savor-concept.png` 的 Add 屏）

| 维度 | 判定 |
|---|---|
| 1. Notes → metadata 连续性 | **BETTER** —— P0 是 Notes→Date→控件→Your rating→清除→星星（4 段）；P1-A 是 Notes→(Date+Your rating+清除)→(控件+星星)，一段 |
| 2. Date / Rating 分组 | **BETTER** —— 从两个上下独立小节变成一行；两个控件共基线（462/462） |
| 3. 控件可读性 | **SAME** —— 字号 / 颜色 / 边框 / 圆角未动；日期控件只少了左右 padding |
| 4. 触控舒适度 | **SAME** —— 88rpx 星星、88rpx 清除全部保留 |
| 5. 垂直密度 | **BETTER** —— 230 → 108pt |
| 6. 概念相似度 | **BETTER** —— 概念图就是 `Date … Rating` 同行 + 控件同行 |
| 7. 整体 calmness | **BETTER** —— 少了两段独立小节和 18pt 的 row-gap |

## 6. Verification

| 套件 | 结果 |
|---|---|
| `verify-visual-language.cjs` | **9/9 PASS**（`flex:0 0 88rpx` 仍在，88rpx 控制约定未被破坏） |
| `verify-ui-quality.cjs` | **43/43 PASS** |
| `verify-icons.cjs` | **PASS**（模板 `<s-icon>` 计数未变） |
| `verify-structure.cjs` | **6/6 PASS** |
| `verify-cloud.cjs` | **EXIT 1 —— 唯一红点** |

**唯一红点是 UI 注册闸门**：`pages/add/index.wxml` 实际 `a0a44171e871e63dcdaa7cb9bb00977201c13bd4a54018a7db30ff028c15a11a` ≠ 批准值 `816e836d405841dd37c779590b1e18c291c82d3b5d0e5259d7174c3ef2eb84f6`。
**这不是 P1-A 引入的** —— P0 之后它就已经是红的（P0 也改了同一个 WXML）。**未自行推进哈希**，等用户授权。

## 7. STOP

按指令停在这里。**未触碰 Tags / Save / motion**，未开始 candidate 2。

---

## 8. P1-A 视觉批准 + UI 注册检查点推进（2026-09-29）

用户裁决：**KEEP Candidate 1（实测 108pt）**，**不实施 Candidate 2**。理由（用户原话归纳）：
结构问题已解决（不换行 / 同一行 / 共基线 / 紧凑星组 / 88rpx 星与清除命中区都保留 /
Notes→metadata 与 label→control 间距未变）；剩下那 ~31pt 理论收益不值得引入命中区重叠风险或视觉压缩。
**P1-A 冻结。**

### 检查点归属（先定位，再改）

`verify-cloud.cjs` 的 UI 注册链顺序：`ui-baseline` → `ui-approved-updates` → `visual-refinements`
→ `map-frame-review` → **`add-page-review`** → `ux-remediation` → `home-identity` → `map-identity`
→ `me-profile` → `us-identity` → `stage6-refactor` → **末端断言「链结果 == 磁盘实际哈希」**。

对 Add 页两个文件，链上出现的位置是：

| 文件 | 链上环节 |
|---|---|
| `pages/add/index.wxml` | `ui-approved-updates` → **`add-page-review`（最后一环）** |
| `pages/add/index.wxss` | `ui-approved-updates` → `visual-refinements` → **`add-page-review`（最后一环）** |

⇒ **两个文件的最后一环都是 `tools/add-page-review.json`** ⇒ 只推进它的 `sha256`，
**所有 `baseSha256` 原样不动**（这是最省改法，链自然解开）。

### OLD → NEW

| 文件 | OLD `sha256` | NEW `sha256` |
|---|---|---|
| `miniprogram/pages/add/index.wxml` | `816e836d405841dd37c779590b1e18c291c82d3b5d0e5259d7174c3ef2eb84f6` | `a0a44171e871e63dcdaa7cb9bb00977201c13bd4a54018a7db30ff028c15a11a` |
| `miniprogram/pages/add/index.wxss` | `cfa2af3955b8f41e9e70a824b4710c84b2af9118b5e398f5c5991ac49ba8f606` | `75b7f54901ac2a23c6f793ce2406ea0440357f7e6bee187d1ae454a7026f6330` |

`baseSha256`（wxml `816e836d…` / wxss `cfa2af39…`）**均未改动**。

### 授权范围（已写进两个条目的 `reason`）

仅限两轮已批准的 Add 改动：
- **P0** = 紧凑的有效地点摘要 · geo 渐进披露（含错误驱动展开）· 低频业务元数据移入折叠的 More details
- **P1-A** = Date/Rating 不换行（384pt 内容宽下 Date 117pt / Rating 262pt）· 两控件共基线 ·
  clear-rating 移到 Rating header 行 · 五个星星成紧凑组且 88rpx 命中区全部保留

**不覆盖任何无关 UI 漂移。**

⚠️ `add-page-review.json` 的 `review` 字段被 `verify-cloud.cjs` **硬断言**为
`docs/reviews/add-page-lifecycle-20260922.md` ⇒ **保持不动**（改它等于改闸门），
新证据通过 `reason` 文本指向 `docs/reviews/tabbar-phase2e-20260928.md`（P0）与本文件（P1-A）。
**未削弱、未删除任何注册闸门。** 改前已备份到 `.workbuddy-ai/scratch/ui-refinement-audit/add-page-review.json.bak`。

## 9. 本轮只改了 1 个文件

`tools/add-page-review.json`（`git status --short` 只有它）。
**生产 Add UI 三个文件在本步骤中零改动** —— `index.wxml` / `index.wxss` 哈希与推进前逐字节相同，
`index.js` 仍是 P0 时的 `30b7b83f…`。

## 10. 剩余的 Add 视觉差距（留给 P1-B 及以后）

用 P0 实测 + P1-A 的 −122pt 推算（视口 926pt，1pt 折合）：

| 区块 | P0 | **P1-A 后** |
|---|---|---|
| Restaurant | 496 | 496 |
| location 摘要 | 573（h70） | 573 |
| Notes | 661 | 661 |
| Date + Rating | 770（h230） | 770（**h108**） |
| Tags | 1018 | **~896** |
| More details | 1113 | **~991** |
| **Save Memory** | 1184 | **~1063** |

⇒ **Save 仍在首屏（926pt）之下约 137pt** —— 这是 **P1-B（Tags → Save rhythm）** 的目标。

其它仍未对齐概念图的点：
1. **Import 行仍在**（header 与照片之间，~50pt）。概念图没有这一行。本轮未动。
2. **More details 行是新增的**（概念图没有）—— 但这是 P0 已批准的设计，不是缺陷。
3. Tags 到 Save 之间目前是 `Tags → More details → Save`，三段各自独立的间距，节奏未整理。

**本轮不处理这些。**

