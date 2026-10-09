# 文档导航 — Savor

[返回项目首页](../README.md) · [AI 协作规则](../AGENTS.md)

> **START HERE。** 本页是**当前状态**的唯一入口。读完这一页就能知道项目现在是什么状态、
> 什么被冻结、下一步做什么、哪些结论有真机证据。
> 历史报告（`docs/reviews/`、`docs/history/`、`docs/mcp-*.md`）**只作追溯**，不代表当前实现。
>
> 仓库规则：[`AGENTS.md`](../AGENTS.md) · 开发与验证：[`docs/guides/development.md`](guides/development.md) ·
> 清理台账：[`docs/handoff/REPOSITORY-CLEANUP-20261001.md`](handoff/REPOSITORY-CLEANUP-20261001.md)

---

## 1. 当前产品状态

微信小程序，五个主 Tab：**Home / Map / Add / Us / Me**。
六条云函数：`account` `mealRecords` `media` `placeLookup` `spaces` `workspace`（均已部署，服务端强制身份）。
发布就绪度：包体在预算内、0 运行期 error、无直连域名、权限声明正确。
**发布阻塞：无。** 权限恢复已于 2026-10-02 按真机结果接受 **RELEASE WAIVER**（见 §3 / §5），
且 Add 检查点**已注册**（`CHECKPOINT REGISTERED — YES`）。**五页 UI 系统全部 FROZEN。**
**发布状态（2026-10-02）：已上传体验版 `1.2.4` 并完成真机冒烟 —— `READY TO SUBMIT FOR REVIEW`**（尚未提交审核）。
发布候选全量审计与上传后收口见 §8 的 canonical 发布文档。

## 2. 冻结页状态（逐页，2026-10-02 实测）

| 页面 | 生产 UI | 视觉批准 | 检查点注册 | 注册哈希是否 == 现场 | 重开条件 |
|---|---|---|---|---|---|
| **Home** | FROZEN | ✅ | ✅ `tools/home-identity-review.json` | **MATCH** | 仅功能 bug / 视觉回归 / 新需求 |
| **Map** | FROZEN | ✅ | ✅ `tools/map-identity-review.json` | **MATCH** | 同上；**且**不得回退 P0-1 / P0-2 |
| **Us** | FROZEN | ✅ | ✅ `tools/us-identity-review.json` | **MATCH** | 仅**可复现的真机可用性失败** |
| **Me** | FROZEN | ✅ | ✅ `tools/me-profile-review.json` | **MATCH** | 仅**可复现的可用性/语义问题** |
| **Add** | FROZEN | ✅（权限恢复的恢复入口已批准） | ✅ `tools/add-page-review.json` | **MATCH** | 仅功能 bug / 视觉回归 / 新需求 |

> **Add 已收口（2026-10-02）**：为权限恢复改动的 `pages/add/index.{wxml,wxss}` **已推进检查点** ——
> 现场 `a9e772e5…` / `a5bcba93…` 已注册，`verify:cloud` **272/272 EXIT 0**，五页**全部 MATCH**。
> **最小差分证明**：把恢复块逐字移除后，wxml/wxss 精确回到旧注册值 `10f6501a…` / `df572eae…`
> ⇒ 差异**只有**权限恢复，**无无关 UI 漂移**（category C = 0）。

## 3. 当前未决项

