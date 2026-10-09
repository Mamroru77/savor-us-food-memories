# Add — Round 3-B1：Photo 事务状态完整性（2026-09-29）

**未 commit / 未 push / 未 deploy。** P0 / P1-A / P1-B / R3-A 冻结未动（本轮只碰 Photo 状态呈现）。
**零 motion**：无 transition / fade / scale / morph / spring（既有 `transition` 未新增）。

---

## 1. Photo state graph（**来自真实代码，非设计**）

```
0 photos
  ├─ 主占位框 tap        → onReplacePhoto()  → pickPhotos(9, replace=true)
  └─ Add-more tile tap   → onAddMore()       → pickPhotos(9, replace=false)
        ↓ 守卫：uploading / saveLock / cloudAttempt.submitted → 直接 return
        ↓       draft.photos.length >= 9 → store.notify 后 return
        → identityFence() → identity.lease()   [throw → setData{uploading:false, error}]
        → setData{uploading:true, uploadProgress:0, uploadTotal, uploadCurrent:0, originalMode:false, error:'', errorContext:'save'}
        → wx.chooseMedia（系统选择器把小程序切到后台）
        → App.onShow 复验身份 → visibleAgain resolve（只有最新 serial 能落地）
        → 逐张 persistPhoto（每张 try + continue，跑完抛一次聚合错误）
             · 进度回调 → setData{uploadProgress, uploadCurrent, uploadTotal, originalMode}
        → 成功 → setData{uploading:false, uploadProgress:100, draft:newDraft, fieldErrors:{},errorField:'',error:''}
                 → 800ms 后若 !uploading → 进度字段归零
        → 失败 → setData{uploading:false, error:<msg>}   ← errorContext 仍是 'save'，errorField 为 ''
        → 取消 → setData{uploading:false, error:''}

1 photo
  ├─ 主图 tap            → onPreviewPhoto() → wx.previewImage
  ├─ Edit pill           → onReplacePhoto() → pickPhotos(replace=true)
  ├─ Add-more tile       → onAddMore()      → pickPhotos(replace=false)
  └─ ✕ remove-extra      → onRemoveExtra()  → changeDraft('photos', slice(0,-1)) → 0 photos

2+ photos
  ├─ 主图 tap / 轨道项 tap → onPreviewPhoto(index)
  ├─ Edit pill             → onReplacePhoto()
  ├─ Add-more tile         → onAddMore()
  ├─ ✕ remove-extra        → onRemoveExtra()  （去掉最后一张）
  └─ 轨道项 ✕              → onRemovePhoto(index) （按索引删）

图片加载失败
  → onImageError → imageErrors[src]=true
  → 所有 <image> 的 src 变成 imageErrors[src] ? '/images/le-comptoir.jpg' : src

锁定
  → uploading || saveLock || cloudAttempt.submitted ⇒ 4 个照片 handler 全部提前 return
  → 输入框 disabled="{{saving || uploading || !identityReady}}"
```

| 转换 | handler | state/data | UI 已存在 | 回滚/重试已存在 |
|---|---|---|---|---|
| 0 → 选图 | `onReplacePhoto` / `onAddMore` → `pickPhotos` | `uploading` | ✅ | 无重试 UI；失败靠重新点 |
| 选图 → 上传 | `persistPhoto` 循环 | `uploadProgress/Current/Total` | ✅ | 逐张 try+continue，聚合错误 |
| 上传 → 成功 | `setData{draft:newDraft}` | `draft.photos` | ✅ | — |
| 上传 → 失败 | `setData{error}` | `error`, `errorContext:'save'` | ✅（但渲染在表单底部） | 重新点即重试 |
| 1 → 替换 | `onReplacePhoto` | 同上 | ✅ | — |
| n → 删一张 | `onRemovePhoto(index)` / `onRemoveExtra()` | `draft.photos` | ✅ | — |
| 加载失败 | `onImageError` | `imageErrors` | ✅ | 无 |

**未改任何业务语义。**

## 2. STATE AUDIT MATRIX

