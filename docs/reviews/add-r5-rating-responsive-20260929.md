# Add — Round 5 · Rating 响应式修正（2026-09-29）

**未 commit / 未 push / 未 deploy。UI 注册检查点未推进（本轮未获授权）。**
未触碰 Import。未新增 Rating 动效。未改 Rating 业务语义。

---

## 1. 回归根因（精确到选择器 + 源位置）

**不是 Round 3 / Round 4 的规则覆盖了 P1-A —— 是 P1-A 自己漏掉了一条本该被它取代的旧声明。**

`miniprogram/pages/add/index.wxss` 里 Date/Rating 存在**两层**声明：

**第一层（pre-P1-A，旧「两行布局」时代的响应式块，原 L309–313）**

| 选择器 | 声明 | P1-A 后是否还活着 |
|---|---|---|
| `.date-rating-row` | `flex-wrap:wrap;` | 死（P1-A 后来 `nowrap`） |
| `.date-rating-row > .form-field` | `flex:1 1 240rpx;` | 死（P1-A 后来重写 `flex`） |
| `.date-rating-row > .form-field:last-child` | `flex-basis:464rpx;` | 死（P1-A 的 `flex` 简写重置了 basis） |
| **`.rating-input`** | **`flex-wrap:wrap;`** | ⚠️ **活着** |

**第二层（P1-A，原 L505–509）** 重新声明了行与两列的 `flex`，并在 `.rating-input` 上补了
`padding-left/right` 与 `justify-content` —— **但没有重新声明 `flex-wrap`**。
同特异性、后者生效的规则**只覆盖它写了的属性**，所以第一层的 `flex-wrap:wrap` 成了**实际计算值**。

⇒ **根因 = `add/index.wxss` 的 `.rating-input { flex-wrap:wrap; }`（pre-P1-A 遗留）**，
被 P1-A 的 `.rating-input` 规则漏掉，从未被覆盖。

**它为什么真的会 wrap**：P1-A 把 Rating 列写成 `flex: 1 1 auto; min-width: 0`（**可收缩**），
Date 列写成 `flex: 0 1 auto`（也是可收缩）。行是 `nowrap`，所以当
`Date 的 max-content + gap + 440rpx > 内容宽` 时，flex 只能靠**收缩两列**来消化缺口 ——
缺口按 base 大小分摊，Rating 于是掉到 **436rpx < 442rpx**（440rpx 内容 + 2rpx 边框），
**第五颗星换行**。

**为什么 428 就会红（不是窄屏边界）**：rpx 与视口成比例 ⇒ 内容宽恒为 **672.9rpx**，
最宽的 Date 内容是**英文占位符 "Choose a date"（226.4rpx）**，所以缺口是
**固定 7.5rpx**，与屏宽无关。实测复现：

| 状态 | Date 列 | Rating 列 | 星星 top | 结果 |
|---|---|---|---|---|
| 空日期（"Choose a date"） | 226.4rpx | **436rpx** | `[438.3,438.3,438.3,438.3,**488.3**]` | **WRAP** |
| 已填日期（"2026-09-29"） | 211.7rpx | 450.7rpx | 五个相同 | 单行 |

⇒ 旧闸门 `verify-visual-language.cjs` 只断言了**字面量字符串** `flex:0 0 88rpx`
（CSS 注释里也写着这件事），**从未测量渲染后的行**，所以这个回归能悄悄通过。

---

## 2. 删除 / 合并的冲突规则

**做法：删掉旧的，不叠新的补丁。** 第一层的四条声明**全部删除**（前三条已被 P1-A 完全取代，
第四条是根因），并在原地留注释记录它们曾存在及其后果。**没有**再写一条「抵消规则」。

```
- .date-rating-row { flex-wrap:wrap; }                            (删除)
- .date-rating-row > .form-field { flex:1 1 240rpx; }              (删除)
- .date-rating-row > .form-field:last-child { flex-basis:464rpx; } (删除)
- .rating-input { flex-wrap:wrap; }                                (删除 — 根因)
  .rating-star { flex:0 0 88rpx; width:88rpx; height:88rpx; }      (保留：仍活着，且闸门钉它)
```

**验证**（去注释后统计）：`flex:1 1 240rpx` = 0 处、`flex-basis:464rpx` = 0 处；
`flex-wrap:wrap` 仅剩 **3 处且全部属于 Tags/chips**（`.tag-list` / `.suggested-tags` /
`.category-type-list`，**本来就该换行，不在本轮范围**）。
`.date-rating-row` 与 `.rating-input` 的**唯一**有效值是 `nowrap`。

