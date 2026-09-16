# 官方审计问题修复候选 — 2026-09-15

## 状态与边界

**本轮 8 组审计问题已完成本地候选修复。正常模式已准备，但交付默认仍为 diagnostic，未启用正常启动验证或 outbox 发送。**

这不是历史 `ACCOUNT_UNAVAILABLE` 根因修复声明。该次真实异常仍缺少具体失败表达式/异常对象证据；不能把离线通过等同云端或真机成功。

- 基于原审计提交 `88c2c5e7d7981deb8cccc3819eb8ea3fe5d865a7`。
- GitHub 后续 `4ed88068bdbb5f38d53909d97133b53d53c36adf` 仅新增 account.zip，业务源码未变。
- 修复工作目录：`/home/user/audits/wechat-identity-20260914/repair/`。
- 原审计 source、收到的 account.zip、原工程均保留不动。
- 没有 GitHub push、云部署、真实 bootstrap/handshake、数据库查询/写入、规则修改、运行时/超时修改、真实缓存操作。

## 1. 已修复的问题

| # | 问题组 | 修复 | 主要文件 |
|---|---|---|---|
| 1 | 单 key 聚合超过 1 MB，迁移与增长缺少安全写入机制 | V2 按用户分区、32K UTF-16 单位分块；先写 journal/新块，最后写小型 manifest 提交。旧版本在提交前保持可读；失败残片留 journal，下次写入恢复。缺块/校验失败/已建立分区丢失 manifest 均阻断，不自动复活旧队列。outbox 只保存一份，读取时恢复兼容形状 | `utils/chunkStorage.js`、`utils/identityPartitions.js` |
| 2 | 同 userId 跨云环境复用本地分区 | 存储 namespace 包含 AppID+环境；v1 仅能从明确的历史 namespace 迁移。其他环境得到独立分区/隔离区；外层身份 lease 与原生选择器恢复也校验 namespace；本地照片与 workspace 文件同样区分环境，原环境路径保持兼容 | `utils/runtimeConfig.js`、`identityPartitions.js`、`photos.js`、`workspace.js`、`sharedMedia.js` |
| 3 | 诊断冻结未覆盖所有业务边界 | workspace/spaces/media、临时图片 URL、地点查询加入冻结检查；会创建待发送 intent 的公开入口也在本地持久化之前阻断，避免“未发送却留下新待重试操作” | `utils/cloudRecords.js`、`workspace.js`、`spaces.js`、`sharedMedia.js` |
| 4 | 默认诊断与正常运行配置混在启动逻辑中 | 新增唯一构建期 runtimeConfig；默认 diagnostic，只有显式 normal 才放行。App 不再无条件重置诊断状态；再次 enableDiagnosis 不能重置已经使用的一次尝试。没有界面/存储/服务端响应解锁开关 | `utils/runtimeConfig.js`、`identity.js`、`app.js` |
| 5 | SDK 安全日志丢失已知分类；诊断 hash catch 改变原异常语义 | 补齐所读 SDK 的通用/数据库数值码映射；SYS_ERR 保持 unknown，不猜成 duplicate。白名单只匹配 own property，不接收 constructor 等原型属性。保留有限安全字段，不输出 message/stack；hash 异常记录阶段后继续抛出，恢复原 handler 的异常边界语义 | `cloudfunctions/account/handler.js` |
| 6 | 身份组件销毁后，迟到 Promise 仍可能 setData | attached/detached 生命周期编号与存活标记同时校验；迟到的订阅通知、失败回调与重新 attached 前的旧任务均不能更新新生命周期 | `components/identity-gate/index.js` |
| 7 | Home 后台无必要更新、整份历史传输、冻结被误提示为网络故障 | 延迟普通后台刷新，onShow 重新取最新 store；身份变化/锁定时仍立即清空敏感视图，不能为性能牺牲隔离。列表只传 ID，五个 recentRows 保持原功能；内容补丁只发送变化字段。冻结/陈旧会话不再提示成 Cloud sync unavailable | `pages/home/index.js` |
| 8 | account 依赖范围版本且没有可复现锁文件 | wx-server-sdk 固定为已核验的 2.4.0；从原包依赖记录生成 lockfile v2，所有原有依赖路径版本保持不变；未升级 SDK | `cloudfunctions/account/package.json`、`package-lock.json` |

