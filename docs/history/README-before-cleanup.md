> **当前主项目（2026-09-16）**：请在微信开发者工具中导入本仓库根目录的 `project.config.json`；当前代码位于根目录的 `miniprogram/` 和 `cloudfunctions/`。原分支的 `source/current_project/`、`references/`、问题视频及交接材料仅作为历史归档保留，不是当前运行入口。
>
> 回归验证：在仓库根目录运行 `npm run verify:all`。`reports/` 仅提交测试必需的 16 个基准文件；本机私有配置、`.cli/`、运行截图、预览二维码和其他原始运行报告不纳入本次提交。静态测试通过不代表真机及双账号验收完成；最新状态见 `PROJECT_PROGRESS.md`、`UNIFIED_ACCEPTANCE.md` 和 `docs/visual-language-20260916.md`。

> **2026-09-14 · S4 最新状态**：已在同一批补齐云端备份/导入恢复、云档案/偏好与最小伙伴投影、年报/里程碑/分享、一次性提醒/反馈生产适配器。9类业务都有候选代码，新增53项自动检查与全量回归通过；**未部署、未真实投递、未原生/真机验收**。以 [总进度](../status/PROJECT_PROGRESS.md)、[S4实现](S4_IMPLEMENTATION.md)、[统一最终清单](../status/UNIFIED_ACCEPTANCE.md) 为准。下方旧批次状态仅供历史参考。

> **S3共享媒体更新（2026-09-14）**：共享照片登记、授权读取、撤回/取消、受控回收候选已接入。回收默认关闭，真实权限/存储/真机统一待最终验收。当前状态以 PROJECT_PROGRESS.md、S3_MEDIA_IMPLEMENTATION.md 为准，下方“照片尚未授权”是之前批次记录。继续完成剩余业务，不要求用户现在测试。

> **S2开发更新（2026-09-14）**：按用户“开发优先、最后统一验收”的决定，已继续实现双人空间、主动文字共享/独立评分和共同Wishlist候选。共享照片尚未授权，未部署/未真机验收。当前总进度见 PROJECT_PROGRESS.md；新增代码与限制见 S2_IMPLEMENTATION_PROGRESS.md。不要按旧S1提示词先阻断后续开发。

> **当前接手状态（2026-09-14）**：已整合用户 `4daeb2e` 正式 UI/Map 更新；Tab 微抽动暂缓，K1/VP1 已从当前代码移除。S1 身份与缓存分区候选代码已接入，尚未部署或真机验收。先读 [S1_IMPLEMENTATION_PROGRESS.md](S1_IMPLEMENTATION_PROGRESS.md)、[S1_DEPLOYMENT_AND_ROLLBACK.md](S1_DEPLOYMENT_AND_ROLLBACK.md) 和 [CODEX_S1_TEST_PROMPT.md](CODEX_S1_TEST_PROMPT.md)。下方 Tab“最新”条目是历史记录，不代表当前源码或发布结论。

> **临时 VP1 诊断版（非正式修复）**：E1 源页提前更新已被真机证据否决并删除；当前保留 VP1 标记、即时导航和 480ms 真实时间形变。见 [TAB_SOURCE_LEAVE_EXPERIMENT.md](TAB_SOURCE_LEAVE_EXPERIMENT.md)。

## 最新：Add 已采用 L 餐具主题 / 480ms

按确认方案，Add 未选中为官方 Utensils，选中为 UtensilsCrossed。五个Tab继续使用480ms、SVG首帧load/视图提交计时和防跳帧机制；按钮材质、尺寸、其他Tab和地图/卡片速度不变。详见 `ADD_UTENSILS_UPDATE.md`。当前官方源图案48个、兼容名称28个；较早预览中的笔形Add为历史方案。无需部署云函数，微信端体感与残影验收仍需确认。

## 最新：Tab 统一放慢到 480ms，并修正 SVG 首帧计时

