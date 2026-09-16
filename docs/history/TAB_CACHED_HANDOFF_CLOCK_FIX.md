# Cached Tab presentation + wall-clock SVG timing

Baseline:66af4c3. Native evidence: vbug5.mp4 and user bug1.txt (render-handoff-v1).

## Evidence
Us entry video at6.191s shows old cached target endpoints, at6.257s returns to new origins. bar4 key4->key9 command receipt records old utensils/users-round then new origins utensils-crossed/users. No fallback or child page show/hide events in retained diagnostics. This implicates cached presentation handoff; snapshots alone are not native compositor proof.
Me transition key10 took839ms;16 frames, encoder total1–2ms, setData callback total351–354ms/max171–172ms and max callback interval203ms. Encoder metrics exclude engine interpolation and callback metrics do not isolate GPU/decode/bridge costs.

## Ordered changes
1. After explicit page showSelection and matching current route, keep the shown bar active and park other registered bars at current selected endpoints. from==to,key0,activefalse preserves static artwork without background morphs. This prepares a later cached visit before its navigation begins. Precreated bars after confirmed show also inherit current static endpoints, not stale transition origins. No child pageLifetimes dependency and no ownership gate/wait/query in navigation. Cached setData errors are caught individually.
2. Parked icons do not arm static-load watchdogs, because background image callbacks may be suspended. Active genuine failures retain their bounded watchdog and fallback behavior.
3. SVG progression follows actual time from first-frame reveal callback. It retains one outstanding frame and schedules against32ms deadlines; overdue samples are skipped rather than replayed with accumulated callback latency. First-frame wait does not consume animation duration. Exact native480ms/60fps is NOT guaranteed; final commit/timer stalls can overrun.
4. Already parked bars skip redundant parking. When changing current selection, unchanged parked child commands are retained; normally only previous/new selected icons change. No frame cache or Canvas migration introduced.

## Preserved
Native navigation attempts remain immediate and independent of view updates. No tap-source mutation before navigation. Five official pairs, genuine bidirectional morph, Quiet and error static fallback remain. Map320ms/photo stacks, CSS, WXML, business/cloud/API remain unchanged. Diagnostic export remains available with render-handoff-v1.

## Verification
Source verify:all:229 static /21 Tab /233 mock /73 handoff /44 UI PASS.
10 new handoff tests cover all-pair forward/reverse parking, cached Us reproduction, precreated state, cached errors, duplicate parking, static artwork/no animation, parked watchdog suppression, deterministic20ms/45ms frame callback latency and unchanged command reuse.
Two existing cloud timing expectations updated from intentionally stretched fixed-step playback to actual wall-clock acceptance; backpressure/first-image wait/stale callback tests retained.
Negative controls: baseline controller fails parking regression; old scheduler substituted alone fails deterministic duration bound. Full actual ZIP extraction verification required before delivery.

## Native acceptance pending
Use forward Home->Map->Add->Us->Me and cached reverse sequence (~2s per tap), then rapid interruptions and Quiet. Check no old-target/origin flash, responsive navigation and improved apparent duration. Export existing getTransitionDebug full JSON on failure.
Parking is asynchronous: very rapid navigation or native cached snapshots may still expose an old frame before background updates land. This patch does not block navigation or hide artwork to guarantee compositor readiness. Native retest remains necessary and no residual historical flicker is declared closed by mocks.
