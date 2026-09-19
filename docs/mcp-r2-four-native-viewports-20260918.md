# R2 四档矩阵与连续路径复核

**本轮结果：MCP 已重连，四档真实 DevTools 设备矩阵完成采集，192 张截图；D5 原生连续路径仍为 PARTIAL。机型、偏好及 Home 已恢复。**

## 一、任务依据与恢复

按用户最新指示，以 **SAVOR-HANDOFF-20260917-R2.md** 为当前任务书，不再将寻找旧任务书作为执行前提。已重新读取可访问的 Downloads 副本，与当前上传版本内容相同。该版本仍未细化 F2–F4/F6 的验收标准：不自行编造条目，也不将其记成已通过。

用户指定“真实手机默认已验收”的前提继续有效，来源注明为用户指定，不冒充助手亲测。

重连时旧 MCP session 返回 404；重新 initialize 得到新 session 后恢复。首先恢复并核对：system / Pearl / Quiet 关闭，390×844、iPhone 12/13 (Pro)，memories/outbox/draft 比较未变。

## 二、四档真实设备矩阵：已执行

通过微信开发者工具实际机型菜单选择设备，并使用正常编译入口加载页面。每张截图前读取真实 windowWidth/windowHeight，断言尺寸与目标一致，没有 mock wx 系统信息或用桌面窗口大小冒充设备尺寸。

| 原生模拟机型 | 实际视口 | 配置组合 | 页面数 | 成功截图 |
|---|---:|---:|---:|---:|
| iPhone 5 | 320×568 | 8 | 6 | 48 |
| iPhone 6/7/8 | 375×667 | 8 | 6 | 48 |
| iPhone 12/13 (Pro) | 390×844 | 8 | 6 | 48 |
| iPhone 12/13 Pro Max | 428×926 | 8 | 6 | 48 |
| **合计** | **四种实际视口** | | | **192** |

配置为中文/英文 × Pearl/Dusk × Quiet 开/关；页面为 Home、Map、Add、Us、Me、Reports。

每轮偏好更改使用既有集中式 store.updateSettings，只改展示偏好，并检查 memories/outbox/draft 不变。每个尺寸结束都恢复原偏好并返回 Home；失败或尚未初始化的尝试没有计入成功数量。

### 操作方式与安全边界

全局鼠标输入仍保留 foreground/遮挡检查，检查失败即停止。为机型菜单另采用了**仅发送到已验证窗口句柄的 Windows 原生消息**：核对项目窗口、接收进程、弹窗 owner 链、坐标边界；弹窗缺失或坐标被其他应用遮挡则拒绝。该方式不向全局鼠标注入事件、不操作其他应用、不关闭产品身份保护。

机型菜单点击是否成功，以实际设备信息和尺寸读回判定，不以消息发送成功作验收。

### 目视复核范围

下载并以六张对照图检查了 **48 张代表性首屏**：四尺寸 × 六页面 × 中文/Pearl/动效开、英文/Dusk/Quiet 两个组合。其余 144 张已采集并检查页面、语言、主题、Quiet 和尺寸状态，但未逐张细读全部文字。

抽查所见：Home 统计与 Recent、五 Tab、Add 餐具入口、Us 独立说明与 1 day、Me Stats、Reports 英文标题/海报保持；窄屏内容采用既有滚动布局，没有发现这些抽查首屏的严重横向溢出。未把首屏截图延伸解释为所有滚动区、弹层及交互已通过。

六张对照图保存在本地 `mcp/native-review/*-contact.jpg`。完整矩阵明细另附 JSON 和 CSV。

## 三、D5 连续路径：有新增实证，仍未闭环

本轮实际执行了 Map 全览、打开 Memory，并尝试原生拖动、滚轮缩放及原图点击。

### 已观测到的原生相机变化

- 拖动前 northeast：latitude 31.489514254064808、longitude 121.16856844452548。
- 拖动后 northeast：latitude 31.489703897551433、longitude 121.16801245879026。
- 原生 getScale 从 **13.63 → 13.94**，发生于 Windows 滚轮事件之后。

因此这次不再是“touch API success 但相机完全没动”。不过使用的是定向原生窗口消息，滚轮也不是手机双指 pinch。

### 为什么仍不标为 FIXED

后续稳定读回发现：页面 **stackGesture=true、stackPositionsReady=false**，绑定 scale 仍为 18，未取得正常 regionchange 收尾与原生相机一致的证据。可能涉及当前事件注入方式或 DevTools 生命周期，尚不能据此单独认定手机产品缺陷，更不能判为连续路径通过。

原图点击后的截图仍停留在 Memory，未证实打开了原生预览；另一次全局鼠标尝试因目标窗口不是前台而被安全检查拒绝。没有调用页面恢复方法、伪造 end 事件或修改 data 来制造成功。

最终通过正常 switchTab 返回 Home；Map 既有 onHide 会清除手势标记并释放 renderer。本轮未修改任何生产手势逻辑。

## 四、源码与保护

重连时发现 Map 已存在一项此前记录之外的 D3 修订：全览保留 marker group 内选中的子项。本轮保留该现有代码，未将它据为本轮新修复，也未覆盖它。Map 源码在本轮长时间矩阵前后比较一致。

本轮新增内容为验证脚本、截图、测试元数据与报告；**没有产品源码改动、Tab 改动、提交、部署或真实业务写入**。

最后只读状态：
- iPhone 12/13 (Pro)，**390×844**；
- **system / Pearl / Quiet 关闭**；
- **Home**；12 条记录，outbox 0；
- 当前草稿仍无餐厅内容，未补造、覆盖或清空 111；
- `VID_1.mp4` 仍存在。

## 五、验收分类

| 项目 | 判定 |
|---|---|
| 四档原生视口的执行能力 | **FIXED**：已通过实际菜单切换与尺寸读回证实 |
| 四尺寸 × 八配置 × 六页面采集 | **KEEP / 已执行**：192 张；不得混同 192 次完整真人交互验收 |
| 代表性首屏目视检查 | **PARTIAL**：48 张抽查，覆盖所有尺寸和页面 |
| D5 原生连续路径 | **PARTIAL**：相机确实移动/缩放，手势收尾与原图返回未闭环 |
| 真实手机 | **用户指定已验收**，不是本助手新增亲测证据 |
| F2–F4/F6 | 当前 R2 未细化指标；不再追索旧文件作前置，也不虚构通过 |

## 六、关键证据

远端目录：`reports/ux-remediation-20260917/`
- `r2-native-four-size-manifest.json`：192 项配置、真实尺寸及截图路径。
- `r2-native-{320,375,390,428}-*.jpg`：本轮全量截图。
- `r2-native-*-restore.json`：各尺寸偏好恢复与数据保持检查。
- `r2-four-size-final-integrity.json`：最终机型/偏好/Home 状态。
- `r2-nativeflow-before-drag.json`、`r2-nativeflow-after-drag.json`、`r2-nativeflow-drag-settled.json`。
- `r2-nativeflow-after-wheel.json`、`r2-nativeflow-gesture-readonly.json`。
- `r2-nativeflow-original-preview.jpg`：仍停留在 Memory，不是预览成功证据。
- `r2-four-size-final-all.log` / `.exit`：最终完整代码回归。

本报告是四档矩阵及连续路径的真实结果记录，**不是 R2 所有条目全部 FIXED 的声明**。

## 最终代码回归结果

`npm run verify:all` 本轮最终完整执行，**退出 0**。小程序源码诊断 **0 error / 0 warning**；diff 检查无问题。没有用矩阵截图替代代码回归，也没有用代码回归替代 D5 未完成的连续原生验收。
