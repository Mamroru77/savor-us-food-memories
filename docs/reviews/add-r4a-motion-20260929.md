# Add — Round 4-A PRODUCT MOTION CLOSEOUT（2026-09-29）

**未 commit / 未 push / 未 deploy。UI 注册检查点未推进。**

> **Frame-level recording unavailable in current toolchain.**
> `simulator_screenshot` 的 `--wait` 最小 1s ⇒ 截图通道无法采样 140–220ms 的过渡；
> `fields({computedStyle})` 在本运行时路径下不回调；CLI 无录像工具（`auto-replay` 是测试用例回放，不是录屏）。
> **这是工具限制，不当作产品失败。** 已停止构建任何证明基建。

---

## 1. 使用的观察方法

**直接在产品层观察 + 状态事实核验**，不做插值数学证明、不做亮度推断、不建新 harness：

1. 在**活的模拟器**上真实触发每个交互（`setData` 走与业务同一条状态路径），逐个状态截图
2. 读**真实渲染几何**（`boundingClientRect`）回答「有没有跳 / 尺寸有没有变」
3. 跑**快速连点**并检查**最终状态是否正确**
4. 跑 **Quiet**（`reduceMotion:true`）确认终态与可理解性
5. 静态代码 / token 核对 + 回归验证

**证据**：`shots/r4a-live/` **24 张**（PEARL 8 + DUSK 8 + QUIET 6 + 2 张 rapid-after）
+ `r4a-live-observation.json` + 合成图 `r4a-live-states.png`。

**另：R4-A 早期的 18 张端点截图**在 `shots/r4a-{pearl,dusk}-*.png`。

---

## 2. SAVE —— 观察结果

**真实状态（截图 + 几何）**

| 状态 | 按钮 |
|---|---|
| READY | 深色「Save Memory」+ 笔形图标 |
| WORKING | **变淡（ghosted）+ spinner +「Saving memory…」** |
| SUCCESS | 仍 ghosted + spinner +「Saving memory…」（`saving` 尚未置回；成功文案在页顶进度条） |
| FAILURE | **回到全亮深色「Save Memory」** + 上方出现「Save failed. Your draft is kept.」 |

**几何**：`.save-memory` 在 READY 与 WORKING 的 rect **完全一致** ⇒ `geometryStable: true`
⇒ **无尺寸变化、无布局跳动** ✓（PEARL / DUSK 均如此）

**回答四问**
- A 连续感：表面在 深→淡→深 之间变化，与 label/icon 的切换同时发生；**几何全程不动**
- B 闪烁/跳动：**几何测量未见跳动**；截图未见闪烁
- C 是否更清楚：变淡 + spinner + 文案三者同时表达「正在保存」
- D 去掉会不会一样好：去掉后按钮会在深/淡之间**硬切**；保留至少让表面变化是渐进的

**⚠️ 我无法回答的部分**：220ms 的**渐变本身**好不好看 —— 我没有录像，**看不见动画**。
按 brief「Do not attempt to prove opacity numerically」，不做数值证明。

### 判定：**KEEP（建议）—— 状态 PROVISIONAL**
理由（**基于事实，不含体感**）：几何稳定、状态语义正确、失败后自然回到可操作态、
连点受既有 `saveLock` 保护（R3-B2 已实测）。**表面渐变本身未经我目视确认。**

---

## 3. MORE DETAILS —— 观察结果

**真实几何（PEARL 与 DUSK 完全相同）**

| | `.more-details-row` | `.more-details-body` | `.save-memory` |
|---|---|---|---|
| COLLAPSED | top **619**, h50 | 不存在 | top **700**, h57 |
| EXPANDED | top **619**, h50 | top **669**, h **455** | top **1155**, h57 |

⇒ **披露行原地不动（619 → 619）** ✓；**body 455pt 一次性插入**；**Save 一次跳 455pt**。
⇒ 这正是 brief 担心的组合：**「柔和的 body 动画 + 硬跳的页面」**。
body 的淡入发生在**它已经就位的最终位置上**，而行没有移动 —— 所以「内容从这一行打开」的**空间因果是弱的**；
唯一的方向线索是那 6rpx 的上浮。

