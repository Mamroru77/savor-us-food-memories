# 2026-09-16 预览二维码恢复（最新）

预览已实际生成成功，正常模式；完整代码包 1693990 字节。二维码：reports/preview-fix-20260916/preview-normal.jpg。手机扫码和实际保存仍需用户本人确认。

日志确认最近一次打包/上传已完成（7774ms），随后本地 appservice 500 / initWithProxyFunc 超时，另有 WXML 热更新找不到模块。已备份 project.private.config.json，将覆盖配置中的 compileHotReLoad 从 true 改为 false，再通过官方工具正常关闭/打开目标项目；随后 create_preview_qrcode 返回 success=true 和 JPEG 二维码数据。未清缓存、未删除记录或草稿、未修改云权限。组合恢复有效，不声称独立证明只有热更新一个根因。

此前“预览超时/尚不可用”状态已被本结果取代。
