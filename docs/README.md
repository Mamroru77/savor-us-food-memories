# 文档导航

[返回项目首页](../README.md)

## 先读这些

- [Release Closure 2026-09-24](reviews/release-closure-20260924.md) —— 当前状态索引：7 项真机问题、提交清单与验证矩阵
- [开发与验证指南](guides/development.md)
- [总进度](status/PROJECT_PROGRESS.md)
- [统一验收清单](status/UNIFIED_ACCEPTANCE.md)
- [视觉迭代记录](reviews/visual-language-20260916.md)

## 目录约定

- `status/`：当前状态与验收边界。
- `reviews/`：具体审计、修复和视觉迭代记录（含 4 篇长期 RCA）。
- `design/`：设计参考、HTML / SVG 预览。
- `history/`：历史方案、阶段记录、旧 README；不作为现行操作指南。
- `superpowers/`：Stage 6 / Stage 7 的改造计划（`plans/`）与设计规格（`specs/`）。
- 本目录根部的 `mcp-*.md`：2026-09-18 ~ 09-19 的 R2 / R4 / R5 / R7 阶段收口报告，属历史证据。
- 原远端交接包见 [archive](../archive/README.md)。

## 审计与修复记录

### 长期文档（RCA）

- [release-closure-20260924.md](reviews/release-closure-20260924.md) —— 收尾索引：7 项真机问题、提交清单、验证矩阵与真机取证
- [avatar-final-rca-and-fix.md](reviews/avatar-final-rca-and-fix.md) —— 头像链路四个独立缺陷、被证伪的假设与最终架构合同
- [identity-partition-migration.md](reviews/identity-partition-migration.md) —— 历史身份分区迁移矩阵、marker 存在性契约与数据保全
- [add-native-return-fix.md](reviews/add-native-return-fix.md) —— Add 照片 native-return 竞态、生命周期合同与为何不动 identity

### 阶段性记录

- [add-page-lifecycle-20260922.md](reviews/add-page-lifecycle-20260922.md)
- [avatar-diagnosis-20260920.md](reviews/avatar-diagnosis-20260920.md)
- [home-identity-state-20260922.md](reviews/home-identity-state-20260922.md)
- [lifecycle-review-20260916.md](reviews/lifecycle-review-20260916.md)
- [map-identity-state-20260922.md](reviews/map-identity-state-20260922.md)
- [map-motion-20260916.md](reviews/map-motion-20260916.md)
- [map-refinement-20260916.md](reviews/map-refinement-20260916.md)
- [map-save-fix-20260916.md](reviews/map-save-fix-20260916.md)
- [map-stack-video-20260916.md](reviews/map-stack-video-20260916.md)
- [mcp-account-complete-20260915.md](reviews/mcp-account-complete-20260915.md)
- [mcp-account-readonly-20260915.md](reviews/mcp-account-readonly-20260915.md)
- [mcp-account-root-evidence-20260915.md](reviews/mcp-account-root-evidence-20260915.md)
- [mcp-cloud-only-isolated-20260915.md](reviews/mcp-cloud-only-isolated-20260915.md)
- [mcp-unified-repair-20260915.md](reviews/mcp-unified-repair-20260915.md)
- [me-profile-state-20260922.md](reviews/me-profile-state-20260922.md)
- [official-review-20260916.md](reviews/official-review-20260916.md)
- [preview-fix-20260916.md](reviews/preview-fix-20260916.md)
- [sheet-recheck-20260916.md](reviews/sheet-recheck-20260916.md)
- [stages5-10-review-20260916.md](reviews/stages5-10-review-20260916.md)
- [tab-rollback-20260916.md](reviews/tab-rollback-20260916.md)
- [tab-smooth-20260916.md](reviews/tab-smooth-20260916.md)
- [ui-polish-20260916.md](reviews/ui-polish-20260916.md)
- [us-identity-state-20260922.md](reviews/us-identity-state-20260922.md)
- [ux-remediation-20260917.md](reviews/ux-remediation-20260917.md)
- [visual-language-20260916.md](reviews/visual-language-20260916.md)
- [visual-refinement-20260916.md](reviews/visual-refinement-20260916.md)

## 阶段报告（MCP / R2–R7）