小程序路径默认以上表 `miniprogram/` 为前缀。

**没有改动**：APPID+OPENID 的 SHA-256 算法、随机稳定 userId、where/get 数组读取、add({data})、先 account 再 handshake 再接纳的顺序、服务端身份权威、Tab 导航逻辑、Map 动画、任何 WXML/WXSS 或图片/字体资产。

### 额外修正的既有测试记录

原分支 `verify-cloud` 第一项本来就失败：Home WXML 的已存在 `id="identity-gate"` 未同步到 `ui-approved-updates.json`。已验证**只去掉这一个非视觉属性，哈希就与旧记录完全一致**。本轮只同步该记录与解释，没有改 Home WXML、没有跳过/删除测试，也没有将其标作新的原生视觉验收。

## 2. 存储变更的安全说明

### 单 key 与总配额

微信官方 [setStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.setStorageSync.html) 的单 key 1 MB 与总量 10 MB 是不同约束。

- 每块最多 32,768 个 UTF-16 单位，边界避开有效 emoji/补充字符的代理对，不向原生字符串接口发送拆开的代理对；即使每个单位都按 JSON 最坏情况转义，单块也远低于 1 MB。
- manifest/journal/已建立标记都是小值，不再放整个用户列表或日记。
- **总量仍受 10 MB 限制**，并且 copy-on-write 提交前需要新旧版本同时存在。本轮没有承诺无限缓存，也不会为腾空间删除旧数据；空间不足时保留旧提交并明确失败。
- FNV 校验只用于检测意外损坏，**不是身份认证或加密**。身份仍由服务端结果和 handshake 决定。

### 迁移与回收