| STATE | CURRENT VISUAL SIGNAL | USER 能理解？ | PROBLEM | CHANGE |
|---|---|---|---|---|
| 0 photos | 主占位框「+ A moment worth keeping」(274×245) **＋ Add-more tile「+ Add more」(99×182)** | 能，但**两个等权 + 互相竞争** | 空态有两个同义入口，主目标不突出 | **YES → P0-2** |
| choosing/adding | 无独立视觉（`uploading:true` 立即接管） | — | — | NO |
| uploading | 主图变暗 + 转圈遮罩；下方进度条 + **`1/2 45%`** 文本 | **能**（数字不依赖动画） | 进度清楚 | NO |
| upload success → 1 photo | 主图出现，进度 800ms 后归零 | 能 | — | NO |
| 1 photo | 主图 274×245（dominant）；Edit pill 63×34；Add-more 99×182；✕ 50×50 | 能 | — | NO |
| 2+ photos | 主图 + Edit + Add-more(显示「2 photos」) + 轨道 125pt + 每项 ✕ 50×50 | 能 | — | NO |
| **locked (uploading)** | 主图变暗 + 进度条；**Edit / Add-more / ✕ 全部保持完整可用外观** | **不能** —— 看着能点，实际 handler 全 return | 动作看起来可用但不可用 | **YES → P0-1** |
| **image fallback** | `imageErrors[src]` → 渲染 `/images/le-comptoir.jpg`（**一盘真实的菜**） | **不能** —— 分不清是真照片还是占位 | 用户以为选中的照片就是这样 | **YES → P0-3** |
| **upload failure** | 消息渲染在**表单底部**（Save 上方），照片编辑器**零信号** | 不能（编辑器附近无提示，且消息在 ~700pt 之外） | 见 §9 gap-1（需 JS 暴露新标志，本轮不做） | NO |
| remove extra | ✕ 50×50 绝对定位（1 张在左下、多张在 tile 右上） | 能 | — | NO |
| Dusk | 全部控件有 dusk 覆写 | 能 | — | NO |
| Quiet | `.quiet .spin{animation:none}` ⇒ 转圈停转，但**进度条 + `1/2 45%` 仍在** | 能 | — | NO |

## 3. 选定的 PHOTO-P0（3 个）

### PHOTO-P0-1 — 上传中照片动作看着可用、实际不可用
**证据**：`onReplacePhoto` / `onAddMore` / `onRemoveExtra` / `onRemovePhoto` 四个 handler 全部
`if (… || this.data.uploading || …) return;`；但实测锁定态下 `.edit-photo`(63×34)、`.add-photo`(99×182)、
`.remove-extra`(50×50)、`.photo-strip-remove`(50×50) **全部照常渲染**。
**修**：把 R3-A 的 `.is-locked` 机制**扩展到照片控件**——Edit pill 转灰底/灰字、Add-more 虚线框淡化、
✕ 去掉阴影并转灰底、轨道 ✕ 的底变淡。**照片本身完全不动、保持可读**；只让 affordance 退后。

### PHOTO-P0-2 — 0 张照片时「Add more」与主占位框竞争
**证据**：空态下主占位框与 Add-more tile 同时渲染，两个都是 `+`、都能选图（`replace=true` 在 0 张时
等同新增）。概念图的层级是 **主照片 > Add more**，空态却有两个同权入口。
**修**：`.more-photos-wrap` 加 `wx:if="{{draft.photos.length}}"` —— **有 1 张起才出现**。
**能力未减少**（两者调用同一个 picker），空态只留一个无歧义入口；行高由 `.photo-editor-row{height:430rpx}` 固定，**不产生布局位移**。

### PHOTO-P0-3 — 图片加载失败的占位图被当成真实内容
**证据**：`imageErrors[src]` 时所有 `<image>` 渲染 `/images/le-comptoir.jpg` —— 一张**真实的一盘菜**。
编辑器里显示的是用户从未选择的照片，且**没有任何标记说明这是占位**。
**修**：主图在 fallback 时带 `is-fallback`，加**虚线边框**（用既有错误色），读作「不可用」而不是「内容」。
⚠️ **只改 Add 页主图的呈现**；`imageErrors → le-comptoir.jpg` 这个映射是**全应用共用**的（memory-row / map card 等），
属本轮 scope 之外，**未动**。

## 4. 改动文件（2 个，均在 scope 内）

| 文件 | 改动 |
|---|---|
| `miniprogram/pages/add/index.wxml` | 3 处：主图加 `{{imageErrors[...] ? 'is-fallback' : ''}}` 类投射；`.more-photos-wrap` 加 `wx:if="{{draft.photos.length}}"` |
| `miniprogram/pages/add/index.wxss` | 追加 `.is-locked` 照片控件组（P0-1，含 dusk 覆写）与 `.main-memory-photo.is-fallback`（P0-3，含 dusk 覆写） |

**零 JS 改动**；无新业务状态；无新 token；无新组件；无重构。

## 4b. Capability matrix（**逐项对照真实 handler 代码**）

