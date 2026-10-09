# Add — Round 2 P1-B：Tags → More details → Save rhythm（2026-09-29）

**未 commit / 未 push / 未 deploy。** P1-A 未重访（Date/Rating 布局、clear 位置、星间距、88rpx 命中区全部冻结）。

---

## 1. STEP 1 — 改动前实测（视口 428×926pt，内容宽 384pt）

| # | 测量项 | 实测 | 分类 |
|---|---|---|---|
| 1 | Date/Rating 底 → Tags label | **18 pt** (32rpx) | **BREATHING** |
| 2 | Tags label → 第一个 chip 行 | **7 pt** | **NECESSARY**（form-field gap） |
| 3 | Tags 块高 · **0 tags** | **77 pt** | — |
| 3 | Tags 块高 · **1 tag** | **77 pt** | NECESSARY（chip 50pt + label 20pt + gap 7pt） |
| 3 | Tags 块高 · **3 tags** | **77 pt** | NECESSARY |
| 3 | Tags 块高 · **5 tags（换行）** | **133 pt** | NECESSARY（两行 chip） |
| 3 | Tags 块高 · **长中文 tag** | **77 pt** | NECESSARY |
| 3 | Tags 块高 · **长英文 tag** | **133 pt**（换行） | NECESSARY |
| 4 | Tags 底 → More details | **18 pt** | **BREATHING** |
| 5 | More details 行高 | **50 pt** | NECESSARY（88rpx 命中区） |
| 6 | More details → Save | **21 pt** | **BREATHING** |
| 7 | Save 按钮高 | **57 pt** (100rpx) | NECESSARY |
| 8 | Save → safe-area / tab clearance | 13 pt 到 `.tab-spacer`，spacer 本体 **158 pt** | NECESSARY |

**诊断**：三个 BREATHING 间隙是 **18 / 18 / 21** —— **几乎是平的**。所以层级完全读不出来，
页面读成「三段互不相关的区块」，Save 看起来只是 More details 之后的又一块。

**其余细节**：chip 与 `+` 都是 **50×50pt = 88×88rpx** ✓；`.tag-list` 换行正常、无横向裁切 ✓；
`.more-details` 是 50pt 的浅色行（muted caption + CSS chevron，无卡片、无阴影）✓。

## 2. 两个候选

**CANDIDATE 1（保守 —— 本轮实施）**
- **只重排三个过渡间隙**，让层级从间距本身读得出来：
  - Date/Rating → Tags：**18pt 不动**（元数据组 → 下一组）
  - Tags → More details：**18 → 10pt**（同属「可选附加」，收紧）
  - More details → Save：**21 → 31pt**（完成过渡，拉开）
- **零 tag 状态**：给 `.tags-field` 加条件类 `tags-empty`，让 label 与 `+` **共用一行**
  （`flex-direction: row; justify-content: space-between`）⇒ 不再是「孤零零一个 +」
- **不压缩任何东西**：尾部净增 ~3pt

**CANDIDATE 2（未实施）**
- 进一步压缩 Tags→More、并把 More details 行降到 44rpx（保留命中区但更薄）
- **未做**：Candidate 1 之后层级已可读，且 Candidate 2 会开始牺牲呼吸感。等视觉裁决。

## 3. 实施（2 个文件，纯 CSS + 一个条件类）

| 文件 | 改动 |
|---|---|
| `pages/add/index.wxss` | 追加 P1-B 块：`.tags-field{margin-top:32rpx}` · `.more-details{margin-top:18rpx}` · `.save-memory{margin-top:56rpx}` · `.tags-field.tags-empty{flex-direction:row;align-items:center;justify-content:space-between}` |
| `pages/add/index.wxml` | `class="form-field tags-field {{draft.tags.length ? '' : 'tags-empty'}}"`（**唯一结构改动**，只影响零 tag 状态的布局） |

**没有改**：Save 行为 / loading / disabled 语义 / upload / 按钮高度 / safe-area · tag 业务行为 ·
chip 尺寸 · 88rpx 命中区 · More details 的展开与错误自动展开 · P1-A 的一切。

## 4. 实测结果

| 指标 | P1-A | **P1-B** |
|---|---|---|
| Date/Rating 底 → Tags label | 18 pt | **18 pt**（未动） |
| Tags label → 第一个 chip 行 | 7 pt | **7 pt**（未动） |
| **Tags → More details** | 18 pt | **10 pt** |
| More details 行高 | 50 pt | **50 pt**（未动） |
| **More details → Save** | 21 pt | **31 pt** |
| Save 高 | 57 pt | **57 pt**（未动） |
| Save → tab spacer | 13 pt | **13 pt**（未动） |
| **零 tag 的 Tags 块高** | **77 pt** | **50 pt**（−27） |
| 1 / 3 tags 块高 | 77 pt | **77 pt**（未动） |
| 5 tags / 长英文 块高 | 133 pt | **133 pt**（未动） |

⇒ 层级变成 **18 / 10 / 31**，从间距就能读出「元数据组 → 可选附加 → 终点」。

## 5. 强制截图（同一 fixture / 视口 / 主题 / 固定滚动位）

`shots/p1b2-*.png` —— 全部在 scrollTop 固定值下拍摄：

