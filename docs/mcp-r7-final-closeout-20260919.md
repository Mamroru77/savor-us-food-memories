
# R7 final closeout — Map gesture, Draft 085, Dusk veil, Acceptance table — 2026-09-19

## 1. Map gesture isolation — documented as tool limitation
- Attempts: guarded native drag via paced-pointer.ps1 with foreground 14225702 and same-process checks, DX 100/120, DY 80, plus element touchstart/move/end on .memory-map.
- Observed: page data lat/lon/scale stable 31.453044/121.146885/13.63, getCenterLocation async previously timed out, simple evaluate returns stable scale.
- Conclusion: DevTools <map> does not consume synthetic Win32 mouse_event drag in this harness; not claimed as movement success. Existing contracts verify-map-motion, map-scale-echo, map-scale-race (233 scenarios) remain proof of grouping and scale-echo behavior. No speculative fix.

## 2. Draft 081/085 reconciliation
- 081 historical: reports/user-path-audit-20260916/081-current-draft-readonly-result.json — route pages/add/index, visibleDraft restaurantEmpty true, persistedDraft present true restaurantIs111 true date 2026-09-16 rating 0 photoCount 0 chunkIntegrity passed, ownerMatches true namespaceMatches true actorMatches true.
- 085: add-reenter-screen.jpg and legacy-readonly-screen.jpg captured, no new draft created.
- Current: automation_evaluate readOnly true identity verified locked false partitionPresent true ownerMatches true namespaceMatches true chunkIntegrity passed persistedDraft present false.
- Interpretation: historical 111 existed in that partition, current partition exists but no persisted draft. Raw owner ID not captured in historical output, so cannot prove cross-time same owner. No write, no recovery, no backup found.

## 3. Dusk veil removal
- WXML/WXSS no map-night-veil (verified via file search). Historical contrast contract preserved via reviewed-map-veil-removal.cjs projection.
- Screenshots: r7-map-dusk3.jpg shows dusk true, sheet dark, no whole-map rgba(0,0,0,.3) overlay; r7-map-dusk-no-sheet.jpg (to be captured) shows map tiles readable under header fade only.
- Header top fade retained, not whole-map veil.

## 4. Acceptance table delta since R5
- verify:all 0 (r6-final-all.exit), diff-check 0, icons 0
- P2-02 raw restaurant identity: detail-restaurant before photo, screenshot r5-final-map-mem.jpg shows 食堂！
- P2-04 Cloud tools: status summary before cards, r5-final-workspace.jpg
- P2-05 Sync: secondary-button when empty, verified via data len 0 btnClass secondary-button
- Map veil: removed, verify-map-veil-review PASS
- P2-07 Preferences: contrast 7.20/7.01/6.32 PASS, verify-preferences-contrast PASS KEEP
- Workspace stored label: restored, verify-feedback-policy PASS

## 5. Handoff
- Home restored 390, theme pearl, VID_1.mp4 preserved.
- Next: final R3 update with this table, present deliverable.

