# Map 真机 A/B 测试单（第三轮）

> 状态：**未 commit / 未 push / 未 deploy**。本文只提供真机填写模板与操作步骤，不含结论。
> 上一轮：`docs/reviews/map-performance-fix-round2-20260926.md`

---

## 0. 本轮冻结了什么

第二轮代码方向已批准，本轮**不再新增优化**。以下全部冻结，真机测试期间不要改：

| 项 | 值 | 位置 |
|---|---|---|
| derivative 长边 | `SOURCE_LONG_EDGE = 384` | `miniprogram/utils/mapMarkers.js:29` |
| download 并发 | `DOWNLOAD_CONCURRENCY = 3` | 同上 `:21` |
| heavy（getImageInfo + compressImage）并发 | `HEAVY_CONCURRENCY = 1` | 同上 `:22` |
| compose 并发 | `1`（共享 canvas，硬编码） | 同上 `:107` |
| renderer cache 上限 | `LIMIT = 512` | 同上 `:11` |
| marker 导出分辨率 | 768×858 | 未改 |
| camera / grouping | 未改 | — |
| `mapStack.DURATION` | `320` | 未改 |
| easing | 现有 cubic curve | 未改 |

本轮**唯一**允许切换的开关是 drawer 的动效驱动（见 §2）。

---

## 1. 怎么切换 Drawer 的两个版本

只有一个字段，位于 `miniprogram/pages/map/index.js:78`：

```js
drawerCssMotion: true,     // B 版（CSS transform）
drawerCssMotion: false,    // A 版（JS 帧循环）
```

- **当前值 = `true`**（即 B 版），供你直接做真机 preview。
- 切到 A 版只需把 `true` 改成 `false`，**其它任何字符都不要动**。
- 两种版本除这一个 flag 外**完全一致**（同一份 `index.js` / `index.wxml` / `index.wxss`）。
- 不要同时调 `DURATION` 或 easing —— 那会让 A/B 失去意义。

两个驱动都是**可用**的，不是「新版替换旧版」：CSS path 关闭时走的是第一轮已验证的 JS 帧循环，`startDrawerReveal` / `patchDrawerFrame` 都还在。

---

## 2. 怎么打开 dev trace（不会出现 debug UI）

trace 是**默认关闭**的，关闭时零开销，且**没有任何正式 UI 元素**（`index.wxml` 里零引用）。

在微信开发者工具的 Console 里执行一次（写入 storage，冷启动也会读到）：

```js
require('./utils/mapTrace').setEnabled(true)
```

读取：

```js
const t = require('./utils/mapTrace')
console.log(JSON.stringify(t.snapshot(), null, 1))   // 逐条记录，上限 240 条
console.log(JSON.stringify(t.summary()))             // { jobs, byResult, limit }
t.clear()                                            // 清空
t.setEnabled(false)                                  // 关闭
```

### 每条记录只会包含这些字段

```
jobId, selected, sourceKind,
originalWidth, originalHeight, originalBytes,
derivativeWidth, derivativeHeight, derivativeBytes,
stage, applyResult, reason,
downloadMs, downsampleMs, decodeMs, composeMs, exportMs, totalMs
```

`stage` ∈ `download | downsample | decode | compose | export`
`sourceKind` ∈ `bundled | local | cloud`
`applyResult` ∈ `applied | stale-but-rebound | ready-cache-rebound | clustered | source-changed | superseded | disposed | gesture-deferred`

**结构上不可能泄漏**：只有白名单枚举值能存进去，任何其它字符串都会塌缩成 `other`；路径、fileID、商家名、openid 都不在字段表里，写不进去。这一点有测试守着（`verify:marker-apply` 的 trace 用例会断言快照里不含 `wxfile://` / `cloud://` / `/tmp/` / `/images/`）。

**这个字段表就是下一轮判断「图片太大」还是「生成了但没贴回」的唯一依据** —— 请把填完模板后的 `snapshot()` 一起贴回。

---

## 3. 真机填写模板

> 填之前：先按 §1 选版本，按 §2 打开 trace。

```
## Marker

selected first photo:
___ ms

普通 marker 首图:
___ ms

所有 visible singleton 最终是否恢复:
PASS / FAIL

特定 zoom fallback:
PASS / FAIL

zoom oscillation:
PASS / FAIL

后台恢复:
PASS / FAIL

是否出现 IMAGE / EXPORT failure:
YES / NO

最大原图:
___ × ___
___ bytes

derivative:
___ × ___
___ bytes

## Drawer A — JS

展开主观:
smooth / slight jank / bad

收起:
smooth / slight jank / bad

## Drawer B — CSS

展开:
smooth / slight jank / bad

收起:
smooth / slight jank / bad

快速反向:
PASS / FAIL

hit target:
PASS / FAIL

up/down:
PASS / FAIL

paging:
PASS / FAIL

## Recommendation

只根据真机结果判断：

- CSS path enable by default
或
- CSS path reject
```

### 对应的操作场景

