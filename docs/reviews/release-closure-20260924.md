# Release Closure — 2026-09-24

长期导航文档 · 仓库：`savor-audit-repairs-20260915`
范围：7 个真机问题全部 CLOSED 之后的收尾（Final Cleanup → 本地提交 → fast-forward push → 文档整合）

> 本文是**索引**，只给结论与数字。根因、证据、被证伪的假设一律见下方三篇长期 RCA 文档，
> 此处不复制正文。

---

## Outcome

最终关闭的问题（真机验证 + 仓库验证双绿）：

| # | 问题 | 长期文档 |
| --- | --- | --- |
| 1 | Historical identity partition（`blocked` / `CACHE_MISSING` 永久不可自愈） | `./identity-partition-migration.md` |
| 2 | Add native-return race（选完照片 `STALE_IDENTITY` → 静默丢图） | `./add-native-return-fix.md` |
| 3 | Profile / avatar lifecycle（Sheet 被身份刷新连累关闭 → 请求与回调丢失） | `./avatar-final-rca-and-fix.md` |
| 4 | Full-resolution custom avatar（`chooseAvatar` 只给 132×132 衍生图 → 无高清入口） | `./avatar-final-rca-and-fix.md` |
| 5 | Custom-avatar native-return race（选到高清原图却 `STALE_IDENTITY`，原图从未落盘） | `./avatar-final-rca-and-fix.md` |

收尾动作：

- 移除全部临时诊断埋点（纯内存 trace 模块、`wx.__savorAvatarTrace`、`identity.js` 的临时
  verify trace、根目录遗留的 CLI 探测转储）；`miniprogram/` + `tools/` 零残留，
  **没有为了删埋点而删掉任何测试覆盖**。
- 本地产物卫生：`.gitignore` 仅追加两条**锚定**规则（`/.workbuddy-ai/`、`/.superpowers/`；
  必须锚定，因为 `docs/superpowers/plans/` 是被跟踪的）。
- 文档整合：15 篇阶段性 RCA / trace / repair 原稿 → 4 篇长期文档（本索引 + 3 篇 RCA）。
  原稿**保持未跟踪、未删除**。

---

## Final commits

分支 `integrated-with-cloud`：

```
0c8ae68  fix: support historical identity partitions
e39c2ee  fix: resume Add photo picker after identity verification
612e3ed  fix: support reliable full-resolution custom avatars
a7ddc98  chore: ignore local agent session artifacts
```

| # | SHA | 文件数 | 定向验证 |
| --- | --- | --- | --- |
| 1 | `0c8ae68` | 2 | `verify:identity` / `verify:store-boundaries` / `verify:workspace` |
| 2 | `e39c2ee` | 3 | `verify:add-native-return` / `verify:avatar` / `verify:identity` |
| 3 | `612e3ed` | 11 | `verify:avatar` / `verify:sheet-edits` / `verify:native-flow` / `verify:profile-sync` / `verify:identity` |
| 4 | `a7ddc98` | 1 | `.gitignore`（纯 ignore 规则，不影响运行时） |

文件数合计 2 + 3 + 11 + 1 = **17**，与提交前审计的 17 个 tracked-modified **完全一致**
（无遗漏、无夹带）。Commit 3 不拆分：`index.wxml` 引用新文案 key ⇒ 必须与 `locales.js`
同 commit；该入口绑定 `onAvatarCustomRequest` ⇒ 必须与组件同 commit；该 handler 调用
`chooseLocal` ⇒ 必须与 `avatar.js` 同 commit；而 `verify-sheet-edits.cjs` 一个文件同时覆盖
「sheet 保留」与「自定义头像 native-return」两条链。

---

## Verification

最终全量（在 4 个 commit 之后、工作区无生产改动时执行）：

| 命令 | 结果 |
| --- | --- |
| `npm run verify` | **355/355**，`Static verification passed.`，`FINAL STATIC VALIDATION: PASS` |
| `npm run verify:all` | **EXIT 0**（2 m 24 s），日志内 0 条 `✗` / 0 条 `FAIL` / 0 条 `npm ERR` |
| `git diff --check` | **PASS**（exit 0，无输出） |
| `git fsck --connectivity-only` | **无阻塞错误**：exit 2 仅由 62 个 dangling 对象 + 4 行历史 `invalid reflog entry` 构成；`missing = 0` / `corrupt = 0` / 无 pack 加载错误 ⇒ 连通性完好 |

- **package size：`[SIZE] package size 1.48 MB (release target 1.5 MB)`** ✅
  （门禁只统计 `miniprogram/`，本地 scratch 不计入；贴近上限，后续新增资源需留意）
- `verify:all` 连跑两次日志 **SHA-1 字节一致** ⇒ 验证确定性；`verify:icons` 重跑构建器
  造成的生成物重写是**内容中性**的。
- `verify` 计数 356 → **355** 的唯一原因是移除了一个源文件（少一条语法检查）；
  **未修改任何 expectation，未刷新任何无关 approved hash / baseline**。
