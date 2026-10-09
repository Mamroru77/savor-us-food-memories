# UI_INVENTORY — Savor 小程序 UI 全景清单

> 采集时间：**2026-10-03**
> 采集方式：**真实运行当前工作树** → 微信开发者工具模拟器 → 逐页导航 + 触发真实交互 → 截图
> 运行环境：WeChat DevTools 模拟器 · 逻辑视口 **428×926** · **DPR 3** · 基础库 **3.17.3** · 语言 **zh_CN**
> 截图输出：**374×809 PNG**（未压缩原图，`--optimize false`）
> 采集数量：**35 张**（9 个注册页面 · 13 种底部弹层 · 8 个地图状态 · 6 个 Add 表单状态）

---

## 0. 采集口径（先读这一节）

**证据等级：`SIMULATOR-VERIFIED`。** 本清单**不是**真机硬件证据。按本仓库 `AGENTS.md` 的分类，
模拟器截图只对「模拟器 UI / 布局 / 状态」有效；真机验收需要真机桥接，本次未使用。

**分辨率上限（已实测）**：`simulator_screenshot` 在本机模拟器上，`--optimize false` 与默认优化**都**返回
`374×809`。逻辑视口是 `428×926`，即截图被通道自身缩放了 **0.874×**。这是该通道的分辨率天花板
（模拟器机型是 IDE 私有设置，不在 `project.config.json` 里，无法调整）。因此**细小控件（图标、小按钮）
不适合在这批图上做像素级判读**。

**状态是怎么造出来的（关键）**：
- 状态**不是**用 `setData` 直接塞出来的，而是**调用页面自己声明的事件处理器**
  （如 `p.onWeekly()`、`p.onMenuRow({currentTarget:{dataset:{sheet:'preferences'}}})`、`p.selectMapMemory(id)`），
  与用户真实点击走同一条代码路径。
- 每个状态都做了**双重验证**：
  1. **data 回读**——探针在截图前读回页面 `data` 中该状态的判据字段（见 §2「回读证据」列）；
  2. **像素差**——与该模块的 Default 截图做差分（灰度差 > 20 的像素占比）。首轮有 5 个状态差分 ≈ 0，
     已判定为「没渲染出来」并**重采**（见 §7）。
- **没有写入任何业务数据**：探针全程只读；未调用 `onSave`、未清空存储、未改动账号数据。

**已知产品行为（会影响如何理解截图）**：**Map 进入时的默认态就已经自动选中了第一个地点并展开信息卡**
（`pages/map/index.js` 的 `applyFilters` 在无 `preferredId` 时回退到 `visible[0]`）。
因此「Default」= 「Pin Selected + Card Expanded」，**不是两个状态**。

---

## 1. 页面清单（Routes）

| # | 页面 | 模块 | Route | 类型 | 入口 | 截图数 |
|---|---|---|---|---|---|---|
| 1 | Home | `home` | `/pages/home/index` | 主 Tab 1 | `custom-tab-bar` | 4 |
| 2 | Map | `map` | `/pages/map/index` | 主 Tab 2 | `custom-tab-bar` | 8 |
| 3 | Add | `add` | `/pages/add/index` | 主 Tab 3 | `custom-tab-bar` · Home 空态 CTA · Space「加入草稿」· sheet「编辑」 | 6 |
| 4 | Us | `us` | `/pages/us/index` | 主 Tab 4 | `custom-tab-bar` | 4 |
| 5 | Me | `me` | `/pages/me/index` | 主 Tab 5 | `custom-tab-bar` | 9 |
| 6 | Account & legacy data | `account` | `/pages/account/index` | 二级 | Me → 菜单行 `account` | 1 |
| 7 | Shared space & wishlist | `space` | `/pages/space/index` | 二级 | Me → `space` · Us → 「管理」次级行 | 1 |
| 8 | Cloud tools | `workspace` | `/pages/workspace/index` | 二级 | Me → `workspace` · Help sheet | 1 |
| 9 | Annual reports | `reports` | `/pages/reports/index` | 二级 | Me → `reports` · Workspace → 「年度报告」 | 1 |
| — | *(Morph lab)* | — | `pages/morph-lab/index` | **未注册** | **无任何导航入口**（不在 `app.json.pages`） | 0 |