| 张数 | 能力 | handler | 实际语义 | 状态 |
|---|---|---|---|---|
| **0** | **Add** | `onReplacePhoto` → `pickPhotos(9, true)` | `next = paths.concat([].slice(1))` = **`paths`** ⇒ 0 张时 replace 即新增 | ✅ 可用 |
| **1** | **Preview** | `onPreviewPhoto` | `wx.previewImage({current:paths[0], urls:paths})` | ✅ 可用 |
| **1** | **Replace** | `onReplacePhoto` → `pickPhotos(9, true)` | `next = paths.concat(photos.slice(1))`，`slice(1)` 为空 ⇒ **新图替换该张** | ✅ 可用 |
| **1** | **Remove** | `onRemoveExtra` → `changeDraft('photos', slice(0,-1))` | 单张时「最后一张」就是它 ⇒ 归 0 | ✅ 可用（✕ 实测在 `left 34, top 416`） |
| **1** | **Add more** | `onAddMore` → `pickPhotos(9, false)` | `next = photos.concat(paths)` ⇒ **追加** | ✅ 可用 |
| **2+** | **Preview** | `onPreviewPhoto` | 主图 + 轨道项都带 `data-index` | ✅ 可用 |
| **2+** | **Replace main** | `onReplacePhoto` → `pickPhotos(9, true)` | `paths.concat(photos.slice(1))` ⇒ **只换主图，其余保留** | ✅ 可用 |
| **2+** | **Add more** | `onAddMore` | 追加 | ✅ 可用 |
| **2+** | **Remove extra** | `onRemoveExtra` → `slice(0,-1)` | 去掉最后一张 | ✅ 可用（✕ 实测在 `left 373, top 244`） |
| **2+** | **Remove by index** | `onRemovePhoto(index)` | `filter((_,i)=>i!==index)` | ✅ 可用（轨道项 ✕） |

**结论：本轮改动后没有任何能力消失。** P0-2 只在 **0 张**时隐藏 Add-more tile，而 0 张时
主占位框本身就是完整的 Add 路径（上表第 1 行）——**两者调用同一个 picker**，隐藏的是重复入口，不是能力。
实测各状态下控件矩形：0 张 `.add-photo` 消失、`.photo-placeholder` 274×245 保留；
1/2 张 `.edit-photo` 63×34、`.add-photo` 99×182、`.remove-extra` 50×50、轨道 ✕ 50×50 **全部仍在**。

## 5. 截图

`shots/r3b1-{pearl,dusk}-{A-0photos,E-1photo,G-2photos,C-uploading,L-upload-fail,K-image-fallback,M-locked}.png`
（**14 张** = 7 态 × 2 主题）+ 合成 `r3b1-states.png`（修复前）、`r3b1-fixed.png`（修复后）。

| 必拍项 | 覆盖 |
|---|---|
| 1. 0 photos | `A-0photos` ✓ |
| 2. 1 photo | `E-1photo` ✓ |
| 3. 2+ photos | `G-2photos` ✓ |
| 4. uploading | `C-uploading` ✓ |
| 5. upload failure | `L-upload-fail` ✓ |
| 6. image fallback | `K-image-fallback` ✓ |
| 7. locked photo editor | `M-locked` ✓ |
| 8. 1-photo remove affordance | `E-1photo`（✕ 在 34,416）✓ |
| 9. Dusk uploading | `dusk/C-uploading` ✓ |
| 10. Quiet uploading | 见 §6 ✓ |

**事务态全部由真实 fixture 产生**（`uploading` / `imageErrors` 走与业务同一批 data 字段），**未用纯 CSS 假造**。

## 6. PEARL / DUSK / QUIET

| 改动 | PEARL | DUSK |
|---|---|---|
| P0-1 locked 照片控件 | Edit 转灰底灰字、✕ 去阴影转灰底、Add-more 虚线淡化 ✓ | 有独立 dusk 覆写（`rgba(255,255,255,.07)`）✓ |
| P0-2 空态单一入口 | 只剩主占位框 ✓ | 同 ✓ |
| P0-3 fallback 标记 | 砖红虚线框 ✓ | `rgba(255,192,170,.55)` 虚线框 ✓ |

