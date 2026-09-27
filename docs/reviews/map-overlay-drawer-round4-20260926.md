# Map 性能第四轮：drawer 移出 native map customCallout（ordinary-view overlay）

**日期**：2026-09-26
**状态**：已实现 + 全部验证 0 FAIL；**未 commit / 未 push / 未 deploy**。
**真机结论：未裁决。本轮不宣称 overlay 更流畅。**

---

## 0. 本轮为什么这么做

第三轮真机 A/B 的裁决结果是：

- `drawerCssMotion=true` 确实把**一次展开从约 22 次 JS 写入降为 1 次**，动画帧 JS 写入为 **0**；
- 但**真机展开仍然卡、收起仍然卡**。

结论：**JS cadence / per-frame setData 已经不是主要瓶颈**。因此本轮不再调 16ms / 320ms / easing，
不再优化 `patchDrawerFrame`，也不在 customCallout 内继续做 CSS transform 实验，而是
**把会动的 drawer 视觉整个移出 native map customCallout**，改用已经存在的普通 view 层
`.map-stack-overlay`。

---

## 1. Architecture

### native-callout（A 版，默认保留）

| 层 | 负责 |
|---|---|
| native `<map>` | 地图、singleton marker、cluster 的**透明 1px anchor**（`stack-anchor.png`） |
| `customCallout`（cover-view） | **全部可动视觉**：toggle、最多 3 个 row + row photo、paging strip、root、320ms 动画、命中区 |
| `.map-stack-overlay`（ordinary view） | **仅透明命中区**，无 ink |

### view-overlay（B 版，本轮新增）

| 层 | 负责 |
|---|---|
| native `<map>` | 地图、singleton marker、cluster 的**可见静态 root**（80×89、复用已合成的 root photo、anchor 仍 `{x:0.5,y:1}`） |
| `customCallout` | **完全不挂载**（`customCallout: undefined`，WXML 整块被 `drawerRenderMode` 门控） |
| `.map-stack-overlay`（ordinary view） | **全部可动视觉**：toggle + glyph、row + `<image>`、paging strip + chevron + 页码；320ms `transform`/`opacity` transition；命中区与视觉**同一个元素** |

关键设计点：

- **容器静态**：`left = screenX`、`top = overlayTop`、`height = overlayHeight` 全部来自**固定 native frame**，
  只有 children 带 `transform`。地图投影（screenX/screenY）与 drawer 时钟**永不混合**。
- **几何共享**：overlay 的 children 直接读 **callout 两条分支用的同一批表达式**
  （`frameHeight-height+row.top` / `row.top-rootTop` 等），所以两种 renderer 落在**同一像素**上。
- **只有 renderer 不同**：`mapStack.layout()` / `buttonGeometry()` / `orient()` / `overlayTop` 避让 /
  up-down 判定 / paging / selection **全部复用未改**。

---

## 2. JS / native bridge：一次 open 的写入

同一套 harness（VM + 虚拟时钟），只差 renderer：

| 驱动 | 一次 open 的 drawer 写入 | 其中帧写 |
|---|---:|---:|
| JS 帧循环（`drawerCssMotion=false`，A 版对照） | 22 | 21 |
| native-callout + CSS transition（第三轮 B 版） | 1 | 0 |
| **view-overlay（本轮 B 版）** | **1** | **0** |

并且新增断言：**3 次 open/close/open 期间 `markers` 数组写入 = 0**（D2）。
drawer 动画期间 native map 的 marker 数据**逐字节不变**，地图不会因为抽屉动而重新布局。

---

## 3. Geometry equivalence（up / down / page）

不是「看起来一样」，而是**两种坐标系统独立算出来再比对**：

- callout 绝对位置 = `screenY - frameHeight + calloutOffset` + callout 分支表达式
- overlay 绝对位置 = `overlayTop + overlayRowTop`

逐行断言相等（D4），并额外与**第四轮之前的 overlay 命中几何**（旧实现）比对（D10）：

| 项 | up | down |
|---|---|---|
| row（3 行，逐行） | 一致 | 一致 |
| root | 一致 | 一致 |
| toggle | 一致 | 一致 |
| paging strip | 落在 frame 内且与视觉同行（D11） | 同 |

root 恒等于 `screenY - 89`（pin 高度，不是动画中的 frame 高度）。

---

## 4. Gesture semantics（pan / zoom / restore）