**共 9 个注册页面，9/9 已采集。**

---

## 2. 页面状态清单（实际采集到的）

### 2.1 Home — `pages/home/index`

| 状态 | 截图文件 | 触发 | 回读证据 |
|---|---|---|---|
| Default | `home__main__default.png` | `reLaunch('/pages/home/index')` | `hasNotifications: true`（铃铛红点） |
| Sheet: Notifications | `home__main__sheet-notifications.png` | `onNotifications()` | `sheetShow:true, sheetType:'notifications'` |
| Sheet: Weekly | `home__main__sheet-weekly.png` | `onWeekly()` | `sheetShow:true, sheetType:'weekly'` |
| Sheet: Memory detail | `home__main__sheet-memory.png` | `onMemoryOpen({detail:{id}})` | `sheetShow:true, sheetType:'memory'` |

### 2.2 Map — `pages/map/index`

| 状态 | 截图文件 | 触发 | 回读证据 |
|---|---|---|---|
| Default（= 首个 pin 已选中 + 卡片展开） | `map__main__default.png` | `reLaunch` | `demoMode:false, mapError:false` |
| Pin Selected（**第 3 个** marker） | `map__main__pin-selected.png` | `selectMapMemory(markers[2].memoryId)` | `selectedId:'c710cf1a…', cardCollapsed:false` |
| Card Collapsed | `map__main__card-collapsed.png` | `selectMapMemory` → `onTogglePlaceCard()` | `selectedId:'bd9f5b02…', cardCollapsed:true` |
| Filter Open | `map__main__filter-open.png` | `onToggleFilters()` | `showFilters:true, filter:'all'` |
| Search: Results | `map__main__search-results.png` | `onQuery({detail:{value:'海底捞'}})` | `query:'海底捞', resultsCount:1` |
| Search: No results | `map__main__search-no-results.png` | `onQuery({detail:{value:'zzqqxx'}})` | `query:'zzqqxx', resultsCount:0` |
| Filter: Favorites（**空态**） | `map__main__filter-favorites.png` | `onToggleFilters()` → `onFilterPick({value:'favorites'})` | `filter:'favorites', resultsCount:0, emptyState:'地图上暂无收藏'` |
| Zoomed In | `map__main__zoomed-in.png` | `onZoomIn()` ×6 | `mapScale: 13 → 14.24`（`zoomInDisabledAt:17.95`） |

### 2.3 Add — `pages/add/index`

| 状态 | 截图文件 | 触发 | 回读证据 |
|---|---|---|---|
| Default（空草稿） | `add__form__default.png` | `reLaunch` | `businessFrozen:false`；草稿 `restaurant:'' photos:0 tags:0 location:null` |
| Import panel open | `add__form__import-open.png` | `onUniversalImport()` | `importOpen:true` |
| 「细微之处」展开 | `add__form__more-open.png` | `onToggleMore()` + 滚动到 `.more-details` | `moreOpen:true` |
| Dining type manager | `add__form__dining-manager.png` | `onToggleMore()` → `onDiningTypeManager()` + 滚动 | `moreOpen:true, diningTypeManagerOpen:true` |
| Tag popover | `add__form__tag-popover.png` | `onToggleTagInput()` + 滚动到 `.tag-popover` | `showTagInput:true` |
| Validation error | `add__form__validation-error.png` | `showFieldError('restaurant', i18n.t(...))` | `errorField:'restaurant'`，`fieldErrors.restaurant:'请填写餐厅或地点名称。'` |

> ⚠️ 校验错误态走的是页面**自己的** `showFieldError()`（它会 `pageScrollTo('#field-restaurant')`）。
> **没有**调用 `onSave()`——那会真的触发一次保存并写云数据。

### 2.4 Us — `pages/us/index`

