# 仓库清理与交接台账 — 2026-10-01

本轮性质：**仓库卫生 + 知识交接**。未改产品 UI、未改文案、未重构生产代码、未推进任何检查点、
**未 commit / 未 push / 未 deploy**。

配套文档：[当前状态入口](../README.md) · [AI 协作规则](../../AGENTS.md) ·
[开发与验证指南](../guides/development.md)

---

## A. DELETED FILES

**全部为未跟踪的本地临时产物**（`.workbuddy-ai/scratch/**`，gitignored）。**没有删除任何被跟踪文件。**
每一项在删除前都用仓库级搜索证明「无 docs / tools / miniprogram / package.json 引用」。

| 路径（`.workbuddy-ai/scratch/` 下） | 类别 | 证明可删 |
|---|---|---|
| `verify-all.log`, `verify-all-final.log`, `final-verify-all.log`, `final-verify-8d.log`, `phase0-verify-all.log`, `precommit-verify-all.log`, `precommit-feat-verify-all.log`, `postcommit-verify-all.log`, `postcommit-verify-all2.log`, `postcommit1-verify-all.log`, `round2-verify-all.log`, `round2-verify-all-final.log`, `round3-verify-all.log`, `round4-verify-all.log`, `round4-verify-all-final.log`, `round5-verify-all.log`, `dining-verify-all.log`, `dining-verify-all2.log`, `dining-verify-all3.log`, `dining-verify-all-final.log`, `summary-verify-all.log`, `summary-final.log`, `schema-final.log`, `schema-final2.log`, `normalize-final.log`, `dining-final.log`, `e2e-red.log`, `e2e-red2.log`, `font-audit.log`, `package-audit.log` | 已完结轮次的验证日志 | 0 引用；内容为当时一次性输出 |
| `blobs.txt`, `blobs2.txt`, `blob-status.txt`, `blob-status.err`, `idx-err.txt` | 一次性调试转储 | 0 引用；可随时重新生成 |
| `commit-msg-feature.txt`, `commit-msg-docs.txt`, `checkpoint-msg.txt` | 一次性提交信息草稿 | 0 引用；对应提交已存在于历史 |
| `extract-fonts.cjs`, `font-audit.cjs`, `package-audit.cjs`, `idx-store.js`, `compress-memory-2d.py`, `compress-memory-2e.py`, `fix-memory-2d.py`, `update-memory-2f.py`, `revert-2bcd.py` | 一次性脚本 | 0 引用；任务已完成 |
| `task-a/`, `task-a2/`, `task-b/`, `task-b2/`, `precommit/`, `rc5/`, `budget-probe/`, `upload-gate/`, `removed-diagnostics/`, `schema-fixed/`, `readme-work/`, `gitrecovery/`, `git-recovery/`, `identity/`, `avatar2/`, `morphicons-upstream/`, `map-p02/` | 已废弃的临时工作目录 | 0 引用；`map-p02` 的日志属已完成轮次且报告未引用它 |

**删除总量：40 个条目，约 79 MB。**

**另删除（生成物，非证据）**：`.workbuddy-ai/archive/**` 下 **13 个 `node_modules` 树（约 377 MB）**。
它们是 2026-09-29 发布收尾证据运行时**安装的依赖**，不是证据本身（证据是那些 JSON/日志），
且可由 `npm install` 完全重建。归档目录本身保留。

---

## B. ARCHIVED FILES

散落在 scratch 顶层的**报告类**文件按 brief 的「历史材料优先归档而非删除」归入：

新位置：`.workbuddy-ai/archive/2026-10-01-hygiene-consolidation/scratch-reports/`

