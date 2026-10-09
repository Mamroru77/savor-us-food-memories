# ME — P1-2：二级菜单图标去重（图标语义专项）

**日期**：2026-10-01
**基线**：`0de3e46`（工作树本就不干净）。**未 commit / 未 push / 未 deploy。**
**结论**：11 个二级菜单行现在**各占一个不同图标**；只改「图标名 + 2 个官方 SVG + 生成产物」，
**WXML / WXSS / 导航 / 文案 / 行几何 零改动**。
**建议**：**READY FOR VISUAL APPROVAL**

---

## 1. 完整的当前菜单 / 图标清单（以**渲染结果**为准）

运行时读取（`getCurrentPages()` 的 `data.menuRows` + 渲染树 `.profile-menu`）确认：
菜单是**一个** `wx:for="{{menuRows}}"`，渲染出 **11 行**，与 `MENU_ROWS` **逐行一致** ——
**没有** `MENU_ROWS` 之外的菜单行（WXML 里全页只有 1 个 `wx:for`）。

| # | EN | ZH | 目的地 / 动作 | 图标（修复前） | 家族 | SVG 来源 | 重复于 | 语义契合 | 处理 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Cloud tools | 云端工具 | `navigateTo /pages/workspace/index` | **archive** | Lucide | `archive.svg` | **#2, #8** | 弱（archive=收纳盒，不表「云」） | **REVISE** |
| 2 | Annual reports | 年度报告 | `navigateTo /pages/reports/index` | **archive** | Lucide | `archive.svg` | **#1, #8** | 弱（报告≠收纳盒） | **REVISE** |
| 3 | Shared space & wishlist | 双人空间与 Wishlist | `navigateTo /pages/space/index` | users | Lucide | `users.svg` | — | 好（两个人） | KEEP |
| 4 | Account & legacy data | 账号与旧数据 | `navigateTo /pages/account/index` | **shield-check** | Lucide | `shield-check.svg` | **#9** | 中（分区/备份/恢复=受保护） | KEEP（碰撞由 #9 让位解除） |
| 5 | Sync status | 同步状态 | sheet `sync` | arrow-up-from-line | Lucide | `arrow-up-from-line.svg` | — | 好（上行/待发送） | KEEP |
| 6 | Personalize | 个性化 | sheet `personalize` | pencil | Lucide | `pencil.svg` | — | 好（编辑） | KEEP |
| 7 | Preferences | 偏好 | sheet `preferences` | utensils | Lucide | `utensils.svg` | — | 好（饮食偏好） | KEEP |
| 8 | Memories | 回忆库 | sheet `library` | **archive** | Lucide | `archive.svg` | **#1, #2** | 弱（与「回忆收藏」不贴） | **REVISE** |
| 9 | Privacy | 隐私 | sheet `privacy` | **shield-check** | Lucide | `shield-check.svg` | **#4** | 中（盾=保护，但与 #4 同形） | **REVISE** |
| 10 | Settings | 设置 | sheet `settings` | settings | Lucide | `settings.svg` | — | 好（齿轮） | KEEP |
| 11 | Help & Feedback | 帮助与反馈 | sheet `help` | circle-question-mark | Lucide | `circle-question-mark.svg` | — | 好（问号） | KEEP |

目的地来源：`pages/me/index.js` 的 `onMenuRow`（`workspace`/`reports`/`space`/`account` → `navigateTo`，其余 → `openSheet`）。**未改动。**

## 2. 重复问题分类

| 类别 | 发现 |
|---|---|
| **A. EXACT DUPLICATE** | **`archive` × 3**（#1 Cloud tools / #2 Annual reports / #8 Memories）· **`shield-check` × 2**（#4 Account & legacy data / #9 Privacy） |
| **B. VISUAL DUPLICATE** | **无。** 其余 6 个（`users` / `arrow-up-from-line` / `pencil` / `utensils` / `settings` / `circle-question-mark`）剪影互不相同，**不做强制修改**。 |

渲染尺寸下的剪影：`archive` 是「带一条横线的方盒」，三行完全同形（渲染树里三行的 `<image src>` data-URI **逐字节相同**）。
`shield-check` 同理。这正是用户描述的「同一图标 / 难以快速区分」。

