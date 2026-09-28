# TabBar 抽动 Bug —— 暂停处理并冻结（Phase 2E，2026-09-28）

**未 commit / 未 push / 未 deploy。**

---

## 0. KNOWN_ISSUE

```
KNOWN_ISSUE:  TabBar transition has minor visible twitch on real device.
STATUS:       DEFERRED
原因:         - renderer-only 未解决（Phase 2B）
              - full Morphicons runtime 未解决（Phase 2D）
              - 继续深入将进入 TabBar outer compositor / layout 层
              - 当前优先级不足
```

### 用户真机最终裁决

| | 结果 |
|---|---|
| Canvas full-DPR 清晰度 | **PASS** |
| `MORPHICONS_FULL`（canvas + real DPR + upstream spring + real rAF + real dt + velocity preservation） | **抽动仍然存在** |

⇒ **`FULL_MORPHICONS_RUNTIME_NOT_SUFFICIENT`**

**不再继续处理**：Morphicons core / renderer / spring / cadence / velocity / label crossfade /
endpoint warmup / Canvas DPR / icon pair。

### 至此已被排除的假设（供未来接手）

| 假设 | 证据 |
|---|---|
| Morphicons core 移植不忠实 | Phase 2A：`resampleIcon`/`buildPlan`/`interpPolar` 与上游**逐字节一致** |
| renderer 成本（frameSrc / data URI / 解码 / bridge） | Phase 2B：客观指标全面改善，**肉眼无改善** |
| motion curve（smoothstep vs upstream spring） | Phase 2C-A：`UPSTREAM_MOTION_PARITY = PASS` |
| cadence（32ms vs 16ms） | Phase 2D：B 臂 median 16ms / p95 17 / max 19 / **长帧 0** |
| velocity preservation | Phase 2D：F6 已证保留 |
| icon pair 起始几何 | Phase 2C-A §18：五对起始 10% 全部连续 |
| 四条一起（core+spring+cadence+surface） | Phase 2D：**仍抽** |

**下一步（若将来重启）应查**：Tab item parent geometry / native font-render compositing /
selected state CSS / 整个 TabBar compositor layer —— **而不是继续改 icon morph**。

---

## 1. 恢复产品默认状态

| 项 | 值 |
|---|---|
| `tabMorphRenderer` | **不存在了**（flag 已移除，模板硬编码 `renderer="svg"`） |
| `tabMorphMotion` | **不存在了**（flag 已移除） |
| dev-only A/B mode | **已移除** |

**Canvas renderer / MORPHICONS_FULL / dev-only A/B mode 均未成为生产默认。**

### 回退的**逐字节可证**性

Phase 2B/2C/2D 引入的改动全部撤销后，四个文件的 SHA-256 **等于它们在 Phase 2B 之前的精确值**：

| 文件 | 回退后 SHA-256 | 与 2B 前 |
|---|---|---|
| `components/morph-icon/index.js` | `4349e4b668a64854db5cc450dba7add1f257cd4b6c3c69bca7e03eded46d8659` | **EXACT** |
| `components/morph-icon/index.wxml` | `99d35e2283fd285dddad2cfa8f3e93a81432d7a12738fc05a9b89776c0faf8c5` | **EXACT** |
| `custom-tab-bar/index.js` | `712c34cb754bdc068049b82d98a2cb0e4bb9f0e936c056d7704bbfa784d11e3d` | **EXACT** |
| `custom-tab-bar/index.wxml` | `17f067517f280eb9540cbe3b32c9d6be52057783acd650c76b0173e9d8cc2a0f` | **EXACT** |

`ui-approved-updates.json` 的四个哈希已恢复到这些值，reason 追加了 Phase 2E 的回退说明（保留审计轨迹，不删历史）。

## 2. 保留的独立有效改动

| 阶段 | 保留 | 依据 |
|---|---|---|
| **Phase 1A** publish dedupe | ✅ 保留 | 客观减少重复 publish / setData / payload（`visualPublishKey`） |
| **Phase 1C** endpoint warmup | ✅ 保留 | 改善首次点击 cold path（离屏预热注册表 + `warmSlots`） |
| Phase 1D label crossfade | ⏸ **待你确认**（见 §3） | — |
| Phase 2B/2C/2D | ❌ 全部撤销 | 见 §1 |

