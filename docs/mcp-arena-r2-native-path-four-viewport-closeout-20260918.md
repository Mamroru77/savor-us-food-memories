# R2：320 矩阵与原生路径补验

## 本轮结论

**此前列出的三项已经取得实际执行证据：320×568 完整采集、原生照片预览返回、真实地图拖动及缩放。设备和偏好也已恢复。**

这是对本轮列出项目的补验记录，不等于将所有 R2 条目无条件标为 FIXED。四档矩阵共 192 项的采集/字段校验已完成；视觉检查仍是抽查。真实手机沿用用户指定的“默认已验收”前提，不记作本助手亲测。

## 1. 前台阻塞如何解除

使用正常的目标窗口最小化/恢复，再申请前台；**没有取消 foreground 检查**。

设备菜单操作改为一次受控序列，避免多次工具往返之间前台被其他应用取得：

1. 确认当前前台是目标项目窗口。
2. 点击设备选择入口。
3. 确认菜单弹窗 owner 指向该项目窗口、PID 与开发者工具一致，再进入机型子菜单。
4. 仅在该自有菜单保持前台时发送菜单导航键。
5. 选择后通过真实 `wx.getWindowInfo()` 和 `wx.getDeviceInfo()` 验证机型与尺寸，而不是把点击返回值当成功。

菜单最上方的 iPhone 5 曾在项目窗口截图裁切范围之外，故使用菜单键选择；没有用桌面窗口 resize 或 wx mock 冒充设备。

## 2. 四档矩阵采集齐备

| 实际 DevTools 机型 | 实际窗口尺寸 | 已确认采集 |
|---|---:|---:|
| iPhone 5 | 320×568 | **48/48，本轮补齐** |
| iPhone X | 375×812 | 48/48，前轮完成 |
| iPhone 12/13 (Pro) | 390×844 | 48/48，前轮完成 |
| iPhone 12/13 Pro Max | 428×926 | 48/48，前轮完成 |

每档均为：中/英 × Pearl/Dusk × Quiet 开/关 × Home、Map、Add、Us、Me、Reports，共 **192 项**。

每项检查路由、真实窗口尺寸、locale/theme，以及适用页面的 Quiet。偏好通过集中式 store API 调整，并逐次比对 memories/outbox/draft 不变；不冒充 Settings 菜单的真人点击流程。

本轮对 320 档的六个页面首屏做了截图抽查，包含英文/Dusk Home、Us、Reports、Add 和中文/Pearl Map、Me。其余截图已采集，但没有把采集数量写成全部逐张目视验收数量，也没有宣称覆盖每页全部滚动区域或键盘状态。

截图分阶段取得，不能声称 192 项均来自严格锁定的同一个源码构建。远端界面日期在执行期间跨日，Together 等派生文案随日期改变，不是改写记录。

## 3. 原生预览返回：已实测

真实路径：

**Map 全览 → 展开 → 选中子项 → 打开 Memory → 点击照片 → 原生 1/1 全屏预览 → 点击返回 → 身份校验完成 → Memory → 点击关闭 → Map。**

证据与结果：

- 原生预览截图为全屏真实照片，带 `1/1`，不是调用 Page 方法伪造预览状态。
- 返回时的第一张截图处于正常身份验证过程。没有隐藏或绕过该过程；随后确认 `verified`、`locked=false`。
- 最终截图确认 Memory 恢复到照片阅读起点。
- 读回 `scrollTop=0`、`photoIndex=0`，同一 memoryId，选中记录与卡片一致。
- 关闭 Memory 后，Map 上选中图钉仍显示真实照片；选中图钉不是 fallback，renderer 存在，positionsReady=true。
- 另有非选中图钉仍是 fallback；没有把本次选中照片恢复扩大成“所有照片都不存在 fallback”。

## 4. 真实拖动与缩放：已取得地图变化读回

这里使用 Windows 原生鼠标输入驱动 DevTools 地图，不再依赖上一轮无效的 CLI touch 事件。

### 拖动