> 顺带（**不在本次范围，未改**）：`user-round` 已被 TabBar 的 Me 标签使用，`user`/`user-round` 也是头像占位图。
> 因此本次**刻意不给 Account 行分配人形图标**，避免与同一屏的 TabBar 头像同形。

## 3. 候选映射表（语义优先，不从「好看」倒推）

| 菜单 | 语义概念 | 候选 A | 候选 B | 选定 | 为什么 |
|---|---|---|---|---|---|
| **Cloud tools** | 私有云工作区（备份/恢复/工单） | `cloud`（新） | `hard-drive`（新） | **`cloud`** | 行标题字面就是 “Cloud tools”；`hard-drive` 说「本地磁盘」而非云 |
| **Annual reports** | 一年的报告与里程碑 | `calendar-days`（已注册） | `notebook-pen`（已注册） | **`calendar-days`** | 页面 eyebrow 是 “SAVOR / YOUR YEAR”；`notebook-pen` 在 22px 下与 #6 `pencil` 同属「笔」形 ⇒ 会制造新的 **B 类**问题 |
| **Memories** | 回忆收藏（导出/备份/导入） | `library`（新） | `image`（已注册） | **`library`** | 该行打开的表单**本身就叫 `library`**，文案是 “Your memories. A beautiful collection.”；书架＝收藏，比「一张照片」更贴「导出/备份/导入」 |
| **Privacy** | 隐私 / 上锁的数据 | `lock-keyhole`（已注册） | 保留 `shield-check` | **`lock-keyhole`** | 语义指南「Privacy / data protection → shield / lock」；让 #9 从 `shield-check` 让位即可**解除碰撞且不新增资产** |

**未改的 7 行**：`users` / `shield-check`（Account）/ `arrow-up-from-line` / `pencil` / `utensils` / `settings` / `circle-question-mark`。

**「文字消失」测试**（brief 的判据，逐行自查）：

| 行 | 去掉文字后这个符号还指向该目的地吗？ |
|---|---|
| Cloud tools | ✅ 云 ⇒ 云端工具 |
| Annual reports | ✅ 日历 ⇒ 一年/报告 |
| Memories | ⚠️ 书架 ⇒ 「收藏」。**这是本组里最不自我解释的一个**，见 §11 |
| Privacy | ✅ 挂锁 ⇒ 隐私 |
| 其余 7 行 | ✅ 均指向明确 |

## 4. 最终选定映射（`MENU ROW → CANONICAL ICON`）

| # | MENU ROW | CANONICAL ICON |
|---|---|---|
| 1 | Cloud tools | **cloud** |
| 2 | Annual reports | **calendar-days** |
| 3 | Shared space & wishlist | users |
| 4 | Account & legacy data | shield-check |
| 5 | Sync status | arrow-up-from-line |
| 6 | Personalize | pencil |
| 7 | Preferences | utensils |
| 8 | Memories | **library** |
| 9 | Privacy | **lock-keyhole** |
| 10 | Settings | settings |
| 11 | Help & Feedback | circle-question-mark |

**11 行 → 11 个互不相同的 canonical 图标。** 没有任何两行**故意**共用图标，因此**无需**走 brief 的「STOP 并解释」分支。

## 5. Morphicons / Lucide 来源证明

只用了 **2 个新图标**，都是**官方 Lucide 原始 SVG**，经**既有生成器**入库，未手改任何路径：

| ICON NAME | SOURCE FAMILY | SOURCE URL（SOURCES.json 记录） | 本地 SHA-256 |
|---|---|---|---|
| `cloud` | Lucide（Morphicons-compatible） | `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/cloud.svg` | `28a34022ed00177eb1f218eea5d2b7af30d09b529187fe32219e4dd8ea2b9740` |
| `library` | Lucide（Morphicons-compatible） | `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/library.svg` | `892ba1bd1ee2e5bba320eea1c30c83ed83055ded5a0a0c0e7e4ee5fb06c307a5` |

- 入库路径：`miniprogram/images/icons/lucide/{cloud,library}.svg`（与既有 49 个**同一目录、同一头部格式**，逐字节同构）。
- 来源清单：`tools/assets/icons/lucide/SOURCES.json`（+2 条，含 url 与 sha256）。
- **别名**：本次**未新增别名**。canonical 名与 `lucide-*` 别名分列：`cloud`/`library` 是 **canonical**（无别名）；
  既有 29 个 `lucide-*` 别名**一个都没有改名或删除**（`verify-icons.cjs` 断言 `icons[alias] === icons[canonical]`）。
