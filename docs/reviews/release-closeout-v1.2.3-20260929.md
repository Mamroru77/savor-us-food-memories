# Release Closeout — Savor Us v1.2.3（2026-09-29）

[返回文档导航](../README.md) · [项目首页](../../README.md) · [CHANGELOG](../../CHANGELOG.md)

本文件是 **v1.2.3 发布收尾**的索引：仓库审计、本地清理、文档更新、验证矩阵与发布动作。
它是发布审计文档，不是功能开发记录。

- 分支：`integrated-with-cloud`
- 基线（audit 前 HEAD）：`b40b85c` `docs: record deferred tab transition twitch`
- 上一生产提交：`305e1f1` `perf: reduce tab transition overhead and warm morph endpoints`
- 目标版本：`v1.2.3`
- 上一已发布版本：`v1.0.0`（tag 指向 `b2509c4`）

---

## 1. 发布前审计（Phase 0）

| 检查 | 结果 |
| --- | --- |
| `git status --short` | 空（working tree clean） |
| `git branch -vv` | `* integrated-with-cloud b40b85c [origin/integrated-with-cloud]`，ahead/behind **0/0** |
| local HEAD vs remote HEAD | `b40b85c3138f301b33a771feb92107cfd58c1c88` == `b40b85c3138f301b33a771feb92107cfd58c1c88` |
| `git diff --check` | exit 0，无空白错误 |
| `git ls-files` | 645 个 tracked 文件 |
| `git tag --list` | `v1.0.0`、`v1.0.0-r4`、`v1.0.0-r5`（**无** `v1.2.3`，无冲突） |
| `git remote -v` | `origin https://github.com/Mamroru77/savor-us-food-memories.git` |
| `git clean -ndX`（被忽略） | `.cli/`、`.superpowers/`、`.workbuddy-ai/{archive,memory,scratch,worktrees,wt-add.log}`、`project.private.config.json`、`reports/` |
| `git clean -nd`（未跟踪） | `.codex-doc-read/`、`cloudfunctions/mealRecordsUi2Test/`（**两者均为空目录**） |

审计结论：基线干净且与远端一致，可以继续。

### 1.1 关键发现：仓库内不存在 1.2.x 版本痕迹

审计发现计划的版本号前提与仓库事实不一致，已向用户确认后按**真实版本**处理：

- `package.json` 的 `version` 原为 `1.0.0`（`private: true`，无第三方依赖）。
- `project.config.json` / `miniprogram/project.config.json` **没有** `version` / `versionName` 字段。
- 远端 tag 仅有 `v1.0.0`、`v1.0.0-r4`、`v1.0.0-r5`；**不存在** `v1.2.0` / `v1.2.1` / `v1.2.2`。
- 全仓库唯一的 `1.2.2` 出现在 `cloudfunctions/account/package-lock.json`，是第三方依赖
  `@cloudbase/database@1.2.2` 的版本，且被 `tools/verify-audit-repairs.cjs` 显式断言
  —— **与本项目版本号无关，未改动**。

**决定**：`package.json` 版本 `1.0.0 → 1.2.3`（唯一真正代表当前发布版本的字段）；
Release History 只列真实存在的 `v1.2.3` 与 `v1.0.0`，**不补写不存在的中间版本**。

### 1.2 关键发现：`spawnSync` 假红是本机宿主限制

`npm run verify` 首次执行报 `355/359`，4 项失败：`[J]`、`[K]`、`[SUB] verify-tabbar.cjs`、
`[SUB] verify-assets.cjs`。诊断过程：

1. 两个子验证器**单独执行均 PASS**（`verify-assets.cjs` → EXIT 0；`verify-tabbar.cjs` → 21/21 EXIT 0）。
2. 探针复现：`spawnSync(process.execPath, [...])` 返回 `status=null`、`error.code=EBUSY`，
   stdout/stderr 长度为 0；换 `cmd.exe`、`git`、系统 Node 驱动**同样 EBUSY**。
3. 交叉验证：Python `subprocess.run` 派生子进程**正常**（`rc=0`）⇒ 不是沙箱整体限制，是
   **Node 同步子进程拿不到 piped stdin** 的宿主限制。
