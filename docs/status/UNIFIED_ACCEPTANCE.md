## 2026-09-16 以概念图为视觉母版：五轮连续 UI 迭代

## 2026-09-16 · Map 视频复查（最新）

- 已私下读取用户项目内 VID_1.mp4，未上传 GitHub。148 帧视频确认展开时根图标下偏后归位；片段不含收起。
- KEEP：单页箭头下移 8 原生 px，完整点击区域保留；原生气泡采用固定边界并投影原有逻辑帧。320ms、单帧确认、透明点击层、真实坐标及 Tab 不变，分页组间距不变。
- 新增 4 项检查，Map motion 23/23；最终 verify:all exit 0（43155ms）。原生缩放 18 的稳定真实双项组，前后各 12 次调用成功，涵盖展开／收起／中断反向，并恢复原选中及收起状态。
- 仍未收口：前后帧提交间隔中位数均约 46ms，不能宣称帧率提高；顶部空间不足时仍有搜索区遮挡。新 Map 尚不继承用户此前真机验收。
- 本批新增 Map WXML 和 mapStack 几何修改；Map WXSS／分组算法／图片资源没有变化。Map WXML 有独立精确哈希审查登记，历史 fixture 与旧回归断言保留。
- 详见 [Map 视频复查](../reviews/map-stack-video-20260916.md)。未提交、未推送。


## 2026-09-16 · Map 原生修正已保留（最新）

- 原生截图通道通过官方 CLI auto 入口恢复，登录／Skill／编译正常，未清缓存、改票据或切诊断模式。
- 保留两组修正：缩放不无故收起未变堆叠、堆叠转单点不复用透明锚点；身份恢复后补充照片画布初始化，单请求及过期回调保护。原生冷启动已恢复已有餐厅照片。
- `verify:map-motion` 19/19；最终 `verify:all` exit 0（43395ms）。本轮只改 Map JS 与相关测试／文档；Map WXML/WXSS、分组算法、320ms、坐标、Tab 和历史 fixture 不变。
- 用户此前确认的真机／窄屏／键盘／实际上传保存／双账号通过继续有效，来源为用户确认。当前新 Map 受控原生回放不是新的真机手感认证。
- 尚未收口：向上展开的堆叠顶部控件可能被搜索区域覆盖，下一组优先处理控件可达性／阅读区域；本批未改层叠外观，不宣称全部拖拽问题已解决。详见 [Map 本轮记录](../reviews/map-refinement-20260916.md)。


## 2026-09-16 · 用户验收确认与 Map 新反馈

- 用户明确确认：本轮 Map 修改之前的真机、窄屏、真实键盘、实际上传／保存、双账号均已验收通过。来源为用户确认，不改写为本代理自动化实测。此确认更新上一增量对上述项目的待验收状态。
- 新反馈：Map 拖拽／缩放表现、覆盖层可读性及多餐厅堆叠需优化；用户明确首要症状为缩放时大小／数量／重叠关系／显隐变化生硬。新 Map 改动不自动继承此前验收通过结论。
- 已定位：readMapScale 对超过 0.05 的缩放变化无条件关闭堆叠并重建。局部候选保留未变分组及当前展开状态；7 项合成契约通过，旧实现首项失败。候选尚未写入应用。
- 本次原生截图及一次正常刷新后的截图均为 waitForAutomatorReady timeout。未取得本轮前后截图，未将合成测试当成真机效果；Map JS／WXSS／WXML 尚未改动。


## 2026-09-16 · 视觉精修 R6–R7 最新增量

- 先完成新基线／P0-P1-P2-KEEP 分级，再仅修改 Add 末尾重复 Tab 预留；其他成熟版式、Tab 与 Map 实现保持。详见 [本轮审阅](../reviews/visual-refinement-20260916.md)。
- 原生 R7：69 次调用、25 张截图，失败 0；中文浅色／Dusk／English 及照片、长标签、Popover、保存中／失败的受控渲染前后比较后，保留该间距修正。保存按钮高度与共享 safe-area spacer 不变。
- 最终 `verify:all` exit 0（43847ms）。16 份历史 fixture 不变；独立视觉审阅记录登记精确 base/current SHA，继续逐文件断言，无跳过。
- 原始 pearl/system 偏好已恢复；本轮外部检查点的回忆／草稿指纹一致。渲染样本未写入业务记录或草稿。
- 未完成：真机、窄屏、真实键盘、实际上传／保存／草稿恢复、双账号及所有状态交叉组合。不得将本轮截图或 mock 测试升级为这些验收。English Reports 原生标题仍中文，列后续 P1；不在 Add 间距组混改。