| 类别 | 项 | 状态 |
|---|---|---|
| **待裁决（Map 已重开）** | **Map A→B 相机连续性 + 全产品图片管线** | **已实现 + 静态/模拟器验证，等视觉·性能批准**。报告：`docs/reviews/map-camera-continuity-image-pipeline-20261002.md`。A→B 改为**帧驱动的 bound-centre travel**（`programmaticCameraTransition` token 抑制 regionchange 派生工作）；新增统一图片管线 `utils/imageCache.js`（L0–L3、批量+去重+24MB LRU、详情原图契约）。实测：A→B 首次选中下载 **1→0**、同 fileID 去重、Me 列表冷开 `getTempFileURL` **17→1**、暖开 **17→0**。`map-identity-review.json` **未推进**。⚠️ **真机 A→B 运动 = PENDING VISUAL CONFIRMATION**；card variant / P3 预取 / 服务端派生 未做（需批准） |
| **待裁决（已实现，待批准）** | **Map 相机运动 — marker focus / overview（上一轮）** | **已实现 + 静态/模拟器验证，等视觉·运动批准**。`map-identity-review.json` **未推进**（wxml/wxss 现场哈希 == 注册值）。报告：`docs/reviews/map-camera-motion-20261002.md`。⚠️ 真机运动质量 **NOT VERIFIED**（平台无相机动画 API，本机无真机附着）；focus 的「可视区居中」与「目标缩放」两项需要改冻结断言 / 换命令通道，**未做，需单独批准** |
| **已裁决（非阻塞）** | **权限恢复 — RELEASE WAIVER ACCEPTED（2026-10-02）** | **RELEASE BLOCKING = NO**。真机（OPPO PKB110 / Android 16）实测：正常 chooser **PASS**、取消 **PASS**、草稿安全 **PASS**；**永久拒绝在本机 NOT REPRODUCIBLE**（系统 `locationAuthorized='denied'` + `scope.userLocation=false` + 手机定位服务总开关 OFF，三者同时为真时 `wx.chooseLocation` **仍正常打开**）。恢复代码**保留**；`denial → 去设置 → 授权 → 重试` 这一环**未被实际走到**，因此**不声称 PASS**，只记 WAIVER。 |
| **已收口（2026-10-02）** | Add 检查点推进（权限恢复） | ✅ **已推进**：只改 `tools/add-page-review.json` 的 **2 个 `sha256`**（`baseSha256` / `review` 未动，`reason` 纯追加）；现场哈希已注册，五页 **MATCH** |
| **需人工控制台核对** | CloudBase 控制台的权限/索引/函数配置 | ⏳ 仓库工具无法证明，需人工核对 |
| **非阻塞** | Me 头像未加恢复入口（只审计未改） | 已记录，等裁决 |
| **已记录的限制** | 首次「选中」那条 10.6 MB 旧图会再下载 1 次（约 40 s 合成） | 既有渲染器设计，非缺陷；未修 |

## 4. 验证状态

- `npm run verify` → **EXIT 0 · 361/361 · FINAL STATIC VALIDATION: PASS**（2026-10-02 相机连续性 + 图片管线轮后实测）
- `npm run verify:cloud` → **EXIT 0 · 272/272**（冻结哈希链全绿；五页现场哈希 == 注册值）
- `npm run verify:all` → **EXIT 0 · 60 个顶层套件全部跑完 · 0 FAIL**（2026-10-02 加入 `verify:map-camera-motion` / `verify:image-cache` / `verify:detail-original` 后实测，4m46s）
- ⚠️ 本机 `npm run verify` / `verify:cloud` / `verify:all` 需要已知的 stdin shim：
  `NODE_OPTIONS="--require <无空格路径>/node-sync-stdin-shim.cjs"`（仓库路径含空格，放进 `NODE_OPTIONS`
  会被按空格拆分 ⇒ 先复制到 `%TEMP%` 再引用）。
- 2026-10-02 单独重跑并通过：`verify:permission-recovery`、`verify:visual-language`、`verify:ui`（44/44）、
  `verify:secondary-ui`（15/15）、`verify:icons`、`verify:memory-return`（13）、
  `verify:store-boundaries`（11）、`verify:structure`（6）。
- ⚠️ 此前长期记录的「Add 冻结页检查点漂移」**已收口**（见 §2）。当前**无已知红项**。
- ⚠️ 以上均为**静态 / 合成契约**验证，**不代替**真机与双账号验收。

## 5. 真机状态

