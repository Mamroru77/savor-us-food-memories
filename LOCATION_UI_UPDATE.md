# Me 滚动 / 动态背景 / 真实餐馆地图更新

本次承接 `a28bfe7`，按照用户确认：**Map 保留；万能导入入口放 Add；地图显示餐馆真实定位**。

## 已实现

### 1. Me 二级菜单滑动

- 根因：Sheet panel 的 `catchtouchmove="noop"` 拦截内部滑动；scroll-view 只有 flex/max-height，没有明确高度。
- 修复：仅背景遮罩保留滑动拦截；panel 不拦截；scroll-view 使用明确的视口约束 height，移除不必要的 type=list。
- 所有共用 Sheet 的页面一起受益：Library、Preferences、Settings、Help、Memory detail 等。
- 没有替换 Sheet 布局、字体、配色和动画。

### 2. Us / Me 动态背景

- Us：使用共享列表首条回忆的 placePhoto/photo，与 Journey 图片同步变化；无共享记录回退原打包背景。
- Me：使用当前 profile.avatar，与页面主体头像一致；更新头像时通过 store 订阅即时刷新背景。
- 原生 image 补充 width:100vw / height:100vh，避免默认图片尺寸导致背景只覆盖局部。
- 保留原模糊、透明度和 Quiet motion，不做额外抽色服务；图片加载失败回退原资源。

### 3. Map 真实定位

接入 **微信原生腾讯地图 API**，而不是需要 Key 的腾讯 WebService HTTP API：

```text
Add → wx.chooseLocation → 用户搜索并确认餐馆
→ 经纬度 + 名称 + 地址 + gcj02 标记写入 Draft
→ 原保存链路 → mealRecords:add → dining_records
→ store → 原生 map markers
```

- 新 Add 保存要求先确认餐馆位置；已确认且同名的 known place 可以复用。
- 修改餐厅名或城市会清除本次选点，避免换餐厅后沿用旧位置。
- 原城市中心默认值不能作为已确认餐馆位置。城市/国家字段仍属于 best-ui 表单元数据，选点 API 不提供结构化城市/国家解析，本次没有假造反向地理编码结果。
- 真实记录存在时，Map 不将七条 sample 混入你的餐馆地图；无真实记录仍保留原演示效果，并明确标注“演示地图”。
- 坐标来自用户选点确认，不意味着服务端已通过腾讯 POI 数据库认证商户身份。
- 地图中心与范围随已定位记录变化，移除固定巴黎中心及“距离巴黎某个固定点”的伪距离。
- 旧记录无确认标记，即使带历史城市预设坐标，也进入“待确认位置”，不伪装成餐馆真实坐标。
- Map 可点击待确认条数，选择餐食，再调腾讯地图选点。每次显示最多 6 条待确认记录，完成后后续记录继续进入队列。
- 地图餐馆卡支持“校准位置”和“在腾讯地图打开”（wx.openLocation）。

旧云记录补充位置：

```text
Map 选点 → store.setMemoryLocation
→ cloudRecords.setLocation
→ mealRecords:setLocation
→ where(_id, createdBy = 当前 OPENID).update
→ 返回记录 → adapter → store
```

仅开放位置更新字段：coordinates、address、locationName、locationSource、coordinateSystem。不能借此修改 owner、coupleId、评分或其他餐食内容。服务端验证坐标范围与格式。

字段增量：

```js
{
  coordinates: [latitude, longitude],
  address: '用户确认的地图地址',
  locationName: '地图返回的位置名称',
  locationSource: 'tencent-picker',
  coordinateSystem: 'gcj02'
}
```

没有已确认来源的坐标不自动认证为真实坐标。旧 integrated add/list 协议继续兼容。升级前已发出但结果未知的 Draft 仍允许按原 request ID 重试，确认结果后再从 Map 补位置。

### 4. 万能导入：入口与业务规划

Add 已增加入口，展示：链接导入 / 截图 OCR / 手动记录。前两项明确为“规划中”，可查看流程说明；手动记录继续使用当前 Add。

**没有实现真实链接解析和 OCR，也不会自动读取剪贴板、上传截图或生成假结果。**

后续业务分层：