用户明确：图一为核心视觉母版，实际运行图为基线；持续缩小视觉差距，不另起设计、不改中文/结构/业务。已先做 Gap Analysis，再完成材质/标题/二级页 → Home/Us 比例 → Add/Me → Sheet/Memory Row → Home 数字留白微调五轮；五轮 verify:all 均 exit 0，新增8项视觉源代码契约。修改8个既有WXSS并新增 visual-tokens.wxss；180个既有应用文件不变，所有应用JS/WXML、字体、Tab/Map自身文件不变。

每轮重拍五Tab，另拍四业务二级页与四Sheet前后；134次原生工具调用成功，不等于全业务或真机验收。保留餐具Add、已回退Morphicons实现与正常模式。全主题语言/键盘/真实相册/所有子状态仍开放，手机Tab抽动未解决。详细记录 docs/visual-language-20260916.md；证据/备份 reports/visual-language-20260916/；最新预览 round5/native/preview-final.jpg。不得把本轮当成视觉最终完成或再次启动已否决的Tab优化。

## 2026-09-16 未完成项复查：表单/头像守卫及原生读取完成态

Sheet 未保存字段被刷新覆盖、旧头像选择结果回填已修复；10 项受控新回归接入 verify:all，最终 exit 0 / 43075 ms。16 次原生工具调用成功：Space/Workspace 已捕获 busy=false 完成态；Map/Me identityReady=true 并显示实际页面。不是两账号/云写入/真机验收。Tab 抽动、真机冷启动弱网大列表、全主题语言、真实原生选择器等缺口仍开放；未重新应用被否决的 Tab 优化。证据 reports/sheet-recheck-20260916/，详见 docs/sheet-recheck-20260916.md，新预览 native/preview-final.jpg。

## 2026-09-16 第五至十阶段审计收尾（非全状态真机验收）

已自动执行六阶段本轮审计；落地 Workspace 旧读取轮次守卫、Sheet 三字段视图投影、FAQ 索引 0 修复。仅两个应用文件变化，其他 186 文件未改；14 项新增回归接入 verify:all，三轮完整校验 exit 0。阶段 6 保留双路径字体/分包/SDK，阶段 9 现有中断与 Quiet 机制测试通过，无臆测性改动。Tab 已否决方案未重用，Map 与正常模式保持。

原生快照不等于全业务通过：Map/Me 为账号校验态，Space/Workspace 为加载态；Sheet 实例探针不可用，补查等待探针超时后已返回 Home。真机 Tab 抽动、冷启动/弱网、全主题语言、两账号权限、原生选择器与未保存表单刷新竞争仍开放。详细矩阵见 docs/stages5-10-review-20260916.md；证据/分批备份 reports/stages5-10-20260916/；新预览 native/preview-final.jpg。未执行云写入、迁移恢复、权限修改、反馈发送或用户照片删除。

## 2026-09-16 连续审计第二至四批

用户授权依次自动执行常规批次，仅数据安全/权限/外传/不可逆操作询问。已完成首次生命周期重复刷新、过期报告绘制回调、Me 两个入口词表修正；三次 verify:all exit 0，新增生命周期/绘制 8 项与菜单 4 项检查。当前预览 reports/lifecycle-review-20260916/preview.jpg。原 Tab 回退版本保留，手机抽动未解决；不得重用被否定优化。详细覆盖、未验收状态、备份见 docs/lifecycle-review-20260916.md。全项目审计仍在进行，不能将本批通过当作全部状态/手机验收。

## 2026-09-16 官方文档审计第一批（非全项目验收）

仅修 41 个按钮声明 / 5 条禁用态 WXSS 规则的 class 兼容性；7 个表现层文件，应用 JS 全部未改。verify:all exit 0；15/15 次级 UI 检查；5 WXML + 2 WXSS 编译通过。4 个亮色首屏截图已检查（Space/Workspace 为加载态）；节点样式自动化超时，不计入验收。真实包体接口 total 1713534 bytes。Tab 保持已回退版本，手机抽动仍未解决；不得重用被否定的 Tab 优化。后续按 docs/official-review-20260916.md 继续文档/依赖/状态审计；不得宣称全面审计或真机通过。

