# Savor 身份门禁阻塞诊断

诊断时间：2026-09-14（Asia/Shanghai）  
范围：本地工程、当前微信开发者工具运行时、目标 CloudBase 环境的只读检查。  
结论状态：**部署/版本/集合常见问题已排除；实际失败阶段仍待证实。已确认的直接缺陷是客户端抹平了阶段和白名单错误码。**

## 1. 结论摘要

- 当前微信开发者工具连接的是 `E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-s1-s4-candidate-20260914\savor-candidate`，不是提示词示例路径；近期日志也存在一个较早打开过的 Downloads 副本，但当前运行时和 19:20 后的编译记录指向 E 盘工程。
- 实际 AppID 为 `wx65867b5568b82996`，`miniprogramRoot` 为 `miniprogram/`，`cloudfunctionRoot` 为 `cloudfunctions/`；客户端唯一实际 `wx.cloud.init` 固定使用 `cloud1-d9gqm52id66c0bcda`。
- 该 AppID 可访问目标环境；云端精确存在 `account`、`mealRecords`，二者均为 `Active`。云端下载源码与本地候选的关键文件逐字节一致，因此“函数没部署”及“生产 mealRecords 仍是无 `identityHandshake` 的旧版本”均已排除。
- `savor_accounts` 集合已确认存在。当前只读接口没有返回安全规则，故“客户端读写均禁止”的规则配置仍待证实；未读取账号文档或身份值。
- 当前模拟器停在 `pages/home/index` 的身份门禁。现有 console/network 缓冲区没有匹配到 account、handshake 或白名单错误码。
- 不能据此把根因写成“网络问题”。当前代码会把 account 业务拒绝、mealRecords 握手拒绝和本机分区错误最终显示为同一句提示，并在自动验证路径静默吞错；因此现有证据无法区分真正卡在 account、handshake 还是 partition。
- **当前不应重新部署、重建集合、改权限或清缓存。** 下一步最小动作是先做两文件的脱敏诊断补丁，并在明确授权后只执行一次 account + handshake 验证；诊断按钮不得调用 `store.syncCloud()`。

## 2. 工程与版本状态

| 项目 | 结果 | 状态 |
|---|---|---|
| 当前工程路径 | `E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-s1-s4-candidate-20260914\savor-candidate` | 已确认 |
| 当前运行页 | `pages/home/index`，开发者工具模拟器 iPhone 12/13 Pro，基础库 3.17.3 | 已确认 |
| AppID | `wx65867b5568b82996`（`project.config.json:5`） | 已确认 |
| 小程序根目录 | `miniprogram/`（`project.config.json:3`） | 已确认 |
| 云函数根目录 | `cloudfunctions/`（`project.config.json:48`） | 已确认 |
| CloudBase 环境 | `cloud1-d9gqm52id66c0bcda`（`miniprogram/utils/cloudRecords.js:5,11`） | 已确认 |
| Git 分支 / HEAD / dirty | 当前目录及其父交付目录均无 `.git`；Git 命令返回“not a git repository” | **无法确认** |

说明：工程文档提到过 `fix-9.13` 和若干历史提交，但这些只是交付说明，不能替代当前目录的 Git 元数据。本报告不把它们当作当前分支/HEAD 证据。

本机私有项目配置只检查了项目名、有效基础库版本和设置键名，没有输出敏感配置全文。

## 3. 实际身份链路

当前源码的门禁顺序如下：

1. `miniprogram/utils/identity.js:21-22` 初始化云环境并调用：
   `account({action:'bootstrap', protocolVersion:1})`。
2. `identity.js:25` 要求 `success:true`、`protocolVersion:1` 和 `u_` + 48 位小写十六进制 userId。
3. `identity.js:26` 调用：
   `mealRecords({action:'identityHandshake', identityProtocol:1, expectedUserId:<account userId>})`。
4. `identity.js:28` 要求握手协议为 1 且两端 userId 相同。
5. `identity.js:29-30` 才接受本机私人分区并解锁会话。
6. `identity-gate/index.js:13` 的人工 retry 在 `verify()` 成功后还会立即调用 `store.syncCloud()`；`store.js:433-439` 会先执行 outbox，再读取云端列表。

服务端实现也符合候选协议：

- `cloudfunctions/account/index.js:4` 使用 `savor_accounts`。
- `cloudfunctions/account/handler.js:7-9` 只从 SDK 上下文取 APPID/OPENID，并生成服务端映射键。
- `cloudfunctions/account/handler.js:12-15` 在首次账号不存在时可能插入映射；所以 bootstrap **不是只读调用**。
- `cloudfunctions/mealRecords/index.js:107-113` 校验协议、`expectedUserId` 和同一 `savor_accounts` 映射，再返回 `identityHandshake`。

