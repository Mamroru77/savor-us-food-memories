# Savor｜第五至十阶段审计记录

2026-09-16 · 正常模式 · 官方文档优先 · 小批次、可回退

> **第 5–10 阶段的本轮审计执行已完成，落地 3 处修复；不等于全状态或真机验收通过。**
> 本轮仅修改 Workspace、Sheet 两个应用文件，新增 14 项回归检查并接入全套校验。其余 186 个应用文件未改。已否决的 Tab 优化没有重新应用。

## 1. 六阶段结论

| 阶段 | 检查重点 | 本轮结论 |
|---|---|---|
| 5 · 异步与生命周期 | Workspace、Account、Space、Add、Reports、Sheet；旧回调、busy、订阅、原生选择器 | **已修复** Workspace 同账号离开再进入后的旧读取、分页及收尾回调竞争。没有机械地把同一套判断套进原生选择器或云端写入。 |
| 6 · 资源与启动 | 字体、图片、依赖、路由、分包、性能 API | **保留现状，待真实收益证据**。不删双路径字体，不臆测分包收益，不升级 SDK。取得 DevTools 性能 API 样本，但没有真机冷启动对照。 |
| 7 · 列表、图片与弱网 | Home / Us / Me / Sheet / Memory Row / Map；更新范围与图片异步 | **已修复** Sheet 向视图传输整份 Store 的冗余。保留已有图片重试、身份租约、序号与缓存机制；弱网验收仍开放。 |
| 8 · 跨页 UI 与交互 | 五个 Tab、四个次级页、Sheet、表单、展开状态 | **已修复** 第一条 FAQ 在刷新时错误收起。补做原生页面快照。没有凭低分辨率截图制造像素级缺陷或新增装饰。 |
| 9 · 动效与打断 | Sheet / Toast、退出、快速重开、Quiet、卸载清理 | **所测机制无需调整**。4 项确定性计时器测试通过；不统一本来有不同职责的时长。Tab 手机抽动仍未解决。 |
| 10 · 工程收尾 | 可逆备份、范围校验、回归接入、原生检查、文档 | **已完成本轮工程收尾**。保留逐批备份、红绿测试、完整校验及问题矩阵；不做猜测性“死代码”删除。 |

“无需调整”只指该机制目前没有足够修改理由，不代表对应页面所有状态均已验收。

## 2. 已落地修复

### P1｜云端工具：上一轮读取覆盖新一轮页面

**位置：** `miniprogram/pages/workspace/index.js` 的 `clearPrivate / run / refresh / nextTasks / nextJobs`。

同一账号离开页面再进入，原身份租约仍可能有效。只检查账号有效性和当前是否可见，无法区分这次显示与上次显示：旧读取可能写回列表，旧失败可能改写提示，旧 `finally` 可能提前解除新请求的 busy。

**最小改动：** 清理私有显示状态时推进页面轮次；`run` 捕获轮次并提供 `isActive()`；三个只读加载回调和统一收尾检查当前轮次。原身份租约判断仍保留。云端写入回调与原生选择器的恢复语义没有重写。

生产源代码 VM 复现先失败、修复后通过，覆盖旧成功、旧失败、旧任务分页和身份刷新场景。它不代表所有写操作与原生窗口竞争已验证。

### P1｜Sheet：把整份 Store 传入视图

**位置：** `miniprogram/components/sheet/index.js` 的 `refresh / refreshHelp`。

模板只有 4 处 `state.` 绑定，使用 3 个叶子值：

- `profile.avatar`
- `settings.loveSent`
- `settings.notificationsRead`

原实现却传入完整状态，帮助页还重复赋值。修复后只传这三个显示字段；各业务和列表构建函数仍使用原 Store，不更改持久化结构、草稿、照片或身份数据。

**可复查的合成测试：** 500 条记录，每条含 2,000 字符备注。

| 指标 | 修复前 | 修复后 |
|---|---:|---:|
| 仅 `state` 子树的 JSON 字节数 | 1,016,192 | 96 |
| 与无关日记条数是否一起增长 | 是 | 否 |
| 三个模板绑定值 | 保留 | 保留 |

这不是整次 `setData` 的总大小，也不是用户真实资料、手机 FPS、耗时或内存提升数据。库列表自身需要的行数据不在本次缩减结论内。

### P1｜帮助页：第一条 FAQ 被误认为未展开

**位置：** `refreshHelp`。

`faqExpanded || -1` 把合法索引 `0` 当成空值。改为显式整数判断。测试覆盖首项、其他项、收起和未初始化状态；没有改布局或动画。

## 3. 工程证据