| 行为 | 实现 | 断言 |
|---|---|---|
| region **begin** | `stackPositionsReady=false` → ordinary overlay 整层 `wx:if` 隐藏；**native cluster root 仍在**（80×89 可见） | D7 |
| 地图移动中 | **不做任何每帧投影**（无 getRegion / selectorQuery / setData） | 代码未新增任何 regionchange 投影路径 |
| region **end** | **恰好一次** `getRegion` → 重算 screenX/screenY → overlay 重新出现 | D8 |
| 手势前是 open | settle 后**直接恢复 open 终态**，`drawerResumeTarget` 保持 `undefined`，**不重播 320ms** | D9 |
| 容器 | 开合前后 `overlayTop` / `overlayHeight` / `overlayRootTop` / `screenX` / `screenY` **完全不变** | D14 |

**核心不变量（§3）**：`gesture begin → overlay 可以隐藏 → native map 上 cluster root 仍然可见`。
为此 cluster marker 在 overlay 模式下不再是 1px 透明 anchor，而是可见 root；anchor 保持 `{x:0.5,y:1}`，
所以投影坐标与 overlay frame 不会错位。

---

## 5. Marker regression（上一轮照片修复完全没动）

本轮**没有**触碰以下任何一项（常量与代码逐项核对）：

| 项 | 值 / 状态 |
|---|---|
| `SOURCE_LONG_EDGE` | **384**（未改） |
| `DOWNLOAD_CONCURRENCY` | **3**（未改） |
| `HEAVY_CONCURRENCY` | **1**（未改） |
| renderer `LIMIT` | **512**（未改） |
| `MARKER_PHOTO_BATCH_MS` | **16**（未改） |
| >48 starvation 修复 | 在（`renderMarkerPhotos` 无 slice 上限） |
| stale result safe rebind | 在（`rebindReadyMarkerPhotos`，5 处调用点） |
| zoom settle ready rebind | 在 |
| source identity 校验 | 在（`photoFor(...)!==source`） |
| selected priority | 在 |
| marker apply batching | 在 |

**唯一一处与 marker 管线相关的改动（必须披露）**：
`markerPhotoSkipReason` 里的 `clustered` 判定加了 `&&!this.drawerOverlayMode()`，
`renderMarkerPhotos` 的 singleton 过滤同理。原因：overlay 模式下 cluster 的可见视觉**就是**这个 native marker，
如果继续沿用 callout 时代的「anchor 不可见 ⇒ 拒绝贴图」，**每个 cluster 都会永远显示通用 pin**。
改动**仅在 overlay 模式生效**，callout 模式逐字节保持原行为，两侧都有断言（D13）。

---

## 6. RED → GREEN

新增 `tools/verify-map-overlay-drawer.cjs`（14 项，已入 `verify:all`）。
**先 RED**：`9 FAILED, 3 passed`（`EXIT=1`，证据 `.workbuddy-ai/scratch/map-perf/round4-overlay-red.txt`）。

| 用例 | 断言 |
|---|---|
| D1 | overlay open 的帧写 == 0，总 drawer 写 ≤ 3 |
| D2 | 3 次 open/close/open 期间 `markers` 写 == 0 |
| D3 | overlay 模式 cluster 无 `customCallout`；callout 模式**仍有**（A/B 成立） |
| D4 | 与独立算出的 callout 几何逐行一致；root 锚在 `screenY-89` |
| D5 | collapsed：`opacity 0`、`shiftY != 0`、不可点 |
| D6 | expanded：`opacity 1`、可点 |
| D7 | gesture begin：overlay 隐藏、native cluster root 仍可见；callout 模式仍保持 1px anchor |
| D8 | settle：**恰好一次** projection，screenX/screenY 正确恢复 |
| D9 | 手势前 open → settle 恢复 open 终态，`drawerResumeTarget === undefined`，无帧写 |
| D10 | 与第四轮前的旧 overlay 命中几何逐行一致 |
| D11 | paging 打的是被点开的 cluster；strip 在 frame 内；箭头自带 tap |
| D12 | overlay 的 ink **全部是 ordinary view/image**，零 `cover-view`；transition 复用 320ms 曲线；quiet 关闭 |
| D13 | overlay 模式下 native cluster root **能收到自己的照片**；callout 模式仍拒绝 |
| D14 | 容器在开合前后完全静止（只有 children 带 travel） |

---

## 7. 改了哪些既有断言（**没有删断言消红**）

