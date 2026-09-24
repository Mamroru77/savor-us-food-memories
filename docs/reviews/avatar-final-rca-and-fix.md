# Avatar Final RCA and Fix

长期维护文档 · 日期：2026-09-24
范围：`profile-editor` 头像链路（微信头像入口 + 自定义高清入口）
来源：本仓库 `docs/reviews/` 与 `docs/handoff/` 下的阶段性原稿（Round 1 → Round 2 → 修复），
外加真机（OPPO PKB110 / Android 16）只读探针取证。

> 本文只写原始报告与真机证据实际支持的结论。曾经提出但**被证据证伪**的假设统一放在
> 「Rejected hypotheses」，不写进根因。

---

## Final user-visible symptoms

按时间顺序，用户实际看到的现象（每一步都对应一个独立缺陷）：

1. **微信头像可用**：点圆形头像按钮 → 选「使用微信头像」→ 预览 / Save / 显示，全链路正常。
2. **自定义头像最初无法完成**：从同一个按钮选「从相册选择」→ 选完图**什么也没发生**：
   无预览、无错误提示、无 toast、无日志。表现为「自定义头像这个功能不存在」。
3. **lifecycle 修复后仍失败**：Sheet / 编辑器生命周期修复落地后，失败形态改变 ——
   真机上连 `AVATAR_CALLBACK` 都没有（请求与 native flow 在回调到达前已被销毁）。
4. **后来能选择但继续显示旧 132×132 头像**：新增自定义高清入口后，用户**成功选到了
   6.7 MB 的高清原图**，但 Me 页仍然显示旧的 132×132 头像；体感就是「换了头像还是糊」。
5. **最终高清自定义头像已真机验证清晰**：native-return 闸门修复后，自定义入口产出的
   `AvatarAsset` 保留原始像素（显著高于 132×132），Save 后 Me 页显示清晰。

> 现象 4 的关键：这不是「压缩把图压糊了」，而是**高清原图从未写入本地 asset**，
> 页面继续渲染上一张 132×132 的 `chooseAvatar` 衍生图。

---

## Final root causes

这是**四个独立缺陷**，不是一个。把它们压成一个会得出错误的修复方向。

### A. Profile Sheet lifecycle teardown

**机制**（真机与 harness 双向确认）：

```
native chooser（系统相册 / 相机 = 独立系统 UI）
→ 小程序 onHide
→ 选图返回 → App.onShow
→ identity.verify()：epoch++ / current=null / phase='verifying' / emit()
→ page-level sync（i18n.syncPage）在 generation changed 时无条件清空 sheet 四字段
   （sheetShow / sheetType / sheetMemoryId / sheetFilter）
→ sheet 隐藏 → motionPresence 判定关闭 → sheetMounted=false
→ wx:if 门控卸载整个 modal → <profile-editor> detached
→ reset() → avatar request 与 native flow 被销毁
→ bindchooseavatar / chooseMedia 回调到达时已无接收方
```

**两个观察到的失败形态**（同一根因的不同阶段）：

- **形态 1（静默 no-op）**：sheet 被身份刷新连累关闭 → `show=false` → `onAvatarChange` 的
  入口守卫 `!this.data.show` 直接静默 `return`。请求本身还活着（`_avatarRequest` 幸存），
  但守卫**不区分**「用户主动关闭」与「被身份刷新连累关闭」，于是回调被无声丢弃。
- **形态 2（连回调都没有）**：page-level sync 把 sheet 绑定清掉后编辑器真正 detached，
  `bindchooseavatar` 到达时组件已不存在，因此真机 trace 里**完全没有 `AVATAR_CALLBACK`**。

**为什么微信头像不失败**：微信头像面板是微信客户端**内嵌**面板，**不启动独立系统 UI**，
小程序不发生 `onHide`/`onShow` → `identity.verify()` 不触发 → generation 不变 →
这个窗口根本不出现。

**最终修复**：让**调用方**在「合法的 profile-sheet native 往返仍在进行 + identity 正在
`verifying`」时，向 page-level sync 声明保留 sheet 绑定。

- `miniprogram/utils/i18n.js`：`syncPage(page, state, selected, options)` 增加可选 `options`；
  仅当 `options.preserveSheet !== true` 时才清空 sheet 四字段。
  **`i18n.js` 不感知 native flow** —— 由调用方决定。
- `miniprogram/pages/me/index.js`：在 `Me.syncState` 内计算
  `preserveSheet = !!native && !!session && session.status === 'verifying'
  && this.data.sheetShow && this.data.sheetType === 'profile'`，再传给 `syncPage`。

