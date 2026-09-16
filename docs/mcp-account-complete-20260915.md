# ACCOUNT_UNAVAILABLE 修复完成报告

**日期：2026-09-15（UTC+8）**  
**AppID：`wx65867b5568b82996`**  
**范围：`cloud1-d9gqm52id66c0bcda` / `account`；默认诊断冻结保留。**

## 结论

**当前 ACCOUNT_UNAVAILABLE 阻塞已解除，并通过真实微信小程序运行时的两次云端业务验证。**

直接阻塞是目标环境缺少 `savor_accounts` 集合。安全补建集合后，在没有更改身份算法、数据库查询方式、运行时或 3 秒超时配置的情况下，账户创建和重复读取均成功。

这关闭的是本次可复现阻塞，不代表整套身份握手、同步或全部业务已经验收。历史那次失败的完整服务端日志没有取得，不将本次证据冒充历史日志。

## 真实验证结果

| 验证 | 结果 |
|---|---|
| 修复前服务端阶段 | `account-find` |
| 修复前 SDK 错误 | `DATABASE_COLLECTION_NOT_EXIST` |
| 集合创建 | `savor_accounts`，创建后元信息 Count=0 |
| 权限回读 | 控制台选中“所有用户不可读写”；说明云控制台和服务端仍可管理 |
| 客户端读取测试 | 拒绝，`-502003` |
| 客户端更新测试 | 拒绝，`-502003`；针对不存在的测试 ID，不执行 upsert，也未创建测试记录 |
| 首次修复后 account | 传输成功、`success:true`、协议版本 1、身份格式有效；2056 ms |
| 再次 account（不带诊断响应） | 业务成功、与首次返回同一身份；471 ms；响应无 diagnostics 字段 |
| 最终集合元信息 | 仅 1 条账户记录 |
| handshake | 本批 0 次 |
| 默认模式 | 仍为 `diagnostic`，配置 SHA256 未变化 |

首次成功时间：2026-09-15 20:10:50（UTC+8）。重复验证时间：20:11:26。

本批共执行 6 次有独立单次保护的 account 调用：修复前复现 1 次、部署期传输失败 2 次（其中一次明确报告缺少 SDK）、定位集合错误 1 次、修复后成功 2 次。另有 2 次客户端数据库权限测试，均被拒绝。

## 为什么之前被误导

当前安装的 wechatide-skill 的 `checkCollection` 不能可靠证明集合存在：
- 对 `savor_accounts` 返回 `exists:true`。
- 对同样不存在的阴性对照名称也返回 `exists:true`。
- 真实完整集合列表当时为 14 项，没有 `savor_accounts`；服务端实际查询也报集合不存在。
- 已读取随附 CloudBase MCP 实现：检查路径在 DescribeTable 请求未抛错时直接标记存在，没有证明返回了实际集合信息。未修改工具供应商源码。

因此不再把工具包装的 success/exists 当成数据库存在或业务成功的证据。

注：`collections-list-result.json` 被后续创建后的列表查询覆盖。创建前的 Total=14、目标缺失结论来自当时已返回的 MCP 工具记录，不把现在的文件当作创建前快照。最终列表另存为 `collections-final-list.json`。

## 实际变更

1. **云端安全配置**：通过已登录的微信云开发控制台，在核对完整环境 ID 后，创建 `savor_accounts`，创建时直接指定“所有用户不可读写”。没有先用宽松默认权限运行账户逻辑；没有更改其他集合权限。
2. **诊断代码**：`cloudfunctions/account/handler.js` 增加显式 `event.diagnostic===true` 的白名单诊断响应。只含阶段、已知 SDK 错误码、类别、异常类型、耗时，不含 OPENID、账户内容或原始异常文本。普通请求响应结构保持不变。
3. **持久回归测试**：新增 `tools/verify-account-diagnostics.cjs`，覆盖诊断开关、白名单字段及普通响应兼容。
4. **实际数据写入**：服务端首次成功 bootstrap 创建 1 条正常账户映射，重复调用返回同一身份，没有重复记录。没有删除数据或重置身份。
5. **部署问题处理**：首次诊断部署后曾出现 `-504002 / Cannot find module 'wx-server-sdk'`。改用锁文件约束的云端依赖安装部署路径后排除；一次更新请求被 Updating 状态拒绝，没有将其算作成功。再次下载核验核心 SDK 版本为 2.4.0 / 2.4.7 / 1.2.2，之后真实业务成功。

当前 handler SHA256：`4f0a135e8b2845109904532c15caff252b03b5c2949e0d5034a96d92334d386f`。

没有改动默认模式、UI 业务源码、身份映射算法、运行时或超时；没有 GitHub push、handshake、outbox 或恢复自动同步。控制台导航曾默认展示其首个非目标集合记录，未修改该记录；相关临时整窗截图已被后续权限页截图覆盖，不纳入交付报告。

## 回归

- `npm run verify:all`：退出码 0，约 45.5 秒；包括原 19/19 审计检查。
- `node tools/verify-account-diagnostics.cjs`：5/5 定向检查通过。
- 实际下载 SDK 的拦截传输契约检查：14/14，`networkAttempts=0`。
- 以上离线/拦截测试与前述真实云端结果分开记录，不混算验收数量。

## 证据及备份

Windows 工作区：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-audit-repairs-20260915`。

相对路径 `reports/mcp-account-evidence/` 下：
- `account-deps-fixed-result.json`：修复前服务端明确错误。
- `collection-negative-control.json`：工具假阳性对照。
- `collection-create-private.png`、`collection-permission-verified.png`：安全配置与回读。
- `client-acl-result.json`：客户端读取、更新拒绝。
- `account-after-private-create.json`、`account-repeat-verified.json`：两次业务成功。
- `account-final-collection.json`：记录数 1、配置 hash 未变。
- `final-verify-all.txt`、`final-response-tests.txt`、`final-sdk-contract.txt`：回归记录。
- `pre-response-diagnostic-handler.js`、`deployed-account-20260915/`：诊断改动前代码与下载备份。

代码回退不应删除已创建的账户映射。若以后需要撤下诊断响应，应只回退 handler 并沿用已验证的依赖部署路径；不得放宽集合权限或清空账户数据。

## 总进度与后续

- **ACCOUNT_UNAVAILABLE：当前阻塞已修复并经云端实测关闭。**
- 既有 8/8 本地审计修复、9/9 业务类别候选实现状态不变。
- handshake、身份分区接入、离线/跨账号、同步及其他业务的统一外部验收尚未完成；不能因此宣称整套应用已上线验收。
- 默认诊断冻结仍在，所以界面仍可能显示身份验证门禁。这不等于 account 修复失败，也不会自动解冻。

用户的推进授权继续有效：普通诊断、必要最小修复和验证无需逐项重复询问；涉及安全风险时才暂停确认。

交付版本说明：此前独立候选 ZIP 没有重新打包；最新源码和报告以本次 Windows 工作区为准，不要重新导入旧 ZIP 覆盖现工作区。Arena 保留本次 handler 补丁及只含布尔值/元信息的验证结果。两次验证使用的临时内存身份标识及上次原始传输错误已在 v6 返回前删除，未清除任何用户存储。
