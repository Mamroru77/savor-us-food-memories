# Add — Round 3-B2：Save / upload 事务状态完整性（2026-09-29）

**未 commit / 未 push / 未 deploy。** P0 / P1-A / P1-B / R3-A / R3-B1 冻结未动（本轮只碰 Save 事务状态）。
**零 motion**：无新增 transition / fade / scale / morph / spring（spinner 保持既有行为）。

---

## 1. Save pipeline graph（**来自真实代码**）

```
onSave()
 ├─ identityFence()（identityReady === false）                → return  ［静默］
 ├─ identity.isDiagnosisActive()                              → setData{error: frozen, errorContext:'save', errorField:''} → return
 ├─ identity.lease() throw                                    → setData{error, errorContext:'save', errorField:''} → return
 ├─ saveLock || uploading                                     → return  ［静默，重复提交保护］
 ├─ setData{error:'', errorContext:'save', errorField:'', fieldErrors:{}}
 ├─ draft.editOperationId（编辑已有记忆）
 │    → saveLock=true; setData{saving:true}
 │    → store.createCloudMemory(editBase, draft)
 │        .then  → setData{draft:freshDraft(), error:''} → switchTab(home)
 │        .catch → setData{error:i18n.t(e.message)}
 │        .finally → saveLock=false; setData{saving:false}
 ├─ !draft.restaurant.trim()   → showFieldError('restaurant') → return ［draft 保留］
 ├─ !isValidDate(draft.date)   → showFieldError('date')       → return ［draft 保留］
 ├─ perCapita 非法              → showFieldError('perCapita')  → return ［draft 保留］
 ├─ saveLock = true; setData{saving:true, saveProgress:10, saveProgressText:<working>}
 ├─ locationPick city/country 不成对 → saveLock=false; showFieldError('geography') → return ［draft 保留］
 ├─ 组装 memory
 ├─ setInterval(400ms) → saveProgress += 5（上限 90）+ working 文案
 ├─ store.createCloudMemory(memory, draft)
 │    .then  → clearInterval; setData{draft:freshDraft(), error:'', saveProgress:100, saveProgressText:<saved>}
 │             + store.notify('A little moment, kept forever. Memory saved.')
 │             + 400ms 后 switchTab(home)
 │    .catch → clearInterval; setData{error: msg || 'Save failed. Your draft is kept.', draft: draft,
 │                                     saveProgress:0, saveProgressText:''}   ← draft 显式还原
 │    .finally → clearInterval; saveLock=false; setData{saving:false}; 1000ms 后若 !saving 归零进度
```

| 边 | handler | state/data | 用户可见信号 | 恢复行为 | draft 行为 |
|---|---|---|---|---|---|
| 校验失败 | `showFieldError` | `fieldErrors`, `errorField` | 字段内联 caption（R3-A） | 就地修正 | **保留**（未触碰） |
| 上传+落库 | `store.createCloudMemory` | `saving`, `saveProgress` | 按钮 ghosted+spinner+文案；进度条在页顶 | — | 成功后 `freshDraft()` |
| 失败 | `.catch` | `error`, `errorContext:'save'` | 表单级错误（Save 上方） | **再点 Save** | **显式还原 `draft`** |
| 冻结 | `isDiagnosisActive()` | `businessFrozen` | 按钮文案 + 表单错误 | 等诊断结束 | 保留 |
| 身份未就绪 | `identityFence()` | `identityReady` | 整页 inline loading 覆盖 | 等复验 | 不 rehydrate |

## 2. State audit matrix

