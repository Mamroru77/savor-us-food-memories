# SAVOR R2｜剩余补验与收尾

日期：2026-09-19 · 依据：`SAVOR-HANDOFF-20260917-R2.md`

## 1. 结论与完成边界

本轮完成了此前尚欠的 **Map / Us 修复后四档矩阵、真实两页图钉栈、包内图＋私有云图的双图原生预览与返回、小数缩放补验、375 英文 Quiet 照片回查，以及最终回归和现场恢复**。

**不将 R2 整体标为全部 FIXED。** R2 未展开的 F2/F3/F4/F6 仍无法逐条验收；草稿 111 的历史去向仍未证实。本轮没有编造要求或重建草稿来消除这两个缺口。

手机验收按用户“默认真实手机已验收”的前提记录，**不是本代理执行真机测试的声明**。

## 2. 本轮工作与既有修复的归属

开始时先运行完整基线，退出 **0**，并核对任务书 SHA-256：

`42f91804ba785b97bf65f61a10ff5a6ceba728f48cb255bc3f6a7288be9ff1cd`

读取远端最新三份 20260919 文档后，确认下列修复已在工作树中：

- Map 精确观测比例与固定相机初始值分离，异步读比例防竞争。
- 原生预览前解析包内资源和私有云资源。
- Us Journey 改为正常文档流，避免统计与底部说明重叠。
- Map 根据搜索栏实际下边界测量控件安全间距。

本轮**没有重写这些产品代码，也不把它们算作本轮新增修复**。新增的是受守卫的验收脚本、截图、几何读回、索引与报告。此前 D2/D4/E/F1/F5/F7 的源码修复记录继续保留，不用本轮截图替代其原有证据。

## 3. 修复后四档矩阵：64 张＋滚动补验 8 张

实际从 DevTools 原生机型菜单切换设备，每一组合均读回 `wx.getWindowInfo()`，不是改变桌面窗口尺寸冒充设备。

| 实际视口 | 偏好组合 | Map 搜索栏至定位控件间距 | Us 统计至底部说明间距 | 采集 |
|---|---:|---:|---:|---:|
| 320×568 | 8 | 8 px | 6 px | 16＋8 滚动 |
| 375×812 | 8 | 8 px | 8 px | 16 |
| 390×844 | 8 | 8 px | 8 px | 16 |
| 428×926 | 8 | 8 px | 9 px | 16 |

8 组合为 zh-CN / en × Pearl / Dusk × Quiet 开 / 关。通过现有 settings API 受控切换；**不是设置菜单点击覆盖声明**。每次偏好修改比较 memories、outbox、loadDraft 的序列化值，均未改变业务数据。

- 64 张新截图均确认正确设备、locale、主题、Quiet、身份可用且没有 Memory Sheet 遮挡。
- 逐一查看了 8 张联系表中的全部 64 张截图。
- 320 英文首屏 Journey 底部在 Tab 下方，**没有把离屏几何读回当成可见验收**。补做真实指针上滑及 8 偏好的滚动截图，另查看一张联系表；Journey 底部完整可见且统计与说明分离。
- 总计 **72 张新矩阵截图已采集并视觉复核**。该结论针对本次受影响的 Map/Us 布局，不表示所有页面、任意内容长度和全部交互均通过。
- 历史 192 张与此前 8 张替换图的审核归属保持原报告；不重复计为本轮新审核。

## 4. Map 原生拖动、缩放与真实分页

重新截图核对项目窗口及模拟器坐标后，发现早期输入坐标落在卡片区域，导致命令虽已派发，地图区域却没有改变。这些记录保留为**未通过动作**。

改用实际地图空白区后，原生读回证明：