4. 项目 `MEMORY.md` §3 已记录该现象与既有 shim。

**结论：不是仓库缺陷，不是测试失败。** 用既有 shim 后 `verify` 恢复 `359/359 PASS` / EXIT 0。
本机验证必须带 shim（见 §5）。

---

## 2. 目录扫描与分类（Phase 1）

| 分类 | 内容 |
| --- | --- |
| A. PRODUCT | `miniprogram/**`（207 个文件，构成主包）、`project.config.json` |
| B. SOURCE | `tools/assets/**`（图标溯源、marker SVG）、`tools/_gen/**`、`tools/lib/locale-translations.tsv` |
| C. TEST | `tools/verify-*.cjs`、`tools/lib/checks.cjs`、`tools/analyze-*.cjs`、`tools/capture-*.cjs` |
| D. DOCS | `README.md`、`CHANGELOG.md`、`docs/**`、`archive/README.md` |
| E. FIXTURE | `tools/fixtures/**`（含 `fixtures/regression/` 的 16 个原始基准） |
| F. GENERATED（策略要求跟踪） | `miniprogram/images/icons/lucide/*.png`、`miniprogram/images/markers/*.png`、`miniprogram/utils/locales.js` |
| G. LOCAL_DEV | `project.private.config.json`、`.cli/`、`.workbuddy-ai/memory/`、`.workbuddy-ai/scratch/map-perf/` |
| H. SCRATCH | `.workbuddy-ai/scratch/**` 中的 probe / log / before-after 快照 |
| I. CACHE | `.workbuddy-ai/scratch/{pyenv,cloudcheck,deploy}/`、`reports/**` |
| J. ARCHIVE | `archive/legacy-handoff/**`、`.workbuddy-ai/archive/**` |
| K. UNKNOWN | 见 §3.3 |

### 2.1 `cloudfunctions/mealRecordsUi2Test/` 的判定

`git ls-files` 中**不存在**该路径 ⇒ 未被跟踪。磁盘上为空目录 ⇒ 判定为遗留空目录，
用 `rmdir`（仅删除空目录）移除。`docs/guides/development.md` 中对该目录的提及已同步更新。

---

## 3. 本地冗余清理（Phase 2）

**原则：Safe Local Archive —— 只 `mv`，不 `rm`；`rmdir` 仅用于空目录。永久删除 0 项。**
归档目标：`.workbuddy-ai/archive/2026-09-29-release-closeout/`（已被 `.gitignore` 排除）。

### 3.1 已归档（移动前已证明无 tracked 引用）

| 路径 | 体积 | 性质 | tracked 引用 |
| --- | --- | --- | --- |
| `reports/` | 451 MB | DevTools 自动化 JSON、真机截图与 trace | 见 §3.2 |
| `.workbuddy-ai/scratch/pyenv/` | 33 MB | 本地 Python venv | 0 |
| `.workbuddy-ai/scratch/cloudcheck/` | 57 MB | 云函数 `node_modules` 安装产物 | 0 |
| `.workbuddy-ai/scratch/deploy/` | 57 MB | 已下载的云函数 `node_modules` | 0 |
| `.workbuddy-ai/scratch/video-2b/` | 25 MB | 临时视频 | 0 |

`reports/` 的引用情况（移动前逐一核对）：被 `README.md`、`docs/guides/development.md` 及
`docs/history/*` 共约 15 处**以散文形式**引用（如 `reports/morph-adaptation-validation.json`）。
**不存在任何 markdown 链接形式**（`](reports/...)` 命中 0）。这些引用是历史时点的证据说明，
且 `reports/` 本就被 `/reports/` 忽略、从不随仓库分发 ⇒ 已取得用户明确批准后归档，
归档后其历史路径说明保留原样（它们记录的是当时证据存放位置）。

### 3.2 移除的空目录

| 路径 | 操作 |
| --- | --- |
| `.codex-doc-read/` | `rmdir`（空） |
| `cloudfunctions/mealRecordsUi2Test/` | `rmdir`（空，且未被跟踪） |

### 3.3 明确保留（未移动，作为 UNKNOWN / 有意保留上报）

