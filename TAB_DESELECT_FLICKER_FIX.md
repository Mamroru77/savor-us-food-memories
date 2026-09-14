# 五 Tab 退选闪烁 · 最小修复

日期：2026-09-13  
基线：516d98b  
用户现象：Home 等 Tab 从选中态退回非选中态时，原图案先闪一下，才继续退选。

## 已确认的代码问题

1. 属性 observer 已启动该次形变，页面 onShow 的 `replayTransition()` 随后再次调用图标 replay。
2. 旧 replay 无条件清空 `_entryKey`，同一次切换再次从 fromName 起步，取消当前运动并重新创建首帧 image generation。
3. selected 与 transitionFrom / entryKey 原先分批更新；缓存页面 show 也可能用尚未同步的新旧混合状态开始动画。
4. 静态 fallback 原先直接跟随目标 name，在首帧交接前可能提前显示目标端点。

在隔离环境调用**原版本实际组件**，模拟首帧加载/提交后再调用同 entry replay：generation 从 1 变为 2，motion 对象被替换。修复后保持 generation 1、同一 motion 对象不变。此为逻辑复现，不是微信像素录制。

## 修复内容

- 五页面 onShow 一次提交 selected、transitionFrom、entryKey、theme/Quiet。
- 同一个 entry 和同一组输入只启动一次；重复 observer/replay 不重新采样、不清零进度、不重新创建首帧图像。
- SVG 缓存页 show 不抢先使用旧属性开播，由父页面提交后的 replay/resume 唤醒。
- 过期/不存在的切换记录恢复静态图标，不重播旧动画。
- seed 根据当前原生页面路由校准，避免快速保存后程序跳转 Home 时，被尚未过期的 Add 点击记录覆盖。
- 静态 fallback 保持上一个已呈现端点，完成后切换精确目标；错误与 Quiet 仍直接回落正确目标。

## 明确保留

- 五组已批准官方端点，餐具 Add、130rpx 外圆、66rpx 图案、1.75 描边。
- 五 Tab **480ms**、固定 32ms authored step、首帧 load+commit 门控、1200ms 首帧超时及慢提交不跳帧策略。
- SVG-only 生产 Tab、缓存重播、真正连续形变、反向与 Quiet。
- Map/card **320ms**，图钉/叠放/原生地图架构。
- 上轮 P0/P1/P2 修复、云业务和 API。
- TabBar 无 require/store 依赖；仅使用组件自身状态与原生页面路由。

## 验证

完整套件：229/229 静态、21/21 Tab、217/217 mock、42/42 UI 回归；48 官方 SVG、28 别名、73 模板声明。

新增 11 项回归覆盖：
- 新实例原子交接；
- 五个端点各自退选时，observer + replay 不重启动画；
- 首帧提交延迟下不重建 image flight；
- 缓存页等待新 entry；
- 程序跳转不被其他路由的旧记录覆盖；
- 过期切换静态恢复；
- 静态端点保持、完成一次且完整 480ms 帧预算。

原有断言保留；仅将静态端点模板断言更新为新的 held-endpoint 表达式，未放宽端点/图标/时长检查。发布前还须对实际 ZIP 解压副本运行全套验证。

## 原生验收仍未执行

请优先检查：Home→Map→Add→Us→Me→Home；缓存页面反复切换；快速往返；首帧加载慢；后台超过 5 秒后恢复；Add 保存成功程序返回 Home；浅/暗主题及 Quiet。

**源码重复重播已修复，不能仅凭 mock 宣称所有设备上的可见闪烁已完全消失。无需部署云函数。**