| 原路径 | 新路径 | 保留理由 |
|---|---|---|
| `.workbuddy-ai/scratch/round1-root-cause-report.md` | 同左新目录 | 解释当时根因结论的形成过程 |
| `.workbuddy-ai/scratch/round2-red-green-report.md` | 同上 | RED/GREEN 证据过程 |
| `.workbuddy-ai/scratch/round3-closeout-report.md` | 同上 | 收口记录 |
| `.workbuddy-ai/scratch/round4-closeout-report.md` | 同上 | 收口记录 |
| `.workbuddy-ai/scratch/round5-r1-revert-report.md` | 同上 | 记录一次**回退**决策的理由 |
| `.workbuddy-ai/scratch/precommit-check-report.md` | 同上 | 提交前检查记录 |
| `.workbuddy-ai/scratch/normalize-rule-report.md` | 同上 | 规则归一化记录 |
| `.workbuddy-ai/scratch/dining-types-report.md` | 同上 | 餐饮类型特性记录 |
| `.workbuddy-ai/scratch/dining-type-server-loss-report.md` | 同上 | 服务端数据丢失调查 |
| `.workbuddy-ai/scratch/summary-fix-report.md` | 同上 | 汇总修复记录 |
| `.workbuddy-ai/scratch/release-notes-v1.2.3.md` | 同上 | v1.2.3 发布说明草稿 |

**归档 11 个文件。**

---

## C. CONSOLIDATED DOCUMENTS

