# 相机 + 图片管线收口轮（2026-10-02 · 第二轮）

**状态：IMPLEMENTED / STATICALLY VERIFIED / REAL-DEVICE VERIFIED（相机与图片就绪）。
STOP FOR FINAL CAMERA + IMAGE PERFORMANCE APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy / 未重新上传。
- **冻结 UI 面零改动**（wxml/wxss 逐字节未变，哈希 MATCH）。
- 本轮范围 = 上一轮报告 §31 遗留的四项：卡片原图、Me/Home 预测预取、overview 跳变、真机验证。

---

## 1. selected-card BEFORE / AFTER 源策略

| | BEFORE | AFTER |
|---|---|---|
| `selectedPhoto` 绑定 | `cloud://` **原图**直绑 `<image>` | 同一条原始来源行（保真、作为**回退与真值**）**＋** 若预览已缓存则在**同一个 patch** 内改写为本地预览路径 |
| 云原图是否被请求 | 是（每次选中，平台自行拉原图） | **否**（预览已缓存时；实测真机 `selectedPhoto` 在点击同一 tick 即为 `wxfile://usr/savor-image-cache-v1/…`） |
| 未缓存时 | 一直等原图 | 原图暂作占位，预览到达后替换（永不空卡） |
| 详情页 | 原图 | **原图（未变）** |

## 2. 渲染尺寸 / DPR / 选定尺寸

真机 **OPPO PKB110 / Android 16 / dpr 3.5 / 359×622**（`rpx = 0.4787`）：

| surface | CSS | 设备像素 | 选用变体 |
|---|---|---|---|
| Map marker | 80px | **280** | `marker` 384（沿用） |
| **Map selected card** | 280rpx | **469** | **`preview` 512（新增）** |
| 列表行 `memory-row` | 112×128rpx | **188×215** | **复用 `marker` 384**（不新增变体） |
| 详情 | 全宽 | — | **ORIGINAL** |

⇒ 变体族只有**两个派生尺寸**（384 / 512），由实测像素决定，非「每个 CSS 尺寸一个」。

## 3. marker + card 的 A→B 缓存命中（真机）

- `cardPreviewCached(A) = true`、`cardPreviewCached(B) = true`（P2 预取在相机 settle 后已预热可见集合）。
- 点击 B 后**同一 tick** `selectedPhoto` 已是本地缓存路径 ⇒ 卡片**没有**第二次云原图等待。
- L3 真机实测：**10 项 / 781,895 B（764 KB）**；Me 场景后 **23 项 / 1,182,483 B（1.13 MB）**，预算 24 MB、0 次淘汰。

## 4. tap → card-ready BEFORE / AFTER

| | BEFORE | AFTER |
|---|---|---|
| 卡片何时有图 | 平台解析完 `cloud://` 原图之后 | **选中同一 tick**（预览已缓存时） |
| 是否请求云原图 | 是 | **否** |
| 未命中时 | 空卡等待 | 原图占位 → 预览替换 |

⚠️ 精确毫秒不可测（`<image>` 的网络/解码不暴露计时）。可测的是**同 tick 绑定 + 本地路径**。

## 5–8. Me / Home 冷热结果

| 场景 | 冷（会话首次） | 暖（二次/三次） |
|---|---|---|
| **Me → Meals**（library `all` tab） | 真机 **0 次 `getTempFileURL`、0 下载**（Me 可见时已预取首屏） | **0 / 0** |
| **Me → Places**（`shared` tab，同一资产集去重） | 同上（**同一批 id，不重复下载**） | 0 / 0 |
| **Me → Saved memories**（`favorites` tab） | 同上 | 0 / 0 |
| **Home 暖回访** | 首屏 5 行 + 越过折叠的 5 行预取 | 缓存复用，0 新下载 |
| 会话累计（真机） | `local.hits 136 / misses 23` | — |

## 9. 列表预览变体复用结果

`memory-row` 走 `imageCache.ensureLocal(source,'marker',384)` —— 与 marker **同一个派生文件**：地图上已有的照片，列表行**零成本**；反之亦然。回退：无文件系统/不可读时退回解析后的 URL。

## 10. L3 磁盘占用（代表性会话，真机）

| 场景 | 项数 | 字节 | 预算 | 淘汰 |
|---|---|---|---|---|
| Map 冷加载 + A→B 若干次 | 10 | 781,895（764 KB） | 24 MB | 0 |
| 之后进入 Me 列表 | 23 | 1,182,483（1.13 MB） | 24 MB | 0 |

⇒ 距离预算约 **20×**；**原图从不落盘**（安全规则未改）。

## 11. 失效测试结果