### 最终唯一权威契约（`add/index.wxss` 末尾一个块）

```css
.date-rating-row { flex-wrap: nowrap; gap: 12rpx; margin-top: 25rpx; align-items: flex-start; }
.date-rating-row > .form-field { flex: 1 1 auto; min-width: 0; }              /* Date 吸收余量 */
.date-rating-row > .form-field:last-child { flex: 0 0 auto; min-width: 444rpx; } /* Rating 预留 */
.date-input { padding-left: 6rpx; padding-right: 6rpx; gap: 6rpx; }
.date-input > text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.rating-input { flex-wrap: nowrap; padding-left: 0; padding-right: 0; justify-content: flex-start; }
```

- **444rpx = 5×88rpx（星）+ 2×1rpx（框边框）+ 2rpx 余量**；`flex:0 0 auto` ⇒ 永不收缩。
- `min-width` 是**显式下限**，避免以后改表头/文案时被悄悄挤回去。
- 不用负 margin、不用绝对定位、不动 88rpx 命中区、不做任何坐标 hack。
- **`flex-wrap: nowrap` 使「换行」在结构上不可能发生** —— 这比「预留够宽」更强：
  即使极端情况下预留不足，失败模式也只是**溢出**，不会是「第五颗星掉到第二行」。

---

## 3. 生产 JS 是否改动 → **没有**

`pages/add/index.js` **零改动**。`onRating` 的行为本来就是正确的：

```js
onRating(event) { const value=Number(event.currentTarget.dataset.value);
  this.changeDraft('rating', value);
  this.changeDraft('ratingSource', value?'single':'unrated'); }
```

值**只来自被点中元素自己的 `data-value`**，没有任何坐标/最近星计算 ⇒ 邻星误选在结构上不可能。

---

## 4. rating / ratingSource 一致性核查

**取值集合**（全仓实测）：

| 值 | 由谁写 | 含义 |
|---|---|---|
| `'single'` | `onRating`（1–5）、`cloudRecords.js:73`（云端有 rating） | 用户/单值评分 |
| `'unrated'` | `onRating`（`data-value=0`，即 Clear）、`memoryRepository.js:26`（legacy 降级） | 显式未评分 |
| `'unrated-placeholder'` | `cloudRecords.js:73` | 云端无评分且无 legacy 票 |
| `'legacy-average'` | `cloudRecords.js:73` | 旧多维 `ratings` 平均 |

**关系**：`rating > 0 ⟺ 'single'`（对用户输入而言）；`rating === 0` 配 `'unrated'`。
`freshDraft()` **不含 `ratingSource` 键** ⇒ 全新草稿是 `undefined`；
保存时 `add/index.js:464` 归一化：`draft.ratingSource || (draft.rating ? 'single' : 'unrated')`。
下游：`cloudRecords.js:52`（rating 0 或无 'single' ⇒ 删除 rating）、`annualReport.js:10`
（要求 rating>0）、`syncRepository.js`（可同步字段）、`memoryRepository.js:26`。

**我发现的不一致（以及归属）**：**是我自己的探针造成的，不是生产缺陷。**
第一轮用 `setData` 只改 `draft.rating`、随后又用真实 tap 触发 `onRating`
（它**会**写 `ratingSource` 并**经 `changeDraft` → `store.saveDraft` 落盘**），
于是存储里的草稿一度变成 `rating:1 / ratingSource:'single'`，之后我把 rating 置回 0 却没管 source
⇒ `rating:0 / ratingSource:'single'`（不自洽）。

**处置**：用**生产路径**（`store.loadDraft()` → `store.saveDraft()` + `setData`）把草稿写回
**`rating:0 / ratingSource:'unrated'`**（App 自己对「清除评分」的表达），并核对
`restaurant:'111'` / `date:''` / `notes:''` / `tags:0` / `photos:0` 未变。
后续所有探针都**同时**设置/还原 `rating` 与 `ratingSource`。

⇒ **`rating 0` + `'unrated'` 与 `rating 0` + 无该键在所有下游行为上等价**
（`|| (rating ? … : 'unrated')` 两者都归一到 `'unrated'`）。**没有**引入新取值。

---