- [mcp-arena-r2-native-path-four-viewport-closeout-20260918.md](mcp-arena-r2-native-path-four-viewport-closeout-20260918.md)
- [mcp-arena-r2-remaining-native-layout-closeout-20260919.md](mcp-arena-r2-remaining-native-layout-closeout-20260919.md)
- [mcp-arena-r4-local-refinement-review-20260919.md](mcp-arena-r4-local-refinement-review-20260919.md)
- [mcp-arena-r4-plan-and-baseline-20260919.md](mcp-arena-r4-plan-and-baseline-20260919.md)
- [mcp-baseline-guard-review-20260918.md](mcp-baseline-guard-review-20260918.md)
- [mcp-handoff-readiness-20260918.md](mcp-handoff-readiness-20260918.md)
- [mcp-r2-blocker-recheck-20260918.md](mcp-r2-blocker-recheck-20260918.md)
- [mcp-r2-change-review-20260918.md](mcp-r2-change-review-20260918.md)
- [mcp-r2-continuation-20260918.md](mcp-r2-continuation-20260918.md)
- [mcp-r2-execution-20260918.md](mcp-r2-execution-20260918.md)
- [mcp-r2-final-report-20260918.md](mcp-r2-final-report-20260918.md)
- [mcp-r2-four-native-viewports-20260918.md](mcp-r2-four-native-viewports-20260918.md)
- [mcp-r2-native-preview-source-repair-20260919.md](mcp-r2-native-preview-source-repair-20260919.md)
- [mcp-r2-remaining-layout-review-20260919.md](mcp-r2-remaining-layout-review-20260919.md)
- [mcp-r2-scale-echo-and-visual-audit-20260919.md](mcp-r2-scale-echo-and-visual-audit-20260919.md)
- [mcp-r2-three-viewport-matrix-20260918.md](mcp-r2-three-viewport-matrix-20260918.md)
- [mcp-r5-byte-review-20260919.md](mcp-r5-byte-review-20260919.md)
- [mcp-r5-requirement-reconciliation-20260919.md](mcp-r5-requirement-reconciliation-20260919.md)
- [mcp-r7-final-closeout-20260919.md](mcp-r7-final-closeout-20260919.md)

## 历史资料索引

