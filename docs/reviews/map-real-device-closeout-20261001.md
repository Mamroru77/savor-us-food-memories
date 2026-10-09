# MAP — 真机 P0 收口取证（P0-1 照片 + P0-2 Tab 返回缓存）

**日期**：2026-10-01
**性质**：**纯取证轮**。**生产文件改动 = NONE**（`find . -newermt "2026-10-01 08:35"` 在 `miniprogram/`、`cloudfunctions/`、`tools/` 下**无任何文件**）。
**未 commit / 未 push / 未 deploy。**

---

## 0. 设备与取证手段

| | |
|---|---|
| **DEVICE** | **OPPO PKB110 · Android 16**（运行时读出 `platform: android` / `brand: OPPO` / `model: PKB110`），微信基础库 **3.17.3** |
| 视口 | `windowWidth 359 × windowHeight 622`，`pixelRatio 3.5` |
| 取证方式 | **在手机上执行只读探针**（真机调试 automation），只回传类别/布尔/计数/哈希；未写 storage、未改文件 |
| 计数口径 | 在设备运行时对 `cloudRecords.listRecords` / `downloadMapPhoto`、`store.syncCloud`、`mapMarkers.createRenderer`(+`render`/`dispose`/`peek`)、`wx.createMapContext`(+`includePoints`/`moveToLocation`/`getScale`/`getRegion`) 做**只读包装计数** |

### ⚠️ 截图**不能**作为真机证据（本轮实测证明）

| 通道 | 结果 |
|---|---|
| `simulator_screenshot` | 返回 **374 × 809** |
| 真机 `getWindowInfo()` | **359 × 622** |

两者不一致 ⇒ **`simulator_screenshot` 截的是模拟器，不是手机**。
按 brief 的「Do not use DevTools screenshots to convert an UNVERIFIED result into PASS」，
本轮**不使用任何截图**作为真机证据；纯视觉项（有无闪白、有无可见加载序列）**一律 UNVERIFIED**。
本环境也无法录制手机屏幕。

---

## TEST 1 — 魏家凉皮照片

**步骤**：`wx.reLaunch` 清空页面栈（等效于全新进入）→ `switchTab` 进 Map → 等 Map 可用 → 选中魏家凉皮。

| | OBSERVED（真机） |
|---|---|
| Map 加载后 | `markerCount: 13`，**`markersOnFallback: 0`**，`imageErrors: 0` |
| 照片下载 | **13 次，每个 fileID 恰好 1 次**（无重复）；其中包含 **`…1790281335752-7zv92r/0.jpg`（魏家凉皮那条 10 607 530 B 的旧图）** |
| 选中后 marker | `sel: true`，`80 × 89`（选中变体），**`kind: composed`** |
| 选中后卡片 | `selectedPhoto` = 真实 cloud fileID（165 字符），**不是默认餐图**；`imageErrors: 0` |
| 最终 | `markersOnFallback: 0`（**无永久 fallback**） |

**EXPECTED**：marker 缩略图渲染 / 卡片照片渲染 / 无永久 fallback / 无破图 / 无空图矩形。

**RESULT：PASS**（marker 与卡片**都**显示真实照片；无永久 fallback；`imageErrors` 为 0 ⇒ 无破图）。
> 子项「无空图矩形」属纯视觉，**UNVERIFIED visually**；但计数器显示无 error 且 iconPath 为已合成产物（非空）。

### ⚠️ 本轮实测到的行为（brief 第 10 项「observed re-download behavior」）

**首次「选中」魏家凉皮时，会再发生一次完整下载**：渲染器缓存键是 `[source, selected]`，
选中态是一个**新的变体** ⇒ 同一个 10.6 MB 旧对象被**第二次**下载。
真机上该次合成在约 **40 秒**后完成（其间 marker 短暂显示 fallback，随后替换为合成图）。

- 这**不是** P0-1 回归（第一次下载已成功，卡片始终正常），也**不是** P0-2 回归（Tab 返回时零重下，见 TEST 3）。
- 它是**渲染器既有设计**（选中/未选中各一份缓存）在「单条超大旧记录」上的可见首次选中延迟。
- **未修**（本轮为纯取证轮，且 brief 明示不得改生产代码）。

---

## TEST 2 — Tab 返回（无数据变化）

**步骤**：Map 已完全加载 → 原生相机平移离开初始中心（`moveToLocation 31.443401/121.128975`）→ 非默认缩放（步进器降到 **14**，默认 13）→ 选中一条记忆 → POI 关 → Home → 立即回 Map。