| 项 | 有真机证据？ |
|---|---|
| Map P0-1 旧大图（魏家凉皮 10 607 530 B） | ✅ **真机 PASS**（marker 与卡片都渲染真实照片） |
| Map P0-2 Tab 返回缓存 | ✅ **真机 PASS**（中心/缩放/选中/POI 保持；零重下、零重建、零相机命令） |
| Map 快速切换 / 数据变化后返回 | ✅ **真机 PASS** |
| 权限恢复 — 正常流 / 取消 / 草稿安全 | ✅ **真机 PASS**（2026-10-01 + 2026-10-02，OPPO PKB110 / Android 16 / 微信 8.0.76 / SDK 3.17.3 / 视口 359×789）：位置 chooser 正常打开、可重复打开；取消后 `error` / `permissionRecovery` 均为空；草稿 **14 字段**在「2 次取消 + 3 次权限变更 + 2 次小程序重载」后**零变化**（`location` FNV digest `5b3a2970` 不变）。 |
| 权限恢复 — 永久拒绝 | ⛔ **NOT REPRODUCIBLE ON THIS DEVICE**（**既不是 PASS 也不是 FAIL**）。三种独立拒绝来源**同时**为真时 —— ①系统 `getAppAuthorizeSetting().locationAuthorized = 'denied'` ②小程序 `getSetting().authSetting['scope.userLocation'] = false` ③手机「定位服务」总开关 **OFF** —— `wx.chooseLocation` **依然正常打开**原生腾讯地图（有取消/搜索/定位针，仅附近列表转圈）⇒ 没有非取消失败 ⇒ `permissionRecovery.denied()` 不被调用 ⇒ **「去设置」正确地不出现**。**该设备上无法走到 `denial → 去设置 → 授权 → 重试`。** |
| 各页视觉（Home/Map/Us/Me/Add） | 模拟器渲染 + 解析度量；**模拟器不是硬件证据** |

> 真机设备：OPPO PKB110 / Android 16 / 基础库 3.17.3 / 视口 359×622。
> ⚠️ `simulator_screenshot` **截的是模拟器**（374×809），**不能**当硬件证据。

本轮 CLI `27946` 已接通上述手机的 **Wi-Fi 真机调试**，无需 USB ADB。
当前在 Add 的未保存测试草稿为 `Permission recovery test` / `keep-draft-20261001` / 1 星；
已确认定位 scope 为 `false` 时仍可成功选点，地点正常写入，其余 13 个草稿字段不变；
系统级微信位置权限关闭后，真机读数为 `locationAuthorized=false`；用户报告无法选点，
最初停在微信原生地图。用户现已按返回回 Add，报告无权限提示或「去设置」；真机读回一致，
包含地点的 14 个草稿字段全部不变。按返回后的安静状态与取消契约一致，**尚未确认应用 bug**。
已按用户更正使用专用 DevTools CLI；`simulator_screenshot` 成功取得 **374×809 模拟器 Home**，
不能展示手机原生地图。Wi-Fi 真机状态桥接可用，但无手机原生地图截图/返回接口，USB ADB 无设备。
通过原 `#field-location` 控件再次点击后，用户再次报告无法完成选点；最新真机状态和 14 个草稿字段不变。
已收到[手机原生地图截图](reviews/evidence/permission-recovery-20261001/native-map-os-location-denied.jpg)：列表为空、有加载圈。
随后用户用搜索成功选点并返回，真机确认**系统位置权限仍关闭**；只更新了 location，其余 13 个字段不变。
因此不做位置权限前置拦截，它会阻断已验证可用的手动选点。未复现实际拒绝失败，位置恢复仍 **UNVERIFIED**。
照片权限关闭后，用户报告出现提示和「去设置」；但 Add 真机 `error` / `permissionRecovery` 仍为空，
无上传，14 字段未变。下一步先确认提示来自微信原生弹窗还是 Add 表单底部，收到截图前不计 Add 恢复 PASS。
完整拒绝→设置→授权→重试链路尚未验证，未 CLOSED。
最新操作与证据见[权限恢复评审报告](reviews/permission-recovery-20261001.md)。

