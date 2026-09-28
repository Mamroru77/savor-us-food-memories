# TabBar Phase 1C：endpoint 预热 + morph 前抽动修复（2026-09-28）

**状态：真机验收通过 —— `READY_TO_COMMIT`**（尚待 §4 主观评分与 B4 视觉判断）。基线 `954b1aa` + Phase 1A/1B/1C 工作区改动。**未 commit / 未 push / 未 deploy。**

- **`verify:all` 1175 PASS / 0 FAIL / EXIT 0**（1163 → 1175）。
- 保留 Phase 1A publish dedupe ✓。
- 未改 morph 帧数 / duration / spring / easing / SVG shape / TabBar layout / blur / shadow / 隐藏 bar / 每帧 payload / 页面业务逻辑 ✓。

---

## 1. Endpoint warmup

| 项 | 实现 |
|---|---|
| **多少 URI** | **18**（不是 10）。理由见下。 |
| 生成方式 | 调**同一个** `iconSvg(name,{stroke:color,strokeWidth:1.75})`，与 `acceptPresentation` 里 `originSrc/targetSrc` 逐字相同 ⇒ **URI 逐字节一致**（W1 断言）。**没有第二套 SVG。** |
| 何时 warm | 每个 `s-morph` 的 `ready()` 之后 `setTimeout(0)` —— **首屏照常，不阻塞**。 |
| 分批 | **每批 2 个**，靠 `bindload`/`binderror` 推进；无 scheduler。 |
| 全局去重 | **模块级注册表**（`warmState: Map<uri, cold\|loading\|ready\|failed>`）+ `warmClaim/warmSettle`，5 个图标 × 5 个 bar 实例共享 ⇒ **同一 URI 全程只交给原生一次**（W2）。 |
| 真实 `<image>` | 离屏容器：`position:absolute; left/top:-9999rpx; width/height:1rpx; opacity:0; pointer-events:none` —— **刻意不用 `display:none`**；`bindload`/`binderror` 可观测。 |
| 点击早于 warm 完成 | 行为与原来完全一致，不阻止点击、不显示 loading（W5）。 |

**为什么是 18 而不是 10**：一次切换里两个端点色**不同**。离开的图标用 `inactive` 色配 `chosen` 字形
（`fromName`），进入的图标用 `active` 色配 `rest` 字形（`fromName`）。所以每个普通 item 需要
`{rest,chosen} × {active,inactive}` = 4 个；Add 的按钮色与选中态无关 ⇒ 2 个。`4×4 + 2 = 18`。
只 warm 空闲态的 10 个会漏掉每次切换真正用到的那 8 个。

**真机运行实测**（模拟器，刷新后）：`registry = {cold:0, loading:0, ready:18, failed:0}` ✓ 全部 warm。

## 2. First-click before → after

用同一套探针（`timeline.cjs`，`child.report` 的时间戳）测「tap → endpoint static-loaded」与「tap → morph start」。

| | cold（Phase 1B，无 warmup） | warm（Phase 1C） |
|---|---|---|
| tap → endpoint `static-loaded` | **+78 ms** | **+43 ms** |
| tap → `mode: start`（morph 真正开始） | **+96 ms** | **+77 ms** |

⚠️ 口径必须说清：after 这一列是**预热已完成**的稳态（registry `ready:18`）。**cold-after（全新启动、warmup 还没跑完就点）无法在模拟器上测** —— Phase 1B 已证明模拟器区分不出 first/second。
⇒ **「first vs second 差异是否显著缩小」这一项需要你真机 fresh restart 测**（§5）。

## 3. Twitch before → after

**Before（Phase 1B，Home→Map）**
```
T+14  .tab-item.is-active 翻转（label color + font-weight 400→600 瞬变）
T+78  endpoint static-loaded
T+96  mode: start
      ⇒ 82 ms 的「已换装、还没 morph」窗口
```

**After（Phase 1C，Us→Map，warm）**
```
+  0  tap
+ 14…19  6 次 publish（目标 bar + 4 个停车 bar）
+ 42/43  view-commit；未变化的 3 个图标 mode: ready（就地结算）
+ 43  icon index=1  mode: static-loaded     ← endpoint 屏障（预热后 43 ms，原来 78 ms）
+ 45  icon index=3  mode: static-loaded
+ 77  icon index=1  mode: start              ← morph 开始
+ 77  visual-selected  reason=start          ← ★ 强调状态在同一毫秒翻转
+560  icon index=1  mode: complete
```

⇒ **`+77` 与 `+77` 重合，82 ms 窗口消失。** `.is-active` 不再先于形状变化。

## 4. VisualSelected design

**语义与呈现分离**（`custom-tab-bar/index.js`）：