五个 Tab 的图标过渡统一为 480ms。等待首帧 SVG load 和视图提交完成后再推进；后续提交延迟会延长播放，不再跳帧赶到结束。继续使用普通 SVG 图片层；地图/卡片320ms、正式Add Pen/PenLine及其他图案不变。新增Add候选只在独立预览中，等待选择。详见 `TAB_MOTION_TIMING_FIX.md`；微信端体感与残影验收仍待执行。无需部署云函数。

## 最新：Add 双态已更新为 Pen / PenLine

按确认的预览，Add 未选中为官方 Pen，选中为 PenLine。尺寸、圆形材质、1.75 描边、380ms 和 SVG 图片层修复保持不变。源图案共 47 个，兼容名称 26 个。详见 `ADD_PEN_UPDATE.md`；当前图案预览为 `design-references/add-tab-preview.html`。较早图标预览和更新日志中的 Plus/SquarePlus 属于历史方案。无需部署云函数；微信端显示和残影修复效果仍待实际确认。

## 最新：Tab 重复图标显示层修复

五个 Tab 的变形改由普通 SVG 图片层显示，不再挂载原生 Canvas；保留原端点、380ms、缓存重播与 Quiet。地图显示层不变。`Pen ↔ PenLine` 为单独待确认预览，正式 Add 暂保留原图案。详见 `TAB_SVG_LAYER_FIX.md`。截图根因未获实机唯一确认；原项目与解压包需通过完整检查，微信端视觉验收仍待执行。

## 最新：全量 Lucide 图标统一

已按逐项确认的预览落地 45 个官方图案，提示使用 Lightbulb；统一 1.75 圆角描边，清除剩余字符图标，并更新邮戳内部图案。S 品牌、外框、照片、地图交互及 Tab 380ms 过渡保持不变。详见 `ICONS_UNIFIED.md`。无需部署云函数，微信端视觉验收待执行。

> Timing refinement: Tab icon path transitions now use 380ms (previously 320ms); the map stack, card and menu timings are unchanged. The morph validation page uses the same updated component.

> Latest: [TAB_REPLAY_FIX.md](TAB_REPLAY_FIX.md) — explicit replay on cached Tab visits, unique sequences, no-op update suppression and rAF-stall fallback. Native repeat-switch acceptance pending.

> Latest: [APPROVED_TAB_STATE_PAIRS.md](APPROVED_TAB_STATE_PAIRS.md) — user-approved official Lucide rest/selected patterns; Tab path transitions with exact SVG endpoints and fallback. Native Tab animation acceptance pending.

> Latest: [TAB_LUCIDE_MORPH_VALIDATION.md](TAB_LUCIDE_MORPH_VALIDATION.md) — five Lucide outline tabs; isolated Canvas continuous-morph validation page. Native acceptance pending; production morph rollout is not enabled.

> Latest UI update: [LUCIDE_MOTION_UPDATE.md](LUCIDE_MOTION_UPDATE.md) — remaining character buttons replaced with Lucide; reversible popover/Sheet/Toast/FAQ transitions. Validated hybrid Map logic is unchanged.

> Latest: [MAP_HYBRID_STACK.md](MAP_HYBRID_STACK.md) — native anchored visuals with transparent ordinary hit regions; removes gesture polling. Native alignment/touch acceptance is pending.

> Latest: [MAP_GESTURE_FOLLOW.md](MAP_GESTURE_FOLLOW.md) — retain and reproject stamps during map drag; remove extra floating close button. Native gesture smoothness pending acceptance.

> Latest correction: [MAP_SVG_GESTURE_FIX.md](MAP_SVG_GESTURE_FIX.md) — SVG arrow and explicit mapError fallback condition.

> Latest Map rebuild: see [MAP_STACK_REBUILD.md](MAP_STACK_REBUILD.md). Replaces native callout child taps with projected ordinary-view controls; adds Map card transitions. Native acceptance pending.

# Savor — WeChat Mini Program

Savor（“Food memories. Shared forever.”）采用 best-ui 界面的**微信原生小程序**，已接入 Stage 2 CloudBase 主链路。
以 Web 基准分支 `gpt-6-astra-max-best-ui-claude-fable-5.1-max-transplant-ui` 的 `src/`
为唯一产品真值重建；未复用任何历史失败版本的整目录代码。

