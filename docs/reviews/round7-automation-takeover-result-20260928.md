# 真机诊断：自动化通道接管结果（round7）

**时间**：2026-09-28 00:12–00:25
**HEAD**：`8bf5a65`（未 amend / 未 push / 未 deploy）
**结论**：**CLI 与 IDE 通道已接管成功；但 DevTools 的 automator 未挂载，因此真机探针无法执行。**
**未做任何生产改动**；冻结哈希与开工时逐字节一致。

---

## 1. 已完成的部分（全部为本机 127.0.0.1）

| 步骤 | 结果 |
|---|---|
| 发现 CLI | `DEVTOOLS_CLI=D:\software data\微信web开发者工具\cli.bat`（`where cli.bat` 亦命中；未改 PATH） |
| 项目根 | `E:\…\savor-audit-repairs-20260915`（含 `project.config.json`，appid `wx65867b5568b82996`） |
| 服务端口 27946 | **LISTENING on 127.0.0.1** |
| `cli islogin --project … --port 27946 --lang zh` | **exit 0**，`{"login":true}` |
| `cli --help` / `cli auto --help` | 已按本机实际输出核对参数（**未盲抄**）；`auto` 确实支持 `--auto-port` / `--trust-project` / `--port` / `--lang` |
| `cli auto --auto-port 9420 --trust-project --port 27946 --lang zh` | **exit 0**，`{"autoPort":9420,"requestedAutoPort":9420}` |
| 自动化端口 9420 | **LISTENING** |
| `check_wechatide_status` | `loginExpired:false`、`skillVersion:0.3.11`、`versionRelation:"equal"` |
| `open_project_window` | `{"success":true,"type":"reuse","winId":"s0"}` |
| `simulator_screenshot` | **成功**（227×488；截图显示 Home 页正常渲染） |
| `automation_viewport_action --action remote` | `{"success":true}` |
| `miniprogram-automator` | **已在托管 workspace 中可用** ⇒ **未安装任何依赖、未改 `package.json`** |
| 直连 `ws://127.0.0.1:9420` | **websocket 握手成功** |

---

## 2. 阻塞点：automator 未挂载

**所有需要运行时的工具都返回同一个错误：**

```
timeout waiting for automator response
```

实测受影响的工具（均非参数问题，参数已按 `tools.yaml` 核对）：

| 工具 | 结果 |
|---|---|
| `automation_runtime_info --action systemInfo` | timeout |
| `automation_runtime_info --action pageStack` | timeout |
| `automation_runtime_info --action currentPage` | timeout |
| `automation_evaluate`（最小只读探针） | timeout |
| 直连 `miniprogram-automator.connect({wsEndpoint})` | **连接成功**，随后 `page.evaluate` → timeout |

**关键区分**：websocket **连得上**（说明端口与握手都正常），但**每一条请求都超时** ——
所以问题在 **IDE 的 automator 没有挂到任何运行时**，不在客户端、不在参数、不在端口。

按 `wechat-devtools-cli-automation` 技能记录的同一症状：
> 真机未连接时，`automation_*` 系列一律报 `timeout waiting for automator response`；
> 而 `get_simulator_console` / `simulator_screenshot` 仍然可用 —— **别把这个当成「已连接」**。

**与本次实测完全吻合**：`simulator_screenshot` / `simulator_refresh` / `open_project_window` 全部成功，
唯独需要运行时的工具全部超时。

### 已排除的原因

| 假设 | 排除依据 |
|---|---|
| 端口不对 | 9420 LISTENING；ws 握手成功 |
| 参数写错 | 已按 `tools.yaml` 的 `inputSchema` 逐项核对（`project` + `action` 两个必填项） |
| 未启动自动化 | `cli auto` exit 0 且返回 `autoPort:9420` |
| 项目窗口未开 | `open_project_window` 返回 `reuse` / `winId: s0` |
| 客户端未授权 | 通道 A 未返回 `pending`；`check_wechatide_status` 正常 |
| 需要重编译 | `simulator_refresh` 成功后再试，**仍然超时** |
| 测试号缺失 | `automation_testaccount list` → `accounts: []`（**空**）；但 `getTicket` 能返回一张未过期 ticket ⇒ 无法据此单独定性，见下 |

---

## 3. 因此**拿不到**的东西（如实说明）