# 2026-09-16 用户要求回退：最新 Tab 优化已撤销

用户真机反馈“更严重了，回退吧”。已逐字节恢复 reports/tab-smooth-20260916/backup 中的 custom-tab-bar/index.js、verify-tab-handoff.cjs 和 UI 校验清单。Tab JS 恢复至 73cd0a3c7057b657937a25e178ea92edf62c88c81a3be2c45293dcd931bc1779。此前地图修复、其他 UI 调整、正常模式及用户数据保留。上一轮 Tab 减负版本已被用户否决，不得再标记为接受或自动重新应用；暂停新的 Tab 优化。证据见 reports/tab-rollback-20260916/restore-result.json。新预览为 reports/tab-rollback-20260916/preview-rollback.jpg，旧 Tab 优化码不应继续使用。

# 2026-09-16 Tab 真机轻微抽动：首轮减负已实施，真机未验收

保留现有 Morphicons 移植图形/引擎、480ms、SVG renderer、立即 wx.switchTab 和样式。只去重相同外观更新及复用同视觉子命令；显式页面重入仍强制唤醒。实际模拟器十次相同外观提交 setData 10→0，新增7项检查及 verify:all 最终通过（43234ms）。稳定等待后的 Map/Add/Home 选中状态正确、fallback 0；初次850ms固定等待循环读取旧路由，不计全五Tab验收。新版码 reports/tab-smooth-20260916/preview-tab.jpg。真机抽动仍待单独验收，不能标记彻底解决；详见 docs/tab-smooth-20260916.md。

# 2026-09-16 地图卡顿减负与搜索材质已实施

用户最新反馈：堆叠开合和地图拖动仍卡顿，要求 Morphicons 来源及搜索栏同底卡材质。已改为当前堆叠几何增量帧、setData 回调节流、开合不重建 markers、拖动期间延后非必要绘制且不保留私人快照；保留真实 320ms 位移和所有坐标/主布局。9/9 新增检查、最终 verify:all exit 0（43031ms）；原生实际开合 markers 重写 0。图标沿用官网支持的官方 Lucide 并通过来源校验。新版二维码 reports/map-motion-20260916/preview-map.jpg。真机卡顿不能标记彻底解决，待真实手势验证；详见 docs/map-motion-20260916.md。

# 2026-09-16 UI 顺序优化已落地（正常模式）

P0/P1 已实施，P2 仅修正实拍支持的禁用文字对比度；无依据的成熟页面细节不改。13/13 新增检查、完整 verify:all 最终 exit 0（41447ms）、原生 WXML/WXSS 成功。浅色首屏实拍已保存，新 UI 二维码为 reports/ui-polish-20260916/preview-ui.jpg。用户确认的是优化前正常版真机通过；本轮不冒充真机/深色/全状态验收。一次 automation_evaluate 超时，其他原生工具与新版预览成功。详见 docs/ui-polish-20260916.md。

# 2026-09-16 预览二维码恢复（最新）

预览已实际生成成功，正常模式；完整代码包 1693990 字节。二维码：reports/preview-fix-20260916/preview-normal.jpg。手机扫码和实际保存仍需用户本人确认。

日志确认最近一次打包/上传已完成（7774ms），随后本地 appservice 500 / initWithProxyFunc 超时，另有 WXML 热更新找不到模块。已备份 project.private.config.json，将覆盖配置中的 compileHotReLoad 从 true 改为 false，再通过官方工具正常关闭/打开目标项目；随后 create_preview_qrcode 返回 success=true 和 JPEG 二维码数据。未清缓存、未删除记录或草稿、未修改云权限。组合恢复有效，不声称独立证明只有热更新一个根因。

此前“预览超时/尚不可用”状态已被本结果取代。

---

# 2026-09-16 地图 / 保存修复（最新状态）

当前目标工程已切换为 normal；此前默认冻结的历史报告不再代表当前配置。原冻结代码已备份。账号身份边界、私有权限、原有记录与草稿保护保留；提醒关闭，反馈仅私有云工单。

## 修复
- Map 加入正在进行的身份验证后再同步，不再把身份未就绪/冻结当作网络错误，隐藏页面迟到错误不再弹 Toast。
- Add 保存失败保留草稿，只显示行内错误；评分标签区分当前评分与清除操作。
- Toast 设置有界宽度，减少不必要换行；未重做 Map/Tab 布局。

