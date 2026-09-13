# 业务能力移植核查：先汇报，不继续扩展实现

> **历史快照**：本报告及 `reports/migration-file-scan.json` 保留原核查时点。用户后来已授权实施建议中的 1–5；现已完成代码与本地回归，当前实现、部署步骤及剩余边界见 [BUSINESS_1_TO_5_UPDATE.md](BUSINESS_1_TO_5_UPDATE.md)。下文“未执行／未接入”描述不再代表本轮现状。

## 结论

**CloudBase 的「新增餐食 → 上传照片 → 写库 → 列表同步」主链路已接入；但不能把它等同于旧版本全部业务能力已经移植完成。**

目前最明显的缺口是：

1. **真实统计未接入**：旧首页已计算真实餐厅数、城市数；现在 Home / Us / Me 仍大量使用 best-ui 演示基数和静态图表。
2. **旧表单部分字段只有存储兼容，没有完整 UI**：人均、菜品、独立菜系、双人评分。
3. **图片交互未完全对齐旧能力**：旧版支持最多九张、全屏预览及任意单张删除；现在 Add 保留四张 UI、主图替换和末张附图删除，未接全屏预览。
4. **城市/国家元数据不跟真实选点更新**：坐标、地图地址可以正确，城市和国家仍可能保留 Paris / France。
5. **发现一处日期迁移差异**：旧版用本地日期，当前默认日期使用 UTC，东八区凌晨可能落到前一天。

**本轮遵照要求，先修复四项 UI/语言/暗色问题，再扫描并汇报。以下业务缺口尚未继续修改。**

---

## 1. 扫描范围与依据

对比三个层次，避免将「旧版已实现」「best-ui 演示」「未来规划」混为一谈：

| 对比对象 | 版本 / 范围 |
|---|---|
| 业务来源 | `integrated-with-cloud` / `1a6a09c5cd67dc524102762ccc327d29b3811f27`，`source/current_project/` 共 64 个文件 |
| 迁移前 UI | `best-ui` / `74ef52dce4f5dbfb7dc1869fe57006f364d0d59c`，`savor-mp/` 共 67 个文件 |
| 当前实现 | 本轮四项调整完成后的工作树，`savor-mp/miniprogram/` 与 `cloudfunctions/` 共 68 个文件 |

逐文件路径、字节数和 SHA-256 见 `reports/migration-file-scan.json`。这些数量是上述范围的文件清单，并非函数数量。

业务阅读重点包括：
- 旧 `miniprogram/pages/add/index.js`、实际首页 `pages/index/index.js`。
- 旧 `cloudfunctions/mealRecords/index.js`、`app.js`、Stage 2 部署文档。
- 旧 `quickstartFunctions` 和 `pages/example`，判断它们是云开发演示，不是餐食业务。
- 当前 Add、Home、Map、Us、Me、Sheet、store、photos、cloudRecords、locations 和 mealRecords schema / actions。

本报告基于源码与本地自动化验证，不是对线上云函数版本、数据库内容或已发布小程序的远程检查。

## 2. 已接入的业务能力

| 能力 | 来源代码 | 当前代码 / 结论 |
|---|---|---|
| CloudBase 初始化 | 旧 `miniprogram/app.js` | 当前 `app.js` + `utils/cloudRecords.js:initCloud`，原环境保留，失败不阻塞 UI |
| OPENID 身份隔离 | 旧 `mealRecords.normalizeRecord/listRecords` | 当前 cloud function 仍只读当前创建者；身份和 membership 不由客户端决定 |
| 新增餐食 | 旧 Add `saveRecord` → `action:add` | 当前 Add → store.createCloudMemory → adapter → mealRecords.add；保留 best-ui UI |
| 照片上传 | 旧 `uploadPhotos` | 当前先本地压缩持久化，保存时上传；全部照片完成才提交餐食，支持重试复用 |
| 云数据读取 | 旧首页 `loadRecords` | 当前 Home / Map → store.syncCloud → 同一 Memory 模型；缓存优先 |
| 图片展示 | 旧 `attachCoverUrls` | 当前持久化 cloud fileID，原生 image 读取；可选 resolvePhotoUrls，不把过期临时 URL 当持久数据 |
| 集合创建 | 旧 ensureCollection | 当前仍自动创建 dining_records；不吞掉所有权限错误 |
| 旧数据字段保留 | 旧 dining record | adapter / schema 保留 ratings、perCapita、dishes、cuisine 等，但保留字段不代表已经有对应表单和详情 UI |

当前还比来源多了：owner-scoped request ID 幂等、完整分页、防止重复列表、持久 Draft 重试上下文、真实地图选点以及仅限位置字段的 `setLocation` 授权更新。

## 3. 来源已具备，但当前尚未完整接入