| 步骤 | 链接导入 | 截图 OCR |
|---|---|---|
| 输入 | 用户主动粘贴公开链接 | 用户主动选择截图 |
| 服务端处理 | 来源白名单、URL 安全校验、防 SSRF、限速、公开页面解析 | 校验上传、图片大小限制、授权 OCR 服务、限速 |
| 中间结果 | 餐厅、地址、来源信息及每个字段的出处 | 餐厅、日期、金额、菜品及置信度 |
| 用户确认 | 编辑识别结果；不能将网页评分伪装成自己的餐食评分 | 编辑/移除误识别项，明确区分订单截图和餐食照片 |
| 定位 | 腾讯地图搜索、用户确认具体门店 | 同左，不仅凭店名猜门店 |
| 保存 | 填充原 Add Draft，再经现有上传/mealRecords 保存 | 同左 |
| 历史 | 状态：草稿、待确认、成功、失败；固定 import request ID | 同左 |

实现真实解析/OCR前需要确定服务供应商、服务端密钥、配额与隐私说明。腾讯原生地图选点本身不需要另填 WebService Key。

## 修改文件

- `components/sheet/index.wxml`、`index.wxss`：滚动事件与高度修复。
- `pages/us/index.js`、`index.wxml`、`index.wxss`：共享回忆背景、回退与视口尺寸。
- `pages/me/index.js`、`index.wxml`、`index.wxss`：头像背景、回退与视口尺寸。
- `pages/add/index.js`、`index.wxml`、`index.wxss`：真实选点、导入规划入口；保留原保存/草稿/照片区。
- `pages/map/index.js`、`index.wxml`、`index.wxss`：真实记录过滤、动态中心、补定位、校准与导航。
- `utils/cloudRecords.js`：地图元数据往返适配与 setLocation 调用。
- `utils/store.js`：位置更新成功后保持本地 UI 覆盖，不复活期间已被删除的记录。
- `app.json`：chooseLocation 隐私 API 声明与 scope.userLocation 用途说明。
- `cloudfunctions/mealRecords/index.js`、`schema.js`：位置字段增量及服务端授权更新。
- `tools/verify-cloud.cjs`：新增位置、权限、动态背景、滚动结构检查。
- `README.md`、`STAGE2_SETUP.md`、`MIGRATION_REPORT.md`：新增本次更新指引，原迁移报告保留为历史记录。

新增：
- `utils/locations.js`：原生腾讯地图选点、坐标校验与确认状态的统一封装。
- `reports/ui-approved-updates.json`：11 个本轮用户明确要求调整的 UI 文件哈希和理由。原 ui-baseline.json 不删除；其余 UI 文件继续对比原 best-ui，TabBar 仍完全不变。
- `reports/latest-validation.log`：本轮完整测试结果。
- 本更新说明。

## 验证

执行：`npm run verify:all`。

- 原主静态检查：**185/185 PASS**。
- 原 TabBar / assets 独立检查：PASS。
- 扩展 mock 契约测试：**38/38 PASS**。
- Git diff 空白检查：PASS。

覆盖：旧 Stage 2 场景、选点写入/读取、拒绝用城市中心保存、跨用户位置修改被拒、非法坐标拒绝、真实地图过滤与待定位提示、Us/Me 随 store 更换背景、Sheet 无外层拦截且高度明确。

**静态布局检查不等于已在手机上滑动验证；mock API 不等于腾讯地图真实调用成功。未在微信开发者工具、真机或真实 CloudBase 验证。**

## 你需要执行的最短步骤

1. 导入更新包的 `savor-mp/`；保持原 AppID 与环境 `cloud1-d9gqm52id66c0bcda`。
2. 重新部署 `cloudfunctions/mealRecords` → 上传并部署：云端安装依赖（新增 setLocation）。
3. 在小程序管理后台确认地理位置/chooseLocation 接口权限与隐私保护指引，填写位置用于餐馆选点保存；真机按微信提示授权。源码声明不能代替后台权限申请。
4. 编译：Me 打开 Library/Help 上下滑动；更换头像检查 Me，新增共享照片检查 Us。
5. Add 确认腾讯地图位置后保存；Map 检查准确门店、点击导航；给旧记录补位置并重启验证仍保留。

不需要手动创建新集合或填写腾讯 WebService Key。拒绝授权/取消选点不会新建记录或覆盖原位置。

## 当前工作区

Add 背景已同步补齐 `100vw × 100vh`，继续绑定草稿主图。本工程仅保留最新源码；测试日志统一在 `reports/latest-validation.log`。历史实现和旧日志仅从 Git 历史查阅。
