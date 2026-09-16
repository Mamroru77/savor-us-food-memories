> **历史S1提示词**：目前已进入S2连续开发，本文件只作S1验证子清单，不要求用户现在执行。最终统一提示词将合并后续模块，不要依据本文旧的“S1之外不做”限制否定用户随后确认的开发范围。

# 交给本地 Codex 的统一提示词

你接手 Savor 微信小程序的 S1“身份与缓存分区”候选版本。请先审查代码再测试，并按证据修复明确回归。不要仅照抄交付报告中的 PASS。

## 事实与边界

- 固定本地工程：`E:\HuaweiMoveData\Users\HUAWEI\Desktop\savor-latest\savor-mp`，分支 `fix-9.13`。
- 本批合并基线为 `4daeb2e`，已包含用户恢复正式 UI、移除 K1/VP1 和调整 Map 卡片开关的提交。
- Tab 按钮切换微抽动经用户决定暂缓，不要继续排查，不恢复 K1、VP1 或任何失败实验。导航、五 Tab 端点、480ms 和 Map 新样式不得回归。
- 本轮只做 S1：账号 bootstrap、身份分区、草稿/outbox/异步保护、旧数据恢复和导入导出边界。没有双人绑定、Wishlist 或商家扩展任务。
- 云端部署、权限调整、删除文件、Git commit/push、套餐升级都未授权，先报告并询问。不要擅自创建集合或部署。

## A. 安全接入交付

1. 先记录 `git status --short --branch`、`git rev-parse HEAD`、本机未提交变更，并备份。禁止 reset --hard、整目录覆盖或换回旧 ZIP。
2. 如果 S1 已在本地工程，直接审查；若未应用，使用交付的 `savor-s1-4daeb2e.patch`：先 `git apply --check <补丁路径>`，通过后再 `git apply <补丁路径>`。补丁以 4daeb2e 为基线，包含新增文件。
3. 如果本地 HEAD 有更新、check 失败或有未提交重叠，停止自动应用，逐文件三方合并并保留用户变更。全量源码 ZIP 仅供比对，不整目录覆盖。
4. 阅读 `docs/history/S1_IMPLEMENTATION_PROGRESS.md`、`docs/history/S1_DEPLOYMENT_AND_ROLLBACK.md`、`docs/history/S1_IDENTITY_CACHE_CONTRACT.md` 顶部状态更新和本提示词。

## B. 独立源码审查

优先阅读：
- cloudfunctions/account/{index,handler}.js
- cloudfunctions/mealRecords/index.js
- miniprogram/utils/{identity,identityPartitions,legacyRecovery,store,cloudRecords,photos}.js
- app.js、i18n.js、五个页面、Sheet、identity-gate、pages/account
- tools/{verify-identity,verify-identity-runtime,identity-fixture}.cjs

必须核验：
1. 授权只来自真实 getWXContext；expectedUserId 是需要服务端比对的上下文，不是信任的客户端身份。
2. account 映射并发/错误重试不换用户 ID，不输出其他账号资料；客户端不能直接访问账号映射集合。
3. 旧键和 legacyQuarantine 不删除、不覆盖；新信封写失败不激活会话，未知格式不能重置。
4. 冷启动/前台重验失败保守锁定；缓存用户 ID 不能充当登录凭证。
5. 所有云写、同步、照片与页面回调防跨账号写回。特别检查 App.onShow 与原生选择器回调顺序；resumeNative 只能给同一已重新验证账号恢复原生选择器结果，绝不能用于云响应/outbox 提交。
6. 确认旧服务端握手失败发生在餐食写入前，不能仅在写完后检查响应。
7. 未知旧新建请求仅 owner-scoped 查询结果，NOT_FOUND 不等于可重放。确认凭据必须属于本人记录和具体操作。
8. 导入/复制不携带外国云 ID、共享权限、私有媒体或操作身份，不自动上传；不静默覆盖云资料。
9. 当前完整分区导出是保全文件，不可自动重放其中队列。旧备份导出需要敏感性确认。
10. 本机照片 GC 目前保守保留，不能恢复“仅扫描当前账号后删除全部文件”的实现。