## 验证
- 新增 10/10 定向回归通过，verify:all exit 0，44358ms。
- 原生 WXML 与 WXSS 编译均成功。
- 实际运行模式 normal，身份 verified；实际云同步成功，11 条云记录，outbox=0。
- Map identityReady=true、demoMode=false；Add identityReady=true、businessFrozen=false、saveLock=false，无当前错误。
- 旧 savor-diary-v1 / savor-draft-v1 前后相同。没有提交用户草稿，没有新增合成业务记录，本轮没有重新部署云函数。
- 手机实际保存和重新进入后的确认仍待用户本人完成，不能用模拟器或隔离测试代替。

## 开发者工具连接
原生验证阻塞已解决：普通 Node 的授权启动目标不正确；改用官方 Electron 可执行文件，并使用项目列表返回的准确路径（盘符大写 E）。SDK 状态 tokenRequired=false，不需要用户再找授权弹窗。

预览二维码：仍在生成或尚不可用。

证据与备份：reports/map-save-fix-20260916/。

---

> **最新状态：提醒按用户选择关闭；反馈仅存私有云端工单策略已部署。新增14项策略回归、最终全量回归、真实生产配置检查及206次隔离云调用通过，500条模拟恢复完成。测试入口已关闭，原25集合记录数/大小未变。默认仍冻结，真机与双账号验收未完成。详见 docs/mcp-cloud-only-isolated-20260915.md；历史待配置/未执行条目以最新报告为准。**

> **2026-09-15 统一修复最新状态：保存冻结提示已修复，云端基础链路已实测。**
> spaces/media/workspace 已部署并下载比对，10个新集合已安全补建；11集合客户端读/更新均拒绝。真实身份接入与11项云端基础用例通过，全量离线回归通过。默认仍 diagnostic；没有恢复同步/投递/删除/推送。提醒与反馈外部配置、隔离写入/批量恢复及集中真机验收尚未完成。最新报告：docs/mcp-unified-repair-20260915.md。以下为保留的历史阶段记录。

# Savor：功能开发后的统一审查 / 部署 / 真机验收

2026-09-14 · S1–S4 合并候选。**本文件是待执行清单，不是授权，不代表已经通过。**

四类剩余业务代码已在同一批补齐。后续集中修复审查/平台/设备发现的问题，不再要求先分四轮外测才能继续开发。

## 0. 不可破坏的基线

- 工作树源于 `fix-9.13 @ 4daeb2e`，保留 S1/S2/S3/S4 未提交更改。先备份本地完整工程与 dirty diff，再 fetch/review/adapt；禁止 reset --hard、目录覆盖、重导旧 ZIP。
- 五 Tab、正式 UI / Nocturne / 个性化、立即 wx.switchTab、地图真实位置/标记/320ms 及最新开关保持。K1 和失败 E1/G1/G2/G3/H1/I1/J1 不复活。
- Tab 微抽动与商家万能导入继续暂缓。
- 不清旧键、不删用户数据/私人照片、不重置产品 ID、不付费升级。腾讯现有后端保持。
- **提交、推送、云部署、集合权限变更、定时器启用、实际消息投递和任何媒体 purge 均先取得相应授权。**

## 1. 本地 Codex / 自动化统一审查（先做，不依赖用户重复日志）

1. 阅读 PROJECT_PROGRESS.md、S4_IMPLEMENTATION.md 及 S1/S2/S3 的安全契约。
2. 在保留原工作树的基础上适配候选；比较 bundle manifest / diff，不把 ZIP 解压覆盖现有工程。
3. `npm run verify:all`；独立检查身份租约、分区、缺失文档处理、事务与 unknown-outcome 重试，不以测试数量替代代码审查。
4. 用既有微信工具自动完成 JSON/WXML/JS 编译、模拟器页面进入、主包大小与组件依赖检查；本轮静态主包估算约 1.70 MB，最终以微信构建为准。
5. 新页面焦点/键盘/滚动/安全区域、头像选择压缩、报告 Canvas 与 HTML 文件分享，以及选择器引起 onHide/onShow 的生命周期竞争。
6. 本机测试账号 A → B → A，冷启动离线锁定、原键隔离、未知请求不自动发送、旧网络回调不能覆盖新账号/新世代。
7. 输出一份统一失败清单与修复验证，复用现有自动采集，不索取普通日志重复上传。