| 状态 | 截图文件 | 触发 | 回读证据 |
|---|---|---|---|
| Default | `us__main__default.png` | `reLaunch` | — |
| Sheet: Together | `us__main__sheet-together.png` | `onTogether()` | `sheetShow:true, sheetType:'together'` |
| Sheet: Journey | `us__main__sheet-journey.png` | `onJourney()` | `sheetShow:true, sheetType:'journey'` |
| Sheet: Library (shared) | `us__main__sheet-library-shared.png` | `onSeeAll()` | `sheetShow:true, sheetType:'library'` |

### 2.5 Me — `pages/me/index`

| 状态 | 截图文件 | 触发 | 回读证据 |
|---|---|---|---|
| Default | `me__main__default.png` | `reLaunch` | — |
| Sheet: Profile editor | `me__sheet__profile.png` | `onEditProfile()` | `sheetType:'profile'` |
| Sheet: Library | `me__sheet__library.png` | `onStatsCard()` | `sheetType:'library'` |
| Sheet: Preferences | `me__sheet__preferences.png` | `onMenuRow('preferences')` | `sheetType:'preferences'` |
| Sheet: Settings | `me__sheet__settings.png` | `onMenuRow('settings')` | `sheetType:'settings'` |
| Sheet: Privacy | `me__sheet__privacy.png` | `onMenuRow('privacy')` | `sheetType:'privacy'` |
| Sheet: Personalize | `me__sheet__personalize.png` | `onMenuRow('personalize')` | `sheetType:'personalize'` |
| Sheet: Sync status | `me__sheet__sync.png` | `onMenuRow('sync')` | `sheetType:'sync'` |
| Sheet: Help & Feedback | `me__sheet__help.png` | `onMenuRow('help')` | `sheetType:'help'` |

### 2.6 二级页面

| 页面 | 状态 | 截图文件 | 回读证据 |
|---|---|---|---|
| Account & legacy data | Default | `account__main__default.png` | `locked:false`（非 identity-gate 分支） |
| Shared space & wishlist | Default | `space__main__default.png` | `locked:false` |
| Cloud tools | Default | `workspace__main__default.png` | `locked:false` |
| Annual reports | Default | `reports__main__default.png` | `locked:false` |

---

## 3. 公共组件清单

### 3.1 项目自带组件（`miniprogram/components/`）

| 组件 | 职责 | 出现位置 |
|---|---|---|
| `s-sheet` | **底部弹层壳**，13 种内容分支（见 §3.2） | Home / Map / Us / Me |
| `s-toast` | `store.notify()` 驱动的底部深色 pill | Home / Map / Add / Us / Me |
| `s-icon` | Lucide 图标渲染（`iconSvg()`） | 全部页面 |
| `s-morph` | Morphicons 双态图标变形（**TabBar 专用**） | `custom-tab-bar` |
| `s-memory-row` | 回忆列表行（`triggerEvent('open',{id})`） | Home 最近列表 |
| `s-profile-editor` | 头像 / 名字 / bio 表单 | 经 sheet（`type:'profile'`） |
| `s-settings-editor` | preferences / settings / privacy 三视图 | 经 sheet |
| `s-identity-gate` | 身份验证闸门（重试 + 诊断） | Account / Space / Workspace / Reports 的 `locked` 分支 |

### 3.2 弹层类型覆盖（`components/sheet`）

`components/sheet/index.js` 分发 **13 种** `displayType`。**13/13 已采集**：

`memory` · `library` · `sync` · `personalize` · `profile` · `together` ·
`preferences` · `settings` · `privacy` · `weekly` · `journey` · `notifications` · `help`

### 3.3 通用 UI 元素（截图可见）