- `verify-icons.cjs` 对**每一个** source 断言：url 必须是官方 raw 地址、**本地文件 sha256 必须等于记录值**、
  生成节点必须等于从该 SVG 解析出的节点、`iconSvg()` 必须含 `stroke-width="1.75"`。⇒ 来源是**被程序证明**的，不是自述。

## 6. 改动文件

| 文件 | 变化 | 性质 |
|---|---|---|
| `miniprogram/images/icons/lucide/cloud.svg` | **新增**（275 B） | 官方 SVG 资产 |
| `miniprogram/images/icons/lucide/library.svg` | **新增**（304 B） | 官方 SVG 资产 |
| `tools/assets/icons/lucide/SOURCES.json` | +2 条来源记录 | 来源清单 |
| `tools/assets/icons/lucide/SOURCES.md` | 计数 48→51、28→29（**原有数字已过期**）+ 本轮说明 | 文档 |
| `miniprogram/utils/icons.js` | **生成**（+cloud +library） | 生成产物 |
| `miniprogram/utils/lucideMorphNodes.js` | **生成**（+2） | 生成产物 |
| `tools/_gen/icons.json` | **生成**（+2） | 生成产物 |
| **`miniprogram/pages/me/index.js`** | **`MENU_ROWS` 的 4 个 `icon:` 值**（cloud / calendar-days / library / lock-keyhole） | **唯一的生产逻辑改动** |
| `tools/verify-icons.cjs` | 计数 49→51 + 输出文案 | 闸门 |
| `tools/verify-me-menu-icons.cjs` | **新增**（图标语义守卫） | 闸门 |
| `tools/verify-menu-copy.cjs` | 1 条断言**改口径**（见 §12） | 闸门 |
| `tools/fixtures/moved-build-sources.json` | 2 条 `SOURCES.*` 的 bytes/sha256 | 闸门 fixture |
| `package.json` | 注册 `verify:me-menu-icons` 并插入 `verify:all` | 脚本 |

**未改**：`pages/me/index.wxml`、`pages/me/index.wxss`、行几何、chevron、标题/副标题文案、菜单顺序、
导航目标与处理器、设置架构、本地化、动效。**未触碰 Us / Map / Add / Home。**

## 7. 生成器结果

`node tools/build-icons.cjs`（**既有生成器，未绕过**）：

```
Generated 51 official shapes + 29 compatibility names (no duplicate geometry source).
```

对三个生成产物做**前后逐键 diff**：

| 产物 | added | removed | changed |
|---|---|---|---|
| `tools/_gen/icons.json` | `['cloud','library']` | `[]` | `[]` |
| `miniprogram/utils/lucideMorphNodes.js` | `['cloud','library']` | `[]` | `[]` |
| `miniprogram/utils/icons.js` | `['cloud','library']` | `[]` | `[]` |

⇒ **只有新增**：没有既有图标的几何被改写、没有别名被改名或删除。
`verify-icons.cjs` 还会**再跑一次生成器并逐字节比对**，断言 drift = 0。

## 8. Before / After 证据

- **PEARL before/after 并排**：`.workbuddy-ai/scratch/me-p12/compare-pearl.png`
- BEFORE（PEARL）：`before-pearl.png` / `before-pearl-b.png`（+ `*-zoom.png` 2×）
- AFTER（PEARL）：`after-pearl.png` / `after-pearl-b.png`（+ `*-zoom.png` 2×）
- AFTER（DUSK）：`after-dusk.png`（+ `after-dusk-zoom.png` 2×）

截图在 **428×926 逻辑视口**（dpr 3，截图 374×809，缩放 0.8738）；菜单 11 行 × 77px 高，分上下两段截全。
**图标在放大图里逐行可辨**（22 逻辑 px ⇒ 放大后 ~38px）。