## 5. before → after 几何（428px，实测）

| 指标 | BEFORE（坏） | AFTER（修好） |
|---|---|---|
| 内容宽 | 384px = 672.9rpx | 同 |
| Date 列 | 226.4rpx（被内容撑开） | **219rpx**（= 余量，恒定） |
| Rating 列 | **436rpx** | **443.3rpx** |
| 列间距 | 10.5rpx | 10.5rpx（未动） |
| `.rating-input` 高 | **101.3px（两行）** | **51.33px（一行）** |
| 星星 top | `[438.3,438.3,438.3,438.3,**488.3**]` | **`[1045.67]×5`（全同）** |
| 星星 left | `[157.9,207.9,257.9,307.9,**157.9**]` | `[153.67,203.67,253.67,303.67,353.67]` |
| 行高 | **158.33px** | **108.33px** |
| 星目标 | 50×50px | 50×50px（**未变**） |
| 可换行 | YES | **NO** |

---

## 6. 响应式宽度矩阵

⚠️ **工具链限制（如实声明）**：本机自动化通道**没有**改视口宽度的能力 ——
`automation_viewport_action` 的 action 只有 `pageScrollTo | screenshot | stopAudits | remote | close`，
`compile_wxss` 只是编译摘要，DevTools 的模拟器机型是 IDE 私有设置（不在 `project.config.json`）。
⇒ **428px 是实测**；320 / 375 / 390 是**按 rpx 模型推算**（rpx 与视口成比例 ⇒ 预算恒定），
并用 428 的实测值校准模型。

| 视口 | 内容宽 | Date | Rating | 框内容区 | 5 星跨度 | 单星 | 余量 | 行高 | 换行 |
|---|---|---|---|---|---|---|---|---|---|
| 320 | 287.1 | 93.44 | 189.14 | 188.29 | 187.73 | 37.55 | **+0.55** | 80.98 | **NO** |
| 375 | 336.45 | 109.50 | 221.65 | 220.65 | 220.00 | 44.00 | **+0.65** | 94.90 | **NO** |
| 390 | 349.91 | 113.88 | 230.52 | 229.48 | 228.80 | 45.76 | **+0.68** | 98.70 | **NO** |
| **428（实测）** | **384.00** | **124.98** | **252.98** | **251.84** | 251.09 | **50.22** | **+0.74** | **108.33** | **NO** |

- 五个星星 top **完全一致**（428 实测：`1045.67 × 5`；zh 下 `1046.67 × 5`，仍全同）。
- 余量恒为正；且渲染器把 88rpx **向下取整**（428 下 50.197px → 实测 **50px**），
  实际跨度 250px、实际余量 **+1.9px** ⇒ 只会更安全。

---

## 7. 日期态（空 / 已填）

9 个组合全部实测（空/已填 × 未评/1星/4星/5星 × en/zh）：**Date 列恒为 219rpx、Rating 列恒为
443.3rpx、行高恒为 108.33px、`starsOneLine` 恒为 `true`**。

关键结构变化：Date 列**不再由内容撑开**（旧：空 226.4 / 已填 211.7），
而是**恒定取余量**；日期文案在框内自适应（`space-between` 吸收舍入）。
英文占位符需要 **165rpx**，可用 **167rpx** ⇒ **不截断**（余 2rpx）；
`text-overflow: ellipsis` 仅作**安全网**（异常字体时省略而不是与日历图标相撞）。
日历图标 32rpx 保留、无碰撞、无裁切；日期格式与语义未动。

---

## 8. 表头态（不得挤压星行）

实测（en / zh，未评 / 1星 / 4星 / 5星）：

| 项 | en | zh |
|---|---|---|
| 标签宽 | 124.5rpx | 98.1rpx |
| 清除/状态宽 | 87.6（Unrated）/ 203.9（1星）/ **210.6**（4–5星） | 87.6 / **202** |
| 表头最大内容 | 124.5 + 12 + 210.6 = **347.1rpx** | 98.1 + 12 + 202 = **312.1rpx** |
| 表头高 | **50px（单行，从不换行）** | 同 |
| 星行位置 | `starLefts` 在 9 个组合中**逐字节相同** | 同 |

⇒ 表头最宽 347.1rpx **远小于** Rating 列 443.3rpx ⇒ **表头不可能决定星行的最小宽度**；
表头与星行是**两个独立约束**，本轮未为表头牺牲任何星目标宽度。