发现实现漏洞或实际功能回归时修复，并为具体失败补测试。不能删除安全门控、把断言改成恒真、用扩大权限换通过、关闭已有测试，或者仅更新 hash 掩盖意外 UI 改动。修复超出上述范围时先询问。

## C. 自动测试

记录 Node/npm 版本、commit、dirty diff 和时间，运行：

```powershell
npm run verify:all
```

该命令包含 `npm run verify:identity`。必要时分别运行：

```powershell
node tools/verify-identity.cjs
node tools/verify-identity-runtime.cjs
```

- verify-cloud 的 identity-fixture 是“已知会话”的历史业务 fixture，不是身份安全测试。
- verify-identity-runtime 使用真实 identity/store/service/mealRecords handler + mock SDK，必须单独阅读其覆盖和缺漏，必要时补反例。
- 重点补测：App.onShow + picker 回调、后台归来重验失败、A 的超时请求在 B 时返回、A→B→A、冷启动离线、存储损坏/满、版本错配、导出隐私边界、旧草稿内容/评分/照片保留。
- 如样式 hash 需要调整，只能对应经确认的 S1 变化，记录具体原因及 diff，不能动用户最新 Map 按钮样式。

## D. 微信开发者工具门槛

在现有固定工程编译，不重新导入旧包。记录工具版本、实际基础库（项目配置与本机 private 配置可能不同）和环境。

1. WXML/JSON/WXSS/JS 编译无错误。account 是非 Tab 页面；五个 Tab 和普通导航保持。
2. 验证 identity-gate 加载/重试/失败提示；未授权部署导致锁定是预期，不可绕过身份检查。
3. 在具备已授权的受保护云服务后，测试 Home/Add/Me/Us/Map、Sheet、Toast、账号恢复页、Map canvas 在锁定解除后的创建。
4. 测试键盘、滚动、照片/位置/文件选择器、简中/英文/系统语言、浅/暗色、Quiet 和字体放大。新页面错误文案需可读，不改用户数据语言。
5. 恢复入口确认弹窗、取消、重复操作、存储失败，均不导致自动上传、草稿被误清或跨账号显示。
6. 模拟器结果与真机结论分开；无法读取画面时明确 NOT_EXECUTED，不凭 setData 回调断言屏幕正常。

## E. 云端测试（仅获授权后）

先按 S1_DEPLOYMENT_AND_ROLLBACK.md 报告将创建/部署/检查什么，等待用户授权；不要自动部署。
获授权后验证 savor_accounts 客户端禁止直读写；dining_records 仍 owner-only 服务端访问；照片保持私有规则。
使用两个真实账号测试缺少协议/伪造预期身份/外部记录 ID/请求 ID 等反例，确保拒绝且不产生写入。不要把 OPENID、私有 cloud:// 路径、真实备份或个人资料发到公开日志。
提醒用户：受保护 mealRecords 会拒绝旧客户端，需要协调发布，不是无影响热更新。

## F. 最终报告与交还用户

生成 `S1_CODEX_TEST_REPORT.md`，至少包含：
- 实际代码基线、dirty diff、测试版本及执行环境；
- 每项 PASS / FAIL / NOT_EXECUTED 与证据；
- 新发现的问题、修复文件及回归结果；
- 未部署的事项与等待授权项；
- 仍需用户真机验证的最小清单（复用 S1_DEVICE_ACCEPTANCE.csv）；
- 是否具备“交给用户真机测试”的条件，不能直接宣称“已可发布”。

本地代码/编译门槛通过后交给用户真机测试。真实双账号、离线杀进程、私人媒体与选择器时序由用户最终验证；Tab 已知微抽动继续记录为暂缓，不要求本轮修复。

## R2 交付应用说明

- 尚未应用任何S1：使用本包的完整 `savor-s1-4daeb2e.patch`，基线仍为4daeb2e。
- 已完整应用R1交付且没有后续重叠改动：使用 `savor-s1-r1-to-r2.patch`。先 git apply --check，再应用。
- 不要同时应用两种补丁；若R1之后有修改，应审查差异并合并，不能覆盖。
- 本批身份运行时测试22项，新增陈旧bootstrap/finalizer、设备偏好污染、隔离区结构验证。进度按 PROJECT_PROGRESS.md 分门槛记录。
