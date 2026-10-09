# SAVOR — 权限恢复（永久拒绝后的可恢复路径）

**日期**：2026-10-01
**性质**：RELEASE-P0-4 的最小产品修复 + 语义守卫
**未 commit / 未 push / 未 deploy。UI 检查点未推进。**

---

## 1. 权限能力矩阵（基于实际代码路径，不假设 API 共用同一权限模型）

| ACTION | API | 页面 | 现有错误路径 | 用户取消 | 临时失败 | 永久拒绝（修复前） | 现有文案 | 现有重试 | 原 `openSetting` | 影响页 |
|---|---|---|---|---|---|---|---|---|---|---|
| Add 多选照片 | `wx.chooseImage`（Android 且 count>1 时优先）/ `wx.chooseMedia` | Add | `photos.choosePhotos` → `failure('choose',e)` → `CHOOSE_FAILED` / category `image` | `isCancelled()` → `PHOTO_CANCELLED`，Add 置 `error:''`（安静）✅ | 通用重试文案 | **与临时失败无法区分** ❌ | `Could not prepare the photo. Please select it again.` | 重新点按控件 | **无** | `pages/add/index` |
| Add 单选照片（含相机） | `wx.chooseMedia({sourceType:['album','camera']})` | Add | 同上 | 同上 | 同上 | 同上 | 同上 | 同上 | **无** | 同上 |
| 餐厅位置选择 | `wx.chooseLocation`（`scope.userLocation`，`requiredPrivateInfos`） | Add | `locations.choose` → `error.cancelled` + `i18n.t(message)` | `cancelled:true` → 安静 ✅ | 通用文案 | **无法区分** ❌ | 由**中文字面量**作为 `i18n.t` 的键（见 §3） | 重新点按 | **无** | 同上 |
| 分享导入的位置选择 | `wx.chooseLocation` | Add | `onImportNativePick` | 安静 ✅ | 通用 | **无法区分** ❌ | 同上 | 重新点按 | **无** | 同上 |
| Me 头像选择 | `wx.chooseMedia` | Me（`components/profile-editor`） | `avatar.chooseLocal` → `AVATAR_CHOOSE_FAILED` | `photos.isCancelled` → 返回 `''`（安静）✅ | 通用 | **无法区分** ❌ | `Could not prepare the photo. Please select it again.` | 重新点按 | **无** | `components/profile-editor` |
| Me 云端头像 | `wx.chooseMedia` | Me | 直接 reject，**未分类** | 未分类 | — | — | — | 重新点按 | 无 | 同上 |
| Sheet JSON 导入 | `wx.chooseMessageFile` | sheet | reject | — | — | **无 scope 门禁**（文件选择器不受 scope 约束） | — | — | n/a | `components/sheet` |
| Workspace JSON 导入 | `wx.chooseMessageFile` | workspace | reject | — | — | **无 scope 门禁** | — | — | n/a | `pages/workspace` |

**结论**：**只有 `wx.chooseLocation` 会被一个"永久拒绝"直接打死**（`app.json` 声明了 `permission["scope.userLocation"]` 且 `requiredPrivateInfos:["chooseLocation"]`）。
照片路径的 scope 是 `scope.camera`（只影响相机入口，且仅 `count===1` 时进入 sourceType），相册选择不受 scope 约束 —— 但平台**确实**会以 `auth deny` 让 chooser 整体失败，因此本轮同样纳入，只是**由平台信号门控**，不会误报。

## 2. 取消 / 临时失败 / 永久拒绝 的三分（强制项）

| 状态 | 判定依据 | 产品表现 |
|---|---|---|
| **A. 用户取消** | 原生 `errMsg` 以 `cancel` 结尾（平台自己的结构化消息格式，**不是中文匹配**） | **安静返回**：不显示错误、不显示设置入口、清掉上一次的恢复态、原控件仍可用 |
| **B. 临时/可恢复失败** | 真失败，但平台**没有**报告任何拒绝 | 保留既有"请重试"文案，**不出现**设置入口 |
| **C. 永久/需去设置** | 真失败 **且** 平台明确报告拒绝 | 说明文案 + **显式「Open Settings / 去设置」** 动作 |

三种状态**绝不合并**。守卫对三者分别断言（§7）。

## 3. 根因

1. **App 从不查询任何权限状态**。所有非取消的 chooser 失败都被压成同一句"请重试"，
   于是永久拒绝表现为**无法恢复的死循环**：再点控件，微信不再弹权限框，永远同样失败。
