# Savor 微信小程序

`Savor` 五屏概念图（Home / Map / Add / Us / Me）的微信小程序移植版，与仓库根目录的 React 版本共享同一套数据模型、文案与视觉语言。

## 运行方式

1. 打开微信开发者工具，选择「导入项目」，目录指向本文件夹（`miniprogram/`）。
2. AppID 可使用测试号（`project.config.json` 中默认 `touristappid`），基础库建议 2.20 及以上（默认 3.x）。
3. 编译后即可在模拟器中体验；地图、`wx.chooseMedia`、`wx.shareFileMessage` 等能力建议真机预览。

无需 `npm install`，项目不依赖任何 npm 包。

## 架构对照（React → 小程序）

| React 版本 | 小程序版本 | 说明 |
| --- | --- | --- |
| `src/App.tsx` 五台设备并列的画廊 | `app.json` `tabBar.custom` + `custom-tab-bar/` | 真机即"一台手机"，五个屏幕成为五个 tab 页；中间的 "+" 由自定义 tabBar 渲染 |
| `SavorProvider` Context + `localStorage` | `utils/store.js` + `wx.setStorageSync` | 可订阅的单例仓库，页面在 `onShow` 中 `store.bind`，在 `onHide/onUnload` 释放 |
| `src/data.ts` | `utils/data.js` | 种子记忆、默认资料/设置、`isMemory` 校验、统计与排序 |
| `Primitives.tsx`（Icon/MemoryRow/Toggle/Stat） | `components/icon`、`components/memory-row`、`app.wxss` 共享类 | 图标为 Lucide 路径生成的 SVG data URI，不使用 Unicode 字符作按钮 |
| Web 端 `header` | `components/page-header` | 自定义导航栏，按 `wx.getMenuButtonBoundingClientRect()` 避开胶囊按钮 |
| `Sheets.tsx` 内嵌抽屉 | `pages/memory`、`pages/library`、`pages/sheet?type=…` | 抽屉改为原生页面栈导航，`sheet` 页按 `type` 渲染九种面板 |
| Leaflet + CARTO 瓦片 | 原生 `<map>` 组件 | 照片图钉通过 `customCallout` + `<cover-view slot="callout">` 实现，搜索/筛选/地点卡片以普通 `view` 同层叠加 |
| `<input type="file">` + Canvas 压缩 | `wx.chooseMedia` + `FileSystemManager` | 选图后复制到 `wx.env.USER_DATA_PATH/savor/` 持久化，删除记忆时同步清理文件 |
| 下载 JSON / 上传 JSON | `wx.shareFileMessage` / `wx.chooseMessageFile` | 导出到聊天（不支持时退回剪贴板）；导入时校验、去重，并把 Web 版导出的 base64 照片落盘为文件 |
| `data-theme` 主题 | `.page.theme-dusk` CSS 变量 | Pearl / Dusk 两套令牌，自定义 tabBar 同步跟随 |
| `framer-motion` | `hover-class` + CSS 过渡 | 小程序内保持克制的动效 |

## 目录结构

```
miniprogram/
├── app.js / app.json / app.wxss      入口、全局配置（自定义导航 + 自定义 tabBar）、全局样式
├── custom-tab-bar/                   底部导航（Home · Map · ＋ · Us · Me）
├── components/
│   ├── icon/                         s-icon：SVG 图标组件
│   ├── page-header/                  自定义导航栏（返回/关闭、标题、右侧插槽）
│   └── memory-row/                   记忆列表行
├── pages/
│   ├── home/  map/  add/  us/  me/   五个 tab 页
│   ├── memory/                       记忆详情（多图预览、心动/收藏/共享、删除、转发）
│   ├── library/                      记忆集合（筛选、搜索、备份导出/导入）
│   └── sheet/                        profile · together · preferences · settings · privacy · weekly · journey · notifications · help
├── utils/
│   ├── data.js  store.js  image.js  icons.js  format.wxs
└── images/                           示例照片、透明 marker 锚点
```

## 数据与隐私

- 所有数据保存在本设备（`savor-diary-v1`），草稿保存在 `savor-draft-v1`；没有账号、服务器或云同步。
- "共享" 指把记忆加入本地日记的 Us 页面；"Send to a friend" 使用微信原生转发卡片。
- 清除小程序缓存会删除日记，请先在 Memories 中导出备份。备份 JSON 与 Web 版格式互通。
- 示例照片来自 Pexels，地图瓦片来自腾讯地图，需要网络；用户上传的照片保存在本地。

## 已知限制

- 地图为腾讯地图，巴黎、东京等海外城市的街道细节较少；新增地点使用所选城市的近似中心坐标。
- 未申请定位权限，"Recenter" 回到巴黎示例视野而非用户位置。
- 圆形照片图钉依赖 `cover-view` 的 `border-radius`，个别旧版 Android 上可能显示为方形。
- 衬线标题使用系统字体（Georgia / 宋体等）回退，未加载网络字体。
- 本目录已通过 Node 侧的语法、配置、模板闭合与数据层行为测试，尚未在微信开发者工具或真机上运行验证。
