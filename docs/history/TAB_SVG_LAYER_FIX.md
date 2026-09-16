> 后续更新：用户已确认 Pen / PenLine，正式端点现已替换。以下为显示层修复时的历史记录，详见 ADD_PEN_UPDATE.md。

# Tab duplicate/stray icon layer fix

User screenshot: a second row of Home/Add/Me glyphs appears in the middle of the Add form, while the actual bottom TabBar remains visible. User reports this on every Tab.

## Finding and boundary
The previous shared morph component kept a native 2D Canvas mounted and switched only its opacity after animation; its last bitmap was not erased. That is a plausible retained/composited-layer contributor, not a uniquely confirmed native root cause from a screenshot.

## Implemented
- All five production Tabs now pass `renderer="svg"` to the shared morph component.
- In SVG mode the WXML does not mount a Canvas and setup never queries/creates a native Canvas node. Animated SVG data URIs are shown by an ordinary image element, just like the existing static icon layer.
- The same Morphicons geometry, 64-point sampling, 380ms smoothstep, current-frame reversal, previous-Tab handoff and explicit cached-page replay remain.
- SVG updates are bounded at approximately 30fps (32ms scheduler) with at most one outstanding image update per icon per generation. No full TabBar state update on each frame.
- At completion / hide / error, frameSrc is cleared and the exact official endpoint SVG is shown. Quiet snaps without generating animation frames. Cancellation invalidates old frame acknowledgements.
- The isolated lab retains its Canvas adapter for diagnostics; its bitmap is now explicitly erased at rest, on hide and detach, rather than relying only on opacity.
- Native map art, map hit regions, photos, cloud/privacy/business behavior and five routes are unchanged.

## Add proposal is separate
Pen ↔ PenLine is an external preview, not yet approved for production. The fix package intentionally retains Plus ↔ SquarePlus so a new icon design is not silently shipped before confirmation.

## Validation
The complete original and extracted package suites must pass, including six new mock regression scenarios: SVG-only Tab path, finite/escaped frame encoding, cached replay, bounded pending frames and stale acknowledgements, Quiet/error/detach, native lab bitmap clearing.

Native visual acceptance/performance: NOT EXECUTED. Recompile in WeChat and check all five Tabs, scrolling and repeated Home→Map→Home→Add→Me switches. No cloud deployment is needed.