- 先做仅窗口激活、不发送手势的对照：原生 region 与 scale 不变。
- 随后发送真实按下、连续移动、抬起，原生 `getRegion()` 确认地图发生位移。
- 补测稳定缩放档：拖动前后原生 **scale 18 → 18**，地理边界改变，选中记录保持，positionsReady=true。

### 缩放

真实滚轮缩小、放大，原生读回：

**18 → 17.68 → 18**。

选中记录未改变；该往返中 markerGeneration 保持 15。属于真实 DevTools 滚轮缩放，**不是双指捏合，也不是手机手势证明**。

### 保留的异常观察

首次从全览比例执行拖动时，原生 scale 曾从 13.63 变为 13，绑定比例和原生比例不同步；随后稳定 18 档的纯平移与缩放往返通过。

没有删掉这条观察，也没有据此认定所有比例下都稳定。它仍需进一步区分 DevTools 比例同步行为与产品问题；本轮没有为了让测试通过而修改相机或 marker 机制。

真实多页图钉栈分页不在本次成功路径中，不以合成分页测试替代该原生证据。

## 5. 源码边界

本轮没有修改产品源码、业务测试断言、Tab 结构、身份边界或草稿存储。

结束时 Map JS 指纹为：

`1d8e1617fb01a22b96015b047eff244bc6835ac7cce0c8b021f1c99501a6457a`

相较前轮快照，当前工作树已有 `restoreMemoryParent()` 更新。本轮没有编写、覆盖或回滚它；此次预览返回结果针对现场实际版本。不能将这项源码更新归为本轮新增修复。

## 6. 最终恢复状态

已通过实际读回确认：

- **iPhone 12/13 (Pro)，390×844**，原机型已恢复。
- **system / Pearl / Quiet 关闭**，原偏好已恢复。
- Home 页面，身份未锁定。
- 12 条记录，outbox 为 0。
- 当前实例仍没有草稿 111；本轮未重建、覆盖或清空。
- 没有提交、部署、真实保存、点赞、分享、导入导出或照片上传/删除。

## 7. 证据索引

远端根目录：`reports/ux-remediation-20260917/`

- `r2-arena-four320-*`：本轮 48 项设置比较、导航、窗口状态、截图。
- `r2-arena-four-viewport-complete-manifest.json`：四档 192 项完整采集索引。
- `r2-retry4-device320-confirm.json`、`r2-retry4-restored-device.json`：机型切换与恢复读回。
- `r2-retry4-native-preview-open.jpg`：原生全屏照片。
- `r2-retry4-memory-after-native-return.jpg`：身份验证中的第一张返回截图。
- `r2-retry4-memory-return-settled.jpg`：验证完成后的 Memory。
- `r2-retry4-map-return-photos.jpg`：关闭 Memory 后的真实图钉照片。
- `r2-retry4-native-before.json` / `r2-retry4-native-control-after.json`：无手势激活对照。
- `r2-retry4-pure-pan-before.json` / `r2-retry4-pure-pan-after.json`：稳定比例下真实拖动。
- `r2-retry4-zoomout-after.json` / `r2-retry4-zoomin-after.json`：真实缩放。
- `r2-retry4-final-state.json`：最终恢复状态。
- `r2-retry4-verify-all.log` / `.exit`：本轮最终完整回归。

本地 320 六页抽查拼图：`mcp/final320-contact-sheet.jpg`。拼图仅并排整理完整截图，未遮盖或修改截图内的 UI。

## 8. 最终回归与报告状态

- 最新完整 `verify:all`：**退出 0**。
- `git diff --check`：**退出 0**。
- 小程序源码诊断：**0 error / 0 warning**。
- HEAD 仍为 `2b162558deca71e68021d89e2a4005b359bb540c`，受保护 `VID_1.mp4` 存在。

本记录取代上一份三档矩阵报告中“320 待采集”和“原机型未恢复”的状态；192 项逐张视觉签收、首次比例同步差异、真实多页栈等未覆盖部分仍不作全通过声明。