| STATE | TRIGGER | 当前视觉信号 | 用户能懂？ | 恢复可见？ | 问题 | 改？ |
|---|---|---|---|---|---|---|
| READY | — | 深色主 CTA「Save Memory」 | 能 | — | — | NO |
| INVALID | 校验失败 | **与 READY 完全相同**；错误在字段处 | 能（点后看到字段错误） | 字段 caption | 无（点→看原因 是标准模式） | NO |
| PRESS/提交已接受 | 第 1 次点 | 按钮立刻 ghosted + spinner + 文案 | 能 | — | — | NO |
| PHOTO UPLOADING | `saving:true` | 同上 + 页顶进度条 | 能 | — | 见 §3 | **P0-2** |
| RECORD SAVING | `saving:true` | 与 UPLOADING **完全相同** | 能 | — | 无需区分（恢复路径相同） | NO |
| SUCCESS | `.then` | 进度条满 + saved 文案 + toast + 400ms 后跳 Home | 能 | — | — | **P0-2** |
| PHOTO/上传失败 | `.catch` | Save 上方表单级错误 | 能 | 再点 Save | 见 §3 | NO |
| record-save 失败 | 同上 | **与上传失败完全相同** | 能 | 再点 Save | 无需区分 | NO |
| RETRY | 无独立重试 UI | — | — | 再点 Save 即重试 | 业务本无重试流程 | NO |
| BUSINESS FROZEN | 诊断激活 | 按钮文案 `frozenSave` + ghosted + 表单错误 | 能 | — | 夹具不可达（`syncContext` 覆写 `businessFrozen`） | NO |
| IDENTITY NOT READY | `identityReady=false` | 整页 inline loading 覆盖 | 能 | — | 按钮态不可达 | NO |
| DOUBLE SUBMIT | 连点 ×2/×3 | 按钮已 ghosted（提交已接受） | 能 | — | 见 §8 实测 | NO |
| DUSK | — | 全部有 dusk 覆写 | 能 | — | — | NO |
| QUIET | `reduceMotion` | spinner 停转，**文案+进度条+ghosted 仍在** | 能 | — | 见 §9 | NO |

## 3. ⚠️ 上传失败 vs 落库失败：**不能区分**，而且**不需要**区分

**从真实代码回答（Round 3-B1 遗留问题）：**

1. **不能区分。** 上传与落库是**同一个调用**：`store.createCloudMemory(memory, draft)`。
   `.catch` 只拿到一个 `error`，**没有任何分支标识失败发生在哪一段**。
2. **而且 UI 里那个「阶段」是假的。** `saveProgressText` 由 `setInterval(400ms)` 递增 `saveProgress`、
   在 50 处从「上传照片到云端」切到「同步到云端」——**这是计时器，不是管线阶段**。
3. **恢复路径完全相同**：两条分支都走 `.catch` → `setData{error, draft: draft}` → 用户**再点一次 Save**。
   ⇒ 按 brief「Only add presentation-state distinction if the existing recovery paths materially differ」
   —— **它们没有 material difference，所以不该加技术性区分**。

**结论**：不做 `photoError` 新状态；UI 只表达「**保存失败**」+ **正确的下一步动作**（再点 Save），
并且**去掉那个虚假的阶段区分**（见 SAVE-P0-2）。**不暴露实现术语。**

## 4. 选定的 SAVE-P0（2 个）

### SAVE-P0-1 — Save 的工作/成功文案是**硬编码中文**，而应用跑在英文
**证据**：实测 8 个状态全部 `locale: "en"`；`准备保存...` / `上传照片到云端...` / `同步到云端...` / `保存成功`
四个字符串**只出现在 `pages/add/index.js:444,486,491`**，**不在** `tools/lib/locale-translations.tsv`
也不在 `utils/locales.js`。而 `onSave` 里其他文案都走 `i18n.t(...)`。
⇒ 英文用户在本轮覆盖的**正是 WORKING / SUCCESS 两个状态**看到中文，周围却是英文。
**修**：把这四处接到**既有** `i18n.t()`，并向 locale 表补两行（`Saving your memory...` / `Memory saved`），
再 `npm run build:locales`。**复用既有 i18n 机制，不新建体系。**

### SAVE-P0-2 — 工作文案宣称一个**管线并不存在**的阶段区分
**证据**：`createCloudMemory` 是**一次**调用；`saveProgress < 50 ? '上传照片到云端...' : '同步到云端...'`
由 400ms 计时器驱动 ⇒ 它在告诉用户「正在上传照片」而实际并没有这样的阶段。
brief 明确问「Do we actually need to distinguish upload vs saving visually?」——**答案是不需要**（§3）。
**修**：统一为**一个诚实的工作文案**（`Saving your memory...`），进度条保留作为进度指示。
**不再声称阶段。**