2. **可用的权威平台信号**（已在真机上确认存在）：
   - `wx.getSetting().authSetting[scope]` —— `undefined` = 从未询问（再次询问**会**弹框）、`true` = 允许、**`false` = 已拒绝**；
   - `wx.getAppAuthorizeSetting()[locationAuthorized | cameraAuthorized | albumAuthorized]` —— `'authorized' | 'denied' | 'not determined'`。
   真机读数（OPPO PKB110 / Android 16 / 基础库 3.17.3）：`authSetting = { scope.userLocation: true, scope.address: true, scope.invoice: true, scope.invoiceTitle: true, scope.userInfo: true }`；
   `getAppAuthorizeSetting() = { albumAuthorized: undefined, cameraAuthorized: 'authorized', locationAuthorized: 'authorized', ... }`。
   ⇒ **`undefined` / `'not determined'` / `'authorized'` 都表示"不是永久拒绝"**，恢复入口因此**不可能**在取消或临时失败后出现。
3. **不使用字符串猜测**：不匹配任何中文/英文错误文案；`cancel` 只按平台自身的 `choose*:fail cancel` 前缀判定（这是平台契约，不是本地化文案）。

### ⚠️ 对既有审计结论的一处**更正**（重要）

`release-readiness-qa-20260930.md` / `release-hygiene-20260930.md` 记录「`locations.js` 的中文字面量在 EN 下泄漏中文」。
**这条结论不成立**：`i18n.t` 的查找是 `catalog.find(row => row.en === value || row.zh === value)`，
该中文字符串**就是**目录里的一个 `zh` 值（key `sada9a9ba03`，EN = `Could not open Tencent Maps. Check location permission and the mini program privacy settings, then retry.`），
所以在 EN 下它会解析成**英文**。全仓 6 处 `i18n.t('<CJK>')` **全部都能解析**，没有泄漏。

本轮仍把 `locations.js` 里那一处改成**用英文键引用同一行目录**：
**渲染文案在 EN/ZH 下逐字不变**，只是源码不再依赖"中文查找键"这种脆弱写法。
（未新增、未删除任何文案行。）

## 4. 选定的恢复交互

**现有内联错误区 + 一个小的次级恢复动作**，其余一律不加。

- **门控**：只有 `permissionRecovery` 被置位时才渲染；该状态**只**在"真失败 + 平台明确拒绝"时写入。
- **动作**：一行 caption 尺寸、`--muted`、带下划线的文本动作「**Open Settings / 去设置**」——
  直接复用**本页已有的**安静文本动作写法（`pages/add/index.wxss` 的 `.geo-toggle`：`--type-caption` + `--muted` + `text-decoration: underline` + `text-underline-offset: 8rpx`）。**没有新面、没有新控件族、没有大 CTA、没有弹窗、没有全屏页、没有全局权限中心。**
- **只在用户点按时**调用 `wx.openSetting`（平台要求用户手势）；页内**只有一处**调用点，且被状态与身份围栏双重门控。
- **返回后不自动重开选择器**：清掉错误与恢复态，原控件恢复可用，由用户自己再点一次（符合 brief 的偏好）。
- 不产生重复 `wx.openSetting`（点击瞬间即清状态），也不会留下过期的拒绝横幅（返回即清）。

## 5. 改动的页面 / 文件

| 文件 | 变化 | 性质 |
|---|---|---|
| `miniprogram/utils/permissionRecovery.js` | **新增**：`denied(action)`（只读平台信号）+ `openSettings()`（仅由用户手势调用） | 新工具 |
| `miniprogram/utils/locations.js` | 取消/失败分开；失败时按平台信号判定是否拒绝；文案改用英文键 | 逻辑 |
| `miniprogram/pages/add/index.js` | 新增 `permissionRecovery` 状态、`onOpenSettings` 处理器、三处清理点、照片失败分类 | 逻辑 |
| **`miniprogram/pages/add/index.wxml`** | **冻结文件**：错误区下方新增受门控的恢复动作（1 个 `bindtap` + 1 个 `wx:if`） | 冻结 UI |
| **`miniprogram/pages/add/index.wxss`** | **冻结文件**：新增 2 条规则（`.permission-recovery` / `.permission-recovery-action`） | 冻结 UI |
| `tools/lib/locale-translations.tsv` + `miniprogram/utils/locales.js`(生成) | +3 条 EN/ZH | 文案源 |
| `tools/verify-permission-recovery.cjs` | **新增**守卫 | 闸门 |
| `package.json` | 注册 `verify:permission-recovery` 并插入 `verify:all` | 脚本 |