这不是新增策略，而是把 page 层对齐到组件层**早已存在**的同一条合同
（`components/sheet/index.js` 的 `preservingAvatar` 早已把 `status === 'verifying'`
当作「这个 sheet 还是我们的」）。

**刻意保留的边界**：`preserveSheet` 只对 **profile sheet** 生效；普通 identity generation
变化（无 native flow）**仍然关闭 sheet** —— 该行为在修复前后都是绿的，是本次最重要的安全证据。

### B. chooseAvatar 低分辨率限制

`button open-type="chooseAvatar"` 是**微信自己的头像选择器**（含裁剪 UI）：

- **不接受 `sizeType` 参数**（与 `photos.pick()` 用的
  `wx.chooseMedia({sizeType:['original','compressed']})` 不同）；
- 其自定义相册分支返回**微信自己处理过的衍生图** —— 真机实测 **132×132**、
  `image/jpeg`、10 732 B。

因此「在系统相册里选原图」这个动作，对 `chooseAvatar` 这条路**不生效**。

**这解释了旧头像为什么模糊**：Me 页 `.profile-avatar{180rpx}`（≈90pt，3x 屏 ≈**270 物理像素**），
编辑面板 `195rpx`（≈293 物理像素）。落盘短边 < ~200px 必然被放大显示 ⇒ 必然发虚。

**但不要把它写成「最终自定义入口故障」**：132×132 是**微信头像入口**的输入特性，
不是自定义入口的失败原因。自定义入口的失败是 D。

### C. Full-resolution custom entry

新增一个明确的自定义入口，与微信头像入口并存，最终汇入**同一条**流水线：

| 入口 | 控件 | 行为 |
| --- | --- | --- |
| 使用微信头像 | `button open-type="chooseAvatar"`（**逐字未动**） | 微信头像选择器，`source='chooseAvatar'` |
| 自定义头像 | 新增胶囊控件 `edit-avatar-custom` | `wx.chooseMedia({count:1, mediaType:['image'], sourceType:['album','camera'], sizeType:['original']})`，`source='album'` |

要点：

- `avatarService.chooseLocal(owner)` 打开 chooser 前先 `identity.assertLease(owner)`；
  **它自己从不持久化、从不发明 owner**。
- 取消选择（`photos.isCancelled`）不是失败：返回 `''`、零错误、零 asset。
- `source='album'` 是**诚实性折中**：`wx.chooseMedia` 的 `sourceType:['album','camera']`
  **不回报**用户用了相册还是相机，因此统一记为请求里的主 source；`profileRepository`
  本就同时接受 `album` / `camera`，**无需扩协议**。
- 自定义入口做成**纯文字胶囊**，避免触碰 `verify-icons` 的 `<s-icon>` 冻结清单（恰好 80）。
- **无需任何尺寸约束**：本地路径是 `wx.compressImage({src, quality:80})`，
  **不传 `compressedWidth`/`compressedHeight`** ⇒ 只做有损重编码、**不改变像素尺寸**。
  所以只要入口拿到原图，本地 asset 就天然保留原始像素。
  **不要用 `quality:100` 去"恢复"** —— 源图本身低分辨率时，提高 quality 只会让文件更大。

### D. Custom-avatar native-return STALE_IDENTITY

**最终关键真机证据**（37 条 trace，两次同形；`t` 单位毫秒）：

```
AVATAR_CUSTOM_REQUEST        active=true show=true detached=false
AVATAR_REQUEST_ACCEPTED      source="chooseMedia"            ← 胶囊入口确实被使用
AVATAR_PICK_SOURCE_INFO      bytes=6700982 type="image" sourceExt="jpg"
AVATAR_CHOOSE_OK             sourceScheme=wxfile
AVATAR_PREPARE_START         source="album"
AVATAR_COMPRESS_START → AVATAR_COMPRESS_OK     （压缩成功，约 246 ms）
AVATAR_PREPARE_FAIL          reason="PERSIST_FAILED" code="STALE_IDENTITY"
AVATAR_SAVE_OK               hasAsset=true      ← 保存的是**旧** asset
```

**关键否定性证据**：全 37 条里**没有 `AVATAR_COPY_OK` / `AVATAR_COPY_FAIL`**，
也**没有 `AVATAR_PREPARE_OK`** ⇒ 失败点精确落在 `photos.js` 里
`AVATAR_COMPRESS_OK` 与 `copyIn(...)` **之间**那条**裸的** `assertOwner(token)`，
**根本没有进入 `copyIn`**。高清原图从未进入 `AvatarAsset`。

