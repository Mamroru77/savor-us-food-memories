# best-ui × CloudBase：Stage 2 迁移交付

> **后续更新**：本文保留首轮 Stage 2 记录。最新地图选点、仅位置字段更新、滚动/背景修复、部署权限与测试结果，以 [LOCATION_UI_UPDATE.md](LOCATION_UI_UPDATE.md) 为准。


## 结论与验收状态

**已完成本地代码实现与自动化验证，交付可部署候选版；尚未完成你定义的真实微信/CloudBase 最终验收。**

- UI 基线：`best-ui`，提交 `74ef52dce4f5dbfb7dc1869fe57006f364d0d59c`。
- 业务参考：`integrated-with-cloud`，提交 `1a6a09c5cd67dc524102762ccc327d29b3811f27`。
- 工作分支：`best-ui-cloud-stage2`，从 best-ui 创建，未把旧 UI 合并进来。
- 已下载两个远程分支并在本地修改；**未推送到 GitHub，也未部署云函数**。
- 来源分支实际首页为 `archive/legacy-handoff/source/current_project/miniprogram/pages/index/index.js`，不是请求示例中的 `pages/home/index.js`；已按实际 app.json 路由提取云逻辑。

## 实施顺序

1. Phase 1：读取 store、Memory、Add/Home、Map/Us/Me、Sheet、照片和 TabBar，以及来源的云函数、实际首页和交接文档；运行原验证，记录 183/183 基线。
2. Phase 2：保留字体、store、globalData 初始化，合并 metrics 预热和失败可降级的 CloudBase 初始化。
3. Phase 3：迁入 mealRecords，增量 schema、服务端身份、幂等 add 与兼容分页 list。
4. Phase 4：增加独立 cloudRecords service/adapter，不把字段转换散落到页面。
5. Phase 5：替换 Add 保存业务，保留表单、预览、Draft、动画与布局。
6. Phase 6：Home 先缓存渲染、后台同步，经 store 发出更新。
7. Phase 7：验证 Map、Us、Me、Library、Memory detail；修复 Library 原有状态快照问题。
8. Phase 8：原全部静态检查重新执行，再执行云契约 mock 和 UI 文件哈希检查。

## UI 保持范围

32 个基线文件通过 SHA-256 对比，覆盖全部 WXML/WXSS、TabBar 四件套、app.json 和打包图片。

- 所有 WXSS、Home/Map/Us/Me WXML、TabBar、app.json、图片完全不变。
- Add WXML 仅将保存中错误的 `Memory saved` 文案改为 `Saving memory...`，哈希检查仅允许这一项替换；布局、节点、样式、事件绑定不变。
- custom-tab-bar 没有新增 require，没有 store 依赖。
- 不移动 miniprogram 的页面与资产；新增父目录完整云工程配置，保留旧入口。
- 原演示统计基数、Quiet motion、Sheet、Toast、地图和 Import/Export 继续存在。
- 这证明文件层面的保持，**不能证明实际设备视觉像素级一致**。

## 已修改文件（相对 savor-mp/）

| 文件 | 修改原因 |
|---|---|
| `README.md` | 更新 Stage 2 入口、真实 AppID 要求、验证和部署文档链接，删除“测试号即可连接云”的误导 |
| `package.json` | 增加 `verify:cloud` 和 `verify:all`；保留原三个验证命令 |
| `miniprogram/app.js` | 合并 metrics/CloudBase 初始化，保留字体/store，Cloud 失败不阻塞页面；保留原环境值 |
| `miniprogram/project.config.json` | 原入口不变，补充 sibling cloudfunctionRoot；没有修改 AppID |
| `miniprogram/utils/data.js` | 严格接受合法 cloud fileID；拒绝空 key、空环境、查询片段、遍历路径；本地路径检查补充分隔符 |
| `miniprogram/utils/store.js` | 新增 createCloudMemory/syncCloud；稳定 ID 去重，保存请求快照和 fileID 重试缓存，本地 UI 覆盖与隐藏标记，继续保留两个原 storage key |
| `miniprogram/utils/photos.js` | 修复微信 API 单 options 参数回调封装、readFile 的 filePath 参数；照片清理保护 Draft 文件，选图/压缩/持久化流程不改 UI |
| `miniprogram/pages/add/index.js` | 保留表单与草稿，云上传/保存替换本地新增；无照片可保存、防双击、失败留草稿、离开不强制导航、未知保存结果安全重试 |
| `miniprogram/pages/add/index.wxml` | 仅修正保存中的文案，避免云调用尚未完成就宣称成功 |
| `miniprogram/pages/home/index.js` | onShow 本地渲染后调用统一 store 同步入口，失败保留缓存并提示 |
| `miniprogram/pages/map/index.js` | 旧云记录没有坐标时跳过地图标记，避免凭空放在巴黎或零经纬度；搜索/筛选/收藏 UI 未重构 |
| `miniprogram/components/sheet/index.js` | Library 改用本次 store 快照，修复首次打开 null 状态；帮助文案准确说明云数据与本地 UI 状态边界 |