| 状态 | 文件 | 结果 |
|---|---|---|
| 1. 0 tags | `p1b2-A-0tags.png` | label 与 `+` **同一行**，`+` 右对齐 ✓ |
| 2. 3 normal tags | `p1b2-C-3tags.png` | 一行 chip 组 ✓ |
| 3. many / wrapping | `p1b2-D-5tags-wrap.png` | 两行优雅换行 ✓ |
| 4. More details collapsed | 同 1–3 | 50pt 浅色行 ✓ |
| 5. More details expanded | `p1b2-G-more-open.png` | 展开正常 ✓ |
| 6. Save ready | 同 1–3 | 深色主 CTA ✓ |
| 7. Save disabled | `p1b2-H-save-disabled.png` | `businessFrozen` 态 ✓ |
| 长中文 tag | `shots/p1b-E-long-zh.png` | 单行不裁切 ✓ |
| 长英文 tag | `p1b2-F-long-en.png` | 换行不裁切 ✓ |

**连续上下文**：`p1b2-C-3tags.png` 单张内同时包含 **Date+Rating → Tags → More details → Save** ✓
（未为凑高度删任何内容。）

## 6. REFERENCE 对比

### ⚠️ 参考图更正（用户指出，我先前判断错误）

**我先前写「概念图不含 Tags/Save」是错的。** 我当时看的是 `concept-add.png`（一张裁切图，恰好止于 Date/Rating 的 label），
据此下了错误结论。

**全图 `docs/design/0.savor-concept.png`（1672×941，五屏）的第 3 屏（Add）完整包含：**

```
Notes            "Perfect late-night dinner. The duck was unforgettable."
Date   Aug 26, 2025 [calendar]        Rating  ★★★★★
Tags   [French] [Dinner] [Date Night] [+]
Save Memory      （深色主 CTA）
tab bar
```

⇒ **参考图里 Tags 与 Save 都在**，而且 **概念图里没有 "More details" 这一行**（顺序是 Date/Rating → Tags → Save）。

**教训（已写进记忆）**：**裁切图只能当放大镜，不能当构图依据**。判断「概念图里有没有某个区块」必须看全图。

### 概念图实测间距（`concept-add-tail5x.png`；Add 屏 335 概念 px = 750rpx ⇒ 1px ≈ 1.28pt）

| 过渡 | 概念图 | P1-B |
|---|---|---|
| Notes → Date/Rating | ~11.5 pt | 18 pt |
| Date/Rating → Tags | **~10.2 pt** | **18 pt** |
| Tags → Save | **~12.8 pt** | **31 pt**（经 More details） |

⇒ **概念图整体比我们紧得多，而且它没有 More details 行。** P1-B 的 18/10/31 是「有层级」的，
但绝对值比参考松 —— 尤其 Date/Rating → Tags（18 vs 10）。

**本轮不据此改动**（P1-B 已视觉批准并冻结，且指令明确「不要重访 P0/P1-A/P1-B」）。
这里只更正事实记录，供后续轮参考。

### 评估（对有参考的部分）

| 维度 | 判定 | 理由 |
|---|---|---|
| 1. Date/Rating → Tags 连续性 | **SAME** | 18pt 未动；P1-A 已批准（但比概念图的 ~10pt 松） |
| 2. Tags 紧凑度 | **BETTER** | 1–3 tags 一行 77pt；与概念图的 `[chip][chip][chip][+]` 语言一致 |
| 3. 零 tag 的刻意感 | **BETTER** | 从「孤立的 +」变成「Tags …… [+]」的标题行动作，且矮 27pt |
| 4. More details 视觉权重 | **SAME** | 50pt 浅色行，未加重（**概念图无此区块**，属已批准的新增） |
| 5. More details 可发现性 | **SAME** | 同 88rpx 行高 + chevron；靠 10pt 的收紧归入 Tags 簇 |
| 6. Save 终点清晰度 | **BETTER** | 31pt 完成过渡 + 57pt 深色 CTA，不再像「又一块」 |
| 7. 整体纵向节奏 | **BETTER** | 18/18/21（平）→ **18/10/31**（有层级） |
| 8. 概念相似度 | **SAME→BETTER** | Tags 语言一致；但我们的尾部多一行 More details，且整体间距比概念松 |

## 7. Verification

| 套件 | 结果 |
|---|---|
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0** |
| `verify-structure.cjs` | **EXIT 0** |
| `verify-add-native-return` / `verify-add-identity-fence` / `verify-dining-types` / `verify-menu-copy` | 全 **EXIT 0** |
| `verify-cloud.cjs` | **EXIT 1 —— 预期内** |

**`verify-cloud` 的红点就是 UI 注册闸门**：`add/index.wxml` 实际 `9be7906748f1b9f9dd7ac4b09be887520e66fd59fe9c1110afbddc67f08e4b95`
≠ 检查点 `a0a44171e871e63dcdaa7cb9bb00977201c13bd4a54018a7db30ff028c15a11a`（P1-A 的值）。
按指令 **「visual approval 之前不得更新注册哈希」**，所以**未推进**。其余套件全绿。

## 8. STOP

按指令停在这里：**未开始 motion，未重访 Import，未动 Home/Map/Us/Me，未更新注册哈希**。

等你视觉裁决：
1. Candidate 1 是否接受（还是要 Candidate 2）
2. 接受后再授权推进 `add/index.wxml` / `add/index.wxss` 的注册哈希