| # | BEFORE 图标 | AFTER 图标 |
|---|---|---|
| 1 Cloud tools | archive（方盒） | **cloud（云）** |
| 2 Annual reports | archive（方盒，与 #1 相同） | **calendar-days（日历）** |
| 3 Shared space & wishlist | users | users |
| 4 Account & legacy data | shield-check | shield-check |
| 5 Sync status | arrow-up-from-line | arrow-up-from-line |
| 6 Personalize | pencil | pencil |
| 7 Preferences | utensils | utensils |
| 8 Memories | archive（方盒，与 #1/#2 相同） | **library（书架）** |
| 9 Privacy | shield-check（与 #4 相同） | **lock-keyhole（挂锁）** |
| 10 Settings | settings | settings |
| 11 Help & Feedback | circle-question-mark | circle-question-mark |

## 9. PEARL / DUSK 结果

| 检查 | 结果 |
|---|---|
| 图标家族 / 描边系统 | 全部 Lucide 官方形状，`stroke-width 1.75`、`stroke-linecap/linejoin: round`、同一 `viewBox 0 0 24 24`（生成器统一） |
| 渲染盒 | 全部 `size="40"`（22×22 逻辑 px）⇒ 边界框、光学对齐一致 |
| 颜色令牌 | 全部 `{{dusk ? '#eeeae3' : '#1b1c1a'}}` ⇒ PEARL/DUSK 行为一致 |
| 有没有实心图标混入 | **没有**（全部 outline，`fill="none"`） |
| DUSK 细节丢失 | **没有** —— 云、日历网格、挂锁、齿轮、书架在 DUSK 下内部细节都清晰 |
| PEARL 是否过淡 | **没有** —— `#1b1c1a` on `rgba(251,250,247,.82)`，与其它行同色 |
| 有没有某一行比邻居更重 | **没有**（同一 stroke、同一盒、同一色） |
| **未使用任何逐行 CSS 补偿** | 正确 —— 无 per-row 样式改动 |

## 10. 唯一性断言结果

`tools/verify-me-menu-icons.cjs`（**新增**，已入 `verify:all`）：

```
PASS 11 Me secondary-menu rows each resolve to a distinct registered icon
     Cloud tools -> cloud
     Annual reports -> calendar-days
     Shared space & wishlist -> users
     Account & legacy data -> shield-check
     Sync status -> arrow-up-from-line
     Personalize -> pencil
     Preferences -> utensils
     Memories -> library
     Privacy -> lock-keyhole
     Settings -> settings
     Help & Feedback -> circle-question-mark
PASS every lucide-* alias resolves to its canonical non-empty shape
PASS generated icon output matches tools/build-icons.cjs (no hand-edited glyphs)
```

守卫覆盖 brief 要求的 5 项，并**覆盖「完整渲染菜单」而非只有 `MENU_ROWS`**：

1. 每个渲染行都有图标（`row.icon` 必须是非空字符串）；
2. 每个图标都注册且有**真实几何**（`icons[name]` 非空 + `iconSvg()` 解码后含形状元素 + canonical 必须是官方注册形状）；
3. **canonical 图标在 11 行之间唯一**（重复即 `assert.fail` 并点名两行）；
4. 没有任何别名解析成空 SVG；
5. 生成器输出仍与 `build-icons.cjs` 一致（重跑 + 逐字节比对）。

**「完整渲染菜单」的覆盖方式**（结构断言，不靠行号）：全页**只有 1 个 `wx:for`**、它**必须**迭代 `menuRows`、
行图标绑定 `name="{{item.icon}}"` **恰好 1 处**、`menuRows: MENU_ROWS` 必须存在于初始 data。
若将来有人**在 `MENU_ROWS` 之外**再生成菜单行，这几个计数就会变 ⇒ 守卫会红。
守卫还**钉住已批准的 title → icon 映射**（行改名或偷偷换图标 ⇒ 失败，必须重新评审）。

**RED 证明**（把 4 个 icon 值还原成修复前）：`AssertionError: two Me menu rows share the same icon glyph "archive": "Cloud tools" and "Annual reports"` ⇒ 还原后 GREEN。

## 11. 语义评估（只判 brief 的 8 项）

