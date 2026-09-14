# Savor 身份门禁阻塞诊断 R2

诊断时间：2026-09-14 19:59:59（Asia/Shanghai）  
工程：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-s1-s4-candidate-20260914\savor-candidate`  
状态：**已在首个真实失败阶段停止；诊断模式保持启用，等待授权。**

## 1. 结论

唯一一次受控真实验证得到：

| 项目 | 结果 |
|---|---|
| 失败阶段 | `account-response` |
| 安全错误码 | `ACCOUNT_UNAVAILABLE` |
| 耗时 | 2062 ms |
| account 调用 | 1 次：`bootstrap` |
| identityHandshake 调用 | 0 次 |
| 身份匹配 | 未执行 / `null` |
| 脱敏 requestId | `052513…0aad` |
| 结束后的门禁 | `identityReady=false`、gate 存在、按钮空闲 |

这确认了当前门禁的直接根因：**`account` 云函数已成功完成传输并返回业务失败 `ACCOUNT_UNAVAILABLE`；失败发生在 handshake、本机 partition accept 和日记同步之前。** 因而本次问题不是客户端网络传输失败，不是 `mealRecords.identityHandshake` 不匹配，也不是本机身份分区损坏。

服务端代码只在 `cloudfunctions/account/handler.js:10-20` 的账号仓储异常捕获路径返回 `ACCOUNT_UNAVAILABLE`。该路径包含：

1. 查询 `savor_accounts`；
2. 首次账号不存在时插入稳定映射；
3. 插入冲突后重新查询。

所以根因已收敛为：**生产 `account.bootstrap` 对 `savor_accounts` 的查询、首次插入或冲突后重读发生异常。** 云函数当前没有记录或返回底层异常，只把三种仓储阶段统一压成 `ACCOUNT_UNAVAILABLE`；在取得对应云函数日志前，不能诚实地再细分为权限、环境绑定、数据库服务异常或插入冲突。此前已确认集合存在、函数 Active、远端源码与本地一致，因此不应盲目重建集合或重部署现有包。

## 2. 诊断隔离

### 自动入口审计

已审计全部身份与日记同步入口：

- `miniprogram/app.js:25`：前台 `onShow` 的自动 `verify → syncCloud`；
- `miniprogram/utils/store.js:123`：网络恢复的自动 `verify → syncCloud`；
- `miniprogram/components/identity-gate/index.js:13`：人工身份按钮；
- `miniprogram/pages/home/index.js:54`、`pages/map/index.js:113`、`components/sheet/index.js:263`：页面/面板同步；
- `miniprogram/pages/workspace/index.js:16,28,29`：只读刷新；
- `miniprogram/utils/store.js:187,203,306,395,427,434,528`：直接或间接 outbox flush、日记读取与同步。

诊断模式的中央边界：

- `identity.verify()` 的自动调用直接返回 `DIAGNOSTIC_MODE`，不会调用云函数；
- 只有 `identity.verify({diagnostic:true})` 可运行，且全进程只允许一次；
- 启用诊断时立即废弃旧 session，门禁保持锁定，不复用未验证身份；
- `store.flushOutbox()`、`store.refreshCloudReadOnly()`、`store.syncCloud()` 在入口处统一阻断；
- `cloudRecords.call()` 与 `uploadPhotos()` 也在公共云边界阻断，覆盖直接调用；
- 原有 epoch、flight、lease、partition ticket/accept 检查未移除。

专测证明启动、前台、网络恢复、页面同步、直接 flush 和云记录直调均不会增加云调用；第二次人工诊断也被 `DIAGNOSTIC_ALREADY_ATTEMPTED` 阻断。

## 3. 本地修改与备份

原文件备份目录：

`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-identity-r2-backup-20260914-1942`

当前目录没有 `.git`，因此该目录是本次诊断补丁的回退基线。

| 文件 | 诊断用途 |
|---|---|
| `miniprogram/app.js` | 在任何 store/业务入口前启用诊断模式 |
| `miniprogram/utils/identity.js` | 一次性状态机、阶段白名单、脱敏 requestId、计时和调用计数 |
| `miniprogram/components/identity-gate/index.js` | 按钮只做身份链路并返回安全诊断快照，不再同步日记 |
| `miniprogram/utils/store.js` | 中央阻断日记读取、sync 与 outbox flush |
| `miniprogram/utils/cloudRecords.js` | 阻断绕过 store 的直接日记云调用与上传 |
| `miniprogram/pages/home/index.wxml` | 增加无业务语义的组件 id，供开发者工具精确调用按钮处理函数 |
| `tools/identity-fixture.cjs` | 让既有业务回归 fixture 明确保持非诊断状态 |
| `tools/verify-identity-diagnosis.cjs` | 新增最小可运行隔离检查；此文件为新增文件，无原件可备份 |

未修改云函数、数据库 schema/文档/规则、项目 AppID 或 CloudBase env。

## 4. 测试与编译结果

真实调用前完成：

- `node --check`：诊断涉及的 JS/CJS 文件全部通过；
- `node tools/verify-identity-diagnosis.cjs`：通过；覆盖一次性 account/handshake、各阶段安全码、敏感值不输出、自动入口/日记/outbox 全阻断；
- `npm run verify:cloud`：233/233；
- `npm run verify:all`：退出码 0；其中静态 297/297、身份运行时 22/22，Tab、资产、图标、云契约、handoff、UI、spaces、media、workspace 全部通过；
- 最后加入自动化组件 id 后再次执行诊断专测、`npm run verify`（297/297）与 `npm run verify:ui`（44/44），全部通过；
- 微信开发者工具重新编译/刷新成功；Home 页正常显示身份门禁，编译前后 error 过滤均为空。

第一次完整回归曾发现旧测试 fixture 不认识新增的诊断边界；仅补了两个无操作 fixture 方法后，完整回归通过。运行时代码没有因该失败而执行真实请求。

## 5. 唯一一次真实验证

执行顺序及停止点：

1. `cloud-init`：通过；
2. `account` 传输：通过；
3. `account` 业务响应：`ACCOUNT_UNAVAILABLE`；
4. 立即停止；未进入 `identityHandshake`、`partition-accept`、日记读取或 outbox。

按钮后的 UI 只显示：

`身份验证：account-response / ACCOUNT_UNAVAILABLE`

开发者工具过滤后的 console 与 network 缓冲区均无额外匹配行。调用计数由诊断状态机在发出每个允许请求前记录，比 network 面板是否捕获云调用更可靠。

## 6. 副作用与未执行事项

已确认：

- 客户端账号分区未解锁，`identityReady=false`；
- `mealRecords.identityHandshake` 为 0 次；
- 日记 list/read 为 0 次；
- outbox/mutation/upload 为 0 次；
- 没有自动重试、轮询或第二次 bootstrap；
- 没有部署、云函数同步、数据库/规则修改、账号修复、清缓存、清理数据、Git commit/push。

需要保留的不确定性：`bootstrap` 本身允许在首次账号不存在时创建稳定映射。当前调用最终返回 `ACCOUNT_UNAVAILABLE`，正常成功插入会直接返回成功；但服务端吞掉了仓储异常，且本次按边界没有读取账号文档，所以不能把“绝对没有账号映射写入”写成已证实事实。即使存在映射，也禁止删除或重置。

项目外证据：

- 调用前截图：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-identity-r2-before.jpg`
- 调用后截图：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-identity-r2-after.jpg`
- 上轮只读云函数下载：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-identity-cloud-bbd7508dfcce4d21bb567f20af1f6694`