## 2. 获授权后统一部署 / 集合与规则

### 云函数

- account、受保护 mealRecords、spaces、media、workspace 协同部署；不可退回绕过 S1 身份握手的旧服务。
- workspace 依赖 `wx-server-sdk ~2.4.0`，独立目录包含 schema.js/image.js 精确副本，不引用兄弟函数运行目录。
- 核验 Node / SDK 对 runTransaction、doc.get/set、Date 值、OpenAPI 的实际支持；缺失文档只能在真实已识别的不存在错误下当 null。禁止事务不可用时退回分离写。
- workspace 建议函数超时至少 60 秒；工作器约 40 秒后停止领取新项、传输每项 10 秒。核验平台执行/请求/响应/事务量限制与定时任务重入。

### 集合（不得由候选代码在启动时偷偷创建）

| 集合 | 用途 | 客户端直接读写 |
|---|---|---|
| savor_accounts | 稳定产品身份、空间、任务限额 | 均禁止 |
| savor_invites / savor_spaces / savor_wishes / savor_shared_meals | S2 协作 | 均禁止 |
| savor_media_assets | 注册共享媒体 | 均禁止 |
| savor_archive_tasks / savor_archive_chunks | 私有云备份与恢复进度 | 均禁止 |
| savor_profiles | 私有资料、最小伙伴投影授权 | 均禁止 |
| savor_workspace_receipts | 显式同步/授权回执 | 均禁止 |
| savor_delivery_jobs | 收件人、反馈联系信息、发送状态 | 均禁止 |
| dining_records | 既有私人日记 | 保持既有 owner-only，不能为了新功能放开 |

后端使用真实 APPID/OPENID → account 映射；所有普通请求 protocolVersion=1 + expectedUserId。不要把 event 中身份当可信身份。

### 索引与容量

- savor_archive_tasks：ownerUserId + _id 升序（分页）。
- savor_delivery_jobs：ownerUserId + _id 升序（本人历史分页）；state + nextAttemptAt 升序（工作器到期查询）。
- 按实际控制台查询计划验证组合索引，不盲目创建不需要/收费的资源。
- 最多 500 条/任务、5 条/块、48 KiB 原始块，所有块封存后明确 commit；每一步事务内原子推进。
- 任务、原稿、回执不自动物理删除。先测真实存储/调用量和免费额度，监控增长；保留策略另行批准。

## 3. 获授权后配置与验证真实消息

### 环境变量

| 变量 | 要求 |
|---|---|
| REMINDER_TEMPLATE_ID | 小程序实际获批的订阅模板 ID；不能填示例值后宣称可用 |
| REMINDER_THING_KEY | 此模板实际 thing 字段，如 thing1 |
| REMINDER_TIME_KEY | 此模板实际 time 字段，如 time2 |
| REMINDER_MINIPROGRAM_STATE | 默认 formal；开发/体验验证时按批准的实际环境设置 |
| FEEDBACK_WEBHOOK_URL | 运营方接收入口，HTTPS、无 URL 用户密码，不接受用户传入 URL |
| FEEDBACK_WEBHOOK_TOKEN | 服务端 bearer 密钥；不写进小程序、源码、ZIP或日志 |
| FEEDBACK_IDEMPOTENT | 默认 false；验证渠道持久化去重后才可设精确 true |
| WORKSPACE_ADMIN_OPENIDS | 获批实际管理员 OPENID 逗号列表 |
| WORKSPACE_WORKER_SECRET | 随机高熵、至少32字符，仅函数环境和受控定时器配置；不输出日志 |

API 权限配置：按控制台实际要求为 workspace 授权 `subscribeMessage.send`。不要把 mock 上的成功当作权限已生效。

### 工作器触发