**2026-10-02 真机复核（A = LOCATION，判定已收口）**：只读探针在真机上逐步读回
`route / draft 字段摘要 / location FNV digest / error / permissionRecovery / 双权限信号`。
基线（`locationAuthorized=authorized`、`scope.userLocation=true`）→ 正常取消 → 系统位置权限关闭 →
回 Add → 点位置入口 → 小程序 scope 也拒绝 → 再点 → 手机定位服务总开关关闭 → 再点。
**四次快照相对基线的差异只有权限信号本身（`app` / `scope`），`error` / `permissionRecovery` 始终为空、
草稿 14 字段与 `locDigest 5b3a2970` 始终不变。** 用户手机截图确认第三次仍为「原生地图正常打开 + 附近列表转圈」。
⇒ 判定：**正常流 / 取消 / 草稿安全 = PASS；永久拒绝 = NOT REPRODUCIBLE**。
**该结论第三次否证「加系统位置权限前置拦截」的提案** —— 它会阻断这条实际仍可用的路径。
证据：`.workbuddy-ai/scratch/permission-confirmation-20261001/`（`qa-A-*.json`、`evidence/`）。
⚠️ 用户主动删除 `VID_1.mp4`（USER-OWNED INTENTIONAL CLEANUP）；生产/工具文件 361 项与会话基线一致。

## 6. 仓库结构

```
miniprogram/     小程序（pages / components / utils / images / styles / custom-tab-bar / vendor）
cloudfunctions/  六条云函数
tools/           验证套件、生成器、检查点 JSON、fixtures、构建源（不随包发布）
docs/            本目录
archive/         早期远端交接包（**部分克隆，多数文件只在 Git 对象里**，见 archive/README.md）
.workbuddy-ai/   本地会话状态 / 证据 / 归档（**gitignored**）
```

## 7. 历史报告在哪

- `docs/reviews/` —— 逐轮审计、修复与视觉记录（**按日期，只作追溯**）
- `docs/history/` —— 早期方案与阶段记录（**不是现行操作指南**）
- `docs/mcp-*.md` —— 2026-09-18 ~ 09-19 的 R2/R4/R5/R7 阶段收口（历史证据）
- `docs/design/` —— 设计参考与预览
- `.workbuddy-ai/archive/` —— 本地归档（含本轮把散落报告归入的
  `2026-10-01-hygiene-consolidation/scratch-reports/`）

## 8. 交接与清理台账

- [`AGENTS.md`](../AGENTS.md) —— 稳定的仓库规则（**不含状态 / 日期 / TODO**）
- [`docs/handoff/REPOSITORY-CLEANUP-20261001.md`](handoff/REPOSITORY-CLEANUP-20261001.md) —— 仓库清理台账（删除 / 归档 / 合并记录）
- [`docs/guides/development.md`](guides/development.md) —— 本地运行、验证与云部署的区别
- 唯一未决项的完整证据：[`docs/reviews/permission-recovery-20261001.md`](reviews/permission-recovery-20261001.md)
- **发布文档（canonical）**：[`docs/reviews/release-readiness-qa-20260930.md`](reviews/release-readiness-qa-20260930.md) —— **RC-1…RC-18 发布候选最终审计（2026-10-02）**；其 §1–§21 为 2026-09-30 历史记录

> **模型专属的交接层已移除（2026-10-02）。** 原 `CODEX-HANDOFF-20261001.md` 与
> `CODEX-6.1-SOL-QUICKSTART.md` 属于已终止的一次性交接流程，已删除；其中仍然有效的
> 项目状态（冻结页矩阵、未决项、验证状态、真机状态、架构不变量、不可触碰契约、
> 已接受权衡、源文件表）已迁入本页 §1–§5 与 §12–§15。
> **当前执行入口只有本页** —— 不要新建 `WORKBUDDY-HANDOFF` / `AI-HANDOFF` / `QUICKSTART` 之类的替代层。

## 9. 目录约定