**根因**：native chooser 回调早于稳定的 `App.onShow` / identity verification lifecycle，
旧 lease 在 persistence 窗口内失效。

1. 胶囊入口：`nativeFlow.begin(owner)` → `chooseLocal` → `wx.chooseMedia` 打开系统选择器；
   小程序退到后台（`App.onHide` / `wx.onAppHide`），但**组件的 `show` 属性不变**，
   所以组件看不见这次往返，`flow.suspend()` 从未被调用。
2. chooser 成功回调**先**到 JS 层 → `completeAvatarSelection` → `flow.run(task)`。
3. `run` 里 `await identity.resumeNative(owner)`：此刻 `flight === null`
   （`App.onShow` 还没跑）⇒ 直接返回**复验前**的旧 lease。
4. `persistPhoto` **入口**断言通过 → `wx.compressImage` **约 250 ms**。
5. 就在这 250 ms 内，`App.onShow` → `identity.verify()`，其**第一行**即
   `epoch++; current=null; phase='verifying'; emit()` ⇒ generation 前进。
6. 压缩结束 → 第二次 `assertOwner(旧 token)` → `token.generation !== epoch`
   → **`STALE_IDENTITY`**。

该 ~250 ms 窗口**没有任何 re-resume 保护** —— native flow 只在 task **之前** resume 一次。

**用户可见症状**：`stale-owner` 分支把 `profileError` 设为 `identityCopy().verify`
⇒ 用户选完高清图后会看到一条**身份验证相关错误**，且头像保持旧图不变
—— 与「换了头像还是糊」在体感上完全同形。

**最终修复：caller-level native-return barrier**（谁拥有 flow，谁负责可见性），
复用既有 `nativeFlow` 的 `suspend/show` 与 `identity.resumeNative`，**不新建第二套全局状态机**：

| 时机 | 动作 |
| --- | --- |
| `attached()` | `typeof` 守卫下注册 `wx.onAppHide` / `wx.onAppShow` |
| app-hide | 记 `_nativeHiddenGeneration`；flow active 时 `flow.suspend()` |
| app-show | 置 `_nativeReturnPending`，尝试释放 |
| 释放条件 | `session.generation !== _nativeHiddenGeneration` **或** `session.status === 'verifying'` ⇒ `flow.show()` |
| 否则 | `NATIVE_RETURN_FALLBACK_MS = 250` 有界兜底（安全网，正常路径不应被观察到） |
| 释放前附加约束 | 组件必须仍可见（`active && show`）—— 保留「隐藏时不得持久化」的既有合同 |
| `reset()` / `detached()` | 清 pending 与 timer；`detached()` 额外注销两个监听 |

**为什么两个信号都接受**：`wx.onAppShow` 与 `App.onShow` 是两次独立注册，官方**未承诺**先后顺序。
只看 generation 会在「`wx.onAppShow` 先到」时过早释放；只看 status 会在「已有 flight、
`verify()` 直接 `return flight` 不 emit」时漏掉。任一满足即释放，两种顺序都正确。

**为什么释放后就安全**：`identity.resumeNative(token)` 是 `if(flight) await flight; const next = lease();`
—— 一旦 `App.onShow` 已进入 `verify()`（`flight` 已**同步**建立），flow 拿到的必然是
**复验后**的新 lease，第二次断言通过。

**不得描述成「q80 导致模糊」** —— 真机隔离实验已证明 q80 **不降采样**（见下）。

---

## Rejected hypotheses

以下都曾作为候选根因被提出，随后被**真机或代码级证据证伪**。不要把它们当成结论。