1. 拖动改变 `getRegion()`，原生比例保持 **13.63**。
2. 滚轮实际比例 **13.63 → 13.94**。
3. 再拖动改变区域，原生与观测比例均为 **13.94**，没有被回写成整数 13。
4. 缩小并取得结束态后，实际比例 **8.93**、positionsReady=true，现有 5 条记录组成 **2 页**图钉栈。
5. 收起底部卡片，真实平移使向上栈进入可用区域；展开按钮绝对 top **227.68 px**，分页区 top **267.68 px**。
6. 真实 Windows 指针点击分页，截图显示 **1/2 → 2/2**；第二页是现有记录 `797e…`，并通过实际图钉点击进入其 Memory。

保留限制：个别派发后只观察到 begin 状态，positionsReady=false，直到后续真实手势结束才恢复。这些中间态**不算稳定结束验收，也没有归咎为已定位的产品缺陷**。本报告仅签收有区域变化及稳定读回的上述成功回放，不宣称每次输入注入均成功。

旧采样文件里的 `boundScale` 实际读取的是观测 `mapScale`。本轮已修正后续采样器为 `observedScale` 与 `cameraScaleSeed`，历史原始记录不改写。

## 5. 双图原生预览与 Memory 返回

使用现有记录，不新增照片或测试记录：

- 第一张为包内资源，Memory 中可见餐盘照片。
- 实际点击照片后，原生查看器显示 **1/2**，图片已加载，不再是原先长期旋转的加载状态。
- 实际横向拖动后，显示 **2/2**，私有云图已加载。
- 实际关闭查看器。第一张返回截图处于正常身份复核过程，**未当成返回通过证据**。
- 稳定后身份可用，恢复同一 Memory、同一选中记录，readingPosition 为该 Memory / scrollTop 0 / photoIndex 0；截图也显示原来的 Memory 内容。
- 随后实际关闭 Memory，确认 sheetShow=false。

判定：**FIXED（现有包内＋私有云双图这条 DevTools 原生路径）**。这补足此前只有单图 1/1 成功的证据，不外推为所有源类型、故障网络或身份切换场景均做过原生验收。

## 6. 375 / English / Pearl / Quiet 照片回查

重新进入该实际配置，选中仍是原食堂记录 `e2e…`：

- selectedNoPhoto=false。
- renderer 缓存已就绪，选中图片不是 fallback。
- 已查看真实地图截图，选中图钉有餐食照片。
- 稳定读回 positionsReady=true、gesture=false；原生与观测比例均 **13.54**，相机初始 seed 为 13。

判定：**NOT REPRODUCED（该配置下稳定后的选中照片缺失）**，不是把旧异常帧解释为从未发生。两个明确 noPhoto 的其他真实记录仍可使用正常占位图；不能将其占位当成选中照片恢复失败。

## 7. 最终自动化回归、源码与保护文件

- 开工完整 `verify:all`：退出 **0**。
- 收尾完整 `verify:all`：退出 **0**，命令 `cmd_bdd38103637a5e28ee41b5f3416b4c752edaa11530d72ac7`，约 50.7 秒。
- `git diff --check`：退出 **0**。
- miniprogram 诊断：**0 error / 0 warning**。
- HEAD：`2b162558deca71e68021d89e2a4005b359bb540c`。
- 受保护的未跟踪 `VID_1.mp4`：**PRESENT**。

本轮未 commit、push、部署、发布、改 ACL/OPENID、清库、写真实记录、点赞、发邀请、导入导出、上传或删除照片。没有修改被永久禁止的 Tab / switchTab / Morphicons 方案，没有修改历史断言或把报告作为 CI 依赖。

## 8. 最终恢复现场与尚未消除的缺口

实际读回及 Home 截图确认：

- **390×844，Home**，身份可用，sheetShow=false。
- **system / Pearl / Quiet 关闭**。
- memories **12**，outbox **0**。
- 当前加载草稿仍未发现 **111**。沿用先前只读分区调查，不能确定历史消失时间或来源；本轮未清空、覆盖、重建或采用候选。

