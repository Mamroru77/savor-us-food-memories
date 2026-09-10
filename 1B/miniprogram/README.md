# Savor 微信小程序

`Savor` 五屏概念图（Home / Map / Add / Us / Me）的原生微信小程序移植版，与仓库根目录的 React 版本共享同一套数据模型、英文文案与视觉语言。本目录是**独立可导入**的小程序工程，不依赖 React runtime、DOM、Leaflet、Framer Motion 或 Web localStorage，不使用 WebView 套壳。

---

## 1. 如何导入微信开发者工具

1. 打开「微信开发者工具」，选择「导入项目」。
2. 目录指向本文件夹（`miniprogram/`），即可导入（`project.config.json` 的 `miniprogramRoot` 为 `./`）。
3. AppID 使用测试号（默认 `touristappid`）即可运行；上线前替换为真实 AppID。
4. 基础库要求 **≥ 2.20**（`project.config.json` 默认 `libVersion: 3.7.0`）。
5. 无需 `npm install`，项目不依赖任何 npm 包。
6. 地图（`<map>`）、`wx.chooseMedia`（相册/相机）、`wx.shareFileMessage`（导出备份）建议在真机预览验证。

---

## 2. 项目目录

```
miniprogram/
├── app.js / app.json / app.wxss      入口；全局配置（自定义导航 + 自定义 tabBar + lazyCodeLoading）；全局设计令牌
├── custom-tab-bar/                   底部导航（Home · Map · ＋ · Us · Me），中间「＋」为特殊圆形按钮
├── components/
│   ├── icon/                         s-icon：SVG data-URI 图标组件（Lucide 路径，无 Unicode 字符按钮）
│   ├── page-header/                  自定义导航栏（状态栏留白、返回/关闭、标题、右侧插槽，避开胶囊按钮）
│   └── memory-row/                   记忆列表行（缩略图、标题、日期、地点、右箭头，图片失败回退）
├── pages/
│   ├── home/ map/ add/ us/ me/       五个一级 tab 页
│   ├── memory/                       记忆详情（多图预览、心动/收藏/共享、删除确认、转发）
│   ├── library/                      记忆集合（筛选 / 搜索 / 导出导入备份）
│   └── sheet/                        profile · together · preferences · settings · privacy · weekly · journey · notifications · help 九种面板
├── utils/
│   ├── data.js                       种子记忆、默认资料/设置、数据校验（isMemory）、统计与排序
│   ├── store.js                      可订阅单例仓库 + wx.setStorageSync 持久化
│   ├── image.js                      选图、文件持久化、base64 落盘、删除清理、隐私前置检查
│   ├── icons.js                      图标路径与 SVG/base64 编码
│   └── format.wxs                    WXML 内日期格式化与复数字符串
├── images/                           le-comptoir.jpg、paris-evening.jpg、pin.png（透明 marker 锚点）
├── tools/verify.cjs                  静态验证脚本（JSON / WXML / 路径 / 数据层冒烟测试）
├── project.config.json / sitemap.json
```

---

## 3. Web → 小程序架构映射

| React 版本 | 小程序版本 | 说明 |
| --- | --- | --- |
| `src/App.tsx` 五台设备并列画廊 | `app.json` `tabBar.custom` + `custom-tab-bar/` | 真机即「一台手机」，五屏成为五个 tab 页 |
| `SavorProvider` Context + `localStorage` | `utils/store.js` + `wx.setStorageSync` | 页面在 `onShow` `store.bind`，在 `onHide/onUnload` 释放订阅 |
| `src/data.ts` | `utils/data.js` | 种子记忆、默认资料/设置、`isMemory` 校验、`stats` 统计、`sortShared` 排序 |
| `Primitives.tsx`（Icon/MemoryRow/Toggle/Stat） | `components/icon`、`components/memory-row`、`app.wxss` 共享类 | 图标为 Lucide 路径 SVG data URI，不使用 emoji / 字体图标 / Unicode 字形按钮 |
| Web 端 `header` | `components/page-header` | 自定义导航栏，用 `wx.getMenuButtonBoundingClientRect()` + 状态栏高度，不写死 44px |
| `Sheets.tsx` 内嵌抽屉 | `pages/memory`、`pages/library`、`pages/sheet?type=…` | 抽屉改为原生页面栈导航，`sheet` 按 `type` 渲染九种面板 |
| Leaflet + CARTO 瓦片 | 原生 `<map>` | 照片图钉用 `marker.customCallout` + `<cover-view slot="callout">`；搜索/筛选/地点卡片为普通 `view` 同层叠加 |
| `<input type=file>` + Canvas 压缩 | `wx.chooseMedia`（sizeType compressed）+ `FileSystemManager` | 选图后复制到 `wx.env.USER_DATA_PATH/savor/` 持久化 |
| 下载 JSON / 上传 JSON | `wx.shareFileMessage` / `wx.chooseMessageFile`（退回剪贴板） | 导出到聊天；导入校验 + 去重，Web 的 base64 照片落盘为文件 |
| `data-theme` 主题 | `.page.theme-dusk` CSS 变量 | Pearl / Dusk 两套令牌 |
| `framer-motion` | CSS 过渡 + `hover-class` | 尊重 `reduceMotion` 设置（`.reduce-motion` 关闭过渡） |