| 旧文档 | 规范替代 |
|---|---|
| `docs/README.md`（旧版：只列到 2026-09-29 的 v1.2.3 收尾，**完全没有** 09-30 / 10-01 的工作） | **已重写**为当前状态入口：冻结页矩阵、未决项、验证状态、真机状态、结构、历史去向、交接包链接 |
| 散落在 `docs/` 根与 `docs/reviews/` 的逐轮报告（未删除） | 保持原位作为历史证据；由新的 `docs/README.md` §7/§11 统一索引，不再被当作当前状态 |
| 无 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`（三者此前**都不存在**） | **新建 `AGENTS.md`**（仅稳定规则，不含状态/日期/TODO） |

未新建「目录森林」：仓库原有的 `docs/{status,reviews,design,history,guides,superpowers}` 结构是连贯的，
本轮只新增 brief 明确要求的 `docs/handoff/`。

---

## D. KEPT DESPITE LOOKING OLD

| 路径 | 依赖 / 历史理由 |
|---|---|
| `miniprogram/pages/morph-lab/**` | **已从 `app.json.pages` 注销**（发布卫生），但 `tools/verify-cloud.cjs` 仍读取它的 `pairs`。删除会打红验证。 |
| `tools/fixtures/regression/lifecycle-review-20260916/**` | 不可变历史 fixture：`reviewed-me-memory-return.cjs` 把当前 `MENU_ROWS` 投影到它上面。 |
| `tools/fixtures/regression/ui-baseline.json` | 哈希链第一环（原始摘要）。 |
| `tools/fixtures/regression/ui-approved-updates.json` | 哈希链第二环。 |
| `tools/assets/icons/lucide/SOURCES.json` / `SOURCES.md` | 图标注册表**来源清单**；`verify-icons.cjs` 逐条断言 URL + sha256。 |
| `tools/lib/locale-translations.tsv` | 本地化**唯一来源**；`build:locales` 的输入。 |
| `docs/design/0.savor-concept.png` | 设计基准图，程序化测量（1 concept px = 2.508 rpx）依赖它。 |
| `docs/design/*.svg` / `*.png` | `tools/verify-icons.cjs` 的 `stampPixelChecks` 会核对这些资产的 sha256。 |
| `VID_1.mp4` | 多份历史报告标注为**用户保护**文件；且是本轮从 HEAD 还原的对象之一。 |
| `archive/**`（114 个跟踪条目） | `docs/guides/development.md` 与 `docs/README.md` 都链接它；`verify-structure.cjs` 断言 `archive/README.md` 存在。 |
| `.workbuddy-ai/archive/2026-09-29-release-closeout/reports/` | `docs/guides/development.md` 明确记录为「只 `mv` 未删除」的归档位置。 |
| `.workbuddy-ai/scratch/map-perf/node-sync-stdin-shim.cjs` | **可复用诊断工具**：本机所有 spawn 类套件都靠它绕过 EBUSY(-4082)。7 处引用。 |
| `.workbuddy-ai/scratch/{us-p11,me-p12,map-p03,map-p01,map-final,home-final,us-final,me-final,journey,global-final,opt-pass,audit,tomb-draft,tabbar,repro-deleted-edit,round5-import,ui-refinement-audit,zoom-stepper,wechat-devtools,hardware}/**` | **被当前报告引用**的证据（截图/日志/度量脚本）。删了会造成断链。 |
| `.workbuddy-ai/worktrees/release-v1.0.0` | **已注册的 git worktree**（detached HEAD `b2509c4`）；移除属 git 操作，未获授权。 |

---

## E. GENERATED FILES

| 来源 | 生成物 | 再生成命令 |
|---|---|---|
| `tools/lib/locale-translations.tsv` | `miniprogram/utils/locales.js` | `npm run build:locales` |
| `miniprogram/images/icons/lucide/*.svg` + `tools/assets/icons/lucide/SOURCES.json` | `miniprogram/utils/icons.js`、`miniprogram/utils/lucideMorphNodes.js`、`tools/_gen/icons.json` | `node tools/build-icons.cjs` |
| `tools/assets/markers/stack-button-*.svg` | `miniprogram/images/markers/*.png` | `tools/build-map-icons.py` |

生成物一致性由 `npm run verify:icons` 断言（重跑生成器 + 逐字节比对，drift 必须为 0）。

---

## F. CURRENT CANONICAL DOCUMENT SET

> **更新（2026-10-02）**：模型专属交接层（`CODEX-HANDOFF-20261001.md` /
> `CODEX-6.1-SOL-QUICKSTART.md`）已删除，不再属于 canonical 文档集。下表为**当前**实际集合。

| 用途 | 文件 |
|---|---|
| **当前状态入口（START HERE）** | `docs/README.md` |
| **仓库稳定规则** | `AGENTS.md` |
| **本轮清理台账** | `docs/handoff/REPOSITORY-CLEANUP-20261001.md`（本文件） |
| 开发与验证指南 | `docs/guides/development.md` |
| 总进度 / 验收边界 | `docs/status/PROJECT_PROGRESS.md`、`docs/status/UNIFIED_ACCEPTANCE.md` |
| 权限恢复的完整证据与裁决 | `docs/reviews/permission-recovery-20261001.md` |

---

## G. CURRENT OPEN ITEMS

> **更新（2026-10-02）**：权限恢复已按真机结果接受 **RELEASE WAIVER**，
> **不再列为发布阻塞**（见 `docs/README.md` §3/§5 与 `docs/reviews/permission-recovery-20261001.md` §20）。

| 类别 | 项 |
|---|---|
| **发布阻塞** | **无** |
| **已裁决（非阻塞）** | 权限恢复 — RELEASE WAIVER ACCEPTED；永久拒绝在受测设备上 NOT REPRODUCIBLE |
| **已收口（2026-10-02）** | Add 检查点推进（权限恢复）—— ✅ 已注册；`verify:cloud` 272/272 EXIT 0，五页 MATCH |
| **需人工控制台核对** | CloudBase 控制台的函数版本、索引与集合权限（仓库工具无法证明） |
| **非阻塞** | Me 头像恢复入口（只审计未改）；首次选中 10.6 MB 旧图的二次下载 |

---

## H. VERIFICATION RESULTS

| 命令 | 结果 |
|---|---|
| `npm run verify` | **EXIT 0 · 359/359 · FINAL STATIC VALIDATION: PASS** |
| `npm run verify:all` | **EXIT 1（预期红）** — 见下 |
| `npm run verify:structure` | EXIT 0（清理后复验；清理前因 `archive/README.md` 缺失而为红） |
| 其余 `verify:*` | 全部 EXIT 0 |

### EXPECTED RED（如实报告，不隐藏）

- **套件**：`verify:cloud`
- **文件**：`miniprogram/pages/add/index.wxml`
- **原因**：权限恢复合法改动了 Add 冻结页（`wxml` + `wxss`），按冻结页规则**检查点未推进**。
  注册值 `10f6501a…` / `df572eae…`；现场 `a9e772e5…` / `a5bcba93…`。
- **这是预期红，不是回归。** 清理**没有引入**任何新失败。
- 该红在**第一个链节**就中断 `verify:all`，因此 `verify:all` 只跑到 6 条顶层脚本；
  其余套件已逐个单独验证为绿。

### 清理的连带修复

本轮开始前，工作树里 `VID_1.mp4` 与 `archive/README.md` 已被（非本轮的）删除，
导致 `verify:structure` **红**。已 `git checkout --` 从 HEAD 还原两者 ⇒ `verify:structure` 转绿。
`archive/legacy-handoff/**`（113 文件）带 **skip-worktree** 位，属**设计如此**的本机缺省（见 `archive/README.md`），
**未**还原。

### 链接与引用检查

| 检查 | 结果 |
|---|---|
| 全部 `docs/**` + 根 md 的 markdown 链接 | **141 条，1 条断链** —— `release-closeout-v1.2.3-20260929.md` 里的 `reports/...` 占位符，**清理前即存在** |
| 文档引用的 `.workbuddy-ai` 路径（排除本报告自身的「旧→新」对照表） | **61 条，6 条不存在** —— 全部指向 `docs/reviews/release-closeout-v1.2.3-20260929.md`（**2026-09-29 的既有报告**，那些目录在本轮之前就已缺失）；另 2 条是正则截断产生的假路径 |
| 归档文件在新位置 | **11/11 存在** |
| 归档报告的原路径 | 仍出现在本报告的 §B 对照表中，且为**反引号代码串、不是链接** ⇒ 不构成断链 |
| ⇒ **本轮清理引入的断链 / 失效引用** | **0** |

### 重复的规范文档

`find docs -maxdepth 2 -iname README.md` → 仅 `docs/README.md` 一份。**无重复入口。**

### 生成物一致性 / 语言 / 图标 / 结构

| 检查 | 结果 |
|---|---|
| 图标生成漂移 | `verify:icons` EXIT 0 — 51 official SVGs / 29 aliases，重跑生成器逐字节一致 |
| 语言生成漂移 | `npm run verify` EXIT 0（内含 catalog ⇄ TSV 的严格比对） |
| 页面注册 | `verify:structure` EXIT 0 — 6/6 |
| 检查点链完整性 | `verify:cloud` —— **预期红**（见上） |
| `package.json` 脚本 | `verify` 359/359 PASS；67 条 `verify:*` 全部存在且可解析 |


---

## I. FINAL GIT STATUS

- 分支 `integrated-with-cloud` · HEAD `0de3e468e273edc04fb392f2b64574e6f76d29d3`
- **暂存区为空**（`git diff --cached` 无输出）
- 工作树 **不干净**：**48 个已修改跟踪文件 + 35 个未跟踪条目**，**0 个待删除**
- **本轮只改动 1 个跟踪文件**：`docs/README.md`（重写为当前状态入口）。
  其余 47 个修改来自此前各轮（Home/Map/Us/Me/Add 的 UI 与工具改动）。
- 本轮新增未跟踪：`AGENTS.md`、`docs/handoff/`（3 份文档）
- 体积：`.workbuddy-ai` **797 MB → 417 MB**（−380 MB）；`.workbuddy-ai/archive` 624 → 257 MB；
  `.workbuddy-ai/scratch` 95 → 83 MB；`scratch` 条目 ~90 → **22**（全部为被引用项）
- **未 commit / 未 push / 未 deploy；未推进任何检查点哈希；未重写 git 历史。**