**未触碰**：Map P0-1 / Map P0-2 / Us P1-1 / Me P1-2 图标 / Home / Rating / 照片几何 / Map 视觉 / 全局间距 / 动效。

### 冻结 UI 重开的报备（brief 要求先报备）

| 项 | 内容 |
|---|---|
| **PAGE** | `pages/add/index`（餐厅位置 + 照片） |
| **CURRENT STATE** | 错误区只有一个不可点的 `<text class="form-error">`；失败文案对"临时失败"和"永久拒绝"完全相同 |
| **PROPOSED RECOVERY AFFORDANCE** | 错误区正下方一行受门控的安静下划线文本动作「Open Settings / 去设置」 |
| **EXACT FILES** | `pages/add/index.wxml`（+1 个 `wx:if` 包裹的 `view`）、`pages/add/index.wxss`（+2 条规则）、`pages/add/index.js`（+状态与处理器） |
| **WHY JS-ONLY CANNOT SOLVE IT** | `wx.openSetting` **必须由用户手势触发**；纯 JS 无法在错误区里凭空造出一个可点目标 ⇒ 必须有一个 WXML 元素承载 `bindtap`。 |

## 6. 本地化

新增 3 个键（均 EN+ZH，经 `tools/lib/locale-translations.tsv` → `npm run build:locales` 生成）：

| key | EN | ZH |
|---|---|---|
| `sbb16bc4970` | Location permission is needed to choose a restaurant location. | 选择餐厅位置需要定位权限。 |
| `sbd17d58cf8` | Photo permission is needed to add a photo. | 添加照片需要照片权限。 |
| `s134635e9a2` | Open Settings | 去设置 |

- **无内联双语字面量**；WXML 只用 `{{copy.s134635e9a2}}`，**没有硬编码权限文案**。
- 文案结构与 brief 一致：**MESSAGE = 这个动作需要权限**；**ACTION = Open Settings / 去设置**。
  早期草稿的 message 里也含 "Open Settings"，与动作标签**重复**，已改掉（见 §13 截图）。
- 不使用 `authorization scope` / `system permission state` / `wx.openSetting` / `scope.writePhotosAlbum` 等术语。
- **位置失败路径的英文侧不含中文**：`utils/locations.js` 中不再有任何 CJK 字面量传给 `i18n.t`（守卫断言）。

## 7. 状态测试矩阵结果（本地，stub 驱动真实模块）

| # | 场景 | 结果 |
|---|---|---|
| 1 | 正常成功 | ✅ 不变（`choose` 成功路径未改） |
| 2 | 正常取消 | ✅ `cancelled:true`、`permissionDenied:false`、文案 = `Location selection cancelled.`、Add 置 `error:''`、**无设置入口** |
| 3 | 首次拒绝（scope 从未询问） | ✅ 视为**非**永久拒绝（`undefined`）⇒ 保留重试文案，**无设置入口** |
| 4 | 永久拒绝（`scope=false` 或系统 `'denied'`） | ✅ `permissionDenied:true` + 恢复文案 + 设置入口 |
| 5 | Open Settings | ✅ 仅从 `onOpenSettings` 调用（全页唯一调用点，且受状态门控） |
| 6 | 返回但未授权 | ✅ 错误与恢复态均被清空，**不自动重开选择器**，无过期横幅 |
| 7 | 再次 Open Settings | ✅ 需再次点按（状态已清 ⇒ 不会重复触发） |
| 8 | 授权后重试 | 需真机确认（本地无法真实改权限） |
| 9 | 重试动作 | 同上 |
| 10 | 成功 | ✅ 成功路径清空 `error` 与 `permissionRecovery` |
| — | 草稿完整 | ✅ 权限错误路径的 `setData` **不含** `draft` 字段（守卫逐处断言） |
| — | 不重复打开选择器 | ✅ 无新增自动重开逻辑 |
| — | 跨页状态泄漏 | ✅ 状态在 `pages/add` 实例内，`onOpenSettings` 走身份围栏 |

## 8. 正常取消结果
✅ **安静**：`error:''`、无设置入口、原控件可用。守卫断言"取消**绝不**被当作拒绝，即使 scope 已拒绝"。

## 9. 永久拒绝结果
✅ 显示 `Location permission is needed to choose a restaurant location.` + 「Open Settings」。

