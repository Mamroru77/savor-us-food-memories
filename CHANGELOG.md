# Changelog

本文件记录 Savor Us · 食光记忆 的逐版本变更。
版本号来自 Git tag；每条变更都对应仓库中真实的提交。

---

## v1.2.3 — 2026-09-29

本版本重点提升图片、地图、餐饮类型与整体稳定性。

> 范围说明：本版本的代码变更集中在上一版 `v1.0.0` 之后（`b2509c4..b40b85c`，共 18 个提交，
> 其中 13 个为代码/文档实质变更）。发布动作本身（文档、`.gitignore`、版本元数据）不改变生产代码。

### Added

- 自定义餐饮类型与多标签支持（`2dde1eb`）
- 精细地图缩放控制（`c0336fa`）
- Add 页快速清除草稿能力（`ce27eca`）
- 地图 POI 名称自动填充餐厅名称（`5eb36d3`）

### Improved

- 地图 marker 与缩略图加载，drawer 改为覆盖层渲染（`8bf5a65`）
- 相邻餐厅浏览性能：拖动期间不再重建 markers（`8bf5a65`）
- TabBar 首次切换的资源预热（`305e1f1`）
- TabBar 重复 publish / setData 开销（`305e1f1`）
- 大尺寸图片上传稳定性（`5eb36d3`）
- 头像及记忆照片持久化（`428e1b7`）
- 本地媒体空间管理（`428e1b7`）

### Fixed

- 大尺寸照片上传失败 / 超时相关问题（`5eb36d3`）
- 图片上传单张失败阻塞整个批次的问题（`3f4379f`）
- 地图餐厅名称与选点关联问题（`ce27eca`）
- 编辑餐厅名称导致地图位置丢失的问题（`ce27eca`）
- 自定义餐饮类型多标签保存问题（`2dde1eb`）
- 本地媒体 orphan 堆积造成文件存储配额耗尽（`428e1b7`）
- 头像本地 durable path 被错误 GC 的问题（`428e1b7`）
- 后台恢复时草稿状态相关问题（`3f4379f`）
- 云端副本被删除时，本地已编辑的记忆被一并丢弃的问题（`8c2a427`）

### Known Issues

- Minor TabBar transition twitch remains on some real devices.
  Status: **Deferred**. 不影响导航与功能使用。
  已排除的方向见 [TabBar Phase 2E](docs/reviews/tabbar-phase2e-20260928.md)。

### 发布动作（非代码）

- 更新 `README.md` 与文档导航，使其与 v1.2.3 实际代码一致
- 新增本 CHANGELOG 与 [Release Closeout v1.2.3](docs/reviews/release-closeout-v1.2.3-20260929.md)
- 补充 `.gitignore` 的本地垃圾模式（OS / 编辑器 / Python 缓存 / scratch / tmp）
- `package.json` 版本 `1.0.0` → `1.2.3`
- 本地冗余文件按 **Safe Local Archive** 归档（只 `mv`，不 `rm`）
- **未**改动生产代码、**未**部署云函数、**未**上传微信小程序版本、**未**修改云数据库

---

## v1.0.0 — 2026-09-24

真机问题收尾版本。标签 `v1.0.0` 指向提交 `b2509c4`（`v1.0.0-r5` 指向同一提交；
更早的 `v1.0.0-r4` 指向 `7a45387`）。

### Added

- 双人空间、共同回忆与共享
- 云端工具：备份 / 导入 / 任务恢复、云档案与偏好同步
- 年度报告与分享
- 一次性提醒与私有云工单反馈

### Fixed

- 身份分区迁移：缓存分区归属改由 marker 是否存在判断，版本不符时 fail-closed
  （[RCA](docs/reviews/identity-partition-migration.md)）
- Add 照片 native-return 竞态：原生回调必须在页面重新可见后再恢复租约并落盘
  （[RCA](docs/reviews/add-native-return-fix.md)）
- 头像链路四个独立缺陷：微信头像与自定义高清头像汇入同一个 `AvatarAsset`，仅显式 Save 写资料
  （[RCA](docs/reviews/avatar-final-rca-and-fix.md)）

### 备注

- 微信侧：体验版上传（版本号 `1.0.0`）后已提交审核（项目所有者确认，本仓库无法独立取证）
- 云函数：该版本对 `cloudfunctions/` 无改动，因此未部署
- 收尾记录见 [Release Closure 2026-09-24](docs/reviews/release-closure-20260924.md)

---

## 版本号说明

- 仓库 tag：`v1.0.0`、`v1.0.0-r4`、`v1.0.0-r5`、`v1.2.3`。
- **不存在** `v1.2.0` / `v1.2.1` / `v1.2.2`。版本号从 `v1.0.0` 直接到 `v1.2.3`，
  请勿在文档或 release notes 中补写不存在的中间版本。
- `cloudfunctions/*/package-lock.json` 中出现的 `1.2.2` 是第三方依赖
  `@cloudbase/database@1.2.2` 的版本，**与本项目版本号无关**，不要改动。