| 模板里的行 | 怎么测 |
|---|---|
| selected first photo | Case M1：首次进 Map，选中 marker 从 fallback 变照片的耗时 |
| 普通 marker 首图 | Case M1：同时记录一个普通 marker 的耗时 |
| 所有 visible singleton 最终是否恢复 | Case M2：停留 10 秒，看当前 viewport 里所有 singleton |
| 特定 zoom fallback | Case M3：放大 → 缩小 → 放大 → 停止（即以前会「不加载」的比例） |
| zoom oscillation | Case M4：快速跨 grouping threshold，cluster → singleton → cluster → singleton |
| 后台恢复 | Case M6：后台 5 秒 → 回 Map |
| 快速反向 / hit target / up-down / paging | Drawer B 的 fail-safe 清单（见 §4） |
| 最大原图 / derivative | 从 `snapshot()` 里取 `originalWidth/Height/Bytes` 与 `derivativeWidth/Height/Bytes` 的最大值 |
| IMAGE / EXPORT failure | `snapshot()` 里有没有 `reason: 'decode-failed' / 'compose-failed' / 'export-failed' / 'timeout'` |
| Case M5（快速连点 5 个 marker） | 不是独立一行，看 selected 是否优先出图：`applyResult` 里 selected 的 job 是否先到 `applied` |

---

## 4. Drawer B 的 fail-safe 判定（真机）

出现以下任一情况，**立即判 CSS path FAIL，不要用更多 JS 补帧掩盖**：

- row 停在 collapsed offset（没走到最终位置）
- transform 不执行
- opacity 不执行
- hit box 与视觉错位

需要逐个确认的行为：

- [ ] row collapsed 时位置正确
- [ ] 打开后全部到最终位置
- [ ] root / button 位置正确
- [ ] upward / downward drawer 都正常
- [ ] paging 正常
- [ ] 点击区域跟视觉位置一致
- [ ] 收起后 invisible row 不可点击
- [ ] reduceMotion 直接到最终状态
- [ ] 快速展开 → 收起 → 展开不卡中间状态

> **必须真机验证的原因**：`transform` / `opacity` 的 transition 是否在 native map 的 `cover-view` 内生效，Node 和开发者工具**都答不了**。如果开发工具跑得动但真机不行，那就是需要换 overlay 架构，不是调参能解决的。

---

## 5. Node / DevTools 已经证明的部分（真机不需要重复测）

这些是**合成时钟**下的结论，只证明调度结构，不代表真机耗时：

| 项 | 结果 | 由谁证明 |
|---|---|---|
| CSS drawer 一次开合的 JS 写入 | **1 次**（0 次帧写） | `verify:map-drawer-motion` D1 |
| JS drawer 一次开合的 JS 写入（对照） | **22 次**（21 次帧写） | 同上 D1 contrast |
| 两个驱动的**展开终态几何完全相同** | 相同 | 同上 D2 / D3 |
| CSS 关闭态的 row 偏移落在真实 collapsed 布局上 | 是（up/down 都验） | 同上 D3 |
| reduceMotion 不播动画且仍到终态 | 是 | 同上 D4 |
| CSS transition 用的是 320ms + 现有曲线 | 是 | 同上 D5 |
| hit region 与视觉共用同一个 offset 变量 | 是 | 同上 D7 |
| 收起后 row 的 `pointer-events` 为 none | 是 | 同上 D8 |
| 快速反向能 settle、无卡中间态 | 是 | 同上 D9 |
| paging 打的是**被点开的那个 cluster** | 是 | 同上 D10 |
| 60 个 singleton 全部进入 renderer（旧实现固定丢后 12 个） | 60/60 | `verify:marker-apply` A5 |
| 10 张同时就绪的 marker 写入 | **2 次**（旧实现 10 次） | 同上 C1 |
| 20 / 48 marker 的 selected 排队等待 | 0ms（旧 1366 / 3438ms） | Phase D 探针 |
| selected 之前抢到槽的 normal 数 | 3（旧 19 / 47）——不随队列长度增长 | 同上 |
| frame decode 次数（48 marker） | **2**（旧 48） | 同上 |
| decode 输入 | **384×288**（旧 4000×3000 ≈ 46 MiB RGBA） | 同上 |
| 峰值并发 download / heavy / compose | **3 / 1 / 1** | 同上 |

---

## 6. 仍然 REQUIRES REAL DEVICE（探针里全是注入值）

- `wx.cloud` 真实下载延迟
- `canvasToTempFilePath` 真实耗时与真实 PNG 字节
- **`wx.compressImage` 是否真的避免了解码原图** —— 如果不避免，derivative 的收益会被抵消。这一条直接影响 §3 里「derivative」那两行的解读
- 真机 decode 内存峰值
- `cover-view` 每帧重排
- 真 FPS
- CSS transform 在 native callout 内是否生效

---

## 7. 本轮明确不做

- 不改 384 / 256 / 512，不改 JPEG quality
- 不改 marker 导出 768×858
- 不做 cloud thumbnail sidecar（如果本轮真机显示首次 Map 主要卡在 cloud download，下一轮再考虑）
- 不 commit / push / deploy