| # | 假设 | 结论 | 证伪依据 |
| --- | --- | --- | --- |
| 1 | **HEIC 是主因**（相册原图是 HEIC，被格式合同硬拒绝） | **否** | 格式合同确实是 `jpeg/jpg/png/gif/webp` 支持、`heic/heif` **硬拒绝**，但真机实际失败的两次选择都是 **JPEG**（`sourceExt=jpg`），且失败点在压缩之后、与格式无关。HEIC 在本轮**从未被观测为原因**。 |
| 2 | **q80 降采样是主因** | **否** | 真机隔离实验：对 **2304×4096 / 12 878 702 B** 的 JPEG 执行与生产完全相同的 `wx.compressImage({src, quality:80})`（**不传** `compressedWidth/Height`）⇒ 产物仍是 **2304×4096**（`downsampled=false`）、**1 405 565 B**（体积 −89%，**分辨率不变**）。对照：`quality:60` + 256px box ⇒ 144×256 / 14 193 B。q80 保留了全部像素。 |
| 3 | **cloud 256px 自动覆盖 Me 头像** | **否** | 静态：写 256px 云端衍生图的 `avatar.restore()` **唯一**调用方是 `profileSync.apply()`，而它只被 `pages/workspace` 调用且要求用户显式同意（`confirmed: true`）；`forCloud()`（256px / quality 60）同样只从 workspace 进入。真机：硬重启后 Me 渲染仍为 **132×132**、`samePath = true`、`trace count = 0`（确认全新进程）——**没有被替换成 256px**。 |
| 4 | **`profile.avatar` 与 `avatarAsset.localPath` 不一致** | **否** | `profileRepository.migrate()` 的投影不变量使 `profile.avatar` **恒等于** `avatarAsset.localPath`（不一致时 asset 被降级为 legacyAsset，但 path 不变）。真机三个渲染点（落盘 asset / Me 渲染 / 硬重启后渲染）**完全一致，都是 132×132** ⇒ 渲染链路没有任何分叉。 |
| 5 | **Store / ProfileRepository 是首个失败边界** | **否** | 第一轮根因定位已明确：首个分歧边界在 **Boundary 2（identity / native flow）** —— 组件展示守卫 + sheet 关闭时机。Store / ProfileRepository / ProfileSync / Workspace / 迁移代码 / Stage 7 兼容代码**与根因无关**，也因此**未被改动**。 |

另外两条被证伪的**修复方向**（不是根因假设，但同样不要重走）：

- **改 `persistPhoto(tempPath, true, owner)`（`keepOriginal=true`）**：实测对本例（JPEG）
  **不改变任何像素**（q80 已保留 2304×4096）——改的不是原因；反而会让一张
  **12.88 MB 的原图**直接进头像资产（`keepOriginal` 跳过 `compressImage`，直接 `copyIn`），
  代价大、收益为零；且它只覆盖 `album` / `camera`，而当时的问题恰恰出在 `chooseAvatar` 上。
- **在通用 `photos.persistPhoto` 里无条件加 `resumeNative`**：会改变 Add / workspace / space
  等**所有**调用者的租约语义，掩盖真正的边界。修复必须落在**拥有 flow 的调用方**。

---

## Final architecture contract

```
微信头像：  chooseAvatar  ─────────────────────────────┐
                                                       │
自定义头像：chooseMedia (sizeType: ['original'])        │
             → native-return barrier                    │
             → （等正确 visibility / verification 时机） │
             → 同一个 avatarService.prepare             │
                                                        ▼
                                                  AvatarAsset
                                                       │
                          共同：preview only（只改 draft）│
                                                       ▼
                                    explicit Save → Store / ProfileRepository
                                    （profile.avatarAsset 为 canonical，
                                      profile.avatar 为兼容投影）
```

**合同要点**：

- 两条入口**只共享下游**，入口本身互不影响；微信头像入口逐字未动。
- 自定义入口的 owner 在**打开原生 UI 之前**捕获；结果由 flow 重新授权
  ⇒ 换 owner / 关闭 / detach / 更新的请求都会丢弃该结果。
- **选择只改草稿**，只有显式 Save 才写 Store。
- 选择阶段**不做任何持久化**：`chooseLocal` 从不落盘。
- 失败一律 **fail-closed**：换 owner 丢弃、identity 锁死丢弃、格式不支持拒绝，
  绝不放宽 `assertLease`、绝不吞 `STALE_IDENTITY`、绝不自动切 owner、绝不 retry `prepare`。

---

## Device acceptance

**已有原始文档记载的真机证据**（OPPO PKB110 / Android 16，只读探针）：

| 项 | 结论 |
| --- | --- |
| 微信头像链路 | 正常（走完 prepare → preview → Save） |
| 自定义入口确实被使用 | `AVATAR_REQUEST_ACCEPTED source="chooseMedia"` |
| 选择源确实是高清原图 | `bytes = 6 700 982`（约 6.7 MB）、`type=image`、`jpg` |
| 失败点 | `AVATAR_COMPRESS_OK` 之后、`copyIn` 之前 → `STALE_IDENTITY`；无 `COPY_OK` / `PREPARE_OK` |
| 落盘 asset（修复前） | `source=chooseAvatar` / `image/jpeg` / **132×132** / 10 732 B |
| 三个渲染点一致性 | 落盘 asset、Me 渲染、硬重启后渲染 **全部 132×132**，`samePath = true` |
| 硬重启（kill/relaunch） | 已执行；渲染仍为 132×132、`samePath = true`、trace 缓冲清零 ⇒ **没有**云端 256px 替换 |
| q80 是否降采样 | **不降采样**（2304×4096 → 2304×4096，体积 −89%） |