**QUIET —— 明确回答：是的，Quiet 下仍然传达「正在上传」。**
`uploading` 的信号由三部分组成：① `.photo-uploading` 遮罩层（主图变暗）② `.upload-progress-wrap` 进度条
③ **`{{uploadCurrent}}/{{uploadTotal}} {{uploadProgress}}%` 数字文本**（实测渲染出 `1/2 45%`）。
`.quiet .spin { animation: none !important }` 只停掉 `loader-circle` 的**旋转**，遮罩、进度条与数字
**全部保留** ⇒ **不依赖动画即可读懂状态** ✓ 本轮**未改**任何 Quiet 规则，因此该结论同时适用于改动前后。
（另注：本机 dev store 的 `reduceMotion` 为 `true`，所以本轮 14 张截图**本身就是 Quiet 态**拍出来的。）

## 7. 10 维评估

| 维度 | 判定 | 具体理由 |
|---|---|---|
| 1. Main-photo hierarchy | **BETTER** | 空态不再有第二个等权 `+`；主占位框成为唯一主目标 |
| 2. Empty-state clarity | **BETTER** | 0 张时只有一个入口 |
| 3. Single-photo action clarity | **SAME** | 1 张态的 Edit/✕/Add more 未改（Preview/Replace/Remove/Add more 四项实测都可用） |
| 4. Multiple-photo clarity | **SAME** | 2 张态未改 |
| 5. Upload-state clarity | **SAME** | 进度条 + 数字本就清楚，未改 |
| 6. Failure/recovery clarity | **SAME** | 未改（见 gap-1） |
| 7. **Locked-state clarity** | **BETTER** | 原本看着可用实际不可用；现在 4 个控件可见地退后 |
| 8. Dusk consistency | **SAME** | 两处新增都有 dusk 覆写且实测可读 |
| 9. Quiet completeness | **SAME** | 进度信号不依赖动画，Quiet 下仍完整 |
| 10. Concept similarity | **BETTER** | 空态层级回到「主照片 > Add more」；fallback 不再冒充真实内容 |

## 8. Verification

| 套件 | 结果 |
|---|---|
| **`verify-photo-batch-upload.cjs`**（照片回归） | **EXIT 0** |
| **`verify-add-native-return.cjs`**（原生返回回归） | **EXIT 0** |
| **`verify-add-identity-fence.cjs`**（身份围栏回归） | **EXIT 0** |
| `verify-visual-language.cjs` | **EXIT 0** |
| `verify-ui-quality.cjs` | **EXIT 0** |
| `verify-icons.cjs` | **EXIT 0** |
| `verify-structure.cjs` | **EXIT 0** |
| `verify-media.cjs` | **EXIT 0** |
| `npm run verify` | **EXIT 0** |
| `verify:all` | **EXIT 1 —— 唯一失败 = UI 注册闸门** |

**唯一红点**：`pages/add/index.wxml` 实际哈希 ≠ 检查点值。按 brief
**「Do not update the UI registration hash until visual approval is given」⇒ 未推进**。

**能力未减少的验证**：`pickPhotos(count, replace)` 第 326 行
`if (replace) next = paths.concat(draft.photos.slice(1)).slice(0,9)` —— 0 张时 `slice(1)` 为空 ⇒
`next = paths`，**主占位框在空态仍然是完整的「新增」路径** ✓ 因此 P0-2 隐藏 Add-more tile
**没有移除任何能力**（两者本就调用同一个 picker）。

**未触碰**：`miniprogram/app.wxss`（仍在批准哈希 `c817ec8a…`，不在 `git status` 里）；
`pages/add/index.js` 自 P0 起未再改动（仍是 `30b7b83f…`）。

## 9. 剩余 Photo 缺口（本轮**不修**）

1. **上传失败在照片编辑器附近无信号。** 失败消息渲染在表单底部（Save 上方），距照片约 700pt。
   要在这里给信号，需要区分「照片失败」与「保存失败」——但两者在现有 data 里都是
   `errorContext:'save'` + `errorField:''`，**无法区分**。加一个 `photoError` 标志属新增呈现状态，
   且 brief 明确「No new business state」⇒ **本轮不做**，留给 R3-B2 或后续轮一起决定。
2. **`imageErrors → /images/le-comptoir.jpg` 的映射是全应用共用的**（memory-row、map card 等）。
   本轮只给 Add 主图加了「这是占位」的标记；**其他消费方仍会把占位当内容**。属跨页改动，未动。
3. **轨道缩略图没有 fallback 标记**（只做了主图）。同一原因：先验证主图这一处。
4. **上传失败无显式重试按钮**（业务本就没有），恢复方式是重新点占位框/Add more。按 brief
   「若本无重试流程，不要发明新业务行为」⇒ 保持原样。
5. **`remove-extra` 在 1 张与多张时的位置不同**（左下 vs tile 右上），是 Gate-1 closeout 的既定设计，未动。
