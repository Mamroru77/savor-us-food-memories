# Codex 启动提示词

你正在接手一个微信原生小程序项目，正式名称是 **「垃圾虫和小小琪的觅食记」**。

请先做以下事情，不要直接重构：

1. 阅读交接包中的 `施工计划.md`、`README_FOR_CODEX.md`、`notes/BUG_HANDOFF.md`、`REFERENCE_INDEX.md`。
2. **如果 Codex 当前已经打开用户本机的实际项目目录，以当前 working tree 为源码真相。** 交接包里的 `source/current_project/` 是用户最后上传到聊天的源码快照，`source/latest_chat_generated_filterfix.zip` 是聊天中最后一次生成的修正版快照，仅用于对比和找回上下文，不要无脑覆盖本机项目。
3. 第一目标是最小范围修复当前编译错误，而不是加新功能。

## 当前最明确的 Bug

微信开发者工具最新报错：

```text
Bad attr `class` with message: unexpected `;` at pos8.
File: ./pages/add/index.wxml
around line 66
```

当前/近期源码里星级评分曾写成：

```xml
class="star {{item &lt;= lajiChongRating ? 'on' : ''}}"
```

以及：

```xml
class="star {{item &lt;= xiaoXiaoQiRating ? 'on' : ''}}"
```

`&lt;=` 会让微信 WXML 在属性表达式中把实体分号解析成非法字符。优先用等价且 XML 属性安全的比较方向：

```xml
class="star {{lajiChongRating >= item ? 'on' : ''}}"
class="star {{xiaoXiaoQiRating >= item ? 'on' : ''}}"
```

如果当前基础库/编译器仍不接受属性内的三元表达式，则不要继续和 WXML parser 对抗：在 `index.js` 中生成 `{ score, active }` 星级数组，让 WXML 只读取 `item.active`。

最新错误截图：`references/chat_screenshots/c2a6af42-5f02-4d71-a1f7-e8c07d049e9f.png`。

注意：**Stage 2 修改前静态首页已经能正常出现画面**，所以项目 AppID、基础页面路由、云环境初始化不是第一怀疑对象。此前的 `WXML file not found`、热重载 timeout、`_route_ is not defined` 都出现过；最新日志已经能读取 `pages/add/index.wxml` 并定位具体语法行，`_route_` 优先视为页面编译失败后的次级错误。

## 修复后继续验证 Stage 2

保持现有技术栈、视觉和数据设计，不要换框架，不要删除 CloudBase 环境 ID，不要大改首页。

按顺序验证：

1. 全工程搜索 WXML 中不安全的实体/表达式、未闭合标签、非法 class/style 插值，并修复所有明确编译问题。
2. 检查 `app.json` 页面声明与 `pages/add/` 四件套路径一致。
3. 检查 `pages/add/index.js` 事件名与 WXML `bindtap/bindinput/bindchange` 完全一致。
4. 首页能正常渲染；点击底部 `+` 能进入 `/pages/add/index`。
5. 两组星级评分能点击且亮星正确；表单输入、菜品添加/删除、图片选择不报错。
6. 检查 `cloudfunctions/mealRecords/`：不要把数据库写权限直接裸放客户端；确认 `get/list/create` 等 action 的输入校验和 openid 归属逻辑。
7. 给出微信开发者工具中需要人工执行的操作：`mealRecords` 右键 → 上传并部署（云端安装依赖）。
8. 用无照片记录先跑通：`记一顿 → mealRecords → dining_records → 返回首页 → 首页刷新`。
9. 再测试照片上传到云存储与首页临时 URL 展示。
10. Stage 2 验收通过后，才进入 `施工计划.md` 的 Stage 3「情侣绑定」。

## 产品与 UI 约束

- 核心是两个人共同维护的美食回忆，不是点评/外卖平台。
- 美食记录与情侣回忆约 50:50，照片是第一视觉核心。
- UI：温暖手账感 + 少量轻可爱；奶油白、暖米色、浅杏、低饱和粉橘/珊瑚色；圆角、大留白、大图；不要儿童化、不要满屏粉色。
- 最重要的视觉参考：`references/design/两人食记小程序五屏展示.png`。图中“两人食记”只是旧概念名，代码/文案使用正式名称「垃圾虫和小小琪的觅食记」。
- 当前品牌头像方向：`references/design/甜蜜餐点主题食谱本.png`。
- 万能导入后续参考：`references/design/a_clean_pastel_app_ui_design_mockup_flow_chart_p.png`。
- 餐厅实体与一次用餐记录必须分离；同一家餐厅允许多次到访。

## 输出要求

完成本轮后请给我：

1. 实际修改了哪些文件及原因。
2. 当前 Bug 的根因。
3. 仍存在的风险/未验证项。
4. 我需要在微信开发者工具手动做的步骤（尽量少）。
5. 如果能继续，在不扩大范围的前提下把 Stage 2 数据闭环修到可测试状态。