## 新增文件

| 文件 | 职责 |
|---|---|
| `miniprogram/utils/cloudRecords.js` | 唯一客户端 CloudBase 边界：初始化、上传、add/list、分页、临时 URL、双向模型适配与统一错误 |
| `cloudfunctions/mealRecords/index.js` | 服务器 OPENID 授权、集合创建、add 幂等、当前用户 list、向后兼容旧调用协议与错误处理 |
| `cloudfunctions/mealRecords/schema.js` | 增量输入清洗与长度、日期、评分、图片、坐标校验；服务端决定 ownership/membership |
| `cloudfunctions/mealRecords/package.json` | 从来源保留 wx-server-sdk 云依赖，由云端安装 |
| `cloudfunctions/mealRecords/config.json` | 从来源保留云函数 OpenAPI 权限配置（无额外 OpenAPI 权限） |
| `project.config.json` | 完整云工程入口，指向既有 miniprogram/ 与新增 cloudfunctions/ |
| `tools/verify-cloud.cjs` | Node 零依赖 mock 契约验证：服务端、service、store、页面生命周期与安全行为 |
| `docs/history/STAGE2_SETUP.md` | 最短部署步骤、必要安全规则、失败处理、阶段边界 |
| `docs/history/MIGRATION_REPORT.md` | 本报告 |
| `tools/fixtures/regression/ui-baseline.json` | 从 best-ui 提取的 32 个 UI 文件 SHA-256 基线，用于验证不换 UI |

没有修改或删除原 `verify-miniprogram.cjs`、`verify-tabbar.cjs`、`verify-assets.cjs` 的验证规则。新增云函数在前端包之外，后端依赖不会进入小程序包；新测试单独覆盖它。

## 四条数据流

### Add → Cloud

```text
best-ui onSave 校验 + saveLock
→ store.createCloudMemory(Memory, Draft)
→ Draft 持久化 request ID / 保存快照
→ cloudRecords.memoryToCloudRecord
→ uploadPhotos（全部成功才继续）
→ mealRecords:add（身份只从 OPENID 取）
→ dining_records
→ 返回真实 _id 与规范化 record
→ cloudRecordToMemory → store.addMemory
→ clearDraft → 当前仍在 Add 才 switchTab Home
```

### Photo → Cloud Storage

```text
原 Add 选图区 → wx.chooseMedia → 压缩 → USER_DATA_PATH → 本地预览
→ 保存时 wx.cloud.uploadFile → fileID 写入 Draft 的上传缓存
→ 所有照片成功 → fileIDs 写入 dining_records.photos / placePhoto
```

本地打包图片不上传，只保存资源路径引用；选择的真实用户照片才上传。未增加自动扫描旧 memories 的上传任务。部分失败没有半残餐食，成功上传部分保留用于重试。未确认的远端提交绝不自动删除照片，以避免响应丢失后的数据损坏。

### Cloud → Store

```text
mealRecords:list 按 createdBy=OPENID 查询
→ 新客户端通过 _id 游标分页；旧客户端仍得到按 date 倒序的前 50 条
→ cloudRecordToMemory
→ store 按 id 合并 + 本设备 localChanges / cloudHidden
→ savor-diary-v1 缓存 → emit
```

全量分页成功后才合并。并发刷新共用一个 Promise；晚返回的 list 不删除刚保存的记录。不用餐厅名+日期去重。云端外部删除暂不从 list 推断为本地删除（本阶段没有删除同步协议）。

### Cloud → Home

```text
Home onShow → 立即 syncState(store.get())
→ store.syncCloud 后台运行
→ store.emit → 原订阅 → 原 Home UI 刷新
→ 其他页面与 Sheet 继续订阅同一个 Memory store
```

## Memory ↔ dining_record 字段映射

| best-ui Memory | 云字段 | 规则 |
|---|---|---|
| `id` / `cloudId` | `_id` | 新增成功后都用服务器稳定 _id，不用店名日期 |
| `restaurant` | `restaurantName` | 服务端长度 80，原表单上限 70 |
| `notes` | `note` | 服务端增至 1500，兼容 best-ui 的 textarea |
| `date` | `date` | YYYY-MM-DD 且必须是真实日期 |
| `city` | `city` | 保留 |
| `country` | `country` | 增量字段，保留 |
| `neighborhood` | `neighborhood` | 增量字段；旧记录读取 address 作展示回退 |
| `coordinates` | `coordinates` | 纬度、经度二元组且范围正确；未知坐标仅 view model 用 [0,0] 占位并标 locationUnknown，不写回，不生成地图 marker |
| `rating` | `rating` | 真正 best-ui 单评分 1–5；不复制成两个人的评分 |
| `ratings`（兼容元数据） | `ratings` | 仅保留明确传入的旧双评分；未评分 0 保持原样 |
| `ratingSource` | 不持久化 | single / legacy-average / unrated-placeholder；旧展示均值和占位不写回单评分 |
| `tags` | `tags` | 保留，旧无 tags 时 cuisine 回退 |
| `photo` + `extraPhotos` | `photos` | 主图在第 0 项，其余为附图；旧 9 张记录可读取，新 Add 仍最多 4 张 |
| `placePhoto` | `placePhoto` | 独立保留，必要时上传，不能混成主图 |
| `noPhoto` | `photos: []` | 无图餐食云端保持空数组，UI 用原打包图回退 |
| `shared` / `liked` / `saved` | 同名字段 | 创建时持久化；之后现有页面切换作为本设备 localChanges 保留，不增加跨端 update 业务 |
| `address` / `cuisine` / `perCapita` / `dishes` | 同名字段 | 旧业务元数据保留，适配器往返不丢 |
| `memberOpenids` / `coupleId` | 同名字段 | 读取保留；创建时服务器强制 `[OPENID]` 和空 coupleId，客户端不能伪造 |
| — | `createdBy` | 服务端 cloud.getWXContext().OPENID |
| — | `createdAt` / `updatedAt` | 服务端时间，不由客户端指定 |

