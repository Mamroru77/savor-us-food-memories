# 开发与验证指南

[返回项目首页](../../README.md) · [文档导航](../README.md)

## 本地运行

- 在微信开发者工具导入仓库根目录的 `project.config.json`，不要导入历史归档。
- 前端位于 `miniprogram/`，云函数位于 `cloudfunctions/`；本轮未改变这两个目录及项目配置。
- 使用获授权的 AppID / 云环境。当前配置和 `miniprogram/utils/runtimeConfig.js` 必须一致；迁移环境涉及缓存隔离，不能只修改一个值。
- 私有开发者工具配置保留在本机，由 `.gitignore` 排除。不要为运行成功而跳过身份校验或放开云端权限。

## 验证与云部署的区别

在根目录运行 `npm run verify:all`。这是静态、模拟与源代码契约检查，不会代替真实设备或两账号验收。

`cloudfunctions/` 包含 `account`、`mealRecords`、`media`、`placeLookup`、`spaces`、`workspace`，以及测试目录 `mealRecordsUi2Test`。不要对目录进行无差别批量部署；尤其不要默认部署测试函数。

如后续需要云部署，应另行确认目标环境、函数依赖、环境变量、私有 ACL、数据备份和回滚方案。**本次目录整理没有部署任何云函数，也没有修改数据库或用户数据。**

## 文件归属

| 内容 | 位置 |
| --- | --- |
| 当前进度与验收 | `docs/status/` |
| 审计与修复结论 | `docs/reviews/` |
| 设计稿与独立 HTML / SVG 预览 | `docs/design/` |
| 历史方案及阶段说明 | `docs/history/` |
| 回归读取的历史基准 | `tools/fixtures/regression/` |
| 构建输入（图标溯源、marker SVG），不进主包 | `tools/assets/` |
| 原生运行记录、截图、备份 | `reports/`，仅本地 |
| 早期远端交接包 | `archive/legacy-handoff/` |

除明确可点击的相对链接外，文档中的代码路径按仓库根目录理解。历史报告中的本机路径与证据路径是历史记录，可能只在原工作机上存在。

## 重新生成 marker / stamp PNG（可选，不属于验证）

`python tools/build-map-icons.py` 是 **asset regeneration tool**：它不在 `npm run verify:all` 中，日常验证与提交**不需要**本机具备 Cairo 环境。
只有改动 `tools/assets/markers/*.svg`、`docs/design/landmark-*.svg` 或 `miniprogram/images/icons/lucide/*.svg` 时才需要重跑。
依赖：Python 3 + `cairosvg`（含 Pillow）；`cairosvg` 还需要**系统级 Cairo runtime**（Windows 上是 `libcairo-2.dll`）。
它从 `tools/assets/markers/` 读 SVG，并把 PNG 写回 `miniprogram/images/markers/`。

## 提交前

1. 运行 `npm run verify:all`，保留失败日志并修复后重新验证。
2. 检查 `git status` 和暂存差异，确认没有密钥、个人数据、运行截图或测试导出副本。
3. 新增测试所需文件必须纳入版本管理，不要让验证依赖被忽略的 `reports/`。
4. 提交到 `integrated-with-cloud`，正常推送；若远端已前进，先处理差异，不使用强制推送覆盖他人历史。