- 实际管理员可用真实身份调用 `{action:"worker"}` 做获批测试。
- 无 OPENID 的后台调用需要 `{action:"worker",workerSecret:<实际密钥>}`。
- 腾讯云 SCF 定时触发器支持把自定义字符串放入 event.Message；可用 CustomArgument 保存上述 worker JSON，建议每分钟触发，先关闭创建、批准后开启。文档依据：[1](https://cloud.tencent.com/document/product/583/9708)、[3](https://cloud.tencent.com/document/product/583/18589)。
- 微信云开发控制台若不暴露 CustomArgument，先验证其可用配置通道；不要臆造参数或改成只信任 Type=Timer。也可由已受控后台使用服务端密钥调度。
- 当前代码只解析 Message 以决定路由；实际权限仍取云 SDK 上下文 + 密钥。无日志打印 event/密钥。
- 工作器并非秒级闹钟保证：高峰队列、平台重试与调用配额会延迟。验证每分钟最大实际吞吐及积压告警；不要启用未批准的付费扩容。

### 反馈接收契约

POST 到配置的 HTTPS URL：

```json
{"ticketId":"稳定工单ID","userId":"产品用户ID","message":"正文","contact":"可选联系信息","createdAt":0}
```

Headers：`Authorization: Bearer ...`，`Idempotency-Key: <ticketId>`。

只有 HTTP 2xx 且 JSON `{"accepted":true,"id":"非空运营回执ID"}` 才标 sent。200 空响应、跳转、错误、超时不算成功。接收方须限制访问、避免把联系信息/正文发往公开频道；若开幂等标志，要在持久化层按 ticketId 去重后再通知人员。

### 必测真实链路

1. 微信 accept / reject / ban / 取消 / 模板变更，各自结果和原生订阅配额；普通设置开关不得生成授权。
2. 真正 A 订阅后仅 A 收到消息，选择日期/时区/跳转页正确；B/伪造toOpenid不可改收件人。
3. 真实微信回执、工单运营回执与后台状态对应。**sent 不代表已读或人工处理。**
4. 未配置、明确拒绝、超时、发送后函数终止、并发工作器、取消与发送竞争；不发生不明情况下自动重复提醒。
5. uncertain 工单与提醒用运营证据核对；实际管理员 `resolveJob` 需 jobId、state(sent/failed)、evidence、consent=true，审计必须存在。未核对不得强行改 sent。
6. 反馈接口认证失败、重定向、假200、没有 ack ID、收到但回应丢失、幂等去重和 token轮换；检查无敏感内容日志泄漏。
7. 定时器没有运行时，任务应仍显示 queued / blocked_config，不能出现虚假的投递成功 toast。

## 4. 数据与权限 / 两账号集中验收

- S1：稳定用户映射、离线未知锁、旧数据隔离、显式本机备份/复制、私人 CRUD 与 outbox 跨账号保护。
- S2：邀请同意/撤回/并发接受、伙伴退出与写入竞争、文字快照与独立评分、Wishlist 转草稿，50条索引等边界。
- S3：服务器登记文件、文件ID不能认领、上传各步丢响应/取消、读取前后授权、退出后直接访问存储拒绝、15秒临时文件清理、元数据剥离与原图保留。
- 共享存储不得公开；核验服务器上传对象的真实ACL/创建者元数据与客户端不能绕过授权读取。
- S4 备份：0/1/5/6/500 条、非法日期/位置/超限、任务跨设备查询、块变化重试、断线/杀进程、取消部分导入、原稿损坏/丢失、已删目标不复活。
- S4 档案：双设备 revision 冲突、before-image 写失败不采用、非法头像/真实压缩、伙伴最小字段/撤回/换成员/档案重传不续授。
- S4 报告：空日记、跨年/闰日、重复/待删除/未来日期、匿名默认、明细明确选择、海报/HTML无笔记照片泄漏、分享副本不可撤回提示。
- S4 生命周期：选择文件/头像/订阅弹窗导致同账号重新验证的恢复、期间换号拒绝；旧 cloud 回应不能清理新分区待确认请求。

## 5. 媒体清理仍默认关闭（独立审批）

MEDIA_PURGE_ENABLED 不启用；先按 S3_MEDIA_DEPLOYMENT_PENDING.md 做只读候选扫描。
启用需单独批准管理员、保留期与删除开关。此批没有删除任何真实私人文件或云对象。

## 6. 回退与发布

- 先停工作器/新入口、保留持久状态和全部用户数据。不要把 sending/uncertain 批量改 queued。
- 回退也保留可信身份与权限；不能让旧服务绕过 expectedUserId、重放旧队列或将旧共享授权迁给新伙伴。
- 候选测试通过 ≠ 平台/真机通过。统一失败项修复、再次回归、回退演练后，再申请提交/推送/正式发布授权。