**回答四问**
- A 连续感：**弱** —— 行不动，是下方内容一次性让位
- B 闪烁/跳动：**有一处明确的跳** —— Save 与 TabBar 一次下移 455pt（**这是既有静态行为，不是本动效引入的**）
- C 是否更清楚：比「硬 pop」好，但不如真正的展开
- D 去掉会不会一样好：去掉后 body 直接出现且页面照样跳；保留至少让 body 自己「落位」

**rapid**：`open→close→open` 序列 `[false,true,false,true]` ⇒ 最终 `moreOpen: true`、**body 存在** ✓
**最终状态正确，无残留、无重复挂载。**

### 判定：**KEEP（建议）—— 状态 PROVISIONAL**
理由（**基于事实**）：披露行不移动 ⇒ 视觉锚点稳定；rapid 终态正确；455pt 的 reflow 是**既有静态行为**。
**若你目视后觉得「柔和 body + 硬跳页面」别扭，最小的改法是把 reveal 缩到 `--motion-quick`(140ms)，
让它在页面已跳之后迅速结束 —— 但按 brief「不要因为 REVISE 存在就发明 REVISE」，我不擅自改。**

---

## 4. PHOTO —— 观察结果

**真实几何（PEARL 与 DUSK 完全相同）**

| | `.main-photo-wrap` | 内容 | `.edit-photo` | `.remove-extra` | `.add-photo` |
|---|---|---|---|---|---|
| 0 photos | top **233**, h **245** | `.photo-placeholder` 233/245 | — | — | null |
| 1 photo | top **233**, h **245** | `.main-memory-photo` 233/245 | 245/h34 | 416/h50 | 265/h182 |

⇒ **格子几何逐像素相同（top 233 / h 245）** ✓ **无位移**
⇒ 1 张时 Edit / Remove / Add-more **全部到位**（不存在「控件错位出现」）

**rapid**：挂载后立刻触发另一个照片动作（`onAddMore`）⇒ 之后 `photos: 1`、slot 仍 (233,245) ✓
**最终状态正确、格子稳定、无 stale 视觉。**

**回答四问**
- A 连续感：同格换元素，140ms 淡入
- B 闪烁/跳动：**几何测量未见跳动**；未见白闪（截图 0→1 之间无空白帧）
- C 是否更清楚：把「切」变成「落位」
- D 去掉会不会一样好：140ms 很短，去掉后是硬切

### 判定：**KEEP（建议）—— 状态 PROVISIONAL**
理由（**基于事实**）：格子几何零变化、控件同步、rapid 终态正确。**淡入本身未经我目视确认。**

---

## 5. 快速交互结果

| 测试 | 结果 | 判定 |
|---|---|---|
| More details `open→close→open` | 序列 `[false,true,false,true]`，最终 `moreOpen:true`、body 存在 | **PASS** |
| Save 连点 ×3（已在 saving 中） | `progressUnchanged:true`、三次全被 `saveLock` 吞掉 | **PASS** |
| Photo 挂载后立刻另一个照片动作 | `photos:1`、slot (233,245) 稳定 | **PASS** |
| Rating | 已回退为静态，不需中断测试 | — |

| 检查项 | 结果 |
|---|---|
| stale callback | **未观察到** |
| duplicate animation | **未观察到** |
| flicker | **未观察到** |
| layout jump | **未观察到**（几何测量；More details 的 455pt reflow 是既有静态行为） |
| delayed response | **未观察到** |
| wrong final state | **未观察到** |

---

## 6. PEARL / DUSK / QUIET

**PEARL vs DUSK**：三个交互的**几何数据逐字节相同**（save rect 一致、details 619/669/1155、photo 233/245）
⇒ **无主题特异性差异**，未创建任何主题专属时长 ✓

**QUIET（`reduceMotion:true`）**

| 交互 | 结果 |
|---|---|
| Save | `saving:true`、label **「Saving your memory...」**、progress 40 ⇒ **无动画也清楚表达 Working** ✓ |
| More details | `moreOpen:true`、body 存在 ⇒ **披露可理解** ✓ |
| Photo | 0/1 张终态截图正常 ⇒ **照片状态清晰** ✓ |

Quiet 下**终态与 Normal 终态一致**（只去插值，不去状态、不去进度、不去错误信息）✓

---

## 7. 保留动效清单（3 + 1 既有）