| 路径 | 体积 | 保留理由 |
| --- | --- | --- |
| `.workbuddy-ai/worktrees/release-v1.0.0/` | 78 MB | `git worktree list` 中**已注册**的 worktree（detached HEAD @ `b2509c4`）。移除需要 `git worktree remove`（即真实删除文件），与项目「禁 `rm`」约定冲突 ⇒ 经用户确认后**保持不动**。 |
| `.workbuddy-ai/scratch/map-perf/` | 2.9 MB | **含 `node-sync-stdin-shim.cjs`**，是本机跑 `verify` 的必需依赖。 |
| `.workbuddy-ai/scratch/{zoom-stepper,tabbar}/` | 8.7 MB | 被 `docs/reviews/*` 以路径形式引用 ⇒ 不作为无引用冗余处理。 |
| `.workbuddy-ai/scratch/{rc5,avatar2,identity,git-recovery,...}` | — | 既有归档报告已判定保留（真机读取产物 / 唯一副本）。 |
| `.superpowers/` | 453 KB | 已被忽略；含 Stage 6/7 计划与设计规格（`docs/superpowers/` 有跟踪副本）。 |
| `.cli/` | 6 KB | 微信开发者工具 CLI 状态，本机开发辅助。 |
| `project.private.config.json` | 593 B | 私有开发者工具配置，已被忽略，属 G. LOCAL_DEV。 |

### 3.4 本机未发现的模式

`__pycache__/`、`*.pyc`、`Thumbs.db`、编辑器 swap（`*.swp` / `*~`）在仓库内**均未出现**；
`.DS_Store` 仅存在于已归档的 `scratch/**/node_modules/**` 内，随父目录一并归档。

### 3.5 清理效果

| 指标 | 前 | 后 |
| --- | --- | --- |
| `.workbuddy-ai/scratch/` | 196 MB | **26 MB** |
| 项目根目录 `reports/` | 451 MB | **不存在** |
| 项目根目录未跟踪空目录 | 2 | **0** |

---

## 4. `.gitignore` 更新（Phase 3）

新增**仅本地垃圾模式**，未忽略任何 `tools/`、`docs/`、`fixtures/`、`tests/`、`assets/` 内容：

- OS 文件：`.DS_Store`（原有）、`Thumbs.db`（原有）、`ehthumbs.db`、`Desktop.ini`
- 编辑器：`*.swp`、`*.swo`、`*~`、`.idea/`
- Python 本地工具：`__pycache__/`、`*.py[cod]`、`.venv/`、`venv/`
  （`tools/build-map-icons.py` 仍被跟踪，未受影响）
- 本地 scratch / 临时：`scratch/`、`tmp/`、`temp/`、`.cache/`、`*.tmp`

保留原有关键行 **`/reports/`**：`tools/verify-structure.cjs` 断言 `.gitignore` 中存在该行。

**误伤验证**：tracked 文件中 `.log` / `.tmp` / `.cache` / `.swp` / `.env` / `.venv` / `.pyc`
均为 **0 个** ⇒ 新增规则不会隐藏任何已提交文件。

---

## 5. 验证矩阵（Phase 8）

本机必须带 stdin shim（见 §1.2）：

```bash
NODE_OPTIONS="--require <repo>/.workbuddy-ai/scratch/map-perf/node-sync-stdin-shim.cjs" npm run verify
NODE_OPTIONS="--require <repo>/.workbuddy-ai/scratch/map-perf/node-sync-stdin-shim.cjs" npm run verify:all
```

| 门禁 | 结果 |
| --- | --- |
| `npm run verify` | **359/359 checks passed**，`FINAL STATIC VALIDATION: PASS`，**EXIT 0** |
| `npm run verify:all` | **EXIT 0**（36 条顶层命令，`verify:r2` 再展开 16 条） |
| `node tools/verify-structure.cjs` | 6/6 PASS |
| `git diff --check` | exit 0 |

### 5.1 包体统计