第三轮已经证明「断言若依赖 flag 默认值，翻 flag 就会静默关掉闸门」。本轮新增 `drawerRenderMode`
默认 `view-overlay`，于是**又有一批断言暴露了它们其实在测 callout 臂**。处理原则同上：**显式 pin 模式**，
或改成**更强**的双臂契约。

| 文件 | 原断言 | 现在 |
|---|---|---|
| `verify-cloud.cjs` `page('map')` | 继承默认模式 | **显式 pin `native-callout`**（注释说明 overlay 臂由新套件负责） |
| `verify-cloud.cjs` 覆盖层测试 | `!hits.includes('<image')`（只描述 callout 臂） | 断言**每个 overlay `<image>` 都被 `drawer.overlayMode` 门控** + 零 `cover-image`（更强） |
| `verify-cloud.cjs` `stripOpen` | 钉 `stripOpen:cssMotion?...` | 钉 `stripOpen:staticFrame?...` + **新增** `staticFrame` 覆盖两种 transform 驱动 |
| `verify-map-motion.cjs` 标记测试 | 钉 `screenY-drawer.height` 等 4 处字符串 | 钉**两种 renderer 的全部分支**（更强） |
| `verify-map-drawer-motion.cjs` | `makePage` 继承默认模式 | **显式 pin `native-callout`** |
| `verify-map-drawer-motion.cjs` D7 | 钉 `pin-stack-hit-motion` | 钉 `pin-stack-ink-motion` + 说明 overlay 下 ink 与命中区**是同一元素**（更强） |
| `verify-marker-apply.cjs` | 继承默认模式 | **显式 pin `native-callout`** |
| `verify-map-trace.cjs` skip 词表 | 只断言 `'clustered'` | **两种模式都断言**（overlay 下必须可绑定） |

---

## 8. 冻结哈希链

改了 `index.wxml` / `index.wxss`，按仓库既有机制（`ui-approved-updates.json` = 用户授权记录）更新：

- `index.wxml` `1b7c7e827d2c…`：`ui-approved-updates` + `map-identity-review` + **`map-frame-review.baseSha256`**
- `index.wxss` `6009e9df12f1…`：`ui-approved-updates` + `visual-refinements.baseSha256` + `map-identity-review`
- **硬 pin 保持**：`mapIdentity['map/index.wxss'].baseSha256 === '1af64be70016…'`（dry-run 报 `pin satisfied: yes`）
- 先 **dry-run 复现整条链**才落盘；最终 `VERDICT: MATCH`，`verify:cloud` 272/272。

⚠️ **本轮发现并修掉了一个流程缺陷**：我那份 dry-run 脚本**漏建模了 `mapFrameReview.baseSha256`**
（它必须跟随新的 approved hash），导致第一次落盘后 `verify:cloud` 报
「Map geometry review must name its frozen checkpoint」，而所有 `sha256` 字段看起来都对。
脚本已补上这条编辑推导，现在 dry-run 与真实闸门一致。

---

## 9. 验证

| 命令 | 结果 |
|---|---|
| `verify:map-overlay-drawer` | **14/14**（新增） |
| `verify:map-drawer-motion` | 12/12 |
| `verify:map-motion` | 24/24 |
| `verify:marker-apply` | 10/10 |
| `verify:map-trace` | 17/17 |
| `verify:marker-renderer-scheduler` | 17/17 |
| `verify:map-reveal-cadence` / `map-viewport` / `map-photo-recovery` / `map-empty` / `map-save` / `pending-pagination` / `map-search-clearance` / `map-overview-label` / `map-preview-selection` / `map-scale-echo` / `map-scale-race` | 全部 EXIT 0 |
| `verify:cloud` | **272/272**（在 §12 的注释修正**之前**） |
| `verify:avatar` / `verify:sheet-edits` | EXIT 0 |
| `verify` | **358/358 + FINAL STATIC VALIDATION: PASS** |
| `verify:all` | **EXIT 0**（顶层命令 41 → **42**） |

### 9.1 §12 注释修正后的重跑状态（如实说明）

修完 §12 的两条注释后，我把全部 map 套件**重跑了一遍** —— 上表前 11 行**全部 EXIT 0 / 0 FAIL**
（`map-overlay-drawer`、`map-drawer-motion`、`map-motion`、`marker-apply`、`map-trace`、
`marker-renderer-scheduler`、`map-reveal-cadence`、`map-viewport`、`map-photo-recovery`、`map-empty`、`map-save`）。

