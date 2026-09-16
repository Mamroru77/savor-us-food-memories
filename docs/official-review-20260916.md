# Savor｜官方文档审计与第一批修正

2026-09-16 · 阶段报告，非全项目验收结论

## 本批结论

先核对微信官方文档，再与项目配置、源码和现有测试逐项对应。本批只修复一个已证实的 WXSS 兼容性问题：**将禁用按钮样式的 `[disabled]` 属性选择器改为状态 class**。

- 涉及身份验证门页及 Account、Space、Workspace、Reports 的 41 个按钮声明、5 条样式规则。
- 原生 `disabled`、禁用条件、事件绑定、loading、hover、文案、配色和尺寸均保留；没有新增业务状态或 setData。
- 应用源码仅 7 个 WXML/WXSS 文件变化；所有应用 JS 保持原样。
- 新增 2 项回归检查，原检查不删减。先确认新检查在旧版本失败，再执行修正。
- **Tab 保持已回退版本，上一轮被否定的优化没有重新应用。真机抽动仍未解决。**

本报告区分“文档规定”“源码事实”“运行检查”“待测假设”。不能把静态检查通过写成手机体验通过。

## 一、官方文档 → 项目规则

以下为本轮已查阅的相关章节；较长组件文档只读取了本轮涉及的属性与说明，不声称所有章节已读完。