| 观测量 | BEFORE | AFTER（返回后） | 判定 |
|---|---|---|---|
| 原生 region | sw `31.420624,121.113561` / ne `31.466173,121.144386` | **完全相同** | ✅ 中心保持 |
| 原生 scale | 14 | **14** | ✅ 缩放保持 |
| `commandScale` / `dataScale` | 14 / 14 | **14 / 14** | ✅ |
| `selectedId` / `selectedName` | `d69023ce45` / 魏家凉皮 | **`d69023ce45` / 魏家凉皮** | ✅ 选中保持 |
| `showNativePoi` | false | **false** | ✅ POI 保持 |
| `markerCount` | 8 | **8** | ✅ |
| `markersOnFallback` | 0 | **0** | ✅ 无退回 fallback |
| `imageErrors` | 0 | **0** | ✅ |
| **照片下载** | 15 | **15（+0）** | ✅ 零重下 |
| **渲染器新建 / 销毁** | 1 / 0 | **1 / 0** | ✅ 渲染器存活 |
| **render 调用** | 59 | **59（+0）** | ✅ 无 marker 重建 |
| `peek` 命中 | 367 | 385（+18） | ✅ 纯缓存回绑 |
| **返回时相机命令** | — | **`includePoints: 0` · `moveToLocation: 0`** | ✅ 未下发任何相机指令 |
| 云读 | listRecords 1 / syncCloud 1 | **3 / 3** | ⚠️ 见下 |

**EXPECTED**：无空 Map / 无完整加载序列 / 无明显 marker 重建 / 中心·缩放·选中·卡片·POI 保持 / 现有照片仍可见。

**RESULT：PASS**（所有**可测量**项成立：中心、缩放、选中、卡片、POI 逐项相同；**零重下、零重建、零相机命令**）。
> 纯视觉子项（无闪白、无可见加载序列）**UNVERIFIED**（无法录屏）。

### ⚠️ 关于那 2 次云读（如实记录，非缺陷）

`listRecords` 1→3、`syncCloud` 1→3。原因有二，且**都符合已批准的设计**：
1. 距上次 Map 云同步已超过 `MAP_CLOUD_SYNC_INTERVAL_MS = 30 s` 的有界刷新窗口 ⇒ 允许读一次；
2. Home 的 `onShow` 本身就会 `syncCloud()`（既有行为，不属于 Map）。

**关键**：这 2 次读**没有引起任何重建** —— `renderCalls` 59→59、`downloads` 15→15、`markerCount` 8→8、
`markersOnFallback` 0、`peekHits` +18。这正是 P0-2 里「无变化不 commit ⇒ 不通知 ⇒ 不重建」的效果。

---

## TEST 3 — 魏家凉皮照片缓存（Tab 返回）

**步骤**：魏家凉皮选中状态下 Map → Home → Map。

| 观测量 | 结果 |
|---|---|
| 其 marker 是否仍可用 | ✅ 返回前后均 `kind: composed`，`sel: true` |
| **是否发生第二次大图下载** | ✅ **否** —— `weijiaDownloads: 2 → 2`（+0） |
| 是否短暂退回 fallback | ✅ **否** —— 返回后 `markersOnFallback: 0`，`imageErrors: 0` |
| 是否有可见的长重下 | 计数为 0；**视觉 UNVERIFIED**（无法录屏） |

**RESULT：PASS**（无新增下载；marker/卡片未退回 fallback）。

---

## TEST 4 — 真实数据变化后的 Tab 返回（缓存不陈旧）

**做法（必须如实说明）**：Add 页的真实保存需要 UI 手势（选图 / 选点）且会**写入你的真实云日记**，
本环境没有手势 API ⇒ **未走 Add 页 UI 流程**。
改为驱动**一次成功保存最终会执行的那一步 store 提交**：`store.addMemory(saved)` → `commit()` → `revision++` → 通知订阅者
（Map 的失效判定正是依赖这个通知）。**无云端写入、无上传**。探针记录用后即删。

| 观测量 | BEFORE | AFTER | 判定 |
|---|---|---|---|
| `markerCount` | 8 | **9** | ✅ 新记忆出现 |
| 新 marker 存在 | — | **true** | ✅ |
| 既有 marker 全部保留 | — | **true**（8/8） | ✅ |
| `markersOnFallback` | 0 | **0** | ✅ |
| **render 调用** | 59 | **60（仅 +1）** | ✅ 只重建新增那条 |
| **照片下载** | 15 | **15（+0）** | ✅ 既有照片缓存**未全局重建** |
| 渲染器新建 / 销毁 | 1 / 0 | **1 / 0** | ✅ |
| 云读 | 4 / 5 | **4 / 5（+0）** | ✅ 本地提交即为信号，无需读云 |
| 选中 / POI / 缩放 | — | 全部保持 | ✅ |
| 是否需要重启 App / 手动刷新 | — | **否** | ✅ |

**RESULT：PASS**（失效契约成立：**无变化 → 复用；真实变化 → 只刷新受影响的部分**）。
> ⚠️ **Add 页完整保存流程（选图 → 上传 → 云写入）本轮 UNVERIFIED** —— 需要手势且会写你的真实云数据；
> 该链路属 **P0-1** 的范围，与 P0-2 的失效契约无关。

**清理**：`store.deleteMemory('p03-probe-record')` ⇒ 日记回到 **16 条**，marker 回到 **8**，`probeRecordGone: true`；
**云读计数未变**（本地增删，无云写入）。

---

## TEST 5 — 快速连续切换