| 字段 | 角色 |
|---|---|
| `data.selected` | **语义/导航真相**。tap 被接受、`showSelection` 到达时立即更新。`aria-selected` 仍读它。 |
| `data.visualSelected` | **纯视觉强调**。驱动 `.tab-item.is-active`（label 颜色 + 字重）。 |

- WXML：`class="tab-item {{viewState.visualSelected === index ? 'is-active' : ''}}"`；
  `aria-selected="{{viewState.selected === index}}"`（**不变**）。
- `nextVisualSelection(next)` 的规则：
  - 首次发布 → 立即等于 `selected`
  - `quiet`（reducedMotion）→ 立即（没有 morph 可等）
  - `entryActive === false`（停车 bar，不可见）→ 立即
  - **选中项变化且会走 morph → 保持旧值，等子组件报告**
- 翻转触发：`onMorphReport` 里 `index === data.selected` 且 `mode ∈ {start, complete, ready, static-fallback}`
  ⇒ **`start` = morph 真的开始了**；`ready` = 静态路径（不会 morph）；`complete`/`static-fallback` = 兜底。
  **`static-loaded` 刻意不是触发点**（它比首帧早约 18 ms，而本轮的整个目的就是不让按钮早于形状变化）。
- **不引入任何 timer**：`verify-tab-handoff` 明确断言「一次 tap 不产生任何 timer」
  （"navigates immediately … schedules nothing"），所以兜底改由子组件的**终态 report** 承担 ✓。
- 两处 `visualSelected`（顶层 + `viewState.visualSelected`）**必须同时写**，模板读的是后者
  —— 这条是 W7 抓出来的实现 bug（见 §7）。

## 5. B4

**NOT_NEEDED**（在当前证据下）。

B3（只同步时机、不重做文字 DOM）已实现，且模拟器时间线显示 `.is-active` 已与 `start` 同毫秒翻转。
B4 的触发条件是你 §B4 写的「**真机仍能明显看到 400 ↔ 600 造成文字自身宽度/栅格突跳**」——
这需要你的真机观察，我这边无法判定。

⚠️ 需要注意：Phase 1B 在本机采样证明字重切换**不改变 label 盒子**（恒 22×14），
所以 B4 很可能**永远不需要**；但真机字体不同，仍以你的真机观察为准。
**若真机仍抽 ⇒ 才实施 B4（固定位置双层 label crossfade，160–200ms opacity，最终字重仍是 400/600）。**

## 6. Phase 1A

**保留。** `verify-tab-publish-dedupe` **14/14 PASS**（W11 也覆盖了「去重仍生效」）。
它没有被本轮的 `visualSelected` 改动吃掉：`visualSelected` 已加进 `visualPublishKey`
⇒ 两次「语义相同但强调不同」的 publish **不会**被误判为重复。

## 7. Verification

| 套件 | 结果 |
|---|---|
| `verify:icons` | PASS |
| `verify:tab-handoff` | **74/74** |
| `verify:tab-dedupe` | **14/14** |
| `verify:tab-warmup`（新增 W1–W12） | **12/12** |
| `verify:tabbar` | PASS |
| `verify:cloud` | **272/272** |
| `npm run verify` | **359/359** |
| **`npm run verify:all`** | **1175 PASS / 0 FAIL / EXIT 0** |

### 本轮修掉的实现 bug（由新测试抓出）
- **W7**：`onMorphReport` 只写了顶层 `visualSelected`，没写 `viewState.visualSelected`
  ⇒ 模板读后者 ⇒ 强调根本不会更新。已改为两者同写。
- **W2/W3**：断言写错（结算 2 个后队列会再 claim 2 个）；且跨 realm 的 `deepStrictEqual` 需要 JSON 往返
  —— 这两条是**测试自身**的问题，不是产品 bug。

### 既有闸门的两处口径更新（非放松）
1. `tools/verify-tab-handoff.cjs`：「debug output identifies the queried instance…」的最后一行断言
   由 `.at(-1).reason` 改为 `.filter(r=>r.event==='icon').at(-1).reason` —— 本轮新增了 `visual-selected`
   trace 行，该测试**本意就是「不要假设最后一行」**，改后保证不变（图标报告仍被记录）。
2. `tools/verify-cloud.cjs`：bar harness 的 `setData` 改为支持点路径（`viewState.visualSelected`），
   与原生语义一致；这是 harness 保真度补齐，不改任何断言。

### 冻结哈希链
`ui-approved-updates.json` 更新 **5 个** `sha256`（TabBar js/wxml、morph-icon js/wxml/wxss），
每个 reason 都写明本次授权、越过 2026-09-16 回滚锁的范围、以及**旧哈希**（便于回滚）。
`custom-tab-bar/index.wxss` 未变。先 dry-run 后写入，`verify-cloud` 272/272 ✓。

