> 最新状态：当前 ACCOUNT_UNAVAILABLE 已修复；安全补建集合，客户端读写拒绝，两次真实 account 业务成功且身份一致。默认冻结不变。完整结果见 mcp-account-complete-20260915.md；以下为旧阶段取证。

# ACCOUNT_UNAVAILABLE：真实定位与安全停点

2026-09-15（UTC+8）。目标：cloud1-d9gqm52id66c0bcda / account。

## 已定位的当前阻塞

真实小程序调用经服务端白名单诊断返回：
- 阶段：account-find
- SDK 错误：DATABASE_COLLECTION_NOT_EXIST
- 分类：not-found
- 服务端阶段耗时：103 ms；客户端全程：701 ms
- 业务结果：ACCOUNT_UNAVAILABLE；传输成功。

同一指定环境的完整集合列表返回 Total=14、Offset=0、Limit=100，14 项中没有 savor_accounts。没有读取文档内容。

### 为什么先前“集合存在”的判断不可靠

已确认当前 wechatide-skill 0.3.9 的 checkCollection 检查不可信：
- savor_accounts 返回 exists:true；describeCollection 返回成功，但无实际集合详情。
- 对完整列表中同样不存在的 __arena_absent_probe_20260915 做只读阴性对照，也返回 exists:true。
- 所以不能把 checkCollection 的成功包装或 exists:true 当作真实存在证据。没有创建阴性对照集合。

当前证据支持：账户集合未配置，是本次 account-find 失败的直接阻塞。历史失败的完整服务端日志仍未取得；不能把今天的证据冒充历史原始日志。

## 本批已执行

用户授予 ACCOUNT_UNAVAILABLE 排查、必要修复、部署及验证的广泛授权；仅安全风险再询问。保持默认诊断冻结和不接续 handshake 的边界。

1. 接通微信开发者工具官方 skill 客户端 Arena-account-repair；登录未过期、skill 0.3.9、tokenRequired=false。没有复用其他客户端身份、读取原始凭据或绕过权限检查。
2. 打开目标修复工作区的 liteMode 模拟器，运行时核对 AppID、云环境及 diagnostic 模式。
3. 执行 4 次有独立单次保护的 account 请求，handshake 均未执行：
   - v1：复现 ACCOUNT_UNAVAILABLE，2124 ms。
   - v2/v3：诊断部署后遇到传输错误；v3 确认 -504002 / Cannot find module 'wx-server-sdk'。
   - v4：依赖部署修复后，取得 account-find / DATABASE_COLLECTION_NOT_EXIST。
4. 仅修改 account/handler.js：显式 event.diagnostic===true 时附带原有白名单诊断数组；普通请求仍保持原有错误响应结构。无 OPENID、账户内容、原始异常 message/stack。身份算法、超时、运行时不变。
5. 诊断补丁 5 个定向 mock 用例和原 19/19 审计回归通过。只是本地测试，不冒充云端成功。
6. account 部署操作：初次诊断部署获 CLI 接受；随后依赖修复首次被 Updating 状态拒绝；确认元信息后重试带 --remote-npm-install 的部署成功。不能把 CLI exit=0 等同业务成功；拒绝的部署也返回过 exit=0。
7. 云端下载复核 wx-server-sdk 2.4.0、@cloudbase/node-sdk 2.4.7、@cloudbase/database 1.2.2。部署使用既有锁文件；未升级 SDK。v4 已证明本次缺模块问题排除。
8. 最新 account 元信息 Active / Nodejs16.13 / 3秒。handler SHA256：4f0a135e8b2845109904532c15caff252b03b5c2949e0d5034a96d92334d386f。

## 安全停点

尚未新建 savor_accounts，也未修改数据库规则、权限或删除数据。当前工具注册表提供集合创建和索引维护，但没有已验证的数据库权限设置/读取入口。

账户映射必须仅管理端可读写。不能为了消除“集合不存在”而用未经核验的默认权限上线账户数据；尤其不能允许客户端抢先写入伪造身份映射。

需要在目标环境将 savor_accounts 建为“仅管理端可读写”，或提供能够设置并核验同等规则的受支持安全入口。完成后继续单次 account 验证；只有真实成功才关闭当前阻塞。不要删除或重建已有其他集合，不改其权限。

## 备份、变更与证据（Windows 工作区相对路径）

- 原 handler：reports/mcp-account-evidence/pre-response-diagnostic-handler.js
- 部署前下载包：reports/mcp-account-evidence/deployed-account-20260915/
- 当前暂存：reports/mcp-account-evidence/response-diagnostic-stage/account/
- 已核验下载：reports/mcp-account-evidence/deps-ready-verify/
- 真实诊断：reports/mcp-account-evidence/account-deps-fixed-result.json
- 集合完整列表：reports/mcp-account-evidence/collections-list-result.json
- 检查阴性对照：reports/mcp-account-evidence/collection-negative-control.json
- 部署与 SDK：deps-deploy-retry-result.txt、deps-ready-check.json、deps-ready-info.txt
- 本地测试：reports/mcp-account-evidence/response-diagnostic-tests.txt

回退须从部署前备份恢复代码并使用核验过的依赖部署路径；先确认函数不处于 Updating，不能把首次无云端依赖安装的部署命令当成可靠回退。

本批未恢复 normal 模式、未写本地身份分区、未执行 outbox/handshake、未推送 GitHub。账户业务成功和全链路验收仍待完成；既有 8/8 本地审计修复、9/9 功能候选实现不等于本问题已关闭。


## 后续完成（覆盖上文安全停点状态）
用户要求代理自行完成安全配置后，已通过云控制台创建仅管理端可读写的 savor_accounts，客户端读/更新被拒绝，两次 account 业务成功且身份一致。最终报告见 mcp-account-complete-20260915.md。