---

## 4. 页面说明

- **Home**：Savor the moment. 引导语、本周卡片（Meals / Places）、Recent 列表、通知铃铛（含未读圆点）。
- **Map**：原生地图上的照片标记、地点信息卡、餐厅/城市/Tag 搜索、All/Favorites/Shared 筛选、Recenter、无结果空态。
- **Add**：新增记忆（餐厅、城市、日期、评分、标签、Notes、共享/收藏、最多四张照片），含草稿保存/恢复与表单校验。
- **Us**：共享空间（together 天数、love 按钮、Our Journey 统计、Shared Moments 画廊、点赞）。
- **Me**：Profile（头像、编辑）、统计卡、Preferences / Memories / Privacy / Settings / Help & Feedback 入口。
- 二级：`memory`（详情）、`library`（集合/备份）、`sheet`（九种面板）。

---

## 5. 数据存储说明

- 主数据键 `savor-diary-v1`（`wx.setStorageSync`），草稿键 `savor-draft-v1`。
- 结构：`{ memories, profile, settings, feedback }`，与 Web 版完全兼容。
- 读写健壮：JSON 解析失败、字段缺失、非法 Memory、空数组均回退到默认值；`load()` 用 `isMemory` 逐一校验，单个坏数据不会让小程序打不开。
- 每处 `setState` 后立即 `persist()`；空间不足时提示导出备份（绝不展示技术堆栈）。

---

## 6. 图片持久化说明

- 用户选图通过 `wx.chooseMedia`（`sizeType: ['compressed']`，系统压缩）得到临时文件，随即 `copyFileSync` 到 `wx.env.USER_DATA_PATH/savor/` 改名持久化，**不长期依赖 `tempFilePath`**。
- 删除记忆时同步 `unlinkSync` 清理该记忆的照片，避免遗留垃圾文件。
- 导入 Web 备份时，data URI（base64）照片会解码写盘为本地文件，避免每次渲染都处理巨大 base64。
- 示例照片 `savor/images/le-comptoir.jpg`、`paris-evening.jpg` 已本地化；其余示例图（Pexels CDN）与地图瓦片需要网络。

---

## 7. 地图说明

- 使用原生 `<map>`（腾讯地图，无需自行配置 key）；不再请求 CARTO / OSM 瓦片。
- 照片图钉：`marker.customCallout`（`display: 'ALWAYS'`）+ `<cover-view slot="callout">` 内 `<cover-image>` 圆形头像；点击经 `bindmarkertap` / `bindcallouttap` 返回 `markerId` 对应记忆。
- 搜索/筛选后 `includePoints` 自适应视野；单选点用 `moveToLocation`。
- 「Recenter」回到巴黎示例视野（未申请定位，见已知限制）。

---

## 8. Import / Export

- **导出**：生成 JSON（`{ version: 1, exportedAt, memories }`）写入用户目录，优先 `wx.shareFileMessage` 转发到聊天；不支持时退回 `wx.setClipboardData`（剪贴板共享属隐私例外，平台自动处理）。
- **导入**：`wx.chooseMessageFile`（`.json`），限制 ≤10MB、≤500 条，逐条 `isMemory` 校验、按 id 去重、base64 照片落盘。
- 与 Web 版备份**互通**：Web 导出可被小程序导入（base64→文件），小程序导出可被 Web 导入（本地路径在 Web 无对应文件时回退示例图）。

---

## 9. 权限说明

| 能力 | 接口 | 说明 |
| --- | --- | --- |
| 相册 / 相机 | `wx.chooseMedia` | 隐私接口，调用前做 `getPrivacySetting` 前置引导；拒绝/取消不阻塞，`fail` 路径给出友好提示 |
| 文件导入 | `wx.chooseMessageFile` | 从聊天选文件，非敏感接口 |
| 剪贴板 | `wx.setClipboardData` | 导出回退；平台自动触发隐私弹窗 |
| 位置 / 相机后台 | 无 | **未使用**，故无需 `requiredPrivateInfos`、`permission` 与 `requiredBackgroundModes` |