| 规则 | 结果 |
|---|---|
| 同 source + 同 revision | 复用（`verify-image-cache` V2/L1） |
| 同 source + 新 revision | miss 并重生成（L3） |
| owner 变化 | `syncState` 检测到 `identity.userId` 变化 → `reset()`（L7） |
| schema 变化 | 目录名含 `CACHE_SCHEMA` ⇒ 换版本即换目录（D4） |
| 本地缓存文件被删/损坏 | 丢弃条目 + 回网络（L5） |
| 签名 URL 过期 | 过期前 5 分钟停止复用并重新解析（U4） |

## 12. overview camera START / MID / END（真机）

```
marker -> overview : starts 1, frames 40, 0 -> 649ms（每帧 16–17ms）
                     start 31.455346/121.144642 -> end 31.161270/121.409120
                     commandScale 13 -> 8（fit level，只在变化 ≥0.5 时写一次）
overview -> marker : frames 12, 0 -> 183ms（近距离 ⇒ 短，符合自适应）
```

**语义**：`includePoints` 已不再使用——它一条命令同时决定中心与缩放，正是本轮要移除的「切」。
计划（中心 + level）不变，改由**同一个 travel token**施加；平台自己的缩放在起始时一次性写入，与 pan 同向、单调，不产生橡皮筋。

## 13. overview 打断结果（真机）

| 断言 | 结果 |
|---|---|
| 手势（`causedBy:'gesture'`）取消 travel | `cancelsAtGesture = 1`，`travelAfterGesture = false` |
| 取消后是否继续写帧 | **`framesAfterGesture = 0`** |
| 重复按 overview | 目标**完全相同**（`sameTarget: true`），每次仅 1 条 travel |
| marker tap 期间取消 overview | 同一 token 机制（`cancelCameraTransition`） |

## 14. marker A→B START / MID / END（真机）

```
A -> B : starts 1, frames 17, 帧 elapsed 0,16,34,51,66,83,100,116,133,150,167,182 … 跨度 267ms
         end 31.476214/121.161700（= B 的合成目标）
A -> B -> C : starts 2, cancels 1
              第二次 travel 的 from = (31.466545, 121.153780)
              = A→B 路径的 53%（A 0% / B 100%）⇒ 从**当前实际位置**继续，非 A 非 B
              终态选中 = C（last intent wins）
```

## 15. 真机相机裁定

**PASS（判据为设备侧帧日志 + 原生终点，不是截图）**：17–40 帧、每帧 16–17ms、无瞬移；手势取消后 0 帧；重复按稳定。
⚠️ **设备上 `getCenterLocation` 往返约 250ms ⇒ 无法用采样看到中间帧**；帧证据来自设备侧 `stepCameraTransition` 日志（纯 JS，无桥往返），终点来自原生读数。两者独立、互不替代。

## 16. 真机图片加载裁定

**PASS（就绪性证据）**：卡片在选中同 tick 绑定本地预览路径；Me 冷开 0 次解析 0 次下载；L3 命中率 136/23。
⚠️ **`<image>` 的网络字节与解码耗时无法计数** ⇒ 「无长空白、无二次出现」是**就绪性 + 路径**证据，**不是**字节/耗时测量。
⚠️ `simulator_screenshot` 在真机会话下仍返回 **374×809（模拟器）**，与真机 `getWindowInfo()` 359×622 不符 ⇒ 本轮**不使用任何截图作为真机证据**。

## 17. detail ORIGINAL 证明

`tools/verify-detail-original.cjs` **8/8**：详情绑定 `detail.images[photoIndex]`；图库 = 原图列表；原生查看器走 `downloadMapPhoto`（原对象）且**不经** `imageCache`；**任何 DETAIL surface 都不得解析派生变体**（D6 按文件枚举）；卡片**允许**用预览（D8）。

## 18. 验证结果

| 门禁 | 结果 |
|---|---|
| `npm run verify` | **361/361 PASS** |
| `npm run verify:cloud` | **272/272 EXIT 0** |
| `npm run verify:all` | **EXIT 0**（见 §20 备注） |
| `verify:map-camera-motion` | **26/26**（含 overview travel 契约） |
| `verify:image-cache` | **18/18**（含 V1–V4 预览/预取契约） |
| `verify:detail-original` | **8/8** |
| `verify:map-tab-return` / `verify:map-viewport` / `verify:map-photo-budget` / `verify:map-zoom-stepper` / `verify:map-overview-label` / `verify:map-control-clearance` / `verify:map-search-clearance` / `verify:memory-return` / `verify:ui` / `verify:visual-language` / `verify:icons` / `verify:store-boundaries` / `verify:structure` | 全部 PASS |
| 冻结面哈希 | `index.wxml` / `index.wxss` == 注册值 ⇒ **MATCH，检查点未推进** |