| # | 判据 | 结论 | 依据 |
|---|---|---|---|
| 1 | 语义准确性 | **BETTER** | 三处重复被替换为**各自专属**的隐喻（云 / 日历 / 书架），隐私从「盾」换成更直白的「锁」 |
| 2 | 行间可区分性 | **BETTER** | 11 行 11 个 canonical 图标；修复前有 3 行同形 + 2 行同形 |
| 3 | 小尺寸可读性 | **BETTER** | 全部 22px 下可辨；**唯一保留意见**：`library`（书架）在小尺寸下更像「竖条/柱状」，是本组里最不自我解释的一个（候选 `image` 更直白，但语义偏向「单张照片」） |
| 4 | 描边一致性 | **SAME** | 同一生成器的 `stroke-width 1.75`，官方属性未改 |
| 5 | 光学重量一致性 | **SAME** | 同 `size="40"`、同 `viewBox`、同颜色令牌；无逐行补偿 |
| 6 | PEARL 清晰度 | **BETTER** | 见 §9 / AFTER 截图 |
| 7 | DUSK 清晰度 | **BETTER** | 见 §9 / AFTER 截图；无实心、无细节丢失 |
| 8 | 整列扫读性 | **BETTER** | 每行图标现在都能在**读文字之前**给出目的地线索 |

**没有**做额外的 Me 审计；**没有**动 §6 列出的任何禁改区域。

## 12. 验证结果

| 命令 | 结果 |
|---|---|
| `verify:icons` | **EXIT 0** — 51 official SVGs, 29 aliases（逐 source 证明 url/sha256/节点/stroke） |
| `verify:me-menu-icons`（新增） | **EXIT 0** — 11 行 11 个不同图标；别名无空解析；生成器 drift 0 |
| `verify:memory-return` | **EXIT 0 — 13/13**（**不受影响**，它不依赖 Me 的整文件闸门） |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:ui` | EXIT 0 — 44/44 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:package-budget` | EXIT 0 — 5/5（包体仍在预算内） |
| `verify:cloud` | **EXIT 0 — 272/272**（Me 的 wxml/wxss 哈希**未变**，链未断） |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 0**（0 FAIL，含新守卫） |
| **`verify:menu-copy`** | ⚠️ **当前 EXIT 1** —— 见下 |

### ⚠️ 唯一一处需要你批准的红：`pages/me/index.js` 的整文件评审闸门

`tools/lib/reviewed-me-memory-return.cjs` 把 `pages/me/index.js` 的 **整文件 SHA-256** 钉在
`e694190111f07b2afc999da19aac483eae2fc9dcddb8f02c8f8be43b4385b491`；改 `MENU_ROWS` 后变成
**`efc70e5c48362c241f70fade1e600f8616c6682647a2bc013ae6892f4d6632dc`** ⇒ `verify:menu-copy` 报
`Me source differs from exact reviewed A+menu integration`。

该闸门的**设计意图**正是「除 `MENU_ROWS` 外的每一行都必须与已评审版本逐字节相同，菜单块允许演进」
（它会把当前 `MENU_ROWS` 投影到历史 fixture 上）。本次**只改了 `MENU_ROWS` 里的 4 个 `icon:` 值**，
意图完全满足，但整文件哈希必须推进 —— 而**按本仓库铁律，我不会自行刷新这个哈希**，等你批准。

为了证明「其余全绿」，我做了一次**可逆的临时推进**：把 `approvedSha256` 指向新哈希 → 跑完
`verify:menu-copy` / `verify:cloud`(272/272) / `verify`(358/358) / `verify:all`(EXIT 0) →
**立即从备份还原**，并核对回到 `e694190111f0…`。**当前工作树：未推进。**

### 被改口径的既有断言（**改口径，不是删掉**）

`tools/verify-menu-copy.cjs` 原来断言 `MENU_ROWS` 的 **`icon` 与 `sheet` 都与历史 fixture 相同**。
图标本次**合法地变了**，所以该断言改为：

- **保留** `sheet`（目的地）的 fixture 比对 ⇒ 菜单的**路由、数量、顺序**仍被钉住；
- 图标映射交给**新守卫** `verify-me-menu-icons.cjs` 负责（它还额外证明唯一性与官方来源）；
- `console.log` 文案同步更新，并在代码里写明这是 re-scope 而非 removal。

### 另外两个「数字型」闸门已随事实更新（不是放宽）