## 最新执行：根据真实诊断修复地图点击入口

见 [MAP_TAP_FIX_UPDATE.md](MAP_TAP_FIX_UPDATE.md)。用户实测程序调用可展开；本次将箭头改为单层直接点击，并给图片叶节点显式绑定点击；新增展开状态下的收起兜底入口。不混入素材调整。196/196 静态、175/175 mock 通过，真实手点仍待验收，仅客户端更新。

## 历史更新：统一标记布局与双向过渡

见 [MAP_STACK_MOTION_UPDATE.md](MAP_STACK_MOTION_UPDATE.md)。首项与子项统一在同一callout中，以真实坐标透明锚点定位；图标统一80×89px、静止间隙12px。约320ms、20ms数值帧实现展开上移／收起回落，支持反向和Quiet，不再逐项跳出。

196/196 静态、173/173 mock 通过；真机帧率和视觉仍待验收。仅客户端更新，其他页面与万能导入不动。

## 历史更新：修复地图展开箭头未显示

见 [MAP_CALLOUT_COMPAT_UPDATE.md](MAP_CALLOUT_COMPAT_UPDATE.md)。恢复 map customCallout 的 cover 组件结构，移除不受支持的样式，采用定时分步向上展开。只有多餐厅分组显示箭头。195/195 静态、171/171 mock 通过；原生界面待验收，仅客户端更新。

## 历史更新：按参考图重做展开标记

见 [MAP_REFERENCE_STACK_UPDATE.md](MAP_REFERENCE_STACK_UPDATE.md)。撤回绿色下方数量按钮／带底色列表；白色圆箭头在首标记上方，裸照片标记依次向上展开，收起箭头位于列顶。完整 markers 数组更新及正整数尺寸替代深层尺寸补丁，同层 view/image 替代 cover-view。

195/195 静态、169/169 mock 通过；开发者工具／真机视觉待验收。仅客户端更新，保留地图移动兼容修复，万能导入仍暂停。

## 历史更新：附近餐厅向上抽屉，修复地图模拟器报错

见 [MAP_UPWARD_DRAWER_UPDATE.md](MAP_UPWARD_DRAWER_UPDATE.md)。首家地图标记下方为展开箭头，其他餐厅照片标记向上排列，三项一页，点击更新底卡且保持抽屉。开发者工具跳过不支持的 moveToLocation；真机增加失败回退。不改餐厅坐标、不改 Me、万能导入本轮暂停。

195/195 静态、167/167 mock 通过；原生抽屉锚点／触摸及真机验收待执行。仅更新客户端，无需部署云函数或清缓存。

## 历史更新：商家页面资料与腾讯定位分开

见 [MERCHANT_PAGE_CORRECTION.md](MERCHANT_PAGE_CORRECTION.md)。原“云端商家搜索”实际为腾讯分店定位，现已纠正命名和分区。**用户所需的商家页面自动资料获取仍未接通**：五份已有公开链接复测均未取得可用商家页面内容，不以定位或文案解析冒充页面获取。

本次仅客户端更新；195/195 静态、161/161 mock 通过，真机 UI 待验收。旧误导名称下的开关选择不自动迁移，腾讯定位需重新明确开启，不修改后台。

## 历史更新：可自行开关云端搜索，完整保留导入参考资料

见 [IMPORT_SWITCH_DRAFT_UPDATE.md](IMPORT_SWITCH_DRAFT_UPDATE.md)。万能导入增加本机持久化开关；首次默认关闭，确认开启后只在点击搜索时请求，不改后台 true 配置。草稿参考区保留平台评分／人均、地区和地址线索、来源及原始类别，并支持云端保存和编辑回读；个人评分／实际花费仍独立。

195/195 静态、158/158 mock 通过，真机验收待执行。**先部署新版 mealRecords，再编译／发布客户端；placeLookup 本次无需重部署。**

## 历史更新：Console 修复与开发进度