| 项目 | 当前口径 |
|---|---|
| Map 搜索控件 / Us Journey 受影响布局 | FIXED，限本报告 72 张与几何验收范围 |
| 包内＋私有云双图原生预览和同 Memory 返回 | FIXED，限已执行路径 |
| 小数比例与真实分页 | KEEP，成功回放已验证；未结束输入不计通过 |
| 375 英文 Quiet 稳定选中照片异常 | NOT REPRODUCED |
| F2/F3/F4/F6 | BLOCKED：当前 R2 仅列编号，未展开逐项要求，不凭猜测补齐 |
| 草稿 111 历史去向与保留证明 | BLOCKED：只读调查不能证实；不得伪造恢复 |
| 真机证明 | 用户验收前提；不是本代理新增真机证据 |
| R2 无保留整体签收 | PARTIAL，不能用测试全绿覆盖上述缺口 |

## 9. 证据索引

远端统一前缀：`reports/ux-remediation-20260917/r2-arena-r3-`。

- `layout{320,375,390,428}-*`：设置、导航、几何、截图，每设备 16 张。
- `scroll320-*`：320 下 8 个偏好的滚动可见补验。
- `corrected-pan-after`、`corrected-wheel-after`、`second-fraction-pan-after`：真实小数比例回放。
- `low-slowpan-after`、`page1`、`page2`、`next-page.log`：5 条真实记录与两页切换。
- `preview-package.jpg`、`preview-cloud.jpg`、`preview-return-settled.jpg` 及对应状态：双图与返回。
- `fallback375-settled.json`、`fallback375-native-after.json`、`fallback375-settled-map.jpg`：指定配置回查。
- `final-verify-all.log/.exit`、`final-diff-check.log/.exit`、`final-hashes.txt`、`final-head.txt`、`final-vid.txt`。
- `final-state.json`、`final-home390.jpg`：最终现场。

本地：`deliverables/R2-补验索引-20260919.json`；联系表位于 `mcp/r3-visual-review/sheet-*.jpg`。72 张原图保留；联系表只缩放并排整理，不遮盖或修饰 UI。

设备切换后的首次自动化超时、早期无位移拖动、普通滚轮未滚动 Us、瞬时身份验证截图均保留，不作为通过项。Us 可见滚动使用后来验证确实移动内容的实际上滑。

## 10. 精确复核指纹

```text
720002f595b6f475a892205211da10346aa1f3ab5d1bcc1e70eace4ae7001a82  miniprogram/pages/map/index.js
87b4d41878ec06c959fbecbac3e332dda8c34d6d9103909e0da568ed3da2bf4a  miniprogram/pages/map/index.wxml
3abe216ebf9f2a3e867d475ae51ea40812a98d5168eb08b201e83bd991e45adc  miniprogram/pages/us/index.wxml
a021a8dba2129f3ea269521c4b84b38e341eecb1275de0f62d020aa92a73882e  miniprogram/pages/us/index.wxss
df0e495155c533d51f6f75793363867d136899105db296c274c5980d80541c3d  miniprogram/utils/memoryPreview.js
09720a528157a5fb1eda7962e33874d2aceccf8392fc2ce6bc46e317ed9d4667  miniprogram/utils/nativePreviewSources.js
88436d42438f8e74b617d683f8105b6f3b5f44db35d9126620eb56f5203d32c3  tools/verify-map-scale-race.cjs
4811fc0cf8753c31ef955505ffb5966d0ba20d3ede2b6dbb317a55dc9660b002  tools/verify-map-scale-echo.cjs
b1a7dc2406cf3973e33eb0791fe802d0b308abb04071e251f4e053cc78319f62  tools/verify-memory-preview-sources.cjs
2755591173c02cb5f3e3279a7bf0d01f54089e9a9f52da7b16c087bbb6c40b85  tools/verify-us-journey-clearance.cjs
e054f2617328f6e7b3b4ff2fef359d1c61c0136dd206b5d907ecb0250c890f10  tools/verify-map-control-clearance.cjs
```

以上与本轮开始读取的相关现有修复一致。交付的是已执行范围的证据收尾及明确阻塞，不是以新报告覆盖历史限制。
