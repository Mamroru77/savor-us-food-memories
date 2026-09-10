# 参考图索引

## 产品设计参考

- `references/design/两人食记小程序五屏展示.png`
  - 最重要的整体 UI 参考：回忆首页、记一顿、餐厅详情、地图、想吃清单五屏。
  - 注意图中旧概念名“两人食记”已废弃，正式名称是“垃圾虫和小小琪的觅食记”。

- `references/design/a_clean_pastel_app_ui_design_mockup_flow_chart_p.png`
  - “万能导入”视觉和交互参考：大众点评/美团/淘宝闪购/京东外卖链接与截图 OCR 导入。

- `references/design/甜蜜餐点主题食谱本.png`
  - 当前最认可的头像/品牌主视觉，已经针对圆形与圆角方形裁剪做过安全区调整。

- `references/design/温馨美食食谱手账图标.png`
  - 手账/食谱本头像方向参考。

- `references/design/爱心美食地图图标.png`
  - 爱心地图 + 餐具方向参考。

- `references/design/暖心饭团情侣图标.png`
  - 更可爱情侣感的头像方向参考。

- `references/design/imagegen.png`
  - 头像备选图之一。

- `references/design/e1fbc805-cf22-41b2-a53a-b378accfc92d.png`
  - 微信后台头像的方形/圆形双预览截图，用来说明裁剪安全区要求。

## 当前最关键调试截图

- `references/chat_screenshots/c2a6af42-5f02-4d71-a1f7-e8c07d049e9f.png`
  - 最新报错：`pages/add/index.wxml` 第 66 行附近，`Bad attr class: unexpected ';'`。

- `references/chat_screenshots/f4522b2b-72b0-4432-ad5a-f522bd954ee0.png`
  - 之前 `WXML file not found: ./pages/add/index.wxml` 的截图。

- `references/chat_screenshots/e9ce72ef-8c77-4c01-89bb-52fe86fcb48a.png`
  - 早期热重载 `unexpected current frame status timeout`。

- `references/chat_screenshots/62464f5a-1527-4372-934b-1545fad11156.png`
  - `cloudfunctions/mealRecords` 已出现在项目树中的阶段截图。

## 环境与项目结构截图

以下全部保留在 `references/chat_screenshots/`，供排查开发工具/备案/云环境背景：

- 小程序开发与发布流程、类目选择、备案页面。
- 微信开发者工具创建项目页。
- 云开发免费环境和费用管理页。
- 项目目录树、`envList.js`、`app.js` 环境 ID。
- 不同阶段的 Console 报错截图。

这些文件保留原始 UUID 文件名，以避免错误映射。调试时优先看上面列出的关键截图。
