# 2026-09-16 地图 / 保存修复（最新状态）

当前目标工程已切换为 normal；此前默认冻结的历史报告不再代表当前配置。原冻结代码已备份。账号身份边界、私有权限、原有记录与草稿保护保留；提醒关闭，反馈仅私有云工单。

## 修复
- Map 加入正在进行的身份验证后再同步，不再把身份未就绪/冻结当作网络错误，隐藏页面迟到错误不再弹 Toast。
- Add 保存失败保留草稿，只显示行内错误；评分标签区分当前评分与清除操作。
- Toast 设置有界宽度，减少不必要换行；未重做 Map/Tab 布局。

## 验证
- 新增 10/10 定向回归通过，verify:all exit 0，44358ms。
- 原生 WXML 与 WXSS 编译均成功。
- 实际运行模式 normal，身份 verified；实际云同步成功，11 条云记录，outbox=0。
- Map identityReady=true、demoMode=false；Add identityReady=true、businessFrozen=false、saveLock=false，无当前错误。
- 旧 savor-diary-v1 / savor-draft-v1 前后相同。没有提交用户草稿，没有新增合成业务记录，本轮没有重新部署云函数。
- 手机实际保存和重新进入后的确认仍待用户本人完成，不能用模拟器或隔离测试代替。

## 开发者工具连接
原生验证阻塞已解决：普通 Node 的授权启动目标不正确；改用官方 Electron 可执行文件，并使用项目列表返回的准确路径（盘符大写 E）。SDK 状态 tokenRequired=false，不需要用户再找授权弹窗。

预览二维码：仍在生成或尚不可用。

证据与备份：reports/map-save-fix-20260916/。