| 元素 | 说明 | 代表截图 |
|---|---|---|
| **Navigation** | `navigationStyle: custom` — 无系统导航栏，各页自带标题区 | 全部 |
| **Tab Bar** | `custom-tab-bar`：5 项，Add 为中央凸起按钮（size 66），其余 46/48；选中态由 `visualSelected` 驱动 | 全部 Tab 截图 |
| **Button** | 主按钮（深色 pill，`.ui-primary`）、次级按钮（`.secondary-button`）、`mini` 按钮、危险按钮（`.ui-danger`） | Add「保存回忆」/ Space / Workspace |
| **Floating Button** | Home 铃铛（`.notification-button` + 红点）、Map 缩放步进器（`+` / `−`）、Map 定位、TabBar 中央 Add | `home__main__default` / `map__main__*` |
| **Card** | `.glass.content-card` 玻璃卡（每周卡 / 统计卡 / 菜单卡）、Map 地点卡、`.place-collapse` 收起条 | `home__main__default` / `map__main__card-collapsed` |
| **Sheet** | 见 §3.2 | 全部 `*__sheet-*` |
| **Modal** | 无自定义 modal；使用系统 `wx.showModal` | 未采集（见 §4） |
| **Search** | Map 顶部搜索框 + 清除按钮 + 结果计数 | `map__main__search-results` / `map__main__search-no-results` |
| **Input** | Add 表单输入、`.tag-popover` 标签输入、sheet 内编辑器输入 | `add__form__tag-popover` / `me__sheet__profile` |
| **Map Controls** | 缩放步进器、定位、筛选按钮、原生 POI 开关 | `map__main__default` / `map__main__filter-open` |
| **Image Viewer** | 回忆详情大图 + 缩略图横滑（`.photo-thumbnail-scroll`） | `home__main__sheet-memory` |
| **Toast** | 底部深色 pill | 瞬态，未单独采集 |
| **Empty state** | `.empty-state` / `.ui-empty` | `map__main__filter-favorites` / `map__main__search-no-results` |

---

## 4. Uncaptured / Blocked

**没有为了截图而破坏数据。** 下列状态**未采集**，原因如实列出。

### 4.1 需要「零数据账号」（当前测试账号有 17 餐食 / 16 地点，清空属破坏性操作）

| 状态 | 判据 | 原因 |
|---|---|---|
| `home / Main / Empty` | `wx:if="{{!memories.length}}"` | 需要账号零记录 |
| `us / Main / Shared empty` | `wx:if="{{!sharedRows.length}}"` | 同上 |
| `map / Main / No memories at all` | `emptyMapState` 的「无任何回忆」分支 | 同上（已用 `filter-favorites` 采集到**等价空态卡**） |

### 4.2 需要真实数据 / 外部条件

| 状态 | 判据 | 原因 |
|---|---|---|
| `add / Form / GeographyOpen` | `wx:if="{{draft.location && (geoOpen\|\|…)}}"` | 需要草稿已有**选定地点**；获取地点只能走 `wx.chooseLocation` **原生选择器** |
| `add / Form / Photo filled` / `Photo strip` | `draft.photos.length` | 需要带照片的草稿 |
| `add / Form / Uploading` / `Saving` | `uploading` / `saving` | 需要进行中的真实上传 |
| `add / Form / Frozen` | `businessFrozen` | 需要身份诊断激活 |
| `add / Form / Import searching / matches / done-empty` | `importSearching` / `importMatches.length` | 需要真实联网检索结果 |
| `map / Main / Map error` | `wx:if="{{mapError}}"` | 需要地图组件加载失败 |
| `map / Main / Cluster open`（聚合抽屉） | `clusterOpen` | 当前数据未形成同坐标聚合组 |
| `space / Main / Bound`（已绑定空间） | `wx:if="{{space}}"` | 当前为 **unbound** 分支（已采集该分支） |
| `workspace / *` 各卡片（tasks / jobs / remote profile / reminder） | 多个 `wx:if` | 需要登录 + 云配置 + 任务数据；已采集默认态 |
| `reports / Main / Report card` | `wx:if="{{report}}"` | 需要年度数据 |
| `me / Main / Avatar blank` | `wx:else` | 当前 profile 已有头像 |
| `* / Identity gate (locked)` | `locked === true` | 当前会话 `locked:false`；需要锁定的身份会话 |

### 4.3 结构性不可达

| 项 | 原因 |
|---|---|
| `pages/morph-lab/index` | **不在 `app.json.pages`**，全库无任何 `navigateTo` / `switchTab` 指向它 ⇒ 只能靠开发者工具直接编译该路由访问 |
| TabBar morph 动画中间帧 | 瞬态（`s-morph` 飞行中），非稳定 UI 状态 |

### 4.4 系统原生面板（**不是小程序自身 UI**）

