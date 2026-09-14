# Account 服务端异常诊断计划

时间：2026-09-14（Asia/Shanghai）  
工程：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-s1-s4-candidate-20260914\savor-candidate`  
状态：**本机诊断补丁与 mock 已完成；未部署、未重新调用 bootstrap，等待明确授权。**

## 1. 现有日志结论

### 能确认的事实

- R2 唯一真实调用在 2026-09-14 19:59:59 返回 `account-response / ACCOUNT_UNAVAILABLE`，account=1、handshake=0。
- 本机微信开发者工具主日志在 `19:59:59.658+08:00` 只记录了 `automation_evaluate` 成功结束；没有 `account` 云函数的 SDK 错误、caught error 或函数内部阶段。
- R2 的 simulator console/network 过滤结果为空。它们没有捕获到被服务端 handler catch 后的底层数据库异常。
- 当前 handler 不记录 caught error；因此云函数即使正常结束并返回 `ACCOUNT_UNAVAILABLE`，平台执行成功日志也不能说明数据库操作成功。
- R2 只在内存中保留过完整响应，并立即输出脱敏 requestId；本地持久化证据只有 `052513…0aad`，没有可用于精确检索的完整 requestId。
- 当前安装的 wechatide-skill 0.3.9 没有云函数日志查询工具；本轮没有通过重复调用补日志。

### 结论

**现有可访问日志不足以定位最终根因。** 已确认的是原线上 handler 的 `ACCOUNT_UNAVAILABLE` 捕获分支；未知的是该分支内究竟由初次 find、候选构造、insert、失败后的 reread，还是结果构造触发。

原线上代码的映射 key 哈希和 `context()` 位于外层 catch 之前；如果它们抛错，通常不会形成当前这个业务响应。原 catch 实际覆盖账号 find、候选随机 ID/时间构造、insert、reread 和成功结果构造。不能未经新日志把问题断言成权限、插入冲突或 3 秒超时。

## 2. 实际 SDK 证据

检查对象是 R1 已下载的真实线上 `account/node_modules`，不是新安装或凭记忆推测的版本：

| 包 | 实际版本 |
|---|---|
| `wx-server-sdk` | 2.4.0 |
| `@cloudbase/node-sdk` | 2.4.7 |
| `@cloudbase/database` | 1.2.2 |

源码证据：

- `collection.where({_id:key}).limit(1).get()` 最终调用 `database.getDocument`，成功结果经 wx-server-sdk 包装为 `{data:[...]}`；现有 `result.data[0] || null` 用法正确。
- `collection.add({data:account})` 是 wx-server-sdk 2.4.0 的正确包装层签名；它将 `options.data` 交给底层 `@cloudbase/database`，后者序列化后调用 `database.insertDocument`。
- wx-server-sdk 会把部分底层字符串错误码转换为数字 `errCode`，例如 `-501002`（超时）、`-501007`（参数）、`-502003`（权限）、`-502005`（集合不存在）。诊断补丁因此优先白名单映射 `errCode`，而不是输出 message/stack。
- 底层 `collection.add` 路径会序列化并转发自定义 `_id`，没有调用该包中只适用于另一引用路径的 24 位 docId 校验。不能把那个未被调用的校验器当成线上失败证据。

官方资料也明确：CloudBase 支持自定义 `_id`；服务端/云函数以管理身份访问数据库，通常不受客户端集合权限限制。参见 [CloudBase 概述](https://cloud.tencent.com/document/product/876/19369) 与 [插入数据](https://cloud.tencent.com/document/product/876/19362)。

当前 key 确实是 64 位 SHA-256 十六进制，但上述官方页面没有给出能证明其非法的 `_id` 长度上限，实际 add 路径也没有本地拒绝。因此“64 位 `_id` 被服务端拒绝”只能列为待验证假设，不能据此改稳定映射算法。

## 3. 本机诊断补丁

### 修改文件

1. `cloudfunctions/account/handler.js`
   - 增加固定事件 `ACCOUNT_DIAGNOSIS`；
   - 阶段固定为 `account-find`、`account-build`、`account-insert`、`account-reread`、`account-result-check`；
   - 只记录阶段、白名单 SDK 码、固定分类、允许的异常类型和毫秒耗时；未知值统一为 `UNKNOWN`；
   - 不读取或记录原始 message/stack/error 对象；
   - insert 失败会立即留下 `account-insert`，随后仍按原语义 reread 赢家；reread 成功时外部仍成功并采用赢家稳定 userId；
   - 外部响应协议保持 `UNSUPPORTED_PROTOCOL`、`IDENTITY_UNAVAILABLE`、`ACCOUNT_INVALID`、`ACCOUNT_UNAVAILABLE` 与成功结构不变；
   - 未修改映射 key、随机稳定 userId、并发竞争语义、重试次数或写入次数。

2. `tools/verify-account-server-diagnosis.cjs`（新增）
   - 无测试框架依赖的最小 mock 检查。

`cloudfunctions/account/index.js` 不需要修改。handler 的 `diagnosticLog` 是可选注入点；生产缺省直接写安全 JSON 到现有 console，因此 adapter、集合引用和环境初始化保持原样。

### 备份与哈希

备份：

`E:\HuaweiMoveData\Users\HUAWEI\Desktop\临时\savor-account-server-diagnosis-backup-20260914-2020\cloudfunctions\account\handler.js`

| 对象 | SHA-256 |
|---|---|
| 已下载线上 handler / 本轮备份 | `A7C3FD17F5C015E9CBCB7EF469CF74F363BBC143AB9654E8856676152369DEB0` |
| 本机诊断 handler | `DF733243EA69A9C9FB20681AD1E82CC75D0264499D745F5C8E494B904E48BA69` |
| 新增 mock | `65BC074F9B3C05995459972E9DC7BD2E71D89742A80ACF87F3611549168D3B9D` |

与已下载线上版本相比只有 `account/handler.js` 有生产差异：40 行新增、9 行替换/删除；`index.js`、`package.json` 和依赖未改。当前工程没有 Git 元数据，因此使用上述备份和哈希作为回退基线。

## 4. Mock 与回归结果

`node tools/verify-account-server-diagnosis.cjs`：PASS，覆盖：

1. 初次 find 抛错：准确记录 `account-find`，未 insert；
2. key/candidate build 抛错：记录 `account-build`，不误标为 find；
3. insert 失败、reread 返回赢家：保留成功并采用赢家稳定 ID，同时留下安全 `account-insert`；
4. insert 失败、reread 无记录：返回 `ACCOUNT_UNAVAILABLE`，日志保留 insert 与 reread/not-found；
5. reread 抛错：准确记录 `account-reread` 和白名单超时码；
6. 合法映射、非法映射、无身份上下文和错误协议的原响应不变；
7. result-check 异常准确归类；
8. error 中嵌入的身份、文档、token、原始 message/stack 均未进入日志或响应，日志字段集合固定。

`npm run verify:identity`：PASS；S1 foundation 通过，运行时身份回归 22/22。并发 bootstrap、稳定赢家、A/B 隔离、旧数据保护、outbox 隔离和 stale lease 断言未削弱。

没有执行真实 SDK 请求、bootstrap、handshake、日记读取或 outbox。

## 5. 待授权部署计划

如用户批准，唯一部署目标为：

| 项目 | 值 |
|---|---|
| 云函数 | `account` |
| 环境 | `cloud1-d9gqm52id66c0bcda` |
| 唯一生产源码差异 | `cloudfunctions/account/handler.js` |
| 不更新 | `mealRecords`、`spaces`、`media`、`workspace`、数据库集合/文档/权限/规则 |

部署前应再次下载或读取线上 `account`，确认 handler 仍为 SHA-256 `A7C3...DEB0`；若已变化则停止，不能覆盖未知线上更新。部署后只读取安全部署状态，不把“部署成功”当作身份修复成功。

回退方法：恢复备份 handler，重新运行诊断 mock 与 `verify:identity`，然后只回退部署 `account`；不删除或改写任何 `savor_accounts` 映射。

## 6. 需要用户明确批准的动作

> 仅部署已经审查过的account脱敏诊断补丁到指定环境，保留所有映射与规则；在继续隔离自动入口和日记/outbox的条件下，允许一次新的bootstrap，成功后最多一次handshake。bootstrap可能首次创建稳定映射，成功后可能写本机分区。完成后立即停止并汇报。

这只是待批准说明。本轮没有获得上述权限，因此：

- 未部署或同步任何云函数；
- 未修改数据库、规则、运行时或超时；
- 未读取账号正文；
- 未重置 R2 `diagnosisAttempted`；
- 未发起新的 bootstrap/handshake；
- 未恢复普通启动或 `syncCloud`；
- 未发送日记、outbox、upload 或消息。

计划输出到此停止，等待授权。
