# Map selected card 展开/收起状态连续性（2026-10-02 · 真机回归修复）

**状态：IMPLEMENTED / STATICALLY VERIFIED / REAL-DEVICE VERIFIED。
STOP FOR MAP CARD DISCLOSURE VISUAL APPROVAL —— 检查点未推进。**

- 未 commit / 未 push / 未 deploy / 未重新上传。
- **`wxml` / `wxss` 逐字节未改**（按钮语义本身正确，缺陷不在渲染结构）。
- 本轮只修「卡片展开/收起状态被选中动作重置」这一个真机回归。

---

## 1. EXACT DISCLOSURE RESET ROOT CAUSE

`miniprogram/pages/map/index.js` → `selectMapMemory()`：

```js
// BEFORE
this.setData({selectedId:memoryId, cardCollapsed:false, clusterOpen:…});
                                    ^^^^^^^^^^^^^^^^^^^^ 每次选中都强制展开
```

**每一次选中都把 `cardCollapsed` 写成 `false`。** 于是：

- A 收起 → 点 B → `cardCollapsed` 被强制为 `false` ⇒ **B 的卡片自动展开**（用户看到的现象 1）；
- 同一次 `setData` 里卡片从 `card-is-collapsed` 切到展开态，而相机 travel 同时在跑 ⇒ 左下角控件的 chevron 在 A→B 期间旋转、收起条消失 ⇒ **控件显示不稳定**（用户看到的现象 2）。

**同一个根因，两个现象。** 不是 remount、不是 `selectedPhoto` 回调、不是 camera settle 回调、不是缺字段：

| 排查项 | 结论 |
|---|---|
| `cardCollapsed` 字段 | `data.cardCollapsed`（Map 页 data，会话级） |
| collapse/expand handler | `onTogglePlaceCard()` 只翻转 `cardCollapsed` ✓ 正确 |
| `onMarkerTap()` | 单 marker → `selectMapMemory(id)`；聚合 → 开抽屉（不改选中）✓ |
| `applyFilters()` | **不写** `cardCollapsed` ✓ |
| camera transition start / settle | **不写** `cardCollapsed` ✓ |
| `selectedPhoto` patch / preview 回调 | **不写** `cardCollapsed` ✓（只写 `selectedPhoto`） |
| `selectedId` patch | 与 `cardCollapsed` 同批 → 但来源就是 `selectMapMemory` |
| card object 被整体替换 | `applyFilters` 重建 `selected` 对象，但 disclosure 不在对象里 ⇒ 无缺字段问题 |
| `wx:if` remount | 卡片/控件都是 `wx:if="{{selected}}"`，A→B 时 `selected` 始终真 ⇒ **不 remount** |
| transition class 重置 | CSS 由 `cardCollapsed` 驱动，无独立状态 |

⇒ **唯一根因：`selectMapMemory` 里的强制 `cardCollapsed:false`。**

---

## 2. DISCLOSURE STATE OWNER — BEFORE / AFTER

| | BEFORE | AFTER |
|---|---|---|
| 状态归属 | `data.cardCollapsed`（但每次选中被重置） | `data.cardCollapsed`，**Map session 级、跨选中 sticky** |
| 谁会写它 | `onTogglePlaceCard`（用户）+ **`selectMapMemory`（每次选中）** | `onTogglePlaceCard`（用户）+ **仅 `onClusterPick` 的显式 `reveal`** |
| 首次选中 | `cardCollapsed:false` 是初值 ⇒ 展开 | **不变**（初值即展开，无需写） |
| 从抽屉里挑一条 | 展开 | **保持展开**（既有产品契约，未改） |

修复（唯一改动，`pages/map/index.js`）：