### A. 真实餐厅/城市统计：未移植到现有统计卡

旧首页：`source/current_project/miniprogram/pages/index/index.js:31–44`：

```js
restaurantKeys.add(`${item.restaurantName || ''}|${item.address || ''}`)
cities.add(item.city)
restaurantCount: restaurantKeys.size
cityCount: cities.size
```

这是基于当次云列表的实际统计（旧列表最多 50 条），不是硬编码数字。

当前仍存在：

| 位置 | 当前行为 |
|---|---|
| `pages/home/index.js:56–69` | `12 + added`、`5 + added`；没有按真实本周日期过滤 |
| `pages/us/index.js:72–73` | `48 + addedShared`、`17 + addedShared` |
| `pages/us/index.wxml` | 国家数固定 `6` |
| `pages/me/index.js:74–75` | `72 + added`、`28 + added` |
| `pages/me/index.wxml` | 年数固定 `2` |
| `components/sheet/index.js` | 周报同样带演示基数；周柱状图和部分 Journey 内容固定 |
| `pages/me/index.js` | 曲线图是固定 SVG，不是实际消费/餐食趋势 |

**建议优先级 P0**：只替换卡片背后的数据选择器，保留排版和图形风格；先明确「餐食数」「不同餐馆数」「城市数」「本周」口径，并排除 sample。不能继续把加上新记录数量的演示数字称为真实业务统计。

### B. 人均、菜品、独立菜系：仅 schema / adapter 兼容

旧 Add 有 `perCapita`、`cuisine`、`dishes`，并实现 `addDish/removeDish`，新增时一起写库。

当前：
- `cloudfunctions/mealRecords/schema.js` 接受这些字段。
- `utils/cloudRecords.js:memoryToCloudRecord/cloudRecordToMemory` 可保留旧字段。
- 但当前 Add 构建的 memory 没有完整录入这些字段，Sheet 也没有对应的完整显示/编辑。
- best-ui 的 tags 不等于结构化 cuisine，不能未经设计直接混为同一个字段。
- 新记录 perCapita 通常是后端默认 0，不能当作用户真的消费 0 元。

**状态：部分迁移，不是已经全部可用。** 建议 P1，以 best-ui 小型可展开补充区域承载，不复制旧表单。

### C. 双人独立评分：有意延后，不能当作完成

旧 Add `setRating` 可分别填写两个人的评分。

当前：
- 只录入 best-ui 的一个 rating，这是前面明确选择的 Stage 2 方案。
- 旧 ratings 字段仍保留，不把单评分复制成两个人的评分。
- 旧双评分只通过展示均值适配单评分 UI，没有双方各自评分的交互。
- 旧数据没有有效评分时，adapter 仍以 3 星满足 Memory 显示合约并标注 `unrated-placeholder`；这不会写回真实单评分，但 UI 未明确显示“未评分”，有误导风险。

**状态：按设计暂缓，而非云能力丢失。** 未评分的视觉语义建议 P1；真正两人身份评分应结合后续权限方案，不冒称已实现情侣业务。

### D. 图片操作范围：与旧版有明确差异

旧 Add：
- `choosePhotos` 最多 9 张。
- `previewPhoto` 调用 `wx.previewImage`。
- `removePhoto` 按所选 index 删除任意图片。

当前：
- Add 仍是 best-ui 的最多 4 张布局；后端最多 9 张、旧记录的附图可读。
- 支持主图替换、添加附图和删除最后一张附图。
- 详情中可以切换缩略图，但没有旧版 `wx.previewImage` 全屏预览能力。
- 不能在 Add 中任意选择一张附图删除。

**状态：上传和持久化已移植；旧图片管理交互未完整移植。** 四张上限是保留 best-ui 的选择，不是后端限制。建议 P1/P2 按实际需求补齐，不直接换掉照片区。

### E. 城市/国家输入与真实坐标：当前存在数据不一致

旧 Add 的 city/address 可以自由输入。

当前 `pages/add/index.js`：
- 城市来自六个预设选项。
- 新餐食 country 根据预设城市映射，known place 则复用旧城市/国家。
- 腾讯 `chooseLocation` 写入的是 address、locationName 和 coordinates。
- 当前没有反向地理编码，也没有把省市/国家从已选门店结构化同步回来。
- `setLocation` 仅更新位置字段，不更新 city/country。

所以你截图里的「江苏省苏州市太仓市… · Paris…」确实暴露了一个业务问题：**坐标可以在太仓，city/country 仍可能是 Paris/France。**

本轮四项 UI 调整中，已去除地图卡片在完整地址后继续拼接旧城市的冗余显示；但**没有因此修复数据库内的城市和国家**，其他详情/统计仍会受影响。