---

## 9. 星星视觉尺寸决定 → **44rpx**（命中区仍 88rpx）

测了两个尺寸（WXML `s-icon size`，仅图标，不动目标）：

| 尺寸 | 渲染 | 占 88rpx 目标 | 概念图对比 |
|---|---|---|---|
| 原（已批准） | 37rpx → 21.1px | 42% | 偏小/偏弱 |
| 试 42rpx | 42rpx → 24.0px | 47.7% | — |
| **选用 44rpx** | **44rpx → 25.1px** | **50%** | **最接近概念** |

**概念图客观测量**（`docs/design/0.savor-concept.png` 第 3 屏，程序化取暗像素）：
星字形约 **12.5×11 px**、星间距（pitch）约 **21.5 px** ⇒ **星/框高 ≈ 0.52**；
App 在 44rpx 下为 25.1/51.3 = **0.49**，在 42rpx 下为 0.47。
⇒ 44rpx 是**两个测试值中更接近概念**的，且仍只是命中区的 **50%**（不是装饰性大星）。
未改颜色（选中实心 `--ink` / `#eeeae3`，未选描边 `none`），未加任何动效。

---

## 10. 五目标点击 + ratingSource（真实 tap 事件）

几何（428 实测）：`lefts = [153.67, 203.67, 253.67, 303.67, 353.67]`，`width = 50`，`top` 全同
⇒ **间距 50 == 宽度 50 ⇒ 五个 88rpx 盒首尾相接、零间隙、零重叠**。

| 点击 | 选择器 | rating | ratingSource | 结果 |
|---|---|---|---|---|
| 星 1 | `.rating-star[data-value="1"]` | 1 | `single` | **PASS** |
| 星 2 | `.rating-star[data-value="2"]` | 2 | `single` | **PASS** |
| 星 3 | `.rating-star[data-value="3"]` | 3 | `single` | **PASS** |
| 星 4 | `.rating-star[data-value="4"]` | 4 | `single` | **PASS** |
| 星 5 | `.rating-star[data-value="5"]` | 5 | `single` | **PASS** |
| Clear | `.rating-clear`（`data-value=0`） | 0 | **`unrated`** | **PASS** |

**边界（1/2、2/3、3/4、4/5）**：自动化通道只能对**元素**发起 tap（`--x/--y` 不是元素内偏移；
`:nth-child` 不被支持，实测被解析成第一颗星）。因此边界结论由**两条独立事实**给出：

1. **几何**：五盒 pitch == width（50 == 50）、`top` 全同 ⇒ **不存在重叠命中区**；
2. **处理器**：`onRating` 的值**只取被点元素自身的 `data-value`**，无最近星/坐标数学
   ⇒ 邻星误选**在结构上不可能**。

（此限制如实记录，不用合成坐标冒充边界点击。）

---

## 11. 回归确认（未动 Import）

| 项 | 结果 |
|---|---|
| Notes → Date/Rating 间距 | 未动（`.notes-field` / `.date-rating-row { margin-top:25rpx }` 原样） |
| P1-A 基线对齐 | **保持**：两列表头均 `min-height:88rpx`，`dateInputH 50px` / `ratingInputH 51.33px`，top 相同 |
| Clear Rating | PASS（`rating 0 / unrated`，88rpx 目标保留） |
| locked / saving | 未动（`.is-locked .date-input/.rating-input` 原样） |
| Round 3-A 静态态 | 未动 |
| Round 4 Rating 保持 STATIC | **保持**：`grep -c "is-on"` 仍为 0，未加任何 transition/animation |
| Tags 节奏 / More details / Save | 未动 |
| PEARL / DUSK / 中文 / 英文 | 见 §12 |
| Import | **完全未动** |

---

## 12. 截图

`.workbuddy-ai/scratch/round5-import/`：

- `before-pearl-4stars-row.png` —— **BEFORE 428px 坏态**（第五颗星在第二行，框高两行，日期框与评分框不再共底线）
- `after-pearl-4stars-row.png` —— **AFTER 428px**
- `after-pearl-unrated-row.png` —— 未评（5 描边星）
- `after-dusk-4stars-row.png` —— **DUSK**
- `after-zh-4stars-row.png` —— **中文**
- `row-42-row.png` / `row-44-row.png`、`row-42-stars.png` / `row-44-stars.png` —— 两个候选尺寸对比
- `concept-rating.png` / `concept-add.png` —— 概念图对照