## 3. Phase 1D —— 撤掉会怎样（等你确认，我不自行决定）

### 3.1 会恢复原来的文字 hard-switch —— **是**

1D 把单 label 改成了固定几何 + 两层常驻：

```css
- .tab-item.is-active { color: #171a16; font-weight: 600; }
- .tab-label { transition: color 0.2s; }
+ .tab-item.is-active { color: #171a16; }          /* 去掉 font-weight */
+ .tab-label-stack { …固定几何… }
+ .tab-label-layer { …绝对定位，两层同坐标… }
+ .tab-label-inactive { font-weight: 400; … }
+ .tab-label-active   { font-weight: 600; … }
+ .tab-bar.label-fade .tab-label-layer { transition: opacity 0.16s ease; }
```

撤掉即回到 `.tab-item.is-active { font-weight: 600 }` 的**单帧 400↔600 硬切**。

### 3.2 影响其它测试 —— **两处**

| 位置 | 影响 |
|---|---|
| `tools/verify-tab-label-crossfade.cjs`（L1–L12，14 项） | **整文件删除**（它就是 1D 的套件） |
| `tools/verify-ui-quality.cjs` | 1 处断言需改回 `.theme-quiet .tab-label { … }` |
| `verify:tab-handoff` / `verify:tabbar` / `verify:cloud` | **不受影响**（不引用 label 层） |
| 哈希链 | `custom-tab-bar/index.{js,wxml,wxss}` 三个哈希需回退 |

### 3.3 是否有独立收益 —— **有，但小且未视觉验证**

**能证的**：

- 旧版在选中态翻转时会**改文字节点的 font-weight** ⇒ 字形在同一帧内重新栅格化。
- 1D 版**几何固定**（两层绝对定位同坐标）、**唯一动画属性是 opacity** ⇒ **结构上不可能引起任何 layout 位移**；
  真机 selector query 已证 `inactive` rect **逐字节等于** `active` rect。
- Phase 2B 的 icon-only 隔离已证：**label 不扰动 icon 帧投递**（与完整 TabBar 逐项相同）。

**不能证的**：这个 font-weight 重新栅格化**是否肉眼可见**。用户的录屏没有单独隔离过 label。

### 3.4 我的建议：**KEEP**

理由：它**不是纯粹为 twitch 引入的** —— 它同时移除了一次真实的字形重新栅格化，并把 label 变成
「结构上不参与 layout」的纯 opacity 层。这是标准做法，成本只有 8 个额外 text 节点 + ~40 行 CSS，
且被 12 条断言覆盖。

⚠️ 但如果你要的是**最小 diff / 最小审查面**，REVERT 也完全站得住 —— 它的收益小且未经视觉确认，
而它确实是在 twitch 调查中引入的。**这条我等你定。**

## 4. 提交边界审计

### A. 可保留的生产修复

| 文件 | 内容 |
|---|---|
| `miniprogram/custom-tab-bar/index.js` | Phase 1A `visualPublishKey` dedupe；Phase 1C `visualSelected`/`warmEndpoints`/`labelFade` 发布 |
| `miniprogram/custom-tab-bar/index.wxml` | Phase 1C `warm=` 绑定 + `visualSelected` 驱动 `.is-active` |
| `miniprogram/components/morph-icon/index.js` | Phase 1C endpoint warmup 注册表 / `warmSlots` 泵 / `armStaticWait`；Phase 1B spring preset 支持 |
| `miniprogram/components/morph-icon/index.wxml` | Phase 1C 离屏预热 `<image>` |
| `miniprogram/components/morph-icon/index.wxss` | Phase 1C `.morph-warm` 离屏样式 |
| `tools/verify-tab-publish-dedupe.cjs`（新） | 1A 套件 |
| `tools/verify-tab-endpoint-warmup.cjs`（新） | 1C 套件 |

### B. 已撤销的实验性改动