| 官方主题 | 对本项目的约束与处理 |
|---|---|
| [WXSS](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html) | 属性选择器 `[...]` 不生效；采用 class。保留现有尺寸单位，不为追逐新建议全局替换 rpx。 |
| [组件模板、样式与隔离](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html) | 共享样式不能假设穿透组件；继续检查 isolated / apply-shared / shared 的实际配置，不直接搬用 Web 全局样式方案。 |
| [组件生命周期](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/lifetimes.html) | created 不 setData；detached 清理资源；自定义 TabBar 不触发 pageLifetimes，不能把普通组件显隐方案直接套给 Tab。 |
| [注册页面](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/page.html)、[生命周期](https://developers.weixin.qq.com/miniprogram/dev/framework/app-service/page-life-cycle.html) | 区分创建、反复显示、隐藏与卸载；复杂页面不等于必须立刻更换构造器。生命周期图不能代替回调逻辑检查。 |
| [setData 性能](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html) | 同时检查视图树、更新字段、数据体积、频率和后台更新。调用次数少不等于真机更顺滑。 |
| [Skyline 介绍](https://developers.weixin.qq.com/miniprogram/dev/framework/runtime/skyline/introduction.html) | 应用级配置目前默认 WebView，私有配置也未启用 Skyline；不迁移引擎，不直接引入 worklet 方案。 |
| [分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html)、[使用分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages/basic.html) | 五个 Tab 必须在主包；普通分包的引用边界、首次下载等待需要纳入方案。不是“把页面移出去”就算优化完成。 |
| [代码包体积优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeA.html) | 先取得真实打包结果和依赖分析，再决定分包、资源处理；源码字节数不能当上传包大小。不会擅自将私有资源搬到公共 CDN。 |
| [switchTab](https://developers.weixin.qq.com/miniprogram/dev/api/route/wx.switchTab.html) | 路径必须是已注册 Tab、不能带查询参数；保持即时导航，不等待字体、图片、身份或动画。 |
| [动画](https://developers.weixin.qq.com/miniprogram/dev/framework/view/animation.html) | 简单动效优先使用支持的样式动画；结束事件绑定在实际动画节点，不能依赖冒泡；中断与卸载需清理。 |
| [button](https://developers.weixin.qq.com/miniprogram/dev/component/button.html) | 原生 disabled 控制禁用，loading 和 hover 是独立能力。样式 class 不替代原生禁用语义。 |
| [input](https://developers.weixin.qq.com/miniprogram/dev/component/input.html) | 键盘、焦点、上推页面及同层行为有平台差异；不能用桌面输入框表现代替手机验收。 |
| [scroll-view](https://developers.weixin.qq.com/miniprogram/dev/component/scroll-view.html) | 纵向滚动核对固定高度；增强滚动属性需要对应开关和版本。不要给所有区域机械添加滚动容器。 |
| [image](https://developers.weixin.qq.com/miniprogram/dev/component/image.html) | SVG 的格式限制、图片失败态、固定尺寸和渲染引擎差异必须检查；长列表照片可评估懒加载，Tab 动画帧不盲目懒加载。 |
| [map](https://developers.weixin.qq.com/miniprogram/dev/component/map.html)、[cover-view](https://developers.weixin.qq.com/miniprogram/dev/component/cover-view.html) | 同层支持不代表现有 callout/命中覆盖层可随意替换；保留已验证地图几何，本轮未改地图。 |
| [网络说明](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html)、[wx.request](https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html) | 请求 success 不等于 HTTP 或业务成功；后台中断、超时、并发、合法域名需按实际 API 检查，不能混同云函数调用。 |
| [本地存储](https://developers.weixin.qq.com/miniprogram/dev/framework/ability/storage.html) | 存储隔离不替代业务身份隔离；保留现有日记/草稿键及错误处理，不清空数据换取测试通过。 |
| [云初始化](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/init.html)、[callFunction](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/functions/Cloud.callFunction.html) | 初始化为同步、明确环境；客户端与服务端分别初始化；区分回调与 Promise，检查业务 result，不按普通 fetch 重写 SDK。 |
| [loadFontFace](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html) | Data URL、global、scopes 有版本与渲染范围要求。重复字体资源已确认，但必须先验证 WebView、原生与 Canvas 的实际使用，再删加载路径。 |
| [NodesRef.fields](https://developers.weixin.qq.com/miniprogram/dev/api/wxml/NodesRef.fields.html) | 用小程序支持的节点查询读取样式与 disabled，而非假设可以直接使用浏览器 DOM。 |

后续按实际调用继续补齐隐私授权、照片处理、云文件权限、Canvas 海报、组件事件及长文档剩余相关章节。没有把未读内容写为已完成。

## 二、工程基线

- 页面：10 个，其中 5 个 Tab；目前未配置分包，已启用 `lazyCodeLoading: requiredComponents`。
- 小程序目录：188 个文件，原始合计 **1,827,488 字节**。不含云函数与工具目录；不等同于压缩后的主包体积。
- 本批预览打包接口返回 `total: 1,713,534` 字节（约 1.63 MiB，包名为 TOTAL）。这是实际工具返回值，仍不是手机冷启动耗时或网络下载耗时。
- `app.wxss`：272,593 字节；`utils/fonts.js`：260,268 字节。
- 两文件各包含同一组 5 份字体载荷，逐份 SHA-256 一致；单组 Base64 合计 **258,792 字节**。源码注释明确说明双加载用于 WebView 与原生层，因此“重复”不自动等于“可删除”。
- `project.config.json` 配置基础库 3.8.5，私有配置为 3.17.3；这是配置差异，不是手机运行版本证据。本批不擅自改版本。
- 全量回归 `verify:all`：退出码 0，测试进程耗时 41,935 ms；二级页面检查 15/15。

## 三、问题与处理矩阵

| 优先级 | 页面 / 位置 | 事实或问题 | 建议与本批状态 |
|---|---|---|---|
| P0，未解决 | 全局五 Tab / 切换动效 | 用户明确反馈上一轮修改使手机抽动更严重；已回退。 | 保持回退基线；不复用该方案，不用模拟器 setData 计数覆盖真机反馈。根因尚未证实。 |
| P1，已修源码 | 身份门页 / 重试按钮 | `.gate-button[disabled]` 等 2 条规则不符合 WXSS 支持范围。 | 改为 `.gate-button.ui-disabled`；仍由 retryDisabled 控制原生禁用。 |
| P1，已修源码 | Account / 检查按钮 | 共享禁用样式依赖不支持的属性选择器。 | 同一 busy 条件绑定状态 class；导出、检查等业务不变。 |
| P1，已修源码 | Space / 13 个带禁用条件的按钮 | 忙碌与权限条件对应的禁用样式未使用受支持选择器。 | 原表达式原样用于 class；没有放宽权限或更改 handler。 |
| P1，已修源码 | Workspace / 24 个带禁用条件的按钮 | busy、pending、配置、资料读取等组合状态需与显示同步。 | 同表达式绑定 class；提醒关闭、私有云反馈、恢复及授权条件全部保留。 |
| P1，已修源码 | Reports / 导出和分享按钮 | 共享禁用样式兼容性问题。 | 保留 busy 与分享同意逻辑；不触发导出或分享进行测试。 |
| P1，待测决策 | 启动 / 字体资源 | 确认重复载荷，但现有双加载有明确兼容意图。 | 先量真实包体、加载范围与首屏字体稳定性，再决定是否收敛。未删除。 |
| P1，待依赖分析 | 次级页面 / 分包 | 10 页均在主包，按需注入已经开启。 | 评估低频页面及共享依赖、下载等待与弱网退路；五 Tab 不迁出。未改路径。 |
| P1，待场景测量 | Sheet / 列表与照片 | 模板 427 行、脚本 619 行；这些数字只能说明需要重点阅读。 | 检查大数据量、图片失败/重试、整列表更新及退出中断；不能仅因文件大就拆组件。 |
| 无需调整此机制 | Home / 隐藏更新与卸载 | 已有 visible/alive、取消订阅、后台身份失效脱敏，以及仅向最近 5 行传完整记录。 | 保留。不是“所有后台 setData 一概禁止”。不据此宣称 Home 所有状态已验收。 |
| 无需重复抽象 | Store / 云同步 | `syncCloud` 已有 syncFlight 合并并发与身份代际检查。 | App.onShow 与页面 onShow 都出现调用，不足以证明重复网络请求；不再添加请求框架。 |
| 无需重写此机制 | Toast / 离场与卸载 | motionPresence 支持重开取消旧定时器；Toast detached 清理动效与订阅。 | 保留，继续检查调用方和中断状态。 |
| P2，待逐项确认 | 全局 / 命名和遗留实现 | 存在可疑占位方法、历史注释及重复 require 等线索。 | 先验证引用和构建用途；不因命名奇怪或重复出现就删除。 |

## 四、跨页面 UI / 动效审计边界

本批没有重做设计，也没有新增渐变、阴影、玻璃材质。现有配色与几何保持；后续会单独比较设计令牌和控件层级，避免把视觉重构混进兼容性修复。

- **已检查源码**：身份门页、4 个次级页面的按钮与共享样式；Home 显隐同步；Store 云同步；Toast 和 motionPresence 的清理机制。
- **本批原生截图**：已查看 Account、Space、Workspace、Reports 的亮色首屏。Account 与 Reports 当前首屏布局无需调整；Space、Workspace 截图处于加载阶段，不能代表加载完成、错误、暗色或全页状态。原图为 231 × 497，不据此臆测像素级瑕疵。模拟器已重载并返回 Home。
- **仅完成盘点、仍需深入**：Add、Us、Me 的完整流程；Map 的全部交互状态；Sheet 全部分支；Memory Row、图标组件；云函数与照片/导入导出的完整失败路径。
- **尚未全覆盖**：所有页面 × 亮/暗 × 中/英文 × Quiet × 空/加载/错误/正常状态；键盘弹起、长文本、大量记录、弱网、两账户权限、真实手机连续切 Tab。
- 180/220/320 ms 用于不同交互，并非天然不一致。后续统一的是反馈层级、缓动、位移和中断规则，不是把所有动画改成相同时长。

## 五、验证与回退

1. 修改前逐文件 SHA 校验并保存原始字节备份。
2. 新增测试先在旧版本产生预期失败，再检查修正后的按钮所有非 class 属性及原有 class 均保留。
3. 全量回归通过；没有修改原 Tab 测试或应用 JS。
4. 微信开发者工具对 5 个 WXML、2 个 WXSS 文件编译通过。节点样式探测发生自动化响应超时，没有取得有效 computedStyle 结果，未计入视觉验收；失败记录保留。相关页面截图检查也不能替代手机验收。
5. 不清本地存储，不写测试日记，不发送反馈，不创建/撤销共享权限，不触发分享或恢复任务。

远端证据目录：`reports/official-review-20260916/`。

备份位于该目录的 `backup/`；`changes.json` 记录本批应用文件前后哈希。若需要撤回，仅恢复本批 7 个表现层文件、对应测试与审批记录，不使用 reset、旧 ZIP 或全目录覆盖。

## 六、下一批顺序

1. 在已取得的打包大小基线上，补齐字体加载范围、依赖分析和冷启动测量，以及实际页面/组件框架确认。
2. 继续检查异步回调、后台更新、列表/图片与资源释放，优先修可复现的功能和性能问题。
3. 建立跨页面状态截图矩阵，再处理控件、间距、字体层级和动效系统的一致性。
4. 最后清理已证实无用的代码与局部细节。

每一批继续遵循：问题证据 → 影响 → 最小修改 → 新增回归 → 原生检查 → 明确未验收项；真机反馈不被静态测试替代。

## 本批交付文件

- `Savor_第一批原生页面检查.svg`：4 张开发者工具真实截图拼版，不是设计稿。
- `Savor_第一批兼容性修正版预览二维码.jpg`：本批 7 个表现层文件修正后的预览；保留原 Tab 回退基线。
