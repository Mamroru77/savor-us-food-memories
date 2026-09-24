# Savor · 食光记忆

一个以美食回忆为核心的微信原生小程序：记录一餐、在地图上回看足迹，并在明确授权的前提下与伙伴分享。

**技术栈**：微信小程序 · JavaScript / WXML / WXSS · 微信云开发（CloudBase） · Node.js 回归工具

> 当前维护分支：[`integrated-with-cloud`](https://github.com/Mamroru77/savor-us-food-memories/tree/integrated-with-cloud)。
> **运行入口是仓库根目录的 `project.config.json`，不是 `archive/` 中的旧项目。**

## 当前状态（2026-09-24）

| 项目 | 状态 |
| --- | --- |
| 真机问题 | **7 项全部 CLOSED**（身份分区迁移、Add 原生返回竞态、头像与高清自定义头像链路） |
| 发布线 | `v1.0.0` 已打标签并推送（annotated，指向 RC5 提交 `b2509c4`；`v1.0.0-r5` 指向同一提交）；[GitHub Release v1.0.0](https://github.com/Mamroru77/savor-us-food-memories/releases/tag/v1.0.0) 已创建并标记为 Latest |
| 微信审核 | **已提交审核，当前审核中**（项目所有者确认，2026-09-24 于微信公众平台提交；本仓库无法独立取证） |
| 静态验证 | `npm run verify` **355/355**；`npm run verify:all` **退出码 0** |
| 包体积 | **1.48 MB**（门禁：`miniprogram/` < 1.5 MB） |
| 尚未执行 | 云函数本轮**无代码改动**故未部署（最近一次云函数提交为 2026-09-16） |

完整收尾记录（提交清单、验证矩阵、真机取证、Git 集成）见 [Release Closure 2026-09-24](docs/reviews/release-closure-20260924.md)。

## 功能概览

| 页面 | 内容 |
| --- | --- |
| Home · 首页 | 美食日记、近期回忆与每周统计 |
| Map · 地图 | 地点检索、餐馆选点、回忆标记与卡片浏览 |
| Add · 记录 | 照片、餐馆、评分与用餐记录，保留未提交草稿 |
| Us · 我们 | 双人空间、共同回忆与心愿清单 |
| Me · 我的 | 个人资料、偏好、云端工具与年度报告入口 |

包含共用底部面板、提示反馈、浅色 / 深色主题、中英文及 Quiet 动效设置。身份校验、私有数据边界、主动分享与媒体授权是业务前提；功能代码存在不等于真实云端或双账号验收完成。

九类业务能力均已有实现并被仓库回归覆盖：可信身份与私人缓存分区、双人空间邀请与绑定、主动文字共享与独立评分、共同心愿清单、私有照片共享与媒体生命周期、云端备份 / 导入 / 任务恢复、云档案与偏好同步、年度报告与分享、一次性提醒与私有云工单反馈。业务入口在 Me 页的「云端工具」「年度报告」等二级页，不占用五个 Tab。

## 目录结构

```text
.
├── README.md                 # GitHub 项目首页（本文件）
├── project.config.json       # 微信开发者工具导入入口
├── package.json              # 验证与资产生成命令
├── miniprogram/              # 当前小程序：页面、组件、样式、工具与资产
├── cloudfunctions/           # 当前云函数；本次整理不部署云端
├── tools/                    # 验证、生成与诊断工具
│   ├── lib/                  # 共享校验库、词表与冻结闸门
│   └── fixtures/regression/  # 必需的历史回归基准（16 个原始文件）
├── docs/
│   ├── README.md             # 文档导航
│   ├── guides/               # 当前开发与运行说明
│   ├── status/               # 总进度、统一验收清单
│   ├── reviews/              # 审计、修复、视觉迭代记录（含 4 篇长期 RCA）
│   ├── design/               # 设计参考与独立预览
│   ├── history/              # 早期方案、阶段记录与旧 README
│   ├── superpowers/          # Stage 6/7 改造计划与设计规格
│   └── mcp-*.md              # R2 / R4 / R5 / R7 阶段收口报告（历史证据）
└── archive/
    └── legacy-handoff/       # 原分支的旧源码、参考图、视频及交接材料
```

本机还可能存在 `reports/`、`.cli/`、`node_modules/` 和 `project.private.config.json`。这些是本地证据、工具状态、依赖或私有配置，不作为当前项目文件提交。

## 快速开始

### 1. 获取项目

```bash
git clone --branch integrated-with-cloud https://github.com/Mamroru77/savor-us-food-memories.git
cd savor-us-food-memories
```

仓库保留了历史图片和视频，完整克隆会下载这些归档。它们不属于当前小程序的运行目录。

### 2. 导入微信开发者工具

1. 使用微信开发者工具打开仓库根目录，识别 `project.config.json`。
2. 确认 `miniprogramRoot` 为 `miniprogram/`，`cloudfunctionRoot` 为 `cloudfunctions/`。
3. 使用获授权的项目成员账号，核对 AppID、云环境和数据库权限；不要将测试数据写入生产环境。
4. 编译并从五个主页面验证基础流程。连接云端需要对应权限，Git 克隆不会授予云环境访问权。

当前运行策略为正常模式。不要为了绕过校验而改动身份边界、缓存命名空间或云端权限。详细步骤见 [开发与验证指南](docs/guides/development.md)。

### 3. 运行回归

本地回归工具只使用 Node.js 内置模块，根 `package.json` 不声明第三方依赖；请准备带 npm 的受支持 Node.js 版本。云函数依赖另行管理。

```bash
npm run verify:all   # 全量门禁：31 条顶层命令，其中 verify:r2 再展开 16 条
npm run verify       # 静态主检查，当前 355/355
```

按关注点速查：

| 关注点 | 命令 |
| --- | --- |
| 身份与运行边界 | `verify:identity`、`verify:store-boundaries`、`verify:workspace` |
| 头像与未保存编辑 | `verify:avatar`、`verify:sheet-edits`、`verify:profile-sync` |
| 原生返回与页面生命周期 | `verify:add-native-return`、`verify:native-flow`、`verify:page-lifecycle`、`verify:memory-return` |
| 地图、二级页与视觉语言 | `verify:map-motion`、`verify:map-save`、`verify:secondary-ui`、`verify:visual-language` |
| 云契约与业务模拟 | `verify:cloud`、`verify:spaces`、`verify:media` |
| 资产、结构 | `verify:assets`、`verify:icons`、`verify:structure` |

资产生成命令会写入文件，只在需要时执行：

```bash
npm run build:locales   # 在 tools/lib/locale-translations.tsv 追加词条后生成语言资源
npm run build:icons     # 修改图标源后生成资源
```

`verify:structure` 会校验 README 与文档导航中的本地链接是否可达，并断言回归基准仍为 16 个原始文件。回归通过不代表已完成微信真机、双账号权限或线上云端验收。

## 发布与冻结基线

- 分支 `integrated-with-cloud`；本轮修复由 6 个提交构成（`0c8ae68` → `c74309f`），全部 fast-forward 推送，未使用 force / rebase / reset。
- 标签：`v1.0.0` 与 `v1.0.0-r5` 均指向 RC5 提交 `b2509c4`（**不是**其后的文档提交）；更早的 `v1.0.0-r4` 保持不变。
- 微信侧：体验版上传（版本号 `1.0.0`）之后**已提交审核，当前审核中**（项目所有者确认），尚未正式发布。
- 云函数：本轮 6 个提交对 `cloudfunctions/` **零改动**（最近一次云函数提交为 2026-09-16），因此未执行部署。
- GitHub Release：[`v1.0.0`](https://github.com/Mamroru77/savor-us-food-memories/releases/tag/v1.0.0) 已创建（Latest，挂到已存在的 `v1.0.0` 标签，未新建 tag）；更早的 `v1.0.0-r4`（2026-09-19）保留。
- 收尾期间冻结功能重构：如需改动，先补回归再动生产代码。

## 真机验收

| 链路 | 结论 |
| --- | --- |
| Identity | `blocked → verified` 历史分区迁移 PASS（真机只读探针：`locked true → false`、存储键 2 → 5、partition 未被改写、修复只发生一次） |
| Add | 原生选择器 PASS（相册 / 相机 / 取消 / 连续选择 / 前后台切换；`STALE_IDENTITY` 出现 0 次） |
| Avatar | 微信头像 PASS；自定义高清头像 PASS（目视清晰、Save 后生效、stale-owner 保护保持、Add 不回归） |

证据来源被显式区分：设备日志证据与项目所有者验收结论不互相冒充。自动化通过不能替代设备证据；[Stage 0–7 独立验收报告](Stage0-7-Independent-Verification-Report-2026-09-22.docx) 保留修复前的原始 FAIL 判定，作为问题发现与整改依据，不代表当前 HEAD 的自动化状态。

## 关键架构合同

这三条是修复中确认的边界，绕过它们会重新引入已关闭的问题：

- **身份分区**：缓存分区归属由「marker 是否存在」判断，而不是 JS 真值；marker 存在但版本不符时 fail-closed（`CACHE_MISSING`），不建分区、不写盘、不落 established。详见 [身份分区迁移](docs/reviews/identity-partition-migration.md)。
- **原生返回**：系统选择器会让小程序退到后台，`App.onShow` 的 `identity.verify()` 会推进 epoch 并作废当前会话；任何原生回调必须在页面重新可见之后再恢复租约并落盘，且每条原生操作各持自己的 waiter 与请求序号。详见 [Add native-return 修复](docs/reviews/add-native-return-fix.md)。
- **头像链路**：微信头像按钮与相册高清图两个入口汇入同一个 `AvatarAsset`，只有显式 Save 才写资料；`persistPhoto` 不做降采样是刻意设计，不要用提高压缩质量的方式去「恢复」清晰度。详见 [头像最终 RCA](docs/reviews/avatar-final-rca-and-fix.md)。

## 文档索引

以 [文档导航](docs/README.md) 为总入口，优先阅读：

- [开发与验证指南](docs/guides/development.md)
- [总进度](docs/status/PROJECT_PROGRESS.md)、[统一验收清单](docs/status/UNIFIED_ACCEPTANCE.md)
- 长期 RCA：[Release Closure](docs/reviews/release-closure-20260924.md) · [头像](docs/reviews/avatar-final-rca-and-fix.md) · [身份分区](docs/reviews/identity-partition-migration.md) · [Add native-return](docs/reviews/add-native-return-fix.md)
- 视觉迭代记录：[visual-language-20260916](docs/reviews/visual-language-20260916.md)

历史文件中的「最新」、实验方案和部署提示仅反映记录当时，不覆盖当前状态。

## 数据安全与仓库约定

- 不提交令牌、密钥、`.env`、本机配置、真实运行日志、用户截图或预览二维码。
- `reports/` 整体忽略；回归必须依赖已提交的 `tools/fixtures/`，不能依赖本机报告。
- 不自动清库、迁移用户数据、重置存储键或修改共享权限。
- 文本文件统一使用 LF 行尾（`core.autocrlf=false`，无 `.gitattributes`），请勿把它当缺陷批量改写。
- 旧资料集中在 `archive/legacy-handoff/`，只做归档、不作为部署入口。本轮移动不清洗既有 Git 历史；旧归档沿用此前已提交内容。
- 新增文档放入对应的 `docs/` 子目录，避免再次堆积在根目录。

更多入口见 [文档导航](docs/README.md) 与 [历史归档说明](archive/README.md)。