## 10. Open Settings 结果
✅ 只从显式点按调用；返回后清空错误与恢复态；**不**自动重开选择器。

## 11. 返回 / 重试结果
✅ 控件恢复可点；用户再点一次即重新发起。**重复 openSetting 与过期横幅均由状态清空防止。**

## 12. 草稿安全
✅ 权限错误只写 `error` / `permissionRecovery`；`draft` 只在显式重置时替换（`draft: store.freshDraft()` 不在任何错误路径）。照片、餐厅、备注、日期、评分、标签、草稿、滚动位置均不受影响。

## 13. 受影响 UI 的截图

**⚠️ 这些是模拟器渲染，不是真机证据**（本轮自动化目标是模拟器；真机要求见 §16）。
渲染方式：在运行时把页面置于恢复态（`permissionRecovery:'location'`）后截图，采完已还原。

| 文件 | 内容 |
|---|---|
| `.workbuddy-ai/scratch/map-p03/perm-pearl-zoom.png` | **PEARL**：错误块 + 「Open Settings」 |
| `.workbuddy-ai/scratch/map-p03/perm-dusk-zoom.png` | **DUSK**：同上 |

既有模拟器布局测量（428×926 视口；**不作真机证据**，本轮未重新测量）：

| 元素 | 盒 | 位置 |
|---|---|---|
| `.form-error`（错误块） | 354.2 × 61.7 | top 578.7 → bottom 640.4 |
| `.permission-recovery`（包裹） | 384 × 21 | **top 646** ⇒ 与错误块底 **净空 5.6px** |
| `.permission-recovery-action`（可点动作） | **85.8 × 21** | top 646 |

**过程中修正的两处自身缺陷**（都已改）：
1. 首版 `margin-top: 0` ⇒ 动作**压在错误块底边上**（重叠 9.3px，因为 `.form-error` 是 `<text>`，其垂直 margin 不参与布局）；改为 `margin-top: 28rpx` 后净空 5.6px。
2. 首版 message 里含 "Open Settings"，与动作标签**重复**；已改为只说明"这个动作需要权限"。

## 14. 验证

| 命令 | 结果 |
|---|---|
| `verify:permission-recovery`（新增） | **EXIT 0** — 4 组断言全过 |
| `verify:visual-language` | EXIT 0 — 13 |
| `verify:ui` | EXIT 0 — 44/44 |
| `verify:memory-return` | EXIT 0 — 13/13 |
| `verify:store-boundaries` | EXIT 0 — 11/11 |
| `verify:secondary-ui` | EXIT 0 — 15/15 |
| `verify:icons` / `verify:me-menu-icons` | EXIT 0 |
| `verify:cloud` | 见 §15（**预期红**：Add 冻结哈希已变，按指示不推进） |
| `npm run verify` | **EXIT 0 — 359/359，FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all`（临时推进 Add 链节后） | **EXIT 0**（57 顶层脚本，0 FAIL，新守卫在链内） |

### 守卫的 RED 证明（两种）
```
# RED 1 — 取消不再短路（把取消并入拒绝）
AssertionError: a cancel must be classified as cancelled