**但 `verify:cloud` 无法在本会话重跑**：它内部用 `child_process.execFileSync(process.execPath, ...)`
在 `TZ` 下校验 `utils/localDate`，而**本沙箱会话禁止「node 拉起 node」的子进程创建**，稳定报
`spawnSync ... EBUSY (errno -4082)`。已实测排除「是我改的东西导致」：

- 用**托管 node**（`22.22.2-3`）和**系统 node**（`D:/software data/nodejs/node.exe`）各试一次，**都 EBUSY**；
- 试了 `execPath` / 显式二进制路径 / `env` 传或不传 / `bash` 的 `node` 命令名，**全部 EBUSY**；
- 该测试文件是 **pre-existing 的 `localDate` 日历测试**，与 Map / drawer 无关；
- 报错发生在第 **91 个 PASS 之后**（该套件共 272 项，272/272 已在 §12 之前通过）。

所以我**没有**把它重新标成绿。为避免只凭「注释」二字下结论，我补了三条**可核对**的替代证据：

1. `node --check miniprogram/pages/map/index.js` → **SYNTAX OK**；
2. `git diff HEAD -- miniprogram/pages/map/index.js` 逐行过滤掉 `^\s*//` 后，**新增行全部是第 2/3/4 轮的真实代码**
   （`MARKER_PHOTO_BATCH_MS`、两个 flag、overlay 几何、`customCallout` 门控、两个 helper），
   **§12 的两次编辑没有引入任何非注释行**；
3. 冻结哈希链用**纯进程内**脚本复核：
   `index.wxml` → `1b7c7e827d2c…`、`index.wxss` → `6009e9df12f1…`，两处 `VERDICT: MATCH (gate passes)`、
   `pin satisfied: yes`，**待编辑清单为空**。`pages/map/index.js` 本就不在冻结清单内，
   所以注释修改**结构上不可能**影响哈希链闸门。

**结论**：`verify:cloud` 272/272 是 §12 之前的有效结果；§12 之后我用上面三条更窄的证据代替重跑，
并**明确标注这是替代证据而非重跑**。若要完整重跑，需要在一个允许 node 子进程的会话里执行 `npm run verify:cloud`。

---

## 10. Real-device A/B checklist（**结论待你裁决，本轮不宣称更流畅**）

切换方式：`miniprogram/pages/map/index.js` 的 `data.drawerRenderMode`

```js
drawerRenderMode: 'native-callout',   // A 版：drawer 在 native customCallout 内
drawerRenderMode: 'view-overlay',     // B 版：drawer 是普通 view（当前值）
```

两版**除这一个值外完全一致**；`drawerCssMotion` 不要同时改。不要调 `DURATION` / easing。

### B 版必须实际真机通过

- [ ] 1. 展开：明显比当前 smooth
- [ ] 2. 收起：明显比当前 smooth
- [ ] 3. 快速 open → close → open：无跳动
- [ ] 4. up：PASS
- [ ] 5. down：PASS
- [ ] 6. paging：PASS（视觉与命中位置一致）
- [ ] 7. hit target：PASS（toggle / row / root 都点得准）
- [ ] 8. 地图 pan：overlay 不漂移
- [ ] 9. zoom：overlay 不漂移
- [ ] 10. gesture settle：drawer 正确恢复（且**不重播**开启动画）
- [ ] 11. **gesture 期间 cluster 不能闪没**（native root marker 必须可见）
- [ ] 12. 收起后 invisible row 不可点击

### 判定规则

- 出现「row 停在 collapsed offset / transform 不执行 / opacity 不执行 / hit box 与视觉错位」
  ⇒ **立即判 B 版 FAIL，不要用更多 JS 补帧掩盖**。
- **如果 B 版仍然一样卡**：停止，不要继续调 CSS。
  结论写成「ordinary-view overlay 也不是瓶颈，需要进一步 profile 页面总体 GPU / compositor」。

### 仍然 REQUIRES REAL DEVICE

- 普通 view 的合成/光栅化是否真的比 `cover-view` 便宜（**Node 和开发者工具都答不了**）
- `transform` / `opacity` transition 在 overlay 层是否平滑
- 真 FPS、真机内存峰值
- `wx.cloud` 下载延迟、`canvasToTempFilePath` 真实耗时与字节、`wx.compressImage` 是否避免解码原图

---

## 11. 本轮明确不做

