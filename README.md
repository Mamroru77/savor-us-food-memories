# Savor · 食光记忆

一个以美食回忆为核心的微信原生小程序：记录一餐、在地图上回看足迹，并在明确授权的前提下与伙伴分享。

**技术栈**：微信小程序 · JavaScript / WXML / WXSS · 微信云开发（CloudBase） · Node.js 回归工具

> 当前维护分支：[`integrated-with-cloud`](https://github.com/Mamroru77/savor-us-food-memories/tree/integrated-with-cloud)。
> **运行入口是仓库根目录的 `project.config.json`，不是 `archive/` 中的旧项目。**

## 功能概览

| 页面 | 内容 |
| --- | --- |
| Home · 首页 | 美食日记、近期回忆与每周统计 |
| Map · 地图 | 地点检索、餐馆选点、回忆标记与卡片浏览 |
| Add · 记录 | 照片、餐馆、评分与用餐记录，保留未提交草稿 |
| Us · 我们 | 双人空间、共同回忆与心愿清单 |
| Me · 我的 | 个人资料、偏好、云端工具与年度报告入口 |

包含共用底部面板、提示反馈、浅色 / 深色主题、中英文及 Quiet 动效设置。身份校验、私有数据边界、主动分享与媒体授权是业务前提；功能代码存在不等于真实云端或双账号验收完成。

## 目录结构

```text
.
├── README.md                 # GitHub 项目首页
├── project.config.json       # 微信开发者工具导入入口
├── package.json              # 验证与资产生成命令
├── miniprogram/              # 当前小程序：页面、组件、样式、工具与资产
├── cloudfunctions/           # 当前云函数；本次整理不部署云端
├── tools/                    # 验证、生成与诊断工具
│   └── fixtures/regression/  # 必需的历史回归基准（16 个原始文件）
├── docs/
│   ├── README.md             # 文档导航
│   ├── guides/               # 当前开发与运行说明
│   ├── status/               # 总进度、统一验收清单
│   ├── reviews/              # 审计、修复、视觉迭代记录
│   ├── design/               # 设计参考与独立预览
│   └── history/              # 早期方案、阶段记录与旧 README
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

本地回归工具使用 Node.js 内置模块，根 `package.json` 不声明第三方依赖；请准备带 npm 的受支持 Node.js 版本。云函数依赖另行管理。

```bash
npm run verify:all
```

常用专项命令：

```bash
npm run verify:cloud            # 云契约与业务模拟检查
npm run verify:identity         # 身份与运行边界
npm run verify:secondary-ui     # 二级页面交互与视觉契约
npm run verify:sheet-edits      # 未保存编辑与异步头像守卫
npm run verify:visual-language  # 视觉样式契约
npm run build:locales           # 修改词表后生成语言资源
npm run build:icons             # 修改图标源后生成资源
```

资产生成命令会写入文件，只在需要时执行。回归通过不代表已完成微信真机、双账号权限或线上云端验收。

## 当前状态与边界

- 已完成五轮视觉迭代及相应回归，保留中文内容、餐具 Add、现有地图布局与已回退的 Tab 实现。
- 本轮仅整理目录、修正文档 / 测试引用并重写 README，不修改小程序业务或云函数，不执行云部署。
- 真机 Tab 抽动、全主题 / 语言 / 键盘状态、真实原生选择器、弱网及双账号权限等仍需验收。
- 提醒保持关闭；反馈走自有私有云端工单，不承诺外部投递。

以 [总进度](docs/status/PROJECT_PROGRESS.md)、[统一验收清单](docs/status/UNIFIED_ACCEPTANCE.md) 和 [最新视觉记录](docs/reviews/visual-language-20260916.md) 为准。历史文件中的“最新”、实验方案和部署提示仅反映记录当时，不覆盖当前状态。

## 数据安全与仓库约定

- 不提交令牌、密钥、`.env`、本机配置、真实运行日志、用户截图或预览二维码。
- `reports/` 整体忽略；回归必须依赖已提交的 `tools/fixtures/`，不能依赖本机报告。
- 不自动清库、迁移用户数据、重置存储键或修改共享权限。
- 旧资料集中在 `archive/legacy-handoff/`，只做归档、不作为部署入口。本轮移动不清洗既有 Git 历史；旧归档沿用此前已提交内容。
- 新增文档放入对应的 `docs/` 子目录，避免再次堆积在根目录。

更多入口见 [文档导航](docs/README.md) 与 [历史归档说明](archive/README.md)。
