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