- 不改 320ms / easing / 384 derivative / 并发常量 / selected priority / batching / rebind / LIMIT / camera / grouping
- 不做 cloud thumbnail sidecar
- 不删旧 customCallout path（A 版仍在，翻 flag 即 A/B）
- 不 commit / push / deploy

---

## 12. 本轮修正的文档 / 注释不一致（自查发现）

写完功能后逐条核对**代码注释里的事实声明**，发现并修掉两处：

| 位置 | 问题 | 修正 |
|---|---|---|
| `index.js` `drawerCssMotion` 上方 | 注释指向 `docs/reviews/map-performance-fix-round3-device-ab-20260926.md`，**该文件不存在**（真实文件名是 `map-real-device-ab-round3-20260926.md`） | 指向两份**实际存在**的文档，并说明这个 flag 的实验已经结束（真机证明 cadence 不是瓶颈） |
| `index.js` `drawerRenderMode` 上方 | 声称「JS 帧循环 **either one** 都可达」，但 `drawerTransformDriver()` 在 overlay 下**无条件**返回 true ⇒ overlay 模式**永远不跑** JS 帧循环 | 改成「**仅** `native-callout` + `drawerCssMotion=false` 可达」；并说明帧循环被保留而非删除，callout 臂两个驱动都在 |

`startDrawerReveal` / `patchDrawerFrame` 均**仍存在**（未删），`native-callout` + `drawerCssMotion=false` 仍会走到
`if(!transformDriver && ...) this.startDrawerReveal(...)`（`index.js:577`）—— 也就是 §11「不删旧 path」确实成立。

**影响面**：`pages/map/index.js` **不在** `ui-baseline.json` 的冻结清单里（只有 `index.wxml` / `index.wxss` 在内），
所以本次纯注释修正**不触碰哈希链**，无需更新任何 fixture。

---

## 13. 改动文件（本轮）

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/map/index.js` | `drawerRenderMode` + `drawerOverlayMode()` / `drawerTransformDriver()`；overlay 静态 frame 与几何字段；cluster 可见 root；overlay 下 `customCallout` 置空；`renderDrawerPhotos` overlay 下跳过 root；`markerPhotoSkipReason` / `renderMarkerPhotos` 的 overlay 例外 |
| `miniprogram/pages/map/index.wxml` | callout 块门控；overlay 增加普通 view/image ink（toggle glyph / row photo / paging chevron + 页码）；每个绑定写两种 renderer 分支 |
| `miniprogram/pages/map/index.wxss` | `pin-stack-ink` 系列可见样式 + 320ms transform/opacity transition + quiet 关闭 |
| `package.json` | 注册 `verify:map-overlay-drawer`，`verify:all` 41 → 42 |
| `tools/verify-map-overlay-drawer.cjs` | **新增**（14 项） |
| `tools/verify-cloud.cjs` | 双臂契约 + pin 模式 |
| `tools/verify-map-motion.cjs` / `verify-map-drawer-motion.cjs` / `verify-marker-apply.cjs` / `verify-map-trace.cjs` | pin 模式 / 双臂断言 |
| `tools/fixtures/regression/ui-approved-updates.json`、`tools/map-frame-review.json`、`tools/map-identity-review.json`、`tools/visual-refinements.json` | 冻结哈希链更新（含 reason） |

`git diff --stat HEAD`（**累积**，含第 2/3/4 轮，因为都未 commit）：

```
 miniprogram/pages/map/index.js                     | 335 +++++++++++++++++++--
 miniprogram/pages/map/index.wxml                   |  39 ++-
 miniprogram/pages/map/index.wxss                   |  29 ++
 miniprogram/utils/mapMarkers.js                    | 289 +++++++++++++++---
 package.json                                       |   8 +-
 tools/fixtures/regression/ui-approved-updates.json |   8 +-
 tools/map-frame-review.json                        |   4 +-
 tools/map-identity-review.json                     |   8 +-
 tools/verify-cloud.cjs                             | 115 ++++++-
 tools/verify-map-motion.cjs                        |  22 +-
 tools/verify-map-photo-recovery.cjs                |   2 +-
 tools/visual-refinements.json                      |   4 +-
 12 files changed, 747 insertions(+), 116 deletions(-)
```

新增未跟踪文件：`tools/verify-map-overlay-drawer.cjs`、`miniprogram/utils/mapTrace.js`（第三轮）、
以及 4 篇 `docs/reviews/map-*20260926.md`。

**未 commit / 未 push / 未 deploy。**