**步骤**：Map → Home → Map → Us → Map → Me → Map（6 次切换，每次间隔 1.8 s）。

| 观测量 | 结果 | 判定 |
|---|---|---|
| 6 步是否都成功 | ✅ 全部 `ok: true` | ✅ |
| `markerCount` | 8（不变） | ✅ 无重复/无累积 |
| **重复 memoryId 数** | **0** | ✅ 无重复 marker |
| `markersOnFallback` | 0 | ✅ |
| `selectedId` / `selectedName` | `d69023ce45` / 魏家凉皮（仍有效） | ✅ 无陈旧卡片 |
| `showNativePoi` / `commandScale` | false / 14（保持） | ✅ 无错误 tab 状态 |
| `imageErrors` | 0 | ✅ |
| **照片下载** | 15（**+0**） | ✅ **无下载风暴** |
| `weijiaDownloads` | 2（+0） | ✅ |
| 渲染器新建 / 销毁 | 1 / 0 | ✅ |
| **render 调用** | 59（**+0**） | ✅ 无重建 |
| `peek` 命中 | 439（+54） | ✅ 纯回绑 |
| 云读 | listRecords 3→4，syncCloud 3→5 | ⚠️ 有界窗口 + Home 自身同步；`syncFlight` 去重生效 |
| `mapCtx` 新建 | 4（每次 Map onShow 一次） | 既有行为（已记录的未优化项） |
| **相机命令** | `includePoints: 0` · `moveToLocation: 0` | ✅ 无中心/缩放重置 |

**RESULT：PASS**（无重复 marker、无陈旧卡片、无下载风暴、无累积、无相机重置）。
> 纯视觉子项（无闪白、无可见累积延迟）**UNVERIFIED**（无法录屏）。

---

## 证据矩阵汇总

| TEST | DEVICE | RESULT |
|---|---|---|
| 1 魏家凉皮照片（marker + 卡片） | OPPO PKB110 / Android 16 | **PASS** |
| 2 Tab 返回·无数据变化 | 同上 | **PASS**（可测量项）；视觉子项 UNVERIFIED |
| 3 魏家凉皮照片缓存 | 同上 | **PASS** |
| 4 真实数据变化后返回 | 同上 | **PASS**（store 提交路径）；Add UI 全流程 UNVERIFIED |
| 5 快速连续切换 | 同上 | **PASS**（可测量项）；视觉子项 UNVERIFIED |

**FAIL 数：0。**

---

## 最终输出

| # | 项 | 结果 |
|---|---|---|
| 1 | MAP-P0-1 真机结果 | **PASS** |
| 2 | marker 缩略图结果 | **PASS**（`composed`，选中变体 80×89，`markersOnFallback: 0`） |
| 3 | selected-card 照片结果 | **PASS**（真实 cloud fileID，非默认餐图，`imageErrors: 0`） |
| 4 | MAP-P0-2 无变化返回结果 | **PASS**（零重下 / 零重建 / 零相机命令） |
| 5 | 中心·缩放保持结果 | **PASS**（原生 region 逐位相同；scale 14→14；`includePoints/moveToLocation = 0`） |
| 6 | 选中卡片保持结果 | **PASS**（`d69023ce45` / 魏家凉皮 前后一致） |
| 7 | POI 保持结果 | **PASS**（false→false；采完已恢复为 true） |
| 8 | Add 保存失效结果 | **PASS**（+1 marker / 仅 +1 render / 0 下载 / 0 云读）；Add UI 全流程 UNVERIFIED |
| 9 | 快速切换结果 | **PASS**（0 重复 / 0 下载 / 0 重建 / 0 相机命令） |
| 10 | 观察到的重下行为 | **Tab 返回：0 次**（含 10.6 MB 旧图）。**首次「选中」该旧图：+1 次**（渲染器 `[source, selected]` 双缓存），真机约 **40 s** 完成合成，期间短暂 fallback |
| 11 | 取证轮改动的生产文件 | **NONE** ✅ |

## 最终状态

**MAP-P0-1 — CLOSED**
**MAP-P0-2 — CLOSED**
**MAP — FROZEN**

**REAL-DEVICE MAP QA — PASS（所有可测量项）**

⚠️ **保留说明（不夸大）**：以下**纯视觉**判据在本环境**无法取证**，因此保持 **UNVERIFIED**，
需要你提供一段手机录屏才能关闭：
- 「无空白 Map / 无可见完整加载序列 / 无明显 marker 重建」
- 「无可见下载风暴 / 无累积延迟」

原因是可验证的：`simulator_screenshot` 截的是模拟器（374×809 vs 真机 359×622），且本环境无法录制手机屏幕。

---

## 本轮明确没做的事

- ❌ 未改任何生产代码（`miniprogram/`、`cloudfunctions/`、`tools/` 在 08:35 之后**零文件变更**）
- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未重开 Us / Me / Add / Home
- ❌ 未修「首次选中大图会二次下载」这一既有渲染器行为（属新需求，非本轮范围）
- ❌ 未用模拟器截图冒充真机证据