| 批次 | 新增针对性检查 | `verify:all` 保存耗时 | 结果 |
|---|---:|---:|---|
| 阶段 5 | 4 | 41,822 ms | exit 0 |
| 阶段 7 | 4 | 42,067 ms | exit 0 |
| 阶段 8 + 最终集成 | FAQ 2 + 动效 4；合计 14 项新增检查 | 42,479 ms | exit 0 |

- 新工具：`tools/verify-audit-stages.cjs`，通过 `verify:audit-stages` 接入 `verify:all`。
- 每处修复均保存修改前文件、针对性红/绿结果与 SHA。
- 原生 Workspace、Sheet WXML 编译成功。
- 对 188 个应用文件做范围核对；本轮应用改动仅 **2 个**，其余 **186 个**未改。
- Tab JS、Map JS/WXSS 的保护 SHA 均核对一致；已有 Tab/Map 回归仍通过。
- 测试使用本地虚构状态与受控 Promise / 计时器；没有向真实日记写入 500 条测试记录。

证据根目录：`reports/stages5-10-20260916/`。逐批备份位于 `phase5/backup`、`phase7/backup`、`phase8/backup`。不要盲目整目录覆盖回退；后续如需回退，应核对当前 SHA，并按批次逆序恢复对应文件及校验清单。

## 4. 页面 → 位置 → 结论 → 建议 → 优先级

| 页面 / 组件 | 位置与检查点 | 本轮结论 | 下一步或保留理由 | 优先级 |
|---|---|---|---|---|
| Home | 首屏、近期行、后台订阅 | 已有五条近期行和差量更新机制；本轮无需调整 | 保留隐藏页身份失效清理；真实大列表/弱网未覆盖 | 保留 / 待验收 |
| Map | 首屏、搜索与底卡、图片返回、拖拽 | Map 文件未改，既有回归通过 | 原生首轮曾落在账号校验态；实际拖拽帧率仍须真机证据 | P1 待验收 |
| Add | 草稿、导入、照片、输入与保存 | 首屏检查；保留现有串行、身份与草稿机制 | 未操作真实选择器、提交、导入或键盘长文场景 | P1 待验收 |
| Us | 统计、双人入口、共享时光 | 当前首屏无足够理由改布局 | 不能把本机入口显示当作两账号权限验收 | 保留 / 待验收 |
| Me | 菜单、次级入口 | 前批双语修复保留；本轮未改 | 原生首轮账号校验态与实际菜单应区分记录 | 保留 / 待验收 |
| Account | 私有备份、迁移与确认 | 仅页面显示检查；身份守卫保留 | 没有执行迁移、复制、导出或恢复 | P1 待验收 |
| Space | 加载、邀请与接受 | 本轮原生快照为 busy 加载态 | 未建立、接受或撤销真实邀请；不算云端成功态 | P1 待验收 |
| Workspace | 读取/分页/错误/busy | 旧轮次竞争已修；原生样本仍为加载态 | VM 通过不等于后台服务完整成功链路通过 | P1 已修 / 待验收 |
| Reports | 年份、摘要、Canvas | 原生 unlocked、非 busy、Canvas 已建立 | 前批绘制序号修复保留；跨年份全组合未验收 | 保留 / 待验收 |
| Sheet · 共享外壳 | `state` 传输、绑定 | 三字段投影已修 | 不删除 Store 里的任何字段或记录 | P1 已修 |
| Sheet · Help | FAQ 展开状态 | 索引 0 修复、源代码回归通过 | 组件实例选择探针未取到实例，原生点击回归不能算通过 | P1 已修 / 原生待验 |
| Sheet · Profile / Together | 未保存的表单与后台刷新 | 源码存在刷新重置字段的风险候选，本轮未修改 | 应另建输入保留/关闭重开复现，不能直接标“无需调整” | P1 待复现 |
| Sheet · Avatar / Import | 原生回调、关闭/换类型/卸载 | 保留身份恢复；界面轮次仍是独立检查缺口 | 先区分本来应恢复的原生操作与过期显示回调 | P1 待复现 |
| Memory Row / 图片服务 | 去重、序号、卸载、重试、临时 URL | 所读机制暂不调整 | 真实图片过期、失败重试、弱网与长列表仍未验收 | 保留 / 待验收 |
| Toast / Sheet 动效 | 退出、重开、Quiet、卸载 | 4 项确定性测试通过，无需重写 | 计时器正确性不等于手机合成帧流畅 | 保留 / 待验收 |
| 自定义 Tab | Morphicons、立即切换、既有回退 | 字节保护通过，未重新应用被否决方案 | 手机抽动仍开放；不以模拟器或调用量证明解决 | P1 未解决 |
| morph-lab | 第 10 条注册路由 | 仅配置与源码盘点，不计业务首屏验收 | 不恢复诊断模式、不调整端口或图标实现 | 保留 |

