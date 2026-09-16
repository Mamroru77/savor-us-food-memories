# Tab pre-ready static watchdog fix

Baseline: 1a88b24. Evidence: user vbug3.mp4 and nav-independent-v1 full trace.

## Confirmed evidence
- bar3, bar4, bar5 each report five svg-static-timeout events before the next destination tap, then later report geometric start and completion.
- Video at 4.766s shows Map/Add target endpoints, followed at 4.782s by origins and later the actual morph.
- Existing component reproduced fallbackOnly=true choosing target while a late setup starts a fromName-origin motion. This is a code-state reproduction, not a native compositor simulation.
- Current trace measures 769–861ms despite a 480ms frame budget. This separate scheduler issue is NOT fixed here.

## Change
Only production file: miniprogram/components/morph-icon/index.js.
- Arm the static-image watchdog only after SVG setup, when lifecycle readiness permits expecting image callbacks. No polling, hidden artwork, or extra navigation wait.
- Start the same bounded 1200ms watchdog at setup if a command is still pending.
- Genuine image failure/ready-time timeout remains terminal for that instance. A late/repeated setup cannot revive an origin animation after target fallback was shown.
- Keep pending-start consumption and same-visual revision handling.
- No navigation ownership gate, no controller/WXML/CSS changes, no Map/business/API edits. Five endpoint pairs and 480ms frame budget unchanged; Map320ms unchanged.

## Validation
13 new handoff tests: 10 directional pre-ready cases, explicit error before ready, genuine timeout followed by repeated setup, and detached pre-ready callback safety.
Source: 229 static / 21 Tab / 233 mock / 57 handoff / 44 UI pass.
Old component substituted into new tests fails as expected.
Release process also runs verify:all on the actual extracted archive before replacing savor-latest.zip.

## Native acceptance pending
Repeat Home -> Map -> Add -> Us -> Me, pausing ~2s each; also cached reverse Me -> Us -> Add -> Map -> Home. Check no target-origin-target flash, responsive navigation, continuous bidirectional morph and Quiet.
This patch addresses the reproduced pre-ready timeout/recovery conflict. It does not claim all old-state publication/cached compositor issues are resolved. Native visual acceptance and actual-duration issue remain open.
