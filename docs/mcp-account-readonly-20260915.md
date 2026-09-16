> 最新状态：当前 ACCOUNT_UNAVAILABLE 已修复；安全补建集合，客户端读写拒绝，两次真实 account 业务成功且身份一致。默认冻结不变。完整结果见 mcp-account-complete-20260915.md；以下为旧阶段取证。

# ACCOUNT_UNAVAILABLE：限定云端只读取证进展

日期：2026-09-15。结论：元信息查询和现有代码下载已完成；现有服务端调用日志尚未取得；历史根因与业务恢复均未确认。

## 授权与执行边界
- 环境 cloud1-d9gqm52id66c0bcda，仅以 account 为函数目标；AppID wx65867b5568b82996。
- 用户已授权云端元信息、现有调用日志、必要时下载现有代码；另批准 CLI 更新自身临时 .cli 端口记录。
- CLI 在 Electron 的 Node 模式执行；预先拦截 child_process 的 spawn/exec/execFile/fork 及同步变体，禁止连接失败后拉起 IDE。未提供 project/open/preview/auto 等参数。
- 本批没有执行部署、函数调用、bootstrap、handshake、数据库文档查询、缓存清理、业务配置或产品源码修改。
- 下载命令的内部输出包含 fetching cloud env list；这是 CLI 下载流程的环境解析，不是 account 业务调用。

## 已取得证据
1. 精确进程名为 微信开发者工具.exe，安装位置 D:\software data\微信web开发者工具。早先英文进程名筛选漏检，不是 IDE 未运行的证据。
2. 受保护的 cloud functions info 成功返回 account：status=Active，timeout=3，runtime=Nodejs16.13。CLI 只返回这三个字段，没有部署时间、版本号或调用结果。
3. 受保护的 cloud functions download 成功，下载至 reports/mcp-account-evidence/deployed-account-20260915；没有覆盖工作区 cloudfunctions/account。
4. 下载所得文件 SHA256：
   - index.js：1ddaa48d6781073988054cfea99ebe3a5f8db47df961dd35825693c10f765752
   - handler.js：7f4fe39a9e17b42ebf9c3d22ba60fcde97d7f5f142ef0f0a5c5f5a5b2cc20a13
   - package.json：619c32171f7c2c040477d49375a9e8b8a49df933a41073284a7f53e362572680
   三个文件与已读取的本地诊断修复候选一致。handler 不再是历史原始版本 a7c3fd17...9deb0；不能据此推定修改时间、修改者或历史故障已修复。
5. 本机 CLI 的 cloud functions 子命令及随附 wechatide-tools 注册表未发现服务端函数日志读取命令。注册表的 cloud_fn 工具只有 deploy、inc_deploy、info、list；未调用写入工具。此结论只限于已核对的两个入口，不代表平台没有日志或其他入口。

## 不能据此推出的结论
- Active 不是函数业务成功；3 秒配置不是超时根因证据；Nodejs16.13 不是 SDK/平台错误证据。
- 当前代码匹配不证明 2026-09-14 19:59:59 的失败使用这版代码，也不证明历史原因消失。
- 本批没有新增真实函数调用，未验证诊断日志实际落地、账户读取/创建成功或握手成功。
- 缺少现有服务端日志，不能确认失败的具体 SDK 操作、错误码、请求上下文或云端返回。

## 当前停点与下一步
元信息和代码取证已完成；日志取证仍被入口能力阻塞。没有为了获得日志而启动项目、调用函数或部署，也没有凭猜测继续修改产品源码。
下一步应补齐能够按 account 与历史时间窗读取现有服务端日志的入口。若必须改为新诊断调用，应先说明 OPENID 来源、可能的账户文档读取/创建、如何确保只调用一次 account 且不接续 handshake，再单独请求授权；目前未获该项授权。

## 原始证据（相对工作区）
- reports/mcp-account-evidence/devtools-location.json
- reports/mcp-account-evidence/cli-startup-path.txt
- reports/mcp-account-evidence/guarded-account-info.cjs
- reports/mcp-account-evidence/account-info-probe.txt
- reports/mcp-account-evidence/guarded-account-download.cjs
- reports/mcp-account-evidence/account-download-probe.txt
- reports/mcp-account-evidence/deployed-code-check.json
- reports/mcp-account-evidence/function-log-schema.json

总进度：既有 8/8 本地审计修复、9/9 业务类别候选实现的状态不变。本批完成云端元信息与代码只读取证，不计作 ACCOUNT_UNAVAILABLE 已修复或生产验收通过。