⚠️ **AFTER 最窄宽度截图不可得** —— 见 §6 的工具链限制（无视口改宽能力）。
`before-*` / `after-*` 的裁剪区域相同（视口 y 424–547，缩放 4×），可直接叠图对比。

---

## 13. 改动的确切文件

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/add/index.wxss` | 删除 pre-P1-A 四条过期声明；把 Date/Rating 收敛为**一个**权威契约块；`.date-input` 内边距 12→6rpx、内部 gap 10→6rpx、新增 `> text` 省略号安全网 |
| `miniprogram/pages/add/index.wxml` | 仅 `s-icon name="star"` 的 `size="37"` → `size="44"`（一行） |
| `tools/verify-visual-language.cjs` | **新增**一条产品级回归闸门 |

`pages/add/index.js` **未改**。未改 Import / Notes / Tags / More details / Save / Restaurant / geo / Photo / tab bar。

---

## 14. 新增回归闸门（产品要求，不钉实现）

`tools/verify-visual-language.cjs` 新增：

> **`Add Rating keeps five independent 88rpx targets on one non-wrapping row`**

断言的是**契约**而不是某条 CSS 写法：从**去注释后**的 WXSS 里取**每个选择器的最后一条声明**
（= 真实级联），然后要求

1. 模板用**一个循环渲染恰好 5 个**目标（`[1,2,3,4,5]`）；
2. 每个目标 **88rpx × 88rpx** 且 `flex` 为 `0 0 88rpx`（保留的 88rpx 命中区要求）；
3. 星行 `flex-wrap` 的最终值为 **`nowrap`**（结构上不可能换行）；
4. Rating 列 `min-width` **≥ 5×88+2 = 442rpx**（**任何 ≥442 的取值都通过**，不钉 444）；
5. Date 列 `min-width: 0`（可收缩，永不会把 Rating 挤到下限以下）。

**RED 证明**（不碰生产文件，把旧级联文本回注到内存副本后重放同一组断言）：
- 当前（已修）CSS → **PASS**
- 修复前（含 `flex-wrap:wrap` + 可收缩 Rating 列）→ **FAIL**
  `the star row must never be able to wrap`（`'wrap' !== 'nowrap'`）

---

## 15. 验证结果

| 套件 | 结果 |
|---|---|
| `verify-visual-language.cjs` | **EXIT 0** —— 10 条契约通过（含新增 1 条） |
| `verify-ui-quality.cjs` | **EXIT 0** —— 43/43 |
| `verify-miniprogram.cjs`（`npm run verify`） | **EXIT 0** —— `FINAL STATIC VALIDATION: PASS`，359/359 |
| `verify-add-native-return` / `verify-add-identity-fence` / `verify-photo-batch-upload` / `verify-structure` / `verify-menu-copy` / `verify-package-budget` | 全部 **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0**（需 stdin shim；直接跑会因本机 EBUSY 假红） |
| `npm run verify:all` | **EXIT 1 —— 唯一红点 = Add UI 注册闸门**（见下） |

**唯一红点（预期，非缺陷）**：`verify-cloud.cjs:281` 的 UI 注册链 —— 本轮改了 Add 的
WXML/WXSS 但**未获授权推进检查点**：

| 文件 | 检查点现值 | 当前文件哈希 |
|---|---|---|
| `pages/add/index.wxml` | `be380a50…79f46ad` | **`22913b40…c762e54a`** |
| `pages/add/index.wxss` | `9e6c2a6a…8270111` | **`337b92fa…3e2b20`** |

⇒ 与 Round 4-A 一样，推进 `tools/add-page-review.json` 的两个 `sha256`
（`baseSha256` / `review` 不动）需要**单独授权**。本轮**未**推进。

---

## 16. 一句话结论

**回归根因是一条 pre-P1-A 的 `.rating-input { flex-wrap:wrap; }` 被 P1-A 漏掉、存活至今，
而 Rating 列又可收缩 ⇒ 空日期文案下 Rating 掉到 436rpx（差 7.5rpx）第五颗星换行 ——
在 428px 就已复现。已把过期声明删除（不叠补丁），改为「Rating 预留 444rpx、Date 吸收余量、
星行 nowrap」的唯一契约，五个 88rpx 目标原样保留，并加了一条产品级闸门锁住它。**