# RED 2 — 出现第二个 openSettings 调用点
AssertionError: the Add page must call openSettings from exactly one place
```

守卫覆盖 brief 要求的 6 项：取消不显示恢复 / 永久拒绝显示 / `openSetting` 仅由显式点按触发 /
EN+ZH 键存在 / 草稿不被权限错误清空 / 位置英文路径无中文兜底。
断言方式为**语义级**（加载真实模块 + stub 平台、检查调用点数量与状态门控），**不依赖行号**。

## 15. 冻结检查点影响

- **未推进任何检查点。**
- 变更后的冻结页哈希：
  - `pages/add/index.wxml` = `a9e772e513cd4a0685d4bb0e620586ab871638566801abbfcfcb79054c42c1b7`
  - `pages/add/index.wxss` = `a5bcba93dc808263ddee38c6dac3c45f52e8e949393d82ba1fd5afe8e688a43b`
- `verify:cloud` 因此**在 Add 链节处红**（预期）。为证明其余全绿，做了**可逆的临时推进**
  （`ui-approved-updates` / `visual-refinements` / `add-page-review` 三处共 6 个字段）→ 跑完
  `verify:cloud`(272/272) + `verify`(359/359) + `verify:all`(EXIT 0) → **从备份原样还原**，
  三个 fixture 与改动前**逐字节相同**（已 `cmp` 核对）。
- **Us / Me / Map / Home 的检查点未受影响。**

## 16. 需要的真机证据（未关闭本项）

**权限恢复必须在真机上验证；模拟器只能证明状态逻辑。** 需要一段手机录屏或逐步截图：

1. 正常取消一次（应安静返回）
2. 造成一次**永久拒绝**（在系统设置里关掉该权限）
3. 点按「去设置」
4. 授予权限
5. 返回
6. 再次点按原控件 → **成功**

至少在被复现拒绝的那个平台上。在此之前**不声称 CLOSED**。

---

## 17. 本轮明确没做的事

- ❌ 未 commit / 未 push / 未 deploy
- ❌ 未推进任何 UI 检查点
- ❌ 未给 Me / 头像加恢复入口（见 §1：头像与 Add 照片共用同一 `chooseMedia` 模型，
  但 `components/profile-editor` **不在冻结清单**、其失败**不丢失任何草稿**；
  按 brief「do not manufacture a Me change」本轮**只审计、不改**，等你裁决是否要同样处理）
- ❌ 未新增 `getLocation`（`app.json` 权限声明未改）
- ❌ 未改动 `wx.chooseMessageFile` 的两处导入（文件选择器不受 scope 约束，无永久拒绝可恢复）
- ❌ 未做任何机会性清理

## 18. 最终建议

**READY FOR REAL-DEVICE PERMISSION CONFIRMATION**

唯一未决项 = §16 的真机权限流程验证。

## 19. 本轮真机确认进展（2026-10-01，未关闭）

本轮通过 CLI `27946` 接入 **Wi-Fi 真机调试**；运行时读数为 OPPO PKB110 / Android 16 /
WeChat 8.0.76 / SDK 3.17.3 / 359×622，`platform=android`。此前读到的 428×926 iPhone
运行时是模拟器，不作硬件证明。真机调试使用工具端 Storage；独立运行/冷启动持久化未验证。

初始 `getSetting` 读回 `scope.userLocation=true`。通过原有输入控件准备未保存草稿：
餐厅 `Permission recovery test`、备注 `keep-draft-20261001`、评分 1 星，保留原日期 2026-09-28。
用户已报告正常取消照片及位置 chooser。随后真机读回：`error=''`、`permissionRecovery=''`、
`uploading=false`；前后草稿 **13 字段完全一致**。这证明该次取消后的状态与草稿符合预期；
尚未收到逐项手机录屏，不能将其扩展为完整权限恢复 PASS。

**最新实测**：用户关闭小程序定位权限后，`getSetting` 确认 `scope.userLocation=false`，
且完成选点后地点正常写入（`locationSource=tencent-picker`、`coordinateSystem=gcj02`），
原有 13 个草稿字段完全不变，scope 仍为 `false`，`error` / `permissionRecovery` 均为空。
**系统级拒绝实测**：关闭 Android 微信位置权限后，运行时读回 `locationAuthorized=false`，
小程序 scope 为 `true`。用户报告不能选点、无恢复提示，并进一步确认**仍停在微信原生地图内**。
Add 读回 `error=''`、`permissionRecovery=''`、`identityReady=true`。
**返回后的结果**：用户已保持权限关闭，从原生地图按返回回 Add，报告无权限提示或「去设置」。
真机读回错误/恢复态为空；包括此前选中地点的 **14 个字段全部不变**。
代码先分类 cancel，再查询 denial；该次返回与安静取消契约一致，原生 callback/errMsg 尚未捕获。
已按用户更正走专用 DevTools CLI。`simulator_screenshot` 成功，但画面为 **374×809 模拟器 Home**，
与真机 **359×622 Android Add** 分开记录。工具目录没有手机原生地图截图/返回动作，USB ADB 无设备；
Wi-Fi 真机状态桥接仍可用。已通过原 `#field-location` 控件再次点击成功；用户再次报告进入原生地图后
无法完成选点。第二次真机读回仍是系统权限关闭、定位服务开启、scope=true、错误/恢复态为空，14 字段不变。
已收到[用户提供的手机截图](evidence/permission-recovery-20261001/native-map-os-location-denied.jpg)，
原样保存，SHA-256 `d292b28987a329cb496c79e1f6d946163c0af1f8d64c31c1e7e72becc8609fc5`。
画面为原生地图，底部地点列表空白、有加载圈，能看到取消与搜索，未见完成入口。**这是真机截图，非模拟器**。
**搜索结果已确认**：用户搜索、选中并完成返回 Add；真机读回系统位置权限仍为关闭，scope=true。
仅 location 改变（Tencent picker / GCJ-02 / 有效坐标），其它 13 字段全部保留，错误/恢复态为空，无保存/上传。
最新状态读回仍无错误/恢复入口、无保存/上传，原始 13 个草稿字段不变，只有此前成功选择的 location 新字段。
`get_simulator_console` 对 chooseLocation 无匹配日志，不代表硬件未执行回调。
当前属于原生地图内部受阻及按返回后安静取消的报告；尚未捕获拒绝失败回调，不能提前断言 Add 错误处理失效。
源码已确认仅在 chooser 非取消失败后判 denial。已排除本次位置权限前置拦截方案：它会阻断实际可用的手动搜索。
截图只证明原生附近列表加载受阻；未复现真实拒绝失败，**不能判定 Add 恢复逻辑 bug，也不能记恢复 PASS**。
**照片拒绝尝试**：用户关闭系统照片权限、点原照片入口后，报告提示和「去设置」。但真机 Add 的
`error` / `permissionRecovery` 仍为空，`uploading=false`，14 个草稿字段全部不变。
**当前等待**：先保持提示，不点设置，确认这是微信/Android 原生弹窗、Add 表单底部入口或已消失，
并提供手机截图。原生权限弹窗不能计为 Add `onOpenSettings` / `wx.openSetting` 门控通过。
空照片草稿走 count=9、Android chooseImage、album-only；不能用相机拒绝替代该测试，不能伪造 count 或恢复态。
仅关闭 scope 不能据此假定 chooser 已被永久拒绝；恢复入口本就只在实际失败后门控。
因此 §1「永久拒绝直接打死 chooseLocation」在该设备上目前**没有得到复现支持**，不能当成现行硬件结论。
不要 mock 失败或写入恢复态作为硬件证明。
若实际出现拒绝失败，再由用户主动点「去设置」→ 授权 → 返回（停住，确认无自动 picker）→
主动重试 → 成功。照片永久拒绝分支、EN/ZH、PEARL/DUSK 真机视觉及完整手机录屏仍待确认。