- 冻结闸门：`miniprogram/pages/me/index.js` 实算 SHA-256 与
  `tools/lib/reviewed-me-memory-return.cjs` 的 `approvedSha256` 一致。

---

## Device acceptance

| 链路 | 结论 |
| --- | --- |
| Identity | `blocked → verified` 迁移 **PASS**（真机只读探针：`locked true → false`、`totalKeys 2 → 5`、partition 未被改写、修复只发生一次） |
| Add | native picker **PASS**（相册 / 相机 / 取消 / 连续选择 / 前后台切换；`STALE_IDENTITY` 出现 0 次） |
| Avatar | 微信头像 **PASS**；自定义高清头像 **PASS**，目视确认**清晰**；Save 后生效；stale-owner 保护保持；Add 不回归 |

真机取证设备：OPPO PKB110 / Android 16（只读探针；未 clearStorage、未人工写 key）。

**证据来源区分**（两类来源不互相冒充）：

- **设备日志证据**（有原始原稿逐项记载）：Identity 的迁移结论（`blocked → verified`、
  `totalKeys 2 → 5`、partition 未被改写）；Avatar 的 132×132 衍生图、6 700 982 B 高清原图、
  `STALE_IDENTITY` 落点、q80 不降采样实测。
- **项目所有者验收（project-owner verified）**：`Real-device acceptance: PASS` ——
  修复后自定义头像目视清晰、Save 后 kill/relaunch 仍为新图、Add A–E 五个场景。
  这些结论由项目所有者在真机上实际执行并确认，**没有**独立设备 trace 记录，
  因此**不表述为**「trace proves …」。

---

## Git integration

```
remote old tip:  b8dbed5785b800b47857c540775709884eca09e5
remote new tip:  a7ddc98f4696280ac7825fea2461520e6e6a5fc2
push:            b8dbed5..a7ddc98  HEAD -> integrated-with-cloud
                 （纯 fast-forward；未使用 force / force-with-lease / merge / rebase / reset）
```

```
PUSH_COMPLETE = YES
REMOTE_MATCHES_LOCAL = YES
```

- 推送前远端 tip 严格等于 `b8dbed5…`、本地 HEAD 严格等于 `a7ddc98…`；
  推送后 `git ls-remote` 与远端 `HEAD` 均为 `a7ddc98…`，与本地一致（ahead/behind = `0 0`）。
- 待推送范围严格线性：4 个 commit、**0 个 merge**、父链 `0c8ae68^ == b8dbed5…`（无缝衔接）、
  远端独有提交 0。
- **未 deploy。**
- 两条被取代的旧判断（勿再引用）：① 本机 `git` 曾长期不可用 —— 真实原因是仓库元数据损坏
  （`.git/refs/` 目录缺失 + pack 数据文件缺失），已修复，现 `git` 正常；② 早期报告称
  `git add -A` 会把 113 个 `archive/legacy-handoff/**` 记录成删除 —— **该判断是错的**，
  这些条目带 `skip-worktree` 标记，git 不报告其缺失，`git add -A --dry-run` 实测 0 命中。

---

## Long-term RCA links

- [`./avatar-final-rca-and-fix.md`](./avatar-final-rca-and-fix.md) — 头像链路四个独立缺陷、
  被证伪的假设、最终架构合同、真机验收、回归覆盖
- [`./identity-partition-migration.md`](./identity-partition-migration.md) — 历史分区迁移矩阵、
  marker existence contract、数据保全保证、真机迁移证明
- [`./add-native-return-fix.md`](./add-native-return-fix.md) — Add 照片 native-return 竞态、
  生命周期合同、为什么不动 identity

---

## 状态更新（2026-09-24 晚 · 后续核查追加）

> 本节为**追加**内容，不改写上文。上文「未 deploy / 未提交审核」描述的是收尾当时的事实。

- **微信审核：已提交，审核中。** 项目所有者在体验版上传（版本号 `1.0.0`）之后，于微信公众平台
  提交了审核。来源为**项目所有者确认**；提交审核发生在微信公众平台，**不在开发者工具 CLI 能力内**，
  因此本仓库与本地工具链**无法独立取证**。**尚未正式发布。**
- **云函数：未部署，且本轮没有可部署对象。** `b8dbed5..c74309f` 对 `cloudfunctions/` **零改动**
  （最近一次云函数提交为 2026-09-16 的 `f037748`）⇒ 本轮不存在待部署的云函数变更。
- **GitHub Release：`v1.0.0` 已创建。** 2026-09-24 于 GitHub 创建 Release（**挂到已存在的 `v1.0.0` 标签，
  未新建或移动 tag**；非 draft、非 prerelease，已标记为 **Latest**），说明文本取自本文结论摘要并链回本目录的
  3 篇 RCA。此前远端仅有 `v1.0.0-r4`（2026-09-19 创建并发布，作者 `Mamroru77`，target `integrated-with-cloud`），现已保留。
- 分支 `integrated-with-cloud` 在其后新增两个 **docs-only** 提交并 fast-forward 推送：
  `8400351`（README 丰富）、`cf2dfc2`（docs 导航索引补齐）；**tag 未移动**。