- `savor-diary-v1`、`savor-draft-v1`、`savor-identity-partitions-v1` **不覆盖、不删除**。
- 仅在当前账号通过 handshake 后，读取该账号的旧分区，保留草稿、队列和未知字段，写入当前环境的 V2。
- 旧的未确认归属数据留在隔离区，不自动成为当前日记，不自动发送。
- 程序的 `removeStorageSync` 只用于 **新 V2 命名空间内、已被新提交替代的旧块或未提交残片及 journal**，不清空微信缓存、不删除 legacy/v1、不碰其他用户分区。API 同步异常会被处理，参见 [removeStorageSync](https://developers.weixin.qq.com/miniprogram/dev/api/storage/wx.removeStorageSync.html)。
- 这是代码将来的运行行为；本轮只在内存替身中执行，未对任何真实用户缓存做迁移或清理。

### 回退约束

交付尚未部署，因此当前没有生产回退动作。

**若未来已产生 V2 新写入，不可直接把旧 v1 程序当成完整回退方案。** 旧 key 是迁移时的保留版本，不包含之后的 V2 编辑；回退前必须保留 V2 文件/分区，另行评审兼容读取或导出方案，不能删除新块或覆盖回旧快照。正常模式开关与数据格式版本是两件事，不能通过切模式回滚数据。

## 3. 模式配置

交付文件 `miniprogram/utils/runtimeConfig.js`：

```js
identityMode: 'diagnostic'
```

- 自动 verify 被阻断；一次显式诊断仍受一次性限制。
- 即使合成/未来真实诊断成功，诊断状态也不会自动解除。
- 正常模式由同一套身份/handshake/lease 逻辑支持，离线回归通过 test-only fixture 选择 normal，不改交付默认值。
- 此处不是让用户现在切换 normal 的操作指令。实际启用可能恢复账号调用和 outbox 发送，须另行授权与验收。

## 4. 验证结果及等级

### L1/L2

完整 `npm run verify:all` 在禁网预加载保护下通过，未跳过既有 UI 哈希检查。包括：

| 检查 | 结果 |
|---|---|
| 静态主验证 | 299/299 |
| 云业务契约替身 | 233/233 |
| 延迟 Tab handoff 替身 | 74/74 |
| UI 质量回归 | 44/44 |
| 身份运行时替身 | 22/22 |
| spaces | 26/26 |
| media | 30/30 |
| workspace/report | 48/48 |
| workspace 生产适配器替身 | 5/5 |
| 新增审计修复回归 | 19/19 组 |
| 身份诊断/服务端诊断专门脚本 | PASS |
| 其他静态、图标、资产及捕获分析 self-test | 随 verify:all 通过 |

不把包含关系重叠的检查加总成一个“验收总数”。捕获脚本只执行合成 self-test，没有发起真实截图、微信 CLI/IDE 自动化或真机操作。

新增回归特别覆盖：两个合法 600KB 旧 key；中文/emoji 超 1MB 分区；journal/每个 chunk/manifest 的逐点写失败；中断残片；commit 后报错；总量满额；V1 未知字段/草稿/outbox 保留；跨环境同 userId；缺失 root 不重放旧队列；所有业务冻结且不新建 intent；正常模式与非法模式；销毁/重新挂载后的迟到回调；后台身份失效立即清屏；SDK 白名单与锁版本。

### L3

`verify:account-sdk` 直接使用收到的原包实际依赖、执行修复后的 handler/未改的 adapter，**14 组通过，网络尝试 0**。数据库传输被拦截，WX 上下文/服务响应都是合成值。

使用版本：wx-server-sdk 2.4.0 / @cloudbase/node-sdk 2.4.7 / @cloudbase/database 1.2.2；本地 Node 20.20.2。

不是对 Node 16.13、真实 SDK 请求签名、真实数据库、平台调用或微信原生行为的验证。

### L4/L5

**需要外部验证，未执行。** 真实 `ACCOUNT_UNAVAILABLE` 未定位，未声称身份恢复，未提高生产验收进度。

## 5. 可复核命令

在修复副本目录运行：

```text
npm run verify:all
```

本轮实际执行时额外通过 NODE_OPTIONS 预加载审计目录的 no-network.cjs。脚本使用假数据，不需要开发者工具、登录或真实云函数调用。

SDK 检查需要本地实际 SDK 文件，不会自动安装或下载：

```text
npm run verify:account-sdk
```

默认读取 `cloudfunctions/account/node_modules`，也可用 `ACCOUNT_SDK_ROOT` 指向已经取得的 account 原包 node_modules。本轮使用原包路径；没有在修复副本安装该依赖树。生成锁文件只执行了 `--package-lock-only --offline --ignore-scripts`，并核验原有依赖版本无变化。

锁文件并不证明平台部署工具一定遵循它；未来如获准部署，还须核对具体构建方式。其他云函数未提供实际依赖原件，本轮不拿 account 的依赖树冒充它们。

## 6. 交付与当前总进度

- 独立修复源码目录：`repair/`。
- 完整日志目录：同级 `repair-results/`。
- 同级交付目录 `deliverables/` 包含源码 ZIP、相对原审计基线的补丁及文件哈希清单。
- 源码 ZIP 不含 Git、node_modules 或收到的取证 ZIP；补丁不删除远端已有的 account.zip。
- 不要直接覆盖现有 Windows 工作目录；保留原件，在独立副本中按文件清单对照。没有获得 push 或部署授权。

**进度：8/8 审计问题组完成本地候选修复；S1–S4 仍为此前 9/9 候选实现状态。身份历史根因未解决，L4/L5 未验收，生产发布未推进。**