未声明任何用不到的权限。

---

## 10. 隐私注意事项

- 全部数据保存在本设备（WeChat 为本小程序分配的存储），无账号、无服务器、无云同步。
- 依据当前（基础库 ≥ 2.32.3）平台要求，`wx.chooseMedia` 属隐私接口：首次使用时 `image.js` 的 `ensurePrivacy()` 会先读取 `getPrivacySetting`，必要时弹窗引导；上线前需在「小程序管理后台 → 用户隐私保护指引」声明「相册（仅用户操作时）」「摄像头」，并配置指引链。
- 「共享」指把记忆加入本地日记的 Us 页面；「Send to a friend」是微信原生转发卡片，二者语义分离。
- 清除小程序缓存会删除日记，请先导出备份。

---

## 11. 需要配置的服务器域名

示例照片走 Pexels CDN（`images.pexels.com`）。若希望这些示例图在真机正常加载，需在「小程序管理后台 → 开发设置 → 服务器域名」配置：

- **request 合法域名**：预留（无后端请求）
- **downloadFile 合法域名**：`https://images.pexels.com`

说明：核心示例图已本地化到 `images/`；Pexels 图是外围一致性素材，缺网时代码已有回退（`memory-row` 的 `binderror` 显示本地占位图）。

---

## 12. 基础库要求

- **≥ 2.20**（`wx.getWindowInfo`、`lazyCodeLoading`）；`project.config.json` 默认 `libVersion: 3.7.0`。
- `wx.chooseMedia`（2.10.0+）、`wx.shareFileMessage`（2.16.1+）、`wx.chooseMessageFile`（2.5.0+）、`customCallout` 均已做 `wx.canIUse` / 存在性判断与回退。

---

## 13. 已验证内容（静态 / 自动化）

- 全部 JS 通过 `node --check` 语法检查。
- 全部 JSON 通过解析校验。
- WXML 标签闭合、`wx:for` 的 `wx:key`、`usingComponents`/页面/组件/图片路径均已核对（`tools/verify.cjs` 全绿）。
- 数据层冒烟测试：种子记忆、`isMemory` 正反例、图标渲染、记忆 id 唯一性通过。
- 修复项：补齐缺失的 `images/`（`le-comptoir.jpg`、`paris-evening.jpg`、透明 `pin.png`）；移除调试 `console`；`reduceMotion` 设置接入页面样式；`decodeURIComponent` 防崩溃；`chooseMedia` 增加隐私前置引导；Web 版依赖已装回并 `npm run build` 通过。

---

## 14. 尚未真机验证内容

- 未在微信开发者工具中真实编译运行（当前环境无该工具）。
- 未在真机验证：`<map>` 海外底图、`cover-view` 圆形图钉、`wx.chooseMedia`、`wx.shareFileMessage` / `wx.chooseMessageFile` 的真实行为。
- 结论请以上述「静态/自动化验证」为准，切勿据此认定「已真机验证」。

---

## 15. 已知平台差异

- 地图使用腾讯地图，巴黎/东京等海外城市街道细节少于 Leaflet；新增地点使用所选城市的近似中心坐标。
- 未申请定位权限，「Recenter」回到巴黎示例视野而非用户位置。
- 圆形照片图钉依赖 `cover-view` 的 `border-radius`，个别旧版 Android 可能退化为方形（属平台限制）。
- 衬线标题使用系统字体（Georgia / 宋体 / Noto Serif 等）回退，未加载网络字体。
- 抽屉 UI 以原生产品栈实现，横滑/弹簧等 Framer Motion 动效以克制的 CSS 过渡替代。

---

## 16. Web / 小程序 Backup 兼容说明

- 两端使用相同存储键 `savor-diary-v1` 数据形态与记忆字段（`id/restaurant/city/country/neighborhood/date/rating/tags/photo/extraPhotos/placePhoto/coordinates/shared/liked/saved`）。
- 共有 `isMemory` 等价校验（见 `data.js` 与 `src/data.ts`）。
- 导出 JSON `{ version:1, exportedAt, memories }` 均含全部记忆，互导时：Web 的 base64 照片 → 小程序本地文件；小程序本地文件路径 → Web 端按 `isSafeImage` 识别（`wxfile://` 在 Web 回退示例图）。