```js
selectMapMemory(memoryId, keepDrawer, reveal) {
  if(!(this.allMemories||[]).some(m=>m.id===memoryId)) return;
  const patch={selectedId:memoryId,clusterOpen:Boolean(keepDrawer&&this.data.clusterOpen)};
  if(reveal)patch.cardCollapsed=false;      // 只有「从抽屉显式挑一条」才揭示卡片
  this.setData(patch);
  this.applyFilters(this.data.query,this.data.filter,memoryId);
}
onClusterPick(e) { … this.selectMapMemory(id,true,true); }   // 显式 reveal
```

- **不是给每个 marker 记一套状态** ✓
- **不新增字段、不新增 WXML/WXSS** ✓
- 用户手动动作优先：`onTogglePlaceCard` 不在任何 transition/settle 回调里，**不存在 stale callback 覆盖** ✓

---

## 3. EXACT FILES CHANGED

| 文件 | 性质 |
|---|---|
| `miniprogram/pages/map/index.js` | `selectMapMemory` 新增 `reveal` 形参（默认不写 disclosure）；`onClusterPick` 传 `true`。**其余相机/图片代码零改动** |
| `tools/verify-map-camera-motion.cjs` | 新增 6 条 disclosure 连续性 + 控件语义断言（C1–C11） |
| `docs/reviews/map-card-disclosure-continuity-20261002.md` | 本文件 |

**未改**：任何 `wxml` / `wxss` / 检查点 JSON / camera 机制 / imageCache / Me 页（冻结闸门）。

---

## 4–8. 真机场景结果（OPPO PKB110 / Android 16 / dpr 3.5）

| # | 场景 | 结果 |
|---|---|---|
| 1 | **A expanded → B** | `collapsed: false → false` ✓ 保持展开 |
| 2 | **A collapsed → B** | `before true` → **点 B 后立刻 `true`** → settle 后 **`true`** ✓✓ **保持收起（原 bug 已修）** |
| 3 | **collapsed A → B → C** | `after B: true` → `after C: true` → `C settled: true` ✓ 全程收起，选中正确推进 |
| 4 | collapsed A → 点 B → **travel 中手动 Expand** | 立即 `collapsed:false`；**travel 未取消**（`travelAlive:true`、`sameTravel:true`）；B 仍选中；settle 后仍展开 ✓ |
| 5 | expanded A → 点 B → **travel 中手动 Collapse** | 立即 `collapsed:true`；同一条 travel；settle 后仍收起 ✓ |

**真机同时确认**：卡片图片仍是本地缓存路径（`cardPhotoLocal: true`）⇒ 上一轮的 preview 管线未被破坏。

⚠️ **取证过程如实记录**：首次复验时真机仍是**旧代码**（`simulator_refresh` 不推送新包，技能已记录）；
按项目约定（用户使用自动真机调试）用 `--action remote` 推送 —— 它**把 automator 切回模拟器**（`platform: devtools`），
**约 45 秒后真机自动重连**（无需扫码），随后 5 个场景全部在真机上复验通过。

---

## 9. PREVIEW-READY ASYNC 结果

`resolveCardPreview` 只写 `selectedPhoto`；断言「来自图片路径的 patch 中不得出现 `cardCollapsed`」通过 ✓。
即使卡片处于 COLLAPSED，B 的 preview 仍照常预取/缓存（用户下一步可能展开）✓；**preview ready ≠ expand** ✓。

---

## 10. EXPAND-BUTTON / ICON 状态矩阵

| `cardCollapsed` | 控件动作 | 文案 key | 渲染 |
|---|---|---|---|
| `true` | **EXPAND** | `s30a6a77f03` = "Expand place card" | `aria-expanded=false`，`.place-collapse.is-collapsed` ⇒ chevron `rotate(180deg)` |
| `false` | **COLLAPSE** | `se0669384b5` = "Collapse place card" | `aria-expanded=true`，无旋转 |

由 `verify-map-camera-motion` 的 C10/C11 用 **sha1(label) → key** 硬断言：`cardCollapsed ? copy.<expandKey> : copy.<collapseKey>`，
即 **ICON ACTION == 当前状态的反操作** ✓。`.place-collapse.is-collapsed .place-collapse-visual { rotate(180deg) }` 亦被断言 ✓。