这些产物未按本次授权删除。

## 7. 最小修复清单（等待授权）

当前建议的最小下一步不是重建集合或重部署同一份代码，而是：

1. 读取 2026-09-14 19:59:59（UTC 11:59:59）附近、脱敏 requestId `052513…0aad` 对应的 `account` 云函数平台日志，确认仓储异常原文；不读取账号正文。
2. 如果平台没有底层日志，只在 `account` handler 增加三段脱敏阶段日志（`account-find` / `account-insert` / `account-reread`），不记录 APPID、OPENID、userId、key 或原始 event；随后仅部署 `account`。这一步需要新的明确授权。
3. 根据日志只修命中的一处：环境/数据库访问配置、首次插入或冲突重读。禁止重建 `savor_accounts`、批量改账号或重置稳定 userId。
4. 修复后另行授权一次新的 `bootstrap` 验证；只有 account 成功才允许一次 handshake，仍不读取日记、不发送 outbox。
5. 身份链路确认后，再决定是否恢复普通启动与同步；当前诊断模式继续保持。

## 8. 回退

如获准撤销诊断模式：

1. 从备份目录按相同相对路径恢复 7 个已有文件；
2. 删除新增的 `tools/verify-identity-diagnosis.cjs`；
3. 重新执行 `npm run verify:all` 并编译；
4. 不回退、删除或重写任何可能由 bootstrap 创建的账号映射。

本报告完成后不再执行验证、修复、部署或同步，等待用户授权。