见 [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md)。食记列表云图片改为临时 HTTPS 地址展示（不改原始记录和私有权限），补充异步防串图及有界失败重试；Sheet 主题图标改为 class 选择器。仅客户端更新，无需重部署云函数或清缓存。

195/195 静态、151/151 mock 通过。用户截图已证明腾讯地点搜索一次真实返回 10 个候选；本次图片／样式修复仍待设备验收。免费优先开关不变，双人共享与 Wishlist 尚未完成。

## 历史更新：免费优先，默认关闭云端商家搜索

见 [FREE_FIRST_UPDATE.md](FREE_FIRST_UPDATE.md)。本地类别提取继续保留，分店确认默认使用原生地图选点；客户端与后端双开关默认关闭云端商家搜索。可选 HTTP 请求期限降至 1800ms，不要求升级 3 秒云函数套餐。

195/195 静态、147/147 mock 通过；实际云端与真机未验收。需发布新版客户端、部署新版 placeLookup（PLACE_LOOKUP_ENABLED 缺省或 false）；mealRecords 如未更新仍需部署。整个应用费用仍受现有 CloudBase 免费额度与计费设置约束。

## 历史更新：通用导入类别与具体分店确认

见 [IMPORT_ENRICHMENT_UPDATE.md](IMPORT_ENRICHMENT_UPDATE.md)。已接入菜系／餐饮类型提取、来源提示、可选腾讯城市内分店搜索与显式确认，商家图片暂缓。Map D 保持，底卡类别改为真实字段。

验证：194/194 静态、144/144 mock 通过；未完成真实云端／真机验收。**本次必须先部署更新的 mealRecords 和新增 placeLookup，并在后端配置 Key 与私人 OPENID 白名单**；未配置仍可原生选点。详细步骤见上述文档。

## 历史更新：应用 D 方案，地图不重复显示店名

地图仅保留照片标记及必要的聚合数量。店名继续显示在底部详情卡片、收起小条与附近记录选择列表。已移除名称牌及其额外碰撞占位；方形图片、内置收起按钮、缩放过渡和点击居中保持。

当前验证：193/193 静态、129/129 mock 通过。仅前端更新，无需部署云函数或清空缓存。此前的下方名称牌方案已被本次 D 方案取代。

## 最新执行：名称移到标记下方、卡片方图与内置收起按钮

见 [MAP_CARD_ALIGNMENT_UPDATE.md](MAP_CARD_ALIGNMENT_UPDATE.md)。所选店名改为下方半透明圆角名称牌；照片为280rpx正方形，左栏字体与行高统一，收起按钮移到图片左侧的卡片内部底部。

当前验证：193/193 静态检查、128/128 mock 场景通过。仅前端更新，无需部署云函数；原生名称标签和排版真机验收待执行。

## 最新执行：地图重叠优化、平滑缩放与可收起卡片

见 [MAP_READABILITY_UPDATE.md](MAP_READABILITY_UPDATE.md)：近邻标记合并数量入口，放大自动分开；约200ms选中尺寸过渡；卡片可收起，图片增高至285rpx，总卡片高度仍为340rpx。

上轮验证：193/193 静态检查、125/125 mock 场景通过。仅客户端更新，无需再次部署云函数；原生地图真机验收仍待执行。

## 最新执行：用户指定「地标快印」标记已接入

地图使用记录照片＋S 字标＋叉勺组合；选中显示绿勾，常态不显示。支持无图／加载失败占位及临时图片清理。说明见 [LANDMARK_STAMP_UPDATE.md](LANDMARK_STAMP_UPDATE.md)，预览见 `design-references/landmark-stamp-preview.png`。

本批仅需重新编译前端，无云函数变更。上轮验证：192/192 静态、119/119 mock 通过；原生地图／Canvas 真机验收待执行。

## 最新执行：地图点击居中修复

见 [MAP_FOCUS_UPDATE.md](MAP_FOCUS_UPDATE.md)。点击单店不再触发全地图缩放；标记候选已由用户自制方案取代，见上节。上轮验证：191/191 静态、110/110 mock 通过，非真机验收。