当前门禁仍显示，说明敏感分区尚未解锁；它发生在 `store.syncCloud()` 之前，不能把后续日记同步混称为身份失败。

## 4. 云端只读证据

### 4.1 环境与函数

微信开发者工具 CLI 返回该 AppID 可用环境：

- `cloud1-d9gqm52id66c0bcda`

函数列表：

- `account`
- `mealRecords`
- `mealRecordsUi2Test`
- `placeLookup`

生产检查使用的是精确名称 `mealRecords`，没有把 `mealRecordsUi2Test` 当成生产函数。

函数信息：

| 函数 | 状态 | 超时 | Runtime | 与本地候选源码 |
|---|---:|---:|---|---|
| account | Active | 3 秒 | Nodejs16.13 | `index.js`、`handler.js`、`package.json` SHA-256 均一致 |
| mealRecords | Active | 15 秒 | Nodejs16.13 | `index.js`、`schema.js`、`package.json` SHA-256 均一致 |

CLI 未返回部署时间；因此部署时间记为“未证实”，不根据文件夹颜色或下载时间推断。

### 4.2 集合

- `savor_accounts`：`checkCollection` 返回 `exists:true`，集合存在。
- 集合文档内容：未读取。
- 当前账号映射是否存在、是否符合 userId 格式：未证实。
- 客户端读写规则是否为全禁：当前只读结构接口未返回规则，未证实。
- 云函数服务端 SDK 对该集合的实际访问结果：没有可用的近期函数日志，未证实。

## 5. 卡点与根因判定

### 已排除

| 假设 | 证据 |
|---|---|
| 当前工程 AppID / 根目录配置错误 | 配置与预期一致 |
| 客户端初始化到其他云环境 | 唯一 `wx.cloud.init` 使用目标环境 |
| AppID 无法关联目标环境 | CLI 能列出目标环境并查询资源 |
| account 未部署 | 函数存在、Active、云端源码与本地一致 |
| mealRecords 未部署 | 函数存在、Active、云端源码与本地一致 |
| 生产 mealRecords 是不支持握手的旧版本 | 云端 `index.js` 明确包含 `identityHandshake`，且与本地逐字节一致 |
| savor_accounts 集合缺失 | 云端结构检查确认存在 |
| 本地候选没有 S1 协议 | 源码检查和 `npm run verify:identity` 均通过；运行时 mock 22/22 |

### 已确认的直接缺陷：错误阶段被抹平

1. `miniprogram/utils/identity.js:25` 将 account 的所有非成功业务响应统一改成 `IDENTITY_INVALID`，丢失 `IDENTITY_UNAVAILABLE`、`ACCOUNT_UNAVAILABLE`、`ACCOUNT_INVALID`、`UNSUPPORTED_PROTOCOL` 等服务端码。
2. `identity.js:28` 将 mealRecords 的所有非成功或响应不符统一改成 `UPGRADE_REQUIRED`，丢失 `IDENTITY_REQUIRED`、`IDENTITY_MISMATCH`、`IDENTITY_UNAVAILABLE`、`SERVER_ERROR`、`UNKNOWN_ACTION` 等实际码。
3. `miniprogram/components/identity-gate/index.js:14` 完全忽略捕获到的异常内容，只显示 `identityCopy.js:5` 的统一失败文案。
4. `miniprogram/app.js:24` 的自动验证链把异常静默吞掉；因此门禁可保持锁定，但 console 没有任何可关联的阶段/白名单错误码。

这解释了为什么模拟器和真机都只能看到同一句“检查网络及云函数部署”，也解释了为什么现有 console/network 缓冲区无法定位阶段。它是**已确认的诊断与提示缺陷**，但不能冒充底层身份失败的最终根因。

### 底层失败阶段：待证实

剩余可能性已缩小到：

1. account 运行时/业务响应：例如服务端 SDK 上下文、集合访问、超时、已有映射格式异常。
2. mealRecords 握手运行时/业务响应：例如同一账号映射不一致或服务端访问异常。
3. 本机分区接受/持久化：`CACHE_CORRUPT`、`CACHE_UNSUPPORTED`、归属不匹配或本机存储配额。

没有阶段码或脱敏云函数日志前，继续把其中任一项写成“根因已确认”都属于猜测。

## 6. 最小修复与验证清单（等待授权）

### 当前立即执行的云端修复：0 项

目前没有证据支持重新部署函数、重建 `savor_accounts`、修改规则或清缓存。云端代码已与候选一致，集合也存在。