**项目所有者验收（project-owner verified）** —— 以下结论由项目所有者在真机上**实际执行并确认**，
但**没有**对应的独立设备 trace 记录，因此**不得**表述为「trace proves …」：

- **Real-device acceptance: PASS (project-owner verified)** —— 自定义高清头像最终**清晰**（修复后目视确认）；
- **Real-device acceptance: PASS (project-owner verified)** —— Save 后 kill/relaunch 仍为新图且清晰；
- **Real-device acceptance: PASS (project-owner verified)** —— stale-owner 保护保持有效（换 owner / 锁死时丢弃，不写入）；
- **Real-device acceptance: PASS (project-owner verified)** —— Add 照片链路不回归。

**证据来源区分**：本节上方的表格 = **设备日志证据**（有原始文档逐项记载）；
本段 = **项目所有者验收**。两类来源在本文中始终分开陈述，不互相冒充。

**回归确认**：圆形微信头像按钮（`chooseAvatar`）行为不变 ——
不应出现 native-return barrier 的挂起/恢复对。

---

## Regression coverage

主要 verifier（均在 `verify:all` 链内）：

| 命令 | 覆盖 |
| --- | --- |
| `npm run verify:avatar` | 头像持久化生产边界（含自定义入口 chooser 参数、`compressedWidth` 缺席、取消无副作用、Add 合同未被动过） |
| `npm run verify:sheet-edits` | 跨层：真实 Me + Sheet + ProfileEditor + 真实 `i18n` / `motionPresence`；sheet 保留窗口、native-return barrier 时序、异 owner 丢弃、close/detach 丢弃 |
| `npm run verify:native-flow` | native flow 的 suspend/show 契约 |
| `npm run verify:profile-sync` | Profile 投影与同步 |
| `npm run verify:identity` | identity 分区 / lease / fail-closed 矩阵 |

harness 复用约定：`verify-sheet-edits.cjs` 的 `appLifecycle()`、`nativeReturnIdentity(h)`
（**就地 patch** fixture 的 identity —— `nativeFlow` 持有其引用，整体替换无效）、
`meProfile()`（必须用**真实** `i18n` 与**真实** `motionPresence`，否则 `sheetMounted`
永不置位，跨层失败观察不到）。

诊断埋点说明：本轮曾有一个**纯内存环形缓冲**的 trace 模块与 `wx.__savorAvatarTrace`
导出（device trace 由此产生），**已在收尾时全部移除**，`miniprogram/` + `tools/` 零残留。
`verify-sheet-edits.cjs` 与 `verify-avatar-persistence.cjs` 中保留的 `AVATAR_*` 字样只有
**真实产品错误码**与 2 处注释。

---

## Final commit

```
612e3ed  fix: support reliable full-resolution custom avatars
```

同一条头像闭环（11 个文件，不拆分，否则中间 commit 失去可验证性）：

- `miniprogram/components/profile-editor/index.js`（native-return barrier、`completeAvatarSelection` 抽取、`_avatarUploading` Save 锁）
- `miniprogram/components/profile-editor/index.wxml` / `index.wxss`（胶囊自定义入口 + 样式）
- `miniprogram/pages/me/index.js`（`preserveSheet` 计算与传递）
- `miniprogram/utils/i18n.js`（`syncPage` 的 `preserveSheet` 逃生舱）
- `miniprogram/utils/avatar.js`（`chooseLocal` + 导出）
- `miniprogram/utils/locales.js` + `tools/lib/locale-translations.tsv`（新增文案，确定性生成）
- `tools/lib/reviewed-me-memory-return.cjs`（Me 整文件冻结哈希按已复核字节更新）
- `tools/verify-avatar-persistence.cjs`、`tools/verify-sheet-edits.cjs`（回归）

相关但**独立**的 commit：`e39c2ee`（Add 照片 native-return，见 `./add-native-return-fix.md`）、
`0c8ae68`（identity 分区迁移，见 `./identity-partition-migration.md`）。
