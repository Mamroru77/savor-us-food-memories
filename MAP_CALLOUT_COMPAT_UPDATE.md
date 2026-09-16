# 地图展开箭头可见性修复

> 本文的100ms逐项出现已经被 [MAP_STACK_MOTION_UPDATE.md](MAP_STACK_MOTION_UPDATE.md) 的双向数值帧过渡替代，cover组件契约继续保留。

2026-09-11。用户反馈上一版只有首个标记，没有箭头。截图无法单独区分“自定义气泡未渲染”与“当前只有一个餐厅分组”；检查发现上一版将 map customCallout 插槽改成普通 view/image，存在组件契约兼容风险。本次恢复 cover-view/cover-image，而不是要求清缓存或改坐标。

- 保留上方白色圆形箭头、无底色照片标记向上排列的参考图结构。
- 去掉 cover 组件不支持的 overflow:visible、transform 和 CSS animation。展开用 100ms 间隔逐项出现，最多 3 个子项；这是分步展开，不是逐帧平滑位移。Quiet 下立即显示。
- 收起、重新打开、翻页与页面退出防止旧定时器继续改界面。完整 markers 数组和数字尺寸修复、地图移动 API 兼容回退继续保留。
- 只有组内有两家及以上餐厅才有箭头；单个餐厅不显示空展开入口。相距较远或缩放后拆组时也不会显示。
- 万能导入继续暂停；本次仅客户端更新，不部署云函数、不清理日记和照片。

验证：195/195 静态、171/171 mock 通过，解压包复测通过。新增真实定时分步显示／退出取消及单个餐厅与 Quiet 分组场景。仍未执行微信开发者工具或真机原生气泡验收，因此本次不能宣称设备上已验证可见。

请用完整编译而非只热重载，检查两家以上同一分组的箭头。如果仍只有图标，可在小程序 Console 只读查看：

```js
const p = getCurrentPages().slice(-1)[0];
console.log(p.data.markers.map(m => ({id:m.id,count:m.groupCount,callout:m.customCallout})), p.data.mapDrawers.map(d => ({markerId:d.markerId,count:d.count,open:d.open})));
```

此检查不请求云端、不输出图片私密地址或食记正文，用来区分分组条件未满足与原生组件没有渲染。