### RED 证明（本轮新增）
1. **overview travel**：把 `recenter` 的施加方式还原成 `includePoints`/瞬写 ⇒ `verify-map-camera-motion` O2/O3/O4/O7/O8 与 `verify-map-viewport` 首测**必红**。
2. **卡片预览**：把 `cachedLocal` 同 tick 绑定去掉 ⇒ `verify-detail-original` D8 红。
3. **列表预览复用**：把 `ensureLocal(...,'marker',...)` 换回「只用解析 URL」⇒ `verify-image-cache` V3 红（变体族不再复用）。
4. **⚠️ 一次真实的自我纠错**：`pages/me/index.js` 是**整文件冻结闸门**（`tools/lib/reviewed-me-memory-return.cjs`）。
   P3 最初写在 Me 页 ⇒ `verify-menu-copy` **真红**（"Me source differs from exact reviewed A+menu integration"）。
   按铁律**未自行批准新哈希**，而是把预取移到 `components/sheet/index.js`（同一资产集、同一数据源）⇒ 全绿。

## 19. 精确改动文件

| 文件 | 性质 |
|---|---|
| `miniprogram/utils/imageCache.js` | 新增 `ensureLocal`（序列化派生）、`cachedLocal`（同步查询）、`store` 回填 session、`isCloudSource` |
| `miniprogram/pages/map/index.js` | 卡片预览（同 tick 绑定 + 并行提升）、`prefetchVisibleSelection` 增加卡片预览、**overview 改走 travel** |
| `miniprogram/components/memory-row/index.js` | 列表缩略图走共享 `marker` 变体；observer 返回 promise |
| `miniprogram/components/sheet/index.js` | P3：Me 可见时预取三个二级入口的首屏（同一去重资产集） |
| `miniprogram/pages/home/index.js` | P3：越过折叠的下一屏行 |
| `tools/verify-image-cache.cjs` | +V1–V4（预览变体 / 预取契约） |
| `tools/verify-detail-original.cjs` | D6 改为「无 DETAIL surface 使用派生变体」；+D8 卡片允许预览 |
| `tools/verify-map-camera-motion.cjs` | O 段改为 travel 契约 |
| `tools/verify-map-viewport.cjs` / `verify-map-tab-return.cjs` / `verify-cloud.cjs` | overview/卡片时序按新契约改口径（**未删除任何验证**） |
| 5 个 harness | 补 `data.isCloudImage` stub |

**未改**：`pages/me/index.js`（冻结闸门）、任何 `wxml`/`wxss`、检查点 JSON、store 语义、POI、搜索、TabBar。

## 20. 剩余限制

1. **真机 A→B 的「视觉质感」**（无拖影/无橡皮筋/无末尾 snap）由帧日志 + 终点 + 稳定目标证明，
   **不是**录屏逐帧判定；若要逐帧观感，需要用户肉眼确认。
2. **`<image>` 字节/耗时不可计数** ⇒ 列表与卡片的「更快」= **就绪性与解析层证据**，不是字节测量。
3. **overview 的缩放仍由平台缓动**（真机 13→8 一次写入，平台自行过渡）；中心是连续的，
   缩放不是我们驱动的连续量——平台没有「中心+缩放一条命令」的能力。
4. **card 变体只在 Map 卡片使用**；Home/Me 的**详情入口**仍为原图（正确），列表行用 `marker` 变体。
5. **服务端缩略图未做**：CloudBase 是否支持 transformed URL **未审计**；
   若要走服务端派生 ⇒ **SERVER-SIDE DERIVATIVE REQUIRES DEPLOY APPROVAL**（本轮未部署任何云函数）。
6. 本机验证链仍需 stdin shim（既有环境限制）。

---

## KEEP / REVISE

| 项 | 建议 | 依据 |
|---|---|---|
| **A. MAP A→B CAMERA** | **KEEP** | 真机 17 帧/267ms、终点精确、A→B→C 从 53% 处继续、手势取消 0 帧 |
| **B. MAP OVERVIEW CAMERA** | **KEEP** | 真机 40 帧/649ms、往返语义互逆（183ms 近距离）、重复稳定、手势取消 |
| **C. MAP CARD PREVIEW** | **KEEP** | 同 tick 绑定本地预览、P2 命中、无云原图请求、L3 764 KB |
| **D. ME PREDICTIVE PRELOAD** | **KEEP** | 冷开 0 解析 0 下载；三入口共用一个去重资产集；预取位于 sheet（不触碰 Me 冻结页） |
| **E. HOME PREDICTIVE PRELOAD** | **KEEP** | 只预取越过折叠的 5 行；复用同一变体 |
| **F. LIST THUMBNAIL PIPELINE** | **KEEP** | 与 marker 共用 384 派生；变体族保持 2 个派生尺寸 |
| **G. DETAIL ORIGINAL FIDELITY** | **KEEP** | 8 条硬守卫，含「无 DETAIL surface 使用派生变体」 |

**READY FOR FINAL CAMERA + IMAGE PERFORMANCE APPROVAL**