## 最新执行：分享文案导入与回执确认修复

见 [SHARE_IMPORT_UPDATE.md](SHARE_IMPORT_UPDATE.md)：含联网竞品／官方文档调研、已实施功能和限制。

Add 已支持点评堂食／美团外卖分享文案候选确认；其他外卖平台提供通用文案＋手填入口。平台参考评分、价格不作为实际用餐数据。**需部署配套 mealRecords 与前端；并非网页抓取或 Wishlist 已完成。**

## 最新执行：S0 第一批同步加固

见 [S0_EXECUTION_REPORT.md](S0_EXECUTION_REPORT.md)。补测复现并修复丢响应与跨设备编辑交错时的错误版本推进；加入服务端操作版本回执。**需重新部署 mealRecords 和配套前端。**

S0 的真机/线上验收及点评/美团链接验证仍待执行；S1 身份与缓存仅完成契约准备，未开放跨账号共享。

## 上轮更新：业务审计 1–5 已实施

见 [BUSINESS_1_TO_5_UPDATE.md](BUSINESS_1_TO_5_UPDATE.md)：本地日期、选点元数据、真实统计、人均/菜系/菜品/九图，以及云端编辑/删除/状态同步。

**本轮必须重新部署 `cloudfunctions/mealRecords`，再编译前端。Me → 同步状态可查看离线队列和冲突。**

## 上轮更新：Nocturne 暗色重设计

见 [NOCTURNE_DESIGN_UPDATE.md](NOCTURNE_DESIGN_UPDATE.md) 和 [可对比配色预览](../design/NOCTURNE_PREVIEW.html)。检索 Linear / Geist 等设计参考后，重做炭黑表面层次、柔和文字与克制香槟强调；上一版滚动修复保留。

## 上轮更新：二级菜单滚动与常规黑色模式

见 [SHEET_BLACK_THEME_UPDATE.md](SHEET_BLACK_THEME_UPDATE.md)。弹层避开底栏，按实际标题/面板高度计算滚动视口；暗色从墨绿改为中性黑灰。

## 上轮更新：Map 卡片微缩与页头个性化

见 [PERSONALIZATION_UPDATE.md](PERSONALIZATION_UPDATE.md)。仅略缩 Map 地点卡；Me → 个性化可集中编辑五页标题/副标题，支持逐页恢复默认和本机持久化。

## 上轮更新：中文排版、统一卡片与紧凑 Me

见 [UI_CARD_TYPOGRAPHY_UPDATE.md](UI_CARD_TYPOGRAPHY_UPDATE.md)。中文标题使用无衬线回退；四页主要卡片共用材质；Countries 改为真实收藏回忆；Me 卡片缩短。

## 上轮更新：地图玻璃卡、气泡、双语与暗色模式

见 [UI_LANGUAGE_THEME_UPDATE.md](UI_LANGUAGE_THEME_UPDATE.md)。地图卡片更透明；待定位提示默认收成导航键下方的数字气泡。
我的 → 设置可切换「跟随系统 / 简体中文 / English」，并使用改进后的暗色模式。用户餐食内容不翻译。

本轮授权的 1–5 已完成代码实施；情侣绑定、万能导入、Wishlist 等新阶段未启用。[原业务核查报告](BUSINESS_MIGRATION_AUDIT.md) 保留为历史快照，不代表当前缺口清单。

上轮验证：193/193 静态检查、125/125 mock 场景通过；未真机或线上 CloudBase 验证。部署本轮云函数后，再按实施说明进行设备验收。

上一轮的滚动、动态背景和腾讯地图选点说明保留在 [LOCATION_UI_UPDATE.md](LOCATION_UI_UPDATE.md)。

## Stage 2 CloudBase 迁移（best-ui 外观不变）

完整云工程推荐在微信开发者工具导入 **`savor-mp/`**，新增根配置仍指向原有
`miniprogram/`，未移动任何页面或资产。原 `savor-mp/miniprogram/` 导入入口和配置仍保留。