服务器图片上限 9 张，placePhoto 独立；旧字段非破坏性扩展，无批量数据迁移。

## 兼容与风险边界

- **旧 integrated**：add/list action 不变，旧 add 无 requestId 仍可用；旧首页的列表排序/50 条限制保留。双评分、菜品、人均等保留。新客户端采用 paginated 标志请求完整记录。
- **演示数据**：保留七条、原顺序与打包图，不自动上传。样例不会因为 Home onShow 写入云端。
- **本地缓存**：继续 `savor-diary-v1`；订阅、持久化、Import/Export 不换体系。Draft 继续 `savor-draft-v1`，额外保存重试上下文。
- **UI 本地变更**：收藏、喜欢、分享和删除标记保持本地；不在本轮偷偷升级成情侣共享或云删除。帮助/部署文档明确这一点。
- **图片**：持久化 fileID，避免缓存失效的临时 URL。原生 image 直接读取 cloud fileID；resolvePhotoUrls 为按需瞬时转换，不写入缓存。云图片没有保证完全离线可用。
- **上传遗留文件**：失败重试会复用；主动放弃部分上传的 Draft 可能留下未引用对象。本轮未加入危险的后台自动删除任务。
- **评分视觉**：旧数据没有任何有效评分时，Memory 合约仍需 1–5，所以保留 3 星展示占位并明确元数据标记；绝不写入云端作为真实评分。完全“未评分”视觉需另行设计，不能冒称已经实现。
- **地图**：仍是 best-ui 原生地图、既有城市预设坐标。旧记录无坐标不伪造真实地点，也未引入 POI/餐厅实体重构。

> 工作区整理说明：旧版测试日志已移出当前工作树，仍可从 Git 历史查阅；当前完整验证输出统一为 `reports/latest-validation.log`。下表记录的是首轮迁移结果，最新结果以该日志为准。

## 实际执行的测试

| 检查 | 结果 | 说明 |
|---|---|---|
| 迁移前主静态检查 | 183/183 PASS | 包含旧 store / Import/Export smoke 与子验证器 |
| 迁移后主静态检查 | 184/184 PASS | 新 service 导致新增可解析 require 检查，未删规则；前端包约 1.09MB |
| 原 TabBar / 资产独立脚本 | PASS | verify:all 中单独再执行 |
| 云/页面契约场景 | 32/32 PASS | Node mocks，不连接微信真实数据库/云存储 |
| UI 保持哈希 | 32 文件 PASS | Add 文案唯一允许差异 |
| 云函数 JS 语法检查 | PASS | `node --check` |
| Git diff 空白检查 | PASS | `git diff --check` |

十个必测场景全部有 mock 覆盖：无图、单图、多图、云函数未部署、部分上传失败、双击保存、Home 三次进入、重启/清缓存后云恢复、请求失败缓存不变、sample 不上传。

另外测试了未知提交结果重试、同 request ID 并发写入、跨 OPENID 隔离、伪造 membership、评分/日期/图片/坐标非法输入、>50 条分页、临时 URL 不污染备份、选择取消、保存中离开、存储满、Library/详情兼容与本地覆盖。

## 未完成 / 不得宣称通过

- **未在微信开发者工具编译或验证**。
- **未真机验证**，包括 native image 读取 fileID、相册授权、真实地图与动画。
- **云函数需要人工部署**，未对实际环境上传文件、创建集合、改规则或写入真实餐食。
- 未验证实际 SDK/环境下的数据库权限、存储规则和索引可用性；mock 不能证明它们。
- 未实现 Stage 3、情侣绑定、邀请码、Wishlist、餐厅实体、年度报告。
- 未新增云端更新/删除、跨设备 UI 状态同步或云文件垃圾回收。
- 未推送 GitHub 远程分支。

最终验收仍需你在原环境完成：启动 → 原 Add UI → 真实选图上传 → dining_records → Home 自动刷新 → 重启恢复 → Map/Us/Me 实机检查。

最短操作步骤见 [STAGE2_SETUP.md](STAGE2_SETUP.md)。
