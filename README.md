# Savor Us · 食光记忆

一个用于记录餐厅、美食、照片、地点与共同回忆的微信原生小程序：记下一餐、在地图上回看足迹，并在明确授权的前提下与伙伴分享。

**技术栈**：微信小程序 · JavaScript / WXML / WXSS · 微信云开发（CloudBase） · Node.js 回归工具

> 当前维护分支：[`integrated-with-cloud`](https://github.com/Mamroru77/savor-us-food-memories/tree/integrated-with-cloud)。
> **运行入口是仓库根目录的 `project.config.json`，不是 `archive/` 中的旧项目。**

## 当前版本

**v1.2.3**（2026-09-29）

| 项目 | 状态 |
| --- | --- |
| 版本 | `v1.2.3`（本页描述的版本） |
| 静态验证 | `npm run verify` **359/359**；`npm run verify:all` **EXIT 0** |
| 包体积 | **1,658,679 B = 1.581840 MiB**（项目软警告 1.70 MiB；项目硬上限 1.90 MiB；微信平台限制 2 MB） |
| 本轮改动 | **仅文档、`.gitignore` 与版本元数据**；`miniprogram/`、`cloudfunctions/`、`tools/` 生产代码零改动 |
| 云函数 | 本轮**未部署**；未修改云数据库、未上传微信小程序版本 |
| 已知问题 | TabBar 切换在部分真机上有轻微视觉抽动，状态 **DEFERRED**（见 [Known Issues](#known-issues)） |

收尾记录（提交清单、清理与验证矩阵）见 [Release Closeout v1.2.3](docs/reviews/release-closeout-v1.2.3-20260929.md)，逐版本变更见 [CHANGELOG](CHANGELOG.md)。

## 主要功能

以下功能均已在当前代码中实现并被仓库回归覆盖。

**记录与回忆**

- 美食记忆记录：照片、餐厅、评分、日期与用餐类型
- 图片添加，支持大尺寸照片（先归一化再上传）
- Add 草稿保留与**快速清除草稿**
- 记忆预览、相邻记忆浏览与照片恢复

**地图**

- 地图浏览与地图餐厅 marker
- marker 缩略图（照片优先，无真实照片时回退）
- 相邻餐厅 drawer 浏览
- 精细地图缩放控制（步进按钮 + recenter）
- 地图 POI 选点，并把选点名称同步到餐厅名称
- 编辑餐厅名称时**保留**地图选点（餐厅名与坐标相互独立）

**餐饮类型**

- 内置餐饮类型 + 自定义餐饮类型
- 多标签餐饮类型
- 隐藏（hide ≠ 删除），按 owner 分区持久化

**账号、空间与云同步**

- 用户资料 / 头像（微信头像与自定义高清头像两个入口）
- 双人空间、共同回忆与共享
- 云端同步、云端工具与年度报告
- 媒体本地缓存与回收

**界面**

- 五个主 Tab（Home / Map / Add / Us / Me）与共用底部面板
- TabBar 动效（选中态图标 morph）
- 浅色 / 深色主题、中英文、Quiet 动效设置

## 数据与存储

- **本地 durable media**：照片以本地持久化副本 + `cloud://` 图片引用两段式保存，先写本地再上传。
- **上传后释放本地副本**：上传成功后可释放重复的本地副本，避免同一张照片长期占用两份空间。
- **orphan media GC**：回收不再被任何记录引用的本地媒体文件，解决文件存储配额长期累积耗尽的问题。
- **quota 错误分类**：照片失败文案按错误自身分类，只有真正的 quota / filesystem 错误才提示「清理空间」；写入错误包装为 `CACHE_WRITE_FAILED`，原始错误保留在 `error.cause` 链上。

本仓库不记录密钥、`openid` 或云环境 ID；请使用你获授权的 AppID 与云环境。

## 图片处理

- **大图降采样**：餐厅照片与记忆照片在**上传阶段**归一化（判定依据是真实字节数），不会把原图直接推上云。
- **头像最大尺寸策略**：头像由头像链路自己降采样（`MAX_EDGE = 1024`），≤1024 的图**绝不放大**；失败明确报 `AVATAR_DOWNSAMPLE_FAILED`。
- **meal photo 上传处理**：按边缘阶梯 `[1600, 1080]` 逐级尝试，用尽则报 `UPLOAD_FAILED`。
- **上传失败隔离**：批量上传逐张 `try` + `continue`，跑完只抛**一次**聚合错误。
- **单张失败不阻塞其它照片**：某一张失败不会中断整批，其余照片照常上传。

> 刻意的不变量：`persistPhoto` 对餐厅照片**不做**降采样（头像链路的降采样由头像自己负责）。不要用「提高压缩质量」的方式去改这条边界。

## 地图

- **地图餐厅 marker**：按记录的地点投影生成，支持堆叠与单点两种形态。
- **marker 缩略图**：`placePhoto || (!noPhoto ? photo : '')` —— 灰色 marker 通常表示**该记录确实没有真实照片**，而不是加载失败。
- **相邻餐厅 drawer**：以覆盖层（`view-overlay`）方式渲染，避免拖拽时重建 markers。
- **缩放步进控制**：`scale` 属性向下取整小数，因此步进按**相邻整数级、方向感知**推进；`data.commandScale` 是唯一的命令通道，`regionchange` 绝不写它。
- **recenter**：右侧 recenter 按钮是本项目自己的控件（真机 `<map>` 不渲染原生缩放控件）。
- **POI 选点**：通过 `chooseLocation` 选点，选中的 POI 名称会同步进餐厅名称；之后**编辑餐厅文本不会删除已保存的地点**。

## 自定义餐饮类型

- **built-in**：内置类型常驻，始终可选。
- **custom**：用户自定义类型，上限 `MAX_CUSTOM = 20`，唯一事实来源是 `miniprogram/utils/diningTypeOptions.js`。
- **hidden**：隐藏是**可见性**而不是删除；历史记录仍能照常汇总。
- **multi-select**：一条记录可挂多个餐饮标签。
- **owner-scoped persistence**：按 owner 分区持久化，两个云函数的 `schema.js` 各持一份逐字节相同的 normalizer（独立包无共享模块，一致性靠回归锁定）。

## 开发与验证

本地回归工具只使用 Node.js 内置模块，根 `package.json` 不声明第三方依赖；请准备带 npm 的受支持 Node.js 版本。云函数依赖另行管理。

```bash
npm run verify       # 静态主检查，当前 359/359
npm run verify:all   # 全量门禁：36 条顶层命令，其中 verify:r2 再展开 16 条
```

按关注点速查：

| 关注点 | 命令 |
| --- | --- |
| 身份与运行边界 | `verify:identity`、`verify:store-boundaries`、`verify:workspace` |
| 头像与未保存编辑 | `verify:avatar`、`verify:sheet-edits`、`verify:profile-sync` |
| 原生返回与页面生命周期 | `verify:add-native-return`、`verify:add-identity-fence`、`verify:native-flow`、`verify:page-lifecycle`、`verify:memory-return` |
| 照片上传批次与失败分层 | `verify:photo-batch-upload`、`verify:image-pipelines`、`verify:cloud` |
| 媒体回收 | `verify:media`、`verify:media-gc` |
| 地图与视觉语言 | `verify:map-motion`、`verify:map-save`、`verify:map-zoom-stepper`、`verify:map-overlay-drawer`、`verify:secondary-ui`、`verify:visual-language` |
| 餐饮类型 | `verify:dining-types`、`verify:dining-type-schema` |
| 资产、结构与包体 | `verify:assets`、`verify:icons`、`verify:structure`、`verify:package-budget` |

资产生成命令会写入文件，只在需要时执行：

```bash
npm run build:locales   # 在 tools/lib/locale-translations.tsv 追加词条后生成语言资源
npm run build:icons     # 修改图标源后生成资源
python tools/build-map-icons.py   # 可选：由 tools/assets/ 的 SVG 重生成 marker PNG（需 Python + cairosvg + 系统 Cairo；不在 verify:all 内）
```

`verify:structure` 会校验 README 与文档导航中的本地链接是否可达，并断言回归基准仍为 16 个原始文件。回归通过不代表已完成微信真机、双账号权限或线上云端验收。

### 本机已知环境限制

在本机（Windows）上，同步子进程无法获得 piped stdin，`spawnSync` / `execFileSync` 默认 stdio 会报 `EBUSY`，从而让 `verify` / `verify-cloud` / `verify-icons` 假红。**这是宿主限制，不是测试失败，不要改测试**。用 `NODE_OPTIONS` 预载一个只把「无人使用的 stdin 管道」换成 `ignore` 的 shim 即可：

```bash
NODE_OPTIONS="--require <path-to>/node-sync-stdin-shim.cjs" npm run verify:all
```

## 项目结构

```text
.
├── README.md                 # GitHub 项目首页（本文件）
├── CHANGELOG.md              # 逐版本变更记录
├── project.config.json       # 微信开发者工具导入入口
├── package.json              # 验证与资产生成命令
├── miniprogram/              # 当前小程序：页面、组件、样式、工具与资产
│   ├── pages/                # home / map / add / us / me + account / space / workspace / reports / morph-lab
│   ├── components/           # icon、morph-icon、memory-row、sheet、toast、profile-editor 等
│   ├── custom-tab-bar/       # 自定义 TabBar
│   ├── utils/                # 业务与运行时模块
│   ├── vendor/               # 第三方运行时（含 Morphicons core 与其许可证）
│   └── images/               # 打包内图片、图标与 marker
├── cloudfunctions/           # 当前云函数；本轮未部署
├── tools/                    # 验证、生成与诊断工具
│   ├── assets/               # 构建输入（图标溯源、marker SVG），不进主包
│   ├── lib/                  # 共享校验库、词表与冻结闸门
│   └── fixtures/regression/  # 必需的历史回归基准（16 个原始文件）
├── docs/
│   ├── README.md             # 文档导航
│   ├── guides/               # 当前开发与运行说明
│   ├── status/               # 总进度、统一验收清单
│   ├── reviews/              # 审计、修复、视觉迭代记录与长期 RCA
│   ├── design/               # 设计参考与独立预览
│   ├── history/              # 早期方案、阶段记录与旧 README
│   ├── superpowers/          # Stage 6/7 改造计划与设计规格
│   └── mcp-*.md              # R2 / R4 / R5 / R7 阶段收口报告（历史证据）
└── archive/
    └── legacy-handoff/       # 原分支的旧源码、参考图、视频及交接材料
```

本机还可能存在 `reports/`、`.cli/`、`.workbuddy-ai/`、`node_modules/` 和 `project.private.config.json`。这些是本地证据、工具状态、依赖或私有配置，已被 `.gitignore` 排除，不作为项目文件提交。

## 包体预算策略

字体以 bundled（内联 WOFF）方式随包发布，不依赖任何外部字体域名。预算策略只有一处定义（`tools/lib/checks.cjs` 的 `PACKAGE_BUDGET`），由 `verify` 与 `verify:package-budget` 共用：

| 阈值 | 值 | 行为 |
| --- | --- | --- |
| `SOFT_WARNING_MIB` | **1.70 MiB** | 输出 warning，`verify` **不失败** |
| `PROJECT_HARD_LIMIT_MIB` | **1.90 MiB** | `verify` **失败** |
| 微信平台官方限制 | **2 MB**（单个主包 / 单个分包） | 平台硬限制 |

尺寸按 `miniprogram/` 全部文件的字节数 / 1048576 计算。**1.90 MiB 是本项目自留的安全余量，不是微信官方限制**；微信官方限制是 2 MB。

当前实测：

| 指标 | 值 |
| --- | --- |
| 精确字节 | **1,658,679 B** |
| MiB | **1.581840 MiB** |
| 距软警告 1.70 MiB | 123,900 B ≈ 0.118 MiB |
| 距硬上限 1.90 MiB | 333,615 B ≈ 0.318 MiB |
| 距微信 2 MB 限制 | 438,473 B ≈ 0.418 MiB |

构建输入（图标溯源、marker SVG）位于 `tools/assets/`，不进主包，由 `verify:package-budget` 强制。

## Known Issues

**TabBar transition has minor visible twitch on real device.**

```
STATUS: DEFERRED
```

部分真机在 Tab 切换时，图标 morph 仍有轻微视觉抽动。该问题**不影响导航与任何功能使用**，当前**暂停进一步处理**，不要把它当作已修复。

已经排除的方向（详见 [TabBar Phase 2E](docs/reviews/tabbar-phase2e-20260928.md)）：Morphicons core 移植（逐字节一致）、renderer 成本、motion curve（`UPSTREAM_MOTION_PARITY = PASS`）、cadence、velocity preservation、icon pair 起始几何，以及完整 Morphicons runtime。若将来重启，应转向 TabBar 外层 compositor / layout 层，**不要再改 icon morph**。

## Release History

| 版本 | 日期 | 说明 |
| --- | --- | --- |
| **v1.2.3** | 2026-09-29 | 本轮发布：图片、地图、餐饮类型与整体稳定性；文档与仓库整理。 |
| v1.0.0 | 2026-09-24 | 上一版已发布版本：真机 7 项问题收尾（身份分区迁移、Add 原生返回竞态、头像与高清自定义头像链路）。 |

> **说明**：本仓库**不存在** `v1.2.0` / `v1.2.1` / `v1.2.2` 的 tag 或版本记录；`v1.0.0-r4`、`v1.0.0-r5` 是 `v1.0.0` 的预发布迭代标签。版本号从 `v1.0.0` 直接跳到 `v1.2.3`。请勿在文档中补写不存在的中间版本。

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

## 关键架构合同

这三条是修复中确认的边界，绕过它们会重新引入已关闭的问题：

- **身份分区**：缓存分区归属由「marker 是否存在」判断，而不是 JS 真值；marker 存在但版本不符时 fail-closed（`CACHE_MISSING`），不建分区、不写盘、不落 established。详见 [身份分区迁移](docs/reviews/identity-partition-migration.md)。
- **原生返回**：系统选择器会让小程序退到后台，`App.onShow` 的 `identity.verify()` 会推进 epoch 并作废当前会话；任何原生回调必须在页面重新可见之后再恢复租约并落盘，且每条原生操作各持自己的 waiter 与请求序号。详见 [Add native-return 修复](docs/reviews/add-native-return-fix.md)。
- **头像链路**：微信头像按钮与相册高清图两个入口汇入同一个 `AvatarAsset`，只有显式 Save 才写资料。详见 [头像最终 RCA](docs/reviews/avatar-final-rca-and-fix.md)。

## 真机验收

| 链路 | 结论 |
| --- | --- |
| Identity | `blocked → verified` 历史分区迁移 PASS（真机只读探针：`locked true → false`、存储键 2 → 5、partition 未被改写、修复只发生一次） |
| Add | 原生选择器 PASS（相册 / 相机 / 取消 / 连续选择 / 前后台切换；`STALE_IDENTITY` 出现 0 次） |
| Avatar | 微信头像 PASS；自定义高清头像 PASS（目视清晰、Save 后生效、stale-owner 保护保持、Add 不回归） |
| TabBar twitch | 真机仍可见轻微抽动，**DEFERRED**（见上） |

证据来源被显式区分：设备日志证据与项目所有者验收结论不互相冒充。自动化通过不能替代设备证据；[Stage 0–7 独立验收报告](Stage0-7-Independent-Verification-Report-2026-09-22.docx) 保留修复前的原始 FAIL 判定，作为问题发现与整改依据，不代表当前 HEAD 的自动化状态。

## 文档索引

以 [文档导航](docs/README.md) 为总入口，优先阅读：

- [Release Closeout v1.2.3](docs/reviews/release-closeout-v1.2.3-20260929.md) —— 本次发布的收尾索引
- [CHANGELOG](CHANGELOG.md)
- [开发与验证指南](docs/guides/development.md)
- [总进度](docs/status/PROJECT_PROGRESS.md)、[统一验收清单](docs/status/UNIFIED_ACCEPTANCE.md)
- 长期 RCA：[Release Closure 2026-09-24](docs/reviews/release-closure-20260924.md) · [头像](docs/reviews/avatar-final-rca-and-fix.md) · [身份分区](docs/reviews/identity-partition-migration.md) · [Add native-return](docs/reviews/add-native-return-fix.md)
- 图片链路：[第 15 轮图片链路](docs/reviews/image-pipelines-round7-20260927.md)
- 地图：[精细缩放 Phase 1](docs/reviews/map-zoom-stepper-phase1-20260928.md)
- 媒体回收：[Round 8 媒体 GC](docs/reviews/round8-media-gc-20260928.md)
- 视觉迭代记录：[visual-language-20260916](docs/reviews/visual-language-20260916.md)

历史文件中的「最新」、实验方案和部署提示仅反映记录当时，不覆盖当前状态。

## 数据安全与仓库约定

- 不提交令牌、密钥、`.env`、本机配置、真实运行日志、用户截图或预览二维码。
- `reports/` 整体忽略；回归必须依赖已提交的 `tools/fixtures/`，不能依赖本机报告。
- 不自动清库、迁移用户数据、重置存储键或修改共享权限。
- 文本文件统一使用 LF 行尾（`core.autocrlf=false`，无 `.gitattributes`），请勿把它当缺陷批量改写。
- 旧资料集中在 `archive/legacy-handoff/`，只做归档、不作为部署入口。旧归档沿用此前已提交内容，不改写既有 Git 历史。
- 新增文档放入对应的 `docs/` 子目录，避免再次堆积在根目录。
- 本地清理遵循 **Safe Local Archive**：只 `mv` 到被忽略的归档目录，不 `rm`。

更多入口见 [文档导航](docs/README.md) 与 [历史归档说明](archive/README.md)。
