# Codex 交接包：垃圾虫和小小琪的觅食记

这是当前 ChatGPT 对话的开发/设计交接包。

## 使用方式

- 如果 Codex 已经在用户电脑的实际小程序项目中运行：**以当前 working tree 为源码真相**，不要用交接包覆盖本机代码。
- `source/current_project/`：用户最后上传到聊天的源码快照，用于对照。
- `source/current_project_original.zip`：该次用户上传的原始 ZIP。
- `source/latest_chat_generated_filterfix.zip`：聊天中最后一次生成并让用户打开的 filterfix 项目快照；用户最新错误截图来自这一阶段。
- `施工计划.md`：当前完整产品/开发路线。
- `notes/BUG_HANDOFF.md`：最新编译错误、历史误区、建议修法。
- `CODEX_PROMPT.md`：推荐直接复制给 Codex 的启动提示词。
- `references/design/`：全部主要 UI/头像设计参考。
- `references/chat_screenshots/`：对话中保留下来的备案、云环境、项目结构、错误截图。

## 当前状态

- 正式名称：**垃圾虫和小小琪的觅食记**。
- 微信小程序备案：已成功。
- 服务类目：工具 → 备忘录。
- 技术栈：微信原生小程序 + 微信云开发 CloudBase；后续腾讯位置服务。
- 云环境已建立，`miniprogram/app.js` 已有实际环境 ID，**不要删除/替换成占位符**。
- Stage 1 静态首页已经成功出现过画面。
- 当前 Stage 2：打通 `记一顿 → 云存储/mealRecords → dining_records → 首页刷新`。
- 最新阻塞是 `pages/add/index.wxml` 星级 `class` 表达式解析错误；最新截图见 `references/chat_screenshots/c2a6af42-5f02-4d71-a1f7-e8c07d049e9f.png`。

## 先做什么

1. 阅读 `notes/BUG_HANDOFF.md`。
2. 最小范围修复 WXML 编译问题。
3. 不要在修 bug 前继续加地图、情侣绑定、导入等新功能。
4. 修复后验证首页、add 页和 Stage 2 数据链路。
5. Stage 2 完成后再按照 `施工计划.md` 进入情侣绑定。

## 约束

- 不要把产品改成“大众点评/外卖平台”；核心仍是情侣共同维护的美食回忆。
- 美食记录与情侣回忆各占约 50%。
- 照片是主要视觉载体。
- UI：温暖手账 + 少量可爱情侣感，奶油白/暖米色/浅杏/低饱和粉橘。
- 餐厅实体与“一次用餐记录”必须分离，一家店允许多次到访。