使用项目原有真实 AppID（不要用测试号连接生产云环境），环境保持
`cloud1-d9gqm52id66c0bcda`。右键 `cloudfunctions/mealRecords` →
**上传并部署：云端安装依赖** → 编译 → Add 新建 → Home 验证。

部署、安全规则、字段兼容与未验证项见 [STAGE2_SETUP.md](STAGE2_SETUP.md)。
逐文件说明和实测记录见 [MIGRATION_REPORT.md](MIGRATION_REPORT.md)。

## 静态验证

```bash
node tools/verify-miniprogram.cjs   # 主验证器：A–T 全量检查 + 包体积 + 子验证器
node tools/verify-tabbar.cjs        # Custom TabBar 专项（16 项）
node tools/verify-assets.cjs        # 资产 Manifest 专项
node tools/verify-cloud.cjs         # CloudBase / 页面契约 mock 测试
npm run verify:all                 # 上述全部执行
npm run build:locales              # 修改双语 TSV 后生成字典
```

任何一项失败都会 `process.exit(1)`。最终产物验证必须针对交付的 `miniprogram/` 目录重新执行。

## 结构

```
miniprogram/
  app.js / app.json / app.wxss     # 壳（navigationStyle: custom, tabBar.custom: true）
  custom-tab-bar/                  # ★ 零依赖 TabBar（无任何 require）
  components/
    icon/                          # s-icon：lucide 路径 → SVG data-URI
    sheet/                         # 全部 11 种底部面板（memory/library/profile/together/
                                   #   preferences/settings/privacy/weekly/journey/notifications/help）
    memory-row/  toast/
  pages/{home,map,add,us,me}/      # 五个 Tab 页
  utils/{data,store,photos,icons,metrics}.js
  images/                          # 全部本地资产（7 张样例图 + pin.png），随包交付
tools/                             # 验证体系（Node 零依赖）
```

## 历史致命错误的修复方式

| 历史问题 | 本次方案 |
| --- | --- |
| `custom-tab-bar` 第一行 `require('../../utils/store')` 越出根目录 → 组件崩溃 → 系统 tabBar 已关闭 + 自定义 tabBar 未渲染 = **完全没有导航栏** | TabBar **零 require**；`selected/dusk/quiet` 由各页 `onShow` 通过 `this.getTabBar().setData(...)` 推送 |
| `/images/*` 只在代码里出现、文件从未进包 | `tools/verify-assets.cjs` 扫描 JS/WXML/WXSS/JSON 的全部本地引用，缺失即构建失败；7 张样例图 + `pin.png` 实际打包（共约 440KB） |
| 校验只查“文件存在”，不查 require 可解析 | `tools/lib/checks.cjs` 实现 CommonJS resolver：扫描全部 `*.js` 的每一条相对 require 按当前文件目录真实解析，越界/缺失直接失败 |
| 测试过的目录和交付的目录脱节 | 主验证器对**最终** `miniprogram/` 目录运行全部检查（含子验证器同目录重跑） |

## 已知平台限制

- 微信 `<map>` 使用腾讯地图瓦片（GCJ-02），与 Web 的 CARTO 灰度瓦片风格有差异；照片圆形 pin 以 `pin.png` marker + 选中 callout 近似还原。
- Web 的 framer-motion 转场改为轻量 CSS 动画；`reduceMotion`（Quiet motion）设置会关闭动画。
- 字体：Web 使用 DM Sans / Lora（族名别名 SavorSerif，概念图圆润衬线）；小程序端使用系统字体栈（衬线标题用 Georgia/宋体系）。
- Export 备份优先走 `wx.shareFileMessage`，不可用时回退为复制 JSON 到剪贴板；Import 通过 `wx.chooseMessageFile` 从聊天选择 JSON。
- **NOT VERIFIED IN WECHAT DEVTOOLS** — 本环境没有微信开发者工具/CLI，未做真机验证；迁移前静态验证 183/183，迁移后 184/184，另有 32/32 云契约 mock 场景通过；不代表真实云端验收。
