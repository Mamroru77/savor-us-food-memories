# R2 续推：缩放回写与四尺寸静态复核（2026-09-19）

工作记录，**不是 R2 总验收报告**。真机验收沿用用户“默认真实手机已验收”的前提；以下原生动作证据来自 DevTools，不冒充真机。

## 1. 两个独立缺陷

### FIXED：拖动期间迟到的原生缩放回调

- 新增 `tools/verify-map-scale-race.cjs`，先红 3 PASS / 4 FAIL，再绿 7 PASS / 0 FAIL。
- 手势开始使旧 scaleRequest 失效；readMapScale 的入口和回调拒绝拖动中或 disposed 状态。
- 保留手势结束的精确小数值同步、相同分组时仅更新 mapScale、抽屉状态及既有相机确认时序。
- 此修正后第一次原生重放仍出现 13.63 → 13，故没有把两个问题混为一谈。

### FIXED（本次 DevTools 受控重放范围）：观测缩放值回写成相机输入

- 旧模板把观察用 `mapScale` 绑定到原生相机 `scale`。
- 原生滚轮得到 13.32，观察字段仍为 13。诊断性调用生产 `readMapScale` 传入刚读到的实际值后，观察字段变为 13.32，原生相机却变为 13；期间没有第二次手势。
- 该诊断调用不计真人路径通过。原始证据：`r2-scale-echo-fractional-{before,diagnostic,after}.json`。
- 新增 `tools/verify-map-scale-echo.cjs`，读取实际 WXML 绑定及执行生产方法：先红 2 PASS / 2 FAIL，再绿 4 PASS / 0 FAIL。测试不伪造原生取整模型。
- 最小修正：新增固定的 `initialMapScale:13` 用于初始相机绑定，精确 `mapScale` 继续用于分组观察。既有 includePoints / focus 命令、真实坐标、分组算法、320ms 动效、Tab、身份、存储均未改；没有增加计时器、查询循环或相机命令。

## 2. 原生重放，不丢弃失败记录

第一次修后重放把窗口最小化/恢复夹在基线采样与拖动之间，得到 13.63 → 13.05，gesture=true、positionsReady=false。该结果保留于 `r2-scale-echo-fixed-pan-*`，**不计通过，也不宣称已解释该窗口恢复异常**。

第二次把窗口恢复放在基线之前，等待窗口布局；之后手势脚本不再次最小化，但仍执行相同的项目所有权、前台、坐标及逐步前台守卫。没有绕过权限或强夺焦点。

| 实际动作 | 原生 scale | 观察字段 | 判定 |
|---|---|---|---|
| 全览后纯平移 | 13.63 → 13.63 | 17.93 → 13.63 | 区域发生改变，positionsReady=true，generation=6 未重建 |
| 原生滚轮放大 | 13.63 → 13.94 | 暂留 13.63 | 实际缩放，不是手机双指手势 |
| 再次纯平移 | 13.94 → 13.94 | 13.63 → 13.94 | 区域发生改变，positionsReady=true，generation=6 未重建 |

证据：`r2-scale-echo-replay2-{before,after,wheel-after,second-pan-after}.json` 及对应 guarded 脚本日志。

注意：上述旧采样脚本 JSON 的 `boundScale` 字段实际读取 `p.data.mapScale`。修后它已不再绑定相机，因此应读作“观察字段”，不是实际绑定值。原始证据未改写；本地后续采样器已改名为 observedScale，并单列 cameraScaleSeed。

## 3. 实际查看了全部旧 192 帧，纠正采集覆盖口径

通过 24 张带标签、无裁剪遮挡的 contact sheet，逐格查看了原 192 张截图，而非仅下载或生成联系表。每帧缩放至最多 300px 宽，仅支持首屏布局/明显遮挡复核，不代替原尺寸细字对比、滚动到底或动态验收。

- 320/375/390/428，各 48 帧；Home/Add/Us/Me/Reports 的首屏主体结构、主题与语言对应可见。用户餐厅名、笔记没有自动翻译。
- 320 的下面字段、更多 Recent/Shared Moments 和 Reports 内容在首屏之外，不能据此声称完整滚动或交互通过。
- 部分带圆角模拟器截图在圆角外侧存在边缘残影，原图保留，未裁剪掩盖，也未直接归因为产品缺陷。
- **发现旧 390 的 8 张 Map 帧均被 Memory Sheet 覆盖**。它们是真实截图，但不能充当无遮挡 Map 主界面验收。旧脚本的 selectComponent("s-sheet") 条件关闭没有保证关闭成功。
- 没有改产品来迁就采集：新建 Map-only 补采脚本，明确断言 sheetShow=false、identityReady=true、locked=false、gesture=false、实际 390×844，再采 8 个配置。8 帧已实际查看。
- 原始 192 帧及旧清单不删除、不覆盖。新有效清单使用 184 个旧帧 + 8 个补帧，旧 8 个 Memory Sheet 截图保留为补充证据。累计实际查看 200 个独立截图。

### 仍为 PARTIAL 的照片范围

- 旧 375 / English / Pearl / Quiet 有一帧可见 fallback 图钉，其他配置帧有真实照片；不把该帧记为图钉照片通过。
- 新 390 的 8 帧为真实平移后视图，卡片照片可见，但可见图钉仍有 fallback；不声称所有图钉恢复，也不凭图判断该图钉与卡片必为同一记录。
- 本次没有修图、添加遮罩、伪造照片或为了截图更换业务数据。照片逐图钉来源与原生多页 stack 连续覆盖仍需继续。

## 4. 测试、审阅与保全

- 延迟回调修正后的完整 verify:all：exit 0。
- 缩放绑定修正后的第一次 verify:all：exit 1，原因为严格 WXML 哈希审阅仍指旧值。原始失败日志保留。
- 更新 `tools/ux-remediation-review.json` 的当前精确哈希与理由，保留 baseSha256 和历史 fixture，不删除或放松断言。
- 最新 `r2-scale-echo-verify-all-reviewed.exit`：0；race/motion/viewport 与新 echo 专项均通过。两个新专项已加入 verify:r2 → verify:all。
- `git diff --check`：0；get_diagnostics：0。
- HEAD 仍为 `2b162558deca71e68021d89e2a4005b359bb540c`，`VID_1.mp4` 仍 PRESENT；没有 commit/push/部署。
- 最终实际状态：Home，390×844，system / Pearl / reduceMotion=false，identityReady=true、locked=false，12 memories、outbox=0。
- 偏好补采每步检查 memories/outbox/draft 未变；最终草稿对象仍存在，但不含 111，延续旧未解状态，未伪造恢复。

### 当前 SHA-256

- Map JS：`44637641496235e6e10074cb8d704b8922ea207645b34cec56ad81d8f1eac8c3`
- Map WXML：`87b4d41878ec06c959fbecbac3e332dda8c34d6d9103909e0da568ed3da2bf4a`
- scale-race 专项：`88436d42438f8e74b617d683f8105b6f3b5f44db35d9126620eb56f5203d32c3`
- scale-echo 专项：`4811fc0cf8753c31ef955505ffb5966d0ba20d3ede2b6dbb317a55dc9660b002`

本轮未改变 Tab 方案，也未扩写未定义的 F 条款。静态查看完成不等于全部 R2、动态全链或所有照片验收完成。