`wx.chooseLocation`（腾讯地图选点）、`wx.chooseMedia` / `wx.chooseImage`（相册 / 相机）、
`wx.showActionSheet`、`wx.showModal`、`wx.previewImage`、`wx.openLocation`、`wx.shareFileMessage`。

这些由微信 / 操作系统绘制，不属于产品 UI；本采集通道也不保证覆盖原生浮层。
**用户关心的「地图选点前 / 选点后」属于这一类**，因此未采集。

### 4.5 真机状态

全部 35 张均为**模拟器**证据。真机专属状态（原生地图渲染、权限面板、真机字体与安全区）**未采集**。

---

## 5. 输出物索引

```
ui-panorama/
├── UI_Panorama_Master.png            ← 完整索引视图（35 格，2384×7610）
├── 01_overview/UI_Panorama_01_Overview.png    9 格：5 个 Tab + 4 个二级页（默认态）
├── 02_home/UI_Panorama_02_Home.png            4 格
├── 03_map/UI_Panorama_03_Map.png              8 格
├── 04_add/UI_Panorama_04_Add.png              6 格
├── 05_us/UI_Panorama_05_Us.png                4 格
├── 06_me/UI_Panorama_06_Me.png                9 格
├── 07_secondary/UI_Panorama_07_Secondary.png  4 格
└── screens/                                   35 张独立截图
```

独立截图命名：`[模块]__[页面]__[状态].png`（例：`map__main__pin-selected.png`）。
每格上方标注 `模块 / 页面 / 状态`，按模块分色。

---

## 6. 遗漏检查（对照 Routes / Pages / Tabs / Components / States）

| 检查项 | 结果 |
|---|---|
| 所有一级 Tab 已覆盖 | ✅ **5 / 5**（Home / Map / Add / Us / Me） |
| 所有注册页面已覆盖 | ✅ **9 / 9** |
| 主要详情页已覆盖 | ✅ 回忆详情（`sheet:memory`，Home + Map 入口） |
| 主要 Modal / Sheet 已覆盖 | ✅ **13 / 13** sheet 类型 |
| 地图核心状态已覆盖 | ✅ 默认 / 换 pin / 收起 / 筛选面板 / 筛选结果 / 搜索有结果 / 搜索无结果 / 缩放（8 个） |
| 主要空状态已覆盖 | ⚠️ **部分**：Map 两个空态已采集；Home / Us 空态被阻塞（§4.1） |
| 主要交互状态已覆盖 | ✅ 展开 / 收起 / 选中 / 编辑面板 / 导入面板 / 校验错误 |
| 独立截图 ↔ Panorama 一一对应 | ✅ 35 / 35 |
| `UI_INVENTORY.md` ↔ 实际截图一致 | ✅ 35 / 35（见 §2 与 `screens/`） |

---

## 7. 采集过程中发现的问题（**只记录，未处理**）

按任务要求「发现问题只记录、不处理」，以下为采集过程本身暴露的现象：

1. **Map 默认态即已选中首个地点。** `applyFilters` 在无 `preferredId` 时回退 `visible[0]`，
   所以「Default」和「Pin Selected」在产品上不是两个状态。已如实记录，未改动。
2. **首轮 5 个状态「数据已变但画面未变」**，已通过重采修正：
   - `add / Form / more-open`、`geo-open`、`dining-manager` —— 目标区块在**首屏之外**，需先滚动；
   - `map / pin-selected` —— 与 Default 重复（见第 1 点）；
   - `add / Form / tag-popover` —— 同上，需滚动。
   这不是渲染层 bug，是**采集方法问题**（未滚动到目标区域）。
3. **`add / Form / DiningTypeManager` 的 `diningTypeRows` 回读为 0**，但面板正常渲染出
   8 个系统类型 + 「我的」区。说明 `diningTypeRows` 不是该面板的数据源（面板数据来自
   `managedBuiltinRows` / `managedCustomRows`）。
4. **截图通道分辨率上限 374×809**（逻辑 428×926 的 0.874×），小控件不适合做像素级判读。
5. **`add` 的 `geoOpen` 状态需要草稿已有地点**，而该草稿当前为空 ⇒ 无法在不注入数据的前提下采集。