## 8. 变更清单

| 文件 | 变化 |
|---|---|
| `miniprogram/custom-tab-bar/index.js` | `visualSelected` 语义/视觉分离 + `nextVisualSelection` + `onMorphReport` 翻转；`warmPlan`；`visualPublishKey` 纳入 `visualSelected` |
| `miniprogram/custom-tab-bar/index.wxml` | `.is-active` 读 `viewState.visualSelected`；`s-morph` 增加 `warm` |
| `miniprogram/components/morph-icon/index.js` | 模块级 warm 注册表（claim/settle）+ `startWarm/pumpWarm/onWarmLoad/onWarmError/getWarmDebug`；`warm` property；`warmSlots`；`ready()` 后启动 |
| `miniprogram/components/morph-icon/index.wxml` | 离屏 warm `<image>` 槽位 |
| `miniprogram/components/morph-icon/index.wxss` | `.morph-warm` 离屏样式 |
| `package.json` | 注册 `verify:tab-warmup` 并加入 `verify:all` |
| `tools/verify-tab-endpoint-warmup.cjs` | 新增（W1–W12，12 项） |
| `tools/verify-tab-handoff.cjs` / `tools/verify-cloud.cjs` | 上述口径/harness 修正 |
| `tools/fixtures/regression/ui-approved-updates.json` | 5 个哈希 + reason |
| `docs/reviews/tabbar-firstclick-twitch-phase1b-20260928.md` | Phase 1B 报告（上一轮新增） |

**未改**：morph 帧数 / duration / spring / easing / SVG shape / TabBar layout / blur / shadow / 隐藏 bar 策略 / 每帧 payload / 页面业务逻辑。

## 9. 真机验收（请你执行）

**必须 fresh restart 测**（否则 endpoint 已经是热的，测不出冷路径）。

1. **冷 baseline** 用 Phase 1B 的记录。
2. **warm 后第一次** Home→Map：记 `tap→morphStart` / `endpointWaitMs` / `firstFrameWaitMs` / total morph duration。
3. 再测第一次点 Map / Me / Us / Add，然后各测第二次。**目标：first vs second 差异显著缩小。**
4. **视觉只看**：① Home→Map 旧按钮和新按钮不再先抽一下；② Map→Me 同样；③ 快速 Home→Map→Me→Home；④ 中央 Add；⑤ 首次点击各 Tab 不再明显比第二次卡。
5. 保持：icon shape / Morphicons / 最终 active-inactive 视觉 / label 字重 / layout / blur / shadow / duration / spring。

## 10. 未做

- **未 commit / 未 push / 未 deploy。**
- 未实施 B4（见 §5）—— 需你的真机视觉判断。
- **§4 主观评分（每个 Tab 第一次 vs 第二次「卡不卡」）需你给**，我这边无法量化。

---

## 11. 真机最终验收结果（2026-09-28，OPPO PKB110 / Android 16 / SDK 3.17.3）

**结论：READY_TO_COMMIT。**（仍未 commit / push / deploy。）

验收前先**只读**探 `automation_runtime_info` 确认真机会话在线（`platform: android`），
全程未发 `--action remote`（避免踢掉真机会话迫使重新扫码）；重载用 `simulator_refresh`。
运行态确认跑的是 Phase 1C 代码：`'visualSelected' in bar.data === true`，`warmEndpoints` 合计 **18**。

### 11.1 Warmup（fresh restart 后）

| 项 | 实测 |
|---|---|
| 注册表终态 | `{cold: 0, loading: 0, ready: 18, failed: 0, unique: 18}` |
| **唯一 URI** | **18**（与预测的 `4×4 + 2 = 18` 一致；URI dump 逐个核对，无重复） |
| **预热耗时** | **638 ms**（`firstWarmAt 1790574487535` → `lastWarmAt 1790574488173`） |
| 首屏影响 | `route pages/home/index`、`interactive true`、`identityReady true`、`mapError false` |

### 11.2 First click vs second click（每 Tab 各两次）

分离「导航」与「TabBar」后的原始毫秒（`toMorphStart` = tap→morph 真正开始）：

