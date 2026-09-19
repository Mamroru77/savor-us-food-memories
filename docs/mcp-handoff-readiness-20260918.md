# MCP 接手核对（2026-09-18）

本轮依据用户提供的 SAVOR-HANDOFF-20260917-R2.md；未沿用旧聊天的Tab实验。

## 已确认
- 新隧道已完成initialize、initialized及tools/list，服务shuncode-bridge0.7.5，16个工具。
- 工作区已确认是目标仓库；分支integrated-with-cloud，HEAD 2b162558deca71e68021d89e2a4005b359bb540c。
- 新增本文件之前工作树15个M、8个未跟踪项，与R2一致。VID_1.mp4未动。
- miniprogram/pages/map/index.js SHA256：9b72853e3287dfb50a83720f0104afc7855851663813d377c096a175fb8b1fc8。
- miniprogram/pages/reports/index.js SHA256：4a0d0530d14d6cb15b630a080c81c60cadf36b8cad80b2b3e62bc19da7c78e6d。
- docs/reviews/ux-remediation-20260917.md工具读取为85行，D3 KEEP与F5 PARTIAL段落存在。R2称86行，未据此修改原文。

## 尚未完成 / 不能声称成功
- 上一轮verify:all被中断，未取得有效退出码；reports/ux-remediation-20260917/接手-baseline-20260918.log停留在handoff测试中途。基线仍待重新跑完。
- 当前仓库未找到uploads/SAVOR_HANDOFF-20260917.md、SAVOR-SESSION-20260917-d1.md、wx.py、wxeval.py、rcf.py。不能声称已读完整原始任务书或已打通微信自动化。
- MCP的16个直接工具是文件、补丁、LSP、诊断、命令和任务管理；微信模拟器点击/截图需另行恢复CLI桥接入口。

## 使用规则
- 编辑前read_files，使用expected_versions防并发覆盖；独立读取可并行，同一文件写入串行。诊断与测试保留原断言。
- run_command cwd使用工作区相对路径；命令中定位其他授权路径需显式cd。远端路径已实查，不操作其他工作目录。
- 不commit/push/merge/部署/改正式云环境、ACL、OPENID；不真实保存、上传、邀请、绑定、删除、导入导出或造生产数据。
- 保护savor-diary-v1、savor-draft-v1、Add草稿111与VID_1.mp4。
- 永久不复用被真机否决的Tab/handoff/switchTab优化与新Morphicons方案。
- DevTools点击可证明DevTools真人路径，不等于手机验收；Page方法调用仅算诊断。

## 后续门槛
先取得verify:all完整结果、补齐原始任务书和自动化入口，再按R2推进D2（新专项契约先红）、D4、D5、E、F1及矩阵。F1已有setNavigationBarTitle桩，不重复错误根因假设。不改历史fixture求绿。

本轮仅连接、只读核对和写本接手记录；未修改业务代码、提交或操作真实业务数据。