| 项 | 处理 |
|---|---|
| Canvas 生产切换（`tabMorphRenderer`） | 撤销（flag + WXML 绑定 + `renderer` observer 全删） |
| MORPHICONS_FULL 默认（`tabMorphMotion`） | 撤销（flag + WXML 绑定 + `motion` property 全删） |
| dev-only A/B wiring | 撤销（canvas 从 presentation 分支移除；`armStaticWait`/`finishCommandCommit` 恢复无条件；canvas 的 `renderRevision`/`start` report/spring 模式/DPR 全回退） |
| `tools/verify-tab-canvas-renderer.cjs`（C1–C17） | **移到 `.workbuddy-ai/archive/phase2-experiment-20260928/`**（Safe Local Archive，未删） |
| `tools/verify-tab-morph-motion.cjs`（M1–M12） | 同上 |
| `tools/verify-tab-morphicons-full.cjs`（F1–F12） | 同上 |
| `package.json` | 三个实验脚本注册 + `verify:all` 引用已移除 |
| `verify-cloud.cjs` / `verify-tab-label-crossfade.cjs` | 2B 改的口径**已改回原样** |

### C. 需单独决定

| 文件 | 状态 |
|---|---|
| `miniprogram/custom-tab-bar/index.wxml` / `index.wxss` / `index.js` 的 **Phase 1D 部分** | **待你确认**（§3 建议 KEEP） |
| `tools/verify-tab-label-crossfade.cjs`（新） | 随 1D 一起决定 |

### D. 测试 / review 文档（未跟踪，建议一并提交）

- `docs/reviews/tabbar-morph-phase0-20260928.md`（Phase 0）
- `docs/reviews/tabbar-publish-dedupe-phase1a-20260928.md`（1A）
- `docs/reviews/tabbar-firstclick-twitch-phase1b-20260928.md`（1B）
- `docs/reviews/tabbar-phase1c-20260928.md`（1C）
- `docs/reviews/tabbar-phase1d-20260928.md`（1D）
- `docs/reviews/tabbar-phase2a-20260928.md`（2A 审计）
- `docs/reviews/tabbar-phase2b-20260928.md`（2B canvas A/B）
- `docs/reviews/tabbar-phase2c-20260928.md`（2C motion A/B）
- `docs/reviews/tabbar-phase2d-20260928.md`（2D full-semantics）
- `docs/reviews/tabbar-phase2e-20260928.md`（本文）
- `tools/verify-tab-publish-dedupe.cjs` / `verify-tab-endpoint-warmup.cjs` / `verify-tab-label-crossfade.cjs`

## 5. Verification（恢复产品默认后重跑）

| 套件 | 结果 |
|---|---|
| `verify:icons` | EXIT 0 |
| `verify:handoff` | **74/74** |
| `verify:tab-dedupe` | EXIT 0 |
| `verify:tab-warmup` | **12/12** |
| `verify:tab-label` | EXIT 0 |
| `verify:tabbar` | EXIT 0 |
| `verify:cloud` | EXIT 0 |
| `verify:ui` | EXIT 0 |
| `npm run verify` | **359/359** |
| **`npm run verify:all`** | **0 FAIL**（1987 行） |

⚠️ 用户 brief 里的 `verify:tab-handoff` / `verify:tab-endpoint-warmup` **不是真实脚本名**
（真名是 `verify:handoff` / `verify:tab-warmup`）；我第一次按字面跑得到两个
`npm error Missing script`，**不是代码失败**，用真名重跑全绿。

## 6. 最终报告

| 项 | 值 |
|---|---|
| current production renderer | **`svg`**（模板硬编码，flag 已移除） |
| current production motion | **`smoothstep`**（flag 已移除，代码路径恢复原样） |
| 保留的 1A/1C 文件 | 见 §4 A 表（7 项） |
| Phase 1D keep/revert 建议 | **KEEP**（有独立收益：移除字形重栅格化 + label 结构上不参与 layout；成本小；但收益未经视觉确认，若你要最小 diff 则 REVERT 也成立） |
| 已撤销的实验文件 | 3 个套件已移到 `.workbuddy-ai/archive/phase2-experiment-20260928/`（未删）；`package.json` 注册已清；2 处被 2B 改过的断言已改回 |
| `git diff --stat` | 11 files changed, **250 insertions(+), 42 deletions(-)** |
| verify 结果 | 全部 0 FAIL（`verify:all` 1987 行） |
| working tree status | 11 M + 12 ??（见 §4 D）；**未 commit** |

**未 commit / 未 push / 未 deploy。**