| # | 交互 | 属性 | 时长 | 缓动 | Quiet |
|---|---|---|---|---|---|
| P0-1 | Save 表面 | `opacity`, `background-color` | 220ms `--motion-normal` | `--ease-soft` | `transition: none` |
| P0-2 | More details body | `opacity`, `transform(translateY 6rpx)` | 220ms | `--ease-soft` | `animation: none` |
| P0-4 | Photo 挂载 | `opacity` | 140ms `--motion-quick` | `--ease-soft` | `animation: none` |
| 既有 | chevron | `transform(rotate)` | 220ms | `--ease-soft` | 既有 none |

**未新增时长 / 缓动 / token / 库**；`--motion-panel` 未使用；无循环 keyframe。

## 8. 已回退动效清单

| 项 | 状态 |
|---|---|
| **P0-3 Rating `is-on` scale** | **已完整回退**（WXSS 543 字符整块 + WXML 投射）；`grep -c "is-on"` 两文件均为 **0** |
| Rating | 回到已批准静态行为，**未用别的动画替代** |
| Tags | 静态（本就没动） |
| Photo REPLACE | 静态（本就没动） |

---

## 9. Verification

| 套件 | 结果 |
|---|---|
| `verify-cloud.cjs` | **EXIT 1 —— 唯一失败 = UI 注册闸门**（本轮改了 WXML/WXSS，**未推进**） |
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0** |
| `verify-structure.cjs` | **EXIT 0** |
| `verify-add-native-return.cjs` | **EXIT 0** |
| `verify-add-identity-fence.cjs` | **EXIT 0** |
| `verify-photo-batch-upload.cjs` | **EXIT 0** |
| `verify-map-save.cjs` | **EXIT 0** |
| `verify-media.cjs` | **EXIT 0** |
| `verify-menu-copy.cjs` | **EXIT 0** |
| `npm run verify` | **EXIT 0 — FINAL STATIC VALIDATION: PASS** |
| `verify:all` | **EXIT 1 —— 同一唯一红点** |

**静态回归全绿** ✓ P0-3 回退未影响任何套件 ✓

---

## 10. Round 4-A 能否冻结？

**客观验收项全部满足**：
START/END 正确 · 几何无跳动 · rapid 终态正确 · Quiet 完整 · 静态回归全绿 ·
**Frame-level recording unavailable in current toolchain**（已声明）。

**唯一未由我验证的**：140–220ms 渐变的**观感**。我没有录像、看不见动画，
所以三者的最终体感签字应当由你完成。

⇒ **建议：三个保留动效记为 KEEP，状态 `PROVISIONAL — pending your visual look`。**
若你点一遍后认可，Round 4-A 即可冻结。

## 11. UI 注册检查点是否可推进？

**暂时不要。** 按 brief「Do not update the UI registration checkpoint until all retained Round 4-A motion is visually approved」——
三个动效的**观感**尚未由人确认（我无法代判）⇒ **建议你先在模拟器里点一遍**
（Save 三态 / More details 开合 / Photo 0↔1），确认后再授权推进
`tools/add-page-review.json` 的 `add/index.wxml` + `add/index.wxss` 两个 `sha256`。

## 12. 清理

已把只为证明而建的临时脚本移出工作区主目录：
`.workbuddy-ai/scratch/ui-refinement-audit/abandoned-proof/{runtime-proof-r4a.cjs, runtime-proof-r4a2.cjs}`
（含 `computedStyle` 实验与亮度采样）。**它们都在 gitignored 的 `.workbuddy-ai/scratch/` 下，
不可能成为生产验证基建。** 清理过程**未改动任何生产 UI**。

## 13. ⚠️ 我先前的一个错误结论（更正）

我在本轮的中间阶段多次报「runtime never became available / BLOCKED」——**这个结论是错的**。
真实原因是我自己的**存活探针写错了**：`automation_evaluate` 的返回值是
`{result: {result: <payload>}}`，而我的 `ev()` 只解一层，于是 `probe.count` 永远是 `undefined`，
**探针自己判定为「不可用」**。运行时其实一直活着（`automation_runtime_info --action currentPage` 可证）。

⇒ **更正**：`fields({computedStyle})` **确实**不回调（这是真的工具限制）；
但「运行时不可用」是**我的探针 bug**，不是环境问题。已修正并完成本轮观察。

⚠️ **教训（已记入记忆）**：报 BLOCKED 之前，先用一个**独立的、最简的**探针交叉验证
（例如 `automation_runtime_info --action currentPage`），不要只信自己封装的那一层。