## 5. 改动文件（4 个）

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/add/index.js` | `onSave` 三处 `saveProgressText` 改走 `i18n.t(...)`（去掉 4 个硬编码中文；工作文案统一为一条） |
| `tools/lib/locale-translations.tsv` | **+2 行**：`Saving your memory...\t正在保存回忆...`、`Memory saved\t回忆已保存` |
| `miniprogram/utils/locales.js` | `npm run build:locales` 重新生成（**+10 行**，仅新增两条；`utils/locales.js` **不在 UI 哈希链内**） |
| — | **未改任何 WXSS / WXML**；`app.wxss` 未动 |

**无新组件、无新设计系统、无网络行为变更、无 save 管线重构、无重复业务状态。**

## 6. 截图

`shots/r3b2-{pearl,dusk}-{A-ready,B-invalid,D-uploading,E-saving,F-success,G-failure,J-frozen,M-double-submit}.png`
= **16 张（8 态 × 2 主题）**；合成 `r3b2-save-button.png`（按钮态）、`r3b2-progress-fixed.png`（进度文案）。

| 必拍项 | 覆盖 |
|---|---|
| 1 READY | `A-ready` ✓ |
| 2 field-invalid / Save blocked | `B-invalid` ✓ |
| 3 uploading | `D-uploading` ✓ |
| 4 saving | `E-saving` ✓ |
| 5 success | `F-success` ✓ |
| 6 recoverable failure | `G-failure` ✓ |
| 7 retry | 无独立重试 UI（业务本无）⇒ 由 `G-failure` 的「再点 Save」代表 |
| 8 businessFrozen | `J-frozen`（夹具不可达，见 §2） |
| 9 identity-not-ready | 整页 loading 覆盖，按钮态不可达 |
| 10 double-submit locked | `M-double-submit` ✓ |
| 11 Dusk working | `dusk/D-uploading` ✓ |
| 12 Quiet working | 见 §9（本机 `reduceMotion:true`，16 张本身即 Quiet） |
| 13 Dusk failure | `dusk/G-failure` ✓ |

**未用 CSS 假造 success/failure**：文案取自**真实 `i18n.t()` 调用**（实测返回 `Saving your memory...` / `Memory saved`），
状态由真实 `saving` / `saveProgress` / `error` 字段驱动。

## 7. Draft safety（实测）

| 场景 | 结果 |
|---|---|
| **校验失败**（restaurant 空） | `errField: "restaurant"`、`locked:false`、`saving:false`、**`notes:"KEEP ME"` / `tags:1` 完整保留** ✓ 未触碰 draft |
| **上传/落库失败** | `.catch` 显式 `setData{draft: draft}` ⇒ 原样还原 ✓（代码核对） |
| **成功** | 只有 `.then` 走 `store.freshDraft()` ✓ 唯一的清空点 |

## 8. Double submit（实测）

| 操作 | 结果 |
|---|---|
| `saving:true` 时连点 `onSave()` **×3** | `progressUnchanged: true`（三次全被 `saveLock \|\| uploading` 吞掉）、`saving:true`、`locked:true` ✓ **无重复提交** |

**视觉面**：提交被接受后按钮立刻 `ghosted`（`opacity:.6`）+ spinner + 文案，**不是「静默 return 但按钮仍活跃」** ✓
（`saveLock` 是实例属性，同步置位；`setData{saving:true}` 紧接其后。）

## 9. PEARL / DUSK / QUIET

| 改动 | PEARL | DUSK |
|---|---|---|
| SAVE-P0-1 本地化 | 实测 `i18n.t()` 返回 `Saving your memory...` / `Memory saved` ✓ | 同 ✓（深底上可读） |
| SAVE-P0-2 统一文案 | 进度条只剩一个诚实标签 ✓ | 同 ✓ |

**QUIET —— 明确回答**：`saving` 期间**至少三个非动效信号**同时存在：① **文案**（`Saving your memory...`）
② **按钮 ghosted 表面** ③ **进度条**；另加 `aria-busy="true"` 的 busy 语义。
`.quiet .spin{animation:none}` 只停旋转 ⇒ **「正在保存」在 Quiet 下依然清楚** ✓ 本轮**未新增任何信号**（既有已足够）。

## 10. 12 维评估

| 维度 | 判定 | 理由 |
|---|---|---|
| 1 Ready-state clarity | **SAME** | 未改 |
| 2 Working-state clarity | **BETTER** | 英文应用不再出现中文；文案诚实（不再假称阶段） |
| 3 Upload vs save semantics | **BETTER** | 明确**不区分**（管线无此区分、恢复路径相同），去掉误导性阶段文案 |
| 4 Failure/recovery clarity | **SAME** | 表单级错误在 Save 上方（top 636 vs Save 698）；未改 |
| 5 Success clarity | **BETTER** | 「Memory saved」现在是英文；仍有 toast + 跳转 |
| 6 Disabled/frozen clarity | **SAME** | 未改 |
| 7 Double-submit clarity | **SAME** | 行为与视觉本就正确（实测确认） |
| 8 Error hierarchy | **SAME** | R3-A 的「字段 caption vs 表单级」层级未动 |
| 9 Draft-safety confidence | **SAME** | 实测保留；未改语义 |
| 10 Dusk consistency | **SAME** | 两主题都实测 |
| 11 Quiet completeness | **SAME** | 三个非动效信号本就存在 |
| 12 Overall completion feeling | **BETTER** | 结束时文案与语言一致，不再出现看不懂的中文 |

## 11. Verification

见 §13。

## 12. 剩余 Save 缺口（本轮**不修**）

1. **进度条位置远离 CTA**：`.save-progress-wrap` 在视口 top **85**，`.save-memory` 在 **698** ⇒ 相隔 **613pt**。
   按钮自身已有 spinner+文案，所以不是致命；但进度数字对按钮处的用户不可见。属布局改动，未做。
2. **进度是计时器不是真实进度**：`saveProgress += 5/400ms` 与真实网络进度无关。改为真实进度需要管线改动 ⇒ 不做。
3. **无独立重试按钮**（业务本无）——恢复 = 再点 Save。按 brief 不发明新业务行为。
4. **`businessFrozen` 在夹具里不可达**（`syncContext` 会用 `identity.isDiagnosisActive()` 覆写），
   只做了代码核对，未拍真图。
5. **SUCCESS 期间约 400ms 内按钮仍显示 ghosted「Saving your memory...」**（`saving` 尚未置回），
   随后 `.finally` 复位、400ms 后跳 Home。这段时间由 toast 解释，未改。

## 13. Verification 结果（**全绿**）

| 套件 | 结果 |
|---|---|
| `verify-cloud.cjs` | **EXIT 0**（本轮未碰 WXML/WXSS ⇒ **无哈希闸门红点**） |
| `verify-menu-copy.cjs`（文案） | **EXIT 0** |
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0** |
| `verify-structure.cjs` | **EXIT 0** |
| `verify-photo-batch-upload.cjs`（照片上传回归） | **EXIT 0** |
| `verify-add-native-return.cjs`（原生返回回归） | **EXIT 0** |
| `verify-add-identity-fence.cjs`（身份围栏回归） | **EXIT 0** |
| `verify-map-save.cjs`（保存回归） | **EXIT 0** |
| `verify-media.cjs` | **EXIT 0** |
| `npm run verify` | **EXIT 0 — FINAL STATIC VALIDATION: PASS** |
| **`npm run verify:all`** | **EXIT 0 — 0 FAIL** |

**本轮改动不在 UI 哈希链内**：`pages/add/index.js` 是 JS（链只锚 WXML/WXSS），
`utils/locales.js` 与 `tools/lib/locale-translations.tsv` 也都不在链内 ⇒
**UI 注册检查点无需推进，`verify-cloud` 自然为绿** ✓（按 brief 未推进任何哈希。）

---

## 14. ⚠️ 取证过程中的一次自伤（已修复并如实记录）

在跑 **draft-safety 探针**时，我为构造「非法草稿」而写了
`d.restaurant=''` / `d.notes='KEEP ME'` / `d.tags=['Keep']` **到真实草稿存储**。
随后用运行时备份还原时，发现 `wx.__r3b2` 里存的**并不是用户原始草稿**（是一份空 draft），
⇒ **第一次还原反而把它清得更空**。

**已按会话早期唯一可核实的读数恢复**：`restaurant:'111'`、`photos:[]`、`location` 保留但
`geoConfirmed:false`、`country:''`、notes/tags/date/rating/perCapita 归默认。
（原始读数来自本会话第一次只读探测：`restaurantLen:3`、`photos:0`、`hasLocation:true`、`geo:false`。）

**未丢失的**：用户的**已保存记忆全在 CloudBase**，draft 只是本地草稿。
**无法完全复原的**：原始 draft 的 notes / tags / date / rating 值（会话早期未读取过）。

**教训（已写进当日记忆）**：
1. **写存储的探针必须在任何写入之前先 stash，并验证 stash 里确实是真实数据**（不能只判断「存在」）。
2. **draft-safety 这类探针应当改在临时副本上做**，或先 `saveDraft` 一份到独立 key 再动手。
3. 恢复后要**打印前后对比**确认，而不是只看返回值。
