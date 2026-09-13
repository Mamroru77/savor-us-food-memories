# 图标启动请求被重复发布覆盖：定点修正

日期：2026-09-13；基线：e7d7425。

**状态：代码反例与回归通过，真机复测待执行。** 用户确认本次异常主要是页面可以切换，但图标不动或停在错误状态。

## 证据与缺陷

用户的新日志包含成功的switch-success、prepareMs=0，以及同一次访问连续的publish revision和稍后到达的static-loaded。不能仅因快速切换日志中缺少complete就认定动画失败，因为480ms内再次切换本来也会中断形变。

因此另对当前代码构造了可控顺序：

1. 收到active:true的第一份图标命令，等待静态图像load，`_commandNeedsMove=true`。
2. 图像尚未加载，收到相同name/fromName/key/color/quiet/active、但revision更新的第二份命令。
3. 原代码执行`_commandNeedsMove=!sameVisual`，把未执行的启动请求覆盖为false。
4. 图像随后加载成功，命令提交完成，但没有建立SVG形变。

旧版e7d7425在该模型下确实出现“static-loaded成功、渲染器ready、但没有动画”的结果。这是可复现的源码缺陷；模型不等于微信实际绘制证明，也不保证解释历史上的所有回跳。

## 修正

- 相同视觉状态的重复发布保留尚未执行的启动请求。
- 只有命令已提交、组件存活、当前访问允许激活、渲染器可用时，才消费请求并调用move。
- 静态图像先加载、渲染器后ready，或者反过来的顺序，都进入同一个启动方法。
- 请求在真正调用渲染器时清除。因此后续相同发布不会重启运行中或已完成的形变。
- 在首个形变图像加载及视图提交确认后，补充mode:start诊断，后续仍有mode:complete。

## 范围

**生产文件只改`miniprogram/components/morph-icon/index.js`。**

未修改custom-tab-bar控制器、五个页面接入、i18n、WXML、图标素材、Map、业务/API或云函数。导航分离修正继续保留，不恢复owner或800ms导航等待。

五组官方端点、480ms预算、32ms逐步推进、反向、Quiet、图像错误保护均保留。

## 验证

- 229/229静态、21/21 Tab接入、233/233既有mock、44/44交接回归、42/42 UI。
- 新增9项：五组图标分别验证静态load前多次重复发布后只启动并完成一次；另覆盖ready晚到、子视图commit晚到、Quiet和卸载后回调。
- 同一反例对照：e7d7425的pending被清除、未启动；修正版pending保留至渲染器接手、成功启动后清除。
- 原有导航独立性和命令分发回归继续执行。
- 实际交付ZIP解压副本也执行完整验证。

这些验证不模拟微信原生图像合成，不代表真机已经验收。

## 真机复测

加载新包后，先在各Tab停留约1秒，观察完整的起点到终点；再快速往返Add→Us→Me→Add，检查中断和缓存回访。停留1秒只是为了区分“未启动”和“被下一次操作中断”，不是导航使用限制。

如仍异常，继续用同一诊断入口：

```js
JSON.stringify(getCurrentPages().slice(-1)[0].getTabBar().getTransitionDebug())
```

重点对照同一key的publish、static-loaded、start、complete。如果再次出现static-fallback，则保留reason另行判断；本次没有关闭或擅自重写错误降级策略。