| 轮 | Tab | tap→publish | publish→static | publish→start | **tap→start** | firstFrameWait | morph 时长 | tap→visual |
|---|---|---|---|---|---|---|---|---|
| 1 | Map | 15 | 71 | 106 | **121** | 34 | 485 | 121 |
| 1 | Us | 25 | 92 | 143 | **168** | 50 | 485 | 168 |
| 1 | Me | 15 | 41 | 79 | **94** | 37 | 484 | 94 |
| 1 | Add | 24 | 589 | 78 | **102** | 50 | 485 | 102 |
| 1 | Home | 16 | 30 | 127 | **143** | 96 | 483 | 143 |
| 2 | Map | 16 | 46 | 80 | **96** | 33 | 544 | 96 |
| 2 | Us | 25 | 96 | 127 | **152** | 30 | 486 | 153 |
| 2 | Me | 17 | 26 | 68 | **85** | 42 | 488 | 85 |
| 2 | Add | 26 | 263 | 71 | **97** | 42 | 483 | 97 |
| 2 | Home | 14 | 40 | 125 | **139** | 84 | 500 | 139 |

- **`tap→publish` 两轮都是 14–26 ms** ⇒ **导航 / 首个页面 `onShow` 不携带任何「首次使用」惩罚**。Phase 1B 怀疑的 first-click 卡顿**不在 TabBar 侧**。
- **`publish→start` 两轮几乎相同**（Map 106→80、Me 79→68、Home 127→125、Us 143→127、Add 78→71）⇒ 端点屏障已被预热抹平。
- 第一轮与第二轮仍存的差距全部落在**页面自身首帧**：Add 的 `publish→static` **589 → 263 ms**（Add 页首次渲染最重），其余 4 个 Tab 的该列都在 26–96 ms。这是页面首渲染成本，**不属于本轮范围**（本轮只动 TabBar / morph-icon）。

### 11.3 Twitch（`tap→visual` vs `tap→start`）

**全部 10 行 `visualReason: "start"`**，且 `tap→visual` 与 `tap→start` **同毫秒**（9 行完全相同；Us 第 2 轮 152 vs 153，差 1 ms）。

⇒ Phase 1B 记录的 **82 ms「已换装、还没 morph」窗口消失**：`.is-active` 不再先于形状变化。

### 11.4 Early tap before ready

**N/A —— 人类与 CLI 均不可达，不虚构 PASS/FAIL。**

- 预热全程 **638 ms**；任何一次 CLI 往返（下发探针 → `automation_evaluate` → 回收）都**慢于** 638 ms。
- 两次尝试（`device-acceptance-early*.json`）中，**最早可观测的样本已经 `ready:18`**；`probe.warmAtTap` 同样是 18 ⇒ 探针发出前预热已结束。
- 用户在首帧后 638 ms 内点击也基本不可能（且此时预热正在进行，正是设计允许的路径）。
- 该路径的行为**由合成断言 W5 覆盖**（「点击早于 warm 完成」与改动前行为完全一致：不阻止点击、不显示 loading）。

### 11.5 Startup impact

`{route: pages/home/index, identityReady: true, toast: null, tabbar: true, interactive: true}`，`mapError: false`。

预热挂在 `ready()` 之后 `setTimeout(0)`，**不在首屏关键路径上**；无 toast、无错误、TabBar 正常挂载。

### 11.6 Phase 1A（dedupe 未回归）

一次 Home→Map 后：`{publish: 21, publishSkipped: 3, visualSelectedRows: 3, selected: 1, visual: 1}` ⇒ **去重仍在生效**（3 次重复发布被跳过），语义 `selected` 与视觉 `visual` 一致收敛到 1。

### 11.7 B4

**NOT_NEEDED**（维持 §5 判定）。触发条件是你的真机视觉判断——**本轮真机时间线显示 `.is-active` 已与 `start` 同毫秒翻转**，未观察到「先抽一下」。若你仍肉眼看到 400↔600 造成文字宽度突跳，再实施 B4。

### 11.8 Verification（真机通过后重跑，全部 EXIT 0）

| 套件 | 结果 | 退出码 |
|---|---|---|
| `verify:icons` | PASS（49 official SVG / 28 aliases；断言 `<s-icon>` = 87） | 0 |
| `verify:handoff` | **74/74** | 0 |
| `verify:tab-dedupe` | **14/14** | 0 |
| `verify:tab-warmup` | **12/12** | 0 |
| `verify:tabbar` | **21/21** | 0 |
| `npm run verify` | **359/359** | 0 |
| **`npm run verify:all`** | **0 FAIL**（1968 行日志，收尾于 `verify-preferences-contrast`，无 `npm ERR`） | 0 |

（本机同步子进程拿不到 piped stdin，故带 `NODE_OPTIONS=--require <scratch>/node-sync-stdin-shim.cjs` 运行；**未改任何测试**。）

### 11.9 裁决

**READY_TO_COMMIT** —— 除以下两项需你确认外，Phase 1C 全部通过：

1. **§4 主观评分**：每个 Tab「第一次点 vs 第二次点」的主观卡顿感。
2. **B4**：是否肉眼看到 `.is-active` 翻转瞬间文字宽度突跳。

**仍然不要 commit。**