本轮静态门禁 **359/359 EXIT 0**；权限恢复及 Add 返回/身份、草稿、UI、视觉源契约、Me 图标、
Map 照片预算/返回缓存等 11 个单独守卫均 **EXIT 0**。完整门禁停于 `verify:cloud` 的 Add WXML
预期哈希漂移（**EXIT 1**），没有执行后续链节；没有临时推进任何 checkpoint。

无生产代码/UI/测试/checkpoint 修改，无 commit/push/deploy。唯一变动是 canonical 文档与本地证据。
恢复原生工具检查后再次核对：361 个生产/工具文件与会话基线一致。git 新出现的 ` D VID_1.mp4`
来源未明，本次没有删除或还原该文件。
细节及操作清单见本文件 §19（2026-10-01 会话）与 §20（2026-10-02 收口与裁决）。
证据目录：`.workbuddy-ai/scratch/permission-confirmation-20261001/`。
**REAL-DEVICE-VERIFIED 仅限已记录的设备/状态读回和取消后草稿；完整恢复未验证，未 VISUALLY APPROVED，未 CHECKPOINT-REGISTERED，未 CLOSED。**

---

## 20. 真机复核收口 — RELEASE WAIVER（2026-10-02）

**性质：只读真机取证 + 文档收口。生产代码 / 测试 / checkpoint 零改动；未 commit / push / deploy。**

设备：**OPPO PKB110 / Android 16 / 微信 8.0.76 / SDK 3.17.3 / 视口 359×789**，Wi-Fi 真机调试。
取证方式：`automation_evaluate` 只读探针，逐步返回 `route`、草稿字段摘要、`draft.location` 的 FNV digest、
`error`、`permissionRecovery`，以及**两个**权限信号（`getAppAuthorizeSetting()` 与 `getSetting().authSetting`）。
**不回显任何地址文本或 userId。**

### 20.1 逐步读数（A = LOCATION）

| 步骤 | `locationAuthorized` | `scope.userLocation` | `error` | `permissionRecovery` | 草稿 | `locDigest` |
|---|---|---|---|---|---|---|
| 基线（已填草稿） | `authorized` | `true` | empty | empty | 14 字段 | `5b3a2970` |
| 正常**取消**后 | `authorized` | `true` | empty | empty | 14 字段 | `5b3a2970` |
| 系统位置权限**关闭**、重进 Add | `denied` | `true` | empty | empty | 14 字段 | `5b3a2970` |
| 原生 picker 打开时（有手机截图） | `denied` | `true` | empty | empty | 14 字段 | `5b3a2970` |
| 小程序 **scope 也拒绝** | `denied` | `false` | empty | empty | 14 字段 | `5b3a2970` |
| 手机**定位服务总开关关闭** | `denied` | `false` | empty | empty | 14 字段 | `5b3a2970` |