- `tools/verify-icons.cjs`：`49 → 51`（per-source 的 url/sha256/节点/stroke 断言一条未减）。
- `tools/fixtures/moved-build-sources.json`：`SOURCES.json` / `SOURCES.md` 的 `bytes`+`sha256`
  （这两个文件是**图标注册表的清单**，本来就会随批准的新图标增长；fixture 的 `note` 已写明这一点，
  其余 4 个 build source 与 11 个运行时 PNG 的摘要**仍冻结在搬迁时刻**）。

## 13. Me 检查点影响

- **`pages/me/index.wxml` 与 `pages/me/index.wxss` 逐字节未变** ⇒ **Me 的 UI 注册检查点未推进、也不需要推进。**
  `verify:cloud` 的 UI 哈希链 **272/272 全绿**，即证明这一点。
- 需要推进的**只有** `tools/lib/reviewed-me-memory-return.cjs` 的 `approvedSha256`
  （`e694190111f0…` → `efc70e5c4836…`），**等你批准**。
- 该闸门不是 UI 注册检查点，而是**「除菜单块外逐字节未变」的评审契约**。

---

## 14. 本轮明确没做的事

- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未改 Me 的 WXML / WXSS / 行几何 / chevron / 文案 / 顺序 / 导航目标与处理器 / 设置架构 / 本地化 / 动效
- ❌ 未触碰 Us / Map / Add / Home（未重开任何已冻结页）
- ❌ 未引入位图 / emoji / Unicode 符号 / 手绘一次性 SVG / 第二个图标库 / 内联 path hack
- ❌ 未绕过生成器；未手改生成产物
- ❌ 未新增或改名任何 `lucide-*` 别名
- ❌ 未做第二次 Me 审计、未做额外的 Me 打磨

## 15. 最终建议

**READY FOR VISUAL APPROVAL**

11 行 → 11 个互不相同的官方 Lucide 图标；语义映射逐行论证；PEARL/DUSK 双主题渲染已验证；
生成器 drift 0；新增语义守卫带 RED 证明；UI 检查点零影响。
**唯一未决项 = §12 的 `pages/me/index.js` 整文件评审哈希**，按铁律等你批准后再推进。

---

# 16. 结项：视觉已批准 + 评审哈希推进（2026-10-01）

**ME-P1-2 已视觉批准。** 最终图标映射**逐行保留**（§4），**不做第二次选图标**。
§12 记录的 `verify:menu-copy` 红点已按批准授权收口。本节取代 §12 的「等你批准」。

## 16.1 已批准的映射（保留，勿改）

| # | MENU ROW | CANONICAL ICON |
|---|---|---|
| 1 | Cloud tools | cloud |
| 2 | Annual reports | calendar-days |
| 3 | Shared space & wishlist | users |
| 4 | Account & legacy data | shield-check |
| 5 | Sync status | arrow-up-from-line |
| 6 | Personalize | pencil |
| 7 | Preferences | utensils |
| 8 | Memories | library |
| 9 | Privacy | lock-keyhole |
| 10 | Settings | settings |
| 11 | Help & Feedback | circle-question-mark |

**11 行 → 11 个互不相同的已注册 canonical 图标。**
保留：行几何 / 图标尺寸 / 描边粗细 / 图文间距 / PEARL 处理 / DUSK 处理 / 菜单顺序 / 标签与副标题 / chevron。
**不得**为图标偏好替换 Sync status。

## 16.2 检查点推进：`tools/lib/reviewed-me-memory-return.cjs`

**唯一改动 = 一行哈希字面量**（`git diff` 逐字核对）：

| | 值 |
|---|---|
| **OLD reviewed `approvedSha256`** | `e694190111f07b2afc999da19aac483eae2fc9dcddb8f02c8f8be43b4385b491` |
| **LIVE `pages/me/index.js` sha256** | `efc70e5c48362c241f70fade1e600f8616c6682647a2bc013ae6892f4d6632dc` |

**未削弱守卫**：`assert.equal(sha256(source), approvedSha256, 'Me source differs from exact reviewed A+menu integration')` 原样保留；
**仍然只允许一个哈希**；`menuPattern`、fixture 投影、`module.exports` 全部未动；**未新增 reason 字段**（该文件没有 reason/history 字段，
按「Do not redesign this review helper」只改哈希；批准范围记录在本文件与 `docs/reviews/` 中）。
**未修改历史 fixture**：`tools/fixtures/regression/lifecycle-review-20260916/.../me/index.js` 逐字节未动。