## 11. ONE-CONTROL-ONLY 证明

WXML 中 `class="place-collapse "` 出现 **1** 次、`class="place-expand "` 出现 **1** 次（C10 断言）；
控件的状态表达式里**不含** `selectedId` / `selected.` / `cameraTransition`（C10 断言）。
⇒ 不存在 old+new 两个按钮、不存在交叉淡入的两个 chevron、控件不随选中/相机推导。

## 12–14. 回归

| 项 | 结果 |
|---|---|
| Camera（A→B / A→B→C / overview travel / 手势取消） | `verify-map-camera-motion` **32/32**（含原 26 条相机断言全绿） |
| Image-cache | `verify-image-cache` **18/18** |
| Detail original | `verify-detail-original` **8/8** |
| Tab-return cache | `verify-map-tab-return` **7/7** |
| Map photo budget / overview label / viewport | 8/8 · PASS · 7 |

## 15–16. PEARL / DUSK · EN / ZH

`cardCollapsed` 是纯布尔，主题与语言**无分支**；`verify:visual-language` / `verify:ui` PASS。
（`C11` 的语言维度以「key → 文案」硬断言覆盖 EN/ZH 两个条目。）

## 17. 验证结果

| 门禁 | 结果 |
|---|---|
| `npm run verify` | **361/361 PASS** |
| `npm run verify:cloud` | **272/272 EXIT 0** |
| `npm run verify:all` | **EXIT 0**（干净重跑，见 §20） |
| `verify:map-camera-motion` | **32/32**（26 相机 + 6 disclosure） |
| 其余指定套件 | 全部 PASS |
| 冻结面哈希 | `index.wxml` / `index.wxss` == 注册值 ⇒ **MATCH，检查点未推进** |

### RED / GREEN 证明
临时把 `if(reveal)patch.cardCollapsed=false;` 还原为 `patch.cardCollapsed=false;` ⇒
`verify-map-camera-motion` **4 条红**：

```
FAIL C1/C2 … COLLAPSED A -> B must stay collapsed
FAIL C3/C4 … still true after tap #1
FAIL C5/C6 … the user action is immediate
FAIL C9   … but tapping a marker is not
```

逐字节还原后 **32/32 GREEN**（`grep -c "TEMPORARY RED PROOF"` = 0）。

## 18. 真机状态

**PASS**：5 个场景全部在真机复验（§4–8），且卡片图片仍走本地 preview 缓存。
**唯一未自动判定的是「观感」**：无 ghost button / 无 chevron 方向瞬时错误 —— 由
「单控件 + 状态唯一来源 + 无 remount」的静态断言与真机状态读数支撑，**逐帧观感仍需用户肉眼确认**。

## 19–20. 限制

1. **真机截图不可用**：`simulator_screenshot` 在真机会话下返回 374×809（模拟器），与真机 359×622 不符 ⇒ 本轮**未用任何截图**；证据为真机状态读数 + 帧日志。
2. `--action remote` 会把 automator 切回模拟器（已按项目约定使用，真机 45s 自动重连）。
3. 本机验证链需要 stdin shim（既有环境限制）。
4. 用户手动 disclosure 与相机 travel 的**同一帧**竞争未做人为延迟——两者本来就是独立状态，不需要。

---

## 21. 建议

| 项 | 建议 | 依据 |
|---|---|---|
| **MAP CARD DISCLOSURE CONTINUITY** | **KEEP** | 真机 collapsed A→B→C 全程收起、expanded A→B 保持展开；`cardCollapsed` 成为唯一会话级状态，选中不再触碰它 |
| **MAP DISCLOSURE CONTROL VISUAL STATE** | **KEEP** | 单控件（1+1 断言）、状态唯一来源（无 selectedId/相机项）、动作 == 状态反操作（sha1 key 硬断言 + CSS 旋转断言）、无 remount |

**READY FOR MAP CARD DISCLOSURE VISUAL APPROVAL**