- `status/`：当前状态与验收边界（**先看这里**）
- `reviews/`：具体审计、修复、视觉迭代记录
- `handoff/`：仓库清理台账（模型专属交接层已于 2026-10-02 移除）
- `design/`：设计参考、HTML / SVG 预览
- `history/`：历史方案与阶段记录，**不作为现行操作指南**
- `superpowers/`：Stage 6 / Stage 7 的计划与规格
- 根目录 `mcp-*.md`：2026-09-18 ~ 09-19 阶段收口报告，属历史证据
- 早期远端交接包见 [`archive/`](../archive/README.md)

## 10. 开发与验证

- [开发与验证指南](guides/development.md)
- ⚠️ [总进度](status/PROJECT_PROGRESS.md) —— **历史记录，增量停在 2026-09-16**，不代表当前 HEAD
- ⚠️ [统一验收清单](status/UNIFIED_ACCEPTANCE.md) —— **历史记录，增量停在 2026-09-16**，未完成项以「真实设备 / 双账号」为准

> 这两份 `status/` 文件顶部已有状态提示，说明其内容为历史快照。当前状态以本页 §1–§5 为准。

## 11. 历史索引（追溯用）

- [2026-09-25 ~ 09-28 修复与迭代](reviews/) —— 图片/媒体/地图/餐饮类型/TabBar 逐轮记录
  （**含已回退或已暂停的实验方案**，注意各文件顶部的 `REVERTED` / `DEFERRED` / `EXPERIMENTAL` 标注）
- 长期 RCA：`release-closeout-v1.2.3-20260929.md`、`release-closure-20260924.md`、
  `avatar-final-rca-and-fix.md`、`identity-partition-migration.md`、`add-native-return-fix.md`
- [历史资料索引](history/)
- [设计资料索引](design/)

## 12. 架构与关键不变量

- **状态存储**：`miniprogram/utils/store.js` 是唯一发布状态。`commit()` 写存储、合并 state、
  自增**单调** `revision()` 并通知订阅者。`revision()` 是消费者做记忆化的**唯一新鲜度信号**
  （revision 未变 ⇔ 自上次渲染以来没有通知被发布）。`mergeCloudRead()` 在合并结果与本地
  规范化序列化**相同**时**不再 commit**。
- **身份**：`utils/identity.js` 的每次读写都在**租约**下进行；`assertLease` / `resumeNative`
  防止过期 owner。原生选择器会让小程序退到后台，`App.onShow` 会在回调在途时重新校验身份，
  被取代的结果会被丢弃。服务端：**每条云函数自行强制身份，从不信任客户端**。
- **云**：`utils/cloudRecords.js` 是唯一与 CloudBase 通信的模块；**页面绝不直接调用 CloudBase**。
  六条云函数全部部署在 env `cloud1-d9gqm52id66c0bcda`。客户端**无直连 HTTP 域名**。
- **主 Tab 切换不是页面生命周期边界**：主 Tab 页实例常驻，切走只 `onHide`、切回只 `onShow`；
  `<map>`、WXML 节点树、`markerCanvas` 都跨 Tab 存活。**禁止在 `onHide` 销毁派生视图模型**；
  **禁止在 `onShow` 无条件重读产品数据 / 重建 marker 表**；释放归属 `onUnload`。
- **检查点 / 哈希链模型**：冻结页由 `verify:cloud` 校验的**哈希链**钉住 ——
  `ui-baseline.json` → `ui-approved-updates.json` → `visual-refinements.json` → 各 `*-review.json` → 实际文件。
  每链接断言 `baseSha256 === 上一步的 sha256`，末链接断言实际文件哈希 === 链末端。
  `reason` **只追加**；`review` 被硬断言、**不得修改**。`pages/me/index.js` 另有整文件闸门
  `tools/lib/reviewed-me-memory-return.cjs`（`approvedSha256`）。
- **验证系统**：`tools/verify-*.cjs` 是静态套件；`npm run verify` 是静态门禁，
  `npm run verify:all` 是完整链（**遇到第一个失败即停**）。

## 13. 不可触碰的契约（do-not-touch）

