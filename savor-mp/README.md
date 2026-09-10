# Savor — WeChat Mini Program

Savor（“Food memories. Shared forever.”）Web 端的**微信原生小程序**完整移植。
以 Web 基准分支 `gpt-6-astra-max-best-ui-claude-fable-5.1-max-transplant-ui` 的 `src/`
为唯一产品真值重建；未复用任何历史失败版本的整目录代码。

## 导入方式（唯一正确入口）

**直接在微信开发者工具中导入 `miniprogram/` 目录**：

> 微信开发者工具 → 项目 → 导入项目 → 目录选择 **`savor-mp/miniprogram`** → AppID 选“测试号”即可。

`project.config.json` 已放在 `miniprogram/` 内且 `miniprogramRoot: "./"`，
**无需**再复制图片、改 require 路径、创建 pin.png 或调整 app.json。

## 静态验证

```bash
node tools/verify-miniprogram.cjs   # 主验证器：A–T 全量检查 + 包体积 + 子验证器
node tools/verify-tabbar.cjs        # Custom TabBar 专项（16 项）
node tools/verify-assets.cjs        # 资产 Manifest 专项
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
- **NOT VERIFIED IN WECHAT DEVTOOLS** — 本环境没有微信开发者工具/CLI，未做真机验证；静态验证体系（132 项）全部通过。