## 5. 资源与性能结论

- 盘点 188 个应用文件；阶段 6 时原始文件总计 **1,830,034 字节**，不是编译包体。
- 10 条注册路由，5 个 Tab，无分包，使用 `requiredComponents` 按需注入。
- 两条字体加载路径各含 5 段字体载荷，各为 **258,792 个 Base64 字符**。存在内容重复，不足以证明任一作用域路径可直接删除。
- 字体官方文档区分 WebView / native / Skyline 作用域与基础库版本；未做字体实际命中、旧设备降级或删除前后启动对照，所以保留。
- 本次预览接口 `TOTAL` 为 **1,714,098 字节**；前批为 1,713,880，增加 218 字节。**没有宣称包体缩减。**
- DevTools 确认 `wx.getPerformance`、`getEntries`、`createObserver` 可用；一次样本有 `evaluateScript: 173 ms`、`firstRender: 495 ms`。这是单次 DevTools 页面样本，没有冷启动前后对照，不是手机启动成绩。
- 本地依赖声明不能证明云端已部署 SDK 版本；本轮没有安装/升级/部署云函数。

## 6. 原生检查与未覆盖边界

原生主轮完成 50 次工具调用，工具层均返回成功；**这不是 50 个业务用例全部通过**。其中帮助页首次操作因路由未就绪而跳过，Sheet 实例选择探针没有取到组件，均保留原始结果、不计成功验收。随后对路由/账号就绪与帮助页作了补查，结果见附录。

已取得五个 Tab、Account / Space / Workspace / Reports，以及 Together / Notifications / Profile 面板的原生快照。照片、名称、输入显示仅用于用户自己的项目检查，没有点击保存、发送爱意或全部标已读。

本轮未覆盖：

- 真实手机冷启动、连续导航帧率和 Tab 抽动根因。
- 全套中文/英文 × Pearl/Dusk × Quiet 状态组合。
- 真机键盘、长文本、原生照片选择的取消/失败/返回竞争。
- 大数据真机列表、限速/断网、图片过期、缓存重试链路。
- 两账号共享权限、邀请、恢复/迁移、云端写入与删除流程。
- Workspace / Space 的加载完成、失败、重试与全部业务成功态。

没有清空数据、恢复旧 ZIP、启用照片删除、重置 key、改 ACL、发送反馈、外传反馈或开启提醒；没有 GitHub 推送、云部署或 SDK 升级。普通页面显示可能触发现有的身份验证/同步读取，不把它描述成完全离线测试。

## 7. 本轮官方依据

1. [Page 生命周期](https://developers.weixin.qq.com/miniprogram/dev/reference/api/Page.html)：进入/离开语义与异步回调不是同一套取消机制。
2. [setData 性能](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/runtime_setData.html)：只传渲染所需数据，避免整状态传输与无效后台更新。
3. [组件生命周期](https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/lifetimes.html)：订阅、资源及 detached 清理边界。
4. [启动优化](https://developers.weixin.qq.com/miniprogram/dev/framework/performance/tips/start_optimizeA.html) / [分包](https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html)：先验证资源和依赖，Tab 主包边界不能靠通用 Web 经验推断。
5. [字体加载](https://developers.weixin.qq.com/miniprogram/dev/api/ui/font/wx.loadFontFace.html)：格式、版本和渲染作用域约束。
6. [图片组件](https://developers.weixin.qq.com/miniprogram/dev/component/image.html) / [压缩图片](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.compressImage.html)：失败/懒加载和格式限制；iOS 压缩不能假定所有图片格式都成功。
7. [动画](https://developers.weixin.qq.com/miniprogram/dev/framework/view/animation.html)：保留已有适当实现，不为使用新 API 而重写。
8. [性能 API](https://developers.weixin.qq.com/miniprogram/dev/api/base/performance/wx.getPerformance.html)：按版本与环境解释采样，DevTools 样本不等于真机启动。

前四批记录继续保留，当前文档只补充第 5–10 阶段，不覆盖掉此前已明确的未验收项。

### 原生补查附录

补查的有界账号/路由等待探针返回 `timeout waiting for automator response`，因此没有继续其后的截图或帮助页验证；已成功返回 Home。此次补查不能计入通过，也没有拿前面的工具成功状态抵消它。

最终交付 SVG 如实保留首轮状态：**Map / Me 为账号校验态，Space / Workspace 为加载态**。Together、Notifications、Profile 仅为显示快照；FAQ 保留源代码回归通过、原生点击未验收的边界。

附属文件：`Savor_第五至十阶段原生检查.svg`、`Savor_第五至十阶段预览二维码.jpg`。二维码为当前代码新生成的预览，不是旧 Tab 优化版本；不等于发布或真机验收。