1. **不要为外观重开冻结页**（Home / Map / Us / Me）—— 只有满足 §2 的重开条件才行。
2. **不要随意改动 Add 评分布局** —— 6rpx 的 Date 文本内边距由五星块预留。
3. **不要改动 Map P0-1 / P0-2 的修复**：保留照片「进度静默窗口」、保留渲染器跨 `onHide` 存活、
   保留 `store.revision()` 闸门与有界云同步窗口。
4. **不要把 Map 原生 POI 开关的默认值改回 OFF** —— 它是产品状态，默认 ON、用户可切换。
5. **不要移除 Map 的 Tab 返回缓存。**
6. **不要重新引入重复的 Me 菜单图标**（并保留 `pages/me/index.js` 里的 `MENU_ROWS`）。
7. **不要恢复 Us 那个厚重的管理 CTA** —— 安静的次级行才是已批准状态。
8. **不要弱化权限恢复的取消/拒绝分类** —— 判定只来自权威平台信号，绝不做文案字符串匹配；
   `wx.openSetting` 只在一个用户点按处理器里可达。
9. **不要在没有明确批准的情况下推进任何 review / registration 哈希。**
10. **不要在没有当轮明确要求时 commit / push / deploy。**
11. **不要加系统位置权限前置拦截** —— 真机证明权限被拒时手动搜索仍可用，拦截会阻断这条可用路径。

## 14. 已知并接受的权衡

- **模拟器截图不是硬件证据。** 始终把 `simulator_screenshot` 的尺寸与设备自身 `getWindowInfo()` 比对。
- **Add 的 Date 文本内边距是 6rpx** —— 已接受，由五星评分块预留。
- **首次未缓存的照片合法地会下载一次**；只有同一变体的**重复**下载才是缺陷。
- **选中一张很大的历史照片会多付一次下载**（渲染器缓存键是 `[source, selected]`）；暂予接受。
- **原生地图有平台限制** —— 真机不渲染原生缩放控件，`scale` prop 会截断小数，
  因此应用只用 `data.commandScale` 作为唯一命令通道。
- **TabBar 图标 morph 已冻结**；Phase 1D 已回退、2A–2E 已 DEFERRED。不要借其它工作重新讨论它。
- **历史取证工具限制**：这是 `blob:none` 部分克隆 —— **绝不 `git stash`**；若 git 报
  `bad object HEAD` / `not our ref` 或 `status` 静默无输出，**停止一切 git 写**。

## 15. 关键源文件（source of truth）

| 关注点 | 路径 |
|---|---|
| 应用注册 | `miniprogram/app.json`（pages / tabBar / permission / requiredPrivateInfos） |
| 状态存储 | `miniprogram/utils/store.js` |
| 身份 | `miniprogram/utils/identity.js`、`identityPartitions.js`、`identityCopy.js` |
| 云记录仓储 | `miniprogram/utils/cloudRecords.js` |
| 权限 | `miniprogram/utils/permissionRecovery.js` + `app.json.permission` |
| 位置 | `miniprogram/utils/locations.js` |
| 照片 | `miniprogram/utils/photos.js`、`avatar.js`、`chunkStorage.js` |
| 设置 | `miniprogram/utils/settingsRepository.js` |
| 本地化 | 源 `tools/lib/locale-translations.tsv`；生成 `miniprogram/utils/locales.js` |
| 图标 | 源 `miniprogram/images/icons/lucide/*.svg` + `tools/assets/icons/lucide/SOURCES.json`；别名 `tools/icon-aliases.json`；生成 `utils/icons.js`、`utils/lucideMorphNodes.js`、`tools/_gen/icons.json` |
| 评审 / 检查点 | `tools/{home,map,us}-identity-review.json`、`me-profile-review.json`、`add-page-review.json`、`map-frame-review.json`、`visual-refinements.json`、`tools/fixtures/regression/ui-baseline.json`、`ui-approved-updates.json`、`tools/lib/reviewed-me-memory-return.cjs` |
| 验证入口 | `package.json` 的 `verify` / `verify:*`；套件在 `tools/verify-*.cjs` |