相对基线，**唯一**变过的键就是权限信号本身（`app` / `scope`）。`error` 与 `permissionRecovery` 全程为空；
**14 个草稿字段与 `location` digest 全程未动** —— 期间经历 **2 次取消、3 次权限变更、2 次小程序重载**。

### 20.2 判定

| 维度 | 判定 |
|---|---|
| REAL-DEVICE NORMAL FLOW | **PASS** |
| REAL-DEVICE CANCEL | **PASS** |
| REAL-DEVICE DRAFT SAFETY | **PASS** |
| REAL-DEVICE PERMANENT DENIAL | **NOT REPRODUCIBLE**（**既非 PASS 也非 FAIL**） |
| OPEN SETTINGS / RETURN / RETRY-after-grant | **NOT TESTABLE**（前提不可制造） |
| CHECKPOINT REGISTERED | **NO** |
| CLOSED | **NO**（waived，不是 closed） |
| RELEASE BLOCKING | **NO** |

### 20.3 为什么永久拒绝不可复现

三种**独立**拒绝来源**同时**为真时：

1. 系统权限 `getAppAuthorizeSetting().locationAuthorized = 'denied'`
2. 小程序 scope `getSetting().authSetting['scope.userLocation'] = false`
3. 手机「定位服务」总开关 **OFF**

`wx.chooseLocation` **依然正常打开**原生腾讯地图（有取消按钮 / 搜索栏 / 定位针，只有附近列表转圈）。
⇒ 没有非取消失败 ⇒ `permissionRecovery.denied()` **不被调用** ⇒ **「去设置」正确地不出现**。
这是**实现按契约工作**的证据。**不要**因为「没看到去设置」而判 FAIL —— 触发前提在本机不成立。

⇒ 这**第三次否证**「加系统位置权限前置拦截」的提案：它会阻断这条**实际仍可用**的路径。

### 20.4 照片路径（最小）

不制造永久 media denial。本机 `getAppAuthorizeSetting().albumAuthorized === undefined`，
且 `getSetting().authSetting` 里**没有任何相册 scope** ⇒ **不存在**可制造可复现永久拒绝的开关。
⇒ 记 **`PHOTO PERMANENT DENIAL = NOT REPRODUCIBLE ON THIS DEVICE`**。
（照片 chooser 的正常取消已在 2026-10-01 真机会话记录在案，见 §19。）

### 20.5 裁决

**PERMISSION RECOVERY — RELEASE WAIVER ACCEPTED**
**PERMANENT DENIAL — NOT REPRODUCIBLE ON TEST DEVICE**
**RELEASE BLOCKING — NO**

⚠️ **不声称 `REAL-DEVICE PERMISSION RECOVERY = PASS`**：`denial → 去设置 → 授权 → 返回 → 重试` 这条链路
**从未被实际走到**。也**不声称 CLOSED**。
`permissionRecovery` 实现**原样保留**，作为在真能发生永久拒绝的设备/平台状态上的防御性处理。

**未来回归条件（唯一重开理由）**：真实设备产生了**阻断 chooser 的永久拒绝**，**且**恢复链路失败。

### 20.6 证据

- `.workbuddy-ai/scratch/permission-confirmation-20261001/qa-A-{baseline,A3-after-cancel,A5-back-to-add,A5-picker-open,A6-scope-denial-attempt,A7-location-services-off}.json`
- `.workbuddy-ai/scratch/permission-confirmation-20261001/evidence/A5-native-map-os-location-denied-opened.jpg`
  —— **用户手机截图**（sha256 `d4f8b60b…`），逐字节原样保存。属**硬件**证据；
  `simulator_screenshot` 的输出**从不**作为硬件证据使用。

---

## 21. 检查点收口 — CHECKPOINT REGISTERED（2026-10-02）

**性质：只推进 Add 冻结页检查点。生产代码 / 测试逻辑零改动；未 commit / push / deploy。**

### 21.1 先证明差异归属（category C = 0）

