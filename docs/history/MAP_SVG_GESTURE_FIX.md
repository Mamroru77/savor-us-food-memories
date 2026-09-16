# SVG arrow and map gesture fallback correction

## Confirmed template defect
The projected overlay was inserted between `<map wx:if="{{!mapError}}">` and the old `<view wx:else class="map-fallback">`. WXML consequently paired the fallback with the overlay condition, not mapError. Gesture begin sets stackPositionsReady=false; this incorrectly showed the fallback while mapError remained false. This is not evidence of a network failure.

The fallback now explicitly uses `wx:if="{{mapError}}"`. Real map errors and retry remain intact. Gesture overlay hiding/reprojection remains unchanged.

## Arrow
Packaged `images/markers/stack-chevron.svg`: round-capped symmetric path, no font glyph or network asset. The 32px circular button centers a 23px SVG, rotating 180 degrees for collapse; Quiet skips rotation transition. Existing upward stack and card height animations remain.

## Validation
197 static checks, 21 TabBar checks, asset verification and 179 mock scenarios pass. Added explicit fallback binding + gesture/error/retry regression and SVG geometry/rotation checks. These do not constitute native WeChat visual/touch acceptance.

Manual acceptance: drag map without false error screen; stop and verify reprojected stamps; inspect centered up/down chevrons; verify real map error fallback still displays; card motion unchanged. No backend deployment or cache clearing required.