| 指标 | 值 |
| --- | --- |
| 主包文件数 | 207 |
| 精确字节 | **1,658,679 B** |
| MiB | **1.581840 MiB** |
| 距软警告 1.70 MiB | 123,900 B ≈ 0.118 MiB |
| 距硬上限 1.90 MiB | 333,615 B ≈ 0.318 MiB |
| 距微信平台 2 MB | 438,473 B ≈ 0.418 MiB |

> 1.90 MiB 是本项目自留安全余量；**微信官方限制是 2 MB**，不要写成 1.5 MiB。

---

## 6. 文档更新（Phase 4–7）

| 文件 | 动作 |
| --- | --- |
| `README.md` | 重写：新增「当前版本 / 主要功能 / 数据与存储 / 图片处理 / 地图 / 自定义餐饮类型 / Known Issues / Release History」，删除已过期的 v1.0.0 状态表 |
| `CHANGELOG.md` | **新建**：`v1.2.3` 与 `v1.0.0` 两个真实版本条目 + 版本号说明 |
| `docs/README.md` | 加入 v1.2.3 收尾入口与新增 review 文档索引 |
| `docs/guides/development.md` | 修正已移除的 `mealRecordsUi2Test` 提及；补充本机 stdin shim 说明 |
| `docs/status/PROJECT_PROGRESS.md` | 顶部加入「本文件已被 v1.2.3 收尾取代」的状态横幅 |
| `docs/status/UNIFIED_ACCEPTANCE.md` | 同上 |
| `package.json` | `version` `1.0.0 → 1.2.3` |

### 6.1 关于 Canvas / Morphicons 实验的状态标注（Phase 5 要求）

必须在文档中防止未来开发者误判实验方案仍在生产路径。经代码核实（`git grep`）：

- `miniprogram/vendor/morphicons-core.js` **确实仍在生产路径**：被
  `components/morph-icon/index.js`（TabBar 图标）与 `utils/morphEngine.js` 引用。
  ⇒ **不能**声称 Morphicons 已整体移出生产。
- Phase 2 的 **Canvas renderer / `MORPHICONS_FULL` runtime / upstream spring / real rAF+dt /
  velocity** 实验**已全部回退**，四个文件逐字节回到 2B 之前；实验套件移到
  `.workbuddy-ai/archive/phase2-experiment-20260928/`（未删）。
- Phase 1D 的 label 双层方案**已按用户决定 REVERT**。
- 生产**保留**的是 Phase 1A（publish dedupe）与 Phase 1C（endpoint warmup）= 提交 `305e1f1`。
- TabBar 抽动本身状态为 **DEFERRED**（`KNOWN_ISSUE`），**不是已修复**。

状态标注已落在 [tabbar-phase2e-20260928.md](tabbar-phase2e-20260928.md)（`DEFERRED` /
已被排除的假设表）与本文件；`README.md` 的 Known Issues 段落同步。

---

## 7. 提交与发布（Phase 9–15）

本轮原则：**不修改生产业务代码**。审计确认文档/构建正确性**不需要**改动生产代码，
因此 `miniprogram/`、`cloudfunctions/`、`tools/` 的代码文件**零改动**。

| 提交 | 类型 | 内容 |
| --- | --- | --- |
| A | `docs:` | `README.md`、`CHANGELOG.md`、`docs/**`、`package.json` 版本 |
| B | `chore:` | `.gitignore` |

- 未使用 `amend` / `rebase` / `squash` / `--force` / `--force-with-lease`。
- Tag：`v1.2.3`（annotated），指向本收尾的文档提交。
- GitHub Release：`Savor Us v1.2.3`，**非 draft、非 pre-release**。
- Release assets：仓库**没有**可复现的正式 artifact 流程 ⇒ 只发布 tag / source / release notes，
  **不**凭空生成 APK / IPA / wxapkg，也不打包整个工作目录。
- 未部署微信云函数、未上传微信小程序版本、未修改云数据库。

提交哈希与 release URL 以 GitHub Release 页面与 `v1.2.3` tag 为准。

---

## 8. 安全确认

- no force push
- no amend
- no rebase
- no squash
- no cloud deploy
- no WeChat version upload
- no database modification
- 本地清理 **永久删除 0 项**（全部 Safe Local Archive）