### 第一步：最小本机诊断补丁（2 个文件）

1. `miniprogram/utils/identity.js`
   - 分别标记 `account-transport`、`account-response`、`handshake-transport`、`handshake-response`、`partition-accept`。
   - 仅保留明确白名单错误码；未知异常统一为该阶段的 `*_UNAVAILABLE`，不显示 `cause`、OPENID、userId、token 或原始服务端消息。
2. `miniprogram/components/identity-gate/index.js`
   - 按阶段显示脱敏提示与白名单错误码。
   - 诊断 retry **只调用 `identity.verify()`**，暂不调用 `store.syncCloud()`，避免发送当前账号已有 outbox。

该补丁也符合产品长期修复方向：用户需要知道失败发生在 account、handshake、partition 还是后续 sync，而不是永久保留统一误导文案。

### 第二步：获授权后只执行一次两步验证

- 只执行 account bootstrap + mealRecords identityHandshake。
- 不读取日记列表，不调用 `store.syncCloud()`，不发送 outbox。
- 报告只记录阶段、白名单错误码、时间及脱敏 requestId；身份一致性只写 true/false。
- 风险边界：bootstrap 在首次账号没有映射时可能创建一条稳定账号映射；两步成功后 partition accept 可能新建/更新本机 `savor-identity-partitions-v1` 信封。不会删除旧 diary/draft 键。

### 第三步：按真实阶段选择唯一修复

| 诊断结果 | 最小动作 | 数据/回退边界 |
|---|---|---|
| account 传输或 `ACCOUNT_UNAVAILABLE` | 查对应时间的 account 云日志；仅在日志证明依赖/配置异常时更新 account | 不删集合、不改映射；函数更新前保留当前云端包 |
| `ACCOUNT_INVALID` | 先备份并核对当前账号那一条映射，再设计单记录修复 | 禁止删除/重建集合或重置稳定 userId；需单独授权 |
| handshake `IDENTITY_MISMATCH` | 核对 account 与 mealRecords 读取的是同一映射；只修不一致点 | 现有两个函数源码已一致，不盲目重部署 |
| handshake transport / `SERVER_ERROR` | 查 mealRecords 同时间日志与服务端集合访问 | 不触碰 dining_records 数据 |
| `CACHE_CORRUPT` / `CACHE_UNSUPPORTED` / quota | 先导出或保全原始信封，再做只针对本机分区的补丁 | 不清缓存、不删 diary/draft/照片，不自动认领旧队列 |

### 回退

- 当前目录无 Git 元数据；若获准改代码，修改前应单独备份上述两个文件，回退只恢复这两个文件。
- 若 bootstrap 首次创建了账号映射，回退客户端时也**不得删除该映射**。
- 任何云函数部署、集合文档修复或规则变化都必须再次取得针对具体动作的授权。

## 7. 本次实际操作与写入声明

已执行：

- 只读读取工程配置、身份链路、相关文档和调用方。
- 检查 Git 元数据（未找到 `.git`，未执行任何 reset/checkout）。
- 执行 `npm run verify:identity`：基础检查通过，mock 运行时 22/22；这不是 CloudBase/真机成功证据。
- 通过微信开发者工具 CLI 只读列环境、函数、函数信息并下载云端函数到项目外临时目录做 SHA-256 比较。
- 只读确认 `savor_accounts` 集合存在；未读取集合文档。
- 读取当前运行页、系统信息、脱敏 console/network 过滤结果并截取模拟器画面；没有点击“联网验证 / 重试”。
- 新建本报告。

未执行：

- **无 bootstrap 重放、无 account 映射写入、无日记列表读取、无 outbox 发送。**
- **无云函数部署、无集合创建/删除、无数据库或存储规则变更。**
- **无小程序缓存/本机存储清理，无 diary/draft/photo/userId 修改。**
- **无 Git 提交、推送或发布。**

项目外临时取证产物：

- 云函数只读下载目录：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-identity-cloud-bbd7508dfcce4d21bb567f20af1f6694`（约 44.2 MB）。自动递归清理被本机执行策略拒绝，故保留；它只含下载的云函数包及依赖，不含数据库文档。
- 模拟器截图位于系统 Temp，未复制进工程。

## 8. 待授权边界

请仅在接受以下明确副作用时授权下一步：

> 修改 `identity.js` 与 `identity-gate/index.js` 做脱敏分阶段诊断；编译后执行一次不调用 `syncCloud` 的 account + identityHandshake。bootstrap 可能为首次账号创建稳定映射，握手成功后可能写入本机身份分区信封；不部署、不改规则、不读取日记、不发送 outbox。

在收到该授权前，诊断停在此处。