### 「只改了批准范围内的东西」的**决定性证明**

把 live 文件里的 **4 个 `icon:` 值**逐字回退（`cloud→archive`、`calendar-days→archive`、`library→archive`、`lock-keyhole→shield-check`）
得到的结果与 `git show HEAD:miniprogram/pages/me/index.js` **逐字节相同**，且其 sha256 恰好等于
**旧的 `approvedSha256` = `e694190111f07b2afc999da19aac483eae2fc9dcddb8f02c8f8be43b4385b491`**。

⇒ **live 文件与上一版已评审 Me 状态之间的差异，就只有这 4 个 `icon:` 值。**

> ⚠️ 过程中踩到并记录：`MENU_ROWS` 里第 1–2 行是 `icon:'x',sheet:'y'` 紧凑写法，
> 第 8–9 行是 `icon: 'x', sheet: 'y'` 带空格写法 ⇒ 用单一模式做回退**只回退了一半**，会得出「改动不止 4 个值」的**假结论**。
> 回退脚本必须按**实际字面量**逐行匹配。

## 16.3 生产完整性

| 文件 | 哈希 | 结果 |
|---|---|---|
| `pages/me/index.js` | `efc70e5c48362c241f70fade1e600f8616c6682647a2bc013ae6892f4d6632dc` | **== 已批准的 P1-2 状态，收口期间未变** |
| `pages/me/index.wxml` | `af025665…` | **未改**（= `tools/me-profile-review.json` 注册值） |
| `pages/me/index.wxss` | `4f287a95…` | **未改**（= `tools/me-profile-review.json` 注册值） |

未触碰 Home / Map / Add / Us / 共享 locale / Map P0-1 / P0-2；**未替换任何其它图标**。

## 16.4 图标来源完整性

| 检查 | 结果 |
|---|---|
| `cloud` 来自已批准的 Lucide SVG 源 | ✅ `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/cloud.svg`，本地 sha256 == 记录值 |
| `library` 来自已批准的 Lucide SVG 源 | ✅ 同上（`library.svg`），本地 sha256 == 记录值 |
| 生成注册表可复现 | ✅ `verify-icons.cjs` 重跑 `build-icons.cjs` 并**逐字节比对**，drift = 0 |
| 未删除任何别名 | ✅ 29 个别名全在（含 `lucide-eraser`） |
| 未改任何 canonical 图标几何 | ✅ 生成产物前后 diff：`changed = []`（只有 added `cloud`,`library`） |
| 生成器 drift | ✅ 0 |
| 每个 Me 二级菜单图标解析到非空 SVG | ✅ 11/11 |
| **canonical 唯一性** | ✅ **11 行 → 11 个 canonical 名 → 11 个唯一值** |

## 16.5 验证（**全部转绿，无需任何临时哈希操作**）

| 命令 | 结果 |
|---|---|
| `verify:me-menu-icons` | **EXIT 0** — 11 行 11 个不同图标；无空解析；生成器 drift 0 |
| `verify:icons` | **EXIT 0** — 51 official SVGs / 29 aliases |
| **`verify:menu-copy`**（原红点） | **EXIT 0** — 已接受批准的 Me JS |
| `verify:memory-return` | **EXIT 0 — 13/13** |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:ui` | EXIT 0 — 44/44 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:package-budget` | EXIT 0 — 5/5 |
| `verify:cloud` | **EXIT 0 — 272/272**（Me 的 wxml/wxss 哈希未变，UI 链未断） |
| `npm run verify` | **EXIT 0 — 358/358，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 0**（56 顶层脚本，0 FAIL） |

**没有任何红点残留**，因此**未修改任何生产 UI** 去迎合闸门。

## 16.6 最终状态

**ME-P1-2 — CLOSED**
**ME — FROZEN AGAIN**

该菜单**不得**因以下原因重开：换一套图标 / 为偏好替换 Sync status / 改图标尺寸 / 改行距 /
加实心图标底 / 给单个图标上色 / 改菜单顺序 —— **除非发现可复现的可用性或语义问题**。

**未 commit / 未 push / 未 deploy。**