**建议优先级 P0**：明确选点后如何确认结构化城市/国家，再修复旧记录；不要按一个中文地址字符串随意猜国家，也不要批量覆盖未知值。

### F. 默认日期从本地时间退回 UTC：迁移差异

旧 Add `todayString()` 使用 `getFullYear/getMonth/getDate`，得到用户本地日期。

当前：
- Add 的 today 使用 `new Date().toISOString().slice(0, 10)`。
- store.freshDraft 使用同样的 UTC 日期。

东八区凌晨 00:00–07:59 时，默认值可能是前一天，日期选择上限也可能不正确。

**建议优先级 P0，作为正确性修复。** 本轮按“先汇报”的要求尚未修改。应恢复统一的本地日期 helper，并增加跨日测试。

## 4. 当前产品仍缺少，但旧 dining 业务也没有实现

这些不是「旧版能力忘了搬」，需要后续独立开发：

| 能力 | 源码核查结论 |
|---|---|
| 通用云端编辑餐食 | 旧 mealRecords 只有 add/list；当前只额外增加 setLocation，没有完整餐食编辑 action |
| 云端永久删除 | 两边都没有餐食 delete；当前删除是本设备隐藏，云记录仍存在 |
| 收藏 / 喜欢 / Share 状态跨设备同步 | 当前初次写入可保存 flags，但后续切换是 localChanges；没有云更新闭环 |
| 情侣绑定 / 邀请码 / 双人共享权限 | 两边都只有预留 memberOpenids/coupleId，没有真实绑定流程 |
| Wishlist | 旧首页 wishlistCount 固定为 0；没有真实集合和增删查业务 |
| 链接解析 / 截图 OCR / 导入历史 | 参考图是规划；当前 Add 入口也明确为规划中，没有解析或 OCR 后端 |
| 云端用户资料与设置 | profile、头像、偏好、语言、主题仍是本机设置；来源没有对应业务服务 |
| 批量导入云数据库 | best-ui 的 JSON Import 仍是本地导入，不自动上传；来源没有餐食批量云导入服务 |
| 照片垃圾回收 / 云端删除联动 | 部分上传可重试复用，但放弃草稿可能留孤立文件；无安全的定期清理协议 |
| 餐厅实体和多次到访归一 | 目前是一条 meal record 一个位置，不是已建 restaurants 实体/POI 去重系统 |
| 自动门店识别 / 反向地理编码 | 已接入用户选点，不代表自动识别正确分店、城市/国家 |
| 年度报告 / 真实时间轴里程碑 | 当前存在演示图表/固定旅程片段，没有真实汇总生成服务 |
| 服务端提醒 / 反馈投递 | 当前提醒是应用内演示/本地设置，反馈仅保存本机 |

此外，当前 list 采用按 ID 合并，不把云端外部删除自动推断成本地删除。它能防重复和保留离线缓存，但并非完整双向同步协议。

## 5. 明确不应搬回来的内容

来源 `quickstartFunctions` 确实包含 `sales` 集合 CRUD、获取 OpenID、生成小程序码；`pages/example` 还有云托管和 AI ToolKit 演示。

这些是 CloudBase quickstart 示例，不是 dining_records 的已实现业务：
- 不能把 sales.deleteRecord 称为原项目已经实现餐食删除。
- 不能把示例二维码生成称为已实现情侣邀请码。
- 不能把 AI ToolKit 示例文案称为已经实现截图 OCR。

因此没有把它们搬进当前小程序，不属于餐食业务迁移遗漏。

## 6. 建议后续实施顺序（本轮未执行）

1. **P0：本地日期正确性。** 恢复统一 localDate helper，覆盖东八区凌晨测试。
2. **P0：城市/国家一致性。** 先确定确认/解析规则，再补旧记录，避免地点和统计错误。
3. **P0：真实统计 selectors。** 保留 Home/Us/Me 的视觉，仅替换数据源与统计口径。
4. **P1：补充旧业务字段及图片预览。** 人均、菜品、结构化菜系、未评分语义；继续使用 best-ui 组件。
5. **P1：设计餐食编辑/删除与状态同步。** 明确权限、幂等、离线缓存和文件处理，再实现云 action。
6. 另行确认情侣绑定、万能导入、Wishlist 等新阶段范围。

## 7. 本轮四项修复与验证

四项 UI/语言/主题修改说明见 `UI_LANGUAGE_THEME_UPDATE.md`。

实际执行：
- 原静态验证：187/187 PASS。
- 原 TabBar/资产独立验证：PASS。
- 扩展 mock 场景：47/47 PASS。
- 本轮未修改云函数和数据库 schema。
- 未在微信开发者工具、真机和真实 CloudBase 执行本轮验收；并未据此宣称真实统计、编辑/删除或 OCR 已完成。

**本报告完成后暂停新增业务，等待你确认下一步优先级。**