- [ACCOUNT_SERVER_DIAGNOSIS_PLAN.md](history/ACCOUNT_SERVER_DIAGNOSIS_PLAN.md)
- [ADD_PEN_UPDATE.md](history/ADD_PEN_UPDATE.md)
- [ADD_UTENSILS_UPDATE.md](history/ADD_UTENSILS_UPDATE.md)
- [APPROVED_TAB_STATE_PAIRS.md](history/APPROVED_TAB_STATE_PAIRS.md)
- [AUDIT_REPAIRS.md](history/AUDIT_REPAIRS.md)
- [BUSINESS_1_TO_5_UPDATE.md](history/BUSINESS_1_TO_5_UPDATE.md)
- [BUSINESS_MIGRATION_AUDIT.md](history/BUSINESS_MIGRATION_AUDIT.md)
- [CANDIDATE_BUNDLE_README.md](history/CANDIDATE_BUNDLE_README.md)
- [CODEX_S1_TEST_PROMPT.md](history/CODEX_S1_TEST_PROMPT.md)
- [DEVELOPMENT_STATUS.md](history/DEVELOPMENT_STATUS.md)
- [FREE_FIRST_UPDATE.md](history/FREE_FIRST_UPDATE.md)
- [ICONS_UNIFIED.md](history/ICONS_UNIFIED.md)
- [IDENTITY_BLOCKER_DIAGNOSIS.md](history/IDENTITY_BLOCKER_DIAGNOSIS.md)
- [IDENTITY_BLOCKER_DIAGNOSIS_R2.md](history/IDENTITY_BLOCKER_DIAGNOSIS_R2.md)
- [IMPORT_ENRICHMENT_UPDATE.md](history/IMPORT_ENRICHMENT_UPDATE.md)
- [IMPORT_SWITCH_DRAFT_UPDATE.md](history/IMPORT_SWITCH_DRAFT_UPDATE.md)
- [LANDMARK_STAMP_UPDATE.md](history/LANDMARK_STAMP_UPDATE.md)
- [LOCATION_UI_UPDATE.md](history/LOCATION_UI_UPDATE.md)
- [LUCIDE_MOTION_UPDATE.md](history/LUCIDE_MOTION_UPDATE.md)
- [MAP_CALLOUT_COMPAT_UPDATE.md](history/MAP_CALLOUT_COMPAT_UPDATE.md)
- [MAP_CARD_ALIGNMENT_UPDATE.md](history/MAP_CARD_ALIGNMENT_UPDATE.md)
- [MAP_FOCUS_UPDATE.md](history/MAP_FOCUS_UPDATE.md)
- [MAP_GESTURE_FOLLOW.md](history/MAP_GESTURE_FOLLOW.md)
- [MAP_HYBRID_STACK.md](history/MAP_HYBRID_STACK.md)
- [MAP_MOTION_TIMING.md](history/MAP_MOTION_TIMING.md)
- [MAP_READABILITY_UPDATE.md](history/MAP_READABILITY_UPDATE.md)
- [MAP_REFERENCE_STACK_UPDATE.md](history/MAP_REFERENCE_STACK_UPDATE.md)
- [MAP_STACK_CARD_ALIGNMENT.md](history/MAP_STACK_CARD_ALIGNMENT.md)
- [MAP_STACK_MOTION_UPDATE.md](history/MAP_STACK_MOTION_UPDATE.md)
- [MAP_STACK_REBUILD.md](history/MAP_STACK_REBUILD.md)
- [MAP_SVG_GESTURE_FIX.md](history/MAP_SVG_GESTURE_FIX.md)
- [MAP_TAP_FIX_UPDATE.md](history/MAP_TAP_FIX_UPDATE.md)
- [MAP_UPWARD_DRAWER_UPDATE.md](history/MAP_UPWARD_DRAWER_UPDATE.md)
- [MERCHANT_PAGE_CORRECTION.md](history/MERCHANT_PAGE_CORRECTION.md)
- [MIGRATION_REPORT.md](history/MIGRATION_REPORT.md)
- [NOCTURNE_DESIGN_UPDATE.md](history/NOCTURNE_DESIGN_UPDATE.md)
- [PERSONALIZATION_UPDATE.md](history/PERSONALIZATION_UPDATE.md)
- [README-before-cleanup.md](history/README-before-cleanup.md)
- [S0_DEVICE_ACCEPTANCE.csv](history/S0_DEVICE_ACCEPTANCE.csv)
- [S0_EXECUTION_REPORT.md](history/S0_EXECUTION_REPORT.md)
- [S0_LINK_FINDINGS.md](history/S0_LINK_FINDINGS.md)
- [S0_LINK_SUPPORT_MATRIX.csv](history/S0_LINK_SUPPORT_MATRIX.csv)
- [S1_DEPLOYMENT_AND_ROLLBACK.md](history/S1_DEPLOYMENT_AND_ROLLBACK.md)
- [S1_DEVICE_ACCEPTANCE.csv](history/S1_DEVICE_ACCEPTANCE.csv)
- [S1_IDENTITY_CACHE_CONTRACT.md](history/S1_IDENTITY_CACHE_CONTRACT.md)
- [S1_IMPLEMENTATION_PROGRESS.md](history/S1_IMPLEMENTATION_PROGRESS.md)
- [S2_DEPLOYMENT_PENDING.md](history/S2_DEPLOYMENT_PENDING.md)
- [S2_IMPLEMENTATION_PROGRESS.md](history/S2_IMPLEMENTATION_PROGRESS.md)
- [S3_MEDIA_DEPLOYMENT_PENDING.md](history/S3_MEDIA_DEPLOYMENT_PENDING.md)
- [S3_MEDIA_IMPLEMENTATION.md](history/S3_MEDIA_IMPLEMENTATION.md)
- [S4_IMPLEMENTATION.md](history/S4_IMPLEMENTATION.md)
- [SHARE_IMPORT_UPDATE.md](history/SHARE_IMPORT_UPDATE.md)
- [SHEET_BLACK_THEME_UPDATE.md](history/SHEET_BLACK_THEME_UPDATE.md)
- [STAGE2_SETUP.md](history/STAGE2_SETUP.md)
- [STAGE6_ROADMAP.md](history/STAGE6_ROADMAP.md)
- [TAB_ATOMIC_HANDOFF_FIX.md](history/TAB_ATOMIC_HANDOFF_FIX.md)
- [TAB_CACHED_HANDOFF_CLOCK_FIX.md](history/TAB_CACHED_HANDOFF_CLOCK_FIX.md)
- [TAB_CACHED_PEER_PRIME_EXPERIMENT.md](history/TAB_CACHED_PEER_PRIME_EXPERIMENT.md)
- [TAB_DESELECT_FLICKER_FIX.md](history/TAB_DESELECT_FLICKER_FIX.md)
- [TAB_ENTRY_PRESENTATION_FIX.md](history/TAB_ENTRY_PRESENTATION_FIX.md)
- [TAB_HIDE_SNAPSHOT_EXPERIMENT.md](history/TAB_HIDE_SNAPSHOT_EXPERIMENT.md)
- [TAB_LUCIDE_MORPH_VALIDATION.md](history/TAB_LUCIDE_MORPH_VALIDATION.md)
- [TAB_MOTION_TIMING_FIX.md](history/TAB_MOTION_TIMING_FIX.md)
- [TAB_NATIVE_GLYPH_EXPERIMENT.md](history/TAB_NATIVE_GLYPH_EXPERIMENT.md)
- [TAB_NATIVE_PNG_PROBE.md](history/TAB_NATIVE_PNG_PROBE.md)
- [TAB_NATIVE_TEXT_FRAME_PROBE.md](history/TAB_NATIVE_TEXT_FRAME_PROBE.md)
- [TAB_NAVIGATION_INDEPENDENCE_FIX.md](history/TAB_NAVIGATION_INDEPENDENCE_FIX.md)
- [TAB_PENDING_START_FIX.md](history/TAB_PENDING_START_FIX.md)
- [TAB_PRESS_GEOMETRY_FIX.md](history/TAB_PRESS_GEOMETRY_FIX.md)
- [TAB_READY_WATCHDOG_FIX.md](history/TAB_READY_WATCHDOG_FIX.md)
- [TAB_RENDER_DIAGNOSTICS.md](history/TAB_RENDER_DIAGNOSTICS.md)
- [TAB_REPLAY_FIX.md](history/TAB_REPLAY_FIX.md)
- [TAB_ROOT_PORTAL_EXPERIMENT.md](history/TAB_ROOT_PORTAL_EXPERIMENT.md)
- [TAB_SKYLINE_RENDERER_EXPERIMENT.md](history/TAB_SKYLINE_RENDERER_EXPERIMENT.md)
- [TAB_SOURCE_LEAVE_EXPERIMENT.md](history/TAB_SOURCE_LEAVE_EXPERIMENT.md)
- [TAB_SVG_LAYER_FIX.md](history/TAB_SVG_LAYER_FIX.md)
- [TAB_VISUAL_PROBE.md](history/TAB_VISUAL_PROBE.md)
- [UI_CARD_TYPOGRAPHY_UPDATE.md](history/UI_CARD_TYPOGRAPHY_UPDATE.md)
- [UI_LANGUAGE_THEME_UPDATE.md](history/UI_LANGUAGE_THEME_UPDATE.md)
- [UI_QUALITY_FIXES.md](history/UI_QUALITY_FIXES.md)

## 设计资料索引

- [NOCTURNE_PREVIEW.html](design/NOCTURNE_PREVIEW.html)
- [add-tab-preview.html](design/add-tab-preview.html)
- [add-utensils-preview.html](design/add-utensils-preview.html)
- [landmark-normal-fallback.svg](design/landmark-normal-fallback.svg)
- [landmark-normal-frame.svg](design/landmark-normal-frame.svg)
- [landmark-selected-fallback.svg](design/landmark-selected-fallback.svg)
- [landmark-selected-frame.svg](design/landmark-selected-frame.svg)
- [landmark-stamp-preview.png](design/landmark-stamp-preview.png)
- [landmark-stamp-preview.svg](design/landmark-stamp-preview.svg)
- [landmark-user-reference.png](design/landmark-user-reference.png)
- [lucide-icon-review.html](design/lucide-icon-review.html)
- [lucide-morph-preview.html](design/lucide-morph-preview.html)