`pages/add/index.{wxml,wxss}` 相对**上一次注册值**的差异必须**只有**权限恢复。做法是**最小差分证明**：
把恢复块（wxml 的注释 + `<view wx:if>` 块；wxss 的注释 + 2 条规则）**逐字移除**后重算哈希：

| 文件 | 移除恢复块后的哈希 | 旧注册值 | 结果 |
|---|---|---|---|
| `pages/add/index.wxml` | `10f6501a95c45730f021b5254e81d59eea01a983ed6ae456334b444dda349773` | `10f6501a…` | **精确相等** |
| `pages/add/index.wxss` | `df572eae17e78255c7a2a0fb9bdd60a4b0ad31eb1d50a331d1d1a7b5501974b7` | `df572eae…` | **精确相等** |

⇒ 差异**只有**权限恢复；**A（既有已批准的 Add UI）+ B（权限恢复），C = 0**。

### 21.2 链的真实结构（按 `tools/verify-cloud.cjs` 断言，不依赖旧记录）

链逻辑：`expected = approved[file].sha256`，随后 refinements → map-frame → add-page → ux → home → map → me → us → stage6
逐环 `baseSha256 === expected` 并令 `expected = sha256`，最后断言**实际文件哈希 === expected**。
对 Add 两个文件，含它们的链节只有 `ui-approved-updates`（仅 `sha256`）、`visual-refinements`（仅 wxss）、
`add-page-review`；**最后一个含它们的链节是 `add-page-review`**。

⇒ **最小正确改法 = 只改 `tools/add-page-review.json` 里两个 `sha256`**（不是 3 fixture / 6 字段）。
`baseSha256` 全部不动（仍等于上游 `816e836d…` / `cfa2af39…`），`review` 硬断言字段不动，`reason` 纯追加。

### 21.3 实际改动

| 文件 | 字段 | 旧 → 新 |
|---|---|---|
| `tools/add-page-review.json` | `pages/add/index.wxml.sha256` | `10f6501a…` → `a9e772e513cd4a0685d4bb0e620586ab871638566801abbfcfcb79054c42c1b7` |
| `tools/add-page-review.json` | `pages/add/index.wxss.sha256` | `df572eae…` → `a5bcba93dc808263ddee38c6dac3c45f52e8e949393d82ba1fd5afe8e688a43b` |

两处 `reason` 各**追加**一段 2026-10-02 的批准范围说明（`starts-with` 原字符串 = true，未改写任何历史文字）。
`baseSha256` / `review` / 顶层键集合 **逐字段核对未变**；`git diff --stat` = 4 insertions / 4 deletions。

### 21.4 生产完整性

编辑前后 `pages/add/index.wxml`（`a9e772e5…`）、`pages/add/index.wxss`（`a5bcba93…`）、
`pages/add/index.js`（`c98803b2…`）、`utils/permissionRecovery.js`（`32de950a…`）**逐字节一致**；
361 个生产/工具文件的内容哈希复核中，**唯一变化就是 `tools/add-page-review.json`**。

### 21.5 验证

| 命令 | 结果 |
|---|---|
| `verify:permission-recovery` | **EXIT 0** |
| `verify:visual-language` | **EXIT 0**（13） |
| `verify:ui` | **EXIT 0**（44/44） |
| `verify:secondary-ui` | **EXIT 0**（15/15） |
| `verify:icons` | **EXIT 0** |
| `verify:memory-return` | **EXIT 0**（13） |
| `verify:store-boundaries` | **EXIT 0**（11） |
| `verify:structure` | **EXIT 0**（6） |
| `verify:cloud` | **EXIT 0 · 272/272** |
| `npm run verify` | **EXIT 0 · 359/359 · FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 0 · 57 个顶层套件全部跑完 · 0 FAIL** |

### 21.6 最终状态

```
ADD CHECKPOINT            — REGISTERED
PERMISSION RECOVERY       — RELEASE WAIVER ACCEPTED
PERMANENT DENIAL          — NOT REPRODUCIBLE ON TEST DEVICE
RELEASE BLOCKING          — NO
SAVOR PRODUCT UI SYSTEM   — FROZEN
```

⚠️ WAIVER **仍是 WAIVER**，未变成 CLOSED / PASS：`denial → 去设置 → 授权 → 返回 → 重试`
这一环**从未被实际走到**。`REAL-DEVICE PERMISSION RECOVERY = PASS` **不作声称**。
备份：`.workbuddy-ai/scratch/ckpt-add-pr/ckpt-backup/add-page-review.json.before`（`615ecfcc…`）。