- ❌ **真机 console**：`get_simulator_console` 按技能记录**不跟随真机**，只读模拟器缓冲区；
  实测该缓冲区**为空**（`grep -c .` → 0 字节）。所以你在手机上看到的
  `[avatar] copy COPY_FAILED` / `[avatar] write WRITE_FAILED` **我一条都没取到**。
- ❌ Scene A / B / C 的探针执行（都需要 `automation_evaluate`）。
- ❌ `auditMedia` 的真机运行结果。
- ❌ Android `chooseMedia` / `compressImage` 返回的 source 语义（`wxfile://` / `http://tmp/` 等）。

**没有任何一条证据被我标成真机结果** —— 上面所有成功项都标 `DEVTOOLS_SIMULATOR`。

---

## 4. 需要你在 IDE / 手机上做的一件事

automator 需要**一个已附加的运行时**。按技能里记录过的同类处置：

1. **确认手机上的小程序正在运行**（不是被划掉/关闭的状态）。
   技能记录：手机上关闭小程序会断 JS 运行时；**硬重启后真机调试会话会自动恢复，无需重新扫码**。
2. 若真机调试会话已断，在 IDE 里**重新进入「真机调试」**并让手机重新连上。
3. 完成后告诉我，我立即重跑：
   - `automation_runtime_info --action systemInfo`（用来判定目标是 `android` 还是 `devtools`）
   - 之后才能按顺序跑 Scene A / B / C 的探针与 `auditMedia`。

**我不会替你做这些**：不改 DevTools 安全设置、不动测试号、不重新扫码。

---

## 5. 本轮遵守的禁止事项（逐条）

| 禁止项 | 状态 |
|---|---|
| 读取/输出 MCP Token | ✅ 未读取。`check_wechatide_status` 返回的 `mcpTokenRequired` 仅作布尔记录，**未取用任何 token 值** |
| 要求提供 token | ✅ 未要求 |
| token / 登录票据写入项目 | ✅ 未写。`getTicket` 的返回值**未落盘、未回显** |
| 修改 DevTools 安全设置 | ✅ 未改 |
| 暴露端口到局域网/公网 | ✅ 全部 `127.0.0.1`（27946 / 9420） |
| upload / deploy | ✅ 未执行 |
| 清 Storage | ✅ 未执行 |
| 清缓存并编译 | ✅ 未执行（只用了普通 `simulator_refresh`） |
| 删除 `USER_DATA_PATH` 文件 / 自动删照片 | ✅ 未执行（`auditMedia` 本轮根本没跑起来） |
| 自动改数据库 | ✅ 未执行 |
| 改生产代码 | ✅ 未改（见下） |
| 留下 background 进程 | ✅ 我的脚本全部 `process.exit()`；`cli auto` 的服务在 IDE 内部，非我持有的进程 |

**注意**：`check_wechatide_status` 的返回里含 `loginUser.openid` / `headUrl` —— 我没有把它写进任何文件，
也不会在后续报告里引用。若你希望我以后连这类字段也一并屏蔽，我可以加一层脱敏。

---

## 6. 冻结状态

```
HEAD                                  8bf5a65
photos.js                             e9e1e11d8d66a1b0   （与开工时一致）
avatar.js                             01b8ec6b3c3ac962   （一致）
photoTrace.js                         4aa266fa530b0214   （一致）
profile-editor/index.js               202c030e3345a4e6   （一致）
mapMarkers.js                         08cfa9ddbdc255bc   （一致）
pages/map/index.js                    ddef7401e929ef6f   （一致）
verify-image-pipelines.cjs            33d326f59de3c623   （一致）
```

项目树：18 项未提交（round7 的 17 项 + 本轮的 runbook），**没有新增任何项目文件**。
本轮产物全部在 gitignored 的 `.workbuddy-ai/scratch/wechat-devtools/`：
`devtools.cjs`（CLI 双通道驱动）、`connect-devtools.cjs`（automator 直连）、`sim2.png`（模拟器截图）。

---

## 7. 一个顺带确认的可用性事实（对以后有用）

**本机 `spawnSync` 无法给子进程 piped stdin**（`EBUSY`），这会**同样打中 DevTools CLI 驱动**：
第一版 `cli()` 用默认 stdio 直接 `EBUSY`，改成 `stdio: ['ignore','pipe','pipe']` 后立刻正常。
⇒ 以后任何从 Node 调 `cli.bat` / 外部进程的脚本，都要显式写这个 stdio。
